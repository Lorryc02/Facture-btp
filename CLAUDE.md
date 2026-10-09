# CLAUDE.md — DevisPro

Application de bureau Windows (Electron) pour créer des **devis** et des **factures** A4
au nom de RAZAFIMAHEFA Harry Luc (Antananarivo, Madagascar).
Le rendu doit reproduire fidèlement `reference/facture-modele.jpg`.

## Règles permanentes

- **Autonomie** : ne jamais poser de question à l'utilisateur ; en cas d'ambiguïté,
  choisir un défaut raisonnable et le noter dans `README.md` (section « Choix par défaut »).
- **Node** : utiliser Node 18+. S'il est absent (Windows), télécharger le zip portable
  officiel Node LTS win-x64 dans `.tools/node` (sans installation système) et l'ajouter
  au PATH uniquement dans les commandes lancées.
- **Dépendances** : seulement `electron` et `electron-builder` en devDependencies.
  Aucune dépendance runtime, aucun framework, aucun bundler, aucune étape de build côté interface :
  HTML + CSS + JavaScript vanilla (scripts classiques, pas de modules ES).
- **Hors-ligne à 100 %** : aucune ressource distante (pas de CDN, pas de polices web,
  correcteur orthographique désactivé).
- **Français partout** : interface, messages, commentaires du code.
- **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` ;
  l'interface ne parle au système que via `window.devisPro` (défini dans `preload.js`).
- **Travail par phases** : après chaque modification, lancer `npm test` (tests unitaires)
  et, pour le rendu, `npm run selftest` puis comparer `dist/selftest/apercu.png`
  avec `reference/facture-modele.jpg`.
- Les calculs sont **uniquement** dans `src/js/calc.js` (fonctions pures, testées).
  Tous les montants sont des entiers en Ariary ; quantités en centièmes entiers.
- L'en-tête de l'émetteur est **constant** : le modifier uniquement dans `src/js/emetteur.js`.

## Commandes

| Commande            | Rôle                                                                 |
|---------------------|----------------------------------------------------------------------|
| `npm start`         | lance l'application                                                   |
| `npm test`          | tests unitaires (`node --test`) de `calc.js` et `numberToWords.js`    |
| `npm run selftest`  | ouvre le document d'exemple, exporte `dist/selftest/apercu.pdf` + `.png`, vérifie l'interface puis quitte |
| `npm run build`     | `electron-builder --win dir` → `dist/win-unpacked/DevisPro.exe`       |
| `npm run icon`      | régénère `build/icon.ico`                                             |
| `npm run zip`       | crée `dist/DevisPro-win-unpacked.zip`                                 |

Sous Linux (conteneur, CI) : `xvfb-run -a npm run selftest -- --no-sandbox`.

## Arborescence

```
CLAUDE.md                 ces règles
README.md                 mode d'emploi + choix par défaut
package.json              scripts + configuration electron-builder
main.js                   fenêtre, IPC, fichiers, export PDF (printToPDF), mode --selftest
preload.js                pont contextBridge → window.devisPro
src/
  index.html              barre d'outils + page A4 éditable + fenêtres modales
  css/document.css        rendu de la page A4 (identique écran / impression / PDF)
  css/app.css             barre d'outils, modales, contrôles (masqués à l'impression)
  js/emetteur.js          constantes de l'en-tête fixe et du cachet
  js/state.js             état du document, valeurs par défaut, sérialisation JSON
  js/calc.js              calculs (fonctions pures) + formats (montants, quantités, dates)
  js/numberToWords.js     nombre → lettres (français, MAJUSCULES, sans traits d'union)
  js/units.js             liste des unités proposées
  js/signature.js         dessin de la signature (canvas) + import d'image
  js/storage.js           brouillon automatique, enregistrer / ouvrir / supprimer
  js/app.js               événements, rendu, barre d'outils, autotest de l'interface
tests/                    calc.test.js, numberToWords.test.js (node --test)
scripts/                  make-icon.js (icône), zip.js (archive du build), outils.js (CRC-32)
reference/facture-modele.jpg   modèle à reproduire
docs/apercu.png           aperçu du rendu (copie de dist/selftest/apercu.png)
build/icon.ico            icône générée par scripts/make-icon.js (+ icon.png, aperçu)
.github/workflows/        build Windows + lancement de DevisPro.exe --selftest + zip
.tools/                   Node portable éventuel (ignoré par git)
dist/                     sorties (build, selftest) — ignoré par git
```

## Données utilisateur

`app.getPath('userData')` (Windows : `%APPDATA%\DevisPro`) :
`documents/*.json`, `signature.png`, `settings.json`, `brouillon.json`.
