/**
 * Break-Text-Apart tests.
 *
 * The source text objects are hand-built records exposing exactly the fields
 * splitText reads (textLines / __charBounds / getHeightOfLine /
 * _getLineLeftOffset plus the style snapshot), so the placement math is pinned
 * without depending on fabric's font measurement. The produced PIECES are real
 * fabric.IText objects (constructed under the repo-standard 2D-context mock).
 *
 * NOTE on coordinates: when more than one piece is produced, commit() wraps
 * them in a fabric.ActiveSelection, whose layout re-bases every child's
 * left/top into selection-local space (a pure translation at angle 0). So
 * absolute positions are asserted only for single-piece outcomes; multi-piece
 * outcomes assert inter-piece deltas (translation-invariant).
 *
 *  - by letters: one IText per non-space char at place(left+pad+cb.left, yOff)
 *    through the text's scale and rotation; fontSize scales with scaleY
 *  - by lines: one IText per non-blank line, y advancing by line height
 *  - style snapshot (font/fill/stroke/underline/angle) copied to every piece
 *  - single-line texts are skipped by splitTextToLines (kept on canvas);
 *    un-measured texts (no __charBounds) are skipped by splitTextToLetters
 */
import * as fabric from 'fabric';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitTextToLetters, splitTextToLines } from '../splitText';
import * as canvasEngine from '../canvasEngine';

