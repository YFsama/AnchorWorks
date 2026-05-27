import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSkill,
  listSkills,
  callSkill,
  loadMCPServers,
  saveMCPServers,
  type SkillTool,
  type MCPServerConfig,
} from '../mcp';

/**
 * mcp.ts holds two pieces of process-local state:
 *   1. an in-memory `skills` Map (no way to clear it, so we use unique names
 *      per test to avoid cross-test pollution)
 *   2. an MCP server array persisted to localStorage
 *
 * For (2) we wipe localStorage in beforeEach and reload via loadMCPServers.
 */

function makeSkill(name: string, handler?: SkillTool['handler']): SkillTool {
  return {
    name,
    description: `desc for ${name}`,
    input_schema: { type: 'object', properties: {} },
    handler: handler ?? ((input) => `got: ${JSON.stringify(input)}`),
  };
}

describe('mcp — skills registry', () => {
  it('listSkills returns an array', () => {
    expect(Array.isArray(listSkills())).toBe(true);
  });

  it('registerSkill + listSkills round-trips a fake skill', () => {
    const name = `test-skill-roundtrip-${Math.random()}`;
    registerSkill(makeSkill(name));
    const found = listSkills().find((s) => s.name === name);
    expect(found).toBeDefined();
    expect(found?.description).toBe(`desc for ${name}`);
  });

  it('registerSkill with the same name overwrites the previous entry', () => {
    const name = `test-skill-overwrite-${Math.random()}`;
    registerSkill(makeSkill(name, () => 'first'));
    registerSkill(makeSkill(name, () => 'second'));
    const matches = listSkills().filter((s) => s.name === name);
    expect(matches).toHaveLength(1);
    expect(matches[0].handler({})).toBe('second');
  });

  it('callSkill invokes the handler with the given input', async () => {
    const name = `test-skill-call-${Math.random()}`;
    let received: Record<string, unknown> | null = null;
    registerSkill({
      ...makeSkill(name),
      handler: (input) => {
        received = input;
        return 'ok';
      },
    });
    const out = await callSkill(name, { x: 1, y: 'two' });
    expect(out).toBe('ok');
    expect(received).toEqual({ x: 1, y: 'two' });
  });

  it('callSkill returns the handler result (sync handler)', async () => {
    const name = `test-skill-sync-${Math.random()}`;
    registerSkill(makeSkill(name, () => 'sync-result'));
    expect(await callSkill(name, {})).toBe('sync-result');
  });

  it('callSkill awaits async handlers', async () => {
    const name = `test-skill-async-${Math.random()}`;
    registerSkill(makeSkill(name, async () => 'async-result'));
    expect(await callSkill(name, {})).toBe('async-result');
  });

  it('callSkill throws on unknown name', () => {
    expect(() => callSkill('___definitely-not-registered___', {})).toThrow(/Unknown skill/);
  });
});

describe('mcp — server config storage', () => {
  beforeEach(() => {
    localStorage.removeItem('vector.mcp.servers');
    // Reload to reset the in-memory mirror.
    loadMCPServers();
  });

  it('loadMCPServers returns an array', () => {
    expect(Array.isArray(loadMCPServers())).toBe(true);
  });

  it('loadMCPServers returns an empty list when storage is empty', () => {
    // We just cleared storage in beforeEach, so:
    const servers = loadMCPServers();
    expect(servers).toEqual([]);
  });

  it('saveMCPServers persists round-trip via loadMCPServers', () => {
    const cfg: MCPServerConfig[] = [
      { name: 'local-tools', url: 'http://localhost:5050/mcp', transport: 'http' },
      { name: 'remote-sse', url: 'https://example.com/mcp', transport: 'sse' },
    ];
    saveMCPServers(cfg);

    // Verify via direct storage and via the loader.
    const raw = localStorage.getItem('vector.mcp.servers');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual(cfg);

    const reloaded = loadMCPServers();
    expect(reloaded).toEqual(cfg);
  });

  it('saveMCPServers([]) replaces a previous list with empty', () => {
    saveMCPServers([
      { name: 'a', url: 'http://a', transport: 'http' },
    ]);
    saveMCPServers([]);
    expect(loadMCPServers()).toEqual([]);
  });

  it('loadMCPServers tolerates a corrupt storage entry', () => {
    localStorage.setItem('vector.mcp.servers', '{not-json');
    expect(() => loadMCPServers()).not.toThrow();
    expect(Array.isArray(loadMCPServers())).toBe(true);
  });
});
