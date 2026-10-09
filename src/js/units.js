/*
 * units.js — unités proposées dans la colonne « UNITE » (liste <datalist>).
 * La saisie libre reste possible : cette liste n'est qu'une aide.
 */
(function (racine, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Unites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LISTE = Object.freeze([
    'U/te', 'Pièce', 'Forfait', 'm', 'm²', 'm³', 'ml', 'L', 'kg', 't',
    'Ens', 'Lot', 'Jour', 'Heure', 'Mois', 'Sac', 'Rouleau', 'Barre'
  ]);

  /** Unité proposée par défaut pour une nouvelle ligne. */
  const PAR_DEFAUT = 'U/te';

  return { LISTE, PAR_DEFAUT };
});
