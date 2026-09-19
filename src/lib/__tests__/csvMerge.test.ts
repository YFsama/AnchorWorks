import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDataMerge,
  hasTokens,
  parseCsv,
  planDataMerge,
  resolveDataMergeTargets,
  substituteTokens,
  type DataMergeBinding,
} from '../variableData';

describe('parseCsv', () => {
  it('splits plain rows with LF or CRLF line endings', () => {
    expect(parseCsv('a,b\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\r\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles quoted fields, embedded commas, and escaped quotes', () => {
    expect(parseCsv('"x,1","y""2",plain').rows).toEqual([['x,1', 'y"2', 'plain']]);
  });

  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsv('"a\nb",c').rows).toEqual([['a\nb', 'c']]);
  });

  it('drops the empty trailing line and stray blank lines', () => {
    expect(parseCsv('a,b\n').rows).toEqual([['a', 'b']]);
    expect(parseCsv('a\n\nb').rows).toEqual([['a'], ['b']]);
  });

  it('parses a single-column file', () => {
    const csv = parseCsv('alice\nbob');
    expect(csv.rows).toEqual([['alice'], ['bob']]);
    expect(csv.columns).toEqual(['Column 1']);
    expect(csv.records).toEqual([{ 'Column 1': 'alice' }, { 'Column 1': 'bob' }]);
  });

  it('treats the first row as a header when the flag is set', () => {
    const csv = parseCsv('Name,Room\nAlice,101\n"Bob Li",102', true);
    expect(csv.header).toEqual(['Name', 'Room']);
    expect(csv.rows).toEqual([['Alice', '101'], ['Bob Li', '102']]);
    expect(csv.records).toEqual([
      { Name: 'Alice', Room: '101' },
      { Name: 'Bob Li', Room: '102' },
    ]);
  });

  it('fills blank header cells and missing trailing cells', () => {
    const csv = parseCsv('Name,,Room\nAlice,101', true);
    expect(csv.header).toEqual(['Name', 'Column 2', 'Room']);
    expect(csv.records).toEqual([{ Name: 'Alice', 'Column 2': '101', Room: '' }]);
  });

  it('returns an empty result for empty input', () => {
    expect(parseCsv('', true)).toMatchObject({ header: [], columns: [], records: [] });
    expect(parseCsv('', false)).toMatchObject({ header: null, records: [] });
  });
});

describe('token substitution', () => {
  const record = { Name: 'Alice', Room: '101' };

  it('detects tokens', () => {
    expect(hasTokens('Hi {{Name}}')).toBe(true);
    expect(hasTokens('Hi {Name}')).toBe(false);
    expect(hasTokens('No. ##')).toBe(false);
  });

  it('substitutes tokens case-insensitively with surrounding whitespace', () => {
    expect(substituteTokens('{{ Name }} in room {{room}}', record)).toBe('Alice in room 101');
  });

  it('keeps unknown column tokens visible', () => {
    expect(substituteTokens('{{Name}} / {{Missing}}', record)).toBe('Alice / {{Missing}}');
  });

  it('leaves plain text untouched', () => {
    expect(substituteTokens('No. ###', record)).toBe('No. ###');
  });
});

describe('resolveDataMergeTargets', () => {
  const objects = [
    { name: 'Title', text: 'Hello {{Name}}' },
    { name: 'room label', text: 'Room ##' },
    { name: null, text: 'unnamed' },
  ];

  it('matches object names case-insensitively after trimming', () => {
    const bindings: DataMergeBinding[] = [
      { column: 'Name', target: 'title' },
      { column: 'Room', target: ' ROOM LABEL ' },
    ];
    const { targets, unmatched } = resolveDataMergeTargets(objects, bindings);
    expect(targets[0]).toBe(objects[0]);
    expect(targets[1]).toBe(objects[1]);
    expect(unmatched).toEqual([]);
  });

  it('collects unmatched target names and blank targets', () => {
    const bindings: DataMergeBinding[] = [
      { column: 'Name', target: 'Ghost' },
      { column: 'Room', target: '' },
    ];
    const { targets, unmatched } = resolveDataMergeTargets(objects, bindings);
    expect(targets).toEqual([null, null]);
    expect(unmatched).toEqual(['Ghost']);
  });
});

