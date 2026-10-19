import { describe, expect, it } from 'vitest';
import { defaultPrintPrep, prepMarkMarginMm, renderTrimMarksSVG, type PrintPrep } from '../printPrep';

/** Historical generic registration output for a 100 x 80 mm trim box — the
 *  byte-identity pin: new prep fields unset must reproduce this exactly. */
const GENERIC_REGISTRATION_PIN = [
  '<circle cx="50" cy="-7" r="3" stroke="#000" stroke-width="0.25" fill="none" /><circle cx="50" cy="-7" r="1.5" stroke="#000" stroke-width="0.25" fill="none" /><line x1="46" y1="-7" x2="54" y2="-7" stroke="#000" stroke-width="0.25" /><line x1="50" y1="-11" x2="50" y2="-3" stroke="#000" stroke-width="0.25" />',
  '<circle cx="50" cy="87" r="3" stroke="#000" stroke-width="0.25" fill="none" /><circle cx="50" cy="87" r="1.5" stroke="#000" stroke-width="0.25" fill="none" /><line x1="46" y1="87" x2="54" y2="87" stroke="#000" stroke-width="0.25" /><line x1="50" y1="83" x2="50" y2="91" stroke="#000" stroke-width="0.25" />',
  '<circle cx="-7" cy="40" r="3" stroke="#000" stroke-width="0.25" fill="none" /><circle cx="-7" cy="40" r="1.5" stroke="#000" stroke-width="0.25" fill="none" /><line x1="-11" y1="40" x2="-3" y2="40" stroke="#000" stroke-width="0.25" /><line x1="-7" y1="36" x2="-7" y2="44" stroke="#000" stroke-width="0.25" />',
  '<circle cx="107" cy="40" r="3" stroke="#000" stroke-width="0.25" fill="none" /><circle cx="107" cy="40" r="1.5" stroke="#000" stroke-width="0.25" fill="none" /><line x1="103" y1="40" x2="111" y2="40" stroke="#000" stroke-width="0.25" /><line x1="107" y1="36" x2="107" y2="44" stroke="#000" stroke-width="0.25" />',
].join('');

const basePrep: PrintPrep = { bleedMm: 0, cropMarks: false, registrationMarks: false, pageInfo: false };

