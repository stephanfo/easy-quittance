import { jsPDF } from 'jspdf';
import { formatMontant, moisTexte, formatDateFR } from './format.js';
import { nombreEnLettres } from './nombre-en-lettres.js';
import { formatPeriodFR } from './period.js';

// ---------- Police custom (Inter) ----------

const FONT_FAMILY = 'Inter';
const FONT_FALLBACK = 'helvetica';

let _fontDataPromise = null;
let _fontLoadFailed = false;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  // Découpe en chunks pour ne pas saturer l'argument de fromCharCode sur de gros buffers.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadInterFonts() {
  if (_fontLoadFailed) return null;
  if (!_fontDataPromise) {
    _fontDataPromise = (async () => {
      const regUrl = new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url);
      const boldUrl = new URL('../assets/fonts/Inter-Bold.ttf', import.meta.url);
      const [regBuf, boldBuf] = await Promise.all([
        fetch(regUrl).then((r) => {
          if (!r.ok) throw new Error('Inter-Regular fetch failed');
          return r.arrayBuffer();
        }),
        fetch(boldUrl).then((r) => {
          if (!r.ok) throw new Error('Inter-Bold fetch failed');
          return r.arrayBuffer();
        }),
      ]);
      return {
        reg: arrayBufferToBase64(regBuf),
        bold: arrayBufferToBase64(boldBuf),
      };
    })().catch((err) => {
      console.warn('Police Inter indisponible, fallback Helvetica :', err);
      _fontLoadFailed = true;
      _fontDataPromise = null;
      return null;
    });
  }
  return _fontDataPromise;
}

