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
 *   avance: { mode: 'pourcent' | 'montant', pourcent, montant },
 *   paiement: { especes, mobileMoney: { actif, operateur, numero },
 *               virement: { actif, banque, compte } },
 *   afficherCachet, afficherSignature, creeLe, modifieLe
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
      avance: { mode: 'pourcent', pourcent: 0, montant: 0 },
      paiement: {
        especes: false,
        mobileMoney: { actif: false, operateur: Emetteur.operateursMobileMoney[0], numero: '' },
        virement: { actif: true, banque: Emetteur.banqueParDefaut.banque, compte: Emetteur.banqueParDefaut.compte }
      },
      afficherCachet: true,
      afficherSignature: true,
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

  /** Complète et corrige un document lu sur disque. */
  function normaliser(source) {
    const s = objet(source);
    const defaut = documentVierge();
    const tva = objet(s.tva);
    const avance = objet(s.avance);
    const paiement = objet(s.paiement);
    const mm = objet(paiement.mobileMoney);
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
      avance: {
        mode: avance.mode === 'montant' ? 'montant' : 'pourcent',
        pourcent: Calc.lireDecimal(avance.pourcent),
        montant: Calc.lireEntier(avance.montant)
      },
      paiement: {
        especes: booleen(paiement.especes, false),
        mobileMoney: {
          actif: booleen(mm.actif, false),
          operateur: texte(mm.operateur, defaut.paiement.mobileMoney.operateur),
          numero: texte(mm.numero, '')
        },
        virement: {
          actif: booleen(vir.actif, defaut.paiement.virement.actif),
          banque: texte(vir.banque, defaut.paiement.virement.banque),
          compte: texte(vir.compte, defaut.paiement.virement.compte)
        }
      },
      afficherCachet: booleen(s.afficherCachet, true),
      afficherSignature: booleen(s.afficherSignature, true),
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
      marquerEnregistre() {
        reference = empreinte(doc);
        notifier('enregistrement');
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
