import { describe, it, expect } from 'vitest';
import { defaultPeriod, lastDayOfMonth, formatPeriodFR } from '../lib/period.js';

describe('lastDayOfMonth', () => {
  it('30 jours pour avril', () => {
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });
  it('31 jours pour janvier', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
  });
  it('28 jours pour février non bissextile', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
  });
  it('29 jours pour février bissextile', () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29);
  });
});

describe('defaultPeriod', () => {
  it('couvre tout le mois', () => {
    expect(defaultPeriod('06', 2026)).toEqual({
      debut: '2026-06-01',
      fin: '2026-06-30',
    });
  });
  it('gère février bissextile', () => {
    expect(defaultPeriod('02', 2024)).toEqual({
      debut: '2024-02-01',
      fin: '2024-02-29',
    });
  });
  it('gère février non bissextile', () => {
    expect(defaultPeriod('02', 2026)).toEqual({
      debut: '2026-02-01',
      fin: '2026-02-28',
    });
  });
});

describe('formatPeriodFR', () => {
  it('mois complet rendu compact', () => {
    expect(formatPeriodFR('2026-06-01', '2026-06-30')).toBe('du 1er au 30 juin 2026');
  });
  it('utilise « 1er » et non « 1 »', () => {
    expect(formatPeriodFR('2026-01-01', '2026-01-15')).toBe('du 1er au 15 janvier 2026');
  });
  it('inter-mois même année', () => {
    expect(formatPeriodFR('2026-06-15', '2026-07-14')).toBe('du 15 juin au 14 juillet 2026');
  });
  it('inter-année', () => {
    expect(formatPeriodFR('2025-12-15', '2026-01-14')).toBe('du 15 décembre 2025 au 14 janvier 2026');
  });
  it('vide si manquant', () => {
    expect(formatPeriodFR('', '2026-01-30')).toBe('');
  });
});
