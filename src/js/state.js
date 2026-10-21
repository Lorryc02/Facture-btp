/*
 * state.js — état du document : structure, valeurs par défaut, normalisation,
 * sérialisation JSON, document d'exemple et petit « magasin » observable.
 *
 * Structure d'un document (enregistré tel quel en JSON) :
 * {
 *   version, id, type: 'facture' | 'devis', numero, ville, date: 'AAAA-MM-JJ',
 *   destinataire, objet,
 *   lignes: [{ designation, unite, quantite: nombre|null, prixUnitaire: entier|null }],
 *   tva: { active, taux },
 *   acomptes: [{ libelle, mode: 'pourcent' | 'montant', pourcent, montant, deduit }],
 *   paiement: { especes, virement: { actif, banque, compte } },
 *   afficherCachet, afficherSignature,
 *   payee, payeeLe,                          (factures : réglée ou non, pour l'historique)
 *   origine: { id, type, numero } | null,   (devis facturé, facture précédente…)
 *   creeLe, modifieLe
 * }
 */
(function (racine, fabrique) {
  'use strict';
  const estNode = typeof module === 'object' && module.exports;
  const api = estNode
    ? fabrique(require('./calc.js'), require('./emetteur.js'))
    : fabrique(racine.Calc, racine.Emetteur);
  if (estNode) module.exports = api;
  else racine.Etat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Calc, Emetteur) {
  'use strict';

  const VERSION = 1;

  /** Ligne vide (unité, quantité et prix à saisir). */
  function nouvelleLigne() {
    return { designation: '', unite: '', quantite: null, prixUnitaire: null };
  }

  /**
   * Nouvel acompte de l'échéancier.
   * @param {number} pourcent pourcentage du TTC
   * @param {string} libelle ex. « Début des travaux »
   * @param {boolean} deduit retiré du total sur ce document
   */
  function nouvelAcompte(pourcent, libelle, deduit) {
    return { libelle: libelle || '', mode: 'pourcent', pourcent: pourcent || 0, montant: 0, deduit: !!deduit };
  }

  /**
   * Échéancier type 20 / 30 / 50 (emetteur.js). Sur une facture, seul le premier
   * acompte est déduit (première facture) ; sur un devis, aucun.
   */
  function echeancierType(type) {
    return Emetteur.echeancierType.map((e, i) => nouvelAcompte(e.pourcent, e.libelle, type === 'facture' && i === 0));
  }

  /**
   * Reprend un échéancier pour un NOUVEAU chantier : mêmes pourcentages et libellés ;
   * un acompte saisi en Ar est converti en pourcentage (son montant ne vaut que pour
   * l'ancien chantier) ; déductions remises à zéro (facture : seul le premier est déduit).
   * @param {Array} acomptes échéancier du document précédent
   * @param {string} type type du nouveau document
   * @param {object} [totaux] Calc.calculerTotaux du document précédent (pour la conversion)
   */
  function echeancierPourNouveau(acomptes, type, totaux) {
    return (acomptes || []).map((a, i) => {
      const enPourcent = a.mode === 'montant' && totaux && totaux.acomptes[i] ? totaux.acomptes[i].pourcent : a.pourcent;
      return Object.assign({}, a, {
        mode: 'pourcent',
        pourcent: a.mode === 'montant' ? enPourcent : a.pourcent,
        montant: 0,
        deduit: type === 'facture' && i === 0
      });
    });
  }

  /** Même chantier, première facture : on garde l'échéancier tel quel, seul le premier acompte est déduit. */
  function deductionPremiereFacture(acomptes) {
    return (acomptes || []).map((a, i) => Object.assign({}, a, { deduit: i === 0 }));
  }

  /** Facture suivante du même chantier : l'acompte suivant non encore déduit est déduit en plus. */
  function deductionSuivante(acomptes) {
    const liste = (acomptes || []).map((a) => Object.assign({}, a));
    const suivant = liste.find((a) => !a.deduit);
    if (suivant) suivant.deduit = true;
    return liste;
  }

  /** Numéro proposé par défaut pour un type donné (année courante). */
  function numeroParDefaut(type, date) {
    const annee = String((date instanceof Date ? date : new Date()).getFullYear()).slice(-2);
    return (Emetteur.numeroParDefaut[type] || Emetteur.numeroParDefaut.facture).replace('{AA}', annee);
  }

  /** Document vierge avec les valeurs par défaut. */
  function documentVierge() {
    return {
      version: VERSION,
      id: null,
      type: 'facture',
      numero: numeroParDefaut('facture'),
      ville: Emetteur.villeParDefaut,
      date: Calc.dateIso(new Date()),
      destinataire: '',
      objet: '',
      lignes: [nouvelleLigne()],
      tva: { active: true, taux: 20 },
      acomptes: [],
      paiement: {
        especes: false,
        virement: { actif: true, banque: Emetteur.banqueParDefaut.banque, compte: Emetteur.banqueParDefaut.compte }
      },
      afficherCachet: true,
      afficherSignature: true,
      payee: false,
      payeeLe: null,
      origine: null,
      creeLe: null,
      modifieLe: null
    };
  }

  // Petites aides de normalisation (protègent contre un JSON incomplet ou abîmé)
  const texte = (v, defaut) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : defaut));
  const booleen = (v, defaut) => (typeof v === 'boolean' ? v : defaut);
  const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const nombreOuNul = (v, lecteur) => (v === null || v === undefined || v === '' ? null : lecteur(v));

  /** Ligne normalisée : quantité à 2 décimales, prix unitaire entier, ou null si vide. */
  function normaliserLigne(ligne) {
    const l = objet(ligne);
    return {
      designation: texte(l.designation, ''),
      unite: texte(l.unite, ''),
      quantite: nombreOuNul(l.quantite, Calc.lireDecimal),
      prixUnitaire: nombreOuNul(l.prixUnitaire, Calc.lireEntier)
    };
  }

  /** Acompte normalisé (pourcentage à 2 décimales ou montant entier). */
  function normaliserAcompte(acompte) {
    const a = objet(acompte);
    return {
      libelle: texte(a.libelle, ''),
      mode: a.mode === 'montant' ? 'montant' : 'pourcent',
      pourcent: Calc.lireDecimal(a.pourcent),
      montant: Calc.lireEntier(a.montant),
      deduit: booleen(a.deduit, false)
    };
  }

  /**
   * Échéancier normalisé. Les documents de la première version avaient une seule
   * « avance » : elle devient un acompte déduit.
   */
  function normaliserAcomptes(source) {
    if (Array.isArray(source.acomptes)) return source.acomptes.map(normaliserAcompte);
    const avance = objet(source.avance);
    const valeur = avance.mode === 'montant' ? Calc.lireEntier(avance.montant) : Calc.lireDecimal(avance.pourcent);
    if (valeur > 0) return [Object.assign(normaliserAcompte(avance), { deduit: true })];
    return [];
  }

  /** Document d'origine (devis facturé, facture précédente) ou null. */
  function normaliserOrigine(origine) {
    const o = objet(origine);
    if (typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(o.id)) return null;
    return { id: o.id, type: o.type === 'devis' ? 'devis' : 'facture', numero: texte(o.numero, '') };
  }

  /** Complète et corrige un document lu sur disque. */
  function normaliser(source) {
    const s = objet(source);
    const defaut = documentVierge();
    const tva = objet(s.tva);
    const paiement = objet(s.paiement);
    const vir = objet(paiement.virement);
    const lignes = Array.isArray(s.lignes) ? s.lignes.map(normaliserLigne) : [];
    return {
      version: VERSION,
      id: typeof s.id === 'string' && /^[A-Za-z0-9_-]+$/.test(s.id) ? s.id : null,
      type: s.type === 'devis' ? 'devis' : 'facture',
      numero: texte(s.numero, defaut.numero),
      ville: texte(s.ville, defaut.ville),
      date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : defaut.date,
      destinataire: texte(s.destinataire, ''),
      objet: texte(s.objet, ''),
      lignes: lignes.length ? lignes : [nouvelleLigne()],
      tva: {
        active: booleen(tva.active, true),
        taux: tva.taux === undefined ? 20 : Calc.borner(Calc.lireDecimal(tva.taux), 0, 100)
      },
      acomptes: normaliserAcomptes(s),
      paiement: {
        especes: booleen(paiement.especes, false),
        virement: {
          actif: booleen(vir.actif, defaut.paiement.virement.actif),
          banque: texte(vir.banque, defaut.paiement.virement.banque),
          compte: texte(vir.compte, defaut.paiement.virement.compte)
        }
      },
      afficherCachet: booleen(s.afficherCachet, true),
      afficherSignature: booleen(s.afficherSignature, true),
      payee: booleen(s.payee, false),
      payeeLe: /^\d{4}-\d{2}-\d{2}$/.test(s.payeeLe) ? s.payeeLe : null,
      origine: normaliserOrigine(s.origine),
      creeLe: texte(s.creeLe, null),
      modifieLe: texte(s.modifieLe, null)
    };
  }

  /** Copie profonde (le document ne contient que des données JSON). */
  function cloner(doc) {
    return JSON.parse(JSON.stringify(doc));
  }

  function serialiser(doc) {
    return JSON.stringify(doc, null, 2);
  }

  function deserialiser(json) {
    return normaliser(JSON.parse(json));
  }

  /** Empreinte servant à détecter les modifications (ignore les horodatages). */
  function empreinte(doc) {
    const copie = Object.assign({}, doc, { modifieLe: null });
    return JSON.stringify(copie);
  }

  /** Premier non vide des lignes du destinataire (= nom du client). */
  function nomClient(doc) {
    const lignes = String((doc && doc.destinataire) || '').split(/\r?\n/).map((l) => l.trim());
    return lignes.find((l) => l) || '';
  }

  /** Document d'exemple : la facture du modèle (VIVO ENERGIE, n° 48, 14 septembre 2026). */
  function documentExemple() {
    const doc = documentVierge();
    Object.assign(doc, {
      type: 'facture',
      numero: '48 /ERZ/ FACPRO /26',
      ville: 'Antananarivo',
      date: '2026-09-14',
      destinataire: [
        'VIVO ENERGIE Madagascar',
        'Bâtiment B4 - Golden Business Center',
        'Lot II I 1A Bis , Morarano Alarobia',
        'Stat : 47301 11 1999 0 10890',
        'Nif : 4000711770'
      ].join('\n'),
      objet: "Confection meuble pour EPP Anosizato y compris main d'oeuvre peinture suivant Ral Vivo",
      lignes: [
        { designation: 'Canape 3 places', unite: 'U/te', quantite: 1, prixUnitaire: 75000 },
        { designation: 'Canape 2 places', unite: 'U/te', quantite: 1, prixUnitaire: 60000 },
        { designation: 'Canape 1 places', unite: 'U/te', quantite: 1, prixUnitaire: 50000 },
        { designation: 'Table basse', unite: 'U/te', quantite: 1, prixUnitaire: 50000 },
        { designation: 'Etageres', unite: 'U/te', quantite: 3, prixUnitaire: 90000 },
        {
          designation: 'Mise en application peinture DECOSOIE chez Batpro suivant Ral Vivo '
            + '( bleu , vert , jaune )  y compris  toutes sujétion de mise en oeuvres',
          unite: 'L',
          quantite: 5,
          prixUnitaire: 96000
        }
      ]
    });
    return doc;
  }

  /**
   * Magasin observable : détient le document courant et sait s'il a été modifié
   * depuis le dernier enregistrement (ou la dernière ouverture).
   */
  function creerMagasin() {
    let doc = documentVierge();
    let reference = empreinte(doc);
    const abonnes = new Set();

    const notifier = (raison) => abonnes.forEach((fn) => fn(doc, raison));

    return {
      get doc() { return doc; },
      /** Remplace le document ; `enregistre` indique s'il correspond à la version sur disque. */
      remplacer(nouveau, enregistre) {
        doc = normaliser(nouveau);
        if (enregistre) reference = empreinte(doc);
        else reference = null;
        notifier('remplacement');
      },
      /** Applique une modification au document courant. */
      modifier(mutateur, raison) {
        mutateur(doc);
        notifier(raison || 'modification');
      },
      /**
       * Marque le document comme enregistré. `version` = copie réellement envoyée au disque :
       * ce qui a été tapé pendant l'enregistrement reste « non enregistré ».
       */
      marquerEnregistre(version) {
        reference = empreinte(version || doc);
        notifier('enregistrement');
      },
      /** Modifie le document sans changer son état « enregistré / non enregistré » (ex. statut payé). */
      synchroniser(mutateur) {
        const etaitModifie = this.estModifie();
        mutateur(doc);
        if (!etaitModifie) reference = empreinte(doc);
        notifier('synchronisation');
      },
      estModifie() {
        return reference === null || empreinte(doc) !== reference;
      },
      abonner(fn) {
        abonnes.add(fn);
        return () => abonnes.delete(fn);
      }
    };
  }

  return {
    VERSION,
    nouvelleLigne,
    nouvelAcompte,
    echeancierType,
    echeancierPourNouveau,
    deductionPremiereFacture,
    deductionSuivante,
    numeroParDefaut,
    documentVierge,
    documentExemple,
    normaliser,
    normaliserLigne,
    cloner,
    serialiser,
    deserialiser,
    empreinte,
    nomClient,
    creerMagasin
  };
});
