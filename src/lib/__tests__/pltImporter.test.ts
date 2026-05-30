import { describe, it, expect } from 'vitest';
import { parsePlt, polylinesToSvg } from '../pltImporter';
import { generateHPGL, defaultPlotterOptions } from '../plotter';

describe('parsePlt', () => {
  it('detects bare HP-GL dialect when no vendor opcodes appear', () => {
    const text = 'IN;SP1;PU0,0;PD400,0,400,400,0,400,0,0;PU0,0;SP0;';
    const res = parsePlt(text);
    expect(res.dialect).toBe('bare-hpgl');
    expect(res.polylines).toHaveLength(1);
    expect(res.polylines[0].points.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings).toHaveLength(0);
  });

  it('detects Roland CAMM from TB / !PG header', () => {
    const text = 'TB25;11280,7920;CT1;IN;IN;IN;PA;PU100,100;PD200,100,200,200,100,200;PU0,0;!PG;';
    const res = parsePlt(text);
    expect(res.dialect).toBe('roland-camm');
    expect(res.pageSizeMm).toEqual({ w: 11280 / 40, h: 7920 / 40 });
    expect(res.polylines).toHaveLength(1);
  });

  it('detects Graphtec FC from FS/VS speed-force commands', () => {
    const text = 'IN;SP1;FS30;VS20;PA;PU100,100;PD200,100,200,200;PU0,0;SP0;';
    const res = parsePlt(text);
    expect(res.dialect).toBe('graphtec-fc');
  });

  it('treats consecutive PD coords as a single polyline', () => {
    const text = 'IN;PU0,0;PD400,0,400,400,0,400,0,0;';
    const res = parsePlt(text);
    expect(res.polylines).toHaveLength(1);
    expect(res.polylines[0].points.length).toBe(5); // initial PU + 4 PD
  });

  it('breaks polylines on intervening PU', () => {
    const text = 'IN;PU0,0;PD100,100;PU200,200;PD300,300;';
    const res = parsePlt(text);
    expect(res.polylines.length).toBeGreaterThanOrEqual(2);
  });

  it('marks polyline closed when first ≈ last point', () => {
    const text = 'IN;PU0,0;PD400,0,400,400,0,400,0,0;';
    const res = parsePlt(text);
    expect(res.polylines[0].closed).toBe(true);
  });

  it('honours PR relative-mode coordinates', () => {
    // Move 100,100 absolute then draw 50 right, 50 down, 50 left relative.
    const text = 'IN;PA;PU100,100;PR;PD50,0,0,50,-50,0;';
    const res = parsePlt(text);
    expect(res.polylines).toHaveLength(1);
    // 4 points: PU position + 3 relative draws.
    expect(res.polylines[0].points.length).toBe(4);
  });

  it('survives unknown opcodes by warning rather than throwing', () => {
    const text = 'IN;ZZ123;PU0,0;PD100,100;';
    const res = parsePlt(text);
    expect(res.warnings.some(w => w.includes('ZZ'))).toBe(true);
    expect(res.polylines).toHaveLength(1);
  });

  it('skips arc opcodes with a warning rather than mis-rendering', () => {
    const text = 'IN;PU0,0;CI100;PD100,100;';
    const res = parsePlt(text);
    expect(res.warnings.some(w => /CI|arc/i.test(w))).toBe(true);
  });

  it('strips spaces / CR / LF that real cutter files emit between statements', () => {
    const text = 'IN;\r\n  PU0,0;\n   PD100,0,100,100,0,100,0,0;';
    const res = parsePlt(text);
    expect(res.polylines).toHaveLength(1);
    expect(res.polylines[0].points.length).toBe(5);
  });

  it('normalises geometry to canvas origin by default', () => {
    const text = 'IN;PU10000,5000;PD10100,5000,10100,5100,10000,5100,10000,5000;';
    const res = parsePlt(text);
    expect(res.boundsMm.x).toBeCloseTo(0, 1);
    expect(res.boundsMm.y).toBeCloseTo(0, 1);
  });
});

describe('generateHPGL dialects', () => {
  const polys = [{ points: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], closed: true } as { points: Array<[number, number]>; closed: boolean }];

  it('bare dialect emits IN/SP1 header and SP0 footer', () => {
    const out = generateHPGL(polys, { ...defaultPlotterOptions, dialect: 'bare' });
    expect(out).toMatch(/^IN;/);
    expect(out).toMatch(/SP1;/);
    expect(out).toMatch(/SP0;/);
    expect(out).not.toMatch(/TB|!PG|FS|VS/);
  });

  it('roland-camm dialect emits TB / CT1 header and !PG footer', () => {
    const out = generateHPGL(polys, { ...defaultPlotterOptions, dialect: 'roland-camm' });
    expect(out).toMatch(/^TB25;/);
    expect(out).toMatch(/CT1;/);
    expect(out).toMatch(/IN;\nIN;\nIN;/); // triple-init burst
    expect(out).toMatch(/!PG;/);
  });

  it('graphtec-fc dialect emits FS/VS speed-force header', () => {
    const out = generateHPGL(polys, {
      ...defaultPlotterOptions,
      dialect: 'graphtec-fc',
      graphtecForce: 80,
      graphtecSpeed: 15,
    });
    expect(out).toMatch(/FS80;/);
    expect(out).toMatch(/VS15;/);
  });
});

describe('PLT round-trip integrity', () => {
  it('preserves polyline count and bounding box across import → export → import', () => {
    const original = 'TB25;10000,8000;CT1;IN;IN;IN;PA;'
      + 'PU1000,1000;PD2000,1000,2000,2000,1000,2000,1000,1000;'
      + 'PU3000,3000;PD4000,3000,4000,4000,3000,4000,3000,3000;'
      + 'PU0,0;!PG;';

    const r1 = parsePlt(original);
    expect(r1.polylines).toHaveLength(2);

    const out = generateHPGL(r1.polylines, {
      ...defaultPlotterOptions,
      dialect: 'roland-camm',
      paperHeightUnits: r1.pageSizeMm?.h ?? 210,
    });

    const r2 = parsePlt(out);
    expect(r2.dialect).toBe('roland-camm');
    expect(r2.polylines).toHaveLength(2);

    const sumPts = (r: typeof r1) => r.polylines.reduce((a, p) => a + p.points.length, 0);
    expect(sumPts(r2)).toBe(sumPts(r1));

    // Bounds preserved within a coordinate-rounding tolerance.
    expect(r2.boundsMm.w).toBeCloseTo(r1.boundsMm.w, 0);
    expect(r2.boundsMm.h).toBeCloseTo(r1.boundsMm.h, 0);
  });
});

describe('polylinesToSvg', () => {
  it('produces a valid SVG with one path per polyline', () => {
    const svg = polylinesToSvg([
      { points: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true },
      { points: [[20, 20], [30, 30]], closed: false },
    ]);
    expect(svg).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    const pathMatches = svg.match(/<path/g) ?? [];
    expect(pathMatches).toHaveLength(2);
    expect(svg).toMatch(/Z"/); // closed path emits Z
  });

  it('returns an empty SVG (not crash) when given zero polylines', () => {
    const svg = polylinesToSvg([]);
    expect(svg).toMatch(/<svg/);
    expect(svg).not.toMatch(/<path/);
  });
});
