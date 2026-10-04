import { emptyData, migrate } from './schema.js';

const STORAGE_KEY = 'quittances_data';

// Plafond pratique du localStorage : la plupart des navigateurs allouent 5 Mo (5 242 880 octets)
// par origine. Quelques navigateurs vont plus haut (10 Mo) mais on reste prudent.
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
// Seuils d'alerte UI. À 70 % on incite à archiver, à 90 % on alerte plus fortement.
const WARNING_RATIO = 0.7;
const CRITICAL_RATIO = 0.9;

export function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyData();
    const raw = JSON.parse(stored);
    return migrate(raw);
  } catch (err) {
    console.warn('localStorage corrompu, réinitialisation', err);
    return emptyData();
  }
}

// Renvoie un objet { ok, quotaExceeded } pour permettre à l'UI de proposer une action
// adaptée (toast simple si erreur générique, dialogue d'archivage si quota).
export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true, quotaExceeded: false };
  } catch (err) {
    const isQuota =
      err instanceof Error &&
      // Spec : DOMException name === 'QuotaExceededError' ; Safari legacy : code === 22.
      (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
    if (isQuota) {
      console.warn('localStorage saturé', err);
      return { ok: false, quotaExceeded: true };
    }
    console.error('Erreur de sauvegarde localStorage', err);
    return { ok: false, quotaExceeded: false };
  }
}

// Mesure la taille actuelle de la clé en octets UTF-16 (longueur × 2, approximation correcte
// pour le navigateur). Suffisant pour piloter une jauge ; pas besoin d'être exact à l'octet près.
export function getStorageSize() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return 0;
    return v.length * 2;
  } catch {
    return 0;
  }
}

// Statut consolidé pour l'UI : { bytes, quotaBytes, percent (0-100), status }.
// status ∈ 'ok' | 'warning' | 'critical'.
export function getStorageInfo() {
  const bytes = getStorageSize();
  const percent = Math.min(100, Math.round((bytes / STORAGE_QUOTA_BYTES) * 100));
  let status = 'ok';
  if (bytes >= STORAGE_QUOTA_BYTES * CRITICAL_RATIO) status = 'critical';
  else if (bytes >= STORAGE_QUOTA_BYTES * WARNING_RATIO) status = 'warning';
  return { bytes, quotaBytes: STORAGE_QUOTA_BYTES, percent, status };
}

// Construit une copie du payload où les entrées d'historique antérieures à `cutoffDate`
// (ISO YYYY-MM-DD) sont retirées. Pure : ne mute pas l'entrée.
// On compare sur `dateGeneration` (ISO) qui existe sur toute entrée.
export function buildArchivedCopy(data, cutoffDate) {
  if (!data || !Array.isArray(data.historique)) return data;
  const cutoff = String(cutoffDate || '');
  return {
    ...data,
    historique: data.historique.filter((h) => {
      const d = h?.dateGeneration || '';
      // On garde toute entrée ≥ cutoff (date ISO triable lexicalement).
      return d >= cutoff;
    }),
  };
}

// Calcule la date pivot N années avant aujourd'hui, au format ISO YYYY-MM-DD.
// Utile pour proposer un archivage "vieux de plus de N ans".
export function cutoffYearsAgo(years, today = new Date()) {
  const d = new Date(today);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// Constantes exportées pour les tests et la cohérence UI.
export const STORAGE_THRESHOLDS = {
  quotaBytes: STORAGE_QUOTA_BYTES,
  warningRatio: WARNING_RATIO,
  criticalRatio: CRITICAL_RATIO,
};

// ----- Sauvegarde : suivi du dernier export + stockage persistant -----

// Clé séparée de `quittances_data` : la date du dernier export n'a pas à figurer dans le JSON
// exporté. Si Safari (ITP) purge l'origine, cette clé part avec les données — cohérent.
const LAST_EXPORT_KEY = 'quittance_last_export';
// Au-delà de ce délai sans export, l'UI rappelle à l'utilisateur de sauvegarder.
export const BACKUP_REMINDER_DAYS = 30;

export function loadLastExport() {
  try {
    return localStorage.getItem(LAST_EXPORT_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLastExport(iso) {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, iso);
  } catch {
    // Pas bloquant : le rappel réapparaîtra simplement plus tôt.
  }
}

// Pure. `lastExport` : ISO (date ou datetime) ou ''. `hasData` : faux si rien à sauvegarder.
// Renvoie { daysSince (null si jamais exporté), stale }.
export function backupStatus({ lastExport, hasData, today = new Date(), thresholdDays = BACKUP_REMINDER_DAYS }) {
  const last = lastExport ? new Date(lastExport) : null;
  const valid = last && !Number.isNaN(last.getTime());
  const daysSince = valid ? Math.max(0, Math.floor((today - last) / 86400000)) : null;
  const stale = Boolean(hasData) && (daysSince === null || daysSince >= thresholdDays);
  return { daysSince, stale };
}

// Statut du stockage persistant (Storage API) : 'granted' | 'denied' | 'unsupported'.
// `request` = true appelle persist() (Firefox affiche alors une demande de permission :
// à réserver à un moment où l'utilisateur vient d'agir).
export async function persistentStorageStatus({ request = false } = {}) {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm?.persisted) return 'unsupported';
  try {
    if (await sm.persisted()) return 'granted';
    if (request && sm.persist) return (await sm.persist()) ? 'granted' : 'denied';
    return 'denied';
  } catch {
    return 'unsupported';
  }
}
