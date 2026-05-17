import { describe, it, expect } from 'vitest';
import { nombreEnLettres } from '../lib/nombre-en-lettres.js';

describe('nombreEnLettres', () => {
  it('gère zéro', () => {
    expect(nombreEnLettres(0)).toBe('zéro euro');
  });

  it('singulier euro', () => {
    expect(nombreEnLettres(1)).toBe('un euro');
  });

  it('pluriel euros', () => {
    expect(nombreEnLettres(2)).toBe('deux euros');
  });

  it('soixante-dix sans tiret bizarre', () => {
    expect(nombreEnLettres(70)).toBe('soixante-dix euros');
    expect(nombreEnLettres(71)).toBe('soixante-onze euros');
    expect(nombreEnLettres(79)).toBe('soixante-dix-neuf euros');
  });

  it('quatre-vingts avec s sans unité', () => {
    expect(nombreEnLettres(80)).toBe('quatre-vingts euros');
  });

  it('quatre-vingt sans s avec unité', () => {
    expect(nombreEnLettres(81)).toBe('quatre-vingt-un euros');
    expect(nombreEnLettres(99)).toBe('quatre-vingt-dix-neuf euros');
  });

  it('cents pluriel', () => {
    expect(nombreEnLettres(200)).toBe('deux cents euros');
    expect(nombreEnLettres(300)).toBe('trois cents euros');
  });

  it('cent invariable suivi d\'autre chose', () => {
    expect(nombreEnLettres(201)).toBe('deux cent un euros');
    expect(nombreEnLettres(250)).toBe('deux cent cinquante euros');
  });

  it('cent singulier', () => {
    expect(nombreEnLettres(100)).toBe('cent euros');
    expect(nombreEnLettres(101)).toBe('cent un euros');
  });

  it('mille singulier sans s', () => {
    expect(nombreEnLettres(1000)).toBe('mille euros');
    expect(nombreEnLettres(2000)).toBe('deux mille euros');
  });

  it('et un pour 21, 31...', () => {
    expect(nombreEnLettres(21)).toBe('vingt et un euros');
    expect(nombreEnLettres(31)).toBe('trente et un euros');
  });

  it('gère les centimes', () => {
    expect(nombreEnLettres(1.5)).toBe('un euro et cinquante centimes');
    expect(nombreEnLettres(2.01)).toBe('deux euros et un centime');
    expect(nombreEnLettres(0.99)).toBe('zéro euro et quatre-vingt-dix-neuf centimes');
  });

  it('montant réaliste de quittance', () => {
    expect(nombreEnLettres(950)).toBe('neuf cent cinquante euros');
    expect(nombreEnLettres(1250.5)).toBe('mille deux cent cinquante euros et cinquante centimes');
  });
});
