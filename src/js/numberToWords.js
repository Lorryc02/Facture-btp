/*
 * numberToWords.js — conversion d'un nombre entier en lettres (français standard).
 *
 * Règles appliquées (comme sur le modèle de facture) :
 *  - MAJUSCULES, SANS traits d'union : « CENT QUATRE VINGT DEUX MILLE » ;
 *  - « ET UN » pour 21, 31, 41, 51, 61 et « ET ONZE » pour 71 ; 81 = « QUATRE VINGT UN » ;
 *  - MILLE est invariable ; « UN MILLION », « DEUX MILLIONS » (idem MILLIARD) ;
 *  - VINGT et CENT prennent un S seulement quand ils terminent le nombre,
 *    ou devant MILLION / MILLIARD (jamais devant MILLE) ;
 *  - un montant qui se termine par MILLION(S) ou MILLIARD(S) pile prend « D' » :
 *    « DEUX MILLIONS D'ARIARY ».
 * Plage gérée : 0 à 999 999 999 999.
 *
 * Fonctionne à la fois dans l'interface (objet global `NombreEnLettres`)
 * et dans Node (module.exports) pour les tests.
 */
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.NombreEnLettres = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAXIMUM = 999999999999;

  const UNITES = [
    'ZERO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF',
    'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE'
  ];
  const DIZAINES = { 2: 'VINGT', 3: 'TRENTE', 4: 'QUARANTE', 5: 'CINQUANTE', 6: 'SOIXANTE' };

  /**
   * Nombre de 0 à 99 en lettres.
   * @param {number} n
   * @param {boolean} final vrai si rien ne suit dans le groupe (pour « QUATRE VINGTS »)
   */
  function deuxChiffres(n, final) {
    if (n < 17) return UNITES[n];
    if (n < 20) return 'DIX ' + UNITES[n - 10];

    const dizaine = Math.floor(n / 10);
    const unite = n % 10;

    // 70 à 79 : SOIXANTE + (10 à 19) ; 71 = SOIXANTE ET ONZE
    if (dizaine === 7) {
      if (unite === 1) return 'SOIXANTE ET ONZE';
      return 'SOIXANTE ' + deuxChiffres(10 + unite, false);
    }
    // 80 à 89 : QUATRE VINGT(S) ; jamais de « ET » (81 = QUATRE VINGT UN)
    if (dizaine === 8) {
      if (unite === 0) return final ? 'QUATRE VINGTS' : 'QUATRE VINGT';
      return 'QUATRE VINGT ' + UNITES[unite];
    }
    // 90 à 99 : QUATRE VINGT + (10 à 19) ; 91 = QUATRE VINGT ONZE
    if (dizaine === 9) return 'QUATRE VINGT ' + deuxChiffres(10 + unite, false);

    // 20 à 69
    const mot = DIZAINES[dizaine];
    if (unite === 0) return mot;
    if (unite === 1) return mot + ' ET UN';
    return mot + ' ' + UNITES[unite];
  }

  /**
   * Nombre de 1 à 999 en lettres.
   * @param {number} n
   * @param {boolean} final vrai si le groupe termine le nombre ou précède MILLION/MILLIARD
   *                        (VINGT et CENT prennent alors un S s'ils sont en fin de groupe)
   */
  function troisChiffres(n, final) {
    const centaine = Math.floor(n / 100);
    const reste = n % 100;
    let mots = '';
    if (centaine > 0) {
      mots = centaine === 1 ? 'CENT' : UNITES[centaine] + ' CENT';
      if (reste === 0) return centaine > 1 && final ? mots + 'S' : mots;
      mots += ' ';
    }
    return mots + deuxChiffres(reste, final);
  }

  /** Vérifie que la valeur est un entier dans la plage gérée. */
  function verifier(n) {
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      throw new TypeError('Le nombre doit être un entier : ' + n);
    }
    if (Math.abs(n) > MAXIMUM) {
      throw new RangeError('Nombre trop grand (maximum 999 999 999 999) : ' + n);
    }
  }

  /**
   * Nombre entier → lettres, sans unité monétaire.
   * nombreEnLettres(1182000) → « UN MILLION CENT QUATRE VINGT DEUX MILLE »
   */
  function nombreEnLettres(n) {
    verifier(n);
    if (n < 0) return 'MOINS ' + nombreEnLettres(-n);
    if (n === 0) return UNITES[0];

    const milliards = Math.floor(n / 1e9);
    const millions = Math.floor(n / 1e6) % 1000;
    const milliers = Math.floor(n / 1e3) % 1000;
    const unites = n % 1000;
    const parties = [];

    if (milliards) parties.push(troisChiffres(milliards, true) + (milliards > 1 ? ' MILLIARDS' : ' MILLIARD'));
    if (millions) parties.push(troisChiffres(millions, true) + (millions > 1 ? ' MILLIONS' : ' MILLION'));
    if (milliers) parties.push(milliers === 1 ? 'MILLE' : troisChiffres(milliers, false) + ' MILLE');
    if (unites) parties.push(troisChiffres(unites, true));

    return parties.join(' ');
  }

  /**
   * Montant entier → lettres suivi de la devise.
   * montantEnLettres(2000000) → « DEUX MILLIONS D'ARIARY »
   * montantEnLettres(0)       → « ZERO ARIARY »
   */
  function montantEnLettres(n, devise) {
    const monnaie = devise || 'ARIARY';
    const lettres = nombreEnLettres(n);
    // Se termine par MILLION(S) ou MILLIARD(S) pile → « D' » (ou « DE » devant une consonne)
    const pile = n !== 0 && n % 1e6 === 0;
    if (!pile) return lettres + ' ' + monnaie;
    return lettres + (/^[AEIOUYH]/i.test(monnaie) ? " D'" : ' DE ') + monnaie;
  }

  /**
   * Phrase d'arrêté selon le type de document (grammaire correcte) :
   *  facture → « Arrêtée la présente facture à la somme de: … ARIARY »
   *  devis   → « Arrêté le présent devis à la somme de: … ARIARY »
   */
  function phraseArrete(type, montant) {
    const debut = type === 'devis'
      ? 'Arrêté le présent devis à la somme de: '
      : 'Arrêtée la présente facture à la somme de: ';
    return debut + montantEnLettres(montant);
  }

  return { MAXIMUM, nombreEnLettres, montantEnLettres, phraseArrete };
});
