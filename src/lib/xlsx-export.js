import writeXlsxFile from 'write-excel-file/browser';
import { formatDateFR, moisTexte } from './format.js';
import { formatPeriodFR } from './period.js';

// API de write-excel-file v4 :
// - `columns[]` (renommé depuis `schema`), chaque colonne expose `header` (objet style) + `cell` (callback retournant la valeur stylée).
// - `writeXlsxFile(objects, { columns })` retourne un builder ; il faut appeler `.toFile(fileName)` pour déclencher le téléchargement.

const HEADER_STYLE = { fontWeight: 'bold' };

const columns = [
  {
    header: { value: 'N° quittance', ...HEADER_STYLE },
    width: 18,
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
    header: { value: 'Locataire', ...HEADER_STYLE },
    width: 25,
    cell: (h) => ({ value: h.locataire?.nom || '', type: String }),
  },
  {
    header: { value: 'Mois', ...HEADER_STYLE },
    width: 18,
    cell: (h) => ({ value: moisTexte(h.moisNum, h.annee) || '', type: String }),
  },
  {
    header: { value: 'Période', ...HEADER_STYLE },
    width: 28,
    cell: (h) => ({ value: formatPeriodFR(h.periodeDebut, h.periodeFin) || '', type: String }),
  },
  {
    header: { value: 'Loyer (€)', ...HEADER_STYLE },
    width: 12,
    cell: (h) => ({ value: Number(h.loyer) || 0, type: Number, format: '#,##0.00' }),
  },
  {
    header: { value: 'Charges (€)', ...HEADER_STYLE },
    width: 12,
    cell: (h) => ({ value: Number(h.charges) || 0, type: Number, format: '#,##0.00' }),
  },
  {
    header: { value: 'Total (€)', ...HEADER_STYLE },
    width: 12,
    cell: (h) => ({
      value: (Number(h.loyer) || 0) + (Number(h.charges) || 0),
      type: Number,
      format: '#,##0.00',
    }),
  },
  {
    header: { value: 'Mode règlement', ...HEADER_STYLE },
    width: 15,
    cell: (h) => ({ value: h.modeReglement || '', type: String }),
  },
  {
    header: { value: "Date d'encaissement", ...HEADER_STYLE },
    width: 18,
    cell: (h) => ({
      value: h.dateEncaissement ? formatDateFR(h.dateEncaissement) : '',
      type: String,
    }),
  },
];

export async function exportHistoriqueXlsx(historique) {
  const fileName = `historique_quittances_${new Date().toISOString().split('T')[0]}.xlsx`;
  await writeXlsxFile(historique, { columns }).toFile(fileName);
}
