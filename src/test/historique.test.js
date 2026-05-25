import { describe, it, expect } from 'vitest';
import {
  buildHistoriqueEntry,
  buildHistoriqueRecuEntry,
  findDoublons,
  findDoublonsRecu,
  filterAndSort,
  listeFiltreLocataires,
  listeFiltreAnnees,
  listeFiltreBiens,
  generateHistoriqueId,
  nextNumeroQuittance,
  nextNumeroRecu,
  resolveBailleurForRender,
} from '../lib/historique.js';

const bailleur = { id: 'ba_1', nom: 'Bob', adresse: '1 rue', ville: 'Paris', signature: 'B.' };
const bien = { id: 'bi_1', bailleurId: 'ba_1', libelle: 'Appart Paris', adresse: '2 rue', type: 'appartement', reference: '' };
const locataire = {
  id: 'lo_1',
  bienId: 'bi_1',
  nom: 'Alice',
  email: 'a@b.fr',
  loyer: 850,
  charges: 100,
  modeReglement: 'virement',
  coOccupants: '',
};

const baseArgs = {
  bailleur,
  bien,
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
  it('produit une entrée complète avec id, dateGeneration ISO et bailleurId', () => {
    const entry = buildHistoriqueEntry(baseArgs);
    expect(entry.id).toMatch(/^h_/);
    expect(() => new Date(entry.dateGeneration).toISOString()).not.toThrow();
    expect(entry.moisNum).toBe('05');
    expect(entry.annee).toBe('2026');
    expect(entry.bailleurId).toBe('ba_1');
    expect(entry.loyer).toBe(850);
    expect(entry.charges).toBe(100);
  });

  it('snapshote bailleur, bien et locataire (mutation post-build sans effet)', () => {
    const localBailleur = { ...bailleur };
    const localBien = { ...bien };
    const localLocataire = { ...locataire };
    const entry = buildHistoriqueEntry({
      ...baseArgs,
      bailleur: localBailleur,
      bien: localBien,
      locataire: localLocataire,
    });
    localBailleur.nom = 'AUTRE';
    localBien.libelle = 'AUTRE';
    localLocataire.nom = 'AUTRE';
    expect(entry.bailleur.nom).toBe('Bob');
    expect(entry.bien.libelle).toBe('Appart Paris');
    expect(entry.locataire.nom).toBe('Alice');
  });

  it('snapshote coOccupants sur le locataire', () => {
    const entry = buildHistoriqueEntry({
      ...baseArgs,
      locataire: { ...locataire, coOccupants: 'Marie\nPaul' },
    });
    expect(entry.locataire.coOccupants).toBe('Marie\nPaul');
  });

  it('tolère bailleur/bien/locataire partiels', () => {
    const entry = buildHistoriqueEntry({
      ...baseArgs,
      bailleur: {},
      bien: {},
      locataire: { nom: 'X', loyer: '500', charges: '50' },
      loyer: '500',
      charges: '50',
    });
    expect(entry.loyer).toBe(500);
    expect(entry.charges).toBe(50);
    expect(entry.locataire.loyer).toBe(500);
    expect(entry.bailleur.nom).toBe('');
    expect(entry.bien.libelle).toBe('');
    expect(entry.bailleurId).toBe('');
  });

  it('tolère bien complètement absent (undefined)', () => {
    const entry = buildHistoriqueEntry({ ...baseArgs, bien: undefined });
    expect(entry.bien).toEqual({ libelle: '', adresse: '', type: '', reference: '' });
  });

  it('stocke dateEmission au format ISO si fournie', () => {
    const entry = buildHistoriqueEntry({ ...baseArgs, dateEmission: '2021-01-31' });
    expect(entry.dateEmission).toBe('2021-01-31');
  });

  it("dateEmission par défaut = '' (le PDF retombera sur aujourd'hui)", () => {
    const entry = buildHistoriqueEntry(baseArgs);
    expect(entry.dateEmission).toBe('');
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

  it('trouve les doublons sur (bailleurId, nom, moisNum, annee)', () => {
    const found = findDoublons(historique, 'ba_1', 'Alice', '05', '2026');
    expect(found).toHaveLength(1);
    expect(found[0].locataire.nom).toBe('Alice');
  });

  it('retourne [] si aucun match', () => {
    expect(findDoublons(historique, 'ba_1', 'Alice', '12', '2026')).toEqual([]);
    expect(findDoublons(historique, 'ba_1', 'Inconnu', '05', '2026')).toEqual([]);
  });

  it('coerce annee numérique en string pour la comparaison', () => {
    const found = findDoublons(historique, 'ba_1', 'Alice', '05', 2026);
    expect(found).toHaveLength(1);
  });

  it("ne croise pas les bailleurs (homonyme entre deux SCI)", () => {
    // Deux bailleurs ont chacun un locataire « Alice Dupont » pour le même mois ;
    // le doublon ne doit pas s'étendre d'un bailleur à l'autre.
    const h = [
      buildHistoriqueEntry({ ...baseArgs, bailleur: { ...bailleur, id: 'ba_1' } }),
      buildHistoriqueEntry({ ...baseArgs, bailleur: { ...bailleur, id: 'ba_2' } }),
    ];
    expect(findDoublons(h, 'ba_1', 'Alice', '05', '2026')).toHaveLength(1);
    expect(findDoublons(h, 'ba_2', 'Alice', '05', '2026')).toHaveLength(1);
    expect(findDoublons(h, 'ba_inconnu', 'Alice', '05', '2026')).toHaveLength(0);
  });

  it('tolère historique non array', () => {
    expect(findDoublons(null, 'ba_1', 'A', '05', '2026')).toEqual([]);
    expect(findDoublons(undefined, 'ba_1', 'A', '05', '2026')).toEqual([]);
  });
});

describe('filterAndSort', () => {
  const h1 = { ...buildHistoriqueEntry(baseArgs), dateGeneration: '2026-01-15T10:00:00Z' };
  const h2 = {
    ...buildHistoriqueEntry({ ...baseArgs, annee: '2025' }),
    dateGeneration: '2025-06-15T10:00:00Z',
  };
  const h3 = {
    ...buildHistoriqueEntry({
      ...baseArgs,
      locataire: { ...locataire, nom: 'Charles' },
      bailleur: { ...bailleur, id: 'ba_2', nom: 'Bailleur 2' },
      bien: { ...bien, libelle: 'Studio Lyon' },
    }),
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

  it('filtre par bailleurId', () => {
    const sorted = filterAndSort(historique, { bailleurId: 'ba_2' });
    expect(sorted).toHaveLength(1);
    expect(sorted[0].locataire.nom).toBe('Charles');
  });

  it('filtre par bienLibelle', () => {
    const sorted = filterAndSort(historique, { bienLibelle: 'Studio Lyon' });
    expect(sorted).toHaveLength(1);
    expect(sorted[0].bien.libelle).toBe('Studio Lyon');
  });

  it('combine les filtres', () => {
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

describe('listeFiltreBiens', () => {
  it('retourne les libellés de bien uniques triés', () => {
    const historique = [
      buildHistoriqueEntry({ ...baseArgs, bien: { ...bien, libelle: 'Studio Lyon' } }),
      buildHistoriqueEntry(baseArgs),
      buildHistoriqueEntry({ ...baseArgs, bien: { ...bien, libelle: 'Appart Paris' } }),
    ];
    expect(listeFiltreBiens(historique)).toEqual(['Appart Paris', 'Studio Lyon']);
  });

  it('ignore les libellés vides', () => {
    const historique = [buildHistoriqueEntry({ ...baseArgs, bien: {} })];
    expect(listeFiltreBiens(historique)).toEqual([]);
  });

  it('tolère un historique non array', () => {
    expect(listeFiltreBiens(null)).toEqual([]);
  });
});

describe('nextNumeroQuittance', () => {
  it('démarre à 001 sur historique vide', () => {
    expect(nextNumeroQuittance([], 'ba_1', '05', '2026')).toBe('Q-202605-001');
  });

  it('démarre à 001 sur historique non array', () => {
    expect(nextNumeroQuittance(null, 'ba_1', '05', '2026')).toBe('Q-202605-001');
  });

  it('incrémente la séquence par (bailleur, annee, mois)', () => {
    const h = [
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-001' },
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-002' },
    ];
    expect(nextNumeroQuittance(h, 'ba_1', '05', '2026')).toBe('Q-202605-003');
  });

  it('ignore les entrées d\'un autre bailleur', () => {
    const h = [
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-001' },
      { bailleurId: 'ba_2', numeroQuittance: 'Q-202605-005' }, // bailleur ≠ → ignoré
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-002' },
    ];
    expect(nextNumeroQuittance(h, 'ba_1', '05', '2026')).toBe('Q-202605-003');
    expect(nextNumeroQuittance(h, 'ba_2', '05', '2026')).toBe('Q-202605-006');
  });

  it('repart à 001 pour un autre mois', () => {
    const h = [
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-001' },
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-002' },
    ];
    expect(nextNumeroQuittance(h, 'ba_1', '06', '2026')).toBe('Q-202606-001');
  });

  it('repart à 001 pour une autre année', () => {
    const h = [{ bailleurId: 'ba_1', numeroQuittance: 'Q-202605-005' }];
    expect(nextNumeroQuittance(h, 'ba_1', '05', '2027')).toBe('Q-202705-001');
  });

  it("prend max+1 même si l'historique a des trous (suppression)", () => {
    const h = [
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-001' },
      { bailleurId: 'ba_1', numeroQuittance: 'Q-202605-003' },
    ];
    expect(nextNumeroQuittance(h, 'ba_1', '05', '2026')).toBe('Q-202605-004');
  });

  it("pad moisNum à 2 chiffres si l'appelant donne un nombre brut", () => {
    expect(nextNumeroQuittance([], 'ba_1', 5, '2026')).toBe('Q-202605-001');
    expect(nextNumeroQuittance([], 'ba_1', '5', '2026')).toBe('Q-202605-001');
  });
});

describe('buildHistoriqueRecuEntry', () => {
  it('produit une entrée de type recu_dg_entree avec les montants', () => {
    const e = buildHistoriqueRecuEntry({
      sousType: 'entree',
      bailleur,
      bien,
      locataire,
      montantInitial: 1700,
      dateEvenement: '2026-05-15',
      numeroRecu: 'DG-E-2026-001',
    });
    expect(e.type).toBe('recu_dg_entree');
    expect(e.montantInitial).toBe(1700);
    expect(e.montantRestitue).toBe(0);
    expect(e.annee).toBe('2026');
    expect(e.dateEvenement).toBe('2026-05-15');
    expect(e.bailleurId).toBe('ba_1');
    expect(e.bailleur.signatureActive).toBe(true);
    // Pas de signatureImage ni logo dans le snapshot (économie storage).
    expect(e.bailleur.signatureImage).toBeUndefined();
    expect(e.bailleur.logo).toBeUndefined();
  });

  it('produit une entrée de type recu_dg_sortie avec retenuesTexte', () => {
    const e = buildHistoriqueRecuEntry({
      sousType: 'sortie',
      bailleur,
      bien,
      locataire,
      montantInitial: 1700,
      montantRestitue: 1500,
      retenuesTexte: 'Peinture 200€\nNettoyage 50€',
      dateEvenement: '2027-01-10',
      numeroRecu: 'DG-S-2027-001',
    });
    expect(e.type).toBe('recu_dg_sortie');
    expect(e.montantRestitue).toBe(1500);
    expect(e.retenuesTexte).toContain('Peinture');
    expect(e.retenuesTexte).toContain('Nettoyage');
    expect(e.annee).toBe('2027');
  });

  it('rejette un sousType invalide', () => {
    expect(() =>
      buildHistoriqueRecuEntry({ sousType: 'autre', bailleur, bien, locataire }),
    ).toThrow();
  });
});

describe('nextNumeroRecu', () => {
  it('démarre à 001 si aucun historique', () => {
    expect(nextNumeroRecu([], 'ba_1', '2026', 'entree')).toBe('DG-E-2026-001');
    expect(nextNumeroRecu([], 'ba_1', '2026', 'sortie')).toBe('DG-S-2026-001');
  });

  it('incrémente par (bailleur, annee, sousType)', () => {
    const h = [
      { bailleurId: 'ba_1', type: 'recu_dg_entree', numeroQuittance: 'DG-E-2026-001' },
      { bailleurId: 'ba_1', type: 'recu_dg_entree', numeroQuittance: 'DG-E-2026-002' },
    ];
    expect(nextNumeroRecu(h, 'ba_1', '2026', 'entree')).toBe('DG-E-2026-003');
  });

  it('ignore les autres types et bailleurs', () => {
    const h = [
      { bailleurId: 'ba_1', type: 'recu_dg_entree', numeroQuittance: 'DG-E-2026-005' },
      { bailleurId: 'ba_2', type: 'recu_dg_entree', numeroQuittance: 'DG-E-2026-009' },
      { bailleurId: 'ba_1', type: 'recu_dg_sortie', numeroQuittance: 'DG-S-2026-001' },
      { bailleurId: 'ba_1', type: 'quittance', numeroQuittance: 'Q-202605-001' },
    ];
    expect(nextNumeroRecu(h, 'ba_1', '2026', 'entree')).toBe('DG-E-2026-006');
    expect(nextNumeroRecu(h, 'ba_1', '2026', 'sortie')).toBe('DG-S-2026-002');
  });

  it('repart à 001 pour une autre année', () => {
    const h = [
      { bailleurId: 'ba_1', type: 'recu_dg_entree', numeroQuittance: 'DG-E-2026-005' },
    ];
    expect(nextNumeroRecu(h, 'ba_1', '2027', 'entree')).toBe('DG-E-2027-001');
  });
});

describe('findDoublonsRecu', () => {
  it('détecte un reçu existant par (bailleurId, locataire.nom, sousType)', () => {
    const h = [
      { bailleurId: 'ba_1', type: 'recu_dg_entree', locataire: { nom: 'Alice' } },
      { bailleurId: 'ba_1', type: 'recu_dg_sortie', locataire: { nom: 'Alice' } },
    ];
    expect(findDoublonsRecu(h, 'ba_1', 'Alice', 'entree')).toHaveLength(1);
    expect(findDoublonsRecu(h, 'ba_1', 'Alice', 'sortie')).toHaveLength(1);
  });

  it('ne mélange pas avec un homonyme chez un autre bailleur', () => {
    const h = [{ bailleurId: 'ba_2', type: 'recu_dg_entree', locataire: { nom: 'Alice' } }];
    expect(findDoublonsRecu(h, 'ba_1', 'Alice', 'entree')).toHaveLength(0);
  });

  it('ignore les quittances classiques', () => {
    const h = [{ bailleurId: 'ba_1', type: 'quittance', locataire: { nom: 'Alice' } }];
    expect(findDoublonsRecu(h, 'ba_1', 'Alice', 'entree')).toHaveLength(0);
  });
});

describe('findDoublons (quittances) — anti-mélange avec reçus DG', () => {
  it('exclut les entrées de type recu_dg_*', () => {
    const h = [
      { bailleurId: 'ba_1', type: 'recu_dg_entree', locataire: { nom: 'Alice' }, moisNum: '05', annee: '2026' },
      { bailleurId: 'ba_1', type: 'quittance', locataire: { nom: 'Alice' }, moisNum: '05', annee: '2026' },
    ];
    const doublons = findDoublons(h, 'ba_1', 'Alice', '05', '2026');
    expect(doublons).toHaveLength(1);
    expect(doublons[0].type).toBe('quittance');
  });

  it('rétrocompat : type absent = quittance', () => {
    const h = [{ bailleurId: 'ba_1', locataire: { nom: 'Alice' }, moisNum: '05', annee: '2026' }];
    expect(findDoublons(h, 'ba_1', 'Alice', '05', '2026')).toHaveLength(1);
  });
});

describe('resolveBailleurForRender', () => {
  const entry = {
    bailleurId: 'ba_1',
    bailleur: { nom: 'Bob', signature: 'B.', signatureActive: false },
  };
  const courants = [
    {
      id: 'ba_1',
      nom: 'Bob',
      signatureActive: true,
      signatureImage: 'data:image/png;base64,abc',
      logo: 'data:image/png;base64,def',
    },
  ];

  it('renvoie image et logo du bailleur courant si trouvé', () => {
    const res = resolveBailleurForRender(entry, courants);
    expect(res.signatureImage).toBe('data:image/png;base64,abc');
    expect(res.logo).toBe('data:image/png;base64,def');
    expect(res.signatureActive).toBe(true);
  });

  it('fallback gracieux : bailleur supprimé → signatureActive du snapshot, pas d\'image', () => {
    const res = resolveBailleurForRender(entry, []);
    expect(res.signatureImage).toBe('');
    expect(res.logo).toBe('');
    expect(res.signatureActive).toBe(false);
  });

  it('fallback : signatureActive absent du snapshot → true', () => {
    const e = { bailleurId: 'ba_x', bailleur: { nom: 'X' } };
    const res = resolveBailleurForRender(e, []);
    expect(res.signatureActive).toBe(true);
  });
});

describe('filterAndSort — filtre type', () => {
  it('filtre par type', () => {
    const h = [
      { id: '1', type: 'quittance', dateGeneration: '2026-05-01T10:00:00Z', locataire: {}, annee: '2026' },
      { id: '2', type: 'recu_dg_entree', dateGeneration: '2026-05-02T10:00:00Z', locataire: {}, annee: '2026' },
    ];
    expect(filterAndSort(h, { type: 'quittance' })).toHaveLength(1);
    expect(filterAndSort(h, { type: 'recu_dg_entree' })).toHaveLength(1);
    expect(filterAndSort(h, {})).toHaveLength(2);
  });
});
