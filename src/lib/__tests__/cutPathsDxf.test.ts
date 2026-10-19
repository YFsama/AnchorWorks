import { describe, expect, it } from 'vitest';
import { cutPathsToDxf } from '../io2';
import type { CutPath } from '../../store/editor';

/**
 * cutPathsToDxf — the cut-path DXF builder for lasers/CAD that eat DXF
 * rather than HP-GL. Mirrors the canvas exportDXF flavour (see io2.ts):
 * a minimal R12-ish HEADER + ENTITIES skeleton of LWPOLYLINE entities, one
 * entity per path, y negated (document space is y-down, DXF y-up).
 *
 * Parsing rides on the export's own wire format: group codes and values on
 * alternating `\n` lines, so exact-string matching is stable.
 */

/** Closed red rectangle at (0, 10), 40 × 20 mm, carrying the closing vertex. */
const rect: CutPath = {
  id: 'red-rect',
  closed: true,
  kind: 'outline',
  color: '#ff0000',
  points: [[0, 10], [40, 10], [40, 30], [0, 30], [0, 10]],
};

/** Colourless open two-point manual line (no colour → kind fallback layer). */
const openLine: CutPath = {
  id: 'manual-line',
  closed: false,
  kind: 'manual',
  points: [[5, 3], [25, 3]],
};

/** Split a DXF into its LWPOLYLINE entity bodies (header/EOF stripped). */
function parseEntities(dxf: string): string[] {
  return dxf
    .split('0\nLWPOLYLINE\n')
    .slice(1)
    .map((chunk) => chunk.split('\n0\nENDSEC')[0]!);
}

describe('cutPathsToDxf', () => {
  it('emits one LWPOLYLINE per path on the colour/kind layer, closed flags set', () => {
    const dxf = cutPathsToDxf([rect, openLine]);

    // One entity per path, each naming its DXF LAYER via group code 8:
    // the colour hex uppercased without '#', the kind for colourless paths.
    const entities = parseEntities(dxf);
    expect(entities).toHaveLength(2);
    expect(entities[0]).toMatch(/^8\nFF0000\n/);
    expect(entities[1]).toMatch(/^8\nMANUAL\n/);
    expect(dxf).toContain('\n8\nFF0000\n');
    expect(dxf).toContain('\n8\nMANUAL\n');
    // Closed flag 70: 1 for the rect, 0 for the open line.
    expect(entities[0]).toContain('\n70\n1\n');
    expect(entities[1]).toContain('\n70\n0\n');
  });

  it('emits one vertex per segment endpoint — segments plus the +1 closing for closed', () => {
    const dxf = cutPathsToDxf([rect, openLine]);
    const entities = parseEntities(dxf);

    // Segment accounting: the closed rect traces 4 segments (3 edges + the
    // +1 closing vertex re-emitting the start), the open line 1 segment.
    // Per entity, vertices = segments + 1 endpoint, so the total vertex
    // count pins exactly the drawn geometry.
    const vertexCount = (entity: string) => (entity.match(/^10$/gm) ?? []).length;
    expect(vertexCount(entities[0]!)).toBe(rect.points.length); // 5 = 3 edges + closing
    expect(vertexCount(entities[1]!)).toBe(openLine.points.length); // 2 = 1 segment + endpoint
    const totalSegments = rect.points.length - 1 + openLine.points.length - 1;
    expect(totalSegments).toBe(5); // 4 (incl. closing) + 1
    // Vertex count 90 group agrees with the emitted vertices.
    expect(entities[0]).toContain(`\n90\n${rect.points.length}\n`);
    expect(entities[1]).toContain(`\n90\n${openLine.points.length}\n`);
  });

  it('wraps entities in the balanced exportDXF section skeleton (HEADER + ENTITIES + EOF)', () => {
    const dxf = cutPathsToDxf([rect, openLine]);

    // Same prologue/epilogue as the canvas export — minimal HEADER, then
    // ENTITIES, closed by EOF.
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n')).toBe(true);
    expect(dxf.endsWith('\n0\nENDSEC\n0\nEOF\n')).toBe(true);
    // Sections balanced: every SECTION has its ENDSEC (2 of each here).
    const sections = (dxf.match(/^SECTION$/gm) ?? []).length;
    const endsecs = (dxf.match(/^ENDSEC$/gm) ?? []).length;
    expect(sections).toBe(endsecs);
    expect(sections).toBe(2);
    expect(dxf.endsWith('0\nEOF\n')).toBe(true);
  });

  it('negates y (document y-down → DXF y-up), pinning one coordinate pair', () => {
    const dxf = cutPathsToDxf([rect, openLine]);

    // The rect's first vertex is (x=0, y=10) — emitted as 10/20 pair with
    // y negated. Exact-line matching avoids substring hits inside -10.
    expect(dxf).toContain('10\n0\n20\n-10\n');
    // No positive-y emission anywhere: every fixture y (3, 10, 30) appears
    // only negated.
    for (const y of [3, 10, 30]) {
      expect(dxf).not.toContain(`20\n${y}\n`);
      expect(dxf).toContain(`20\n-${y}\n`);
    }
  });

  it('honours layerNameFor over the colour/kind default, and skips <2-point paths', () => {
    const byId = cutPathsToDxf([rect, openLine], { layerNameFor: (p) => p.id });
    expect(byId).toContain('\n8\nred-rect\n');
    expect(byId).toContain('\n8\nmanual-line\n');
    expect(byId).not.toContain('FF0000');
    expect(byId).not.toContain('MANUAL');

    // Degenerate single-point paths emit nothing.
    const lone: CutPath = { id: 'dot', closed: true, kind: 'outline', color: '#00ff00', points: [[1, 1]] };
    expect(parseEntities(cutPathsToDxf([lone]))).toHaveLength(0);
    // …and the empty job still yields a valid balanced document.
    const empty = cutPathsToDxf([]);
    expect(empty.startsWith('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n')).toBe(true);
    expect(empty.endsWith('\n0\nENDSEC\n0\nEOF\n')).toBe(true);
    expect(parseEntities(empty)).toHaveLength(0);
  });
});
