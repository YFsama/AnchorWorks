/**
 * Smart SVG import — pre-processes real-world SVGs so Fabric's parser gets
 * the most colour / geometry intact, then post-processes the resulting
 * Fabric objects to fill gaps (extra gradient handling, viewBox-aware
 * placement) and surface warnings for things Fabric can't represent.
 *
 * This sits next to `io.ts`'s `importSVGString` / `importSVGFile` (kept for
 * backward compat). The improvements here:
 *
 *  • <style> blocks are walked and inlined onto every matching element so
 *    Fabric's per-element attribute reader can pick the colours up. Fabric
 *    only matches CSS rules where the selector literally equals the rule
 *    text — class compound selectors / descendant selectors / pseudo-classes
 *    are otherwise ignored.
 *  • `currentColor` references are resolved against the document `color`
 *    so they don't disappear into black-on-the-wrong-element.
 *  • Gradient / pattern defs are detected and we patch any object whose
 *    fill or stroke still references an url() after Fabric's pass (Fabric
 *    sometimes loses these on nested groups / class-based references).
 *  • viewBox is honoured: the assembled group is fit into 90% of the
 *    current canvas, preserving aspect ratio.
 *  • Unsupported features (filter / mask / use / foreignObject / @font-face)
 *    produce structured warnings the caller can show in the UI.
 *
 * Public surface kept tiny on purpose:
 *
 *    importSVGSmart(svg)          → { added, warnings }
 *    importSVGSmartFile(file)     → { added, warnings }
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

export interface SmartImportResult {
  added: number;
  warnings: string[];
}

/* --------------------------------------------------------------------- */
/* Pre-processing                                                        */
/* --------------------------------------------------------------------- */

interface PreprocessOut {
  svg: string;
  warnings: string[];
}

/**
 * DOM-walk the SVG, inline <style> rules onto matching elements, replace
 * `currentColor`, and collect warnings for features we can't preserve.
 */