describe('planDataMerge', () => {
  const bindings: DataMergeBinding[] = [
    { column: 'Name', target: 'title' },
    { column: 'Room', target: 'room' },
  ];
  const records: Array<Record<string, string>> = [
    { Name: 'Alice', Room: '101' },
    { Name: 'Bob', Room: '102' },
    { Name: 'Carla' }, // missing Room → skipped
  ];
  const templates = ['Hello {{Name}}', 'Room ##'];

  it('plans one grid cell per good record with substituted text', () => {
    const plan = planDataMerge(records, bindings, templates, { cols: 2, gapXmm: 10, gapYmm: 5 });
    expect(plan.generated).toBe(2);
    expect(plan.skipped).toBe(1);
    expect(plan.missingColumns).toEqual(['Room']);

    const first = plan.records[0];
    expect(first.ok).toBe(true);
    expect(first.entries.map(e => e.col)).toEqual([0, 0]);
    expect(first.entries.map(e => e.row)).toEqual([0, 0]);
    expect(first.entries[0].text).toBe('Hello Alice');
    expect(first.entries[1].text).toBe('Room 101'); // '#' run zero-pads
  });

  it('fills columns-first when fillOrder is columns', () => {
    const plan = planDataMerge(records, bindings, templates, { cols: 2, gapXmm: 10, gapYmm: 5, fillOrder: 'columns' });
    const second = plan.records[1];
    expect(second.ok).toBe(true);
    // 3 records / 2 cols → 2 rows: index 1 lands in column 0, row 1.
    expect(second.entries[0]).toMatchObject({ col: 0, row: 1 });
  });

  it('skips records missing any bound column and reports them', () => {
    const plan = planDataMerge(records, bindings, templates, { cols: 2, gapXmm: 10, gapYmm: 5 });
    const skipped = plan.records[2];
    expect(skipped.ok).toBe(false);
    expect(skipped.missing).toEqual(['Room']);
    expect(skipped.entries).toEqual([]);
  });

  it('substitutes the whole text when there is neither token nor # run', () => {
    const plan = planDataMerge([{ Name: 'Alice' }], [{ column: 'Name', target: 't' }], ['plain'], { cols: 1, gapXmm: 1, gapYmm: 1 });
    expect(plan.records[0].entries[0].text).toBe('Alice');
  });
});

describe('applyDataMerge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Minimal fabric-shaped text object: set/setCoords/async clone. */
  function makeText(name: string, text: string, left: number, top: number) {
    const obj = {
      name, text, left, top,
      set(props: Record<string, unknown>) { Object.assign(obj, props); },
      setCoords: () => {},
      async clone() {
        const copy = makeText(name, obj.text ?? '', obj.left ?? 0, obj.top ?? 0);
        copy.isClone = true;
        return copy;
      },
      isClone: false,
    };
    return obj;
  }

  it('writes record 0 into the named objects and clones the rest per record, pushing history once', async () => {
    const canvasEngine = await import('../canvasEngine');
    const title = makeText('title', 'Hello {{Name}}', 100, 50);
    const room = makeText('room', 'Room ##', 100, 80);
    const add = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => [title, room],
      add,
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    const records: Array<Record<string, string>> = [
      { Name: 'Alice', Room: '101' },
      { Name: 'Bob', Room: '102' },
      { Name: 'Carla', Room: '103' },
    ];
    const bindings: DataMergeBinding[] = [
      { column: 'Name', target: 'TITLE' },
      { column: 'Room', target: 'room' },
    ];
    const outcome = await applyDataMerge(records, bindings, { cols: 2, gapXmm: 10, gapYmm: 5 });

    expect(outcome.generated).toBe(3);
    expect(outcome.skipped).toBe(0);
    expect(pushHistory).toHaveBeenCalledOnce();

    // Record 0 reuses the originals in place at their own cell (0,0).
    expect(title.text).toBe('Hello Alice');
    expect(room.text).toBe('Room 101');
    expect(title.left).toBe(100);
    expect(title.top).toBe(50);

    // Records 1 and 2 → 2 bindings × 2 records = 4 clones added, laid out on
    // the grid relative to each target's original position.
    expect(add).toHaveBeenCalledTimes(4);
    const added = add.mock.calls.map(call => call[0] as ReturnType<typeof makeText> & { isClone: boolean });
    const gx = 10 * 3.7795;
    const bobTitle = added.find(o => o.name === 'title' && o.text === 'Hello Bob');
    const bobRoom = added.find(o => o.name === 'room' && o.text === 'Room 102');
    expect(bobTitle?.left).toBeCloseTo(100 + gx, 3); // col 1, row 0
    expect(bobRoom?.left).toBeCloseTo(100 + gx, 3);
    expect(bobTitle?.top).toBeCloseTo(50, 3);
    expect(bobRoom?.top).toBeCloseTo(80, 3);
    const carlaTitle = added.find(o => o.text === 'Hello Carla');
    expect(carlaTitle?.top).toBeCloseTo(50 + 5 * 3.7795, 3); // row 1
  });

  it('skips records with missing columns and reports unmatched target names', async () => {
    const canvasEngine = await import('../canvasEngine');
    const title = makeText('title', 'Hello {{Name}}', 0, 0);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => [title],
      add: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    const outcome = await applyDataMerge(
      [
        { Name: 'Alice' },
        { Name: 'Bob' },
      ] as Array<Record<string, string>>,
      [
        { column: 'Name', target: 'title' },
        { column: 'Room', target: 'ghost' },
      ],
      { cols: 1, gapXmm: 1, gapYmm: 1 },
    );

    // Room is bound but missing from every record → everything is skipped,
    // the unmatched 'ghost' name is reported, history stays untouched.
    expect(outcome.generated).toBe(0);
    expect(outcome.skipped).toBe(2);
    expect(outcome.missingColumns).toEqual(['Room']);
    expect(outcome.unmatched).toEqual(['ghost']);
    expect(pushHistory).not.toHaveBeenCalled();
  });
});
