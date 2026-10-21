/*
 * main.js — processus principal d'Electron.
 *  - fenêtre unique (~1100×900, sans barre de menu, une seule instance) ;
 *  - lecture / écriture des fichiers dans app.getPath('userData') :
 *      documents/*.json, brouillon.json, settings.json, signature.png ;
 *  - export PDF (webContents.printToPDF, A4, marges 12 mm) et impression ;
 *  - avertissement avant fermeture si des modifications ne sont pas enregistrées ;
 *  - mode --selftest : ouvre le document d'exemple, exporte apercu.pdf + apercu.png,
 *    vérifie l'interface puis quitte (code de sortie 0 si tout est bon).
 */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');

const Calc = require('./src/js/calc.js');
const Etat = require('./src/js/state.js');

const MODE_SELFTEST = process.argv.includes('--selftest');

// Marges du PDF : 12 mm (exprimées en pouces pour printToPDF)
const MARGE_POUCES = 12 / 25.4;
const OPTIONS_PDF = Object.freeze({
  pageSize: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margins: { top: MARGE_POUCES, bottom: MARGE_POUCES, left: MARGE_POUCES, right: MARGE_POUCES }
});

// Interface Chromium en français (sélecteur de date, menus natifs…)
app.commandLine.appendSwitch('lang', 'fr');

// En autotest, on travaille dans un dossier temporaire pour ne jamais toucher aux vraies données,
// ainsi qu'un rendu logiciel (fiable dans les machines virtuelles et l'intégration continue)
if (MODE_SELFTEST) {
  app.setPath('userData', path.join(app.getPath('temp'), 'DevisPro-selftest-' + process.pid));
  app.disableHardwareAcceleration();
}

let fenetre = null;
let fermetureAutorisee = false;
let minuterieFermeture = null;
const fichiersExportes = new Set();

// ---------------------------------------------------------------------------
// Chemins et fichiers
// ---------------------------------------------------------------------------

const dossierDonnees = () => app.getPath('userData');
const dossierDocuments = () => path.join(dossierDonnees(), 'documents');
const cheminBrouillon = () => path.join(dossierDonnees(), 'brouillon.json');
const cheminReglages = () => path.join(dossierDonnees(), 'settings.json');
const cheminSignature = () => path.join(dossierDonnees(), 'signature.png');

/** Écrit un fichier de façon atomique (fichier temporaire puis renommage). */
async function ecrireAtomique(chemin, contenu) {
  await fsp.mkdir(path.dirname(chemin), { recursive: true });
  const temporaire = chemin + '.tmp';
  await fsp.writeFile(temporaire, contenu);
  try {
    await fsp.rename(temporaire, chemin);
  } catch (erreur) {
    // Sous Windows, un antivirus peut bloquer le renommage : écriture directe en secours
    await fsp.writeFile(chemin, contenu);
    await fsp.rm(temporaire, { force: true });
  }
}

/** Lit un fichier JSON ; renvoie `defaut` s'il est absent ou illisible. */
async function lireJson(chemin, defaut) {
  try {
    return JSON.parse(await fsp.readFile(chemin, 'utf8'));
  } catch {
    return defaut;
  }
}

/** Un identifiant de document ne contient que lettres, chiffres, - et _ (pas de chemin). */
function verifierId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new Error('Identifiant de document invalide');
  }
  return id;
}

function nouvelId() {
  return 'doc-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
}

// ---------------------------------------------------------------------------
// IPC : documents, brouillon, réglages, signature
// ---------------------------------------------------------------------------

// Nom de fichier d'un document enregistré par DevisPro (les copies « … - Copie.json » sont ignorées)
const NOM_DOCUMENT = /^[A-Za-z0-9_-]{1,80}\.json$/;

