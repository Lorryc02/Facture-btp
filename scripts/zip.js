/*
 * zip.js — crée dist/DevisPro-win-unpacked.zip à partir de dist/win-unpacked,
 * sans aucune dépendance (format ZIP standard, compression « deflate »).
 * Usage : npm run zip
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { crc32 } = require('./outils.js');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'dist', 'win-unpacked');
const DESTINATION = path.join(RACINE, 'dist', 'DevisPro-win-unpacked.zip');
const DOSSIER_DANS_ZIP = 'DevisPro/'; // tout est rangé dans un dossier « DevisPro »

/** Liste récursive des fichiers (chemins relatifs, séparateur « / »). */
function lister(dossier, prefixe) {
  const resultat = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const relatif = prefixe + entree.name;
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) resultat.push(...lister(complet, relatif + '/'));
    else if (entree.isFile()) resultat.push(relatif);
  }
  return resultat.sort();
}

/** Date et heure au format MS-DOS utilisé par le ZIP. */
function dateDos(d) {
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { heure, jour };
}

function principal() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Dossier introuvable : ' + SOURCE + '\nLancez d’abord : npm run build');
    process.exit(1);
  }
  const fichiers = lister(SOURCE, '');
  const sortie = fs.openSync(DESTINATION, 'w');
  const central = [];
  let position = 0;
  const ecrire = (tampon) => {
    fs.writeSync(sortie, tampon);
    position += tampon.length;
  };

  for (const relatif of fichiers) {
    const complet = path.join(SOURCE, relatif);
    const contenu = fs.readFileSync(complet);
    const compresse = zlib.deflateRawSync(contenu, { level: 9 });
    // On garde la version la plus petite (les fichiers déjà compressés restent « stockés »)
    const methode = compresse.length < contenu.length ? 8 : 0;
    const donnees = methode === 8 ? compresse : contenu;
    const nom = Buffer.from(DOSSIER_DANS_ZIP + relatif, 'utf8');
    const crc = crc32(contenu);
    const { heure, jour } = dateDos(fs.statSync(complet).mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);       // version nécessaire
    local.writeUInt16LE(0x0800, 6);   // noms en UTF-8
    local.writeUInt16LE(methode, 8);
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(jour, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(contenu.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    const decalage = position;
    ecrire(local);
    ecrire(nom);
    ecrire(donnees);

    const entree = Buffer.alloc(46);
    entree.writeUInt32LE(0x02014b50, 0);
    entree.writeUInt16LE(20, 4);      // créé par
    entree.writeUInt16LE(20, 6);      // version nécessaire
    entree.writeUInt16LE(0x0800, 8);
    entree.writeUInt16LE(methode, 10);
    entree.writeUInt16LE(heure, 12);
    entree.writeUInt16LE(jour, 14);
    entree.writeUInt32LE(crc, 16);
    entree.writeUInt32LE(donnees.length, 20);
    entree.writeUInt32LE(contenu.length, 24);
    entree.writeUInt16LE(nom.length, 28);
    entree.writeUInt16LE(0, 30);      // champ extra
    entree.writeUInt16LE(0, 32);      // commentaire
    entree.writeUInt16LE(0, 34);      // disque
    entree.writeUInt16LE(0, 36);      // attributs internes
    entree.writeUInt32LE(0, 38);      // attributs externes
    entree.writeUInt32LE(decalage, 42);
    central.push(entree, nom);
  }

  const debutCentral = position;
  central.forEach(ecrire);
  const tailleCentral = position - debutCentral;

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(debutCentral, 16);
  fin.writeUInt16LE(0, 20);
  ecrire(fin);
  fs.closeSync(sortie);

  const mo = (n) => (n / 1024 / 1024).toFixed(1) + ' Mo';
  const total = fichiers.reduce((s, f) => s + fs.statSync(path.join(SOURCE, f)).size, 0);
  console.log('Archive créée : ' + DESTINATION);
  console.log(fichiers.length + ' fichiers, ' + mo(total) + ' → ' + mo(position));
}

principal();
