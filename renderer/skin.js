// Draws the player's skin (front or back, with an optional cape) and the pixel-art home background.
(function () {
  'use strict';
  const V = window.V;

  V.loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });

  V.player = { skin: null, slim: false, name: '', uuid: '' };

  V.refreshPlayer = async () => {
    const acc = V.state.active;
    if (!acc) { V.player = { skin: null, slim: false, name: '', uuid: '' }; V.emit('player'); return; }
    V.player = { skin: null, slim: false, name: acc.name, uuid: acc.uuid };
    V.emit('player');
    try {
      const s = await V.call('accounts:skin', acc.uuid);
      if (s && V.player.uuid === acc.uuid) {
        const img = await V.loadImage(s.dataUrl);
        V.player = { ...V.player, skin: img, slim: s.slim };
      }
    } catch { /* offline and nothing cached: the generic figure stays */ }
    V.emit('player');
  };

  // ---------- colour helpers ----------
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (hex, amt) => {
    const [r, g, b] = rgb(hex);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
  };
  const hueOf = (hex) => {
    const [r, g, b] = rgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (!d) return 220;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60);
    return h < 0 ? h + 360 : h;
  };
  const accent = () => {
    const a = (V.state.settings && V.state.settings.accent) || '#3d7bff';
    return /^#[0-9a-f]{6}$/i.test(a) ? a : '#3d7bff';
  };

  // ---------- player ----------
  function generic(ctx, s, back) {
    const a = accent();
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, w * s, h * s); };
    R(4, 0, 8, 8, shade(a, -0.2));
    R(4, 8, 8, 12, a);
    R(0, 8, 4, 12, shade(a, 0.2));
    R(12, 8, 4, 12, shade(a, 0.2));
    R(4, 20, 4, 12, shade(a, -0.5));
    R(8, 20, 4, 12, shade(a, -0.5));
    if (!back) { R(5, 3, 2, 1, '#fff'); R(9, 3, 2, 1, '#fff'); R(6, 3, 1, 1, '#0a1530'); R(10, 3, 1, 1, '#0a1530'); }
  }

  // o: { skin, slim, back, cape, capeUnit, scale }
  V.drawPlayer = (canvas, o) => {
    const s = o.scale || 8;
    canvas.width = 16 * s;
    canvas.height = 32 * s;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!o.skin) { generic(ctx, s, o.back); } else {
      const img = o.skin;
      const k = img.width / 64;
      const old = img.height * 2 === img.width; // 64x32 skins have no separate left arm/leg or overlays
      const aw = o.slim ? 3 : 4;
      const part = (src, w, h, dx, dy, flip) => {
        ctx.save();
        if (flip) {
          ctx.translate((dx + w) * s, dy * s);
          ctx.scale(-1, 1);
          ctx.drawImage(img, src[0] * k, src[1] * k, w * k, h * k, 0, 0, w * s, h * s);
        } else {
          ctx.drawImage(img, src[0] * k, src[1] * k, w * k, h * k, dx * s, dy * s, w * s, h * s);
        }
        ctx.restore();
      };
      const F = { head: [8, 8], hat: [40, 8], body: [20, 20], jacket: [20, 36], rArm: [44, 20], rSleeve: [44, 36], lArm: [36, 52], lSleeve: [52, 52], rLeg: [4, 20], rPants: [4, 36], lLeg: [20, 52], lPants: [4, 52] };
      const B = { head: [24, 8], hat: [56, 8], body: [32, 20], jacket: [32, 36], rArm: [aw === 4 ? 52 : 51, 20], rSleeve: [aw === 4 ? 52 : 51, 36], lArm: [aw === 4 ? 44 : 43, 52], lSleeve: [aw === 4 ? 60 : 59, 52], rLeg: [12, 20], rPants: [12, 36], lLeg: [28, 52], lPants: [12, 52] };
      const S = o.back ? B : F;
      // limb(side): which player side, drawn at viewer-left (vx) position
      const limb = (side, dx, dy, w, h, kind) => {
        const main = S[side + (kind === 'arm' ? 'Arm' : 'Leg')];
        const over = S[side + (kind === 'arm' ? 'Sleeve' : 'Pants')];
        if (side === 'l' && old) { part(S[kind === 'arm' ? 'rArm' : 'rLeg'], w, h, dx, dy, true); return; }
        part(main, w, h, dx, dy, false);
        if (!old) part(over, w, h, dx, dy, false);
      };
      const leftSide = o.back ? 'l' : 'r'; // the side shown on the viewer's left
      const rightSide = o.back ? 'r' : 'l';
      limb(leftSide, 4, 20, 4, 12, 'leg');
      limb(rightSide, 8, 20, 4, 12, 'leg');
      part(S.body, 8, 12, 4, 8, false);
      if (!old) part(S.jacket, 8, 12, 4, 8, false);
      limb(leftSide, 4 - aw, 8, aw, 12, 'arm');
      limb(rightSide, 12, 8, aw, 12, 'arm');
      part(S.head, 8, 8, 4, 0, false);
      part(S.hat, 8, 8, 4, 0, false);
    }
    if (o.back && o.cape) {
      const u = o.capeUnit || o.cape.width / 64;
      ctx.drawImage(o.cape, 1 * u, 1 * u, 10 * u, 16 * u, 3 * s, 8 * s, 10 * s, 16 * s);
    }
  };

  V.drawHead = (canvas, skin, size) => {
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    if (!skin) { ctx.fillStyle = shade(accent(), -0.2); ctx.fillRect(0, 0, size, size); return; }
    const k = skin.width / 64;
    ctx.drawImage(skin, 8 * k, 8 * k, 8 * k, 8 * k, 0, 0, size, size);
    ctx.drawImage(skin, 40 * k, 8 * k, 8 * k, 8 * k, 0, 0, size, size);
  };

  // How big one "cape unit" is for each accepted cape layout.
  V.capeUnit = (img) => {
    const w = img.width;
    const h = img.height;
    if (w * 17 === h * 22) return w / 22;
    if (w * 22 === h * 46) return w / 46;
    return w / 64;
  };

  // ---------- pixel-art landscape for the home screen ----------
  function rng(seed) {
    let a = seed;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // pal (optional, from the theme): { sky:[top,mid,horizon], hills:[back,mid,front], grass:[...3], trunk, leaves:[...], tree:'round'|'pine', snow, moon, moonShade }
  // Without pal the colours follow the accent hue (the original look).
  V.drawLandscape = (canvas, pal) => {
    const box = canvas.parentElement;
    const w = (canvas.width = box === document.body ? window.innerWidth : box.clientWidth);
    const h = (canvas.height = box === document.body ? window.innerHeight : box.clientHeight);
    if (!w || !h) return;
    const ctx = canvas.getContext('2d');
    const hue = hueOf(accent());
    const P = pal || {
      sky: [`hsl(${hue},55%,5%)`, `hsl(${hue},55%,13%)`, `hsl(${hue},60%,20%)`],
      hills: [`hsl(${hue},45%,12%)`, `hsl(${hue},45%,9%)`, `hsl(${hue},45%,6%)`],
      grass: [`hsl(${hue},50%,16%)`, `hsl(${hue},50%,13%)`, `hsl(${hue},50%,10%)`],
      trunk: `hsl(${hue},35%,5%)`, leaves: [`hsl(${hue},45%,9%)`], tree: 'round',
      moon: `hsl(${hue},45%,86%)`, moonShade: `hsl(${hue},40%,72%)`,
    };
    const rnd = rng(1337);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, P.sky[0]);
    sky.addColorStop(0.65, P.sky[1]);
    sky.addColorStop(1, P.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.round(80 * (w * h) / (900 * 700)); i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`;
      const sz = rnd() > 0.85 ? 3 : 2;
      ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.55), sz, sz);
    }
    const mx = Math.floor(w * 0.8);
    const my = Math.floor(h * 0.12);
    ctx.fillStyle = P.moon;
    ctx.fillRect(mx, my, 40, 40);
    ctx.fillStyle = P.moonShade;
    ctx.fillRect(mx + 8, my + 10, 10, 10);
    ctx.fillRect(mx + 24, my + 24, 8, 8);

    const B = 16; // block size
    const layers = [{ base: 0.6 }, { base: 0.68 }, { base: 0.78 }];
    layers.forEach((L, li) => {
      let y = Math.floor((h * L.base) / B);
      const top = [];
      for (let x = 0; x < Math.ceil(w / B); x++) {
        const r = rnd();
        y += r < 0.3 ? -1 : r > 0.7 ? 1 : 0;
        y = Math.max(Math.floor((h * (L.base - 0.1)) / B), Math.min(Math.floor((h * (L.base + 0.08)) / B), y));
        top.push(y);
        ctx.fillStyle = P.hills[li];
        ctx.fillRect(x * B, y * B, B, h - y * B);
        ctx.fillStyle = P.snow && li < 2 ? P.snow : P.grass[li];
        ctx.fillRect(x * B, y * B, B, P.snow && li < 2 ? 5 : 3);
      }
      if (li === 2) {
        for (let x = 2; x < top.length - 2; x += 3 + Math.floor(rnd() * 5)) {
          const tx = x * B + 4;
          const ty = top[x] * B;
          ctx.fillStyle = P.trunk;
          ctx.fillRect(tx + 4, ty - B * 2, 8, B * 2);
          ctx.fillStyle = P.leaves[Math.floor(rnd() * P.leaves.length)];
          if (P.tree === 'pine') {
            ctx.fillRect(tx - 12, ty - B * 2, 40, B);
            ctx.fillRect(tx - 4, ty - B * 3, 24, B);
            ctx.fillRect(tx + 4, ty - B * 4, 8, B);
            if (P.snow) { ctx.fillStyle = P.snow; ctx.fillRect(tx - 4, ty - B * 3, 24, 3); ctx.fillRect(tx + 4, ty - B * 4, 8, 3); }
          } else {
            ctx.fillRect(tx - 12, ty - B * 4, 40, B * 2);
            ctx.fillRect(tx - 4, ty - B * 5, 24, B);
          }
        }
      }
    });
  };
})();
