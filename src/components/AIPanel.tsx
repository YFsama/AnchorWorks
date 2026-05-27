import { useEffect, useRef, useState } from 'react';
import { Send, Eye, Code2, Settings, Plug, Loader2, RefreshCw, Trash2, X, Zap } from 'lucide-react';
import {
  chatWithClaude,
  chatWithClaudeStreaming,
  loadAIConfig,
  saveAIConfig,
  type AIConfig,
  type AIMessage,
} from '../lib/ai';
import { listSkills, loadMCPServers, saveMCPServers, probeMCPServer, discoverMCPTools, getCachedMCPTools, type MCPServerConfig } from '../lib/mcp';
import { logger } from '../lib/debug';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

interface Props { onClose: () => void; }

interface PanelMessage extends AIMessage {
  /** Streaming bubble flag — used to identify the in-progress assistant message. */
  streaming?: boolean;
}

const QUICK_ACTIONS: Array<{ labelKey: string; prompt: string }> = [
  { labelKey: '✨ Critique design', prompt: 'Critique the current canvas design. Give 3 concrete, actionable improvements (visual hierarchy, balance, color, spacing). Be specific about which elements to change.' },
  { labelKey: '🎨 Better palette', prompt: 'Suggest a more harmonious color palette for the current canvas and apply it. Use set_fill / set_stroke on the existing shapes when possible rather than regenerating.' },
  { labelKey: '📐 Tidy alignment', prompt: 'Tidy up the alignment and spacing of the elements on this canvas. Use the align_objects and distribute_objects skills to perfectly align and evenly space everything. Do NOT regenerate any SVG.' },
  { labelKey: '🧩 Convert to icon set', prompt: 'Convert the current canvas into a small, cohesive icon set — flat, line-based, consistent stroke widths, a unified palette. Replace the canvas with the new icon set as an SVG grid.' },
];

