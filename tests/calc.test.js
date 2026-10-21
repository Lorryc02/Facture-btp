// Tests des calculs (node --test)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../src/js/calc.js');

const NBSP = ' ';

test('facture du modèle : HT 985 000, TVA 197 000, TTC 1 182 000', () => {
  const doc = {
    lignes: [
      { designation: 'Canapé 3 places', quantite: '1', prixUnitaire: '75 000' },
      { designation: 'Canapé 2 places', quantite: '1', prixUnitaire: '60 000' },
      { designation: 'Canapé 1 place', quantite: '1', prixUnitaire: '50 000' },
      { designation: 'Table basse', quantite: '1', prixUnitaire: '50 000' },
      { designation: 'Etagères', quantite: '3', prixUnitaire: '90 000' },
      { designation: 'Peinture (L)', quantite: '5', prixUnitaire: '96 000' }
    ],
    tva: { active: true, taux: '20' },
    acomptes: []
  };
  const t = Calc.calculerTotaux(doc);
  assert.deepEqual(t.montants, [75000, 60000, 50000, 50000, 270000, 480000]);
  assert.equal(t.ht, 985000);
  assert.equal(t.tva, 197000);
  assert.equal(t.ttc, 1182000);
  assert.equal(t.totalAcomptes, 0);
  assert.equal(t.reste, 1182000);
  assert.equal(t.arrete, 1182000);
  assert.equal(Calc.formaterMontant(t.ttc), `1${NBSP}182${NBSP}000`);
});

test('lecture des saisies : virgule, point, espaces, entrées invalides', () => {
  assert.equal(Calc.lireCentiemes('1,5'), 150);
  assert.equal(Calc.lireCentiemes('1.5'), 150);
  assert.equal(Calc.lireCentiemes(' 2 '), 200);
  assert.equal(Calc.lireCentiemes('1,005'), 101);
  assert.equal(Calc.lireCentiemes('0,004'), 0);
  assert.equal(Calc.lireCentiemes(1.005), 101);
  assert.equal(Calc.lireCentiemes('1.234,56'), 123456);
  assert.equal(Calc.lireCentiemes('1,234.56'), 123456);
  assert.equal(Calc.lireEntier('75 000'), 75000);
  assert.equal(Calc.lireEntier(`1${NBSP}182${NBSP}000`), 1182000);
  assert.equal(Calc.lireEntier('1 000'), 1000);
  assert.equal(Calc.lireEntier('1.000.000'), 1000000);
  assert.equal(Calc.lireEntier('75 000 Ar'), 75000);
  assert.equal(Calc.lireEntier('75 000 Ariary'), 75000);
  // Montants écrits à la malgache : un seul séparateur suivi de 3 chiffres = milliers
  assert.equal(Calc.lireEntier('150.000'), 150000);
  assert.equal(Calc.lireEntier('45,000'), 45000);
  assert.equal(Calc.lireEntier('300.000 Ar'), 300000);
  assert.equal(Calc.lireEntier('1.50'), 2);
  assert.equal(Calc.lireCentiemes('1.500'), 150, 'une quantité garde sa virgule décimale');
  assert.equal(Calc.montantLigne('12', '45.000'), 540000);
  assert.equal(Calc.lireEntier('12,5'), 13);
  assert.equal(Calc.lireEntier('-12,5'), -13);
  assert.equal(Calc.lireCentiemes('20 %'), 2000);
  for (const invalide of ['', '   ', 'abc', '1a', '--1', ',', '.', '1,2.3,4', null, undefined, NaN, Infinity, {}, []]) {
    const v = Calc.lireCentiemes(invalide);
    assert.equal(v, 0, `saisie ${String(invalide)}`);
    assert.ok(!Number.isNaN(Calc.lireEntier(invalide)));
  }
  assert.ok(Object.is(Calc.lireEntier('-0'), 0), 'pas de -0');
});

