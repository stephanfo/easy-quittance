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

describe('migrate — historique', () => {
  it('initialise historique=[] si absent (compat v1.0 sans historique)', () => {
    const v10 = {
      version: '1.0',
      bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
      locataires: [],
    };
    expect(migrate(v10).historique).toEqual([]);
  });

  it('emptyData() expose historique=[]', () => {
    expect(emptyData().historique).toEqual([]);
  });

  it('préserve une entrée d\'historique valide', () => {
    const entry = {
      id: 'h_123_abc',
      dateGeneration: '2026-05-17T10:00:00.000Z',
      moisNum: '05',
      annee: '2026',
      bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
      locataire: { nom: 'Alice', email: '', adresse: '2 rue', loyer: 850, charges: 100, modeReglement: 'virement' },
      loyer: 850,
      charges: 100,
      periodeDebut: '2026-05-01',
      periodeFin: '2026-05-31',
      modeReglement: 'virement',
      dateEncaissement: '',
    };
    const result = migrate({ historique: [entry] });
    expect(result.historique).toHaveLength(1);
    expect(result.historique[0]).toMatchObject({
      id: 'h_123_abc',
      moisNum: '05',
      annee: '2026',
    });
    expect(result.historique[0].locataire.nom).toBe('Alice');
  });

  it('normalise une entrée d\'historique incomplète (defaults)', () => {
    const result = migrate({ historique: [{ moisNum: '05', annee: 2026 }] });
    const h = result.historique[0];
    expect(h.id).toMatch(/^h_/);
    expect(h.annee).toBe('2026'); // coercé en string
    expect(h.bailleur).toEqual({ nom: '', adresse: '', ville: '', signature: '' });
    expect(h.locataire.nom).toBe('');
    expect(h.loyer).toBe(0);
    expect(h.charges).toBe(0);
    expect(h.periodeDebut).toBe('');
  });

  it('parseImport accepte un payload sans historique', () => {
    const v10 = {
      bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
      locataires: [{ nom: 'L', adresse: 'X', loyer: 500, charges: 0 }],
    };
    const parsed = parseImport(v10);
    expect(parsed.historique).toEqual([]);
  });

  it('parseImport accepte un payload avec historique', () => {
    const v11 = {
      bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
      locataires: [{ nom: 'L', adresse: 'X', loyer: 500, charges: 0 }],
      historique: [
        {
          id: 'h_1_x',
          dateGeneration: '2026-05-17T10:00:00.000Z',
          moisNum: '05',
          annee: '2026',
          bailleur: { nom: 'B', adresse: 'A', ville: 'V', signature: 'S' },
          locataire: { nom: 'L', adresse: 'X', loyer: 500, charges: 0 },
          loyer: 500,
          charges: 0,
          periodeDebut: '2026-05-01',
          periodeFin: '2026-05-31',
        },
      ],
    };
    const parsed = parseImport(v11);
    expect(parsed.historique).toHaveLength(1);
    expect(parsed.historique[0].id).toBe('h_1_x');
  });
});
