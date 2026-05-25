import writeXlsxFile from 'write-excel-file/browser';
import { formatDateFR, moisTexte } from './format.js';
import { formatPeriodFR } from './period.js';

// API de write-excel-file v4 :
// - `columns[]` (renommé depuis `schema`), chaque colonne expose `header` (objet style) + `cell` (callback retournant la valeur stylée).
// - `writeXlsxFile(objects, { columns })` retourne un builder ; il faut appeler `.toFile(fileName)` pour déclencher le téléchargement.

const HEADER_STYLE = { fontWeight: 'bold' };

// Libellé lisible pour le filtre Type. Les types DG ont des champs spécifiques (DG/Restitué)
// qui sont vides pour les quittances, et inversement (loyer/charges/période vides pour les DG).
const TYPE_LABELS = {
  quittance: 'Quittance',
  recu_dg_entree: 'Reçu DG — entrée',
  recu_dg_sortie: 'Reçu DG — sortie',
};

const numberCell = (value) => ({
  value: Number(value) || 0,
  type: Number,
  format: '#,##0.00',
});

const columns = [
  {
    header: { value: 'Type', ...HEADER_STYLE },
    width: 18,
    cell: (h) => ({ value: TYPE_LABELS[h.type || 'quittance'] || 'Quittance', type: String }),
  },
  {
    header: { value: 'N° document', ...HEADER_STYLE },
    width: 20,
    cell: (h) => ({ value: h.numeroQuittance || '', type: String }),
  },
  {
    header: { value: 'Date génération', ...HEADER_STYLE },
    width: 18,
    cell: (h) => {
      if (!h.dateGeneration) return { value: '', type: String };
      const d = new Date(h.dateGeneration);
      const txt = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
      return { value: txt, type: String };
    },
  },
  {
    header: { value: 'Bailleur', ...HEADER_STYLE },
    width: 25,
    cell: (h) => ({ value: h.bailleur?.nom || '', type: String }),
  },
  {
    header: { value: 'Bien', ...HEADER_STYLE },
    width: 25,
    cell: (h) => ({ value: h.bien?.libelle || '', type: String }),
  },
  {
    header: { value: 'Locataire', ...HEADER_STYLE },
    width: 25,
    cell: (h) => ({ value: h.locataire?.nom || '', type: String }),
  },
  // ---- Colonnes Quittance ----
  {
    header: { value: 'Mois', ...HEADER_STYLE },
    width: 18,
    cell: (h) => ({ value: h.type && h.type !== 'quittance' ? '' : moisTexte(h.moisNum, h.annee) || '', type: String }),
  },
  {
    header: { value: 'Période', ...HEADER_STYLE },
    width: 28,
    cell: (h) => ({
      value: h.type && h.type !== 'quittance' ? '' : formatPeriodFR(h.periodeDebut, h.periodeFin) || '',
      type: String,
    }),
  },
  {
    header: { value: 'Loyer (€)', ...HEADER_STYLE },
    width: 12,
    cell: (h) => (h.type && h.type !== 'quittance' ? { value: '', type: String } : numberCell(h.loyer)),
  },
  {
    header: { value: 'Charges (€)', ...HEADER_STYLE },
    width: 12,
    cell: (h) =>
      h.type && h.type !== 'quittance' ? { value: '', type: String } : numberCell(h.charges),
  },
  {
    header: { value: 'Total (€)', ...HEADER_STYLE },
    width: 12,
    cell: (h) =>
      h.type && h.type !== 'quittance'
        ? { value: '', type: String }
        : numberCell((Number(h.loyer) || 0) + (Number(h.charges) || 0)),
  },
  {
    header: { value: 'Mode règlement', ...HEADER_STYLE },
    width: 15,
    cell: (h) => ({ value: h.type && h.type !== 'quittance' ? '' : h.modeReglement || '', type: String }),
  },
  {
    header: { value: "Date d'encaissement", ...HEADER_STYLE },
    width: 18,
    cell: (h) => ({
      value:
        h.type && h.type !== 'quittance'
          ? ''
          : h.dateEncaissement
            ? formatDateFR(h.dateEncaissement)
            : '',
      type: String,
    }),
  },
  // ---- Colonnes Reçus DG ----
  {
    header: { value: 'DG initial (€)', ...HEADER_STYLE },
    width: 14,
    cell: (h) => {
      const isDg = h.type === 'recu_dg_entree' || h.type === 'recu_dg_sortie';
      return isDg ? numberCell(h.montantInitial) : { value: '', type: String };
    },
  },
  {
    header: { value: 'Restitué (€)', ...HEADER_STYLE },
    width: 14,
    cell: (h) =>
      h.type === 'recu_dg_sortie' ? numberCell(h.montantRestitue) : { value: '', type: String },
  },
  {
    header: { value: 'Retenues (€)', ...HEADER_STYLE },
    width: 14,
    cell: (h) =>
      h.type === 'recu_dg_sortie'
        ? numberCell(Math.max(0, (Number(h.montantInitial) || 0) - (Number(h.montantRestitue) || 0)))
        : { value: '', type: String },
  },
  {
    header: { value: 'Date événement DG', ...HEADER_STYLE },
    width: 18,
    cell: (h) => {
      const isDg = h.type === 'recu_dg_entree' || h.type === 'recu_dg_sortie';
      return {
        value: isDg && h.dateEvenement ? formatDateFR(h.dateEvenement) : '',
        type: String,
      };
    },
  },
];

export async function exportHistoriqueXlsx(historique) {
  const fileName = `historique_${new Date().toISOString().split('T')[0]}.xlsx`;
  await writeXlsxFile(historique, { columns }).toFile(fileName);
}
