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
  signatureActive: z.boolean().default(true),
  signatureImage: z.string().default(''),
  logo: z.string().default(''),
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
  depotGarantie: z.coerce.number().nonnegative().default(0),
});

const historiqueBailleurSnapshotSchema = z.object({
  nom: z.string().default(''),
  adresse: z.string().default(''),
  ville: z.string().default(''),
  signature: z.string().default(''),
  signatureActive: z.boolean().default(true),
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
  depotGarantie: z.coerce.number().default(0),
});

const historiqueEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['quittance', 'recu_dg_entree', 'recu_dg_sortie']).default('quittance'),
  numeroQuittance: z.string().default(''),
  dateGeneration: z.string(),
  moisNum: z.string().default(''),
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
  // Champs reçus DG (vides pour les quittances)
  montantInitial: z.coerce.number().default(0),
  montantRestitue: z.coerce.number().default(0),
  retenuesTexte: z.string().default(''),
  dateEvenement: z.string().default(''),
});

// Templates d'email par défaut. Placeholders supportés : {locataire}, {mois}, {annee},
// {bailleur}, {signature}. Substitution simple via lib/email-template.js.
export const DEFAULT_EMAIL_TEMPLATES = {
  quittanceSubject: 'Quittance de loyer - {mois} {annee}',
  quittanceBody:
    'Bonjour,\n\nVeuillez trouver ci-joint la quittance de loyer pour le mois de {mois} {annee}.\n\nCordialement,\n{signature}',
  dgEntreeSubject: 'Reçu de dépôt de garantie - {locataire}',
  dgEntreeBody:
    "Bonjour,\n\nVeuillez trouver ci-joint le reçu d'encaissement du dépôt de garantie.\n\nCordialement,\n{signature}",
  dgSortieSubject: 'Restitution du dépôt de garantie - {locataire}',
  dgSortieBody:
    'Bonjour,\n\nVeuillez trouver ci-joint le reçu de restitution du dépôt de garantie.\n\nCordialement,\n{signature}',
};

const emailTemplatesSchema = z.object({
  quittanceSubject: z.string().default(DEFAULT_EMAIL_TEMPLATES.quittanceSubject),
  quittanceBody: z.string().default(DEFAULT_EMAIL_TEMPLATES.quittanceBody),
  dgEntreeSubject: z.string().default(DEFAULT_EMAIL_TEMPLATES.dgEntreeSubject),
  dgEntreeBody: z.string().default(DEFAULT_EMAIL_TEMPLATES.dgEntreeBody),
  dgSortieSubject: z.string().default(DEFAULT_EMAIL_TEMPLATES.dgSortieSubject),
  dgSortieBody: z.string().default(DEFAULT_EMAIL_TEMPLATES.dgSortieBody),
});

const settingsSchema = z.object({
  emailTemplates: emailTemplatesSchema.default({}),
});

// Intégrité référentielle vérifiée à l'import : bien.bailleurId et locataire.bienId doivent pointer
// vers une entité présente dans le payload. L'historique reste découplé : ses snapshots peuvent
// référencer un bailleur supprimé (c'est précisément le rôle de l'archive).
export const dataSchema = z
  .object({
    version: z.string().default('2.1'),
    bailleurs: z.array(bailleurSchema).default([]),
    biens: z.array(bienSchema).default([]),
    locataires: z.array(locataireSchema).default([]),
    historique: z.array(historiqueEntrySchema).default([]),
    settings: settingsSchema.default({ emailTemplates: { ...DEFAULT_EMAIL_TEMPLATES } }),
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
    version: '2.1',
    bailleurs: [],
    biens: [],
    locataires: [],
    historique: [],
    settings: { emailTemplates: { ...DEFAULT_EMAIL_TEMPLATES } },
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
    // Défaut true : pour rétrocompat v2.0 (le comportement actuel = signature affichée).
    signatureActive: typeof raw?.signatureActive === 'boolean' ? raw.signatureActive : true,
    signatureImage: raw?.signatureImage || '',
    logo: raw?.logo || '',
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
    depotGarantie: Number(raw?.depotGarantie) || 0,
  };
}

function normalizeHistoriqueEntry(raw) {
  const type =
    raw?.type === 'recu_dg_entree' || raw?.type === 'recu_dg_sortie'
      ? raw.type
      : 'quittance';
  return {
    id: raw?.id || generateHistoriqueId(),
    type,
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
      // Rétrocompat : entrées v2.0 sans signatureActive → true (le PDF d'origine montrait
      // la signature, on doit la rééditer à l'identique).
      signatureActive:
        typeof raw?.bailleur?.signatureActive === 'boolean'
          ? raw.bailleur.signatureActive
          : true,
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
      depotGarantie: Number(raw?.locataire?.depotGarantie) || 0,
    },
    loyer: Number(raw?.loyer) || 0,
    charges: Number(raw?.charges) || 0,
    periodeDebut: raw?.periodeDebut || '',
    periodeFin: raw?.periodeFin || '',
    modeReglement: raw?.modeReglement || '',
    dateEncaissement: raw?.dateEncaissement || '',
    dateEmission: raw?.dateEmission || '',
    montantInitial: Number(raw?.montantInitial) || 0,
    montantRestitue: Number(raw?.montantRestitue) || 0,
    // V2.2 : champ renommé en texte plat. On honore le nouveau nom ; les anciens snapshots
    // avec retenuesHtml (HTML Tiptap) sont vidés volontairement (décision assumée :
    // feature récente, volume faible, et le HTML brut serait illisible sur le PDF texte plat).
    retenuesTexte: raw?.retenuesTexte || '',
    dateEvenement: raw?.dateEvenement || '',
  };
}

function normalizeSettings(raw) {
  const tpl = raw?.emailTemplates || {};
  return {
    emailTemplates: {
      quittanceSubject: tpl.quittanceSubject || DEFAULT_EMAIL_TEMPLATES.quittanceSubject,
      quittanceBody: tpl.quittanceBody || DEFAULT_EMAIL_TEMPLATES.quittanceBody,
      dgEntreeSubject: tpl.dgEntreeSubject || DEFAULT_EMAIL_TEMPLATES.dgEntreeSubject,
      dgEntreeBody: tpl.dgEntreeBody || DEFAULT_EMAIL_TEMPLATES.dgEntreeBody,
      dgSortieSubject: tpl.dgSortieSubject || DEFAULT_EMAIL_TEMPLATES.dgSortieSubject,
      dgSortieBody: tpl.dgSortieBody || DEFAULT_EMAIL_TEMPLATES.dgSortieBody,
    },
  };
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyData();
  return {
    version: '2.1',
    bailleurs: Array.isArray(raw.bailleurs) ? raw.bailleurs.map(normalizeBailleur) : [],
    biens: Array.isArray(raw.biens) ? raw.biens.map(normalizeBien) : [],
    locataires: Array.isArray(raw.locataires) ? raw.locataires.map(normalizeLocataire) : [],
    historique: Array.isArray(raw.historique) ? raw.historique.map(normalizeHistoriqueEntry) : [],
    settings: normalizeSettings(raw.settings),
  };
}

export function parseImport(raw) {
  const migrated = migrate(raw);
  return dataSchema.parse(migrated);
}