export function AIPanel({ onClose }: Props) {
  const t = useT();
  const [cfg, setCfg] = useState<AIConfig>(() => loadAIConfig());
  const [showCfg, setShowCfg] = useState(!cfg.apiKey);
  const [history, setHistory] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [includeImage, setIncludeImage] = useState(true);
  const [includeSVG, setIncludeSVG] = useState(true);
  const [showMCP, setShowMCP] = useState(false);
  const [servers, setServers] = useState<MCPServerConfig[]>(() => loadMCPServers());
  // Per-row "Test" probe busy state. A Set rather than a single index so
  // multiple slow servers can be tested concurrently without one row
  // blocking another. Cleared when the probe resolves either way.
  const [testingIdx, setTestingIdx] = useState<ReadonlySet<number>>(new Set());
  const [skills, setSkills] = useState(() => listSkills());
  const [mcpTools, setMcpTools] = useState(() => getCachedMCPTools());
  const [discovering, setDiscovering] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Respect prefers-reduced-motion explicitly — Element.scrollTo's
    // `behavior: 'smooth'` flag isn't honored uniformly across engines
    // (Chromium yes, WebKit historically no), so consult the media query
    // and downgrade to instant scroll for motion-sensitive users.
    const reduce = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollRef.current?.scrollTo({ top: 1e9, behavior: reduce ? 'auto' : 'smooth' });
  }, [history, busy]);

  // Kick off an MCP discovery pass once on mount. Best-effort: per-server
  // failures are reported via toast but don't block other servers, and the
  // empty cache simply means no remote tools are exposed to Claude this session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loadMCPServers().length === 0) return;
      setDiscovering(true);
      try {
        const r = await discoverMCPTools();
        if (cancelled) return;
        setMcpTools(getCachedMCPTools());
        if (r.failures.length) {
          for (const f of r.failures) toast.warn(f.error, { title: `MCP ${f.server}` });
        }
        if (r.tools > 0) logger.info('mcp', `${r.tools} tools across ${r.servers - r.failures.length}/${r.servers} servers`);
      } finally {
        if (!cancelled) setDiscovering(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshMCP = async () => {
    setDiscovering(true);
    try {
      const r = await discoverMCPTools();
      setMcpTools(getCachedMCPTools());
      if (r.failures.length) {
        for (const f of r.failures) toast.warn(f.error, { title: `MCP ${f.server}` });
      } else if (r.tools > 0) {
        toast.success(`${r.tools} ${t('Tools')}`, { title: t('MCP discovery complete') });
      } else {
        toast.info(t('No tools discovered'), {});
      }
    } finally {
      setDiscovering(false);
    }
  };
  // Refresh skills when the MCP modal opens — new ones may have been registered.
  // Render-time prev-tracking avoids the setState-in-effect cascade pattern.
  const [prevShowMCP, setPrevShowMCP] = useState(showMCP);
  if (prevShowMCP !== showMCP) {
    setPrevShowMCP(showMCP);
    if (showMCP) setSkills(listSkills());
  }

  const sendMessage = async (rawMsg: string) => {
    const msg = rawMsg.trim();
    if (!msg || busy) return;
    setInput('');

    // Snapshot the history BEFORE we push the new user message — that's what
    // we hand to the API as prior context.
    const priorHistory = history;
    setHistory(h => [...h, { role: 'user', content: msg }]);
    setBusy(true);

    const useStreaming = cfg.streaming !== false;

    try {
      if (useStreaming) {
        // Insert an empty assistant bubble we'll mutate as deltas arrive.
        setHistory(h => [...h, { role: 'assistant', content: '', streaming: true }]);
        const onDelta = (chunk: string) => {
          setHistory(h => {
            const next = h.slice();
            // Find the last streaming assistant message and append.
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], content: next[i].content + chunk };
                break;
              }
            }
            return next;
          });
        };
        const res = await chatWithClaudeStreaming(priorHistory, msg, cfg, { includeImage, includeSVG }, onDelta);
        const acts = res.actions.length ? `\n\n_${t('Actions')}: ${res.actions.join('; ')}_` : '';
        const finalText = (res.text || '') + acts;
        setHistory(h => {
          const next = h.slice();
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant' && next[i].streaming) {
              next[i] = { role: 'assistant', content: finalText };
              break;
            }
          }
          // Surface per-tool errors as red bubbles
          for (const err of res.errors) next.push({ role: 'assistant', content: `❌ ${t('Tool failed')} — ${err}`, error: true });
          return next;
        });
        logger.info('ai', `Reply ok (stream), ${res.actions.length} action(s), ${res.errors.length} tool error(s)`);
      } else {
        const res = await chatWithClaude(priorHistory, msg, cfg, { includeImage, includeSVG });
        const acts = res.actions.length ? `\n\n_${t('Actions')}: ${res.actions.join('; ')}_` : '';
        setHistory(h => {
          const next = [...h, { role: 'assistant' as const, content: res.text + acts }];
          for (const err of res.errors) next.push({ role: 'assistant', content: `❌ ${t('Tool failed')} — ${err}`, error: true });
          return next;
        });
        logger.info('ai', `Reply ok, ${res.actions.length} action(s), ${res.errors.length} tool error(s)`);
      }
    } catch (e) {
      const m = (e as Error).message;
      // If we were streaming, drop the empty in-progress bubble (if it stayed empty).
      setHistory(h => {
        const next = h.filter(x => !(x.role === 'assistant' && x.streaming && !x.content));
        next.push({ role: 'assistant', content: `❌ ${m}`, error: true });
        return next;
      });
      logger.error('ai', m);
    } finally {
      setBusy(false);
      // Clear the streaming flag on any straggler bubble
      setHistory(h => h.map(x => x.streaming ? { ...x, streaming: false } : x));
    }
  };

  const send = () => sendMessage(input);
  const runQuick = (prompt: string) => { if (!busy) sendMessage(prompt); };

  const saveCfg = () => { saveAIConfig(cfg); setShowCfg(false); };
  const addServer = () => setServers(s => [...s, { name: 'New Server', url: 'http://localhost:8080', transport: 'http' }]);
  const updateServer = (i: number, p: Partial<MCPServerConfig>) => setServers(s => s.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const removeServer = (i: number) => setServers(s => s.filter((_, idx) => idx !== i));
  const saveServers = async () => {
    saveMCPServers(servers);
    setShowMCP(false);
    // Re-discover whenever the server list changes so the cache stays in sync
    // with what the user just configured.
    await refreshMCP();
  };

  return (
    <div className="w-[380px] shrink-0 bg-panel border-l border-border flex flex-col text-xs">
      <div className="h-11 border-b border-border px-3 flex items-center justify-between">
        <h2 className="dialog-title flex items-center gap-2">
          <span className="relative inline-flex" aria-hidden="true">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="absolute inset-0 w-2 h-2 rounded-full bg-accent animate-ping opacity-50" />
          </span>
          {t('AI Assistant')}
        </h2>
        <div className="flex items-center gap-1">
          <button title={t('MCP / Skills')} aria-label={t('MCP / Skills')} onClick={() => setShowMCP(true)} className="btn-dialog-close"><Plug size={14} aria-hidden="true" /></button>
          <button title={t('AI Configuration')} aria-label={t('AI Configuration')} onClick={() => setShowCfg(true)} className="btn-dialog-close"><Settings size={14} aria-hidden="true" /></button>
          <button onClick={onClose} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
      </div>

      {/* Quick action row */}
      <div className="border-b border-border px-2 py-2 flex flex-wrap gap-1">
        {QUICK_ACTIONS.map(q => (
          <button
            key={q.labelKey}
            disabled={busy}
            onClick={() => runQuick(q.prompt)}
            title={q.prompt}
            className="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors"
          >
            {t(q.labelKey)}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {history.length === 0 && (
          <div className="flex flex-col items-center text-center px-2 pt-6">
            {/* Chat bubble + spark — "AI conversation" without sparkle clichés. */}
            <svg width="64" height="56" viewBox="0 0 64 56" fill="none" className="mb-3 opacity-80" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
              <path
                d="M10.5 12.5 L 41.5 12.5 Q 45.5 12.5 45.5 16.5 L 45.5 32.5 Q 45.5 36.5 41.5 36.5 L 22 36.5 L 14 43 L 14 36.5 L 10.5 36.5 Q 6.5 36.5 6.5 32.5 L 6.5 16.5 Q 6.5 12.5 10.5 12.5 Z"
                stroke="currentColor" strokeOpacity="0.6" strokeWidth="1" fill="none"
              />
              <circle cx="17" cy="24.5" r="1.5" fill="currentColor" />
              <circle cx="26" cy="24.5" r="1.5" fill="currentColor" />
              <circle cx="35" cy="24.5" r="1.5" fill="currentColor" />
              {/* Spark element — a small four-point star nudged off-corner. */}
              <path
                d="M52 14 L 53 18 L 57 19 L 53 20 L 52 24 L 51 20 L 47 19 L 51 18 Z"
                fill="rgb(var(--color-accent))"
              />
              <circle cx="56" cy="10" r="1.3" fill="rgb(var(--color-accent2))" />
            </svg>
            <div className="type-title mb-1">{t('Design with Claude')}</div>
            <div className="type-caption leading-relaxed max-w-[260px] mb-4">
              {t('Ask Claude to design, refine, or critique your artwork.')}
            </div>
            <div className="w-full max-w-[280px] space-y-1.5">
              {[
                t('"Draw a minimalist mountain logo in two colors"'),
                t('"Make my shapes align in a row, equal spacing"'),
                t('"Suggest a better color palette and apply it"'),
              ].map((ex, i) => (
                <button
                  key={i}
                  onClick={() => runQuick(ex.replace(/^["“]|["”]$/g, ''))}
                  disabled={busy}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-sm bg-panel2 border border-border text-muted hover:text-ink hover:border-accent2/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-border"
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-muted/80">
              {t('Model')}: {cfg.model || t('unset')} · {t('Vision')}: {cfg.enableVision ? t('on') : t('off')} · {t('Streaming')}: {cfg.streaming === false ? t('off') : t('on')}
            </p>
          </div>
        )}
        {history.map((m, i) => {
          const isUser = m.role === 'user';
          const cls = m.error
            ? 'bg-danger/15 border border-danger/40 text-danger rounded p-2'
            : isUser
              ? 'text-ink'
              : 'text-ink/90 bg-panel2 rounded p-2 border border-border';
          return (
            <div key={i} className={cls}>
              <div className="field-label flex items-center gap-2">
                {m.role === 'user' ? t('You') : t('Assistant')}
                {m.streaming && <Loader2 size={10} className="animate-spin text-accent2" aria-hidden="true" />}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">
                {m.content}
                {m.streaming && !m.content && <span className="text-muted">…</span>}
                {m.streaming && m.content && <span className="inline-block w-1.5 h-3 bg-accent2 ml-0.5 animate-pulse align-middle" />}
              </div>
            </div>
          );
        })}
        {busy && !history.some(m => m.streaming) && (
          // role="status" + aria-live="polite" so screen readers announce
          // the in-flight signal exactly once when the chip appears. Without
          // this the SR user gets no cue that an AI request is happening —
          // streaming bubbles already announce themselves via their own
          // text deltas, but the non-streaming "thinking…" intermediate
          // wasn't reaching the live region anywhere.
          <div
            className="flex items-center gap-2 text-muted"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            {t('thinking…')}
          </div>
        )}
      </div>

      <div className="border-t border-border p-2 flex items-center gap-2 text-[10px]">
        <button onClick={() => setIncludeImage(v => !v)} aria-pressed={includeImage} className={`flex items-center gap-1 px-2 py-1 rounded border ${includeImage ? 'border-accent text-ink' : 'border-border text-muted'}`}><Eye size={11} aria-hidden="true" />{t('Vision')}</button>
        <button onClick={() => setIncludeSVG(v => !v)} aria-pressed={includeSVG} className={`flex items-center gap-1 px-2 py-1 rounded border ${includeSVG ? 'border-accent text-ink' : 'border-border text-muted'}`}><Code2 size={11} aria-hidden="true" />{t('SVG')}</button>
        {cfg.streaming !== false && (
          <span className="flex items-center gap-1 px-2 py-1 rounded border border-accent2/40 bg-accent2/10 text-ink"><Zap size={11} aria-hidden="true" />{t('Stream')}</span>
        )}
        <span className="ml-auto text-muted">{skills.length} {skills.length === 1 ? t('skill') : t('skills')}</span>
      </div>

      <div className="border-t border-border p-2 flex items-end gap-2">
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // `isComposing` is true while an IME (pinyin, kanji, Hangul) has
            // a candidate selection open. Enter during composition is meant
            // to commit the IME pick — NOT to submit the form. Without this
            // guard, a Chinese user typing 你好 + Enter sends "n" or "nh"
            // (whatever pinyin was buffered) instead of the intended phrase.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2} placeholder={t('Describe an edit or design…')}
          aria-label={t('Describe an edit or design…')}
          disabled={busy}
          className="flex-1 bg-panel2 border border-border rounded p-2 text-xs outline-none focus:border-accent2 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors" />
        <button onClick={send} disabled={busy || !input.trim()} className="btn-primary" title={t('Send message')} aria-label={t('Send message')} aria-busy={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
        </button>
      </div>

      {showCfg && (
        <Modal onClose={() => setShowCfg(false)} title={t('AI Configuration')}>
          <Field label={t('Anthropic API Key')}>
            {/* `autoComplete="off"` + `spellCheck={false}` so the browser /
             * password manager doesn't offer to "save this password" the
             * first time the user types their key — API keys aren't login
             * credentials, the saved-passwords UI would be misleading, and
             * cross-site autofill on a generic password field could leak the
             * key onto unrelated forms in extreme edge cases. */}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="input-num"
              value={cfg.apiKey}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              placeholder="sk-ant-…"
            />
          </Field>
          <Field label={t('Model')}>
            <select className="input-num" value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })}>
              <option value="claude-opus-4-7">Claude Opus 4.7 ({t('best')})</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 ({t('balanced')})</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 ({t('fast')})</option>
            </select>
          </Field>
          <Field label={t('Base URL')}>
            <input
              type="url"
              className="input-num"
              value={cfg.baseUrl}
              onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              aria-label={t('Base URL')}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-ink mb-1 cursor-pointer">
            <input type="checkbox" checked={cfg.enableVision} onChange={(e) => setCfg({ ...cfg, enableVision: e.target.checked })} />
            {t('Enable vision (send canvas snapshot to model)')}
          </label>
          <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
            <input type="checkbox" checked={cfg.streaming !== false} onChange={(e) => setCfg({ ...cfg, streaming: e.target.checked })} />
            {t('Stream responses (token-by-token output)')}
          </label>
          <div className="text-[10px] text-muted leading-relaxed mt-2">
            Your key is stored only in this browser (<code className="bg-panel2 px-1 rounded">localStorage</code>) and is sent direct to the
            Anthropic API. Requires <code className="bg-panel2 px-1 rounded">anthropic-dangerous-direct-browser-access</code> header (auto).
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" className="btn" onClick={() => setShowCfg(false)}>{t('Cancel')}</button>
            <button type="button" className="btn-primary" onClick={saveCfg}>{t('Save')}</button>
          </div>
        </Modal>
      )}

      {showMCP && (
        <Modal onClose={() => setShowMCP(false)} title={t('MCP Servers & Skills')}>
          <h3 className="field-label mb-2">{t('Local Skills (tools available to the model)')}</h3>
          <div className="border border-border rounded bg-panel2 max-h-40 overflow-y-auto mb-3">
            {skills.length === 0 && <div className="p-2 text-muted">{t('No skills registered. Use')} <code className="bg-panel3 px-1 rounded">registerSkill()</code> from <code className="bg-panel3 px-1 rounded">lib/mcp.ts</code>.</div>}
            {skills.map(s => (
              <div key={s.name} className="p-2 border-b border-border last:border-b-0">
                <div className="font-mono text-ink">{s.name}</div>
                <div className="type-caption">{s.description}</div>
              </div>
            ))}
          </div>
          {mcpTools.length > 0 && (
            <>
              <h3 className="field-label mb-2">{t('Remote MCP Tools (discovered)')}</h3>
              <div className="border border-border rounded bg-panel2 max-h-32 overflow-y-auto mb-3">
                {mcpTools.map(tool => (
                  <div key={`${tool.serverName}__${tool.name}`} className="p-2 border-b border-border last:border-b-0">
                    <div className="font-mono text-ink text-[11px]">
                      <span className="text-muted">[{tool.serverName}]</span> {tool.name}
                    </div>
                    {tool.description && <div className="type-caption mt-0.5">{tool.description}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center justify-between mb-2">
            <h3 className="field-label !mb-0">{t('MCP Servers')}</h3>
            <div className="flex items-center gap-1">
              <button
                className="btn inline-flex items-center gap-1.5"
                onClick={refreshMCP}
                disabled={discovering}
                title={t('Refresh tools')}
                aria-label={t('Refresh tools')}
                aria-busy={discovering}
              >
                {discovering
                  ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  : <RefreshCw size={12} aria-hidden="true" />}
                {/* Verb-tense change reinforces the activity beyond the spinner —
                 *  prefers-reduced-motion freezes the Loader2 animation, so the
                 *  text swap is the only visible "still in progress" cue. */}
                <span>{discovering ? t('Refreshing…') : t('Refresh')}</span>
              </button>
              <button className="btn" onClick={addServer}>{t('+ Add')}</button>
            </div>
          </div>
          {servers.map((srv, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                className="input-num flex-1"
                value={srv.name}
                onChange={(e) => updateServer(i, { name: e.target.value })}
                aria-label={t('Server name')}
                spellCheck={false}
                autoComplete="off"
              />
              <input
                type="url"
                className="input-num flex-[2]"
                value={srv.url}
                onChange={(e) => updateServer(i, { url: e.target.value })}
                aria-label={t('Server URL')}
                spellCheck={false}
                autoComplete="off"
              />
              <select className="input-num w-20" value={srv.transport} onChange={(e) => updateServer(i, { transport: e.target.value as 'http' | 'sse' })} aria-label={t('Transport')}>
                <option value="http">HTTP</option><option value="sse">SSE</option>
              </select>
              <button
                className="btn inline-flex items-center gap-1"
                disabled={testingIdx.has(i)}
                aria-busy={testingIdx.has(i)}
                onClick={async () => {
                  setTestingIdx(prev => { const next = new Set(prev); next.add(i); return next; });
                  try {
                    const r = await probeMCPServer(srv);
                    if (r.ok) {
                      const toolList = r.tools.length > 0 ? r.tools.join(', ') : t('(none)');
                      toast.success(`${t('Tools')}: ${toolList}`, { title: srv.name });
                    } else {
                      toast.error(r.error || t('Probe failed'), { title: srv.name });
                    }
                  } finally {
                    setTestingIdx(prev => { const next = new Set(prev); next.delete(i); return next; });
                  }
                }}
              >
                {testingIdx.has(i) && <Loader2 size={10} className="animate-spin" aria-hidden="true" />}
                {/* Verb-tense change reinforces in-progress state when the
                 *  spinner freezes under prefers-reduced-motion. */}
                {testingIdx.has(i) ? t('Testing…') : t('Test')}
              </button>
              <button
                className="p-1.5 rounded text-muted hover:text-danger hover:bg-panel2 transition-colors"
                onClick={() => removeServer(i)}
                aria-label={t('Remove server')}
                title={t('Remove server')}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" className="btn" onClick={() => setShowMCP(false)}>{t('Cancel')}</button>
            <button type="button" className="btn-primary" onClick={saveServers}>{t('Save')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  const t = useT();
  // Match the rest of the dialog system: Escape closes (capture phase so
  // input focus doesn't swallow it), backdrop click closes, ARIA role,
  // focus restored to the trigger button on close.
  useEscapeClose(true, onClose);
  useFocusRestore(true);

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-modal-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] max-w-[90%] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="ai-modal-title" className="dialog-title">{title}</h2>
          <button
            onClick={onClose}
            className="btn-dialog-close"
            aria-label={t('Close')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}
