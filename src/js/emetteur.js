/*
 * emetteur.js — en-tête FIXE de l'émetteur (non éditable dans l'application).
 *
 * Pour changer l'adresse, le téléphone, le NIF… modifiez UNIQUEMENT ce fichier,
 * puis relancez l'application (ou refaites le build pour l'exécutable).
 * Les espaces sont conservés tels quels à l'affichage (ex. « 0254206/DGI-M  du »).
 */
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Emetteur = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return Object.freeze({
    /** Première ligne de l'en-tête (police serif grasse, en bleu). */
    nom: 'RAZAFIMAHEFA Harry Luc',

    /** Lignes suivantes de l'en-tête (sans-serif grasse, petite taille, en bleu). */
    lignes: Object.freeze([
      'LOT IVP 51 TER LAZAINA',
      'TEL : 034 13 432 23',
      'STAT :46101 11 1994 0 00930',
      'CP N° 0254206/DGI-M  du 31/07/25',
      'NIF N° 4000584623',
      'E-mail : erztech@moov.mg / rharryluc@gmail.com',
      'Antananarivo 101'
    ]),

    /** Cachet imprimé en bas à droite, sous la signature (comme sur le modèle). */
    cachet: Object.freeze({
      nom: 'RAZAFIMAHEFA',
      lignes: Object.freeze([
        'LOT IVP 51 TER LAZAINA',
        'TEL : 034 13 432 23',
        'STAT : 46101 11 1994 0 00930',
        'CP N° 0254206/DGI-M du 31/07/25',
        'NIF N° 4000584623'
      ])
    }),

    /** Ville proposée devant la date. */
    villeParDefaut: 'Antananarivo',

    /** Compte bancaire pré-rempli pour le virement. */
    banqueParDefaut: Object.freeze({ banque: 'BRED', compte: '00008 00016 05003027539 68' }),

    /**
     * Échéancier proposé par le bouton « Échéancier 20 / 30 / 50 » de la fenêtre « Acomptes »
     * (pourcentages et libellés restent modifiables dans chaque document).
     */
    echeancierType: Object.freeze([
      Object.freeze({ pourcent: 20, libelle: 'Début des travaux' }),
      Object.freeze({ pourcent: 30, libelle: 'Mi-parcours des travaux' }),
      Object.freeze({ pourcent: 50, libelle: 'Fin des travaux' })
    ]),

    /**
     * Numéro proposé quand aucun document de ce type n'existe encore
     * ({AA} = deux derniers chiffres de l'année en cours).
     */
    numeroParDefaut: Object.freeze({
      facture: '1 /ERZ/ FACPRO /{AA}',
      devis: '1 /ERZ/ DEVIS /{AA}'
    })
  });
});
