import { describe, it, expect } from 'vitest';
import {
  buildHistoriqueEntry,
  findDoublons,
  filterAndSort,
  listeFiltreLocataires,
  listeFiltreAnnees,
  generateHistoriqueId,
} from '../lib/historique.js';

const bailleur = { nom: 'Bob', adresse: '1 rue', ville: 'Paris', signature: 'B.' };
const locataire = {
  nom: 'Alice',
  email: 'a@b.fr',
  adresse: '2 rue',
  loyer: 850,
  charges: 100,
  modeReglement: 'virement',
};

const baseArgs = {
  bailleur,
  locataire,
  moisNum: '05',
  annee: '2026',
  loyer: 850,
  charges: 100,
  periodeDebut: '2026-05-01',
  periodeFin: '2026-05-31',
  modeReglement: 'virement',
  dateEncaissement: '',
};

describe('generateHistoriqueId', () => {
  it('génère un id préfixé "h_" et unique', () => {
    const a = generateHistoriqueId();
    const b = generateHistoriqueId();
    expect(a).toMatch(/^h_\d+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe('buildHistoriqueEntry', () => {
  it('produit une entrée complète avec id et dateGeneration ISO', () => {
    const entry = buildHistoriqueEntry(baseArgs);
    expect(entry.id).toMatch(/^h_/);
    expect(() => new Date(entry.dateGeneration).toISOString()).not.toThrow();
    expect(entry.moisNum).toBe('05');
    expect(entry.annee).toBe('2026');
    expect(entry.loyer).toBe(850);
    expect(entry.charges).toBe(100);
    expect(entry.modeReglement).toBe('virement');
  });

  it('snapshote bailleur et locataire (mutation post-build sans effet)', () => {
    const localBailleur = { ...bailleur };
    const localLocataire = { ...locataire };
    const entry = buildHistoriqueEntry({
      ...baseArgs,
      bailleur: localBailleur,
      locataire: localLocataire,
    });
    localBailleur.nom = 'AUTRE';
    localLocataire.nom = 'AUTRE';
    expect(entry.bailleur.nom).toBe('Bob');
    expect(entry.locataire.nom).toBe('Alice');
  });

  it('coerce les montants et tolère locataire/bailleur partiels', () => {
    const entry = buildHistoriqueEntry({
      ...baseArgs,
      bailleur: {},
      locataire: { nom: 'X', adresse: '', loyer: '500', charges: '50' },
      loyer: '500',
      charges: '50',
    });
    expect(entry.loyer).toBe(500);
    expect(entry.charges).toBe(50);
    expect(entry.locataire.loyer).toBe(500);
    expect(entry.bailleur.nom).toBe('');
  });

  it('convertit moisNum et annee en string', () => {
    const entry = buildHistoriqueEntry({ ...baseArgs, moisNum: 5, annee: 2026 });
    expect(entry.moisNum).toBe('5');
    expect(entry.annee).toBe('2026');
  });
});

describe('findDoublons', () => {
  const historique = [
    buildHistoriqueEntry({ ...baseArgs, moisNum: '05', annee: '2026' }),
    buildHistoriqueEntry({ ...baseArgs, moisNum: '06', annee: '2026' }),
    buildHistoriqueEntry({
      ...baseArgs,
      locataire: { ...locataire, nom: 'Charles' },
      moisNum: '05',
      annee: '2026',
    }),
  ];

  it('trouve les doublons sur (nom, moisNum, annee)', () => {
    const found = findDoublons(historique, 'Alice', '05', '2026');
    expect(found).toHaveLength(1);
    expect(found[0].locataire.nom).toBe('Alice');
  });

  it('retourne [] si aucun match', () => {
    expect(findDoublons(historique, 'Alice', '12', '2026')).toEqual([]);
    expect(findDoublons(historique, 'Inconnu', '05', '2026')).toEqual([]);
  });

  it('coerce annee numérique en string pour la comparaison', () => {
    // Cas d'usage : l'app stocke `annee` en string ('2026') ;
    // si l'appelant passe un nombre, on doit toujours matcher.
    const found = findDoublons(historique, 'Alice', '05', 2026);
    expect(found).toHaveLength(1);
  });

  it('tolère historique non array', () => {
    expect(findDoublons(null, 'A', '05', '2026')).toEqual([]);
    expect(findDoublons(undefined, 'A', '05', '2026')).toEqual([]);
  });
});

describe('filterAndSort', () => {
  const h1 = { ...buildHistoriqueEntry(baseArgs), dateGeneration: '2026-01-15T10:00:00Z' };
  const h2 = {
    ...buildHistoriqueEntry({ ...baseArgs, annee: '2025' }),
    dateGeneration: '2025-06-15T10:00:00Z',
  };
  const h3 = {
    ...buildHistoriqueEntry({ ...baseArgs, locataire: { ...locataire, nom: 'Charles' } }),
    dateGeneration: '2026-03-15T10:00:00Z',
  };
  const historique = [h1, h2, h3];

  it('trie par dateGeneration desc par défaut', () => {
    const sorted = filterAndSort(historique);
    expect(sorted.map((h) => h.dateGeneration)).toEqual([
      '2026-03-15T10:00:00Z',
      '2026-01-15T10:00:00Z',
      '2025-06-15T10:00:00Z',
    ]);
  });

  it('filtre par locataireNom', () => {
    const sorted = filterAndSort(historique, { locataireNom: 'Alice' });
    expect(sorted).toHaveLength(2);
    expect(sorted.every((h) => h.locataire.nom === 'Alice')).toBe(true);
  });

  it('filtre par annee', () => {
    const sorted = filterAndSort(historique, { annee: '2025' });
    expect(sorted).toHaveLength(1);
    expect(sorted[0].annee).toBe('2025');
  });

  it('combine les deux filtres', () => {
    const sorted = filterAndSort(historique, { locataireNom: 'Alice', annee: '2026' });
    expect(sorted).toHaveLength(1);
    expect(sorted[0].locataire.nom).toBe('Alice');
    expect(sorted[0].annee).toBe('2026');
  });

  it('ne mute pas le tableau source', () => {
    const before = historique.map((h) => h.id);
    filterAndSort(historique);
    expect(historique.map((h) => h.id)).toEqual(before);
  });

  it('tolère un historique non array', () => {
    expect(filterAndSort(null)).toEqual([]);
    expect(filterAndSort(undefined)).toEqual([]);
  });
});

describe('listeFiltreLocataires', () => {
  it('retourne les noms uniques triés alphabétiquement', () => {
    const historique = [
      buildHistoriqueEntry({ ...baseArgs, locataire: { ...locataire, nom: 'Charles' } }),
      buildHistoriqueEntry(baseArgs),
      buildHistoriqueEntry({ ...baseArgs, locataire: { ...locataire, nom: 'Bernard' } }),
      buildHistoriqueEntry(baseArgs),
    ];
    expect(listeFiltreLocataires(historique)).toEqual(['Alice', 'Bernard', 'Charles']);
  });

  it('ignore les noms vides', () => {
    const historique = [buildHistoriqueEntry({ ...baseArgs, locataire: {} })];
    expect(listeFiltreLocataires(historique)).toEqual([]);
  });

  it('tolère un historique non array', () => {
    expect(listeFiltreLocataires(null)).toEqual([]);
  });
});

describe('listeFiltreAnnees', () => {
  it('retourne les années uniques triées desc', () => {
    const historique = [
      buildHistoriqueEntry({ ...baseArgs, annee: '2025' }),
      buildHistoriqueEntry({ ...baseArgs, annee: '2026' }),
      buildHistoriqueEntry({ ...baseArgs, annee: '2024' }),
      buildHistoriqueEntry({ ...baseArgs, annee: '2026' }),
    ];
    expect(listeFiltreAnnees(historique)).toEqual(['2026', '2025', '2024']);
  });

  it('tolère un historique non array', () => {
    expect(listeFiltreAnnees(null)).toEqual([]);
  });
});
