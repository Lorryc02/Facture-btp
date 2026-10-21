/*
 * storage.js — accès aux données (via le pont sécurisé window.devisPro) :
 *  - brouillon enregistré automatiquement toutes les 3 secondes s'il a changé,
 *    puis restauré à la réouverture de l'application ;
 *  - enregistrer / lister / ouvrir / supprimer les documents ;
 *  - réglages et signature.
 *
 * Objet global : `Stockage`.
 */
(function (racine) {
  'use strict';

  const api = racine.devisPro;
  const INTERVALLE_BROUILLON = 3000; // millisecondes

  let derniereEmpreinte = null;
  let minuterie = null;

  const Stockage = {
    /** Lit le brouillon : { document, modifie } ou null. */
    async lireBrouillon() {
      try {
        const b = await api.lireBrouillon();
        if (!b || !b.document) return null;
        return { document: Etat.normaliser(b.document), modifie: !!b.modifie };
      } catch (erreur) {
        console.error('Brouillon illisible', erreur);
        return null;
      }
    },

    /** Écrit le brouillon s'il a changé depuis la dernière écriture (ou si `forcer`). */
    async ecrireBrouillon(magasin, forcer) {
      const modifie = magasin.estModifie();
      const empreinte = Etat.empreinte(magasin.doc) + '|' + modifie;
      if (!forcer && empreinte === derniereEmpreinte) return false;
      await api.ecrireBrouillon({ document: magasin.doc, modifie, ecritLe: new Date().toISOString() });
      derniereEmpreinte = empreinte;
      return true;
    },

    /** Lance l'écriture automatique du brouillon. */
    demarrerBrouillonAutomatique(magasin) {
      clearInterval(minuterie);
      minuterie = setInterval(() => {
        Stockage.ecrireBrouillon(magasin).catch((e) => console.error('Brouillon non écrit', e));
      }, INTERVALLE_BROUILLON);
    },

    /** Enregistre le document ; renvoie la version enregistrée (avec id et dates). */
    async enregistrer(doc) {
      return Etat.normaliser(await api.enregistrerDocument(doc));
    },

    lister() {
      return api.listerDocuments();
    },

    async lire(id) {
      const doc = await api.lireDocument(id);
      return doc ? Etat.normaliser(doc) : null;
    },

    supprimer(id) {
      return api.supprimerDocument(id);
    },

    marquerPayee(id, payee) {
      return api.marquerPayee(id, payee);
    },

    async lireReglages() {
      try {
        return (await api.lireReglages()) || {};
      } catch {
        return {};
      }
    },

    ecrireReglages(reglages) {
      return api.ecrireReglages(reglages);
    },

    lireSignature() {
      return api.lireSignature();
    },

    ecrireSignature(dataUrl) {
      return api.ecrireSignature(dataUrl);
    },

    supprimerSignature() {
      return api.supprimerSignature();
    }
  };

  racine.Stockage = Stockage;
})(window);
