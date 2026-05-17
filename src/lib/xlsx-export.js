import writeXlsxFile from 'write-excel-file/browser';
import { formatDateFR, moisTexte } from './format.js';
import { formatPeriodFR } from './period.js';

const schema = [
  {
    column: 'Date génération',
    type: String,
    width: 18,
    value: (h) => {
      if (!h.dateGeneration) return '';
      const d = new Date(h.dateGeneration);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
    },
  },
  { column: 'Locataire', type: String, width: 25, value: (h) => h.locataire?.nom || '' },
  { column: 'Mois', type: String, width: 18, value: (h) => moisTexte(h.moisNum, h.annee) },
  {
    column: 'Période',
    type: String,
    width: 28,
    value: (h) => formatPeriodFR(h.periodeDebut, h.periodeFin),
  },
  {
    column: 'Loyer (€)',
    type: Number,
    width: 12,
    format: '#,##0.00',
    value: (h) => Number(h.loyer) || 0,
  },
  {
    column: 'Charges (€)',
    type: Number,
    width: 12,
    format: '#,##0.00',
    value: (h) => Number(h.charges) || 0,
  },
  {
    column: 'Total (€)',
    type: Number,
    width: 12,
    format: '#,##0.00',
    value: (h) => (Number(h.loyer) || 0) + (Number(h.charges) || 0),
  },
  { column: 'Mode règlement', type: String, width: 15, value: (h) => h.modeReglement || '' },
  {
    column: "Date d'encaissement",
    type: String,
    width: 18,
    value: (h) => (h.dateEncaissement ? formatDateFR(h.dateEncaissement) : ''),
  },
];

export async function exportHistoriqueXlsx(historique) {
  const fileName = `historique_quittances_${new Date().toISOString().split('T')[0]}.xlsx`;
  await writeXlsxFile(historique, { schema, fileName, headerStyle: { fontWeight: 'bold' } });
}
