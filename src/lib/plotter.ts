/**
 * Plotter / cutter output: SVG path -> G-code or HPGL.
 * Browser Web Serial API is used to send data when available.
 */

import { exportSVG } from './io';

/**
 * HP-GL dialect selector. Real-world cutter firmwares accept HP-GL with
 * vendor-specific prefix/suffix commands; emitting the right ones gives
 * cleaner corners (Roland's TB overcut), correct page setup (CT mode),
 * and proper page-eject behaviour (!PG, FS/VS for Graphtec speed/force).
 *
 *   bare           - vanilla `IN; SP1; PU; PD; ...` — most pen plotters
 *   roland-camm    - `TB25; W,H; CT1; IN; ... ; PU<eject>; !PG;`
 *                    matches the format produced by Roland's bundled
 *                    cutter driver and most Chinese knockoffs (Wentai,
 *                    Artcut, Rabbit, Liyu) that target Roland-compatible
 *                    machines.
 *   graphtec-fc    - `IN; SP1; FS<force>; VS<speed>; PA; ... ; SP0;`
 *                    Graphtec FC series cutters and Graphtec-compatible
 *                    third parties (Cutting Master, Robo Master).
 */
export type HpglDialect = 'bare' | 'roland-camm' | 'graphtec-fc';

export interface PlotterOptions {
  unit: 'mm' | 'in';
  pxPerUnit: number;     // how many SVG px equal 1 unit
  feedRate: number;      // mm/min or in/min
  travelRate: number;
  penDownZ: number;
  penUpZ: number;
  originBottomLeft: boolean;
  paperHeightUnits: number;
  curveTolerance: number; // px tolerance for flattening curves
  /** HP-GL only — dialect picks the right wrapper commands per cutter brand. */
  dialect: HpglDialect;
  /** Roland TB overcut in plotter units (40/mm). 25 = 0.625mm — matches `1.plt`. */
  rolandOvercutUnits: number;
  /** Graphtec FS (force, gf) — 0 to skip. */
  graphtecForce: number;
  /** Graphtec VS (velocity, cm/s) — 0 to skip. */
  graphtecSpeed: number;
}

export const defaultPlotterOptions: PlotterOptions = {
  unit: 'mm',
  pxPerUnit: 3.7795, // 96dpi -> mm
  feedRate: 1500,
  travelRate: 3000,
  penDownZ: -1,
  penUpZ: 5,
  originBottomLeft: true,
  paperHeightUnits: 210, // A4 height in mm
  curveTolerance: 0.5,
  dialect: 'bare',
  rolandOvercutUnits: 25,
  graphtecForce: 30,
  graphtecSpeed: 20,
};

interface Polyline { points: Array<[number, number]>; closed: boolean; }

/** Flatten current canvas SVG into polylines (units), ready for G-code/HPGL. */
export function svgToPolylines(svg: string, opts: PlotterOptions): Polyline[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const polylines: Polyline[] = [];

  const walk = (node: Element, parentMatrix: DOMMatrix) => {
    const m = matrixForNode(node, parentMatrix);
    if (node.tagName === 'path') {
      const d = node.getAttribute('d') ?? '';
      polylines.push(...flattenPath(d, m, opts.curveTolerance));
    } else if (node.tagName === 'line') {
      const x1 = +node.getAttribute('x1')!, y1 = +node.getAttribute('y1')!;
      const x2 = +node.getAttribute('x2')!, y2 = +node.getAttribute('y2')!;
      polylines.push({ points: [transform(m, x1, y1), transform(m, x2, y2)], closed: false });
    } else if (node.tagName === 'rect') {
      const x = +node.getAttribute('x')!, y = +node.getAttribute('y')!;
      const w = +node.getAttribute('width')!, h = +node.getAttribute('height')!;
      polylines.push({
        points: [
          transform(m, x, y), transform(m, x + w, y), transform(m, x + w, y + h), transform(m, x, y + h),
        ],
        closed: true,
      });
    } else if (node.tagName === 'circle') {
      const cx = +node.getAttribute('cx')!, cy = +node.getAttribute('cy')!, r = +node.getAttribute('r')!;
      polylines.push(flattenEllipse(cx, cy, r, r, m, opts.curveTolerance));
    } else if (node.tagName === 'ellipse') {
      const cx = +node.getAttribute('cx')!, cy = +node.getAttribute('cy')!;
      const rx = +node.getAttribute('rx')!, ry = +node.getAttribute('ry')!;
      polylines.push(flattenEllipse(cx, cy, rx, ry, m, opts.curveTolerance));
    } else if (node.tagName === 'polygon' || node.tagName === 'polyline') {
      const pts = (node.getAttribute('points') ?? '')
        .trim().split(/[\s,]+/).map(Number);
      const points: Array<[number, number]> = [];
      for (let i = 0; i < pts.length; i += 2) points.push(transform(m, pts[i], pts[i + 1]));
      polylines.push({ points, closed: node.tagName === 'polygon' });
    }
    Array.from(node.children).forEach(c => walk(c, m));
  };
  walk(root, new DOMMatrix());

  // Convert from px -> user units, flip Y if originBottomLeft
  return polylines.map(pl => ({
    closed: pl.closed,
    points: pl.points.map(([x, y]) => {
      const ux = x / opts.pxPerUnit;
      const uy = y / opts.pxPerUnit;
      return [ux, opts.originBottomLeft ? (opts.paperHeightUnits - uy) : uy] as [number, number];
    }),
  }));
}