async function applyFont(doc) {
  const data = await loadInterFonts();
  if (!data) {
    doc.setFont(FONT_FALLBACK, 'normal');
    return { font: FONT_FALLBACK, fallback: true };
  }
  doc.addFileToVFS('Inter-Regular.ttf', data.reg);
  doc.addFont('Inter-Regular.ttf', FONT_FAMILY, 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', data.bold);
  doc.addFont('Inter-Bold.ttf', FONT_FAMILY, 'bold');
  doc.setFont(FONT_FAMILY, 'normal');
  return { font: FONT_FAMILY, fallback: false };
}

// ---------- Mise en page ----------

const PAGE_W = 210;
const PAGE_H = 297;
const M = { left: 20, right: 20, top: 18, bottom: 22 };
const CONTENT_W = PAGE_W - M.left - M.right;
const ACCENT = [31, 41, 55]; // gris anthracite
const TEXT = [20, 20, 20];
const MUTED = [110, 110, 110];

function setText(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setDraw(doc, rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function setFill(doc, rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function drawSeparator(doc, y) {
  setDraw(doc, ACCENT);
  doc.setLineWidth(0.3);
  doc.line(M.left, y, PAGE_W - M.right, y);
}

function drawHeader(doc, font, { numero, dateEmission }) {
  // Titre à gauche
  doc.setFont(font, 'bold');
  doc.setFontSize(18);
  setText(doc, ACCENT);
  doc.text('QUITTANCE DE LOYER', M.left, M.top + 6);

  // Métadonnées à droite
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  setText(doc, TEXT);
  const rightX = PAGE_W - M.right;
  if (numero) {
    doc.setFont(font, 'bold');
    doc.text(numero, rightX, M.top + 2, { align: 'right' });
    doc.setFont(font, 'normal');
  }
  setText(doc, MUTED);
  doc.text(`Émise le ${dateEmission}`, rightX, M.top + 8, { align: 'right' });
  setText(doc, TEXT);

  drawSeparator(doc, M.top + 12);
  return M.top + 18;
}

function drawPartyBlock(doc, font, { x, y, label, lines }) {
  doc.setFont(font, 'bold');
  doc.setFontSize(9);
  setText(doc, ACCENT);
  doc.text(label, x, y);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  setText(doc, TEXT);
  let cursorY = y + 6;
  const blockWidth = (CONTENT_W - 8) / 2;
  for (const line of lines) {
    const isMuted = typeof line === 'object' && line !== null && line.muted === true;
    const text = typeof line === 'string' ? line : (line?.text ?? '');
    if (!text) continue;
    if (isMuted) {
      setText(doc, MUTED);
      doc.setFontSize(9);
    }
    const wrapped = doc.splitTextToSize(text, blockWidth);
    doc.text(wrapped, x, cursorY);
    cursorY += wrapped.length * 5;
    if (isMuted) {
      setText(doc, TEXT);
      doc.setFontSize(10);
    }
  }
  return cursorY;
}

function drawPeriodBadge(doc, font, y, label) {
  if (!label) return y;
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  const padX = 6;
  const padY = 4;
  const text = `Période couverte : ${label}`;
  const textW = doc.getTextWidth(text);
  const boxW = textW + padX * 2;
  const boxH = 10;
  const boxX = M.left;
  setDraw(doc, ACCENT);
  setFill(doc, [248, 248, 248]);
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, y, boxW, boxH, 1.5, 1.5, 'FD');
  setText(doc, TEXT);
  doc.text(text, boxX + padX, y + boxH - padY);
  return y + boxH + 6;
}

function drawDetailTable(doc, font, y, { loyer, charges, total }) {
  const colLabelX = M.left;
  const colValueRight = PAGE_W - M.right;
  const rowH = 8;
  const tableW = CONTENT_W;

  // En-tête
  setFill(doc, ACCENT);
  doc.rect(M.left, y, tableW, rowH, 'F');
  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  setText(doc, [255, 255, 255]);
  doc.text('Détail du paiement', colLabelX + 3, y + rowH - 2.5);
  doc.text('Montant', colValueRight - 3, y + rowH - 2.5, { align: 'right' });
  y += rowH;

  // Corps
  doc.setFont(font, 'normal');
  setText(doc, TEXT);
  setDraw(doc, [220, 220, 220]);
  doc.setLineWidth(0.2);

  const rows = [
    { label: 'Loyer hors charges', value: loyer },
    { label: 'Charges', value: charges },
  ];
  for (const row of rows) {
    doc.text(row.label, colLabelX + 3, y + rowH - 2.5);
    doc.text(`${formatMontant(row.value)} €`, colValueRight - 3, y + rowH - 2.5, {
      align: 'right',
    });
    doc.line(M.left, y + rowH, PAGE_W - M.right, y + rowH);
    y += rowH;
  }

  // Total
  doc.setFont(font, 'bold');
  setFill(doc, [248, 248, 248]);
  doc.rect(M.left, y, tableW, rowH, 'F');
  doc.text('Total perçu', colLabelX + 3, y + rowH - 2.5);
  doc.text(`${formatMontant(total)} €`, colValueRight - 3, y + rowH - 2.5, { align: 'right' });
  doc.setFont(font, 'normal');
  y += rowH;

  // Cadre extérieur
  setDraw(doc, ACCENT);
  doc.setLineWidth(0.3);
  doc.rect(M.left, y - rowH * 4, tableW, rowH * 4);

  return y + 4;
}

function drawSignatureBox(doc, font, x, y, signature) {
  const w = 70;
  const h = 28;
  setDraw(doc, [180, 180, 180]);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  setText(doc, MUTED);
  doc.text('Signature du bailleur', x, y - 2);
  setText(doc, TEXT);
  doc.setFontSize(10);
  if (signature) {
    doc.text(signature, x + 3, y + 6);
  }
  return y + h;
}

function drawFooter(doc, font, page, totalPages) {
  const footerY = PAGE_H - M.bottom + 6;
  drawSeparator(doc, footerY - 4);
  doc.setFont(font, 'normal');
  doc.setFontSize(8);
  setText(doc, MUTED);
  const mention =
    "Cette quittance annule tous les reçus délivrés en cas de paiement partiel. Conforme à l'art. 21 de la loi n° 89-462 du 6 juillet 1989.";
  const wrapped = doc.splitTextToSize(mention, CONTENT_W - 25);
  doc.text(wrapped, M.left, footerY);
  doc.text(`Page ${page} / ${totalPages}`, PAGE_W - M.right, footerY + 4, { align: 'right' });
  setText(doc, TEXT);
}

function ensureSpace(doc, font, y, required, ctx) {
  if (y + required <= PAGE_H - M.bottom - 10) return y;
  doc.addPage();
  ctx.page += 1;
  // Header light : juste un mini titre + n° en haut de page 2+
  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  setText(doc, ACCENT);
  doc.text('Quittance de loyer (suite)', M.left, M.top);
  if (ctx.numero) {
    setText(doc, TEXT);
    doc.setFont(font, 'normal');
    doc.text(ctx.numero, PAGE_W - M.right, M.top, { align: 'right' });
  }
  drawSeparator(doc, M.top + 4);
  setText(doc, TEXT);
  return M.top + 10;
}

// ---------- Helpers contenu ----------

function bailleurLines(bailleur) {
  const lines = [];
  if (bailleur.nom) lines.push(bailleur.nom);
  if (bailleur.adresse) lines.push(bailleur.adresse);
  if (bailleur.email) lines.push(`Email : ${bailleur.email}`);
  if (bailleur.telephone) lines.push(`Tél. : ${bailleur.telephone}`);
  return lines;
}

function locataireLines(locataire, bien) {
  const lines = [];
  if (locataire.nom) lines.push(locataire.nom);
  // Co-occupants (un nom par ligne — déjà au format texte libre côté UI)
  if (locataire.coOccupants) {
    const cos = String(locataire.coOccupants)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const co of cos) lines.push(co);
  }
  if (locataire.referenceBail) {
    lines.push({ text: `Bail n° ${locataire.referenceBail}`, muted: true });
  }
  if (bien?.adresse) {
    lines.push({ text: 'Adresse du logement loué :', muted: true });
    lines.push(bien.adresse);
  }
  return lines;
}

function adresseBailleurInline(bailleur) {
  if (!bailleur?.adresse) return '';
  return bailleur.adresse.replace(/\n/g, ', ');
}

// ---------- buildPDF ----------

export async function buildPDF({
  bailleur,
  bien,
  locataire,
  moisNum,
  annee,
  loyer,
  charges,
  periodeDebut,
  periodeFin,
  modeReglement,
  dateEncaissement,
  numeroQuittance = '',
  dateEmission = '',
}) {
  const doc = new jsPDF();
  const { font, fallback: fontFallback } = await applyFont(doc);

  // dateEmission attendue au format ISO 'YYYY-MM-DD' (cohérent avec periodeDebut/periodeFin
  // /dateEncaissement). Vide → on prend aujourd'hui. Le PDF l'affiche au format FR via formatDateFR.
  const dateEmissionISO = dateEmission || new Date().toISOString().slice(0, 10);
  const dateEmissionFR = formatDateFR(dateEmissionISO);
  const total = parseFloat(loyer) + parseFloat(charges);
  const moisLabel = moisTexte(moisNum, annee);
  const periodeLabel = formatPeriodFR(periodeDebut, periodeFin);
  const ctx = { page: 1, numero: numeroQuittance };

  // En-tête
  const yAfterHeader = drawHeader(doc, font, { numero: numeroQuittance, dateEmission: dateEmissionFR });

  // Blocs Bailleur / Locataire (deux colonnes)
  const xBailleur = M.left;
  const xLocataire = M.left + (CONTENT_W + 8) / 2;
  const yPartyTop = yAfterHeader + 6;
  const yAfterBailleur = drawPartyBlock(doc, font, {
    x: xBailleur,
    y: yPartyTop,
    label: 'BAILLEUR',
    lines: bailleurLines(bailleur),
  });
  const yAfterLocataire = drawPartyBlock(doc, font, {
    x: xLocataire,
    y: yPartyTop,
    label: 'LOCATAIRE',
    lines: locataireLines(locataire, bien),
  });
  let y = Math.max(yAfterBailleur, yAfterLocataire) + 6;
  drawSeparator(doc, y);
  y += 8;

  // Déclaration
  y = ensureSpace(doc, font, y, 50, ctx);
  doc.setFont(font, 'normal');
  doc.setFontSize(11);
  setText(doc, TEXT);
  const adresseInline = adresseBailleurInline(bailleur);
  const intro = adresseInline
    ? `Je soussigné(e) ${bailleur.nom || ''}, demeurant ${adresseInline}, déclare avoir reçu de ${locataire.nom || ''} la somme de ${formatMontant(total)} € (${nombreEnLettres(total)}) au titre du loyer et des charges pour le mois de ${moisLabel}.`
    : `Je soussigné(e) ${bailleur.nom || ''} déclare avoir reçu de ${locataire.nom || ''} la somme de ${formatMontant(total)} € (${nombreEnLettres(total)}) au titre du loyer et des charges pour le mois de ${moisLabel}.`;
  const introLines = doc.splitTextToSize(intro, CONTENT_W);
  doc.text(introLines, M.left, y);
  y += introLines.length * 5.5 + 4;

  // Badge période
  if (periodeLabel) {
    y = ensureSpace(doc, font, y, 16, ctx);
    y = drawPeriodBadge(doc, font, y, periodeLabel);
  }

  // Tableau détail
  y = ensureSpace(doc, font, y, 40, ctx);
  y = drawDetailTable(doc, font, y, {
    loyer: parseFloat(loyer),
    charges: parseFloat(charges),
    total,
  });

  // Mode de règlement / date encaissement
  if (modeReglement || dateEncaissement) {
    y = ensureSpace(doc, font, y, 20, ctx);
    y += 4;
    doc.setFontSize(10);
    setText(doc, TEXT);
    const drawLabeledLine = (label, value, curY) => {
      // Mesurer la largeur du label en bold (la font dans laquelle il sera réellement dessiné),
      // pour que la valeur (en normal) s'aligne précisément à droite du label.
      doc.setFont(font, 'bold');
      const labelW = doc.getTextWidth(label);
      doc.text(label, M.left, curY);
      doc.setFont(font, 'normal');
      doc.text(value, M.left + labelW, curY);
    };
    if (modeReglement) {
      drawLabeledLine('Mode de règlement : ', modeReglement, y);
      y += 6;
    }
    if (dateEncaissement) {
      drawLabeledLine("Date d'encaissement : ", formatDateFR(dateEncaissement), y);
      y += 6;
    }
  }

  // Fait à / Signature — réserve la place pour le label + le label "Signature" + la zone (28mm) + marge bas
  // 6 (espace avant) + 6 (Fait à) + 8 (avant signature) + 2 (label signature) + 28 (boîte) = 50
  y = ensureSpace(doc, font, y, 50, ctx);
  y += 6;
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  setText(doc, TEXT);
  doc.text(`Fait à ${bailleur.ville || ''}, le ${dateEmissionFR}`, M.left, y);

  // Boîte de signature alignée à droite
  const sigX = PAGE_W - M.right - 70;
  const sigY = y + 8;
  drawSignatureBox(doc, font, sigX, sigY, bailleur.signature || '');

  // Footer sur toutes les pages — utilise le compteur exact maintenu par jsPDF (au cas où une
  // primitive interne aurait ajouté une page sans passer par ensureSpace).
  const totalPages = Math.max(ctx.page, doc.getNumberOfPages());
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, font, p, totalPages);
  }

  // Nom de fichier
  const locNomSafe = (locataire.nom || 'Locataire').replace(/\s+/g, '_');
  const moisPad = String(moisNum).padStart(2, '0');
  const numPart = numeroQuittance ? `${numeroQuittance}_` : '';
  const filename = `Quittance_${numPart}${locNomSafe}_${annee}-${moisPad}.pdf`;

  return { doc, filename, fontFallback };
}
