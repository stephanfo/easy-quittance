import { describe, it, expect } from 'vitest';
import { renderTemplate, AVAILABLE_PLACEHOLDERS } from '../lib/email-template.js';

describe('renderTemplate', () => {
  it('substitue un placeholder simple', () => {
    expect(renderTemplate('Bonjour {locataire}', { locataire: 'Alice' })).toBe('Bonjour Alice');
  });

  it('substitue plusieurs placeholders dans le même texte', () => {
    expect(
      renderTemplate('Quittance {mois} {annee} pour {locataire}', {
        mois: 'mai',
        annee: '2026',
        locataire: 'Alice',
      }),
    ).toBe('Quittance mai 2026 pour Alice');
  });

  it('remplace un placeholder inconnu par chaîne vide', () => {
    expect(renderTemplate('Hello {inconnu}!', {})).toBe('Hello !');
  });

  it('garde un texte sans placeholder tel quel', () => {
    expect(renderTemplate('Pas de variable ici.', { x: 'y' })).toBe('Pas de variable ici.');
  });

  it('préserve les retours à la ligne du template', () => {
    expect(renderTemplate('Ligne 1\nLigne 2 {x}', { x: 'OK' })).toBe('Ligne 1\nLigne 2 OK');
  });

  it('ne fait pas de seconde passe : {a}={b} ne se résout pas vers la valeur de b', () => {
    expect(renderTemplate('{a}', { a: '{b}', b: 'final' })).toBe('{b}');
  });

  it('tolère null / undefined / non-string en entrée', () => {
    expect(renderTemplate(null, {})).toBe('');
    expect(renderTemplate(undefined, {})).toBe('');
    expect(renderTemplate('', { x: 'y' })).toBe('');
  });

  it('substitue une valeur numérique correctement (coerce en string)', () => {
    expect(renderTemplate('{annee}', { annee: 2026 })).toBe('2026');
  });

  it('tolère vars null/undefined sans planter', () => {
    expect(renderTemplate('Hello {x}', null)).toBe('Hello ');
    expect(renderTemplate('Hello {x}', undefined)).toBe('Hello ');
  });

  it("préserve les caractères spéciaux de la valeur (pas d'échappement)", () => {
    expect(renderTemplate('{x}', { x: 'a & b < c > "d"' })).toBe('a & b < c > "d"');
  });
});

describe('AVAILABLE_PLACEHOLDERS', () => {
  it('expose au minimum les 5 placeholders documentés', () => {
    const keys = AVAILABLE_PLACEHOLDERS.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['locataire', 'mois', 'annee', 'bailleur', 'signature']));
  });

  it('chaque placeholder a un libellé non vide', () => {
    for (const p of AVAILABLE_PLACEHOLDERS) {
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});
