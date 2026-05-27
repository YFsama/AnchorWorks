/**
 * Path-data utilities — currently houses the curve-refit pass that the
 * boolean op output runs through so users don't see stair-step polylines
 * where their inputs were smooth bezier curves.
 *
 * The refit is heuristic, not exact: polygon-clipping flattens every C/Q
 * segment to many tiny straight lines, and there's no general inverse
 * (the "best" curve through N points has many solutions). What we do:
 *
 *   1. Walk each ring; compute the angle change at every vertex.
 *   2. Classify each vertex as "corner" (sharp angle, > CORNER_THRESHOLD)
 *      or "smooth" (gentle angle, the vertex was on a curve in the
 *      original input).
 *   3. Coalesce consecutive smooth vertices into a single C segment with
 *      tangents derived from the chord direction (cardinal-spline style).
 *      Corners stay as L vertices, so the corners of the boolean output
 *      remain sharp (which matters for e.g. polygon ∩ polygon — the
 *      shared corners shouldn't get rounded).
 *
 * Net visual effect: union/intersection/difference output that contained
 * rounded boundaries now reads as a rounded shape again, instead of a
 * 200-vertex polygon approximation.
 */

const CORNER_THRESHOLD = Math.cos((180 - 25) * Math.PI / 180);
// We compare cos(angle) against this threshold. cos(180°) = -1; cos(155°) ≈
// -0.906 → any vertex whose interior turn is sharper than 25° from straight
// is a corner. (cos of "straight on" is -1; cos of 90° turn is 0.)

const TANGENT_FACTOR = 1 / 3;

type Pt = readonly [number, number];

/** Take a closed ring of points and return the SVG path data ("d") string
 *  for that ring, with smooth runs emitted as C segments and corners as L. */
export function ringToBezierPathD(ring: readonly Pt[]): string {
  if (ring.length < 3) {
    // Degenerate ring; emit a plain polygon — no curves to recover.
    if (ring.length === 0) return '';
    let d = `M ${ring[0][0]} ${ring[0][1]}`;
    for (let i = 1; i < ring.length; i++) d += ` L ${ring[i][0]} ${ring[i][1]}`;
    return d + ' Z';
  }

  const n = ring.length;
  const isCorner = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    const ax = cur[0] - prev[0], ay = cur[1] - prev[1];
    const bx = next[0] - cur[0], by = next[1] - cur[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la === 0 || lb === 0) { isCorner[i] = false; continue; }
    // dot of normalised incoming vs outgoing edge — when the edges point
    // in similar directions, dot ≈ 1 (no turn); opposite directions → -1.
    // A "smooth curve" vertex has the outgoing edge bending continuously
    // from the incoming, so the dot stays high. A sharp corner drops the
    // dot below CORNER_THRESHOLD.
    const dot = (ax * bx + ay * by) / (la * lb);
    // Negative cos values are turns toward straight-through (0° = perfect
    // smooth); we want corners when the *interior* angle is sharp, i.e.
    // when dot is *small* (or negative meaning turn-back). Inputs to bool
    // ops are normally convex polygons or curves, so dot < 0.5 ≈ a turn
    // sharper than 60° — treat as corner.
    isCorner[i] = dot < 0.5 || dot < CORNER_THRESHOLD;
  }

  // Emit. Start at the first corner if there is one (so the M lands on
  // a sharp vertex and segments are easier to reason about); otherwise
  // start at index 0.
  let startIdx = isCorner.indexOf(true);
  if (startIdx === -1) startIdx = 0;

  let d = `M ${ring[startIdx][0]} ${ring[startIdx][1]}`;
  for (let step = 1; step <= n; step++) {
    const i = (startIdx + step) % n;
    const prev = ring[(i - 1 + n) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    const prevPrev = ring[(i - 2 + n) % n];

    if (isCorner[i] || isCorner[(i - 1 + n) % n]) {
      // Either endpoint is a corner — emit a straight L for honesty.
      d += ` L ${cur[0]} ${cur[1]}`;
    } else {
      // Both endpoints are smooth — draw a C from prev to cur using
      // cardinal-spline tangents. cp1 is prev + 1/3 of (cur - prevPrev);
      // cp2 is cur - 1/3 of (next - prev).
      const cp1x = prev[0] + TANGENT_FACTOR * (cur[0] - prevPrev[0]);
      const cp1y = prev[1] + TANGENT_FACTOR * (cur[1] - prevPrev[1]);
      const cp2x = cur[0] - TANGENT_FACTOR * (next[0] - prev[0]);
      const cp2y = cur[1] - TANGENT_FACTOR * (next[1] - prev[1]);
      d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${cur[0]} ${cur[1]}`;
    }
  }
  return d + ' Z';
}