test('montant de ligne arrondi à l’entier, sans erreur de virgule flottante', () => {
  assert.equal(Calc.montantLigne('3', '90000'), 270000);
  assert.equal(Calc.montantLigne('0,1', '3'), 0);       // 0,3 → 0
  assert.equal(Calc.montantLigne('0,5', '3'), 2);       // 1,5 → 2
  assert.equal(Calc.montantLigne('1,15', '100'), 115);  // 1.15 * 100 = 114.99999… en flottant
  assert.equal(Calc.montantLigne('0,29', '100'), 29);   // 0.29 * 100 = 28.999… en flottant
  assert.equal(Calc.montantLigne('2,5', '1 001'), 2503); // 2502,5 → 2503
  assert.equal(Calc.montantLigne('', '1000'), 0);
  assert.equal(Calc.montantLigne('2', ''), 0);
  assert.equal(Calc.montantLigne('abc', 'xyz'), 0);
  assert.equal(Calc.montantLigne('1 000', '999 999 999'), 999999999000);
  assert.equal(Calc.montantLigne('-1', '5000'), -5000); // remise éventuelle
});

test('TVA : arrondi, taux décimal, désactivation', () => {
  const lignes = [{ quantite: '1', prixUnitaire: '1003' }];
  let t = Calc.calculerTotaux({ lignes, tva: { active: true, taux: '20' } });
  assert.equal(t.tva, 201); // 200,6 → 201
  assert.equal(t.ttc, 1204);
  t = Calc.calculerTotaux({ lignes, tva: { active: true, taux: '5,5' } });
  assert.equal(t.tva, 55); // 55,165 → 55
  assert.equal(t.taux, 5.5);
  t = Calc.calculerTotaux({ lignes, tva: { active: false, taux: '20' } });
  assert.equal(t.tva, 0);
  assert.equal(t.ttc, 1003);
  assert.equal(t.arrete, 1003);
  assert.equal(t.tvaActive, false);
  t = Calc.calculerTotaux({ lignes, tva: { active: true, taux: '' } });
  assert.equal(t.tva, 0);
});

test('un acompte en % ou en Ar, synchronisé et borné entre 0 et le TTC', () => {
  assert.deepEqual(Calc.calculerAcompte(1182000, { mode: 'pourcent', pourcent: '30' }), { montant: 354600, pourcent: 30 });
  assert.deepEqual(Calc.calculerAcompte(1182000, { mode: 'montant', montant: '354 600' }), { montant: 354600, pourcent: 30 });
  assert.deepEqual(Calc.calculerAcompte(300, { mode: 'montant', montant: '100' }), { montant: 100, pourcent: 33.33 });
  assert.deepEqual(Calc.calculerAcompte(1000, { mode: 'pourcent', pourcent: '150' }), { montant: 1000, pourcent: 100 });
  assert.deepEqual(Calc.calculerAcompte(1000, { mode: 'pourcent', pourcent: '-5' }), { montant: 0, pourcent: 0 });
  assert.deepEqual(Calc.calculerAcompte(1000, { mode: 'montant', montant: '5000' }), { montant: 1000, pourcent: 100 });
  assert.deepEqual(Calc.calculerAcompte(1000, { mode: 'montant', montant: '-1' }), { montant: 0, pourcent: 0 });
  assert.deepEqual(Calc.calculerAcompte(0, { mode: 'montant', montant: '500' }), { montant: 0, pourcent: 0 });
  assert.deepEqual(Calc.calculerAcompte(1000, undefined), { montant: 0, pourcent: 0 });
});

const echeancier = (...deduits) => [
  { mode: 'pourcent', pourcent: 20, libelle: 'Début des travaux', deduit: !!deduits[0] },
  { mode: 'pourcent', pourcent: 30, libelle: 'Mi-parcours', deduit: !!deduits[1] },
  { mode: 'pourcent', pourcent: 50, libelle: 'Fin des travaux', deduit: !!deduits[2] }
];
const modele = (type, acomptes) => ({
  type,
  lignes: [{ quantite: '1', prixUnitaire: '985 000' }],
  tva: { active: true, taux: 20 },
  acomptes
});

