/**
 * Efekty wychodzące POZA planszę: promienie linii przez całą stronę, odłamki
 * wylatujące z ramki, fale, kurz pod studnią, poświata tła i „+punkty”
 * lecące do licznika. Elementy DOM tworzymy ręcznie i usuwamy po animacji.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// gwiazdka-iskra (4 ramiona) i klasyczna gwiazda (5 ramion)
const SPARKLE = 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z';
const STAR = 'M12 1l3.1 7.2 7.9.7-6 5.2 1.8 7.7L12 17.8 5.2 21.8 7 14.1 1 8.9l7.9-.7Z';

/** Kierunek „na zewnątrz” i punkt startu dla danego boku ramki (w % warstwy). */
function edgePoint(side, along) {
  switch (side) {
    case 'left': return { x: 0, y: along, nx: -1, ny: 0 };
    case 'right': return { x: 100, y: along, nx: 1, ny: 0 };
    case 'top': return { x: along, y: 0, nx: 0, ny: -1 };
    default: return { x: along, y: 100, nx: 0, ny: 1 };
  }
}

// Twardy limit jednocześnie animowanych elementów — przy burzy efektów słabszy
// komputer czy telefon nie zgubi klatek (nadmiarowe efekty po prostu się nie pojawią).
const MAX_LIVE = 140;
let live = 0;

function track(el, anim) {
  live += 1;
  const done = () => { live -= 1; el.remove(); };
  anim.finished.then(done, done);
}

function spawn(parent, style, keyframes, options, { essential = false } = {}) {
  if (!essential && live >= MAX_LIVE) return null;
  const el = document.createElement('span');
  Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', ...style });
  parent.appendChild(el);
  track(el, el.animate(keyframes, { fill: 'both', ...options }));
  return el;
}

/** SVG gwiazdki z „poświatą” narysowaną w środku (tańsze niż filtr CSS). */
const starSvg = (path, color) =>
  `<svg viewBox="-6 -6 36 36" width="100%" height="100%"><path d="${path}" fill="${color}" opacity="0.28" transform="translate(12 12) scale(1.45) translate(-12 -12)"/><path d="${path}" fill="${color}"/></svg>`;

