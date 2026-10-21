// Tests de l'état du document (node --test)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Etat = require('../src/js/state.js');
const Calc = require('../src/js/calc.js');

test('ancienne « avance » convertie en acompte déduit', () => {
  const doc = Etat.normaliser({ type: 'facture', avance: { mode: 'montant', montant: '300 000' } });
  assert.deepEqual(doc.acomptes, [{ libelle: '', mode: 'montant', pourcent: 0, montant: 300000, deduit: true }]);
  assert.deepEqual(Etat.normaliser({ avance: { mode: 'pourcent', pourcent: 0 } }).acomptes, []);
  assert.deepEqual(Etat.normaliser({ acomptes: null }).acomptes, []);
});

test('Mobile Money retiré des documents', () => {
  const doc = Etat.normaliser({ paiement: { mobileMoney: { actif: true, numero: '034' }, especes: true } });
  assert.equal(doc.paiement.mobileMoney, undefined);
  assert.equal(doc.paiement.especes, true);
});

test('« Nouveau » : un acompte saisi en Ar est repris en pourcentage, déductions remises à zéro', () => {
  const precedent = {
    type: 'facture',
    lignes: [{ quantite: 1, prixUnitaire: 1000000 }],
    tva: { active: false },
    acomptes: [
      { mode: 'montant', montant: 300000, libelle: 'Commande', deduit: true },
      { mode: 'pourcent', pourcent: 70, libelle: 'Fin', deduit: true }
    ]
  };
  const repris = Etat.echeancierPourNouveau(precedent.acomptes, 'facture', Calc.calculerTotaux(precedent));
  assert.deepEqual(repris.map((a) => [a.mode, a.pourcent, a.montant, a.deduit, a.libelle]),
    [['pourcent', 30, 0, true, 'Commande'], ['pourcent', 70, 0, false, 'Fin']]);
  assert.deepEqual(Etat.echeancierPourNouveau(precedent.acomptes, 'devis', Calc.calculerTotaux(precedent)).map((a) => a.deduit),
    [false, false]);
});

test('facture suivante : l’acompte suivant est déduit en plus', () => {
  const ech = Etat.echeancierType('facture');
  assert.deepEqual(ech.map((a) => a.deduit), [true, false, false]);
  assert.deepEqual(Etat.deductionSuivante(ech).map((a) => a.deduit), [true, true, false]);
  assert.deepEqual(Etat.deductionSuivante(Etat.deductionSuivante(ech)).map((a) => a.deduit), [true, true, true]);
  assert.deepEqual(Etat.deductionPremiereFacture(Etat.echeancierType('devis')).map((a) => a.deduit), [true, false, false]);
});

test('statut payé et origine normalisés', () => {
  const doc = Etat.normaliser({ payee: true, payeeLe: '2026-10-21', origine: { id: 'doc-abc', type: 'devis', numero: '3 /ERZ/ DEVIS /26' } });
  assert.equal(doc.payee, true);
  assert.equal(doc.payeeLe, '2026-10-21');
  assert.deepEqual(doc.origine, { id: 'doc-abc', type: 'devis', numero: '3 /ERZ/ DEVIS /26' });
  assert.equal(Etat.normaliser({ origine: { id: '../x' } }).origine, null);
  assert.equal(Etat.normaliser({}).payee, false);
});

test('magasin : enregistrement d’une version précise et synchronisation sans « modifié »', () => {
  const m = Etat.creerMagasin();
  m.remplacer(Etat.documentVierge(), true);
  const envoye = Etat.cloner(m.doc);
  m.modifier((d) => { d.objet = 'tapé pendant l’enregistrement'; });
  m.marquerEnregistre(envoye);
  assert.equal(m.estModifie(), true, 'la frappe pendant l’enregistrement reste non enregistrée');
  m.marquerEnregistre();
  m.synchroniser((d) => { d.payee = true; });
  assert.equal(m.estModifie(), false);
});

test('remise et option des modalités normalisées (anciens documents compris)', () => {
  const ancien = Etat.normaliser({ type: 'facture' });
  assert.deepEqual(ancien.remise, { active: false, taux: 0 });
  assert.equal(ancien.afficherModalites, true);
  const doc = Etat.normaliser({ remise: { active: true, taux: '12,5' }, afficherModalites: false });
  assert.deepEqual(doc.remise, { active: true, taux: 12.5 });
  assert.equal(doc.afficherModalites, false);
  assert.equal(Etat.normaliser({ remise: { active: true, taux: 250 } }).remise.taux, 100);
});
