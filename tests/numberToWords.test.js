// Tests de la conversion nombre → lettres (node --test)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nombreEnLettres, montantEnLettres, phraseArrete } = require('../src/js/numberToWords.js');

test('cas obligatoires du cahier des charges', () => {
  const cas = [
    [0, 'ZERO ARIARY'],
    [71, 'SOIXANTE ET ONZE ARIARY'],
    [80, 'QUATRE VINGTS ARIARY'],
    [81, 'QUATRE VINGT UN ARIARY'],
    [200, 'DEUX CENTS ARIARY'],
    [201, 'DEUX CENT UN ARIARY'],
    [80000, 'QUATRE VINGT MILLE ARIARY'],
    [200000, 'DEUX CENT MILLE ARIARY'],
    [1182000, 'UN MILLION CENT QUATRE VINGT DEUX MILLE ARIARY'],
    [2000000, "DEUX MILLIONS D'ARIARY"],
    [80000000, "QUATRE VINGTS MILLIONS D'ARIARY"],
    [300000000, "TROIS CENTS MILLIONS D'ARIARY"]
  ];
  for (const [n, attendu] of cas) assert.equal(montantEnLettres(n), attendu, String(n));
});

test('unités, dizaines et cas particuliers', () => {
  const cas = [
    [1, 'UN'], [10, 'DIX'], [11, 'ONZE'], [16, 'SEIZE'], [17, 'DIX SEPT'], [19, 'DIX NEUF'],
    [20, 'VINGT'], [21, 'VINGT ET UN'], [22, 'VINGT DEUX'], [31, 'TRENTE ET UN'],
    [41, 'QUARANTE ET UN'], [51, 'CINQUANTE ET UN'], [61, 'SOIXANTE ET UN'],
    [70, 'SOIXANTE DIX'], [72, 'SOIXANTE DOUZE'], [77, 'SOIXANTE DIX SEPT'],
    [79, 'SOIXANTE DIX NEUF'], [89, 'QUATRE VINGT NEUF'], [90, 'QUATRE VINGT DIX'],
    [91, 'QUATRE VINGT ONZE'], [99, 'QUATRE VINGT DIX NEUF']
  ];
  for (const [n, attendu] of cas) assert.equal(nombreEnLettres(n), attendu, String(n));
});

test('centaines et accord de CENT / VINGT', () => {
  const cas = [
    [100, 'CENT'], [101, 'CENT UN'], [180, 'CENT QUATRE VINGTS'], [280, 'DEUX CENT QUATRE VINGTS'],
    [300, 'TROIS CENTS'], [999, 'NEUF CENT QUATRE VINGT DIX NEUF'],
    [1080, 'MILLE QUATRE VINGTS'], [80080, 'QUATRE VINGT MILLE QUATRE VINGTS'],
    [200200, 'DEUX CENT MILLE DEUX CENTS'], [400080000, 'QUATRE CENTS MILLIONS QUATRE VINGT MILLE']
  ];
  for (const [n, attendu] of cas) assert.equal(nombreEnLettres(n), attendu, String(n));
});

test('milliers, millions et milliards', () => {
  const cas = [
    [1000, 'MILLE'], [1001, 'MILLE UN'], [2000, 'DEUX MILLE'], [21000, 'VINGT ET UN MILLE'],
    [81000, 'QUATRE VINGT UN MILLE'], [100000, 'CENT MILLE'], [985000, 'NEUF CENT QUATRE VINGT CINQ MILLE'],
    [1000000, 'UN MILLION'], [1001000, 'UN MILLION MILLE'], [1000001, 'UN MILLION UN'],
    [21000000, 'VINGT ET UN MILLIONS'], [1000000000, 'UN MILLIARD'], [2000000000, 'DEUX MILLIARDS'],
    [999999999999, 'NEUF CENT QUATRE VINGT DIX NEUF MILLIARDS NEUF CENT QUATRE VINGT DIX NEUF MILLIONS '
      + 'NEUF CENT QUATRE VINGT DIX NEUF MILLE NEUF CENT QUATRE VINGT DIX NEUF']
  ];
  for (const [n, attendu] of cas) assert.equal(nombreEnLettres(n), attendu, String(n));
});

test("« D' » seulement quand le montant se termine par MILLION(S) / MILLIARD(S) pile", () => {
  assert.equal(montantEnLettres(1000000), "UN MILLION D'ARIARY");
  assert.equal(montantEnLettres(1000000000), "UN MILLIARD D'ARIARY");
  assert.equal(montantEnLettres(1002000000), "UN MILLIARD DEUX MILLIONS D'ARIARY");
  assert.equal(montantEnLettres(1000500), 'UN MILLION CINQ CENTS ARIARY');
  assert.equal(montantEnLettres(3000), 'TROIS MILLE ARIARY');
});

test('aucun trait d’union ni espace double', () => {
  for (let n = 0; n <= 2000; n += 7) {
    const texte = nombreEnLettres(n * 1013);
    assert.ok(!/-/.test(texte), texte);
    assert.ok(!/ {2}/.test(texte), texte);
    assert.equal(texte, texte.trim());
  }
});

test('entrées hors limites ou non entières', () => {
  assert.throws(() => nombreEnLettres(1e12), RangeError);
  assert.throws(() => nombreEnLettres(1.5), TypeError);
  assert.throws(() => nombreEnLettres(NaN), TypeError);
  assert.equal(nombreEnLettres(-5), 'MOINS CINQ');
});

test('phrase d’arrêté : exemple du reste à payer de 450 000 Ar', () => {
  assert.equal(
    phraseArrete('facture', 450000),
    'Arrêtée la présente facture à la somme de: QUATRE CENT CINQUANTE MILLE ARIARY'
  );
});

test('phrase d’arrêté selon le type', () => {
  assert.equal(
    phraseArrete('facture', 1182000),
    'Arrêtée la présente facture à la somme de: UN MILLION CENT QUATRE VINGT DEUX MILLE ARIARY'
  );
  assert.equal(
    phraseArrete('devis', 2000000),
    "Arrêté le présent devis à la somme de: DEUX MILLIONS D'ARIARY"
  );
});
