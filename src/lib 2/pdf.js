import { jsPDF } from 'jspdf';
import { formatMontant, moisTexte, formatDateFR } from './format.js';
import { nombreEnLettres } from './nombre-en-lettres.js';
import { formatPeriodFR } from './period.js';

export function buildPDF({
  bailleur,
  locataire,
  moisNum,
  annee,
  loyer,
  charges,
  periodeDebut,
  periodeFin,
  modeReglement,
  dateEncaissement,
}) {
  const doc = new jsPDF();
  const dateGeneration = new Date().toLocaleDateString('fr-FR');
  const total = parseFloat(loyer) + parseFloat(charges);
  const moisLabel = moisTexte(moisNum, annee);
  const periodeLabel = formatPeriodFR(periodeDebut, periodeFin);

  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('QUITTANCE DE LOYER', 105, 20, { align: 'center' });
  doc.setFont(undefined, 'normal');

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('BAILLEUR', 20, 40);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  const bailleurLines = doc.splitTextToSize(bailleur.nom + '\n' + bailleur.adresse, 80);
  doc.text(bailleurLines, 20, 48);

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('LOCATAIRE', 120, 40);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  const locataireLines = doc.splitTextToSize(locataire.nom + '\n' + locataire.adresse, 80);
  doc.text(locataireLines, 120, 48);

  let y = 90;
  doc.setFontSize(11);
  doc.text(`Je soussigné(e) ${bailleur.nom}, propriétaire du logement situé :`, 20, y);
  y += 10;

  const adresseLines = doc.splitTextToSize(locataire.adresse, 170);
  doc.text(adresseLines, 20, y);
  y += adresseLines.length * 7;

  doc.text(`déclare avoir reçu de ${locataire.nom}`, 20, y);
  y += 10;
  doc.text(`la somme de ${formatMontant(total)} € (${nombreEnLettres(total)})`, 20, y);
  y += 10;
  if (periodeLabel) {
    doc.text(`au titre du loyer et des charges pour le mois de ${moisLabel},`, 20, y);
    y += 10;
    doc.text(`pour la période ${periodeLabel}.`, 20, y);
  } else {
    doc.text(`au titre du loyer et des charges pour le mois de ${moisLabel}.`, 20, y);
  }

  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text('Détail du paiement :', 20, y);
  doc.setFont(undefined, 'normal');
  y += 8;
  doc.text(`Loyer : ${formatMontant(parseFloat(loyer))} €`, 30, y);
  y += 6;
  doc.text(`Charges : ${formatMontant(parseFloat(charges))} €`, 30, y);
  y += 6;
  doc.setFont(undefined, 'bold');
  doc.text(`Total : ${formatMontant(total)} €`, 30, y);
  doc.setFont(undefined, 'normal');

  if (modeReglement) {
    y += 10;
    doc.text(`Mode de règlement : ${modeReglement}`, 20, y);
  }
  if (dateEncaissement) {
    y += 8;
    doc.text(`Date d'encaissement : ${formatDateFR(dateEncaissement)}`, 20, y);
  }

  y += 20;
  doc.text(`Fait à ${bailleur.ville}, le ${dateGeneration}`, 20, y);
  y += 10;
  doc.text('Signature du bailleur :', 120, y);
  y += 10;
  doc.setFont(undefined, 'italic');
  doc.text(bailleur.signature, 120, y);
  doc.setFont(undefined, 'normal');

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    'Cette quittance annule tous les reçus qui auraient pu être délivrés en cas de paiement partiel du terme ci-dessus.',
    20,
    280,
    { maxWidth: 170 },
  );
  doc.setTextColor(0);

  const filename = `Quittance_${locataire.nom.replace(/\s+/g, '_')}_${annee}-${String(moisNum).padStart(2, '0')}.pdf`;

  return { doc, filename };
}
