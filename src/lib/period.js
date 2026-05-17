import { moisNom } from './format.js';

export function lastDayOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

export function defaultPeriod(moisNum, annee) {
  const m = String(moisNum).padStart(2, '0');
  const last = lastDayOfMonth(annee, moisNum);
  return {
    debut: `${annee}-${m}-01`,
    fin: `${annee}-${m}-${String(last).padStart(2, '0')}`,
  };
}

function ordinal(n) {
  return n === 1 ? '1er' : String(n);
}

export function formatPeriodFR(debut, fin) {
  if (!debut || !fin) return '';
  const [yd, md, dd] = debut.split('-').map(Number);
  const [yf, mf, df] = fin.split('-').map(Number);

  const dDeb = ordinal(dd);
  const dFin = ordinal(df);

  if (yd === yf && md === mf) {
    return `du ${dDeb} au ${dFin} ${moisNom(md)} ${yd}`;
  }
  if (yd === yf) {
    return `du ${dDeb} ${moisNom(md)} au ${dFin} ${moisNom(mf)} ${yd}`;
  }
  return `du ${dDeb} ${moisNom(md)} ${yd} au ${dFin} ${moisNom(mf)} ${yf}`;
}