function preprocessSVG(input: string): PreprocessOut {
  const warnings: string[] = [];

  // Parse as SVG. We use `image/svg+xml` so Element.matches works against
  // the SVG namespace; `text/xml` (what Fabric uses) lacks CSS selector
  // support in some browsers.
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'image/svg+xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    // Fall back to the original string and let Fabric try its luck.
    return { svg: input, warnings: ['SVG had XML parse errors; rendered best-effort.'] };
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    return { svg: input, warnings: ['Document root is not <svg>; rendered best-effort.'] };
  }

  /* ---------- 1. Inline <style> rules ---------- */

  const styleEls = Array.from(root.getElementsByTagName('style'));
  if (styleEls.length) {
    const declMap = new Map<string, Record<string, string>>(); // selector → decls
    for (const s of styleEls) {
      const text = (s.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
      // Detect things Fabric can't reproduce.
      if (/@font-face/i.test(text)) {
        warnings.push('Embedded @font-face declarations dropped (Fabric cannot embed custom fonts).');
      }
      if (/@import/i.test(text)) {
        warnings.push('CSS @import dropped (external stylesheet not fetched).');
      }
      // Parse top-level rules. We split on } and ignore at-rule blocks.
      const rules = text.split('}');
      for (const raw of rules) {
        const rule = raw.trim();
        if (!rule) continue;
        if (rule.startsWith('@')) continue; // skip @media/@supports/@font-face
        const braceIdx = rule.indexOf('{');
        if (braceIdx < 0) continue;
        const selectors = rule.slice(0, braceIdx).trim();
        const body = rule.slice(braceIdx + 1).trim();
        if (!selectors || !body) continue;
        const decls: Record<string, string> = {};
        for (const pair of body.split(';')) {
          const c = pair.indexOf(':');
          if (c < 0) continue;
          const k = pair.slice(0, c).trim();
          const v = pair.slice(c + 1).trim();
          if (k && v) decls[k] = v;
        }
        if (!Object.keys(decls).length) continue;
        // Each comma-separated selector gets the same decl bag.
        for (const sel of selectors.split(',').map(s => s.trim()).filter(Boolean)) {
          declMap.set(sel, { ...(declMap.get(sel) || {}), ...decls });
        }
      }
    }

    // Apply matched declarations to every element. Specificity is naive
    // (later rules override earlier ones) but matches Fabric's expectations.
    if (declMap.size) {
      const all = Array.from(root.getElementsByTagName('*'));
      for (const el of all) {
        const merged: Record<string, string> = {};
        for (const [sel, decls] of declMap) {
          let matches: boolean;
          try {
            matches = el.matches(sel);
          } catch {
            // Invalid selector for this element type — skip.
            matches = false;
          }
          if (matches) Object.assign(merged, decls);
        }
        if (!Object.keys(merged).length) continue;
        // Existing inline style takes precedence over the stylesheet, just
        // like CSS would (inline style has higher specificity than rules
        // without !important).
        const existing = el.getAttribute('style') || '';
        const existingParsed: Record<string, string> = {};
        for (const pair of existing.split(';')) {
          const c = pair.indexOf(':');
          if (c < 0) continue;
          const k = pair.slice(0, c).trim();
          const v = pair.slice(c + 1).trim();
          if (k && v) existingParsed[k] = v;
        }
        const finalDecls = { ...merged, ...existingParsed };
        const styleStr = Object.entries(finalDecls)
          .map(([k, v]) => `${k}:${v}`)
          .join(';');
        el.setAttribute('style', styleStr);
      }
    }

    // Now blank out the <style> blocks so Fabric's redundant rule pass
    // doesn't double-apply them (and so any unsupported at-rules don't
    // trip the parser's split-on-} heuristic).
    for (const s of styleEls) s.textContent = '';
  }

  /* ---------- 2. Resolve currentColor ---------- */

  // Walk up the parent chain for each `currentColor` mention and substitute
  // the inherited `color`. If nothing is set, fall back to black.
  const inheritColor = (el: Element): string => {
    let cur: Element | null = el;
    while (cur && cur.nodeType === 1) {
      const c = cur.getAttribute('color');
      if (c) return c;
      const style = cur.getAttribute('style');
      if (style) {
        const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
        if (m) return m[1].trim();
      }
      cur = cur.parentElement;
    }
    return '#000000';
  };

  const allWithCurrent = Array.from(root.getElementsByTagName('*'));
  for (const el of allWithCurrent) {
    for (const attr of ['fill', 'stroke']) {
      const v = el.getAttribute(attr);
      if (v && /currentColor/i.test(v)) {
        el.setAttribute(attr, v.replace(/currentColor/gi, inheritColor(el)));
      }
    }
    const style = el.getAttribute('style');
    if (style && /currentColor/i.test(style)) {
      el.setAttribute('style', style.replace(/currentColor/gi, inheritColor(el)));
    }
  }

  /* ---------- 3. Warn about features we can't preserve ---------- */

  const tagWarnings: Array<[string, string]> = [
    ['filter', 'SVG <filter> definitions dropped (blur/drop-shadow/etc. not rendered).'],
    ['mask', 'SVG <mask> definitions dropped (alpha masking not supported).'],
    ['use', 'SVG <use> references are flattened by Fabric (originals not preserved).'],
    ['foreignObject', '<foreignObject> dropped (HTML-in-SVG not supported).'],
    ['symbol', 'SVG <symbol> definitions flattened to plain shapes.'],
    ['marker', 'SVG <marker> definitions dropped (arrowheads not rendered).'],
  ];
  for (const [tag, msg] of tagWarnings) {
    if (root.getElementsByTagName(tag).length > 0) warnings.push(msg);
  }
  // Warn if any attribute references a filter() via inline url().
  if (Array.from(root.getElementsByTagName('*')).some(el =>
    /url\(\s*#/.test(el.getAttribute('filter') || ''),
  )) {
    if (!warnings.some(w => w.startsWith('SVG <filter>'))) {
      warnings.push('Inline filter="url(#…)" references dropped.');
    }
  }

  /* ---------- 4. Serialize ---------- */

  const serialized = new XMLSerializer().serializeToString(doc);
  return { svg: serialized, warnings };
}

/* --------------------------------------------------------------------- */
/* Gradient post-pass                                                    */
/* --------------------------------------------------------------------- */

interface GradientDef {
  el: Element;
  type: 'linear' | 'radial';
}

/**
 * Index gradient defs by id (including xlink:href chains). Lets us patch
 * objects whose fill="url(#id)" survived but whose gradient was not
 * resolved into a Fabric Gradient — usually because the gradient was
 * defined after its referencing element, or referenced via inheritance.
 */
function indexGradientDefs(svgString: string): Map<string, GradientDef> {
  const out = new Map<string, GradientDef>();
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const lin = Array.from(doc.getElementsByTagName('linearGradient'));
    const rad = Array.from(doc.getElementsByTagName('radialGradient'));
    for (const el of lin) {
      const id = el.getAttribute('id');
      if (id) out.set(id, { el, type: 'linear' });
    }
    for (const el of rad) {
      const id = el.getAttribute('id');
      if (id) out.set(id, { el, type: 'radial' });
    }
  } catch {
    /* ignore — best effort only */
  }
  return out;
}

