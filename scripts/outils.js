/*
 * outils.js — petites fonctions communes aux scripts (sans dépendance).
 */
'use strict';

// Table du CRC-32 (utilisé par les formats PNG et ZIP)
const TABLE_CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE_CRC[n] = c >>> 0;
}

/** CRC-32 d'un tampon (peut être enchaîné grâce à `precedent`). */
function crc32(tampon, precedent) {
  let crc = (precedent === undefined ? 0 : precedent) ^ 0xffffffff;
  for (let i = 0; i < tampon.length; i++) crc = TABLE_CRC[(crc ^ tampon[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

module.exports = { crc32 };
