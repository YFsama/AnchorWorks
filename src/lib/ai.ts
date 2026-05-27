/**
 * AI assistant integration. Calls Claude API directly from the client.
 * Supports vision: sends the current canvas snapshot as an image so the model
 * can see what the user is drawing and suggest concrete tweaks.
 *
 * Tools (function calls) let the model issue drawing commands back into the
 * editor — these are the lightweight equivalent of an "Anthropic Skill" or
 * MCP tool registered in this app.
 *
 * This module supports two transports:
 *  - chatWithClaude          (non-streaming, fallback)
 *  - chatWithClaudeStreaming (SSE streaming; emits text deltas in real time)
 *
 * Registered skills (see `src/lib/mcp.ts`) are appended to the tool list on
 * every request so the model can call them dynamically.
 */

import { exportPNG, exportSVG } from './io';
import { importSVGString } from './io';
import { getCanvas } from './canvasEngine';
import { useEditor } from '../store/editor';
import { listSkills, callSkill, listMCPTools, callMCPTool, isMCPToolName } from './mcp';
import { t } from './i18n';

export interface AIMessage { role: 'user' | 'assistant'; content: string; image?: string; error?: boolean; }

export interface AIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  enableVision: boolean;
  /** Use SSE streaming responses (default true). */
  streaming?: boolean;
}

const STORAGE_KEY = 'vector.ai.config';
export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AIConfig;
      // back-compat: default streaming to true if missing
      if (parsed.streaming === undefined) parsed.streaming = true;
      return parsed;
    }
  } catch { /* ignore */ }
  return { apiKey: '', model: 'claude-opus-4-7', baseUrl: 'https://api.anthropic.com/v1', enableVision: true, streaming: true };
}
export function saveAIConfig(c: AIConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

/** Hard-coded core tools — model can call these and we apply them to the canvas.
 *  Descriptions stay English: the model is the primary reader (tool-selection
 *  accuracy degrades on translated specs), and the AIPanel's MCP modal that
 *  surfaces them to humans is an inspect-the-internals view, not a UX surface. */
const TOOLS = [
  {
    name: 'replace_svg',
    description: 'Replace the entire canvas content with the supplied SVG string. Use this when the user asks for a completely new illustration.',
    input_schema: {
      type: 'object',
      properties: { svg: { type: 'string', description: 'A complete <svg>...</svg> document.' } },
      required: ['svg'],
    },
  },
  {
    name: 'add_svg',
    description: 'Add the supplied SVG fragment (as a new group) to the current canvas without removing existing content.',
    input_schema: {
      type: 'object',
      properties: { svg: { type: 'string' } },
      required: ['svg'],
    },
  },
];

const CORE_TOOL_NAMES = new Set(TOOLS.map(t => t.name));

export interface AICallResult { text: string; actions: string[]; errors: string[]; }

interface ToolUseBlock { type: 'tool_use'; id?: string; name: string; input: Record<string, unknown>; }
interface TextBlock { type: 'text'; text: string; }
type ContentBlock = ToolUseBlock | TextBlock;

const SYSTEM_PROMPT = `You are an expert vector-graphics design assistant embedded in a vector editor.
You can SEE the user's current canvas as an image and also have access to the underlying SVG markup.

You have two kinds of tools:
  1) SVG mutation tools ("replace_svg" / "add_svg") — prefer these for whole-scene generation.
  2) Skill tools (align/distribute/boolean/nudge/set_fill/apply_shadow/apply_gradient/resize_canvas/
     set_background/select_all/delete_selection/group_selection/ungroup_selection/duplicate_selection/
     zoom_fit/etc.) — prefer these for surgical edits that don't require regenerating geometry.

Guidance:
- When the user asks for alignment/distribution, ALWAYS call the alignment/distribution skills
  instead of regenerating SVG.
- When the user asks for a different color or palette, prefer set_fill / set_stroke /
  apply_gradient on the existing selection rather than regenerating.
- Keep colors aesthetically harmonious. Use the user's existing palette when reasonable.
- After any tool call, briefly explain (1-2 sentences) what you changed and any next-step suggestions.
- Use clean SVG: simple shapes, clear strokes/fills, viewBox matching the canvas size.`;

function buildToolList() {
  // Append all registered skills as additional tools. Skills already have
  // matching {name, description, input_schema}.
  const skillTools = listSkills().map(s => ({
    name: s.name,
    description: s.description,
    input_schema: s.input_schema,
  }));
  // Plus every cached MCP tool. They're namespaced as `mcp__<server>__<tool>`
  // so they can't collide with local skills. `discoverMCPTools()` populates the
  // cache; we read whatever's currently there (empty if discovery hasn't run).
  const mcpTools = listMCPTools();
  return [...TOOLS, ...skillTools, ...mcpTools];
}

function buildContent(userMessage: string, opts: { includeImage: boolean; includeSVG: boolean }, cfg: AIConfig): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  if (opts.includeImage && cfg.enableVision) {
    try {
      const dataUrl = exportPNG(1);
      const base64 = dataUrl.split(',')[1];
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } });
    } catch { /* ignore */ }
  }
  if (opts.includeSVG) {
    try {
      const svg = exportSVG();
      content.push({ type: 'text', text: `Current SVG markup:\n\`\`\`xml\n${svg.slice(0, 12000)}\n\`\`\`` });
    } catch { /* ignore */ }
  }
  content.push({ type: 'text', text: userMessage });
  return content;
}

