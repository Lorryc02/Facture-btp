/*
 * preload.js — pont sécurisé entre l'interface et le processus principal.
 * contextIsolation est activé et nodeIntegration désactivé : l'interface n'a accès
 * qu'aux fonctions listées ici, via l'objet global `window.devisPro`.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const appeler = (canal, ...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld('devisPro', {
  // Documents enregistrés (userData/documents/*.json)
  listerDocuments: () => appeler('docs:lister'),
  lireDocument: (id) => appeler('docs:lire', id),
  enregistrerDocument: (doc) => appeler('docs:enregistrer', doc),
  supprimerDocument: (id) => appeler('docs:supprimer', id),

  // Brouillon automatique (userData/brouillon.json)
  lireBrouillon: () => appeler('brouillon:lire'),
  ecrireBrouillon: (brouillon) => appeler('brouillon:ecrire', brouillon),

  // Réglages (userData/settings.json)
  lireReglages: () => appeler('reglages:lire'),
  ecrireReglages: (reglages) => appeler('reglages:ecrire', reglages),

  // Signature (userData/signature.png)
  lireSignature: () => appeler('signature:lire'),
  ecrireSignature: (dataUrl) => appeler('signature:ecrire', dataUrl),
  supprimerSignature: () => appeler('signature:supprimer'),

  // Sorties
  exporterPdf: (nomFichier) => appeler('pdf:exporter', nomFichier),
  ouvrirFichier: (chemin) => appeler('fichier:ouvrir', chemin),
  imprimer: () => appeler('imprimer'),

  // Boîte de dialogue native (boutons en français)
  question: (options) => appeler('dialogue:question', options),

  // Fermeture de la fenêtre (avertissement si modifications non enregistrées)
  surDemandeFermeture: (rappel) => {
    ipcRenderer.removeAllListeners('app:demande-fermeture');
    ipcRenderer.on('app:demande-fermeture', () => rappel());
  },
  accuserFermeture: () => appeler('app:fermeture-recue'),
  fermer: () => appeler('app:fermer'),

  // Autotest (npm run selftest)
  selftest: {
    infos: () => appeler('selftest:infos'),
    exporter: (nomFichier) => appeler('selftest:exporter', nomFichier),
    terminer: (rapport) => appeler('selftest:terminer', rapport)
  }
});
