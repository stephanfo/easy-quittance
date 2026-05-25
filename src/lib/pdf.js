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
// MUTED était [110,110,110] (~#6E6E6E) — sous le seuil WCAG AAA sur fond blanc.
// [91,91,96] (#5B5B60) atteint ~5.9:1 sur blanc, aligné avec le palette UI.
const MUTED = [91, 91, 96];

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

// Décodage léger d'une dataURL d'image pour récupérer le format et les dimensions natives.
// Renvoie null si le format n'est pas supporté ou si l'image n'a pas pu être chargée.
function detectImageFormat(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

function getImageProps(doc, dataUrl) {
  try {
    return doc.getImageProperties(dataUrl);
  } catch {
    return null;
  }
}

// Place une image dans une boîte (maxW × maxH) en préservant le ratio.
// Renvoie { drawn: bool, w, h } ; w/h sont les dimensions réellement dessinées.
function drawImageInBox(doc, dataUrl, x, y, maxW, maxH) {
  const format = detectImageFormat(dataUrl);
  if (!format) return { drawn: false, w: 0, h: 0 };
  const props = getImageProps(doc, dataUrl);
  if (!props || !props.width || !props.height) return { drawn: false, w: 0, h: 0 };
  const ratio = props.width / props.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  try {
    doc.addImage(dataUrl, format, x, y, w, h);
    return { drawn: true, w, h };
  } catch {
    return { drawn: false, w: 0, h: 0 };
  }
}

function drawHeader(doc, font, { numero, dateEmission, titre = 'QUITTANCE DE LOYER', logo = '' }) {
  // Logo bailleur optionnel en haut à gauche. Le séparateur est tracé à M.top + 12 ;
  // pour éviter tout chevauchement, on contraint la zone logo à finir 2mm au-dessus
  // (top = M.top - 2, hauteur max = 12). Largeur max 32mm pour laisser respirer le titre.
  let titleX = M.left;
  if (logo) {
    const { drawn, w } = drawImageInBox(doc, logo, M.left, M.top - 2, 32, 12);
    if (drawn) titleX = M.left + w + 6;
  }

  // Titre
  doc.setFont(font, 'bold');
  doc.setFontSize(18);
  setText(doc, ACCENT);
  doc.text(titre, titleX, M.top + 6);

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

// Trois rendus selon { signatureActive, signatureImage } :
//   - !signatureActive → nom du signataire seul (champ `signature`, fallback `nom`), pas de cadre
//   - signatureActive && signatureImage → cadre + titre + image redimensionnée + nom du signataire dessous
//   - signatureActive && !signatureImage → comportement original (cadre + titre + texte signature)
// Le label affiché est toujours `signature` (= "Nom du signataire" du formulaire) en priorité,
// avec fallback sur `nom` (= raison sociale) si le signataire n'est pas renseigné.
// Retourne le Y de fin (pour permettre au caller de mesurer l'espace consommé).
function drawSignatureBox(doc, font, x, y, { signatureActive, signatureImage, signature, nom }) {
  const labelSignataire = signature || nom || '';
  if (!signatureActive) {
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    setText(doc, TEXT);
    if (labelSignataire) doc.text(labelSignataire, x, y + 4);
    return y + 8;
  }

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

  if (signatureImage) {
    // Image dans le cadre avec une petite marge intérieure (2mm).
    const pad = 2;
    drawImageInBox(doc, signatureImage, x + pad, y + pad, w - pad * 2, h - pad * 2);
    // Nom du signataire en petit sous le cadre (lisibilité juridique).
    if (labelSignataire) {
      doc.setFontSize(8);
      setText(doc, MUTED);
      doc.text(labelSignataire, x, y + h + 4);
      setText(doc, TEXT);
      doc.setFontSize(10);
      return y + h + 6;
    }
  } else if (signature) {
    doc.text(signature, x + 3, y + 6);
  }
  return y + h;
}

const MENTION_QUITTANCE =
  "Cette quittance annule tous les reçus délivrés en cas de paiement partiel. Conforme à l'art. 21 de la loi n° 89-462 du 6 juillet 1989.";
const MENTION_RECU_DG_ENTREE =
  "Ce reçu atteste l'encaissement du dépôt de garantie prévu par l'art. 22 de la loi n° 89-462 du 6 juillet 1989. Il sera restitué dans les conditions prévues par la loi à l'issue du bail.";
const MENTION_RECU_DG_SORTIE =
  "Restitution du dépôt de garantie effectuée dans le cadre de l'art. 22 de la loi n° 89-462 du 6 juillet 1989 (modifié par la loi ALUR n° 2014-366).";

function drawFooter(doc, font, page, totalPages, mention = MENTION_QUITTANCE) {
  const footerY = PAGE_H - M.bottom + 6;
  drawSeparator(doc, footerY - 4);
  doc.setFont(font, 'normal');
  doc.setFontSize(8);
  setText(doc, MUTED);
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
  doc.text(ctx.titreSuite || 'Quittance de loyer (suite)', M.left, M.top);
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

  // En-tête (logo bailleur optionnel)
  const yAfterHeader = drawHeader(doc, font, {
    numero: numeroQuittance,
    dateEmission: dateEmissionFR,
    logo: bailleur?.logo || '',
  });

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
  drawSignatureBox(doc, font, sigX, sigY, {
    signatureActive:
      typeof bailleur?.signatureActive === 'boolean' ? bailleur.signatureActive : true,
    signatureImage: bailleur?.signatureImage || '',
    signature: bailleur?.signature || '',
    nom: bailleur?.nom || '',
  });

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

// ---------- buildRecuDGPDF ----------
// Document distinct de la quittance, mais réutilise la même mise en page (header, blocs
// bailleur/locataire, signature, footer). `sousType` ∈ { 'entree', 'sortie' }.

export async function buildRecuDGPDF({
  sousType,
  bailleur,
  bien,
  locataire,
  montantInitial,
  montantRestitue,
  retenuesTexte = '',
  dateEvenement,
  numeroRecu = '',
  dateEmission = '',
}) {
  if (sousType !== 'entree' && sousType !== 'sortie') {
    throw new Error(`sousType invalide : ${sousType}`);
  }
  const doc = new jsPDF();
  const { font, fallback: fontFallback } = await applyFont(doc);

  const dateEmissionISO = dateEmission || new Date().toISOString().slice(0, 10);
  const dateEmissionFR = formatDateFR(dateEmissionISO);
  const dateEvenementFR = dateEvenement ? formatDateFR(dateEvenement) : '';
  const titre =
    sousType === 'entree'
      ? 'REÇU DE DÉPÔT DE GARANTIE'
      : 'RESTITUTION DU DÉPÔT DE GARANTIE';
  const titreSuite =
    sousType === 'entree' ? 'Reçu DG (suite)' : 'Restitution DG (suite)';
  const mention = sousType === 'entree' ? MENTION_RECU_DG_ENTREE : MENTION_RECU_DG_SORTIE;
  const ctx = { page: 1, numero: numeroRecu, titreSuite };

  // En-tête
  const yAfterHeader = drawHeader(doc, font, {
    numero: numeroRecu,
    dateEmission: dateEmissionFR,
    titre,
    logo: bailleur?.logo || '',
  });

  // Blocs Bailleur / Locataire
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
  y = ensureSpace(doc, font, y, 30, ctx);
  doc.setFont(font, 'normal');
  doc.setFontSize(11);
  setText(doc, TEXT);

  const adresseInline = adresseBailleurInline(bailleur);
  const intro =
    sousType === 'entree'
      ? `Je soussigné(e) ${bailleur.nom || ''}${adresseInline ? `, demeurant ${adresseInline}` : ''}, déclare avoir reçu de ${locataire.nom || ''} la somme de ${formatMontant(montantInitial)} € (${nombreEnLettres(montantInitial)}) au titre du dépôt de garantie prévu par le bail${dateEvenementFR ? `, encaissée le ${dateEvenementFR}` : ''}.`
      : `Je soussigné(e) ${bailleur.nom || ''}${adresseInline ? `, demeurant ${adresseInline}` : ''}, déclare avoir restitué à ${locataire.nom || ''} la somme de ${formatMontant(montantRestitue)} € (${nombreEnLettres(montantRestitue)}) au titre du solde du dépôt de garantie${dateEvenementFR ? `, le ${dateEvenementFR}` : ''}.`;
  const introLines = doc.splitTextToSize(intro, CONTENT_W);
  doc.text(introLines, M.left, y);
  y += introLines.length * 5.5 + 6;

  // Tableau récap des montants
  y = ensureSpace(doc, font, y, 40, ctx);
  const colLabelX = M.left;
  const colValueRight = PAGE_W - M.right;
  const rowH = 8;
  setFill(doc, ACCENT);
  doc.rect(M.left, y, CONTENT_W, rowH, 'F');
  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  setText(doc, [255, 255, 255]);
  doc.text('Récapitulatif', colLabelX + 3, y + rowH - 2.5);
  doc.text('Montant', colValueRight - 3, y + rowH - 2.5, { align: 'right' });
  y += rowH;

  doc.setFont(font, 'normal');
  setText(doc, TEXT);
  setDraw(doc, [220, 220, 220]);
  doc.setLineWidth(0.2);

  const rows = [];
  rows.push({ label: 'Dépôt de garantie initial', value: montantInitial });
  if (sousType === 'sortie') {
    const retenu = Math.max(0, (Number(montantInitial) || 0) - (Number(montantRestitue) || 0));
    rows.push({ label: 'Retenues éventuelles', value: retenu });
    rows.push({ label: 'Montant restitué', value: montantRestitue, total: true });
  }
  for (const row of rows) {
    if (row.total) {
      doc.setFont(font, 'bold');
      setFill(doc, [248, 248, 248]);
      doc.rect(M.left, y, CONTENT_W, rowH, 'F');
    }
    doc.text(row.label, colLabelX + 3, y + rowH - 2.5);
    doc.text(`${formatMontant(row.value)} €`, colValueRight - 3, y + rowH - 2.5, {
      align: 'right',
    });
    doc.line(M.left, y + rowH, PAGE_W - M.right, y + rowH);
    if (row.total) doc.setFont(font, 'normal');
    y += rowH;
  }
  setDraw(doc, ACCENT);
  doc.setLineWidth(0.3);
  doc.rect(M.left, y - rowH * rows.length, CONTENT_W, rowH * rows.length);
  y += 6;

  // Retenues (texte brut multiligne) en sortie uniquement.
  // `doc.splitTextToSize` gère le wrap et les \n explicites de l'utilisateur.
  if (sousType === 'sortie' && retenuesTexte && retenuesTexte.trim()) {
    y = ensureSpace(doc, font, y, 30, ctx);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    setText(doc, ACCENT);
    doc.text('Détail des retenues', M.left, y);
    y += 6;
    setText(doc, TEXT);
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(retenuesTexte, CONTENT_W);
    doc.text(lines, M.left, y);
    y += lines.length * 5.5 + 4;
  }

  // Fait à / Signature
  y = ensureSpace(doc, font, y, 50, ctx);
  y += 6;
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  setText(doc, TEXT);
  doc.text(`Fait à ${bailleur.ville || ''}, le ${dateEmissionFR}`, M.left, y);

  const sigX = PAGE_W - M.right - 70;
  const sigY = y + 8;
  drawSignatureBox(doc, font, sigX, sigY, {
    signatureActive:
      typeof bailleur?.signatureActive === 'boolean' ? bailleur.signatureActive : true,
    signatureImage: bailleur?.signatureImage || '',
    signature: bailleur?.signature || '',
    nom: bailleur?.nom || '',
  });

  const totalPages = Math.max(ctx.page, doc.getNumberOfPages());
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, font, p, totalPages, mention);
  }

  // Nom de fichier
  const locNomSafe = (locataire.nom || 'Locataire').replace(/\s+/g, '_');
  const annee = dateEvenement ? dateEvenement.slice(0, 4) : dateEmissionISO.slice(0, 4);
  const tag = sousType === 'entree' ? 'Entree' : 'Restitution';
  const numPart = numeroRecu ? `${numeroRecu}_` : '';
  const filename = `DepotGarantie_${tag}_${numPart}${locNomSafe}_${annee}.pdf`;

  return { doc, filename, fontFallback };
}