ipcMain.handle('docs:lister', async () => {
  let fichiers = [];
  try {
    fichiers = (await fsp.readdir(dossierDocuments())).filter((f) => NOM_DOCUMENT.test(f));
  } catch {
    return [];
  }
  const resumes = [];
  for (const fichier of fichiers) {
    const brut = await lireJson(path.join(dossierDocuments(), fichier), null);
    if (!brut) continue;
    const doc = Etat.normaliser(brut);
    doc.id = path.basename(fichier, '.json');
    const totaux = Calc.calculerTotaux(doc);
    resumes.push({
      id: doc.id,
      type: doc.type,
      numero: doc.numero,
      client: Etat.nomClient(doc),
      objet: doc.objet.replace(/\s+/g, ' ').trim().slice(0, 160),
      date: doc.date,
      dateTexte: Calc.formaterDateLongue(doc.date),
      ht: totaux.ht,
      tva: totaux.tvaActive ? totaux.tva : 0,
      total: totaux.ttc,
      acomptesDeduits: totaux.totalAcomptes,
      arrete: totaux.arrete,
      nbAcomptes: doc.acomptes.length,
      acomptesRestants: doc.acomptes.filter((a) => !a.deduit).length,
      payee: doc.payee,
      payeeLe: doc.payeeLe,
      origine: doc.origine,
      creeLe: doc.creeLe,
      modifieLe: doc.modifieLe
    });
  }
  resumes.sort((a, b) => String(b.modifieLe || '').localeCompare(String(a.modifieLe || '')));
  return resumes;
});

ipcMain.handle('docs:lire', async (_e, id) => {
  const brut = await lireJson(path.join(dossierDocuments(), verifierId(id) + '.json'), null);
  if (!brut) return null;
  const doc = Etat.normaliser(brut);
  doc.id = id;
  return doc;
});

ipcMain.handle('docs:enregistrer', async (_e, document) => {
  const doc = Etat.normaliser(document);
  if (!doc.id) doc.id = nouvelId();
  const maintenant = new Date().toISOString();
  if (!doc.creeLe) doc.creeLe = maintenant;
  doc.modifieLe = maintenant;
  await ecrireAtomique(path.join(dossierDocuments(), doc.id + '.json'), Etat.serialiser(doc));
  return doc;
});

// Historique : marque une facture comme payée (ou non) sans l'ouvrir
ipcMain.handle('docs:marquerPayee', async (_e, id, payee) => {
  const chemin = path.join(dossierDocuments(), verifierId(id) + '.json');
  const brut = await lireJson(chemin, null);
  if (!brut) throw new Error('Document introuvable');
  const doc = Etat.normaliser(brut);
  doc.id = id;
  doc.payee = !!payee;
  doc.payeeLe = payee ? Calc.dateIso(new Date()) : null;
  doc.modifieLe = new Date().toISOString();
  await ecrireAtomique(chemin, Etat.serialiser(doc));
  return { payee: doc.payee, payeeLe: doc.payeeLe, modifieLe: doc.modifieLe };
});

ipcMain.handle('docs:supprimer', async (_e, id) => {
  await fsp.rm(path.join(dossierDocuments(), verifierId(id) + '.json'), { force: true });
  return true;
});

ipcMain.handle('brouillon:lire', () => lireJson(cheminBrouillon(), null));

ipcMain.handle('brouillon:ecrire', async (_e, brouillon) => {
  await ecrireAtomique(cheminBrouillon(), JSON.stringify(brouillon));
  return true;
});

ipcMain.handle('reglages:lire', () => lireJson(cheminReglages(), {}));

ipcMain.handle('reglages:ecrire', async (_e, reglages) => {
  const actuels = await lireJson(cheminReglages(), {});
  const fusion = Object.assign({}, actuels, reglages || {});
  await ecrireAtomique(cheminReglages(), JSON.stringify(fusion, null, 2));
  return fusion;
});

ipcMain.handle('signature:lire', async () => {
  try {
    const octets = await fsp.readFile(cheminSignature());
    return 'data:image/png;base64,' + octets.toString('base64');
  } catch {
    return null;
  }
});

