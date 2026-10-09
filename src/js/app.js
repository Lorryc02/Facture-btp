/*
 * app.js — branchements des événements et rendu de la page.
 *
 * La page A4 est le formulaire : chaque champ modifie le document courant
 * (magasin de state.js), puis les montants, totaux, phrase d'arrêté et
 * blocs imprimés sont recalculés (calc.js, numberToWords.js).
 */
(function () {
  'use strict';

  const api = window.devisPro;
  const $ = (selecteur, racine) => (racine || document).querySelector(selecteur);
  const $$ = (selecteur, racine) => Array.from((racine || document).querySelectorAll(selecteur));

  const magasin = Etat.creerMagasin();
  let signatureDataUrl = null;   // signature mémorisée (userData/signature.png)
  let reglages = {};
  let padSignature = null;
  let modeSelftest = false;

  const el = {
    page: $('#page'),
    emetteur: $('#emetteur'),
    ville: $('#champ-ville'),
    dateTexte: $('#date-texte'),
    date: $('#champ-date'),
    destinataire: $('#champ-destinataire'),
    libelleNumero: $('#libelle-numero'),
    numero: $('#champ-numero'),
    objet: $('#champ-objet'),
    tableau: $('#tableau'),
    corps: $('#corps-lignes'),
    blocFin: $('#bloc-fin'),
    paiements: $('#paiements'),
    arretePhrase: $('#arrete-phrase'),
    arreteChiffres: $('#arrete-chiffres'),
    zoneSignature: $('#zone-signature'),
    cachet: $('#cachet'),
    imageSignature: $('#image-signature'),
    aideSignature: $('#aide-signature'),
    etat: $('#etat-document'),
    unites: $('#liste-unites'),
    notification: $('#notification')
  };

  // ===========================================================================
  // Petites aides
  // ===========================================================================

  /** Crée un élément avec classe et texte. */
  function creer(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  const formaterQuantiteOuVide = (q) => (q === null ? '' : Calc.formaterQuantite(q));
  const formaterPrixOuVide = (pu) => (pu === null ? '' : Calc.formaterMontant(pu));
  const libelleType = (type) => (type === 'devis' ? 'Devis' : 'Facture');

  let minuterieNotification = null;

  /**
   * Affiche une notification en bas de la fenêtre.
   * @param {string} message
   * @param {'info'|'succes'|'erreur'} genre
   * @param {{libelle: string, action: Function}} [bouton]
   */
  function notifier(message, genre, bouton) {
    const n = el.notification;
    n.className = 'notification ' + (genre || 'info');
    $('.texte', n).textContent = message;
    const b = $('.action', n);
    b.hidden = !bouton;
    b.onclick = null;
    if (bouton) {
      b.textContent = bouton.libelle;
      b.onclick = () => {
        n.hidden = true;
        bouton.action();
      };
    }
    n.hidden = false;
    clearTimeout(minuterieNotification);
    minuterieNotification = setTimeout(() => { n.hidden = true; }, bouton ? 8000 : 4000);
  }

  /** Question native avec boutons en français ; renvoie l'index du bouton choisi. */
  function question(options) {
    return api.question(options);
  }

  // ===========================================================================
  // Éléments fixes : en-tête, cachet, unités
  // ===========================================================================

  function construireElementsFixes() {
    el.emetteur.replaceChildren(creer('div', 'nom', Emetteur.nom));
    Emetteur.lignes.forEach((ligne) => el.emetteur.append(creer('div', '', ligne)));

    el.cachet.replaceChildren(creer('div', 'nom', Emetteur.cachet.nom));
    Emetteur.cachet.lignes.forEach((ligne) => el.cachet.append(creer('div', '', ligne)));

    el.unites.replaceChildren(...Unites.LISTE.map((u) => {
      const option = document.createElement('option');
      option.value = u;
      return option;
    }));

    const operateurs = $('#paiement-mm-operateur');
    operateurs.replaceChildren(...Emetteur.operateursMobileMoney.map((o) => {
      const option = document.createElement('option');
      option.value = o;
      option.textContent = o;
      return option;
    }));
  }

  // ===========================================================================
  // Lignes du tableau
  // ===========================================================================

  /** Construit la ligne <tr> n° `index`. */
  function creerLigne(index, ligne) {
    const tr = creer('tr', 'ligne');
    tr.dataset.index = String(index);

    const tdNum = creer('td', 'c-num');
    tdNum.append(creer('span', 'numero-ligne', String(index + 1)));
    const gauche = creer('span', 'actions-ligne actions-gauche ecran-seulement');
    gauche.append(boutonLigne('monter', '↑', 'Monter la ligne'), boutonLigne('descendre', '↓', 'Descendre la ligne'));
    tdNum.append(gauche);

    const tdDes = creer('td', 'c-designation');
    const designation = creer('textarea', 'champ designation');
    designation.rows = 1;
    designation.spellcheck = false;
    designation.placeholder = 'Désignation';
    designation.dataset.cle = 'designation';
    designation.value = ligne.designation;
    designation.setAttribute('aria-label', 'Désignation ligne ' + (index + 1));
    tdDes.append(designation);

    const tdUnite = creer('td', 'c-unite');
    const unite = champLigne('unite', 'Unité', ligne.unite);
    unite.setAttribute('list', 'liste-unites');
    tdUnite.append(unite);

    const tdQte = creer('td', 'c-quantite');
    const quantite = champLigne('quantite', 'Quantité', formaterQuantiteOuVide(ligne.quantite));
    quantite.inputMode = 'decimal';
    tdQte.append(quantite);

    const tdPu = creer('td', 'c-pu');
    const pu = champLigne('prixUnitaire', 'Prix unitaire', formaterPrixOuVide(ligne.prixUnitaire));
    pu.classList.add('pu');
    pu.inputMode = 'numeric';
    tdPu.append(pu);

    const tdMontant = creer('td', 'c-montant');
    tdMontant.append(creer('span', 'montant'));
    const droite = creer('span', 'actions-ligne actions-droite ecran-seulement');
    droite.append(boutonLigne('inserer', '+', 'Insérer une ligne en dessous'), boutonLigne('supprimer', '×', 'Supprimer la ligne'));
    tdMontant.append(droite);

    tr.append(tdNum, tdDes, tdUnite, tdQte, tdPu, tdMontant);
    return tr;
  }

  function champLigne(cle, libelle, valeur) {
    const input = creer('input', 'champ ' + cle.toLowerCase());
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.cle = cle;
    input.value = valeur;
    input.setAttribute('aria-label', libelle);
    return input;
  }

  function boutonLigne(action, symbole, titre) {
    const b = creer('button', '', symbole);
    b.type = 'button';
    b.tabIndex = -1;
    b.dataset.action = action;
    b.title = titre;
    return b;
  }

  /** Reconstruit toutes les lignes (après ajout, suppression, déplacement ou ouverture). */
  function afficherLignes() {
    const trs = magasin.doc.lignes.map((l, i) => creerLigne(i, l));
    const derniere = trs.pop();
    el.corps.replaceChildren(...trs);
    // La dernière ligne est placée avec les totaux pour ne jamais en être séparée
    el.blocFin.replaceChildren(derniere);
    rafraichirCalculs();
  }

  const lignesDom = () => $$('tr.ligne', el.tableau);

  /** Réaffiche les quantités et prix au format (« 3,00 », « 75 000 »). */
  function reformaterChamps() {
    lignesDom().forEach((tr) => {
      const l = magasin.doc.lignes[Number(tr.dataset.index)];
      if (!l) return;
      $('.quantite', tr).value = formaterQuantiteOuVide(l.quantite);
      $('.pu', tr).value = formaterPrixOuVide(l.prixUnitaire);
    });
  }

  function focaliserLigne(index, selecteur) {
    const tr = lignesDom()[index];
    if (tr) $(selecteur || '.designation', tr).focus();
  }

  function ajouterLigne(apres) {
    const position = apres === undefined ? magasin.doc.lignes.length : apres + 1;
    magasin.modifier((doc) => doc.lignes.splice(position, 0, Etat.nouvelleLigne()), 'structure');
    afficherLignes();
    focaliserLigne(position);
  }

  function supprimerLigne(index) {
    const doc = magasin.doc;
    const retiree = Etat.cloner(doc.lignes[index]);
    magasin.modifier((d) => {
      d.lignes.splice(index, 1);
      if (!d.lignes.length) d.lignes.push(Etat.nouvelleLigne());
    }, 'structure');
    afficherLignes();
    focaliserLigne(Math.min(index, magasin.doc.lignes.length - 1));
    notifier('Ligne ' + (index + 1) + ' supprimée.', 'info', {
      libelle: 'Annuler',
      action: () => {
        magasin.modifier((d) => {
          const vide = d.lignes.length === 1 && !d.lignes[0].designation && d.lignes[0].quantite === null
            && d.lignes[0].prixUnitaire === null && !d.lignes[0].unite;
          if (vide) d.lignes.splice(0, 1);
          d.lignes.splice(Math.min(index, d.lignes.length), 0, retiree);
        }, 'structure');
        afficherLignes();
      }
    });
  }

  function deplacerLigne(index, sens) {
    const cible = index + sens;
    if (cible < 0 || cible >= magasin.doc.lignes.length) return;
    magasin.modifier((d) => {
      const [l] = d.lignes.splice(index, 1);
      d.lignes.splice(cible, 0, l);
    }, 'structure');
    afficherLignes();
    focaliserLigne(cible);
  }

  // ===========================================================================
  // Rendu du document
  // ===========================================================================

  /** Affiche tout le document courant (ouverture, nouveau, brouillon). */
  function afficherDocument() {
    const doc = magasin.doc;
    el.ville.value = doc.ville;
    el.date.value = doc.date;
    el.destinataire.value = doc.destinataire;
    el.numero.value = doc.numero;
    el.objet.value = doc.objet;
    afficherLignes();
    ajusterZonesTexte();
  }

  /** Recalcule et affiche tout ce qui dépend des données (montants, totaux, arrêté…). */
  function rafraichirCalculs() {
    const doc = magasin.doc;
    const totaux = Calc.calculerTotaux(doc);

    // Montants des lignes (vides tant que quantité et prix ne sont pas saisis)
    lignesDom().forEach((tr) => {
      const i = Number(tr.dataset.index);
      const l = doc.lignes[i];
      if (!l) return;
      const complet = l.quantite !== null && l.prixUnitaire !== null;
      $('.montant', tr).textContent = complet ? Calc.formaterMontant(totaux.montants[i]) : '';
    });

    rafraichirTotaux(totaux);

    // Date, type, numéro
    el.dateTexte.textContent = Calc.formaterDateLongue(doc.date) || 'Choisir la date';
    el.libelleNumero.textContent = (doc.type === 'devis' ? 'DEVIS' : 'FACTURE') + ' N°:';

    // Phrase d'arrêté (montant TTC, ou total si la TVA est désactivée)
    try {
      el.arretePhrase.textContent = NombreEnLettres.phraseArrete(doc.type, totaux.arrete);
    } catch {
      el.arretePhrase.textContent = (doc.type === 'devis'
        ? 'Arrêté le présent devis à la somme de: '
        : 'Arrêtée la présente facture à la somme de: ') + '(MONTANT HORS LIMITE)';
    }
    el.arreteChiffres.textContent = '(Ar ' + Calc.formaterMontant(totaux.arrete) + ')';

    rafraichirPaiements();
    rafraichirSignature();
    rafraichirBarreOutils(totaux);
  }

  /** Ligne vide puis lignes de totaux dans le bloc de fin du tableau. */
  function rafraichirTotaux(t) {
    const derniere = $('tr.ligne', el.blocFin);
    const lignes = [];

    const espace = creer('tr', 'espace');
    espace.append(creer('td', 'vide'));
    for (let i = 0; i < 5; i++) espace.append(creer('td'));
    lignes.push(espace);

    const total = (cle, libelle, valeur) => {
      const tr = creer('tr', 'total');
      tr.dataset.total = cle;
      const libelleTd = creer('td', 'libelle', libelle);
      libelleTd.colSpan = 3;
      const valeurTd = creer('td', 'valeur', Calc.formaterMontant(valeur));
      valeurTd.colSpan = 2;
      tr.append(creer('td', 'vide'), libelleTd, valeurTd);
      lignes.push(tr);
    };

    total('ht', 'MONTANT TOTAL', t.ht);
    if (t.tvaActive) {
      total('tva', 'TVA ' + Calc.formaterPourcent(t.taux) + '%', t.tva);
      total('ttc', 'MONTANT TOTAL TTC', t.ttc);
    }
    if (t.avance > 0) {
      total('avance', 'Avance (' + Calc.formaterPourcent(t.avancePourcent) + ' %)', t.avance);
      total('reste', 'Reste à payer', t.reste);
    }

    el.blocFin.replaceChildren(...(derniere ? [derniere] : []), ...lignes);
  }

  /** Bloc imprimé des modes de paiement (seuls les modes cochés). */
  function rafraichirPaiements() {
    const p = magasin.doc.paiement;
    const lignes = [];
    const ajouter = (libelle, valeur) => {
      lignes.push(creer('span', 'libelle', libelle), creer('span', 'deux-points', ':'), creer('span', 'valeur', valeur));
    };
    if (p.especes) ajouter('PAIEMENT', 'EN ESPECES');
    if (p.mobileMoney.actif) {
      ajouter('MOBILE MONEY', [p.mobileMoney.operateur.toUpperCase(), p.mobileMoney.numero.trim()].filter(Boolean).join('  '));
    }
    if (p.virement.actif) {
      ajouter('NUMERO DU COMPTE BANCAIRE', [p.virement.banque.trim(), p.virement.compte.trim()].filter(Boolean).join('  '));
    }
    el.paiements.replaceChildren(...lignes);
  }

  /** Cachet et image de signature selon les cases « Afficher ». */
  function rafraichirSignature() {
    const doc = magasin.doc;
    const avecImage = !!(doc.afficherSignature && signatureDataUrl);
    el.cachet.hidden = !doc.afficherCachet;
    el.imageSignature.hidden = !avecImage;
    if (avecImage && el.imageSignature.getAttribute('src') !== signatureDataUrl) {
      el.imageSignature.src = signatureDataUrl;
    }
    el.aideSignature.hidden = avecImage;
    el.aideSignature.textContent = signatureDataUrl
      ? 'Signature masquée — cliquez pour l’afficher'
      : 'Cliquez sur « Signer » pour ajouter la signature';
  }

  /** États de la barre d'outils, titre de la fenêtre et indicateur « modifié ». */
  function rafraichirBarreOutils(totaux) {
    const doc = magasin.doc;
    const t = totaux || Calc.calculerTotaux(doc);
    $$('.bascule-type button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === doc.type)));
    indicateur($('#btn-tva'), t.tvaActive ? Calc.formaterPourcent(t.taux) + ' %' : 'non');
    indicateur($('#btn-avance'), t.avance > 0 ? Calc.formaterPourcent(t.avancePourcent) + ' %' : '');

    const modifie = magasin.estModifie();
    el.etat.classList.toggle('modifie', modifie);
    el.etat.textContent = modifie ? '● Non enregistré' : (doc.id ? 'Enregistré' : 'Nouveau');
    el.etat.title = modifie
      ? 'Des modifications ne sont pas encore enregistrées (Ctrl+S). Un brouillon est gardé automatiquement.'
      : (doc.id ? 'Toutes les modifications sont enregistrées.' : 'Nouveau document, pas encore enregistré.');
    document.title = 'DevisPro — ' + libelleType(doc.type) + ' ' + (doc.numero || '') + (modifie ? ' •' : '');
  }

  function indicateur(bouton, texte) {
    let badge = $('.indicateur', bouton);
    if (!texte) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = creer('span', 'indicateur');
      bouton.append(badge);
    }
    badge.textContent = texte;
  }

  /** Repli si le navigateur ne gère pas `field-sizing: content` : hauteur des zones de texte. */
  const tailleAuto = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
  function ajusterZonesTexte(cible) {
    if (tailleAuto) return;
    (cible ? [cible] : $$('textarea.champ', el.page)).forEach((ta) => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  }

  // ===========================================================================
  // Saisie sur la page
  // ===========================================================================

  function brancherPage() {
    el.page.addEventListener('input', (e) => {
      const cible = e.target;
      if (cible.tagName === 'TEXTAREA') ajusterZonesTexte(cible);

      if (cible.dataset.cle) {
        const index = Number(cible.closest('tr.ligne').dataset.index);
        const cle = cible.dataset.cle;
        const texte = cible.value;
        magasin.modifier((doc) => {
          const l = doc.lignes[index];
          if (cle === 'quantite') l.quantite = texte.trim() ? Calc.lireDecimal(texte) : null;
          else if (cle === 'prixUnitaire') l.prixUnitaire = texte.trim() ? Calc.lireEntier(texte) : null;
          else l[cle] = texte;
        }, 'ligne');
        return;
      }
      const champ = cible.dataset.champ;
      if (champ) magasin.modifier((doc) => { doc[champ] = cible.value; }, champ);
    });

    // En quittant un champ numérique, on le réaffiche au format
    el.page.addEventListener('focusout', (e) => {
      const cible = e.target;
      if (cible.dataset.cle !== 'quantite' && cible.dataset.cle !== 'prixUnitaire') return;
      const tr = cible.closest('tr.ligne');
      const l = tr && magasin.doc.lignes[Number(tr.dataset.index)];
      if (!l) return;
      cible.value = cible.dataset.cle === 'quantite'
        ? formaterQuantiteOuVide(l.quantite)
        : formaterPrixOuVide(l.prixUnitaire);
    });

    // Entrée dans la quantité / le prix de la dernière ligne : nouvelle ligne
    el.page.addEventListener('keydown', (e) => {
      const cible = e.target;
      if (e.key !== 'Enter' || !cible.dataset || !['unite', 'quantite', 'prixUnitaire'].includes(cible.dataset.cle)) return;
      e.preventDefault();
      const index = Number(cible.closest('tr.ligne').dataset.index);
      if (index === magasin.doc.lignes.length - 1) ajouterLigne(index);
      else focaliserLigne(index + 1, '.' + cible.classList[1]);
    });

    // Boutons de ligne (↑ ↓ + ×)
    el.tableau.addEventListener('click', (e) => {
      const bouton = e.target.closest('button[data-action]');
      if (!bouton) return;
      const index = Number(bouton.closest('tr.ligne').dataset.index);
      const action = bouton.dataset.action;
      if (action === 'inserer') ajouterLigne(index);
      else if (action === 'supprimer') supprimerLigne(index);
      else if (action === 'monter') deplacerLigne(index, -1);
      else if (action === 'descendre') deplacerLigne(index, 1);
    });

    $('#btn-ajouter-ligne').addEventListener('click', () => ajouterLigne());

    // Date : le texte « 14 Septembre 2026 » ouvre le sélecteur
    el.dateTexte.addEventListener('click', () => {
      try {
        el.date.showPicker();
      } catch {
        el.date.focus();
      }
    });
    el.date.addEventListener('change', () => {
      if (!el.date.value) {
        el.date.value = magasin.doc.date;
        return;
      }
      magasin.modifier((doc) => { doc.date = el.date.value; }, 'date');
    });

    el.zoneSignature.addEventListener('click', () => ouvrirSigner());
  }

  // ===========================================================================
  // Barre d'outils
  // ===========================================================================

  /** Avant de remplacer le document courant : propose d'enregistrer. Renvoie false pour annuler. */
  async function confirmerAbandon() {
    if (!magasin.estModifie()) return true;
    const choix = await question({
      message: 'Le document en cours contient des modifications non enregistrées.',
      detail: 'Voulez-vous les enregistrer avant de continuer ?',
      boutons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
      defaut: 0,
      annuler: 2
    });
    if (choix === 0) return actionEnregistrer();
    return choix === 1;
  }

  /**
   * Numéro du prochain document d'un type : le premier entier du dernier numéro
   * créé de ce type est incrémenté (« 48 /ERZ/ FACPRO /26 » → « 49 /ERZ/ FACPRO /26 »).
   */
  async function prochainNumero(type) {
    let documents = [];
    try {
      documents = await Stockage.lister();
    } catch {
      documents = [];
    }
    const memeType = documents
      .filter((d) => d.type === type && String(d.numero || '').trim())
      .sort((a, b) => String(b.creeLe || '').localeCompare(String(a.creeLe || '')));
    if (memeType.length) return Calc.incrementerNumero(memeType[0].numero);
    const actuel = magasin.doc;
    if (actuel.type === type && actuel.numero.trim()) return Calc.incrementerNumero(actuel.numero);
    return Etat.numeroParDefaut(type);
  }

  async function actionNouveau() {
    if (!(await confirmerAbandon())) return;
    const actuel = magasin.doc;
    const doc = Etat.documentVierge();
    // On garde les réglages du document précédent (type, ville, TVA, paiement, signature)
    doc.type = actuel.type;
    doc.ville = actuel.ville || doc.ville;
    doc.tva = Etat.cloner(actuel.tva);
    doc.paiement = Etat.cloner(actuel.paiement);
    doc.afficherCachet = actuel.afficherCachet;
    doc.afficherSignature = actuel.afficherSignature;
    doc.numero = await prochainNumero(doc.type);
    magasin.remplacer(doc, true);
    notifier('Nouveau ' + (doc.type === 'devis' ? 'devis' : 'document') + ' n° ' + doc.numero);
    el.destinataire.focus();
  }

  async function actionEnregistrer() {
    try {
      const enregistre = await Stockage.enregistrer(magasin.doc);
      magasin.modifier((doc) => {
        doc.id = enregistre.id;
        doc.creeLe = enregistre.creeLe;
        doc.modifieLe = enregistre.modifieLe;
      }, 'identifiant');
      magasin.marquerEnregistre();
      await Stockage.ecrireBrouillon(magasin, true);
      const d = magasin.doc;
      reglages = await Stockage.ecrireReglages({
        ville: d.ville,
        tva: d.tva,
        paiement: d.paiement,
        afficherCachet: d.afficherCachet,
        afficherSignature: d.afficherSignature
      });
      notifier(libelleType(d.type) + ' ' + d.numero + ' enregistré' + (d.type === 'facture' ? 'e' : '') + '.', 'succes');
      return true;
    } catch (erreur) {
      notifier('Enregistrement impossible : ' + erreur.message, 'erreur');
      return false;
    }
  }

  async function actionPdf() {
    reformaterChamps();
    const doc = magasin.doc;
    try {
      const resultat = await api.exporterPdf(Calc.nomFichierPdf(doc.type, doc.numero));
      if (!resultat) return;
      if (resultat.erreur) {
        notifier(resultat.erreur, 'erreur');
        return;
      }
      notifier('PDF enregistré : ' + resultat.chemin, 'succes', {
        libelle: 'Ouvrir',
        action: () => api.ouvrirFichier(resultat.chemin)
      });
    } catch (erreur) {
      notifier('Export PDF impossible : ' + erreur.message, 'erreur');
    }
  }

  async function actionImprimer() {
    reformaterChamps();
    try {
      const r = await api.imprimer();
      if (!r.succes && r.raison && r.raison !== 'cancelled') notifier('Impression impossible : ' + r.raison, 'erreur');
    } catch (erreur) {
      notifier('Impression impossible : ' + erreur.message, 'erreur');
    }
  }

  function changerType(type) {
    if (magasin.doc.type === type) return;
    magasin.modifier((doc) => { doc.type = type; }, 'type');
  }

  function brancherBarreOutils() {
    $('#btn-nouveau').addEventListener('click', actionNouveau);
    $('#btn-ouvrir').addEventListener('click', ouvrirListe);
    $('#btn-enregistrer').addEventListener('click', actionEnregistrer);
    $('#btn-pdf').addEventListener('click', actionPdf);
    $('#btn-imprimer').addEventListener('click', actionImprimer);
    $$('.bascule-type button').forEach((b) => b.addEventListener('click', () => changerType(b.dataset.type)));
    $('#btn-tva').addEventListener('click', ouvrirTva);
    $('#btn-avance').addEventListener('click', ouvrirAvance);
    $('#btn-paiement').addEventListener('click', ouvrirPaiement);
    $('#btn-signer').addEventListener('click', ouvrirSigner);

    // Raccourcis clavier
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const touche = e.key.toLowerCase();
      const actions = { s: actionEnregistrer, n: actionNouveau, o: ouvrirListe, p: actionImprimer, e: actionPdf };
      if (!actions[touche]) return;
      e.preventDefault();
      if ($('dialog[open]') && touche !== 's') return;
      actions[touche]();
    });

    // Toutes les modales : boutons « Fermer / OK / × »
    $$('dialog.modale').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target.closest('[data-fermer]')) d.close();
      });
    });
  }

  // ===========================================================================
  // Modale « Ouvrir »
  // ===========================================================================

  let documentsListes = [];

  async function ouvrirListe() {
    try {
      documentsListes = await Stockage.lister();
    } catch (erreur) {
      notifier('Liste des documents illisible : ' + erreur.message, 'erreur');
      return;
    }
    $('#recherche-documents').value = '';
    remplirListe();
    $('#modale-ouvrir').showModal();
    $('#recherche-documents').focus();
  }

  function remplirListe() {
    const filtre = $('#recherche-documents').value.trim().toLowerCase();
    const corps = $('#liste-documents');
    const visibles = documentsListes.filter((d) => {
      if (!filtre) return true;
      return [d.numero, d.client, d.dateTexte, libelleType(d.type), Calc.formaterMontant(d.total)]
        .join(' ').toLowerCase().replace(/ /g, ' ').includes(filtre);
    });
    corps.replaceChildren(...visibles.map((d) => {
      const tr = creer('tr');
      tr.dataset.id = d.id;
      if (d.id === magasin.doc.id) tr.classList.add('courant');
      const tdType = creer('td');
      tdType.append(creer('span', 'badge ' + d.type, libelleType(d.type)));
      const tdActions = creer('td', 'actions');
      [['ouvrir', 'Ouvrir', 'principal'], ['dupliquer', 'Dupliquer', ''], ['supprimer', 'Supprimer', 'danger']]
        .forEach(([action, texte, classe]) => {
          const b = creer('button', classe, texte);
          b.type = 'button';
          b.dataset.action = action;
          tdActions.append(b);
        });
      const tdClient = creer('td', 'client', d.client || '—');
      tdClient.title = d.client || '';
      tr.append(tdType, creer('td', '', d.numero || '—'), tdClient, creer('td', '', d.dateTexte || ''),
        creer('td', 'nombre', Calc.formaterMontant(d.total) + ' Ar'), tdActions);
      return tr;
    }));
    $('#aucun-document').hidden = documentsListes.length > 0;
    $('#aucun-document').textContent = documentsListes.length
      ? 'Aucun document ne correspond à la recherche.'
      : 'Aucun document enregistré pour le moment.';
    if (documentsListes.length && !visibles.length) $('#aucun-document').hidden = false;
  }

  async function ouvrirDocument(id) {
    if (!(await confirmerAbandon())) return;
    const doc = await Stockage.lire(id);
    if (!doc) {
      notifier('Ce document est introuvable.', 'erreur');
      return;
    }
    magasin.remplacer(doc, true);
    $('#modale-ouvrir').close();
    notifier(libelleType(doc.type) + ' ' + doc.numero + ' ouvert' + (doc.type === 'facture' ? 'e' : '') + '.');
  }

  async function dupliquerDocument(id) {
    if (!(await confirmerAbandon())) return;
    const doc = await Stockage.lire(id);
    if (!doc) return;
    doc.id = null;
    doc.creeLe = null;
    doc.modifieLe = null;
    doc.date = Calc.dateIso(new Date());
    doc.numero = await prochainNumero(doc.type);
    magasin.remplacer(doc, false);
    $('#modale-ouvrir').close();
    notifier('Copie créée (n° ' + doc.numero + '). Pensez à l’enregistrer.');
  }

  async function supprimerDocument(id) {
    const d = documentsListes.find((x) => x.id === id);
    const nom = d ? libelleType(d.type) + ' ' + d.numero + (d.client ? ' — ' + d.client : '') : 'ce document';
    const choix = await question({
      type: 'warning',
      message: 'Supprimer définitivement ' + nom + ' ?',
      detail: 'Cette action est irréversible.',
      boutons: ['Supprimer', 'Annuler'],
      defaut: 1,
      annuler: 1
    });
    if (choix !== 0) return;
    await Stockage.supprimer(id);
    if (magasin.doc.id === id) {
      // Le document affiché n'existe plus sur disque : il redevient « non enregistré »
      magasin.modifier((doc) => {
        doc.id = null;
        doc.creeLe = null;
      }, 'suppression');
      magasin.remplacer(magasin.doc, false);
    }
    documentsListes = documentsListes.filter((x) => x.id !== id);
    remplirListe();
    notifier('Document supprimé.');
  }

  function brancherListe() {
    $('#recherche-documents').addEventListener('input', remplirListe);
    $('#liste-documents').addEventListener('click', (e) => {
      const bouton = e.target.closest('button[data-action]');
      if (!bouton) return;
      const id = bouton.closest('tr').dataset.id;
      const action = bouton.dataset.action;
      if (action === 'ouvrir') ouvrirDocument(id);
      else if (action === 'dupliquer') dupliquerDocument(id);
      else if (action === 'supprimer') supprimerDocument(id);
    });
    $('#liste-documents').addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr && !e.target.closest('button')) ouvrirDocument(tr.dataset.id);
    });
  }

  // ===========================================================================
  // Modale « TVA »
  // ===========================================================================

  function ouvrirTva() {
    const tva = magasin.doc.tva;
    $('#tva-active').checked = tva.active;
    $('#tva-taux').value = Calc.formaterPourcent(tva.taux);
    $('#tva-taux').disabled = !tva.active;
    $('#modale-tva').showModal();
    if (tva.active) $('#tva-taux').select();
  }

  function brancherTva() {
    $('#tva-active').addEventListener('change', (e) => {
      magasin.modifier((doc) => { doc.tva.active = e.target.checked; }, 'tva');
      $('#tva-taux').disabled = !e.target.checked;
    });
    $('#tva-taux').addEventListener('input', (e) => {
      magasin.modifier((doc) => { doc.tva.taux = Calc.borner(Calc.lireDecimal(e.target.value), 0, 100); }, 'tva');
    });
    $('#tva-taux').addEventListener('change', (e) => {
      e.target.value = Calc.formaterPourcent(magasin.doc.tva.taux);
    });
  }

  // ===========================================================================
  // Modale « Avance » : % et Ar synchronisés, bornés entre 0 et le TTC
  // ===========================================================================

  function afficherAvance(sauf) {
    const doc = magasin.doc;
    const t = Calc.calculerTotaux(doc);
    $('#avance-ttc').textContent = Calc.formaterMontant(t.ttc);
    $$('input[name="avance-mode"]').forEach((r) => { r.checked = r.value === doc.avance.mode; });
    if (sauf !== 'pourcent') $('#avance-pourcent').value = Calc.formaterPourcent(t.avancePourcent);
    if (sauf !== 'montant') $('#avance-montant').value = Calc.formaterMontant(t.avance);
  }

  function ouvrirAvance() {
    afficherAvance();
    $('#modale-avance').showModal();
    (magasin.doc.avance.mode === 'montant' ? $('#avance-montant') : $('#avance-pourcent')).select();
  }

  function brancherAvance() {
    $('#avance-pourcent').addEventListener('input', (e) => {
      magasin.modifier((doc) => {
        doc.avance.mode = 'pourcent';
        doc.avance.pourcent = Calc.lireDecimal(e.target.value);
        doc.avance.montant = Calc.calculerTotaux(doc).avance;
      }, 'avance');
      afficherAvance('pourcent');
    });
    $('#avance-montant').addEventListener('input', (e) => {
      magasin.modifier((doc) => {
        doc.avance.mode = 'montant';
        doc.avance.montant = Calc.lireEntier(e.target.value);
        doc.avance.pourcent = Calc.calculerTotaux(doc).avancePourcent;
      }, 'avance');
      afficherAvance('montant');
    });
    // En quittant un champ, la valeur bornée est réaffichée
    $('#avance-pourcent').addEventListener('change', () => afficherAvance());
    $('#avance-montant').addEventListener('change', () => afficherAvance());
    $$('input[name="avance-mode"]').forEach((r) => r.addEventListener('change', () => {
      const t = Calc.calculerTotaux(magasin.doc);
      magasin.modifier((doc) => {
        doc.avance.mode = r.value;
        doc.avance.pourcent = t.avancePourcent;
        doc.avance.montant = t.avance;
      }, 'avance');
      afficherAvance();
      (r.value === 'pourcent' ? $('#avance-pourcent') : $('#avance-montant')).focus();
    }));
    $('#avance-aucune').addEventListener('click', () => {
      magasin.modifier((doc) => { doc.avance = { mode: doc.avance.mode, pourcent: 0, montant: 0 }; }, 'avance');
      afficherAvance();
    });
  }

  // ===========================================================================
  // Modale « Paiement »
  // ===========================================================================

  function ouvrirPaiement() {
    const p = magasin.doc.paiement;
    $('#paiement-especes').checked = p.especes;
    $('#paiement-mm').checked = p.mobileMoney.actif;
    $('#paiement-mm-operateur').value = p.mobileMoney.operateur;
    $('#paiement-mm-numero').value = p.mobileMoney.numero;
    $('#paiement-virement').checked = p.virement.actif;
    $('#paiement-banque').value = p.virement.banque;
    $('#paiement-compte').value = p.virement.compte;
    activerChampsPaiement();
    $('#modale-paiement').showModal();
    $('#paiement-especes').focus();
  }

  function activerChampsPaiement() {
    const mm = $('#paiement-mm').checked;
    const vir = $('#paiement-virement').checked;
    $('#paiement-mm-operateur').disabled = !mm;
    $('#paiement-mm-numero').disabled = !mm;
    $('#paiement-banque').disabled = !vir;
    $('#paiement-compte').disabled = !vir;
  }

  function brancherPaiement() {
    const lier = (selecteur, evenement, appliquer) => {
      $(selecteur).addEventListener(evenement, (e) => {
        magasin.modifier((doc) => appliquer(doc.paiement, e.target), 'paiement');
        activerChampsPaiement();
      });
    };
    lier('#paiement-especes', 'change', (p, c) => { p.especes = c.checked; });
    lier('#paiement-mm', 'change', (p, c) => { p.mobileMoney.actif = c.checked; });
    lier('#paiement-mm-operateur', 'change', (p, c) => { p.mobileMoney.operateur = c.value; });
    lier('#paiement-mm-numero', 'input', (p, c) => { p.mobileMoney.numero = c.value; });
    lier('#paiement-virement', 'change', (p, c) => { p.virement.actif = c.checked; });
    lier('#paiement-banque', 'input', (p, c) => { p.virement.banque = c.value; });
    lier('#paiement-compte', 'input', (p, c) => { p.virement.compte = c.value; });
  }

  // ===========================================================================
  // Modale « Signer »
  // ===========================================================================

  async function ouvrirSigner() {
    const modale = $('#modale-signer');
    $('#afficher-signature').checked = magasin.doc.afficherSignature;
    $('#afficher-cachet').checked = magasin.doc.afficherCachet;
    $('#signature-couleur').value = reglages.couleurStylo || '#1B2A8F';
    $('#signature-supprimer').disabled = !signatureDataUrl;
    modale.showModal();
    padSignature.redimensionner();
    padSignature.definirCouleur($('#signature-couleur').value);
    padSignature.effacer();
    if (signatureDataUrl) {
      try {
        await padSignature.importer(signatureDataUrl, false);
      } catch {
        padSignature.effacer();
      }
    }
  }

  function brancherSigner() {
    padSignature = Signature.creerPad($('#canvas-signature'));
    window.addEventListener('resize', () => {
      if ($('#modale-signer').open) padSignature.redimensionner();
    });

    $('#signature-effacer').addEventListener('click', () => padSignature.effacer());
    $('#signature-couleur').addEventListener('change', (e) => {
      padSignature.definirCouleur(e.target.value);
      Stockage.ecrireReglages({ couleurStylo: e.target.value }).then((r) => { reglages = r; });
    });
    $('#signature-importer').addEventListener('click', () => $('#signature-fichier').click());
    $('#signature-fichier').addEventListener('change', (e) => {
      const fichier = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!fichier) return;
      const lecteur = new FileReader();
      lecteur.onload = async () => {
        try {
          await padSignature.importer(lecteur.result, $('#signature-fond-transparent').checked);
        } catch (erreur) {
          notifier('Image illisible : ' + erreur.message, 'erreur');
        }
      };
      lecteur.readAsDataURL(fichier);
    });

    $('#afficher-signature').addEventListener('change', (e) => {
      magasin.modifier((doc) => { doc.afficherSignature = e.target.checked; }, 'signature');
    });
    $('#afficher-cachet').addEventListener('change', (e) => {
      magasin.modifier((doc) => { doc.afficherCachet = e.target.checked; }, 'signature');
    });

    $('#signature-valider').addEventListener('click', async () => {
      const png = padSignature.estVide() ? null : padSignature.exporterPng();
      if (!png) {
        notifier('Dessinez ou importez une signature avant de valider.', 'erreur');
        return;
      }
      try {
        await Stockage.ecrireSignature(png);
      } catch (erreur) {
        notifier('Signature non enregistrée : ' + erreur.message, 'erreur');
        return;
      }
      signatureDataUrl = png;
      if (!magasin.doc.afficherSignature) magasin.modifier((doc) => { doc.afficherSignature = true; }, 'signature');
      else rafraichirSignature();
      $('#modale-signer').close();
      notifier('Signature enregistrée. Elle sera proposée sur les prochains documents.', 'succes');
    });

    $('#signature-supprimer').addEventListener('click', async () => {
      const choix = await question({
        type: 'warning',
        message: 'Supprimer la signature enregistrée ?',
        detail: 'Elle disparaîtra de tous les documents.',
        boutons: ['Supprimer', 'Annuler'],
        defaut: 1,
        annuler: 1
      });
      if (choix !== 0) return;
      await Stockage.supprimerSignature();
      signatureDataUrl = null;
      padSignature.effacer();
      $('#signature-supprimer').disabled = true;
      rafraichirSignature();
    });
  }

  // ===========================================================================
  // Fermeture de la fenêtre
  // ===========================================================================

  function brancherFermeture() {
    api.surDemandeFermeture(async () => {
      api.accuserFermeture();
      try {
        await Stockage.ecrireBrouillon(magasin, true);
      } catch (erreur) {
        console.error(erreur);
      }
      if (!magasin.estModifie()) {
        api.fermer();
        return;
      }
      const choix = await question({
        type: 'warning',
        message: 'Le document contient des modifications non enregistrées.',
        detail: 'Si vous quittez sans enregistrer, le brouillon sera tout de même rouvert au prochain lancement.',
        boutons: ['Enregistrer et quitter', 'Quitter sans enregistrer', 'Annuler'],
        defaut: 0,
        annuler: 2
      });
      if (choix === 0) {
        if (await actionEnregistrer()) api.fermer();
      } else if (choix === 1) {
        api.fermer();
      }
    });
  }

  // ===========================================================================
  // Démarrage
  // ===========================================================================

  magasin.abonner((_doc, raison) => {
    if (raison === 'remplacement') afficherDocument();
    else rafraichirCalculs();
  });

  async function demarrer() {
    construireElementsFixes();
    brancherPage();
    brancherBarreOutils();
    brancherListe();
    brancherTva();
    brancherAvance();
    brancherPaiement();
    brancherSigner();
    brancherFermeture();

    const infos = await api.selftest.infos();
    modeSelftest = !!infos.actif;
    reglages = await Stockage.lireReglages();

    if (modeSelftest) {
      magasin.remplacer(Etat.documentExemple(), true);
    } else {
      const brouillon = await Stockage.lireBrouillon();
      if (brouillon) {
        magasin.remplacer(brouillon.document, !brouillon.modifie);
      } else {
        // Premier lancement : document vierge avec les derniers réglages connus
        const doc = Etat.documentVierge();
        if (reglages.ville) doc.ville = reglages.ville;
        if (reglages.tva) doc.tva = reglages.tva;
        if (reglages.paiement) doc.paiement = reglages.paiement;
        magasin.remplacer(doc, true);
      }
      try {
        signatureDataUrl = await Stockage.lireSignature();
      } catch {
        signatureDataUrl = null;
      }
      rafraichirSignature();
      Stockage.demarrerBrouillonAutomatique(magasin);
    }

    if (modeSelftest) lancerAutotest();
  }

  // ===========================================================================
  // Autotest de l'interface (npm run selftest)
  // ===========================================================================

  const deuxImages = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const texte = (noeud) => (noeud ? noeud.textContent.replace(/[  ]/g, ' ').trim() : '');
  const valeurTotal = (cle) => texte($('tr[data-total="' + cle + '"] .valeur', el.blocFin));

  /** Simule une saisie au clavier dans un champ. */
  function saisir(champ, valeur) {
    champ.value = valeur;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    champ.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  async function lancerAutotest() {
    const controles = [];
    const verifier = (nom, ok, detail) => {
      controles.push({ nom, ok: !!ok, detail: ok ? '' : String(detail) });
    };
    const egal = (nom, obtenu, attendu) => verifier(nom, obtenu === attendu, 'obtenu « ' + obtenu + ' », attendu « ' + attendu + ' »');

    try {
      // Signature d'exemple pour vérifier sa position sur le cachet
      signatureDataUrl = Signature.genererExemple();
      rafraichirSignature();
      await el.imageSignature.decode().catch(() => {});
      await document.fonts.ready;
      await deuxImages();

      // --- Document d'exemple (facture du modèle)
      egal('Libellé du numéro', texte(el.libelleNumero), 'FACTURE N°:');
      egal('Numéro', el.numero.value, '48 /ERZ/ FACPRO /26');
      egal('Date', texte(el.dateTexte), '14 Septembre 2026');
      egal('Ville', el.ville.value, 'Antananarivo');
      egal('Montants des lignes', lignesDom().map((tr) => texte($('.montant', tr))).join(' | '),
        '75 000 | 60 000 | 50 000 | 50 000 | 270 000 | 480 000');
      egal('Quantités affichées', lignesDom().map((tr) => $('.quantite', tr).value).join(' | '),
        '1,00 | 1,00 | 1,00 | 1,00 | 3,00 | 5,00');
      egal('Prix unitaires affichés', lignesDom().map((tr) => $('.pu', tr).value.replace(/ /g, ' ')).join(' | '),
        '75 000 | 60 000 | 50 000 | 50 000 | 90 000 | 96 000');
      egal('MONTANT TOTAL', valeurTotal('ht'), '985 000');
      egal('Libellé TVA', texte($('tr[data-total="tva"] .libelle', el.blocFin)), 'TVA 20%');
      egal('TVA', valeurTotal('tva'), '197 000');
      egal('MONTANT TOTAL TTC', valeurTotal('ttc'), '1 182 000');
      verifier('Pas de ligne d’avance', !$('tr[data-total="avance"]', el.blocFin), 'ligne présente');
      egal('Phrase d’arrêté', texte(el.arretePhrase),
        'Arrêtée la présente facture à la somme de: UN MILLION CENT QUATRE VINGT DEUX MILLE ARIARY');
      egal('Montant arrêté en chiffres', texte(el.arreteChiffres), '(Ar 1 182 000)');
      egal('Compte bancaire imprimé', texte(el.paiements), 'NUMERO DU COMPTE BANCAIRE:BRED  00008 00016 05003027539 68');
      egal('Unités proposées', el.unites.options.length, 18);
      verifier('Dernière ligne avec les totaux', $('tr.ligne', el.blocFin) && $('tr.ligne', el.blocFin).dataset.index === '5', 'mauvais bloc');
      verifier('Signature affichée', !el.imageSignature.hidden && el.imageSignature.naturalWidth > 0, 'image absente');
      egal('Nom du PDF proposé', Calc.nomFichierPdf(magasin.doc.type, magasin.doc.numero), 'Facture-48-ERZ-FACPRO-26.pdf');

      // --- Export de l'aperçu (PDF + PNG) avant toute modification
      await api.selftest.exporter('apercu');

      // --- Devis / Facture
      $('.bascule-type button[data-type="devis"]').click();
      egal('Libellé devis', texte(el.libelleNumero), 'DEVIS N°:');
      egal('Phrase d’arrêté du devis', texte(el.arretePhrase),
        'Arrêté le présent devis à la somme de: UN MILLION CENT QUATRE VINGT DEUX MILLE ARIARY');
      $('.bascule-type button[data-type="facture"]').click();
      egal('Retour à la facture', texte(el.libelleNumero), 'FACTURE N°:');

      // --- TVA désactivée : seul MONTANT TOTAL
      ouvrirTva();
      $('#tva-active').click();
      egal('Sans TVA : une seule ligne de total', $$('tr.total', el.blocFin).length, 1);
      egal('Sans TVA : montant arrêté', texte(el.arreteChiffres), '(Ar 985 000)');
      egal('Sans TVA : en lettres', texte(el.arretePhrase),
        'Arrêtée la présente facture à la somme de: NEUF CENT QUATRE VINGT CINQ MILLE ARIARY');
      $('#tva-active').click();
      saisir($('#tva-taux'), '10');
      egal('TVA 10 %', valeurTotal('tva'), '98 500');
      saisir($('#tva-taux'), '20');
      $('#modale-tva').close();
      egal('TVA rétablie', valeurTotal('ttc'), '1 182 000');

      // --- Avance : % → Ar, Ar → %, bornes
      ouvrirAvance();
      saisir($('#avance-pourcent'), '30');
      egal('Avance 30 % → montant', $('#avance-montant').value.replace(/ /g, ' '), '354 600');
      egal('Ligne Avance', texte($('tr[data-total="avance"] .libelle', el.blocFin)), 'Avance (30 %)');
      egal('Montant de l’avance', valeurTotal('avance'), '354 600');
      egal('Reste à payer', valeurTotal('reste'), '827 400');
      saisir($('#avance-montant'), '591000');
      egal('Avance 591 000 Ar → %', $('#avance-pourcent').value, '50');
      egal('Reste à payer (50 %)', valeurTotal('reste'), '591 000');
      saisir($('#avance-montant'), '99 999 999');
      egal('Avance bornée au TTC', $('#avance-montant').value.replace(/ /g, ' '), '1 182 000');
      egal('Avance bornée : 100 %', $('#avance-pourcent').value, '100');
      saisir($('#avance-pourcent'), '0');
      verifier('Avance nulle : lignes retirées', !$('tr[data-total="avance"]', el.blocFin) && !$('tr[data-total="reste"]', el.blocFin), 'lignes encore présentes');
      $('#modale-avance').close();

      // --- Paiement : Mobile Money + espèces imprimés, virement retiré
      ouvrirPaiement();
      $('#paiement-especes').click();
      $('#paiement-mm').click();
      saisir($('#paiement-mm-numero'), '034 13 432 23');
      $('#paiement-virement').click();
      egal('Paiements imprimés', texte(el.paiements), 'PAIEMENT:EN ESPECESMOBILE MONEY:MVOLA  034 13 432 23');
      $('#paiement-especes').click();
      $('#paiement-mm').click();
      $('#paiement-virement').click();
      $('#modale-paiement').close();

      // --- Lignes : ajout, saisie, calcul, suppression
      $('#btn-ajouter-ligne').click();
      egal('Ligne ajoutée', lignesDom().length, 7);
      const nouvelle = lignesDom()[6];
      saisir($('.designation', nouvelle), 'Main d’oeuvre\nsur deux lignes');
      saisir($('.unite', nouvelle), 'Forfait');
      saisir($('.quantite', nouvelle), '2,5');
      saisir($('.pu', nouvelle), '1000');
      egal('Quantité reformatée', $('.quantite', nouvelle).value, '2,50');
      egal('Prix reformaté', $('.pu', nouvelle).value.replace(/ /g, ' '), '1 000');
      egal('Montant 2,5 × 1 000', texte($('.montant', nouvelle)), '2 500');
      egal('HT avec la nouvelle ligne', valeurTotal('ht'), '987 500');
      saisir($('.quantite', nouvelle), 'abc');
      egal('Saisie invalide = 0', texte($('.montant', nouvelle)), '0');
      $('button[data-action="supprimer"]', nouvelle).click();
      egal('Ligne supprimée', lignesDom().length, 6);
      egal('HT après suppression', valeurTotal('ht'), '985 000');

      // --- Numérotation et enregistrement
      egal('Numéro suivant', await prochainNumero('facture'), '49 /ERZ/ FACPRO /26');
      const enregistre = await actionEnregistrer();
      verifier('Enregistrement', enregistre && magasin.doc.id && !magasin.estModifie(), 'échec');
      const liste = await Stockage.lister();
      egal('Liste des documents', liste.length, 1);
      egal('Total dans la liste', liste[0] && liste[0].total, 1182000);
      egal('Client dans la liste', liste[0] && liste[0].client, 'VIVO ENERGIE Madagascar');
      const relu = await Stockage.lire(magasin.doc.id);
      egal('Relecture du document', relu && Etat.empreinte(relu), Etat.empreinte(magasin.doc));
      egal('Numéro suivant après enregistrement', await prochainNumero('facture'), '49 /ERZ/ FACPRO /26');

      // --- Document long : saut de page, en-tête répété, totaux avec la dernière ligne
      magasin.modifier((doc) => {
        for (let i = 0; i < 38; i++) {
          doc.lignes.push({
            designation: i % 4 === 0 ? 'Ligne de test ' + (i + 7) + '\nsur deux lignes pour vérifier les sauts de page' : 'Ligne de test ' + (i + 7),
            unite: 'U/te',
            quantite: 1,
            prixUnitaire: 1000
          });
        }
      }, 'structure');
      afficherLignes();
      await deuxImages();
      const multi = await api.selftest.exporter('apercu-multipage');
      verifier('Document long sur plusieurs pages', multi && multi.pages >= 2, 'pages : ' + (multi && multi.pages));
    } catch (erreur) {
      verifier('Exception pendant l’autotest', false, erreur && erreur.stack ? erreur.stack : erreur);
    }

    await api.selftest.terminer({ succes: controles.every((c) => c.ok), controles });
  }

  demarrer().catch((erreur) => {
    console.error(erreur);
    notifier('Erreur au démarrage : ' + erreur.message, 'erreur');
    if (modeSelftest) api.selftest.terminer({ succes: false, controles: [{ nom: 'Démarrage', ok: false, detail: erreur.stack }] });
  });
})();