function matrixForNode(node: Element, parent: DOMMatrix): DOMMatrix {
  const t = node.getAttribute('transform');
  if (!t) return parent;
  try {
    const local = new DOMMatrix(t);
    return parent.multiply(local);
  } catch {
    return parent;
  }
}

function transform(m: DOMMatrix, x: number, y: number): [number, number] {
  const p = m.transformPoint(new DOMPoint(x, y));
  return [p.x, p.y];
}

/** Naive path flattener: M, L, C, Q, Z (absolute & relative). */
function flattenPath(d: string, m: DOMMatrix, tol: number): Polyline[] {
  const result: Polyline[] = [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let cmd = '';
  let current: Polyline = { points: [], closed: false };
  let hasCurrent = false;
  const push = (pt: [number, number]) => {
    if (!hasCurrent) { current = { points: [], closed: false }; hasCurrent = true; }
    current.points.push(transform(m, pt[0], pt[1]));
  };
  const startNew = () => {
    if (hasCurrent && current.points.length > 1) result.push(current);
    current = { points: [], closed: false };
    hasCurrent = true;
  };
  const readNum = () => +tokens[i++];

  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[a-zA-Z]/.test(tk)) { cmd = tk; i++; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      const x = readNum(), y = readNum();
      cur = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      start = [...cur];
      startNew();
      push(cur);
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      const x = readNum(), y = readNum();
      cur = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      push(cur);
    } else if (C === 'H') {
      const x = readNum();
      cur = [rel ? cur[0] + x : x, cur[1]];
      push(cur);
    } else if (C === 'V') {
      const y = readNum();
      cur = [cur[0], rel ? cur[1] + y : y];
      push(cur);
    } else if (C === 'C') {
      const x1 = readNum(), y1 = readNum();
      const x2 = readNum(), y2 = readNum();
      const x = readNum(), y = readNum();
      const p1: [number, number] = rel ? [cur[0] + x1, cur[1] + y1] : [x1, y1];
      const p2: [number, number] = rel ? [cur[0] + x2, cur[1] + y2] : [x2, y2];
      const p3: [number, number] = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      flattenCubic(cur, p1, p2, p3, tol).forEach(pt => push(pt));
      cur = p3;
    } else if (C === 'Q') {
      const x1 = readNum(), y1 = readNum();
      const x = readNum(), y = readNum();
      const p1: [number, number] = rel ? [cur[0] + x1, cur[1] + y1] : [x1, y1];
      const p2: [number, number] = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      flattenQuad(cur, p1, p2, tol).forEach(pt => push(pt));
      cur = p2;
    } else if (C === 'Z') {
      if (hasCurrent) {
        current.closed = true;
        push(start);
        cur = [...start];
      }
    } else {
      i++; // unknown command — skip
    }
  }
  if (hasCurrent && current.points.length > 1) result.push(current);
  return result;
}