ipcMain.handle('signature:ecrire', async (_e, dataUrl) => {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Image de signature invalide (PNG attendu)');
  const octets = Buffer.from(m[1], 'base64');
  if (octets.length > 8 * 1024 * 1024) throw new Error('Image de signature trop lourde');
  await ecrireAtomique(cheminSignature(), octets);
  return true;
});

ipcMain.handle('signature:supprimer', async () => {
  await fsp.rm(cheminSignature(), { force: true });
  return true;
});

// ---------------------------------------------------------------------------
// IPC : PDF, impression, dialogues, fenêtre
// ---------------------------------------------------------------------------

ipcMain.handle('pdf:exporter', async (_e, nomFichier) => {
  let nom = path.basename(String(nomFichier || 'Document.pdf')).replace(/[<>:"/\\|?*]/g, '-');
  if (!/\.pdf$/i.test(nom)) nom += '.pdf';
  const reglages = await lireJson(cheminReglages(), {});
  let dossier = reglages.dossierPdf;
  if (!dossier || !fs.existsSync(dossier)) dossier = app.getPath('documents');

  const choix = await dialog.showSaveDialog(fenetre, {
    title: 'Exporter en PDF',
    defaultPath: path.join(dossier, nom),
    buttonLabel: 'Enregistrer',
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
  });
  if (choix.canceled || !choix.filePath) return null;

  let chemin = choix.filePath;
  if (!/\.pdf$/i.test(chemin)) chemin += '.pdf';
  const pdf = await fenetre.webContents.printToPDF(OPTIONS_PDF);
  try {
    await fsp.writeFile(chemin, pdf);
  } catch (erreur) {
    return { erreur: "Impossible d'écrire le fichier. Est-il ouvert dans un autre programme ?\n" + erreur.message };
  }
  fichiersExportes.add(chemin);
  await ecrireAtomique(cheminReglages(), JSON.stringify(
    Object.assign({}, reglages, { dossierPdf: path.dirname(chemin) }), null, 2));
  return { chemin };
});

// Historique : export de la liste en CSV (s'ouvre dans Excel ; séparateur « ; », UTF-8 avec BOM)
ipcMain.handle('fichier:exporterCsv', async (_e, nomFichier, contenu) => {
  let nom = path.basename(String(nomFichier || 'Historique.csv')).replace(/[<>:"/\\|?*]/g, '-');
  if (!/\.csv$/i.test(nom)) nom += '.csv';
  const reglages = await lireJson(cheminReglages(), {});
  let dossier = reglages.dossierPdf;
  if (!dossier || !fs.existsSync(dossier)) dossier = app.getPath('documents');
  const choix = await dialog.showSaveDialog(fenetre, {
    title: 'Exporter l’historique',
    defaultPath: path.join(dossier, nom),
    buttonLabel: 'Enregistrer',
    filters: [{ name: 'Fichier CSV (Excel)', extensions: ['csv'] }]
  });
  if (choix.canceled || !choix.filePath) return null;
  let chemin = choix.filePath;
  if (!/\.csv$/i.test(chemin)) chemin += '.csv';
  try {
    await fsp.writeFile(chemin, '\uFEFF' + String(contenu || ''), 'utf8');
  } catch (erreur) {
    return { erreur: "Impossible d'écrire le fichier. Est-il ouvert dans un autre programme ?\n" + erreur.message };
  }
  fichiersExportes.add(chemin);
  return { chemin };
});

ipcMain.handle('fichier:ouvrir', async (_e, chemin) => {
  // Par sécurité, seuls les fichiers exportés pendant cette session peuvent être ouverts
  if (!fichiersExportes.has(chemin)) return false;
  return (await shell.openPath(chemin)) === '';
});

ipcMain.handle('imprimer', () => new Promise((resoudre) => {
  fenetre.webContents.print({ printBackground: true, pageSize: 'A4' }, (succes, raison) => {
    resoudre({ succes, raison: raison || '' });
  });
}));

ipcMain.handle('dialogue:question', async (_e, options) => {
  const o = options || {};
  const boutons = Array.isArray(o.boutons) && o.boutons.length ? o.boutons.map(String) : ['OK', 'Annuler'];
  const { response } = await dialog.showMessageBox(fenetre, {
    type: o.type || 'question',
    title: 'DevisPro',
    message: String(o.message || ''),
    detail: o.detail ? String(o.detail) : undefined,
    buttons: boutons,
    defaultId: Number.isInteger(o.defaut) ? o.defaut : 0,
    cancelId: Number.isInteger(o.annuler) ? o.annuler : boutons.length - 1,
    noLink: true
  });
  return response;
});

// Fermeture : l'interface confirme (et enregistre éventuellement) puis appelle app:fermer
ipcMain.handle('app:fermeture-recue', () => {
  clearTimeout(minuterieFermeture);
});

ipcMain.handle('app:fermer', () => {
  fermetureAutorisee = true;
  if (fenetre) fenetre.close();
});

// ---------------------------------------------------------------------------
// Autotest (--selftest)
// ---------------------------------------------------------------------------

function dossierSelftest() {
  const arg = process.argv.find((a) => a.startsWith('--selftest-dir='));
  if (arg) return path.resolve(arg.slice('--selftest-dir='.length));
  return app.isPackaged
    ? path.join(path.dirname(process.execPath), 'selftest')
    : path.join(__dirname, 'dist', 'selftest');
}

/** Capture la 1re page en PNG, telle qu'elle sort à l'impression (média « print »). */
async function capturerPng(wc, chemin) {
  const dbg = wc.debugger;
  dbg.attach('1.3');
  try {
    await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    await wc.executeJavaScript(
      "document.documentElement.classList.add('capture-png');"
      + 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'
    );
    // A4 à 96 ppp = 793,7 × 1122,5 px ; échelle 2 pour une image nette
    const image = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 794, height: 1123, scale: 2 },
      captureBeyondViewport: true
    });
    await fsp.writeFile(chemin, Buffer.from(image.data, 'base64'));
  } finally {
    await wc.executeJavaScript("document.documentElement.classList.remove('capture-png')");
    await dbg.sendCommand('Emulation.setEmulatedMedia', { media: '' });
    dbg.detach();
  }
}

ipcMain.handle('selftest:infos', () => ({ actif: MODE_SELFTEST, dossier: MODE_SELFTEST ? dossierSelftest() : null }));

ipcMain.handle('selftest:exporter', async (_e, nom) => {
  if (!MODE_SELFTEST) throw new Error('Réservé à l’autotest');
  const base = path.basename(String(nom || 'apercu')).replace(/[^A-Za-z0-9_-]/g, '-');
  const dossier = dossierSelftest();
  await fsp.mkdir(dossier, { recursive: true });
  const pdf = await fenetre.webContents.printToPDF(OPTIONS_PDF);
  await fsp.writeFile(path.join(dossier, base + '.pdf'), pdf);
  await capturerPng(fenetre.webContents, path.join(dossier, base + '.png'));
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('[selftest] exporté : ' + path.join(dossier, base + '.pdf') + ' (' + pages + ' page(s)) + .png');
  return { dossier, pages };
});

// Frappe réelle au clavier (caractère par caractère) dans le champ qui a le focus
ipcMain.handle('selftest:taper', async (_e, texte) => {
  if (!MODE_SELFTEST) throw new Error('Réservé à l’autotest');
  fenetre.focus();
  fenetre.webContents.focus();
  for (const caractere of String(texte || '')) {
    await fenetre.webContents.insertText(caractere);
    await new Promise((r) => setTimeout(r, 15));
  }
  return true;
});

ipcMain.handle('selftest:terminer', async (_e, rapport) => {
  if (!MODE_SELFTEST) throw new Error('Réservé à l’autotest');
  const r = rapport || { succes: false, controles: [] };
  const lignes = (r.controles || []).map((c) => (c.ok ? '  OK    ' : '  ÉCHEC ') + c.nom + (c.ok ? '' : ' → ' + c.detail));
  const texte = ['DevisPro — autotest de l’interface', ...lignes,
    r.succes ? 'RÉSULTAT : tout est bon' : 'RÉSULTAT : des contrôles ont échoué'].join('\n');
  console.log(texte);
  const dossier = dossierSelftest();
  await fsp.mkdir(dossier, { recursive: true });
  await fsp.writeFile(path.join(dossier, 'rapport.txt'), texte + '\n');
  terminerSelftest(r.succes ? 0 : 1);
});

function terminerSelftest(code) {
  // Le dossier effacé est TOUJOURS le dossier temporaire de l'autotest, jamais les vraies données
  if (!MODE_SELFTEST || !path.basename(dossierDonnees()).startsWith('DevisPro-selftest-')) return app.exit(code);
  fsp.rm(dossierDonnees(), { recursive: true, force: true }).finally(() => app.exit(code));
}

// ---------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------

/** Menu contextuel « Couper / Copier / Coller » dans les champs de saisie. */
function menuContextuel(wc, params) {
  if (!params.isEditable) return;
  Menu.buildFromTemplate([
    { label: 'Annuler la saisie', role: 'undo' },
    { label: 'Rétablir', role: 'redo' },
    { type: 'separator' },
    { label: 'Couper', role: 'cut' },
    { label: 'Copier', role: 'copy' },
    { label: 'Coller', role: 'paste' },
    { type: 'separator' },
    { label: 'Tout sélectionner', role: 'selectAll' }
  ]).popup({ window: BrowserWindow.fromWebContents(wc) });
}

/**
 * Application 100 % hors-ligne : pas de correcteur orthographique (qui téléchargerait
 * des dictionnaires) et aucune requête réseau autorisée depuis la page.
 */
function rendreHorsLigne(ses) {
  ses.setSpellCheckerEnabled(false);
  if (process.platform !== 'darwin') ses.setSpellCheckerLanguages([]);
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, rappel) => {
    rappel({ cancel: true });
  });
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 860,
    minHeight: 600,
    title: 'DevisPro',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff', // aussi la couleur des marges du PDF : doit rester blanc
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false, // 100 % hors-ligne : pas de téléchargement de dictionnaires
      backgroundThrottling: !MODE_SELFTEST
    }
  });
  fenetre.removeMenu();

  const wc = fenetre.webContents;
  // Aucune navigation ni nouvelle fenêtre (glisser-déposer d'un fichier, liens…)
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('context-menu', (_e, params) => menuContextuel(wc, params));

  if (MODE_SELFTEST) {
    wc.on('console-message', (e, _niveau, ancienMessage) => {
      console.log('[interface] ' + (e && e.message !== undefined ? e.message : ancienMessage));
    });
    wc.on('render-process-gone', () => terminerSelftest(2));
    setTimeout(() => {
      console.error('[selftest] délai dépassé');
      terminerSelftest(3);
    }, 90000).unref();
  }
  // La fenêtre est aussi affichée en autotest : la capture PNG a besoin d'une fenêtre visible
  fenetre.once('ready-to-show', () => fenetre.show());

  fenetre.on('close', (e) => {
    if (fermetureAutorisee || MODE_SELFTEST) return;
    if (wc.isCrashed()) return;
    e.preventDefault();
    wc.send('app:demande-fermeture');
    // Si l'interface ne répond pas, on ferme quand même au bout de 4 secondes
    clearTimeout(minuterieFermeture);
    minuterieFermeture = setTimeout(() => {
      fermetureAutorisee = true;
      if (fenetre) fenetre.close();
    }, 4000);
  });
  fenetre.on('closed', () => {
    fenetre = null;
  });

  fenetre.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// Une seule instance : une seconde ouverture remet la fenêtre existante au premier plan
const instanceUnique = MODE_SELFTEST || app.requestSingleInstanceLock();
if (!instanceUnique) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    rendreHorsLigne(session.defaultSession);
    creerFenetre();
  });

  app.on('window-all-closed', () => app.quit());
}