test('échéancier 20 / 30 / 50 : première facture, seul le premier acompte est déduit', () => {
  const t = Calc.calculerTotaux(modele('facture', echeancier(true)));
  assert.equal(t.ttc, 1182000);
  assert.deepEqual(t.acomptes.map((a) => a.montant), [236400, 354600, 591000]);
  assert.deepEqual(t.acomptes.map((a) => a.montantDeduit), [236400, 0, 0]);
  assert.equal(t.pourcentEcheancier, 100);
  assert.equal(t.totalAcomptes, 236400);
  assert.equal(t.reste, 945600);
  assert.equal(t.arrete, 945600, 'facture : la phrase d’arrêté reprend le reste à payer');
});

test('plusieurs acomptes déduits, dans n’importe quel ordre', () => {
  let t = Calc.calculerTotaux(modele('facture', echeancier(true, true)));
  assert.equal(t.totalAcomptes, 591000);
  assert.equal(t.reste, 591000);
  t = Calc.calculerTotaux(modele('facture', echeancier(false, true, true)));
  assert.equal(t.totalAcomptes, 945600);
  assert.equal(t.reste, 236400);
  t = Calc.calculerTotaux(modele('facture', echeancier(true, true, true)));
  assert.equal(t.reste, 0);
  assert.equal(t.arrete, 0);
  // Quatre acomptes de 25 % : on n'est pas limité à deux ou trois
  const quatre = [1, 2, 3, 4].map((n) => ({ mode: 'pourcent', pourcent: 25, libelle: 'Étape ' + n, deduit: n <= 3 }));
  t = Calc.calculerTotaux(modele('facture', quatre));
  assert.equal(t.totalAcomptes, 886500);
  assert.equal(t.reste, 295500);
});

test('acomptes déduits au-delà de 100 % : le reste ne devient jamais négatif', () => {
  const trop = [
    { mode: 'pourcent', pourcent: 80, deduit: true },
    { mode: 'montant', montant: '500 000', deduit: true }
  ];
  const t = Calc.calculerTotaux(modele('facture', trop));
  assert.deepEqual(t.acomptes.map((a) => a.montantDeduit), [945600, 236400]);
  assert.equal(t.reste, 0);
});

test('devis : arrêté = TTC sans déduction (par défaut), sinon reste à payer', () => {
  let t = Calc.calculerTotaux(modele('devis', echeancier()));
  assert.equal(t.arrete, 1182000);
  t = Calc.calculerTotaux(modele('devis', echeancier(true)));
  assert.equal(t.reste, 945600);
  assert.equal(t.arrete, 945600);
});

test('arrondi cumulé : les acomptes en % font toujours exactement le TTC', () => {
  for (let ttc = 1182000; ttc < 1183000; ttc++) {
    for (const parts of [[50, 50], [20, 30, 50], [25, 25, 25, 25], [33.33, 33.33, 33.34], [10, 15, 75]]) {
      const r = Calc.calculerAcomptes(ttc, parts.map((p) => ({ mode: 'pourcent', pourcent: p })));
      assert.equal(r.totalMontants, ttc, `${ttc} ${parts}`);
      assert.equal(r.totalPourcent, 100);
    }
  }
  const r = Calc.calculerAcomptes(1182001, [{ pourcent: 50, deduit: true }, { pourcent: 50 }]);
  assert.deepEqual(r.lignes.map((l) => l.montant), [591001, 591000]);
});

test('acompte plafonné : montant et pourcentage réellement déduits', () => {
  const r = Calc.calculerAcomptes(1182000, [
    { mode: 'pourcent', pourcent: 80, deduit: true },
    { mode: 'pourcent', pourcent: 50, deduit: true }
  ]);
  assert.equal(r.lignes[1].montant, 591000);
  assert.equal(r.lignes[1].montantDeduit, 236400);
  assert.equal(r.lignes[1].pourcentDeduit, 20);
  assert.equal(r.lignes[1].plafonne, true);
  assert.equal(r.lignes[0].plafonne, false);
});