describe('renderTrimMarksSVG vendor reg-mark styles', () => {
  it('keeps the generic registration output byte-identical when new fields are unset', () => {
    expect(renderTrimMarksSVG(100, 80, { ...basePrep, registrationMarks: true })).toBe(GENERIC_REGISTRATION_PIN);
  });

  it('treats an explicit generic style as the unset default', () => {
    const legacy = renderTrimMarksSVG(210, 297, { ...basePrep, cropMarks: true, registrationMarks: true, pageInfo: true, bleedMm: 3 });
    const explicit = renderTrimMarksSVG(210, 297, {
      ...basePrep, cropMarks: true, registrationMarks: true, pageInfo: true, bleedMm: 3,
      regMarkStyle: 'generic',
    });
    expect(explicit).toBe(legacy);
  });

  it('renders Graphtec ARMS Type-2 brackets: 20mm inward arms, 0.7mm stroke, at the trim corners', () => {
    const svg = renderTrimMarksSVG(100, 80, { ...basePrep, registrationMarks: true, regMarkStyle: 'graphtec-arms' });
    expect(svg).toContain('<line x1="0" y1="0" x2="20" y2="0" stroke="#000" stroke-width="0.7" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="0" y1="0" x2="0" y2="20" stroke="#000" stroke-width="0.7" stroke-linecap="butt" />');
    // Bottom-right arm runs inward: left and up from the corner.
    expect(svg).toContain('<line x1="100" y1="80" x2="80" y2="80" stroke="#000" stroke-width="0.7" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="100" y1="80" x2="100" y2="60" stroke="#000" stroke-width="0.7" stroke-linecap="butt" />');
    // Exactly the 8 L-bracket strokes, no target circles.
    expect(svg.match(/<line /g)).toHaveLength(8);
    expect(svg).not.toContain('<circle');
  });

  it('renders Silhouette L marks: 10mm arms, 0.25mm stroke, 3mm inset', () => {
    const svg = renderTrimMarksSVG(100, 80, { ...basePrep, registrationMarks: true, regMarkStyle: 'silhouette' });
    expect(svg).toContain('<line x1="-3" y1="0" x2="-13" y2="0" stroke="#000" stroke-width="0.25" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="0" y1="-3" x2="0" y2="-13" stroke="#000" stroke-width="0.25" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="103" y1="80" x2="113" y2="80" stroke="#000" stroke-width="0.25" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="100" y1="83" x2="100" y2="93" stroke="#000" stroke-width="0.25" stroke-linecap="butt" />');
    expect(svg.match(/<line /g)).toHaveLength(8);
  });

  it('renders Roland L crop marks: 25mm arms, 0.5mm stroke, at the existing corner positions', () => {
    const svg = renderTrimMarksSVG(100, 80, { ...basePrep, registrationMarks: true, regMarkStyle: 'roland' });
    expect(svg).toContain('<line x1="-3" y1="0" x2="-28" y2="0" stroke="#000" stroke-width="0.5" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="0" y1="-3" x2="0" y2="-28" stroke="#000" stroke-width="0.5" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="100" y1="83" x2="100" y2="108" stroke="#000" stroke-width="0.5" stroke-linecap="butt" />');
    expect(svg.match(/<line /g)).toHaveLength(8);
  });

  it('honours regMarkArmMm / regMarkStrokeMm overrides', () => {
    const svg = renderTrimMarksSVG(100, 80, {
      ...basePrep, registrationMarks: true, regMarkStyle: 'graphtec-arms', regMarkArmMm: 15, regMarkStrokeMm: 0.4,
    });
    expect(svg).toContain('<line x1="0" y1="0" x2="15" y2="0" stroke="#000" stroke-width="0.4" stroke-linecap="butt" />');
    expect(svg).toContain('<line x1="0" y1="0" x2="0" y2="15" stroke="#000" stroke-width="0.4" stroke-linecap="butt" />');
  });

  it('emits a solid 50 x 9 mm scale-check rectangle with its ruler caption', () => {
    const svg = renderTrimMarksSVG(100, 80, { ...basePrep, scaleCheck: true });
    expect(svg).toContain('<rect x="0" y="88" width="50" height="9" fill="#000" />');
    expect(svg).toContain('>50 × 9 mm — verify with a ruler before cutting</text>');
    // With the page-info strip present the block shifts further down.
    const withInfo = renderTrimMarksSVG(100, 80, { ...basePrep, pageInfo: true, scaleCheck: true });
    expect(withInfo).toContain('<rect x="0" y="96" width="50" height="9" fill="#000" />');
    // Unset scaleCheck emits nothing (byte-identity).
    expect(renderTrimMarksSVG(100, 80, basePrep)).not.toContain('<rect');
  });

  it('keeps defaultPrintPrep generic and scale-check off', () => {
    expect(defaultPrintPrep.regMarkStyle).toBe('generic');
    expect(defaultPrintPrep.scaleCheck).toBe(false);
  });
});

describe('prepMarkMarginMm', () => {
  it('keeps the historical 12mm margin for generic prep', () => {
    expect(prepMarkMarginMm({ ...basePrep, registrationMarks: true })).toBe(12);
    expect(prepMarkMarginMm({ ...basePrep, cropMarks: true, registrationMarks: true, pageInfo: true, bleedMm: 3 })).toBe(12);
    expect(prepMarkMarginMm({ ...basePrep, registrationMarks: true, regMarkStyle: 'graphtec-arms' })).toBe(12);
  });

  it('grows the margin to fit long vendor arms (Roland >=15mm feed offset)', () => {
    expect(prepMarkMarginMm({ ...basePrep, registrationMarks: true, regMarkStyle: 'silhouette' })).toBe(14);
    expect(prepMarkMarginMm({ ...basePrep, registrationMarks: true, regMarkStyle: 'roland' })).toBe(29);
  });

  it('grows the margin for the scale-check block', () => {
    expect(prepMarkMarginMm({ ...basePrep, scaleCheck: true })).toBe(25);
    expect(prepMarkMarginMm({ ...basePrep, pageInfo: true, scaleCheck: true })).toBe(33);
  });
});
