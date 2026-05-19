import { z } from 'zod';
import { generateHistoriqueId } from './historique.js';

export const MODES_REGLEMENT = ['virement', 'chèque', 'espèces', 'autre'];
export const TYPES_BIEN = ['appartement', 'maison', 'chambre', 'local', 'parking', 'autre'];

// ---------- Générateurs d'ID ----------

export function generateBailleurId() {
  return `ba_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export function generateBienId() {
  return `bi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export function generateLocataireId() {
  return `lo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Schémas Zod ----------

const bailleurSchema = z.object({
  id: z.string(),
  nom: z.string().default(''),
  adresse: z.string().default(''),
  ville: z.string().default(''),
  signature: z.string().default(''),
  email: z.string().default(''),
  telephone: z.string().default(''),
});

const bienSchema = z.object({
  id: z.string(),
  bailleurId: z.string(),
  libelle: z.string().default(''),
  adresse: z.string().default(''),
  type: z.string().default('autre'),
  reference: z.string().default(''),
});

const locataireSchema = z.object({
  id: z.string(),
  bienId: z.string(),
  nom: z.string(),
  email: z.string().default(''),
  loyer: z.coerce.number().nonnegative(),
  charges: z.coerce.number().nonnegative().default(0),
  modeReglement: z.string().default(''),
  referenceBail: z.string().default(''),
  coOccupants: z.string().default(''),
});

const historiqueBailleurSnapshotSchema = z.object({
  nom: z.string().default(''),
  adresse: z.string().default(''),
  ville: z.string().default(''),
  signature: z.string().default(''),
  email: z.string().default(''),
  telephone: z.string().default(''),
});

const historiqueBienSnapshotSchema = z.object({
  libelle: z.string().default(''),
  adresse: z.string().default(''),
  type: z.string().default(''),
  reference: z.string().default(''),
});

const historiqueLocataireSnapshotSchema = z.object({
  nom: z.string().default(''),
  email: z.string().default(''),
  loyer: z.coerce.number().default(0),
  charges: z.coerce.number().default(0),
  modeReglement: z.string().default(''),
  referenceBail: z.string().default(''),
  coOccupants: z.string().default(''),
});

const historiqueEntrySchema = z.object({
  id: z.string(),
  numeroQuittance: z.string().default(''),
  dateGeneration: z.string(),
  moisNum: z.string(),
  annee: z.string(),
  bailleurId: z.string(),
  bailleur: historiqueBailleurSnapshotSchema,
  bien: historiqueBienSnapshotSchema,
  locataire: historiqueLocataireSnapshotSchema,
  loyer: z.coerce.number().default(0),
  charges: z.coerce.number().default(0),
  periodeDebut: z.string().default(''),
  periodeFin: z.string().default(''),
  modeReglement: z.string().default(''),
  dateEncaissement: z.string().default(''),
  dateEmission: z.string().default(''),
});

// Intégrité référentielle vérifiée à l'import : bien.bailleurId et locataire.bienId doivent pointer
// vers une entité présente dans le payload. L'historique reste découplé : ses snapshots peuvent
// référencer un bailleur supprimé (c'est précisément le rôle de l'archive).
export const dataSchema = z
  .object({
    version: z.string().default('2.0'),
    bailleurs: z.array(bailleurSchema).default([]),
    biens: z.array(bienSchema).default([]),
    locataires: z.array(locataireSchema).default([]),
    historique: z.array(historiqueEntrySchema).default([]),
  })
  .superRefine((data, ctx) => {
    const bailleurIds = new Set(data.bailleurs.map((b) => b.id));
    data.biens.forEach((bien, i) => {
      if (!bailleurIds.has(bien.bailleurId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['biens', i, 'bailleurId'],
          message: `Bien "${bien.libelle || bien.id}" référence un bailleur inexistant`,
        });
      }
    });
    const bienIds = new Set(data.biens.map((b) => b.id));
    data.locataires.forEach((loc, i) => {
      if (!bienIds.has(loc.bienId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['locataires', i, 'bienId'],
          message: `Locataire "${loc.nom || loc.id}" référence un bien inexistant`,
        });
      }
    });
  });

export function emptyData() {
  return {
    version: '2.0',
    bailleurs: [],
    biens: [],
    locataires: [],
    historique: [],
  };
}

// ---------- Normalisation ----------
// `migrate` accepte un payload partiel (chargement localStorage, import JSON) et le complète
// avec les défauts attendus. Pas de support de schéma antérieur : on est en phase prototype,
// le format v2 est le seul reconnu.

function normalizeBailleur(raw) {
  return {
    id: raw?.id || generateBailleurId(),
    nom: raw?.nom || '',
    adresse: raw?.adresse || '',
    ville: raw?.ville || '',
    signature: raw?.signature || '',
    email: raw?.email || '',
    telephone: raw?.telephone || '',
  };
}

function normalizeBien(raw) {
  return {
    id: raw?.id || generateBienId(),
    bailleurId: raw?.bailleurId || '',
    libelle: raw?.libelle || '',
    adresse: raw?.adresse || '',
    type: raw?.type || 'autre',
    reference: raw?.reference || '',
  };
}

function normalizeLocataire(raw) {
  return {
    id: raw?.id || generateLocataireId(),
    bienId: raw?.bienId || '',
    nom: raw?.nom || '',
    email: raw?.email || '',
    loyer: Number(raw?.loyer) || 0,
    charges: Number(raw?.charges) || 0,
    modeReglement: raw?.modeReglement || '',
    referenceBail: raw?.referenceBail || '',
    coOccupants: raw?.coOccupants || '',
  };
}

function normalizeHistoriqueEntry(raw) {
  return {
    id: raw?.id || generateHistoriqueId(),
    numeroQuittance: raw?.numeroQuittance || '',
    dateGeneration: raw?.dateGeneration || new Date().toISOString(),
    moisNum: raw?.moisNum != null ? String(raw.moisNum) : '',
    annee: raw?.annee != null ? String(raw.annee) : '',
    bailleurId: raw?.bailleurId || '',
    bailleur: {
      nom: raw?.bailleur?.nom || '',
      adresse: raw?.bailleur?.adresse || '',
      ville: raw?.bailleur?.ville || '',
      signature: raw?.bailleur?.signature || '',
      email: raw?.bailleur?.email || '',
      telephone: raw?.bailleur?.telephone || '',
    },
    bien: {
      libelle: raw?.bien?.libelle || '',
      adresse: raw?.bien?.adresse || '',
      type: raw?.bien?.type || '',
      reference: raw?.bien?.reference || '',
    },
    locataire: {
      nom: raw?.locataire?.nom || '',
      email: raw?.locataire?.email || '',
      loyer: Number(raw?.locataire?.loyer) || 0,
      charges: Number(raw?.locataire?.charges) || 0,
      modeReglement: raw?.locataire?.modeReglement || '',
      referenceBail: raw?.locataire?.referenceBail || '',
      coOccupants: raw?.locataire?.coOccupants || '',
    },
    loyer: Number(raw?.loyer) || 0,
    charges: Number(raw?.charges) || 0,
    periodeDebut: raw?.periodeDebut || '',
    periodeFin: raw?.periodeFin || '',
    modeReglement: raw?.modeReglement || '',
    dateEncaissement: raw?.dateEncaissement || '',
    dateEmission: raw?.dateEmission || '',
  };
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyData();
  return {
    version: '2.0',
    bailleurs: Array.isArray(raw.bailleurs) ? raw.bailleurs.map(normalizeBailleur) : [],
    biens: Array.isArray(raw.biens) ? raw.biens.map(normalizeBien) : [],
    locataires: Array.isArray(raw.locataires) ? raw.locataires.map(normalizeLocataire) : [],
    historique: Array.isArray(raw.historique) ? raw.historique.map(normalizeHistoriqueEntry) : [],
  };
}

export function parseImport(raw) {
  const migrated = migrate(raw);
  return dataSchema.parse(migrated);
}
