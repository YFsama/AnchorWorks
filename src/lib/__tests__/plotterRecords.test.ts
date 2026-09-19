import { describe, it, expect, beforeEach } from 'vitest';
import {
  listMachines, saveMachine, deleteMachine,
  listJobLog, addJobLog, clearJobLog, JOB_LOG_LIMIT,
  type MachineDraft,
} from '../plotterRecords';
import { defaultPlotterOptions } from '../plotter';

function draft(name: string, extra: Partial<MachineDraft> = {}): MachineDraft {
  return {
    name,
    profileId: 'china-clone',
    format: 'hpgl',
    opts: defaultPlotterOptions,
    materialId: 'sign-vinyl',
    baud: 9600,
    flowControl: 'none',
    portPath: 'COM3',
    notes: '',
    ...extra,
  };
}

describe('machine records', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and lists machines, trimming names', () => {
    const rec = saveMachine(draft('  主刻字机  '));
    expect(rec.name).toBe('主刻字机');
    const all = listMachines();
    expect(all).toHaveLength(1);
    expect(all[0].baud).toBe(9600);
    expect(all[0].profileId).toBe('china-clone');
    expect(typeof rec.createdAt).toBe('number');
  });

  it('updates in place, keeping createdAt', () => {
    const rec = saveMachine(draft('Liyu'));
    const updated = saveMachine({ ...draft('Liyu SC-631', { baud: 19200 }), id: rec.id });
    expect(updated.id).toBe(rec.id);
    expect(updated.createdAt).toBe(rec.createdAt);
    expect(listMachines()).toHaveLength(1);
    expect(listMachines()[0].baud).toBe(19200);
  });

  it('deletes machines', () => {
    const rec = saveMachine(draft('temp'));
    deleteMachine(rec.id);
    expect(listMachines()).toHaveLength(0);
    // idempotent
    expect(() => deleteMachine(rec.id)).not.toThrow();
  });

  it('drops corrupt rows instead of crashing', () => {
    window.localStorage.setItem('vector.plotter.machines', JSON.stringify([
      { id: 'x', name: 'ok', format: 'hpgl', opts: defaultPlotterOptions },
      { id: 'y' }, // no name/format → dropped
      'garbage',
    ]));
    const all = listMachines();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('ok');
  });
});

describe('job log', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records entries newest-first', async () => {
    const base = {
      kind: 'job' as const,
      target: 'COM3 @ 9600',
      profileId: 'china-clone',
      format: 'hpgl' as const,
      baud: 9600,
      paths: 12,
      bytes: 4096,
      result: 'ok' as const,
      materialId: 'sign-vinyl',
    };
    addJobLog({ ...base, seconds: 3.2 });
    await new Promise(r => setTimeout(r, 5));
    addJobLog({ ...base, kind: 'test-cut', seconds: 0.4 });
    const log = listJobLog();
    expect(log).toHaveLength(2);
    expect(log[0].kind).toBe('test-cut');
    expect(log[0].bytes).toBe(4096);
    expect(log[1].kind).toBe('job');
    expect(log[0].ts).toBeGreaterThanOrEqual(log[1].ts);
  });

  it('caps history at the limit', () => {
    for (let i = 0; i < JOB_LOG_LIMIT + 10; i++) {
      addJobLog({
        kind: 'job', target: 'COM3', profileId: '', format: 'hpgl',
        baud: 9600, paths: 1, bytes: 10, seconds: 0.1, result: 'ok', materialId: '',
      });
    }
    expect(listJobLog()).toHaveLength(JOB_LOG_LIMIT);
  });

  it('clears and survives corrupt blobs', () => {
    addJobLog({ kind: 'job', target: 'x', profileId: '', format: 'hpgl', baud: 9600, paths: 1, bytes: 1, seconds: 0.1, result: 'ok', materialId: '' });
    clearJobLog();
    expect(listJobLog()).toHaveLength(0);
    window.localStorage.setItem('vector.plotter.joblog', '{{{');
    expect(listJobLog()).toHaveLength(0);
  });
});