beforeEach(() => {
  // Repo-standard jsdom 2D-context stub (printMarks pattern) so real
  // fabric.IText / ActiveSelection construction succeeds.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 12 }),
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    transform: vi.fn(), setTransform: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    canvas: document.createElement('canvas'),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas(active: fabric.FabricObject[]) {
  const c = {
    getObjects: () => active,
    getActiveObjects: () => active,
    remove: vi.fn(),
    add: vi.fn(),
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return { c, history };
}

type TextRecord = {
  type: string;
  left: number; top: number;
  scaleX?: number; scaleY?: number; angle?: number;
  fontSize: number;
  fontFamily: string; fontWeight: string; fontStyle: string;
  fill: string; stroke: string; strokeWidth: number; underline: boolean;
  textLines: string[];
  __charBounds?: Array<Array<{ left: number; width: number }>>;
  getHeightOfLine: (i: number) => number;
  _getLineLeftOffset?: (i: number) => number;
};

function makeText(over: Partial<TextRecord> = {}): fabric.IText {
  const rec: TextRecord = {
    type: 'i-text',
    left: 100, top: 50,
    scaleX: 2, scaleY: 1.5, angle: 0,
    fontSize: 20,
    fontFamily: 'Arial', fontWeight: 'bold', fontStyle: 'italic',
    fill: '#ff0000', stroke: '#00ff00', strokeWidth: 1, underline: true,
    textLines: ['AB C'],
    __charBounds: [[
      { left: 0, width: 10 }, { left: 10, width: 10 },
      { left: 20, width: 5 }, { left: 25, width: 10 },
    ]],
    getHeightOfLine: () => 24,
    _getLineLeftOffset: () => 3,
    ...over,
  };
  return rec as unknown as fabric.IText;
}

function madePieces(c: { add: ReturnType<typeof vi.fn> }): fabric.IText[] {
  return c.add.mock.calls.map((a) => a[0]) as fabric.IText[];
}

describe('splitTextToLetters', () => {
  it('returns 0 without a canvas or without selected text', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(splitTextToLetters()).toBe(0);
    const { c, history } = makeCanvas([{ type: 'path' } as fabric.FabricObject]);
    expect(splitTextToLetters()).toBe(0);
    expect(c.remove).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('places a lone letter exactly: pad + char bounds through scale, fontSize via scaleY', () => {
    // Single piece → setActiveObject(piece) directly, coords stay absolute.
    const t = makeText({ textLines: ['A'], __charBounds: [[{ left: 4, width: 10 }]] });
    const { c, history } = makeCanvas([t]);
    expect(splitTextToLetters()).toBe(1);
    const made = madePieces(c);
    expect(made[0].text).toBe('A');
    // place(): left = 100 + (3 + 4)·2, top = 50 + 0·1.5.
    expect(made[0].left).toBeCloseTo(100 + (3 + 4) * 2, 6);
    expect(made[0].top).toBeCloseTo(50, 6);
    // fontSize follows scaleY; style snapshot copied to the piece.
    expect(made[0].fontSize).toBeCloseTo(20 * 1.5, 6);
    expect(made[0].fontFamily).toBe('Arial');
    expect(made[0].fontWeight).toBe('bold');
    expect(made[0].fontStyle).toBe('italic');
    expect(made[0].fill).toBe('#ff0000');
    expect(made[0].stroke).toBe('#00ff00');
    expect(made[0].underline).toBe(true);
    expect(c.remove).toHaveBeenCalledWith(t);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(c.setActiveObject).toHaveBeenCalledWith(made[0]);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('splits one IText per non-space letter with scaled x deltas', () => {
    const { c } = makeCanvas([makeText()]);
    expect(splitTextToLetters()).toBe(3); // 'A', 'B', 'C' — space skipped
    const made = madePieces(c);
    expect(made.map((m) => m.text)).toEqual(['A', 'B', 'C']);
    // Inter-piece deltas survive the ActiveSelection re-basing:
    // Δx = Δ(leftPad + cb.left)·scaleX; all on line 1 → equal tops.
    expect(made[1].left - made[0].left).toBeCloseTo(10 * 2, 6);
    expect(made[2].left - made[0].left).toBeCloseTo(25 * 2, 6);
    expect(made[1].top - made[0].top).toBeCloseTo(0, 6);
  });

  it('advances y by getHeightOfLine across lines and honours rotation', () => {
    const t = makeText({
      angle: 90,
      textLines: ['AB', 'CD'],
      __charBounds: [
        [{ left: 0, width: 10 }, { left: 10, width: 10 }],
        [{ left: 0, width: 10 }, { left: 10, width: 10 }],
      ],
      getHeightOfLine: (i: number) => (i === 0 ? 24 : 30),
    });
    const { c } = makeCanvas([t]);
    expect(splitTextToLetters()).toBe(4);
    const made = madePieces(c);
    // Within line 1: Δ(sx) = 10·2 rotates by +90° (screen CW) → moves DOWN 20.
    expect(made[1].left - made[0].left).toBeCloseTo(0, 6);
    expect(made[1].top - made[0].top).toBeCloseTo(20, 6);
    // Line 2 start: yOff 24 scaled → (0, 36) rotated 90° → (−36, 0).
    expect(made[2].left - made[0].left).toBeCloseTo(-24 * 1.5, 6);
    expect(made[2].top - made[0].top).toBeCloseTo(0, 6);
  });

  it('skips texts without char bounds (un-measured) without removing them', () => {
    const unmeasured = makeText({});
    delete (unmeasured as unknown as TextRecord).__charBounds;
    const { c } = makeCanvas([unmeasured]);
    expect(splitTextToLetters()).toBe(0);
    expect(c.remove).not.toHaveBeenCalledWith(unmeasured);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('ignores non-text objects in the selection', () => {
    const { c } = makeCanvas([{ type: 'rect' } as fabric.FabricObject, makeText()]);
    expect(splitTextToLetters()).toBe(3);
    expect(c.remove).toHaveBeenCalledTimes(1); // only the text
  });
});

describe('splitTextToLines', () => {
  it('returns 0 without a canvas or without selected text', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(splitTextToLines()).toBe(0);
    const { c } = makeCanvas([{ type: 'path' } as fabric.FabricObject]);
    expect(splitTextToLines()).toBe(0);
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('places a lone line exactly at its pad offset', () => {
    // Second line blank → single piece 'AB', coords stay absolute.
    const t = makeText({ textLines: ['AB', '  '], _getLineLeftOffset: () => 5 });
    const { c, history } = makeCanvas([t]);
    expect(splitTextToLines()).toBe(1);
    const made = madePieces(c);
    expect(made[0].text).toBe('AB');
    expect(made[0].left).toBeCloseTo(100 + 5 * 2, 6);
    expect(made[0].top).toBeCloseTo(50, 6);
    expect(made[0].fontSize).toBeCloseTo(30, 6);
    expect(made[0].fill).toBe('#ff0000');
    expect(c.remove).toHaveBeenCalledWith(t);
    expect(c.setActiveObject).toHaveBeenCalledWith(made[0]);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('splits multi-line text with per-line pads and cumulative y offsets', () => {
    const t = makeText({
      textLines: ['AB', 'CD'],
      getHeightOfLine: (i: number) => (i === 0 ? 24 : 30),
      _getLineLeftOffset: (i: number) => (i === 0 ? 3 : 7),
    });
    const { c } = makeCanvas([t]);
    expect(splitTextToLines()).toBe(2);
    const made = madePieces(c);
    expect(made.map((m) => m.text)).toEqual(['AB', 'CD']);
    // Δx = (7−3)·scaleX; Δy = 24·scaleY (deltas survive selection re-basing).
    expect(made[1].left - made[0].left).toBeCloseTo((7 - 3) * 2, 6);
    expect(made[1].top - made[0].top).toBeCloseTo(24 * 1.5, 6);
    expect(c.remove).toHaveBeenCalledWith(t);
    expect(c.setActiveObject).toHaveBeenCalledTimes(1);
  });

  it('skips single-line texts entirely (original kept on canvas)', () => {
    const single = makeText({ textLines: ['AB'] });
    const { c } = makeCanvas([single]);
    expect(splitTextToLines()).toBe(0);
    expect(c.remove).not.toHaveBeenCalledWith(single);
  });

  it('does not create pieces for blank lines but advances past their height', () => {
    const t = makeText({
      textLines: ['AB', '   ', 'CD'],
      getHeightOfLine: (i: number) => (i === 1 ? 40 : 24),
    });
    const { c } = makeCanvas([t]);
    expect(splitTextToLines()).toBe(2);
    const made = madePieces(c);
    expect(made.map((m) => m.text)).toEqual(['AB', 'CD']);
    // Line 3 advances past line 1 (24) + blank line 2 (40), scaled.
    expect(made[1].top - made[0].top).toBeCloseTo((24 + 40) * 1.5, 6);
  });

  it('accepts textbox type as text too', () => {
    const t = makeText({ type: 'textbox', textLines: ['AB', 'CD'] });
    const { c } = makeCanvas([t]);
    expect(splitTextToLines()).toBe(2);
    expect(c.remove).toHaveBeenCalledWith(t);
  });
});

/* ------------------------- zero-piece data-loss guard ------------------------- */

describe('splitText zero-piece guard (data-loss fix)', () => {
  it('splitTextToLetters keeps an all-space text instead of silently deleting it', () => {
    const blank = makeText({
      textLines: ['   '],
      __charBounds: [[{ left: 0, width: 5 }, { left: 5, width: 5 }, { left: 10, width: 5 }]],
    });
    const { c, history } = makeCanvas([blank]);
    const n = splitTextToLetters();
    expect(n).toBe(0);
    expect(c.remove).not.toHaveBeenCalledWith(blank);
    expect(history).not.toHaveBeenCalled();
  });

  it('splitTextToLines keeps an all-blank-lines text instead of silently deleting it', () => {
    const blankLines = makeText({ textLines: ['', ''], __charBounds: [[], []] });
    const { c, history } = makeCanvas([blankLines]);
    const n = splitTextToLines();
    expect(n).toBe(0);
    expect(c.remove).not.toHaveBeenCalledWith(blankLines);
    expect(history).not.toHaveBeenCalled();
  });
});
