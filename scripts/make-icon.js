/*
 * make-icon.js — génère build/icon.ico sans aucune dépendance.
 * Dessin : carré bleu arrondi, feuille blanche à coin replié, en-tête de tableau
 * et lignes de texte. Tailles : 256, 64, 48, 32 et 16 px (images PNG dans l'ICO).
 * Usage : npm run icon
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { crc32 } = require('./outils.js');

const BLEU = [0x00, 0x70, 0xc0];
const BLEU_FONCE = [0x0b, 0x3d, 0x6b];
const BLANC = [0xff, 0xff, 0xff];
const GRIS = [0xc9, 0xd6, 0xe3];

/** Formes dessinées dans un repère 0..1 ; la dernière forme qui contient le point l'emporte. */
function couleurAuPoint(x, y) {
  let couleur = null;
  // Fond : carré arrondi
  if (dansRectArrondi(x, y, 0.02, 0.02, 0.98, 0.98, 0.2)) couleur = BLEU;
  // Feuille blanche ; le coin haut droit (carré 0,62–0,76 × 0,12–0,26) est replié
  const dansCoin = x > 0.62 && y < 0.26;
  const auDessusDiagonale = x - 0.62 > y - 0.12;
  if (dansRectArrondi(x, y, 0.24, 0.12, 0.76, 0.88, 0.04) && !(dansCoin && auDessusDiagonale)) couleur = BLANC;
  // Le pli lui-même (triangle gris sous la diagonale)
  if (dansCoin && !auDessusDiagonale && x <= 0.76 && y >= 0.12) couleur = GRIS;
  // En-tête du tableau
  if (x > 0.31 && x < 0.69 && y > 0.36 && y < 0.44) couleur = BLEU;
  // Lignes du tableau
  for (const ly of [0.52, 0.6, 0.68]) {
    if (x > 0.31 && x < 0.69 && y > ly && y < ly + 0.035) couleur = BLEU_FONCE;
  }
  // Total souligné à droite
  if (x > 0.5 && x < 0.69 && y > 0.76 && y < 0.8) couleur = BLEU;
  return couleur;
}

function dansRectArrondi(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Image RGBA de `taille` px, lissée par suréchantillonnage 4×4. */
function dessiner(taille) {
  const pixels = Buffer.alloc(taille * taille * 4);
  const n = 4;
  for (let py = 0; py < taille; py++) {
    for (let px = 0; px < taille; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = couleurAuPoint((px + (sx + 0.5) / n) / taille, (py + (sy + 0.5) / n) / taille);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const i = (py * taille + px) * 4;
      if (a) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
        pixels[i + 3] = Math.round((a / (n * n)) * 255);
      }
    }
  }
  return pixels;
}

/** Encode une image RGBA en PNG. */
function png(taille, pixels) {
  const lignes = Buffer.alloc(taille * (taille * 4 + 1));
  for (let y = 0; y < taille; y++) {
    lignes[y * (taille * 4 + 1)] = 0; // filtre « aucun »
    pixels.copy(lignes, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  const morceau = (type, donnees) => {
    const longueur = Buffer.alloc(4);
    longueur.writeUInt32BE(donnees.length);
    const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corps));
    return Buffer.concat([longueur, corps, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', zlib.deflateSync(lignes, { level: 9 })),
    morceau('IEND', Buffer.alloc(0))
  ]);
}

/** Assemble plusieurs PNG dans un fichier ICO. */
function ico(images) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2); // type : icône
  entete.writeUInt16LE(images.length, 4);
  const repertoire = Buffer.alloc(16 * images.length);
  let position = 6 + repertoire.length;
  images.forEach(({ taille, donnees }, i) => {
    const o = i * 16;
    repertoire[o] = taille >= 256 ? 0 : taille;
    repertoire[o + 1] = taille >= 256 ? 0 : taille;
    repertoire[o + 2] = 0;
    repertoire[o + 3] = 0;
    repertoire.writeUInt16LE(1, o + 4);  // plans
    repertoire.writeUInt16LE(32, o + 6); // bits par pixel
    repertoire.writeUInt32LE(donnees.length, o + 8);
    repertoire.writeUInt32LE(position, o + 12);
    position += donnees.length;
  });
  return Buffer.concat([entete, repertoire, ...images.map((im) => im.donnees)]);
}

function principal() {
  const tailles = [256, 64, 48, 32, 16];
  const images = tailles.map((taille) => ({ taille, donnees: png(taille, dessiner(taille)) }));
  const dossier = path.join(__dirname, '..', 'build');
  fs.mkdirSync(dossier, { recursive: true });
  const sortie = path.join(dossier, 'icon.ico');
  fs.writeFileSync(sortie, ico(images));
  // Aperçu PNG 256 px (pratique pour vérifier le dessin)
  fs.writeFileSync(path.join(dossier, 'icon.png'), images[0].donnees);
  console.log('Icône générée : ' + sortie + ' (' + tailles.join(', ') + ' px)');
}

principal();
