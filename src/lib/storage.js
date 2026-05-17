import { emptyData, migrate } from './schema.js';

const STORAGE_KEY = 'quittances_data';

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

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Erreur de sauvegarde localStorage', err);
    return false;
  }
}
