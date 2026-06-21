import { describe, it, expect } from 'vitest';
import { formatMontant, formatDateFR, moisTexte, moisNom, moisCapitalise } from '../lib/format.js';

describe('formatMontant', () => {
  it('formate un nombre en FR avec virgule décimale', () => {
    expect(formatMontant(1234.5)).toBe('1234,50');
    expect(formatMontant(0)).toBe('0,00');
    expect(formatMontant(99.999)).toBe('100,00');
  });

  it("accepte une chaîne qui représente un nombre", () => {
    expect(formatMontant('123.45')).toBe('123,45');
  });

  it('retourne "0,00" pour NaN, undefined, null, Infinity (défensif)', () => {
    expect(formatMontant(NaN)).toBe('0,00');
    expect(formatMontant(undefined)).toBe('0,00');
    expect(formatMontant(null)).toBe('0,00');
    expect(formatMontant(Infinity)).toBe('0,00');
    expect(formatMontant('abc')).toBe('0,00');
  });
});

describe('formatDateFR', () => {
  it('convertit YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(formatDateFR('2025-05-25')).toBe('25/05/2025');
    expect(formatDateFR('2025-01-01')).toBe('01/01/2025');
  });

  it('retourne "" pour chaîne vide ou null', () => {
    expect(formatDateFR('')).toBe('');
    expect(formatDateFR(null)).toBe('');
    expect(formatDateFR(undefined)).toBe('');
  });

  it('retourne "" pour format invalide (défensif)', () => {
    expect(formatDateFR('abc')).toBe('');
    expect(formatDateFR('2025/05/25')).toBe('');
    expect(formatDateFR('25-05-2025')).toBe('');
    expect(formatDateFR('2025-5-25')).toBe(''); // mois sans padding
  });
});

describe('moisNom', () => {
  it('retourne le nom du mois en minuscules', () => {
    expect(moisNom('01')).toBe('janvier');
    expect(moisNom('12')).toBe('décembre');
  });

  it('accepte un numéro entier', () => {
    expect(moisNom(5)).toBe('mai');
  });

  it('retourne "" pour un mois invalide', () => {
    expect(moisNom('13')).toBe('');
    expect(moisNom('0')).toBe('');
  });
});

describe('moisTexte', () => {
  it('combine mois capitalisé + année', () => {
    expect(moisTexte('05', '2025')).toBe('Mai 2025');
    expect(moisTexte('01', '2024')).toBe('Janvier 2024');
  });

  it('retourne "" si mois invalide', () => {
    expect(moisTexte('99', '2025')).toBe('');
  });
});

describe('moisCapitalise', () => {
  it('retourne le mois capitalisé sans année', () => {
    expect(moisCapitalise('06')).toBe('Juin');
    expect(moisCapitalise('01')).toBe('Janvier');
    expect(moisCapitalise(12)).toBe('Décembre');
  });

  it('retourne "" si mois invalide', () => {
    expect(moisCapitalise('99')).toBe('');
    expect(moisCapitalise('')).toBe('');
  });
});
