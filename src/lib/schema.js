import { z } from 'zod';
import { generateHistoriqueId } from './historique.js';

export const MODES_REGLEMENT = ['virement', 'chèque', 'espèces', 'autre'];

const bailleurSchema = z.object({
  nom: z.string().default(''),
  adresse: z.string().default(''),
  ville: z.string().default(''),
  signature: z.string().default(''),
});

const locataireSchema = z.object({
  nom: z.string(),
  email: z.string().default(''),
  adresse: z.string(),
  loyer: z.coerce.number().nonnegative(),
  charges: z.coerce.number().nonnegative().default(0),
  modeReglement: z.string().default(''),
});

const historiqueLocataireSnapshotSchema = z.object({
  nom: z.string().default(''),
  email: z.string().default(''),
  adresse: z.string().default(''),
  loyer: z.coerce.number().default(0),
  charges: z.coerce.number().default(0),
  modeReglement: z.string().default(''),
});

const historiqueEntrySchema = z.object({
  id: z.string(),
  dateGeneration: z.string(),
  moisNum: z.string(),
  annee: z.string(),
  bailleur: bailleurSchema,
  locataire: historiqueLocataireSnapshotSchema,
  loyer: z.coerce.number().default(0),
  charges: z.coerce.number().default(0),
  periodeDebut: z.string().default(''),
  periodeFin: z.string().default(''),
  modeReglement: z.string().default(''),
  dateEncaissement: z.string().default(''),
});

export const dataSchema = z.object({
  version: z.string().default('1.0'),
  bailleur: bailleurSchema,
  locataires: z.array(locataireSchema).default([]),
  historique: z.array(historiqueEntrySchema).default([]),
});

export function emptyData() {
  return {
    version: '1.0',
    bailleur: { nom: '', adresse: '', ville: '', signature: '' },
    locataires: [],
    historique: [],
  };
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyData();

  const bailleur = {
    nom: raw.bailleur?.nom || '',
    adresse: raw.bailleur?.adresse || '',
    ville: raw.bailleur?.ville || '',
    signature: raw.bailleur?.signature || '',
  };

  const locataires = Array.isArray(raw.locataires)
    ? raw.locataires.map((l) => ({
        nom: l.nom || '',
        email: l.email || '',
        adresse: l.adresse || '',
        loyer: Number(l.loyer) || 0,
        charges: Number(l.charges) || 0,
        modeReglement: l.modeReglement || '',
      }))
    : [];

  const historique = Array.isArray(raw.historique)
    ? raw.historique.map((h) => ({
        id: h?.id || generateHistoriqueId(),
        dateGeneration: h?.dateGeneration || new Date().toISOString(),
        moisNum: h?.moisNum || '',
        annee: h?.annee != null ? String(h.annee) : '',
        bailleur: {
          nom: h?.bailleur?.nom || '',
          adresse: h?.bailleur?.adresse || '',
          ville: h?.bailleur?.ville || '',
          signature: h?.bailleur?.signature || '',
        },
        locataire: {
          nom: h?.locataire?.nom || '',
          email: h?.locataire?.email || '',
          adresse: h?.locataire?.adresse || '',
          loyer: Number(h?.locataire?.loyer) || 0,
          charges: Number(h?.locataire?.charges) || 0,
          modeReglement: h?.locataire?.modeReglement || '',
        },
        loyer: Number(h?.loyer) || 0,
        charges: Number(h?.charges) || 0,
        periodeDebut: h?.periodeDebut || '',
        periodeFin: h?.periodeFin || '',
        modeReglement: h?.modeReglement || '',
        dateEncaissement: h?.dateEncaissement || '',
      }))
    : [];

  return { version: '1.0', bailleur, locataires, historique };
}

export function parseImport(raw) {
  const migrated = migrate(raw);
  return dataSchema.parse(migrated);
}
