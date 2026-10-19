import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canvasEngine from '../canvasEngine';
import { useEditor, type CutPath } from '../../store/editor';
import { appendCutPathsToSvg, exportSVG } from '../io';

/**
 * CutContour export layer (print-then-cut RIP convention).
 *
 * appendCutPathsToSvg is pure string surgery; exportSVG's includeCutPaths
 * path is exercised against a stubbed canvas (separations.test.ts pattern)
 * and store cut paths, then restored.
 */

const MM_TO_PX = 3.7795;

const BASE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';

function cutPath(overrides: Partial<CutPath> & { points: CutPath['points'] }): CutPath {
  return { id: 'cut-1', closed: false, kind: 'outline', ...overrides };
}

afterEach(() => {
  vi.restoreAllMocks();
  useEditor.getState().setCutPaths([]);
});

describe('appendCutPathsToSvg', () => {
  it('appends a cut layer with CutContour class, magenta hairline, and mm-to-px d', () => {
    const out = appendCutPathsToSvg(BASE_SVG, [
      cutPath({ points: [[10, 0], [30, 0], [30, 20]], closed: true }),
    ]);
    expect(out).toContain('<g id="cut-layer" data-cut="true">');
    expect(out).toContain(
      `<path class="CutContour" stroke="#FF00FF" fill="none" stroke-width="${(0.25 * MM_TO_PX).toFixed(3)}" data-cut-kind="outline" d="M${(10 * MM_TO_PX).toFixed(3)} ${(0 * MM_TO_PX).toFixed(3)} L${(30 * MM_TO_PX).toFixed(3)} ${(0 * MM_TO_PX).toFixed(3)} L${(30 * MM_TO_PX).toFixed(3)} ${(20 * MM_TO_PX).toFixed(3)} Z" />`,
    );
    // Pins the 96dpi factor itself: 10 mm -> 37.795 px.
    expect(out).toContain('d="M37.795 0.000 L113.385 0.000 L113.385 75.590 Z"');
    expect(out.endsWith('</g></svg>')).toBe(true);
  });

  it('maps perf/kiss kinds to PerfCutContour and honours a custom stroke', () => {
    const perf = appendCutPathsToSvg(BASE_SVG, [
      cutPath({ points: [[0, 0], [10, 10]], kind: 'perf' as unknown as CutPath['kind'] }),
    ], { strokeMm: 0.5 });
    expect(perf).toContain('class="PerfCutContour"');
    expect(perf).toContain(`stroke-width="${(0.5 * MM_TO_PX).toFixed(3)}"`);
    expect(perf).toContain('data-cut-kind="perf"');
    // Open path: no closing Z.
    expect(perf).not.toContain(' Z"');
  });

  it('returns the input unchanged for empty or point-less cut paths', () => {
    expect(appendCutPathsToSvg(BASE_SVG, [])).toBe(BASE_SVG);
    expect(appendCutPathsToSvg(BASE_SVG, [cutPath({ points: [] })])).toBe(BASE_SVG);
  });
});

describe('exportSVG includeCutPaths', () => {
  it('appends the store cut paths when requested and stays plain otherwise', () => {
    const canvas = {
      toSVG: vi.fn(() => BASE_SVG),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    useEditor.getState().setCutPaths([cutPath({ points: [[10, 0], [30, 0]], closed: true })]);

    expect(exportSVG()).toBe(BASE_SVG);
    const withCuts = exportSVG({ includeCutPaths: true });
    expect(withCuts).toContain('<g id="cut-layer" data-cut="true">');
    expect(withCuts).toContain('class="CutContour"');
  });

  it('returns empty string without a canvas', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(exportSVG({ includeCutPaths: true })).toBe('');
  });
});
