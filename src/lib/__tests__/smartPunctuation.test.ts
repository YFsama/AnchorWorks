import { describe, it, expect } from 'vitest';
import { smartenPunctuation } from '../smartPunctuation';

describe('smartenPunctuation', () => {
  it('curls double quotes by direction', () => {
    expect(smartenPunctuation('He said "hello" today')).toBe('He said “hello” today');
    expect(smartenPunctuation('"Start" of line')).toBe('“Start” of line');
  });

  it('curls single quotes and apostrophes', () => {
    expect(smartenPunctuation("it's 'quoted' text")).toBe('it’s ‘quoted’ text');
    expect(smartenPunctuation("don't")).toBe('don’t');
  });

  it('replaces -- with an em dash', () => {
    expect(smartenPunctuation('a--b')).toBe('a—b');
  });

  it('replaces ... with an ellipsis', () => {
    expect(smartenPunctuation('wait...')).toBe('wait…');
  });

  it('handles a mix and leaves clean text untouched', () => {
    expect(smartenPunctuation('"Wow" -- it works...')).toBe('“Wow” — it works…');
    expect(smartenPunctuation('plain text')).toBe('plain text');
  });

  it('opens a quote after an opening bracket', () => {
    expect(smartenPunctuation('("yes")')).toBe('(“yes”)');
  });
});