function flattenCubic(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], tol: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const steps = Math.max(8, Math.ceil(cubicLength(p0, p1, p2, p3) / tol));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push(cubicAt(p0, p1, p2, p3, t));
  }
  return out;
}
function cubicAt(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
function cubicLength(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number]) {
  return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
    Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
}
function flattenQuad(p0: [number, number], p1: [number, number], p2: [number, number], tol: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const steps = Math.max(6, Math.ceil((Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) / tol));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}
function flattenEllipse(cx: number, cy: number, rx: number, ry: number, m: DOMMatrix, tol: number): Polyline {
  const steps = Math.max(24, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / tol));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(transform(m, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return { points: pts, closed: true };
}

/** Generate G-code from polylines (CNC-style, pen on Z axis). */
export function generateGCode(polylines: Polyline[], opts: PlotterOptions): string {
  const lines: string[] = [];
  lines.push('; Anchorworks — G-code output');
  lines.push(opts.unit === 'mm' ? 'G21 ; mm' : 'G20 ; inches');
  lines.push('G90 ; absolute');
  lines.push(`G0 Z${opts.penUpZ.toFixed(3)} F${opts.travelRate}`);

  for (const pl of polylines) {
    if (pl.points.length < 2) continue;
    const [x0, y0] = pl.points[0];
    lines.push(`G0 X${x0.toFixed(3)} Y${y0.toFixed(3)} F${opts.travelRate}`);
    lines.push(`G1 Z${opts.penDownZ.toFixed(3)} F${opts.feedRate}`);
    for (let i = 1; i < pl.points.length; i++) {
      const [x, y] = pl.points[i];
      lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${opts.feedRate}`);
    }
    lines.push(`G0 Z${opts.penUpZ.toFixed(3)} F${opts.travelRate}`);
  }
  lines.push('G0 X0 Y0');
  lines.push('M30 ; end');
  return lines.join('\n');
}

/** Generate HPGL (HP-GL pen plotter language). Units = plotter units (~1016/inch). */
export function generateHPGL(polylines: Polyline[], opts: PlotterOptions): string {
  const unitsPerInput = opts.unit === 'mm' ? 40 : 1016; // HPGL plotter units
  const dialect = opts.dialect ?? 'bare';

  // Compute bounds + page footprint in plotter units. Roland uses the page
  // size header to tell the cutter how much material to advance; if the
  // user hasn't set one we infer from the geometry bounds.
  let maxX = 0, maxY = 0;
  for (const pl of polylines) for (const [x, y] of pl.points) {
    const X = x * unitsPerInput, Y = y * unitsPerInput;
    if (X > maxX) maxX = X; if (Y > maxY) maxY = Y;
  }
  const pageW = Math.max(Math.ceil(maxX) + 200, Math.round(opts.paperHeightUnits * unitsPerInput / 2));
  const pageH = Math.max(Math.ceil(maxY) + 200, Math.round(opts.paperHeightUnits * unitsPerInput));

  const parts: string[] = [];

  // --- Dialect-specific header ---
  if (dialect === 'roland-camm') {
    // Matches the `TB25;11280,7920;CT1;` template from real Roland-flavoured
    // cutter files. TB sets overcut depth (corner overshoot for clean
    // tangential cuts), the bare-number statement is page size, CT1 selects
    // cut-through mode 1. Three IN's drain any prior state from the buffer
    // — superstitious but harmless and consistent with the reference files.
    parts.push(`TB${opts.rolandOvercutUnits};`);
    parts.push(`${pageW},${pageH};`);
    parts.push('CT1;');
    parts.push('IN;');
    parts.push('IN;');
    parts.push('IN;');
    parts.push('PA;');
  } else if (dialect === 'graphtec-fc') {
    parts.push('IN;');
    parts.push('SP1;');
    if (opts.graphtecForce > 0) parts.push(`FS${opts.graphtecForce};`);
    if (opts.graphtecSpeed > 0) parts.push(`VS${opts.graphtecSpeed};`);
    parts.push('PA;');
  } else {
    parts.push('IN;');
    parts.push('SP1;');
  }

  // --- Geometry ---
  for (const pl of polylines) {
    if (pl.points.length < 2) continue;
    const [x0, y0] = pl.points[0];
    parts.push(`PU${Math.round(x0 * unitsPerInput)},${Math.round(y0 * unitsPerInput)};`);
    const rest = pl.points.slice(1).map(([x, y]) =>
      `${Math.round(x * unitsPerInput)},${Math.round(y * unitsPerInput)}`,
    ).join(',');
    parts.push(`PD${rest};`);
  }

  // --- Dialect-specific footer ---
  if (dialect === 'roland-camm') {
    // Park near top-right then page eject. The reference files use
    // x = pageW + ~200 (just past the geometry) which Roland treats as the
    // material advance position.
    parts.push(`PU${pageW + 200},200;`);
    parts.push('!PG;');
  } else if (dialect === 'graphtec-fc') {
    parts.push('PU0,0;');
    parts.push('SP0;');
  } else {
    parts.push('PU0,0;');
    parts.push('SP0;');
  }

  return parts.join('\n');
}

/** Convenience: build for current canvas. */
export function buildPlotterOutput(format: 'gcode' | 'hpgl', opts: PlotterOptions): string {
  const svg = exportSVG();
  const polylines = svgToPolylines(svg, opts);
  return format === 'gcode' ? generateGCode(polylines, opts) : generateHPGL(polylines, opts);
}

/** Native-shell port descriptor — mirrors the `SerialPortDescriptor`
 *  serialized by `src-tauri/src/lib.rs#serial_list_ports`. */
export interface NativeSerialPort {
  path: string;
  kind: 'usb' | 'bluetooth' | 'pci' | 'unknown';
  manufacturer?: string;
  vid?: number;
  pid?: number;
  product?: string;
}

/**
 * Enumerate serial ports the OS knows about. Returns `null` under the PWA
 * (Web Serial doesn't expose enumeration without a user gesture per port);
 * a populated array under Tauri. Callers should treat `null` as "show the
 * Web Serial requestPort() chooser instead of an in-app picker".
 */
export async function listSerialPorts(): Promise<NativeSerialPort[] | null> {
  const { isTauri, callNative } = await import('./runtime');
  if (!isTauri()) return null;
  return callNative<NativeSerialPort[]>('serial_list_ports', undefined, async () => []);
}

/**
 * Send text to a serial-connected device. Web path uses the Web Serial
 * `requestPort()` chooser (Chrome/Edge only). Native path routes through
 * Tauri's `serial_send` command — `port` is optional; when omitted we use
 * the first USB port if there's exactly one, otherwise throw a clear error.
 */
export async function sendOverSerial(text: string, baud = 115200, port?: string): Promise<void> {
  const { isTauri, callNative } = await import('./runtime');

  if (isTauri()) {
    let target = port;
    if (!target) {
      const ports = await callNative<NativeSerialPort[]>('serial_list_ports', undefined, async () => []);
      const usbPorts = ports.filter(p => p.kind === 'usb');
      if (usbPorts.length === 1) target = usbPorts[0].path;
      else if (ports.length === 1) target = ports[0].path;
      else if (ports.length === 0) throw new Error('No serial ports detected. Plug in the plotter and try again.');
      else throw new Error(`Multiple serial ports detected (${ports.map(p => p.path).join(', ')}). Pick one in the Plotter dialog.`);
    }
    await callNative<void>('serial_send', { path: target, baud, payload: text }, async () => undefined);
    return;
  }

  type SerialNav = Navigator & { serial?: { requestPort: () => Promise<SerialPortLike> } };
  type SerialPortLike = {
    open: (o: { baudRate: number }) => Promise<void>;
    writable: WritableStream<Uint8Array>;
    close: () => Promise<void>;
  };
  const nav = navigator as SerialNav;
  if (!nav.serial) throw new Error('Web Serial API not available — use Chrome or Edge over HTTPS / localhost.');
  const webPort = await nav.serial.requestPort();
  await webPort.open({ baudRate: baud });
  const writer = webPort.writable.getWriter();
  const encoder = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,256}/g) ?? [];
  for (const chunk of chunks) await writer.write(encoder.encode(chunk));
  writer.releaseLock();
  await webPort.close();
}