/**
 * Build a `fabric.Gradient` from an SVG gradient element by hand. Used as
 * a fallback when Fabric's own resolver missed the mark. Returns null on
 * parse failure.
 */
function gradientFromDef(
  def: GradientDef,
  defs: Map<string, GradientDef>,
  obj: fabric.FabricObject,
): fabric.Gradient<'linear' | 'radial'> | null {
  const { el, type } = def;

  // Resolve xlink:href / href chain to gather inherited stops + coords.
  const seen = new Set<Element>();
  let cur: Element | null = el;
  const chain: Element[] = [];
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    const href: string = cur.getAttribute('xlink:href') ?? cur.getAttribute('href') ?? '';
    const refId: string = href.startsWith('#') ? href.slice(1) : '';
    cur = refId ? defs.get(refId)?.el ?? null : null;
  }

  // Stops: take the closest gradient with explicit <stop> children.
  let stopSource: Element | null = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].getElementsByTagName('stop').length > 0) {
      stopSource = chain[i];
      break;
    }
  }
  if (!stopSource) return null;
  const stopEls = Array.from(stopSource.getElementsByTagName('stop'));
  if (stopEls.length < 2) return null;

  // Helper: read stop attributes (offset / color / opacity), pulling from
  // inline style if attribute form is missing.
  const readStop = (s: Element): { offset: number; color: string; opacity?: number } => {
    const off = s.getAttribute('offset') || '0';
    const offset = off.endsWith('%')
      ? parseFloat(off) / 100
      : Math.max(0, Math.min(1, parseFloat(off) || 0));
    const style = s.getAttribute('style') || '';
    const styleParts: Record<string, string> = {};
    for (const pair of style.split(';')) {
      const c = pair.indexOf(':');
      if (c < 0) continue;
      const k = pair.slice(0, c).trim();
      const v = pair.slice(c + 1).trim();
      if (k && v) styleParts[k] = v;
    }
    const color =
      s.getAttribute('stop-color') || styleParts['stop-color'] || '#000000';
    const opAttr =
      s.getAttribute('stop-opacity') || styleParts['stop-opacity'];
    const opacity = opAttr != null ? Math.max(0, Math.min(1, parseFloat(opAttr))) : undefined;
    return opacity != null ? { offset, color, opacity } : { offset, color };
  };
  const colorStops = stopEls.map(readStop);

  // Coords: merge from the chain (later overrides earlier).
  const attr = (k: string): string | null => {
    for (let i = chain.length - 1; i >= 0; i--) {
      const v = chain[i].getAttribute(k);
      if (v != null) return v;
    }
    return null;
  };
  const parsePct = (raw: string | null, fallback: number): number => {
    if (raw == null) return fallback;
    return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
  };

  // Bounding box of the object, used to resolve gradient coords in
  // pixel-space for objectBoundingBox gradients.
  const ow = Math.max(1, (obj.width ?? 1) * (obj.scaleX ?? 1));
  const oh = Math.max(1, (obj.height ?? 1) * (obj.scaleY ?? 1));

  if (type === 'linear') {
    const x1 = parsePct(attr('x1'), 0);
    const y1 = parsePct(attr('y1'), 0);
    const x2 = parsePct(attr('x2'), 1);
    const y2 = parsePct(attr('y2'), 0);
    return new fabric.Gradient<'linear'>({
      type: 'linear',
      coords: { x1: x1 * ow, y1: y1 * oh, x2: x2 * ow, y2: y2 * oh },
      colorStops,
      gradientUnits: 'pixels',
    });
  }

  const cx = parsePct(attr('cx'), 0.5);
  const cy = parsePct(attr('cy'), 0.5);
  const r = parsePct(attr('r'), 0.5);
  const fx = parsePct(attr('fx'), cx);
  const fy = parsePct(attr('fy'), cy);
  return new fabric.Gradient<'radial'>({
    type: 'radial',
    coords: {
      x1: fx * ow, y1: fy * oh, r1: 0,
      x2: cx * ow, y2: cy * oh, r2: r * Math.min(ow, oh),
    },
    colorStops,
    gradientUnits: 'pixels',
  });
}

/**
 * Walk all loaded Fabric objects (recursing into groups) and re-apply any
 * gradient fills/strokes that were lost during Fabric's pass. Returns
 * `{ patched, missing }`: ids we couldn't satisfy fall into `missing`.
 */
