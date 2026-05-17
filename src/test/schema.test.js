import { describe, it, expect } from 'vitest';
import { parseImport, migrate, emptyData, dataSchema } from '../lib/schema.js';

describe('migrate', () => {
  it('accepte des données vides', () => {
    const result = migrate({});
    expect(result).toEqual(emptyData());
  });

  it('normalise un import sans modeReglement ni email', () => {
    const partial = {
      bailleur: { nom: 'Bob', adresse: '1 rue', ville: 'Paris', signature: 'B.' },
      locataires: [{ nom: 'Alice', adresse: '2 rue', loyer: 500, charges: 50 }],
    };
    const result = migrate(partial);
    expect(result.version).toBe('1.0');
    expect(result.locataires[0].modeReglement).toBe('');
    expect(result.locataires[0].email).toBe('');
    expect(result.bailleur.nom).toBe('Bob');
  });

  it('préserve modeReglement existant', () => {
    const input = {
      version: '1.0',
      bailleur: { nom: 'X', adresse: 'Y', ville: 'Z', signature: 'W' },
      locataires: [{ nom: 'A', adresse: 'B', loyer: 100, charges: 0, modeReglement: 'virement' }],
    };
    const result = migrate(input);
    expect(result.locataires[0].modeReglement).toBe('virement');
  });

  it('gère un input null sans planter', () => {
    expect(migrate(null)).toEqual(emptyData());
    expect(migrate(undefined)).toEqual(emptyData());
  });
});

describe('parseImport', () => {
  it('coerce les montants string en number', () => {
    const input = {
      bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
      locataires: [{ nom: 'L', adresse: 'X', loyer: '850', charges: '100' }],
    };
    const parsed = parseImport(input);
    expect(parsed.locataires[0].loyer).toBe(850);
    expect(parsed.locataires[0].charges).toBe(100);
  });

  it('rejette un loyer négatif', () => {
    const bad = {
      bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
      locataires: [{ nom: 'L', adresse: 'X', loyer: -10, charges: 0 }],
    };
    expect(() => parseImport(bad)).toThrow();
  });
});

describe('dataSchema', () => {
  it('schéma minimal valide', () => {
    expect(() => dataSchema.parse(emptyData())).not.toThrow();
  });
});
