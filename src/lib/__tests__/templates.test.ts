import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../templates';

/**
 * Smoke tests for the static template registry. We DON'T invoke
 * `template.build` here because it touches the real Fabric canvas (which
 * needs initCanvas + a DOM canvas element). Instead we verify the shape
 * of each entry and that the thumbnail is a valid SVG data URI.
 */
describe('TEMPLATES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(TEMPLATES)).toBe(true);
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  it('every template has id / name / description / thumbnail / build', () => {
    for (const t of TEMPLATES) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.thumbnail).toBe('string');
      expect(typeof t.build).toBe('function');
    }
  });

  it('every thumbnail starts with data:image/svg+xml', () => {
    for (const t of TEMPLATES) {
      expect(t.thumbnail.startsWith('data:image/svg+xml')).toBe(true);
    }
  });

  it('every template has a unique id', () => {
    const ids = TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every template has a unique name', () => {
    const names = TEMPLATES.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('build is a function (async-callable signature, not invoked)', () => {
    for (const t of TEMPLATES) {
      // We don't call build here — it requires a real fabric.Canvas.
      expect(typeof t.build).toBe('function');
      // Most exports declare async — but the safer check is "looks like a fn".
      expect(t.build.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes the expected baseline templates', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('business-card');
    expect(ids).toContain('poster-a4');
  });

  it('thumbnail data URI decodes to SVG-looking content', () => {
    for (const t of TEMPLATES) {
      // Strip the prefix and decode.
      const idx = t.thumbnail.indexOf(',');
      expect(idx).toBeGreaterThan(0);
      const decoded = decodeURIComponent(t.thumbnail.slice(idx + 1));
      expect(decoded).toMatch(/<svg/);
      expect(decoded).toMatch(/<\/svg>/);
    }
  });
});
