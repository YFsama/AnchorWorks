import { describe, it, expect } from 'vitest';
import { applyCase, titleCase, sentenceCase } from '../textCase';

describe('applyCase', () => {
  it('upper / lower are straightforward', () => {
    expect(applyCase('Hello World', 'upper')).toBe('HELLO WORLD');
    expect(applyCase('Hello World', 'lower')).toBe('hello world');
  });

  it('title case capitalises each word', () => {
    expect(titleCase('the quick brown fox')).toBe('The Quick Brown Fox');
    expect(applyCase('hELLO there', 'title')).toBe('Hello There');
  });

  it('sentence case capitalises after . ! ? and at the start', () => {
    expect(sentenceCase('hello world. how are you? fine! thanks'))
      .toBe('Hello world. How are you? Fine! Thanks');
    expect(applyCase('  leading space', 'sentence')).toBe('  Leading space');
  });
});
