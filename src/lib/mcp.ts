/**
 * MCP (Model Context Protocol) & local "Skill" registry.
 *
 * Browsers can't open arbitrary STDIO subprocesses, so true MCP servers run
 * outside the page. Here we keep a registry of:
 *   - MCP endpoints (HTTP / SSE / Streamable-HTTP URLs the user has configured), and
 *   - Local skills (named JS handlers registered at runtime that the AI assistant
 *     can call as tools).
 *
 * Skills register a name + description + input schema + handler. The AI panel
 * forwards them to Claude as additional tools so the model can drive editor
 * functionality. New skills can be dropped in by calling registerSkill().
 *
 * MCP tools are discovered via `discoverMCPTools()` (probes each configured
 * server, caches the full tool definitions), exposed to Claude via
 * `listMCPTools()` under the namespaced name `mcp__<server>__<tool>`, and
 * dispatched via `callMCPTool()`.
 */

export interface SkillTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<string> | string;
}

export interface MCPServerConfig { name: string; url: string; transport: 'http' | 'sse'; }

/** A tool exposed by a remote MCP server, cached locally after discovery. */
export interface MCPTool {
  /** Original server-side tool name (used in tools/call). */
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Which configured server this came from. */
  serverName: string;
}

const skills = new Map<string, SkillTool>();
const mcpServers: MCPServerConfig[] = [];
// Keyed by namespaced tool name (`mcp__<server>__<tool>`) so collisions across
// servers can't happen. Each entry records the origin server so dispatch knows
// where to POST tools/call.
const mcpToolCache = new Map<string, MCPTool>();

export function registerSkill(tool: SkillTool) { skills.set(tool.name, tool); }
export function listSkills(): SkillTool[] { return [...skills.values()]; }
export function callSkill(name: string, input: Record<string, unknown>) {
  const s = skills.get(name);
  if (!s) throw new Error(`Unknown skill: ${name}`);
  return s.handler(input);
}

const MCP_STORAGE = 'vector.mcp.servers';
export function loadMCPServers(): MCPServerConfig[] {
  try {
    const raw = localStorage.getItem(MCP_STORAGE);
    if (raw) mcpServers.splice(0, mcpServers.length, ...JSON.parse(raw));
  } catch { /* ignore */ }
  return mcpServers;
}
export function saveMCPServers(s: MCPServerConfig[]) {
  mcpServers.splice(0, mcpServers.length, ...s);
  localStorage.setItem(MCP_STORAGE, JSON.stringify(s));
}

/** Slug a free-form server name into something safe for a Claude tool name
 *  (Anthropic only accepts [A-Za-z0-9_-]). */
function slugServer(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 32) || 'server';
}

/** Build the namespaced tool name Claude sees. */
export function mcpToolKey(serverName: string, toolName: string): string {
  return `mcp__${slugServer(serverName)}__${toolName}`;
}

/** Inverse: detect whether a tool name came from MCP. */
export function isMCPToolName(name: string): boolean {
  return name.startsWith('mcp__');
}

interface MCPToolDef { name: string; description?: string; inputSchema?: Record<string, unknown>; input_schema?: Record<string, unknown>; }
interface MCPListResponse { result?: { tools?: MCPToolDef[] }; error?: { code: number; message: string }; }

/**
 * Low-level JSON-RPC call to an MCP server. Handles both transports the spec
 * permits today:
 *  - "http"  — plain POST + JSON response (legacy / simple servers)
 *  - "sse"   — POST with `Accept: text/event-stream`; the server answers with
 *              an event-stream and the JSON-RPC reply arrives in a `data:`
 *              frame. We close the connection after the first `message` event.
 *
 * The newer "Streamable HTTP" transport (which combines both) is handled by
 * negotiating Accept: application/json, text/event-stream and content-sniffing
 * the response — the server picks whichever it can deliver.
 */
