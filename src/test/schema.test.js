import { describe, it, expect } from 'vitest';
import { parseImport, migrate, emptyData, dataSchema } from '../lib/schema.js';

describe('emptyData', () => {
  it('expose un squelette v2 vide', () => {
    expect(emptyData()).toEqual({
      version: '2.0',
      bailleurs: [],
      biens: [],
      locataires: [],
      historique: [],
    });
  });
});

describe('migrate — normalisation des collections', () => {
  it('accepte un objet vide', () => {
    expect(migrate({})).toEqual(emptyData());
  });

  it('gère un input null/undefined sans planter', () => {
    expect(migrate(null)).toEqual(emptyData());
    expect(migrate(undefined)).toEqual(emptyData());
  });

  it("génère un id si manquant sur bailleur / bien / locataire", () => {
    const result = migrate({
      bailleurs: [{ nom: 'B' }],
      biens: [{ libelle: 'L', adresse: 'A' }],
      locataires: [{ nom: 'N', loyer: 500 }],
    });
    expect(result.bailleurs[0].id).toMatch(/^ba_/);
    expect(result.biens[0].id).toMatch(/^bi_/);
    expect(result.locataires[0].id).toMatch(/^lo_/);
  });

  it('préserve les ids existants', () => {
    const result = migrate({
      bailleurs: [{ id: 'ba_fixed', nom: 'B' }],
      biens: [{ id: 'bi_fixed', bailleurId: 'ba_fixed', libelle: 'L' }],
      locataires: [{ id: 'lo_fixed', bienId: 'bi_fixed', nom: 'N', loyer: 500 }],
    });
    expect(result.bailleurs[0].id).toBe('ba_fixed');
    expect(result.biens[0].id).toBe('bi_fixed');
    expect(result.locataires[0].id).toBe('lo_fixed');
  });

  it("complète les champs manquants avec leurs défauts", () => {
    const result = migrate({
      bailleurs: [{ nom: 'B' }],
      biens: [{ libelle: 'L' }],
      locataires: [{ nom: 'N' }],
    });
    expect(result.bailleurs[0]).toMatchObject({
      nom: 'B', adresse: '', ville: '', signature: '', email: '', telephone: '',
    });
    expect(result.biens[0]).toMatchObject({
      bailleurId: '', libelle: 'L', adresse: '', type: 'autre', reference: '',
    });
    expect(result.locataires[0]).toMatchObject({
      bienId: '', nom: 'N', email: '', loyer: 0, charges: 0,
      modeReglement: '', referenceBail: '', coOccupants: '',
    });
  });
});

describe('migrate — historique', () => {
  it('initialise historique=[] si absent', () => {
    expect(migrate({}).historique).toEqual([]);
  });

  it("préserve un snapshot complet (numeroQuittance, bailleurId, bien, coOccupants)", () => {
    const result = migrate({
      historique: [
        {
          id: 'h_x',
          numeroQuittance: 'Q-202605-001',
          dateGeneration: '2026-05-17T10:00:00Z',
          moisNum: '05',
          annee: '2026',
          bailleurId: 'ba_42',
          bailleur: { nom: 'B' },
          bien: { libelle: 'L', adresse: 'X', type: 'appartement', reference: 'R' },
          locataire: { nom: 'Alice', loyer: 500, charges: 0, coOccupants: 'Bob' },
          loyer: 500, charges: 0,
        },
      ],
    });
    const h = result.historique[0];
    expect(h.id).toBe('h_x');
    expect(h.numeroQuittance).toBe('Q-202605-001');
    expect(h.bailleurId).toBe('ba_42');
    expect(h.bien).toEqual({ libelle: 'L', adresse: 'X', type: 'appartement', reference: 'R' });
    expect(h.locataire.coOccupants).toBe('Bob');
  });

  it('normalise une entrée incomplète avec defaults', () => {
    const result = migrate({
      historique: [{ moisNum: '05', annee: 2026 }],
    });
    const h = result.historique[0];
    expect(h.id).toMatch(/^h_/);
    expect(h.annee).toBe('2026'); // coercé en string
    expect(h.bailleurId).toBe('');
    expect(h.bailleur).toEqual({ nom: '', adresse: '', ville: '', signature: '', email: '', telephone: '' });
    expect(h.bien).toEqual({ libelle: '', adresse: '', type: '', reference: '' });
    expect(h.locataire.coOccupants).toBe('');
    expect(h.dateEmission).toBe(''); // défaut, sera substitué par aujourd'hui au render PDF
  });

  it('préserve dateEmission stockée pour permettre la réédition à l\'identique', () => {
    const result = migrate({
      historique: [
        {
          id: 'h_x',
          dateGeneration: '2026-05-17T10:00:00Z',
          moisNum: '01', annee: '2021',
          bailleur: {}, bien: {}, locataire: { nom: 'X' },
          dateEmission: '2021-01-31',
        },
      ],
    });
    expect(result.historique[0].dateEmission).toBe('2021-01-31');
  });
});

