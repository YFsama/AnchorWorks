import { describe, it, expect } from 'vitest';
import { MACHINE_PROFILES, getMachineProfile, profileConnectInit, profileForceSpeed } from '../machineProfiles';

describe('MACHINE_PROFILES', () => {
  it('has unique ids and valid dialect / baud / flow fields', () => {
    const ids = new Set<string>();
    for (const p of MACHINE_PROFILES) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(['bare', 'roland-camm', 'graphtec-fc']).toContain(p.dialect);
      expect(p.baud).toBeGreaterThanOrEqual(1200);
      expect(p.baud).toBeLessThanOrEqual(250000);
      expect(['none', 'hardware', 'software']).toContain(p.flowControl);
      expect(p.brand.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.quirks.length).toBeGreaterThan(0);
    }
    expect(MACHINE_PROFILES.length).toBeGreaterThanOrEqual(8);
  });

  it('covers the major real-world families', () => {
    const ids = new Set(MACHINE_PROFILES.map(p => p.id));
    for (const id of ['roland-camm1', 'graphtec-ce', 'graphtec-fc', 'china-clone', 'mimaki-cg', 'summa', 'gcc']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('the China-clone profile targets the 文泰/Artcut reality', () => {
    const clone = getMachineProfile('china-clone')!;
    expect(clone.dialect).toBe('roland-camm');
    expect(clone.baud).toBe(9600);
    expect(clone.flowControl).toBe('none');
    expect(clone.statusQueries).toBe(false);
  });

  it('Roland profiles eject with !PG and carry force/speed commands', () => {
    const roland = getMachineProfile('roland-camm1')!;
    expect(roland.eject).toBe('!PG;');
    expect(roland.forceCommand?.(50)).toBe('FS50;');
    expect(roland.speedCommand?.(30)).toBe('VS30;');
    expect(roland.panelOnly).toBe(false);
  });

  it('panel-only machines expose no force/speed commands', () => {
    const mimaki = getMachineProfile('mimaki-cg')!;
    expect(mimaki.panelOnly).toBe(true);
    expect(mimaki.forceCommand).toBeUndefined();
    expect(mimaki.speedCommand).toBeUndefined();
  });

  it('unknown ids resolve to null', () => {
    expect(getMachineProfile('')).toBeNull();
    expect(getMachineProfile('silhouette-cameo-42')).toBeNull();
  });
});

describe('profile command builders', () => {
  it('builds profile-aware force/speed statements', () => {
    const roland = getMachineProfile('roland-camm1')!;
    expect(profileForceSpeed(roland, 50, 30)).toBe('FS50;VS30;');
    // panel-only machines have nothing to send
    const mimaki = getMachineProfile('mimaki-cg')!;
    expect(profileForceSpeed(mimaki, 50, 30)).toBe('');
    // no profile selected → the generic FS/VS pair
    expect(profileForceSpeed(null, 50, 30)).toBe('FS50;VS30;');
  });

  it('builds post-connect init statements', () => {
    const roland = getMachineProfile('roland-camm1')!;
    expect(profileConnectInit(roland, 50, 30)).toBe('IN;PA;FS50;VS30;');
    const generic = getMachineProfile('generic-hpgl')!;
    expect(profileConnectInit(generic, 0, 0)).toBe('IN;');
    expect(profileConnectInit(null, 0, 0)).toBe('');
  });
});

describe('Graphtec ARMS + blade-offset guidance', () => {
  it('graphtec-ce and graphtec-fc carry the ARMS mark specs and blade-offset tip', () => {
    for (const id of ['graphtec-ce', 'graphtec-fc']) {
      const p = getMachineProfile(id)!;
      const notes = p.quirks.join(' ');
      expect(notes).toMatch(/ARMS mark-reading supported/);
      expect(notes).toMatch(/Type 1 circle \/ Type 2 square/);
      expect(notes).toMatch(/arm length 4-20 mm/);
      expect(notes).toMatch(/at least 50 mm from the sheet edges/);
      expect(notes).toMatch(/at least 60x60 mm/);
      expect(notes).toMatch(/0\.25 mm is typical for a 45° blade/);
    }
  });
});
