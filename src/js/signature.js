/*
 * signature.js — zone de dessin de la signature (canvas) et import d'image.
 *
 *  - dessin à la souris, au doigt ou au stylet (Pointer Events, pression du stylet prise en compte) ;
 *  - traits lissés (courbes quadratiques) ;
 *  - import d'une image (signature scannée ou cachet), avec option « fond blanc → transparent » ;
 *  - export en PNG transparent, recadré au plus près du tracé.
 *
 * Objet global : `Signature`.
 */
(function (racine) {
  'use strict';

  const MARGE_EXPORT = 6; // pixels de marge autour du tracé exporté

  /** Lisse un trait en passant par les milieux des segments. */
  function milieu(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 };
  }

  /** Épaisseur du trait (en px CSS) selon la pression (0,5 pour la souris et le doigt). */
  function epaisseur(pression) {
    return 1.1 + pression * 2.8;
  }

  /**
   * Rend transparent le fond blanc d'une image (utile pour une signature scannée).
   * Les pixels presque blancs deviennent transparents, avec un fondu pour les bords.
   */
  function fondBlancTransparent(ctx, largeur, hauteur) {
    const image = ctx.getImageData(0, 0, largeur, hauteur);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (lum >= 235) px[i + 3] = 0;
      else if (lum > 195) px[i + 3] = Math.round(px[i + 3] * (235 - lum) / 40);
    }
    ctx.putImageData(image, 0, 0);
  }

  /** Recadre un canvas sur ses pixels non transparents ; renvoie null s'il est vide. */
  function recadrer(source) {
    const ctx = source.getContext('2d');
    const { width, height } = source;
    const donnees = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (donnees[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    minX = Math.max(0, minX - MARGE_EXPORT);
    minY = Math.max(0, minY - MARGE_EXPORT);
    maxX = Math.min(width - 1, maxX + MARGE_EXPORT);
    maxY = Math.min(height - 1, maxY + MARGE_EXPORT);
    const sortie = document.createElement('canvas');
    sortie.width = maxX - minX + 1;
    sortie.height = maxY - minY + 1;
    sortie.getContext('2d').drawImage(source, minX, minY, sortie.width, sortie.height, 0, 0, sortie.width, sortie.height);
    return sortie;
  }

  /** Charge une image à partir d'une URL (data: ou blob:). */
  function chargerImage(url) {
    return new Promise((resoudre, rejeter) => {
      const img = new Image();
      img.onload = () => resoudre(img);
      img.onerror = () => rejeter(new Error("Image illisible"));
      img.src = url;
    });
  }

  /**
   * Crée la zone de dessin sur un <canvas>.
   * @returns objet de pilotage (effacer, importer, exporter…)
   */
  function creerPad(canvas) {
    const ctx = canvas.getContext('2d');
    let traits = [];          // [{ couleur, points: [{x, y, p}] }]
    let enCours = null;
    let fond = null;          // image importée (canvas), dessinée sous les traits
    let couleur = '#1B2A8F';
    let ratio = 2;

    function preparerContexte() {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    /** Adapte la résolution interne du canvas à sa taille affichée (net à l'impression). */
    function redimensionner() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      ratio = Math.max(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * ratio);
      canvas.height = Math.round(r.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      preparerContexte();
      redessiner();
    }

    function largeurCss() { return canvas.width / ratio; }
    function hauteurCss() { return canvas.height / ratio; }

    function point(e) {
      const r = canvas.getBoundingClientRect();
      const pression = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      return { x: e.clientX - r.left, y: e.clientY - r.top, p: pression };
    }

    function pastille(c, p, rayon) {
      ctx.beginPath();
      ctx.fillStyle = c;
      ctx.arc(p.x, p.y, rayon, 0, Math.PI * 2);
      ctx.fill();
    }

    function ligne(c, a, b, largeur) {
      ctx.beginPath();
      ctx.strokeStyle = c;
      ctx.lineWidth = largeur;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /** Dessine le morceau de courbe centré sur p1 (entre les milieux de p0-p1 et p1-p2). */
    function morceau(c, p0, p1, p2) {
      const m1 = milieu(p0, p1);
      const m2 = milieu(p1, p2);
      ctx.beginPath();
      ctx.strokeStyle = c;
      ctx.lineWidth = epaisseur((p0.p + p1.p + p2.p) / 3);
      ctx.moveTo(m1.x, m1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
      ctx.stroke();
    }

    function dessinerTrait(t) {
      const pts = t.points;
      if (pts.length === 1) {
        pastille(t.couleur, pts[0], epaisseur(pts[0].p) / 2);
        return;
      }
      ligne(t.couleur, pts[0], milieu(pts[0], pts[1]), epaisseur(pts[0].p));
      for (let i = 1; i < pts.length - 1; i++) morceau(t.couleur, pts[i - 1], pts[i], pts[i + 1]);
      const n = pts.length;
      ligne(t.couleur, milieu(pts[n - 2], pts[n - 1]), pts[n - 1], epaisseur(pts[n - 1].p));
    }

    function dessinerFond() {
      if (!fond) return;
      // Image importée centrée et réduite pour tenir dans le cadre (marge de 5 %)
      const lc = largeurCss();
      const hc = hauteurCss();
      const echelle = Math.min((lc * 0.9) / fond.width, (hc * 0.9) / fond.height, 1 / ratio * 4);
      const l = fond.width * echelle;
      const h = fond.height * echelle;
      ctx.drawImage(fond, (lc - l) / 2, (hc - h) / 2, l, h);
    }

    function redessiner() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      dessinerFond();
      traits.forEach(dessinerTrait);
    }

    // --- Saisie au pointeur (souris, doigt, stylet)
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      enCours = { couleur, points: [point(e)] };
      traits.push(enCours);
      pastille(couleur, enCours.points[0], epaisseur(enCours.points[0].p) / 2);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!enCours) return;
      const evenements = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const ev of (evenements.length ? evenements : [e])) {
        const pts = enCours.points;
        const p = point(ev);
        const dernier = pts[pts.length - 1];
        if (Math.hypot(p.x - dernier.x, p.y - dernier.y) < 0.8) continue;
        pts.push(p);
        const n = pts.length;
        if (n === 2) ligne(couleur, pts[0], milieu(pts[0], pts[1]), epaisseur(pts[0].p));
        else morceau(couleur, pts[n - 3], pts[n - 2], pts[n - 1]);
      }
    });

    const finir = () => {
      if (!enCours) return;
      const pts = enCours.points;
      const n = pts.length;
      if (n > 1) ligne(enCours.couleur, milieu(pts[n - 2], pts[n - 1]), pts[n - 1], epaisseur(pts[n - 1].p));
      enCours = null;
    };
    canvas.addEventListener('pointerup', finir);
    canvas.addEventListener('pointercancel', finir);
    canvas.addEventListener('lostpointercapture', finir);

    return {
      redimensionner,

      effacer() {
        traits = [];
        enCours = null;
        fond = null;
        redessiner();
      },

      definirCouleur(c) {
        couleur = c;
      },

      estVide() {
        return !fond && traits.length === 0;
      },

      /**
       * Place une image (data URL) dans le cadre : signature existante ou image importée.
       * @param {string} url
       * @param {boolean} rendreTransparent supprime le fond blanc
       */
      async importer(url, rendreTransparent) {
        const img = await chargerImage(url);
        // Image ramenée à 1600 px maximum pour rester légère
        const reduction = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * reduction));
        c.height = Math.max(1, Math.round(img.height * reduction));
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, c.width, c.height);
        if (rendreTransparent) fondBlancTransparent(cx, c.width, c.height);
        fond = c;
        traits = [];
        redessiner();
      },

      /** Exporte la signature en PNG transparent recadré (data URL), ou null si vide. */
      exporterPng() {
        const recadre = recadrer(canvas);
        return recadre ? recadre.toDataURL('image/png') : null;
      }
    };
  }

  /**
   * Signature d'exemple (utilisée par l'autotest pour vérifier la position
   * de la signature sur le cachet). Renvoie une data URL PNG transparente.
   */
  function genererExemple() {
    const c = document.createElement('canvas');
    c.width = 700;
    c.height = 360;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#1B2A8F';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(60, 250);
    ctx.bezierCurveTo(90, 60, 170, 40, 180, 120);
    ctx.bezierCurveTo(190, 200, 120, 300, 150, 300);
    ctx.bezierCurveTo(200, 300, 230, 90, 280, 80);
    ctx.bezierCurveTo(330, 70, 300, 220, 260, 240);
    ctx.bezierCurveTo(220, 260, 380, 150, 420, 170);
    ctx.bezierCurveTo(470, 190, 400, 280, 450, 270);
    ctx.bezierCurveTo(520, 250, 560, 140, 640, 110);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(80, 320);
    ctx.bezierCurveTo(250, 280, 450, 250, 660, 200);
    ctx.stroke();
    return recadrer(c).toDataURL('image/png');
  }

  racine.Signature = { creerPad, genererExemple, chargerImage };
})(window);