export function createOuterFx(layer, ambient) {
  /** Jedna gwiazdka wylatująca z punktu (x%, y%) w kierunku (nx, ny). */
  function star({ x, y, nx, ny, color, power = 1, size, delay = 0, slow = false }) {
    const s = size ?? rand(9, 18) * (0.8 + power * 0.2);
    const angle = Math.atan2(ny, nx) + rand(-0.75, 0.75);
    const dist = (slow ? rand(30, 70) : rand(60, 200)) * (0.7 + power * 0.3);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const fall = slow ? -rand(10, 30) : rand(20, 70); // lekki łuk w dół; wolne iskry unoszą się
    const spin = rand(-360, 360);
    const el = spawn(layer, {
      left: `${x}%`,
      top: `${y}%`,
      width: `${s}px`,
      height: `${s}px`,
      marginLeft: `${-s / 2}px`,
      marginTop: `${-s / 2}px`,
      zIndex: 2,
    }, [
      { transform: 'translate(0, 0) rotate(0deg) scale(0)', opacity: 0 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) rotate(${spin * 0.3}deg) scale(1.25)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.6 + fall * 0.3}px) rotate(${spin * 0.6}deg) scale(0.8)`, opacity: 0.55, offset: 0.45 },
      { transform: `translate(${dx * 0.8}px, ${dy * 0.8 + fall * 0.6}px) rotate(${spin * 0.8}deg) scale(1)`, opacity: 1, offset: 0.65 },
      { transform: `translate(${dx}px, ${dy + fall}px) rotate(${spin}deg) scale(0.2)`, opacity: 0 },
    ], { duration: slow ? rand(1600, 2600) : rand(750, 1300), delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    if (el) el.innerHTML = starSvg(Math.random() < 0.7 ? SPARKLE : STAR, color);
  }

  /** Element przypięty do całego okna (efekty „na cały ekran”). */
  function spawnFixed(style, keyframes, options, html, { essential = false } = {}) {
    if (!essential && live >= MAX_LIVE) return null;
    const el = document.createElement('span');
    Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: 35, ...style });
    if (html) el.innerHTML = html;
    document.body.appendChild(el);
    track(el, el.animate(keyframes, { fill: 'both', ...options }));
    return el;
  }

  return {
    /** Krótki błysk całego ekranu. */
    screenFlash(color, strength = 1) {
      spawnFixed({ inset: '0', background: `radial-gradient(circle at 50% 55%, ${color}, transparent 75%)` }, [
        { opacity: 0 },
        { opacity: Math.min(0.32, 0.1 + strength * 0.04), offset: 0.12 },
        { opacity: 0 },
      ], { duration: 380 + strength * 90, easing: 'ease-out' }, null, { essential: true });
    },

    /** Wstęga z napisem przelatująca przez cały ekran na wysokości linii. */
    banner(text, color, yPct, strength = 1) {
      const lr = layer.getBoundingClientRect();
      const y = lr.top + (lr.height * yPct) / 100;
      const size = 2.2 + strength * 0.6;
      spawnFixed({
        left: '0',
        top: `${y}px`,
        width: '100vw',
        height: `${size * 1.9}rem`,
        marginTop: `${-size * 0.95}rem`,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${color} 28%, transparent) 20%, color-mix(in srgb, ${color} 28%, transparent) 80%, transparent)`,
        borderTop: `1px solid color-mix(in srgb, ${color} 60%, transparent)`,
        borderBottom: `1px solid color-mix(in srgb, ${color} 60%, transparent)`,
        zIndex: 6,
      }, [
        { transform: 'skewY(-4deg) scaleY(0)', opacity: 0 },
        { transform: 'skewY(-4deg) scaleY(1.15)', opacity: 1, offset: 0.12 },
        { transform: 'skewY(-4deg) scaleY(1)', opacity: 1, offset: 0.7 },
        { transform: 'skewY(-4deg) scaleY(0)', opacity: 0 },
      ], { duration: 900 + strength * 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      `<span style="font: italic 700 ${size}rem var(--serif); color: ${color}; letter-spacing: 0.04em; white-space: nowrap; text-shadow: 0 2px 0 rgba(0,0,0,0.3); display:block; will-change: transform;">${text} · ${text} · ${text}</span>`,
      { essential: true })
        .firstChild.animate(
          [{ transform: 'translateX(-35%)' }, { transform: 'translateX(35%)' }],
          { duration: 900 + strength * 120, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        );
    },

    /** Gwiazdki spadające z góry na całą stronę. */
    starRain(colors, count = 30) {
      for (let i = 0; i < count; i++) {
        const size = rand(10, 22);
        const color = pick(colors);
        const drift = rand(-120, 120);
        const el = spawnFixed({
          left: `${rand(0, 100)}vw`,
          top: `${-size}px`,
          width: `${size}px`,
          height: `${size}px`,
        }, [
          { transform: 'translate(0, 0) rotate(0deg) scale(0.6)', opacity: 0 },
          { transform: `translate(${drift * 0.2}px, 15vh) rotate(120deg) scale(1.1)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${drift}px, 105vh) rotate(${rand(360, 900)}deg) scale(0.8)`, opacity: 0.2 },
        ], { duration: rand(1400, 2400), delay: rand(0, 500), easing: 'cubic-bezier(0.35, 0, 0.65, 1)' },
        starSvg(Math.random() < 0.6 ? SPARKLE : STAR, color));
        if (el) el.style.zIndex = 34;
      }
    },

    /** Wiązka gwiazdek z jednego boku ramki (along = pozycja wzdłuż boku w %). */
    edgeStars(side, along, colors, count = 8, power = 1) {
      for (let i = 0; i < count; i++) {
        const p = edgePoint(side, along + rand(-4, 4));
        star({ ...p, color: pick(colors), power, delay: rand(0, 90) });
      }
    },

    /** Gwiazdki wylatujące z całego obwodu ramki. */
    perimeterStars(colors, count = 20, power = 1) {
      const sides = ['left', 'right', 'top', 'bottom', 'left', 'right']; // boki są dłuższe
      for (let i = 0; i < count; i++) {
        const p = edgePoint(pick(sides), rand(2, 98));
        star({ ...p, color: pick(colors), power, delay: rand(0, 220) });
      }
    },

    /** Pojedyncza, spokojna iskierka unosząca się wokół planszy (tło w trakcie gry). */
    idleSparkle(colors) {
      const p = edgePoint(pick(['left', 'right', 'left', 'right', 'top']), rand(5, 95));
      star({ ...p, color: pick(colors), power: 0.5, size: rand(5, 9), slow: true });
    },

    /** Rozbłysk obwódki wokół całej ramki. */
    frameGlow(color, strength = 1) {
      spawn(layer, {
        left: '-12px',
        top: '-12px',
        right: '-12px',
        bottom: '-12px',
        borderRadius: '28px',
        boxShadow: `0 0 0 ${Math.min(4, 1 + strength)}px ${color}, 0 0 ${Math.min(28, 14 + strength * 3)}px ${color}`,
        zIndex: 1,
      }, [
        { transform: 'scale(0.985)', opacity: 0 },
        { transform: 'scale(1.01)', opacity: Math.min(1, 0.45 + strength * 0.2), offset: 0.2 },
        { transform: 'scale(1.03)', opacity: 0 },
      ], { duration: 500 + Math.min(strength, 6) * 120, easing: 'ease-out' }, { essential: true });
    },

    /** Poziomy promień światła przez całą szerokość ekranu na wysokości linii (z echem). */
    beam(yPct, color, strength = 1) {
      this.beamOnce(yPct, color, strength);
      setTimeout(() => this.beamOnce(yPct, '#ffffff', Math.max(0.5, strength * 0.4)), 90);
    },

    beamOnce(yPct, color, strength = 1) {
      // poświata z gradientu (bez box-shadow) — tania w rysowaniu nawet bez GPU
      const h = Math.round(14 + strength * 6);
      spawn(layer, {
        left: '50%',
        top: `${yPct}%`,
        width: '130vw',
        height: `${h}px`,
        marginLeft: '-65vw',
        marginTop: `${-h / 2}px`,
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, #fff 0%, ${color} 18%, transparent 60%)`,
      }, [
        { transform: 'scaleX(0.05) scaleY(0.6)', opacity: 0 },
        { transform: 'scaleX(0.6) scaleY(1)', opacity: 1, offset: 0.25 },
        { transform: 'scaleX(1) scaleY(0.3)', opacity: 0 },
      ], { duration: 520 + strength * 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, { essential: true });
    },

    /** Odłamki klocków wylatujące z boków ramki na zewnątrz. */
    shards(yPct, colors, count = 10) {
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1;
        const size = rand(6, 13);
        const dx = side * rand(70, 260);
        const dy = rand(-120, 30);
        const spin = rand(-540, 540);
        spawn(layer, {
          left: side < 0 ? '0' : '100%',
          top: `${yPct}%`,
          width: `${size}px`,
          height: `${size}px`,
          marginLeft: `${-size / 2}px`,
          marginTop: `${-size / 2}px`,
          borderRadius: '3px',
          background: colors[i % colors.length],
        }, [
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy + 160}px) rotate(${spin}deg) scale(0.6)`, opacity: 0 },
        ], { duration: rand(700, 1100), easing: 'cubic-bezier(0.25, 0.6, 0.4, 1)', delay: rand(0, 60) });
      }
    },

    /** Fala rozchodząca się z punktu planszy daleko poza ramkę. */
    ring(xPct, yPct, color, size = 420) {
      size = Math.min(size, 1100);
      spawn(layer, {
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `${-size / 2}px`,
        marginTop: `${-size / 2}px`,
        borderRadius: '50%',
        border: `2px solid ${color}`,
      }, [
        { transform: 'scale(0.05)', opacity: 0.9 },
        { transform: 'scale(1)', opacity: 0 },
      ], { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    },

    /** Kurz i błysk pod studnią, gdy klocek uderzy w dno lub w stos. */
    impact(xPct, color, strength = 1) {
      spawn(layer, {
        left: `${xPct}%`,
        top: '100%',
        width: `${60 + strength * 50}px`,
        height: '4px',
        marginLeft: `${-(60 + strength * 50) / 2}px`,
        marginTop: '6px',
        borderRadius: '99px',
        background: color,
        boxShadow: `0 0 18px ${color}`,
      }, [
        { transform: 'scaleX(0.2)', opacity: 0.9 },
        { transform: 'scaleX(1.4)', opacity: 0 },
      ], { duration: 380, easing: 'ease-out' });

      const puffs = Math.round(4 + strength * 4);
      for (let i = 0; i < puffs; i++) {
        const size = rand(6, 14) * (0.8 + strength * 0.2);
        const dx = (i % 2 ? 1 : -1) * rand(20, 70 + strength * 40);
        spawn(layer, {
          left: `${xPct}%`,
          top: '100%',
          width: `${size}px`,
          height: `${size}px`,
          marginLeft: `${-size / 2}px`,
          marginTop: '2px',
          borderRadius: '50%',
          background: 'var(--text-3)',
        }, [
          { transform: 'translate(0, 0) scale(0.4)', opacity: 0.6 },
          { transform: `translate(${dx}px, ${rand(6, 22)}px) scale(1.4)`, opacity: 0 },
        ], { duration: rand(450, 700), easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
    },

    /** Poświata całego tła strony w kolorze zdarzenia. */
    glow(color, strength = 1) {
      if (!ambient) return;
      ambient.style.setProperty('--fx-color', color);
      ambient.animate(
        [{ opacity: 0 }, { opacity: Math.min(0.9, 0.35 + strength * 0.15), offset: 0.15 }, { opacity: 0 }],
        { duration: 600 + strength * 150, easing: 'ease-out' },
      );
    },

    /** „+punkty” lecące z planszy do wskazanego elementu (np. licznika linii). */
    flyTo(fromXPct, fromYPct, target, text, color) {
      if (!target) return;
      const lr = layer.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const startX = lr.left + (lr.width * fromXPct) / 100;
      const startY = lr.top + (lr.height * fromYPct) / 100;
      const dx = tr.left + tr.width / 2 - startX;
      const dy = tr.top + tr.height / 2 - startY;
      const el = document.createElement('span');
      el.textContent = text;
      Object.assign(el.style, {
        position: 'fixed',
        left: `${startX}px`,
        top: `${startY}px`,
        zIndex: 40,
        pointerEvents: 'none',
        padding: '2px 9px',
        borderRadius: '99px',
        background: color,
        color: 'var(--bg)',
        font: '700 0.8rem var(--font)',
        translate: '-50% -50%',
        boxShadow: `0 0 16px ${color}`,
      });
      document.body.appendChild(el);
      const anim = el.animate([
        { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
        { transform: 'translate(0, -24px) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.9, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0 },
      ], { duration: 900, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' });
      return anim.finished.then(() => el.remove(), () => el.remove());
    },
  };
}
