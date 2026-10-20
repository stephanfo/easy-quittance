import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildArchivedCopy,
  cutoffYearsAgo,
  STORAGE_THRESHOLDS,
  backupStatus,
  loadLastExport,
  saveLastExport,
  loadLastChange,
  saveLastChange,
  loadWelcomeSeen,
  saveWelcomeSeen,
} from '../lib/storage.js';

describe('cutoffYearsAgo', () => {
  it('retourne une date ISO N années avant le pivot fourni', () => {
    const today = new Date('2026-05-24T00:00:00Z');
    expect(cutoffYearsAgo(2, today)).toBe('2024-05-24');
    expect(cutoffYearsAgo(0, today)).toBe('2026-05-24');
    expect(cutoffYearsAgo(5, today)).toBe('2021-05-24');
  });
});

describe('buildArchivedCopy', () => {
  const data = {
    bailleurs: [{ id: 'ba_1' }],
    biens: [],
    locataires: [],
    historique: [
      { id: 'h_old', dateGeneration: '2020-01-15T10:00:00Z' },
      { id: 'h_mid', dateGeneration: '2024-06-10T10:00:00Z' },
      { id: 'h_new', dateGeneration: '2026-05-24T10:00:00Z' },
    ],
  };

  it('filtre les entrées strictement antérieures au cutoff', () => {
    const r = buildArchivedCopy(data, '2024-01-01');
    expect(r.historique.map((h) => h.id)).toEqual(['h_mid', 'h_new']);
  });

  it('garde tout si cutoff très ancien', () => {
    const r = buildArchivedCopy(data, '2000-01-01');
    expect(r.historique).toHaveLength(3);
  });

  it('purge tout si cutoff futur', () => {
    const r = buildArchivedCopy(data, '2099-01-01');
    expect(r.historique).toHaveLength(0);
  });

  it('préserve les autres collections (bailleurs/biens/locataires)', () => {
    const r = buildArchivedCopy(data, '2024-01-01');
    expect(r.bailleurs).toEqual(data.bailleurs);
    expect(r.biens).toEqual(data.biens);
    expect(r.locataires).toEqual(data.locataires);
  });

  it('ne mute pas l’entrée', () => {
    const before = JSON.stringify(data);
    buildArchivedCopy(data, '2024-01-01');
    expect(JSON.stringify(data)).toBe(before);
  });

  it("tolère un data null sans planter", () => {
    expect(buildArchivedCopy(null, '2024-01-01')).toBe(null);
  });

  it("tolère un historique manquant", () => {
    const r = buildArchivedCopy({ bailleurs: [] }, '2024-01-01');
    expect(r.bailleurs).toEqual([]);
  });
});

describe('STORAGE_THRESHOLDS', () => {
  it('expose les ratios cohérents', () => {
    expect(STORAGE_THRESHOLDS.quotaBytes).toBe(5 * 1024 * 1024);
    expect(STORAGE_THRESHOLDS.warningRatio).toBeLessThan(STORAGE_THRESHOLDS.criticalRatio);
    expect(STORAGE_THRESHOLDS.criticalRatio).toBeLessThanOrEqual(1);
  });
});

describe('backupStatus', () => {
  const today = new Date('2026-10-04T12:00:00Z');

  it('jamais exporté + données → pending, daysSince null', () => {
    expect(backupStatus({ lastExport: '', lastChange: '2026-10-01T08:00:00Z', hasData: true, today })).toEqual({
      daysSince: null,
      pending: true,
    });
  });

  it('aucune donnée → jamais pending', () => {
    expect(backupStatus({ lastExport: '', lastChange: '2026-10-01T08:00:00Z', hasData: false, today }).pending).toBe(false);
  });

  it('modifié après le dernier export → pending', () => {
    expect(
      backupStatus({ lastExport: '2026-09-30T08:00:00Z', lastChange: '2026-10-02T09:00:00Z', hasData: true, today }),
    ).toEqual({ daysSince: 4, pending: true });
  });

  it('exporté après la dernière modification → pas pending, quel que soit l’âge de l’export', () => {
    expect(
      backupStatus({ lastExport: '2026-09-30T08:00:00Z', lastChange: '2026-09-30T07:59:00Z', hasData: true, today }),
    ).toEqual({ daysSince: 4, pending: false });
    expect(
      backupStatus({ lastExport: '2025-01-01T08:00:00Z', lastChange: '2024-12-31T08:00:00Z', hasData: true, today }).pending,
    ).toBe(false);
  });

  it('modification à la même milliseconde que l’export → pas pending', () => {
    const t = '2026-10-04T10:00:00.000Z';
    expect(backupStatus({ lastExport: t, lastChange: t, hasData: true, today }).pending).toBe(false);
  });

  it('date de modification inconnue (données antérieures au suivi) → pending', () => {
    expect(backupStatus({ lastExport: '2026-09-30T08:00:00Z', lastChange: '', hasData: true, today }).pending).toBe(true);
    expect(backupStatus({ lastExport: '2026-09-30T08:00:00Z', lastChange: 'n/a', hasData: true, today }).pending).toBe(true);
  });

  it('date d’export invalide → traitée comme jamais exporté', () => {
    expect(backupStatus({ lastExport: 'n/a', lastChange: '2026-10-01T08:00:00Z', hasData: true, today })).toEqual({
      daysSince: null,
      pending: true,
    });
  });

  it('date d’export future → daysSince 0', () => {
    expect(backupStatus({ lastExport: '2027-01-01', lastChange: '2026-10-01', hasData: true, today })).toEqual({
      daysSince: 0,
      pending: false,
    });
  });
});

describe('dates de sauvegarde et écran d’accueil (localStorage)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('valeurs par défaut quand rien n’est mémorisé', () => {
    expect(loadLastExport()).toBe('');
    expect(loadLastChange()).toBe('');
    expect(loadWelcomeSeen()).toBe(false);
  });

  it('mémorise dernier export, dernière modification et écran d’accueil vu', () => {
    saveLastExport('2026-10-04T10:00:00.000Z');
    saveLastChange('2026-10-04T11:00:00.000Z');
    saveWelcomeSeen();
    expect(loadLastExport()).toBe('2026-10-04T10:00:00.000Z');
    expect(loadLastChange()).toBe('2026-10-04T11:00:00.000Z');
    expect(loadWelcomeSeen()).toBe(true);
  });

  it('les clés restent hors de quittances_data (absentes du JSON exporté)', () => {
    saveLastExport('x');
    saveLastChange('y');
    saveWelcomeSeen();
    expect(store.has('quittances_data')).toBe(false);
    expect([...store.keys()].sort()).toEqual(['quittance_last_change', 'quittance_last_export', 'quittance_welcome_seen']);
  });

  it('localStorage indisponible → lectures neutres, écritures silencieuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(loadLastChange()).toBe('');
    expect(loadWelcomeSeen()).toBe(false);
    expect(() => saveLastChange('2026-10-04')).not.toThrow();
    expect(() => saveWelcomeSeen()).not.toThrow();
  });
});