describe('parseImport', () => {
  it('coerce les montants string en number', () => {
    const parsed = parseImport({
      bailleurs: [{ id: 'ba_1', nom: 'B' }],
      biens: [{ id: 'bi_1', bailleurId: 'ba_1', libelle: 'L' }],
      locataires: [{ id: 'lo_1', bienId: 'bi_1', nom: 'N', loyer: '850', charges: '100' }],
    });
    expect(parsed.locataires[0].loyer).toBe(850);
    expect(parsed.locataires[0].charges).toBe(100);
  });

  it('rejette un loyer négatif', () => {
    expect(() =>
      parseImport({
        bailleurs: [{ id: 'ba_1', nom: 'B' }],
        biens: [{ id: 'bi_1', bailleurId: 'ba_1' }],
        locataires: [{ id: 'lo_1', bienId: 'bi_1', nom: 'N', loyer: -10, charges: 0 }],
      }),
    ).toThrow();
  });

  it('accepte un payload v2 complet', () => {
    const v2 = {
      version: '2.0',
      bailleurs: [{ id: 'ba_1', nom: 'B', adresse: 'A', ville: 'V', signature: 'S' }],
      biens: [{ id: 'bi_1', bailleurId: 'ba_1', libelle: 'L', adresse: 'X', type: 'appartement' }],
      locataires: [{ id: 'lo_1', bienId: 'bi_1', nom: 'N', loyer: 500 }],
    };
    const parsed = parseImport(v2);
    expect(parsed.bailleurs[0].id).toBe('ba_1');
    expect(parsed.biens[0].bailleurId).toBe('ba_1');
    expect(parsed.locataires[0].bienId).toBe('bi_1');
  });
});

describe('dataSchema', () => {
  it('schéma minimal valide', () => {
    expect(() => dataSchema.parse(emptyData())).not.toThrow();
  });

  it('accepte une hiérarchie cohérente', () => {
    expect(() =>
      dataSchema.parse({
        version: '2.0',
        bailleurs: [{ id: 'ba_1', nom: 'B' }],
        biens: [{ id: 'bi_1', bailleurId: 'ba_1', libelle: 'L' }],
        locataires: [{ id: 'lo_1', bienId: 'bi_1', nom: 'N', loyer: 500 }],
        historique: [],
      }),
    ).not.toThrow();
  });

  it('rejette un bien qui référence un bailleur inexistant', () => {
    expect(() =>
      dataSchema.parse({
        version: '2.0',
        bailleurs: [{ id: 'ba_1', nom: 'B' }],
        biens: [{ id: 'bi_1', bailleurId: 'ba_fantome', libelle: 'L' }],
        locataires: [],
        historique: [],
      }),
    ).toThrow(/bailleur inexistant/);
  });

  it('rejette un locataire qui référence un bien inexistant', () => {
    expect(() =>
      dataSchema.parse({
        version: '2.0',
        bailleurs: [{ id: 'ba_1', nom: 'B' }],
        biens: [{ id: 'bi_1', bailleurId: 'ba_1', libelle: 'L' }],
        locataires: [{ id: 'lo_1', bienId: 'bi_fantome', nom: 'N', loyer: 500 }],
        historique: [],
      }),
    ).toThrow(/bien inexistant/);
  });

  it("tolère un snapshot historique référencant un bailleur supprimé (archive découplée)", () => {
    expect(() =>
      dataSchema.parse({
        version: '2.0',
        bailleurs: [],
        biens: [],
        locataires: [],
        historique: [
          {
            id: 'h_1',
            numeroQuittance: 'Q-202605-001',
            dateGeneration: '2026-05-17T10:00:00Z',
            moisNum: '05',
            annee: '2026',
            bailleurId: 'ba_disparu',
            bailleur: { nom: 'Ex-bailleur' },
            bien: { libelle: '', adresse: '', type: '', reference: '' },
            locataire: { nom: 'Alice', loyer: 500, charges: 0 },
            loyer: 500,
            charges: 0,
          },
        ],
      }),
    ).not.toThrow();
  });
});