async function mcpRpc(cfg: MCPServerConfig, method: string, params?: Record<string, unknown>): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
  const acceptHeader = cfg.transport === 'sse'
    ? 'text/event-stream'
    : 'application/json, text/event-stream';

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': acceptHeader },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/event-stream')) {
    // Read the first `data:` frame that decodes as a JSON-RPC response.
    if (!res.body) throw new Error('SSE response had no body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    // 30s ceiling — guard against a hung server.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        // SSE frame: collect all `data:` lines into a single payload.
        let payload = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('data:')) payload += line.slice(5).trimStart();
        }
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          await reader.cancel().catch(() => {});
          return json;
        } catch { /* not yet complete — keep accumulating */ }
      }
    }
    await reader.cancel().catch(() => {});
    throw new Error('SSE response timed out before yielding a JSON-RPC reply');
  }

  return res.json();
}

/** Probe an MCP server for its tool list. Best-effort: returns just names so
 *  the AI panel's "Test" button can render a quick summary. */
export async function probeMCPServer(cfg: MCPServerConfig): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  try {
    const raw = (await mcpRpc(cfg, 'tools/list')) as MCPListResponse;
    if (raw.error) return { ok: false, tools: [], error: raw.error.message };
    return { ok: true, tools: (raw.result?.tools ?? []).map(t => t.name) };
  } catch (e) {
    return { ok: false, tools: [], error: (e as Error).message };
  }
}

/**
 * Discover and cache full tool definitions across every configured server.
 * Call this on app startup and whenever the user edits the server list.
 * Returns a summary so the UI can display "3 servers, 14 tools" etc.
 */
export async function discoverMCPTools(): Promise<{ servers: number; tools: number; failures: Array<{ server: string; error: string }> }> {
  mcpToolCache.clear();
  const failures: Array<{ server: string; error: string }> = [];
  let toolCount = 0;
  for (const cfg of mcpServers) {
    try {
      const raw = (await mcpRpc(cfg, 'tools/list')) as MCPListResponse;
      if (raw.error) { failures.push({ server: cfg.name, error: raw.error.message }); continue; }
      for (const t of raw.result?.tools ?? []) {
        if (!t.name) continue;
        const key = mcpToolKey(cfg.name, t.name);
        // MCP spec uses `inputSchema` (camelCase); some implementations emit
        // `input_schema`. Accept either; default to an empty schema if absent.
        const schema = t.inputSchema ?? t.input_schema ?? { type: 'object', properties: {} };
        mcpToolCache.set(key, {
          name: t.name,
          description: t.description ?? '',
          input_schema: schema,
          serverName: cfg.name,
        });
        toolCount++;
      }
    } catch (e) {
      failures.push({ server: cfg.name, error: (e as Error).message });
    }
  }
  return { servers: mcpServers.length, tools: toolCount, failures };
}

/** Tool definitions to pass to Claude — namespaced names with server name in
 *  the description so the model knows which server it's hitting. */
export function listMCPTools(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return [...mcpToolCache.entries()].map(([key, tool]) => ({
    name: key,
    description: tool.description
      ? `[${tool.serverName}] ${tool.description}`
      : `Tool from MCP server "${tool.serverName}".`,
    input_schema: tool.input_schema,
  }));
}

/** Inspect cached tools (for the AI panel). */
export function getCachedMCPTools(): MCPTool[] { return [...mcpToolCache.values()]; }

/**
 * Dispatch an `mcp__<server>__<tool>` call. The model passes the namespaced
 * name; we map back to the origin server and POST tools/call.
 */
export async function callMCPTool(namespacedName: string, input: Record<string, unknown>): Promise<string> {
  const tool = mcpToolCache.get(namespacedName);
  if (!tool) throw new Error(`Unknown MCP tool: ${namespacedName}`);
  const server = mcpServers.find(s => s.name === tool.serverName);
  if (!server) throw new Error(`MCP server "${tool.serverName}" is no longer configured`);

  const raw = (await mcpRpc(server, 'tools/call', { name: tool.name, arguments: input })) as {
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    error?: { code: number; message: string };
  };
  if (raw.error) throw new Error(raw.error.message);

  // MCP tool results are an array of content blocks (text/image/resource_link/etc.).
  // For now we concatenate text blocks and surface the rest as a small summary —
  // the AI panel renders the final string in the message bubble.
  const blocks = raw.result?.content ?? [];
  const textParts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') textParts.push(b.text);
    else textParts.push(`[${b.type} block]`);
  }
  const out = textParts.join('\n').trim();
  if (raw.result?.isError) throw new Error(out || 'MCP tool reported an error');
  return out || `${tool.name} ok`;
}