test('exemple utilisateur : 562 500 Ar sans TVA, acompte de 20 % déduit → 450 000 Ar', () => {
  const t = Calc.calculerTotaux({
    type: 'facture',
    lignes: [{ quantite: '12,5', prixUnitaire: '45 000' }],
    tva: { active: false, taux: 20 },
    acomptes: [{ mode: 'pourcent', pourcent: 20, libelle: 'Début des travaux', deduit: true }]
  });
  assert.equal(t.ttc, 562500);
  assert.equal(t.totalAcomptes, 112500);
  assert.equal(t.arrete, 450000);
});

test('document vide ou incomplet : zéros, jamais NaN', () => {
  for (const doc of [undefined, null, {}, { lignes: [{}] }, { lignes: [null] }, { tva: { active: true } }]) {
    const t = Calc.calculerTotaux(doc);
    for (const cle of ['ht', 'tva', 'ttc', 'totalAcomptes', 'reste', 'arrete']) {
      assert.equal(t[cle], 0, `${cle} pour ${JSON.stringify(doc)}`);
    }
  }
});

test('formats : montants, quantités, pourcentages', () => {
  assert.equal(Calc.formaterMontant(0), '0');
  assert.equal(Calc.formaterMontant(999), '999');
  assert.equal(Calc.formaterMontant(75000), `75${NBSP}000`);
  assert.equal(Calc.formaterMontant(1182000), `1${NBSP}182${NBSP}000`);
  assert.equal(Calc.formaterMontant(-5000), `-5${NBSP}000`);
  assert.equal(Calc.formaterMontant(NaN), '0');
  assert.equal(Calc.formaterQuantite('3'), '3,00');
  assert.equal(Calc.formaterQuantite('1.5'), '1,50');
  assert.equal(Calc.formaterQuantite(''), '0,00');
  assert.equal(Calc.formaterQuantite('1250,5'), `1${NBSP}250,50`);
  assert.equal(Calc.formaterPourcent(20), '20');
  assert.equal(Calc.formaterPourcent(33.33), '33,33');
  assert.equal(Calc.formaterPourcent('12,50'), '12,5');
});

test('dates longues en français', () => {
  assert.equal(Calc.formaterDateLongue('2026-09-14'), '14 Septembre 2026');
  assert.equal(Calc.formaterDateLongue('2026-08-01'), '1er Août 2026');
  assert.equal(Calc.formaterDateLongue('2026-02-28'), '28 Février 2026');
  assert.equal(Calc.formaterDateLongue(''), '');
  assert.equal(Calc.formaterDateLongue('2026-13-01'), '');
  assert.equal(Calc.dateIso(new Date(2026, 8, 14)), '2026-09-14');
});

test('incrément du numéro : premier entier trouvé', () => {
  assert.equal(Calc.incrementerNumero('48 /ERZ/ FACPRO /26'), '49 /ERZ/ FACPRO /26');
  assert.equal(Calc.incrementerNumero('FAC-099/26'), 'FAC-100/26');
  assert.equal(Calc.incrementerNumero('D-009'), 'D-010');
  assert.equal(Calc.incrementerNumero('ERZ'), 'ERZ 1');
  assert.equal(Calc.incrementerNumero(''), '1');
  assert.equal(Calc.incrementerNumero(undefined), '1');
});

test('nom du fichier PDF issu du numéro', () => {
  assert.equal(Calc.nomFichierPdf('facture', '48 /ERZ/ FACPRO /26'), 'Facture-48-ERZ-FACPRO-26.pdf');
  assert.equal(Calc.nomFichierPdf('devis', '12/ERZ/DEV/26'), 'Devis-12-ERZ-DEV-26.pdf');
  assert.equal(Calc.nomFichierPdf('facture', 'N° 5 : été'), 'Facture-N-5-ete.pdf');
  assert.equal(Calc.nomFichierPdf('devis', ''), 'Devis.pdf');
});
