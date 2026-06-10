import { describe, expect, it } from 'vitest';
import { groupObjectsBySolidFill } from '../booleanOps';

describe('groupObjectsBySolidFill', () => {
  it('groups objects by normalized solid fill color', () => {
    const grouped = groupObjectsBySolidFill([
      { fill: '#FF0000', id: 'a' },
      { fill: '#ff0000', id: 'b' },
      { fill: '#00ff00', id: 'c' },
    ]);

    expect([...grouped.keys()]).toEqual(['#ff0000', '#00ff00']);
    expect(grouped.get('#ff0000')?.map(item => item.id)).toEqual(['a', 'b']);
    expect(grouped.get('#00ff00')?.map(item => item.id)).toEqual(['c']);
  });

  it('skips gradient, pattern, empty, and transparent-less non-string fills', () => {
    const grouped = groupObjectsBySolidFill([
      { fill: '' },
      { fill: null },
      { fill: { type: 'linear' } },
      { fill: '#123456' },
    ]);

    expect([...grouped.keys()]).toEqual(['#123456']);
  });
});