function buildMessages(history: AIMessage[], userContent: Array<Record<string, unknown>>) {
  return [
    ...history
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userContent },
  ];
}

async function dispatchToolCalls(blocks: ContentBlock[]): Promise<{ actions: string[]; errors: string[] }> {
  const actions: string[] = [];
  const errors: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'tool_use') continue;
    try {
      const result = await applyToolCall(block.name, block.input ?? {});
      actions.push(result);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      errors.push(`${block.name}: ${msg}`);
    }
  }
  return { actions, errors };
}

export async function chatWithClaude(history: AIMessage[], userMessage: string, cfg: AIConfig, opts: { includeImage: boolean; includeSVG: boolean; }): Promise<AICallResult> {
  if (!cfg.apiKey) throw new Error(t('Please set your Anthropic API key in the AI panel.'));

  const content = buildContent(userMessage, opts, cfg);
  const messages = buildMessages(history, content);

  const res = await fetch(`${cfg.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: buildToolList(),
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json() as { content: ContentBlock[] };
  const blocks = data.content ?? [];
  let text = '';
  for (const block of blocks) {
    if (block.type === 'text' && block.text) text += block.text;
  }
  const { actions, errors } = await dispatchToolCalls(blocks);
  return {
    text: text.trim() || (actions.length ? '✅ Done.' : '(no response)'),
    actions,
    errors,
  };
}

/**
 * Streaming variant. Uses Anthropic SSE messages stream. `onDelta` is invoked
 * with each incremental text chunk so the UI can render in real time. Tool
 * calls are accumulated and dispatched after the stream completes (we need
 * the full input JSON before we can execute).
 */
export async function chatWithClaudeStreaming(
  history: AIMessage[],
  userMessage: string,
  cfg: AIConfig,
  opts: { includeImage: boolean; includeSVG: boolean },
  onDelta: (text: string) => void,
): Promise<AICallResult> {
  if (!cfg.apiKey) throw new Error(t('Please set your Anthropic API key in the AI panel.'));

  const content = buildContent(userMessage, opts, cfg);
  const messages = buildMessages(history, content);

  const res = await fetch(`${cfg.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: buildToolList(),
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const t = res.body ? await res.text() : '';
    throw new Error(`Claude API ${res.status}: ${t.slice(0, 200)}`);
  }

  // Per-content-block accumulators (Anthropic stream sends a content_block_start
  // with index, then deltas keyed by that index, then content_block_stop).
  type Block = { type: 'text' | 'tool_use'; text?: string; name?: string; id?: string; partialJson?: string };
  const blocks: Map<number, Block> = new Map();
  let aggregatedText = '';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // SSE frames are separated by blank lines. Each frame has `event:` and
  // `data:` lines. We only need `data:` payloads.
  const flushFrame = (frame: string) => {
    const lines = frame.split('\n');
    let dataLine = '';
    for (const line of lines) {
      if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }
    if (!dataLine || dataLine === '[DONE]') return;
    let event: { type: string; index?: number; content_block?: Block; delta?: { type: string; text?: string; partial_json?: string } };
    try {
      event = JSON.parse(dataLine);
    } catch {
      return;
    }
    const type = event.type;
    if (type === 'content_block_start' && event.index !== undefined && event.content_block) {
      const cb = event.content_block;
      blocks.set(event.index, {
        type: cb.type,
        text: cb.type === 'text' ? '' : undefined,
        name: cb.name,
        id: cb.id,
        partialJson: cb.type === 'tool_use' ? '' : undefined,
      });
    } else if (type === 'content_block_delta' && event.index !== undefined && event.delta) {
      const b = blocks.get(event.index);
      if (!b) return;
      if (event.delta.type === 'text_delta' && event.delta.text) {
        b.text = (b.text ?? '') + event.delta.text;
        aggregatedText += event.delta.text;
        onDelta(event.delta.text);
      } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json !== undefined) {
        b.partialJson = (b.partialJson ?? '') + event.delta.partial_json;
      }
    }
    // We ignore message_start / message_delta / message_stop / ping — they
    // carry usage info we don't need for UI updates.
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      flushFrame(frame);
    }
  }
  // Flush any tail
  if (buffer.trim()) flushFrame(buffer);

  // Materialize final content blocks (parse tool_use partialJson).
  const finalBlocks: ContentBlock[] = [];
  // Iterate in index order
  const sortedIndices = [...blocks.keys()].sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    const b = blocks.get(idx)!;
    if (b.type === 'text') {
      finalBlocks.push({ type: 'text', text: b.text ?? '' });
    } else if (b.type === 'tool_use' && b.name) {
      let input: Record<string, unknown> = {};
      const raw = b.partialJson ?? '';
      if (raw.trim()) {
        try { input = JSON.parse(raw); }
        catch (e) { throw new Error(`Failed to parse tool input for ${b.name}: ${(e as Error).message}`, { cause: e }); }
      }
      finalBlocks.push({ type: 'tool_use', id: b.id, name: b.name, input });
    }
  }

  const { actions, errors } = await dispatchToolCalls(finalBlocks);
  return {
    text: aggregatedText.trim() || (actions.length ? '✅ Done.' : '(no response)'),
    actions,
    errors,
  };
}

async function applyToolCall(name: string, input: Record<string, unknown>): Promise<string> {
  const canvas = getCanvas();
  if (!canvas) return `[skipped ${name}: no canvas]`;

  // Core SVG tools
  if (name === 'replace_svg') {
    const svg = input.svg as string | undefined;
    if (!svg) throw new Error('missing required field "svg"');
    canvas.clear();
    canvas.backgroundColor = useEditor.getState().doc.background;
    await importSVGString(svg);
    return 'replaced canvas with new SVG';
  }
  if (name === 'add_svg') {
    const svg = input.svg as string | undefined;
    if (!svg) throw new Error('missing required field "svg"');
    await importSVGString(svg);
    return 'added new SVG group';
  }

  // MCP-namespaced tool: route to the remote server.
  if (isMCPToolName(name)) {
    return await callMCPTool(name, input);
  }

  // Otherwise, look it up as a registered skill.
  try {
    const result = await callSkill(name, input);
    return typeof result === 'string' ? result : `${name} ok`;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // If skill exists but threw, re-throw with context. If skill doesn't
    // exist at all, it's an unknown-tool error.
    if (CORE_TOOL_NAMES.has(name)) throw e;
    throw new Error(msg, { cause: e });
  }
}
