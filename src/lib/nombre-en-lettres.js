const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const dixaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
const especiaux = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];

function convertirEntier(n) {
  if (n === 0) return 'zéro';
  if (n < 10) return unites[n];
  if (n < 20) return especiaux[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    let result = dixaines[d];
    if (d === 7 || d === 9) {
      result = dixaines[d - 1] + '-' + especiaux[u];
    } else if (u === 1 && d !== 8) {
      result += ' et un';
    } else if (u > 0) {
      result += '-' + unites[u];
    } else if (d === 8) {
      result += 's';
    }
    return result;
  }
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const reste = n % 100;
    let result = c === 1 ? 'cent' : unites[c] + ' cent';
    if (reste === 0 && c > 1) result += 's';
    if (reste > 0) result += ' ' + convertirEntier(reste);
    return result;
  }
  if (n < 1000000) {
    const m = Math.floor(n / 1000);
    const reste = n % 1000;
    let result = m === 1 ? 'mille' : convertirEntier(m) + ' mille';
    if (reste > 0) result += ' ' + convertirEntier(reste);
    return result;
  }
  return n.toString();
}

export function nombreEnLettres(nombre) {
  const parties = nombre.toFixed(2).split('.');
  const entier = parseInt(parties[0], 10);
  const centimes = parseInt(parties[1], 10);

  let resultat = convertirEntier(entier) + ' euro';
  if (entier > 1) resultat += 's';

  if (centimes > 0) {
    resultat += ' et ' + convertirEntier(centimes) + ' centime';
    if (centimes > 1) resultat += 's';
  }

  return resultat;
}
