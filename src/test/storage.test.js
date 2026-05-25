import { describe, it, expect } from 'vitest';
import { buildArchivedCopy, cutoffYearsAgo, STORAGE_THRESHOLDS } from '../lib/storage.js';

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