function patchMissingGradients(
  objects: fabric.FabricObject[],
  defs: Map<string, GradientDef>,
): { patched: number; missing: string[] } {
  let patched = 0;
  const missing: string[] = [];

  const visit = (o: fabric.FabricObject) => {
    for (const prop of ['fill', 'stroke'] as const) {
      const v = (o as unknown as Record<string, unknown>)[prop];
      if (typeof v !== 'string') continue;
      const m = /^url\(['"]?#([^'")]+)['"]?\)/.exec(v.trim());
      if (!m) continue;
      const id = m[1];
      const def = defs.get(id);
      if (!def) {
        missing.push(id);
        continue;
      }
      const grad = gradientFromDef(def, defs, o);
      if (grad) {
        (o as unknown as Record<string, unknown>)[prop] = grad;
        patched++;
      } else {
        missing.push(id);
      }
    }
    // Recurse into groups.
    const group = o as fabric.Group;
    if (Array.isArray((group as unknown as { _objects?: unknown })._objects)) {
      for (const child of group.getObjects()) visit(child as fabric.FabricObject);
    }
  };

  for (const o of objects) visit(o);
  return { patched, missing };
}

/* --------------------------------------------------------------------- */
/* viewBox-aware placement                                               */
/* --------------------------------------------------------------------- */

/**
 * Scale the assembled group to fit ~90% of the canvas, preserving aspect
 * ratio, and center it. Mirrors the heuristic `importImageFile` uses for
 * raster images.
 */
function fitGroupToCanvas(group: fabric.FabricObject, canvas: fabric.Canvas) {
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const gw = group.width ?? 1;
  const gh = group.height ?? 1;
  if (gw <= 0 || gh <= 0) return;
  const maxW = cw * 0.9;
  const maxH = ch * 0.9;
  let s = 1;
  if (gw > maxW || gh > maxH) s = Math.min(maxW / gw, maxH / gh);
  group.scale(s);
  const sw = gw * s;
  const sh = gh * s;
  group.set({ left: (cw - sw) / 2, top: (ch - sh) / 2 });
  group.setCoords();
}

/* --------------------------------------------------------------------- */
/* Public API                                                            */
/* --------------------------------------------------------------------- */

/**
 * Smart SVG import. Pre-processes the SVG, defers to Fabric for actual
 * geometry parsing, then patches gradients and surfaces warnings.
 */
export async function importSVGSmart(svgString: string): Promise<SmartImportResult> {
  const canvas = getCanvas();
  if (!canvas) return { added: 0, warnings: ['No active canvas.'] };
  if (!svgString || !svgString.trim()) return { added: 0, warnings: ['Empty SVG input.'] };

  const { svg: prepped, warnings } = preprocessSVG(svgString);

  let result: Awaited<ReturnType<typeof fabric.loadSVGFromString>>;
  try {
    result = await fabric.loadSVGFromString(prepped);
  } catch (err) {
    return { added: 0, warnings: [`SVG parse failed: ${(err as Error).message}`] };
  }

  const objects = (result.objects || []).filter(Boolean) as fabric.FabricObject[];
  if (!objects.length) {
    return { added: 0, warnings: [...warnings, 'SVG produced no renderable objects.'] };
  }

  // Patch any unresolved gradient references using our own pass over the
  // ORIGINAL (pre-processed) markup, which still has the defs intact.
  const defs = indexGradientDefs(prepped);
  if (defs.size > 0) {
    const { patched, missing } = patchMissingGradients(objects, defs);
    if (patched > 0) {
      // Quietly note that we had to compensate — useful for debugging but
      // not user-facing.
    }
    if (missing.length > 0) {
      const unique = [...new Set(missing)].slice(0, 3);
      warnings.push(`Could not resolve ${missing.length} gradient/pattern ref(s): ${unique.join(', ')}.`);
    }
  }

  // Pattern defs we don't synthesize — but warn so the user knows.
  if (/[<]pattern\b/i.test(prepped)) {
    warnings.push('SVG <pattern> definitions not preserved (rendered as fallback colour).');
  }

  // Disable objectCaching so zoom in stays crisp (Fabric caches grouped
  // content as a bitmap by default; that bitmap pixelates when scaled).
  for (const o of objects) o.set({ objectCaching: false });
  const group = fabric.util.groupSVGElements(objects, result.options);
  group.set({ objectCaching: false });
  fitGroupToCanvas(group, canvas);
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();

  return { added: objects.length, warnings };
}

/**
 * File-driven wrapper around `importSVGSmart`. Reads the file as text and
 * forwards. Matches the signature of `importSVGFile` for drop-in use.
 */
export async function importSVGSmartFile(file: File): Promise<SmartImportResult> {
  const text = await file.text();
  return importSVGSmart(text);
}
