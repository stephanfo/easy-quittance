import { z } from 'zod';

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

export const dataSchema = z.object({
  version: z.string().default('1.0'),
  bailleur: bailleurSchema,
  locataires: z.array(locataireSchema).default([]),
});

export function emptyData() {
  return {
    version: '1.0',
    bailleur: { nom: '', adresse: '', ville: '', signature: '' },
    locataires: [],
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

  return { version: '1.0', bailleur, locataires };
}

export function parseImport(raw) {
  const migrated = migrate(raw);
  return dataSchema.parse(migrated);
}
