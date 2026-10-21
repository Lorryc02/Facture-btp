/*
 * calc.js — tous les calculs et formats numériques (fonctions pures).
 *
 * Principes :
 *  - tous les montants sont des entiers en Ariary ;
 *  - les quantités et les taux sont manipulés en centièmes entiers
 *    (1,5 → 150 ; 20 % → 2000) pour éviter les erreurs de virgule flottante ;
 *  - les produits passent par BigInt, donc exacts même pour de gros montants ;
 *  - une entrée vide ou invalide vaut 0, jamais NaN ;
 *  - la virgule et le point sont acceptés comme séparateur décimal.
 *
 * Fonctionne dans l'interface (objet global `Calc`) et dans Node (tests, main.js).
 */
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Calc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Espace insécable utilisé comme séparateur de milliers (« 1 182 000 »). */
  const ESPACE_INSECABLE = ' ';

  const MOIS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  // ---------------------------------------------------------------------------
  // Lecture des saisies
  // ---------------------------------------------------------------------------

  /**
   * Convertit une saisie (texte ou nombre) en entier de « 10^-decimales » unités,
   * arrondi au plus proche (une moitié s'arrondit en s'éloignant de zéro).
   *   versUnites('1,5', 2)     → 150
   *   versUnites('75 000', 0)  → 75000
   *   versUnites('1.234,56', 2)→ 123456
   *   versUnites('abc', 2)     → 0
   *   versUnites('150.000', 0) → 150000 (montant en Ariary : « .000 » = milliers)
   */
  function versUnites(valeur, decimales) {
    if (typeof valeur === 'number') {
      if (!Number.isFinite(valeur)) return 0;
      const texte = String(valeur);
      // Notation exponentielle (très grands / très petits nombres) : calcul direct
      if (/e/i.test(texte)) return normaliserZero(Math.round(valeur * 10 ** decimales));
      valeur = texte;
    }
    if (typeof valeur !== 'string') return 0;

    // Supprime tous les espaces (y compris insécables) et une éventuelle unité finale
    let t = valeur.replace(/\s+/g, '').replace(/(ariary|ar|mga|%)$/i, '');
    let signe = 1;
    if (/^[+-]/.test(t)) {
      if (t[0] === '-') signe = -1;
      t = t.slice(1);
    }
    if (!/^[\d.,]+$/.test(t)) return 0;

    const virgules = (t.match(/,/g) || []).length;
    const points = (t.match(/\./g) || []).length;
    let entier = t;
    let fraction = '';

    if (virgules > 0 && points > 0) {
      // Les deux séparateurs : le dernier est la décimale, les autres séparent les milliers
      // (le séparateur décimal ne doit apparaître qu'une fois : « 1.234,56 » oui, « 1,2.3,4 » non)
      const pos = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
      if ((t[pos] === ',' ? virgules : points) !== 1) return 0;
      entier = t.slice(0, pos).replace(/[.,]/g, '');
      fraction = t.slice(pos + 1);
    } else if (virgules + points > 1) {
      // Un seul type de séparateur répété (1.234.567) : séparateurs de milliers
      entier = t.replace(/[.,]/g, '');
    } else if (virgules + points === 1 && decimales === 0 && /^\d{1,3}[.,]\d{3}$/.test(t)) {
      // Montant entier écrit à la malgache : « 150.000 » ou « 45,000 » = milliers
      entier = t.replace(/[.,]/, '');
    } else if (virgules + points === 1) {
      const pos = t.search(/[.,]/);
      entier = t.slice(0, pos);
      fraction = t.slice(pos + 1);
    }

    if (!/\d/.test(entier + fraction)) return 0;

    // Garde « decimales » chiffres après la virgule, le suivant sert à l'arrondi
    const chiffresFraction = (fraction + '0'.repeat(decimales + 1)).slice(0, decimales + 1);
    const base = Number((entier || '0') + chiffresFraction.slice(0, decimales));
    const resultat = base + (Number(chiffresFraction[decimales]) >= 5 ? 1 : 0);
    if (!Number.isSafeInteger(resultat)) return 0;
    return normaliserZero(signe * resultat);
  }

  /** Évite le « -0 » de JavaScript. */
  function normaliserZero(n) {
    return n === 0 ? 0 : n;
  }

  /** Saisie → entier (Ariary). « 75 000 » → 75000 ; « 12,6 » → 13. */
  function lireEntier(valeur) {
    return versUnites(valeur, 0);
  }

  /** Saisie → centièmes entiers. « 3 » → 300 ; « 1,25 » → 125 ; « 20 % » → 2000. */
  function lireCentiemes(valeur) {
    return versUnites(valeur, 2);
  }

  /** Saisie → nombre décimal à 2 décimales au plus. « 1,255 » → 1.26. */
  function lireDecimal(valeur) {
    return lireCentiemes(valeur) / 100;
  }

  /** Borne une valeur entre un minimum et un maximum. */
  function borner(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  // ---------------------------------------------------------------------------
  // Calculs
  // ---------------------------------------------------------------------------

  /**
   * Division entière arrondie au plus proche (moitié : loin de zéro), exacte grâce à BigInt.
   * diviserArrondi(150, 100) → 2 ; diviserArrondi(149, 100) → 1.
   */
  function diviserArrondi(numerateur, denominateur) {
    const n = BigInt(numerateur);
    const d = BigInt(denominateur);
    if (d === 0n) return 0;
    const negatif = (n < 0n) !== (d < 0n);
    const an = n < 0n ? -n : n;
    const ad = d < 0n ? -d : d;
    const q = (2n * an + ad) / (2n * ad);
    return normaliserZero(Number(negatif ? -q : q));
  }

  /**
   * Montant d'une ligne = arrondi(quantité × prix unitaire), en Ariary entiers.
   * La quantité est calculée en centièmes entiers : montantLigne('3', '90 000') → 270000.
   */
  function montantLigne(quantite, prixUnitaire) {
    const q = lireCentiemes(quantite);
    const pu = lireEntier(prixUnitaire);
    return diviserArrondi(BigInt(q) * BigInt(pu), 100);
  }

  /**
   * Un acompte : en pourcentage du TTC ou en montant fixe, borné entre 0 et le TTC.
   * @param {number} ttc total TTC (entier)
   * @param {{mode: 'pourcent'|'montant', pourcent: *, montant: *}} acompte
   * @returns {{montant: number, pourcent: number}} montant entier, pourcentage à 2 décimales
   */
  function calculerAcompte(ttc, acompte) {
    const a = acompte || {};
    const base = Math.max(0, Math.round(Number(ttc)) || 0);
    if (a.mode === 'montant') {
      const montant = borner(lireEntier(a.montant), 0, base);
      const centiemes = base > 0 ? diviserArrondi(BigInt(montant) * 10000n, base) : 0;
      return { montant, pourcent: centiemes / 100 };
    }
    const centiemes = borner(lireCentiemes(a.pourcent), 0, 10000);
    const montant = borner(diviserArrondi(BigInt(base) * BigInt(centiemes), 10000), 0, base);
    return { montant, pourcent: centiemes / 100 };
  }

  /**
   * Échéancier d'acomptes (autant qu'on veut : 20 %, 30 %, 50 %…).
   *  - Les acomptes en % sont arrondis sur leur cumul : 20 % + 30 % + 50 % font
   *    exactement le TTC, sans écart d'un ariary.
   *  - Les acomptes marqués « déduit » sont retirés du TTC, dans l'ordre, sans jamais
   *    rendre le reste à payer négatif (un acompte qui dépasse est plafonné).
   * @returns {{ lignes: Array<{montant, pourcent, deduit, montantDeduit, pourcentDeduit, plafonne}>,
   *             totalDeduit: number, totalPourcent: number, totalMontants: number }}
   */
  function calculerAcomptes(ttc, acomptes) {
    const base = Math.max(0, Math.round(Number(ttc)) || 0);
    const liste = Array.isArray(acomptes) ? acomptes : [];
    let disponible = base;
    let totalDeduit = 0;
    let totalCentiemes = 0;
    let totalMontants = 0;
    let cumulCentiemes = 0; // cumul des acomptes en %
    let cumulMontant = 0;   // montant cumulé arrondi correspondant
    const lignes = liste.map((a) => {
      let montant;
      let pourcent;
      if (a && a.mode === 'montant') {
        ({ montant, pourcent } = calculerAcompte(base, a));
      } else {
        const centiemes = borner(lireCentiemes(a && a.pourcent), 0, 10000);
        cumulCentiemes += centiemes;
        const totalCumule = diviserArrondi(BigInt(base) * BigInt(cumulCentiemes), 10000);
        montant = borner(totalCumule - cumulMontant, 0, base);
        cumulMontant = totalCumule;
        pourcent = centiemes / 100;
      }
      const deduit = !!(a && a.deduit);
      const montantDeduit = deduit ? Math.min(montant, disponible) : 0;
      disponible -= montantDeduit;
      totalDeduit += montantDeduit;
      totalMontants += montant;
      totalCentiemes += Math.round(pourcent * 100);
      return {
        montant,
        pourcent,
        deduit,
        montantDeduit,
        pourcentDeduit: base > 0 ? diviserArrondi(BigInt(montantDeduit) * 10000n, base) / 100 : 0,
        plafonne: deduit && montantDeduit < montant
      };
    });
    return { lignes, totalDeduit, totalPourcent: totalCentiemes / 100, totalMontants };
  }

  /**
   * Tous les totaux d'un document.
   *  HT = somme des lignes ; TVA = arrondi(HT × taux) ; TTC = HT + TVA ;
   *  reste à payer = TTC − acomptes déduits ;
   *  montant arrêté (phrase « Arrêtée… ») = reste à payer (= TTC s'il n'y a aucun acompte déduit,
   *  ce qui est le cas par défaut d'un devis ; = HT si la TVA est désactivée).
   */
  function calculerTotaux(doc) {
    const d = doc || {};
    const lignes = Array.isArray(d.lignes) ? d.lignes : [];
    const montants = lignes.map((l) => montantLigne(l && l.quantite, l && l.prixUnitaire));
    const ht = montants.reduce((somme, m) => somme + m, 0);

    const tvaActive = !!(d.tva && d.tva.active);
    const tauxCentiemes = tvaActive ? borner(lireCentiemes(d.tva.taux), 0, 10000) : 0;
    const tva = tvaActive ? diviserArrondi(BigInt(ht) * BigInt(tauxCentiemes), 10000) : 0;
    const ttc = ht + tva;

    const echeancier = calculerAcomptes(ttc, d.acomptes);
    const reste = ttc - echeancier.totalDeduit;
    return {
      montants,
      ht,
      tvaActive,
      taux: tauxCentiemes / 100,
      tva,
      ttc,
      acomptes: echeancier.lignes,
      totalAcomptes: echeancier.totalDeduit,
      pourcentEcheancier: echeancier.totalPourcent,
      montantEcheancier: echeancier.totalMontants,
      reste,
      arrete: reste
    };
  }

  // ---------------------------------------------------------------------------
  // Formats d'affichage
  // ---------------------------------------------------------------------------

  /** Insère une espace insécable tous les 3 chiffres : « 1182000 » → « 1 182 000 ». */
  function separerMilliers(chiffres) {
    return chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_INSECABLE);
  }

  /** Montant entier en Ariary, sans décimales : 1182000 → « 1 182 000 ». */
  function formaterMontant(n) {
    const v = Math.round(Number(n)) || 0;
    const texte = separerMilliers(String(Math.abs(v)));
    return v < 0 ? '-' + texte : texte;
  }

  /** Quantité avec 2 décimales et virgule : « 3 » → « 3,00 » ; 1250.5 → « 1 250,50 ». */
  function formaterQuantite(valeur) {
    const c = lireCentiemes(valeur);
    const abs = Math.abs(c);
    const texte = separerMilliers(String(Math.floor(abs / 100))) + ',' + String(abs % 100).padStart(2, '0');
    return c < 0 ? '-' + texte : texte;
  }

  /** Pourcentage sans zéros inutiles : 20 → « 20 » ; 33.33 → « 33,33 » ; 12.5 → « 12,5 ». */
  function formaterPourcent(valeur) {
    const c = lireCentiemes(valeur);
    const abs = Math.abs(c);
    let texte = separerMilliers(String(Math.floor(abs / 100)));
    const reste = abs % 100;
    if (reste) texte += ',' + String(reste).padStart(2, '0').replace(/0$/, '');
    return c < 0 ? '-' + texte : texte;
  }

  /** Date ISO « 2026-09-14 » → « 14 Septembre 2026 » (« 1er » pour le premier du mois). */
  function formaterDateLongue(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    const jour = Number(m[3]);
    const mois = Number(m[2]);
    if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return '';
    return (jour === 1 ? '1er' : String(jour)) + ' ' + MOIS[mois - 1] + ' ' + m[1];
  }

  /** Date locale au format ISO « AAAA-MM-JJ ». */
  function dateIso(date) {
    const d = date instanceof Date ? date : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // Numéros et noms de fichiers
  // ---------------------------------------------------------------------------

  /**
   * Incrémente le premier entier trouvé dans un numéro, en gardant les zéros de tête.
   *   « 48 /ERZ/ FACPRO /26 » → « 49 /ERZ/ FACPRO /26 » ; « D-009 » → « D-010 ».
   */
  function incrementerNumero(numero) {
    const texte = String(numero == null ? '' : numero);
    const m = /\d+/.exec(texte);
    if (!m) return texte.trim() ? texte.trim() + ' 1' : '1';
    const suivant = (BigInt(m[0]) + 1n).toString().padStart(m[0].length, '0');
    return texte.slice(0, m.index) + suivant + texte.slice(m.index + m[0].length);
  }

  /**
   * Nom de fichier PDF proposé : (« facture », « 48 /ERZ/ FACPRO /26 »)
   * → « Facture-48-ERZ-FACPRO-26.pdf ».
   */
  function nomFichierPdf(type, numero) {
    const prefixe = type === 'devis' ? 'Devis' : 'Facture';
    const partie = String(numero == null ? '' : numero)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return (partie ? prefixe + '-' + partie : prefixe) + '.pdf';
  }

  return {
    ESPACE_INSECABLE,
    MOIS,
    versUnites,
    lireEntier,
    lireCentiemes,
    lireDecimal,
    borner,
    diviserArrondi,
    montantLigne,
    calculerAcompte,
    calculerAcomptes,
    calculerTotaux,
    separerMilliers,
    formaterMontant,
    formaterQuantite,
    formaterPourcent,
    formaterDateLongue,
    dateIso,
    incrementerNumero,
    nomFichierPdf
  };
});
