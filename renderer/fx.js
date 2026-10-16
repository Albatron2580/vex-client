// Lightweight theme effects (falling leaves, snow, sparks, fireworks) on one canvas behind the interface.
// Kept cheap on purpose: no blur/shadows, ~30 fps cap, few particles, device pixel ratio 1,
// paused while the window is hidden or Minecraft is running, off for "reduce motion".
(function () {
  'use strict';
  const V = window.V;

  const canvas = document.createElement('canvas');
  canvas.id = 'fx';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let kind = null;
  let palette = ['#ff7a1a', '#c2471a', '#9b4dca'];
  let paused = false;
  let parts = [];
  let bursts = [];
  let raf = 0;
  let last = 0;
  let nextEvent = 0;
  let W = 0;
  let H = 0;
  const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false; // resizing resets it; keep the pixel art crisp
  }

  const density = () => Math.min(1.4, Math.max(0.5, (W * H) / (1200 * 760)));

  function seed() {
    parts = [];
    bursts = [];
    const n = (base) => Math.round(base * density());
    if (kind === 'snow') {
      for (let i = 0; i < n(70); i++) parts.push({ x: rand(0, W), y: rand(0, H), r: rand(0.8, 2.6), vy: rand(18, 45), sway: rand(0.4, 1.4), ph: rand(0, 6.28), a: rand(0.35, 0.85) });
    } else if (kind === 'leaves') {
      for (let i = 0; i < n(42); i++) parts.push(leaf(true));
    } else if (kind === 'embers') {
      for (let i = 0; i < n(30); i++) parts.push({ x: rand(0, W), y: rand(0, H), r: rand(0.8, 2.2), vy: -rand(8, 22), sway: rand(0.3, 1), ph: rand(0, 6.28), purple: Math.random() < 0.3, a: rand(0.25, 0.7) });
    } else if (kind === 'sparks') {
      for (let i = 0; i < n(26); i++) parts.push({ x: rand(0, W), y: rand(0, H), r: rand(0.7, 1.8), vy: -rand(6, 16), sway: rand(0.2, 0.7), ph: rand(0, 6.28), a: rand(0.2, 0.6) });
    } else if (kind === 'fireworks') {
      for (let i = 0; i < n(40); i++) parts.push({ x: rand(0, W), y: rand(0, H * 0.6), r: rand(0.6, 1.5), ph: rand(0, 6.28), sp: rand(0.6, 2) });
    }
    nextEvent = performance.now() + 1200;
  }

  // Minecraft-style leaf: a little pixel sprite (like the game's falling-leaf particles), cached per colour.
  const LEAF = [
    '......OO',
    '....OOLO',
    '...OLOO.',
    '..OODO..',
    '.OODOO..',
    '.ODOO...',
    'ODO.....',
    'D.......',
  ];
  const sprites = new Map();
  function shadeHex(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function sprite(color) {
    if (sprites.has(color)) return sprites.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d');
    const tone = { O: color, L: shadeHex(color, 0.35), D: shadeHex(color, -0.35) };
    LEAF.forEach((row, y) => [...row].forEach((ch, i) => { if (tone[ch]) { x.fillStyle = tone[ch]; x.fillRect(i, y, 1, 1); } }));
    sprites.set(color, c);
    return c;
  }
  function leaf(anywhere) {
    return {
      x: rand(0, W), y: anywhere ? rand(-H * 0.1, H) : rand(-60, -20),
      s: 3 * Math.round(rand(3, 5)), vy: rand(26, 52), drift: rand(-12, 12), sway: rand(0.6, 1.4), ph: rand(0, 6.28),
      rot: rand(0, 6.28), vr: rand(-1, 1), flip: rand(0, 6.28), vf: rand(1.2, 3),
      c: palette[Math.floor(Math.random() * palette.length)], a: rand(0.8, 1),
    };
  }
  function drawLeaf(p) {
    const img = sprite(p.c);
    const size = p.s * 8 / 3; // 16, 24 or 32 px: whole pixels like Minecraft
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(p.rot);
    ctx.scale(Math.max(0.55, Math.abs(Math.cos(p.flip))), 1); // tumbling: turns edge-on and back
    ctx.globalAlpha = p.a;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function bat(t) {
    return { x: -40, y: rand(H * 0.08, H * 0.4), vx: rand(110, 170), t0: t, s: rand(0.7, 1.1) };
  }
  function burst() {
    const cols = ['#f4d27a', '#e6b84a', '#dfe4f2', '#9fb4ff'];
    const c = cols[Math.floor(Math.random() * cols.length)];
    const x = rand(W * 0.15, W * 0.85);
    const y = rand(H * 0.1, H * 0.4);
    const sparks = [];
    const count = 34;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const v = rand(60, 120);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    }
    return { sparks, c, life: 0, max: 1.7 };
  }

  function step(t) {
    raf = 0;
    if (!kind || paused || document.hidden) return;
    raf = requestAnimationFrame(step);
    if (t - last < 33) return; // ~30 fps
    const dt = Math.min(0.1, (t - last) / 1000 || 0.033);
    last = t;
    ctx.clearRect(0, 0, W, H);

    if (kind === 'snow' || kind === 'embers' || kind === 'sparks') {
      for (const p of parts) {
        p.ph += dt * p.sway;
        p.y += p.vy * dt;
        p.x += Math.sin(p.ph) * 12 * dt;
        if (p.y > H + 5) { p.y = -5; p.x = rand(0, W); }
        if (p.y < -5) { p.y = H + 5; p.x = rand(0, W); }
        let col;
        if (kind === 'snow') col = `rgba(255,255,255,${p.a})`;
        else if (kind === 'embers') col = p.purple ? `rgba(176,104,255,${p.a * (0.6 + 0.4 * Math.sin(p.ph * 3))})` : `rgba(255,140,40,${p.a * (0.6 + 0.4 * Math.sin(p.ph * 3))})`;
        else col = `rgba(110,170,255,${p.a})`;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
    }

    if (kind === 'leaves') {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.ph += dt * p.sway;
        p.flip += dt * p.vf;
        p.rot += dt * p.vr;
        p.y += p.vy * dt;
        p.x += (p.drift + Math.sin(p.ph) * 28) * dt;
        if (p.y > H + 30 || p.x < -40 || p.x > W + 40) parts[i] = leaf(false);
        else drawLeaf(p);
      }
      ctx.globalAlpha = 1;
    }

    if (kind === 'embers') {
      if (t > nextEvent) { bursts.push(bat(t)); nextEvent = t + rand(9000, 16000); }
      ctx.fillStyle = 'rgba(10,4,14,.55)';
      for (const b of bursts) {
        b.x += b.vx * dt;
        const flap = Math.sin((t - b.t0) / 70) * 5 * b.s;
        const s = 10 * b.s;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.quadraticCurveTo(b.x - s, b.y - flap - 4, b.x - 2 * s, b.y + 2);
        ctx.quadraticCurveTo(b.x - s, b.y, b.x, b.y + 4);
        ctx.quadraticCurveTo(b.x + s, b.y, b.x + 2 * s, b.y + 2);
        ctx.quadraticCurveTo(b.x + s, b.y - flap - 4, b.x, b.y);
        ctx.fill();
      }
      bursts = bursts.filter((b) => b.x < W + 60);
    }

    if (kind === 'fireworks') {
      for (const p of parts) {
        p.ph += dt * p.sp;
        ctx.fillStyle = `rgba(230,236,255,${0.25 + 0.35 * (0.5 + 0.5 * Math.sin(p.ph))})`;
        ctx.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
      }
      if (t > nextEvent) { bursts.push(burst()); nextEvent = t + rand(2600, 4800); }
      for (const b of bursts) {
        b.life += dt;
        const k = 1 - b.life / b.max;
        ctx.fillStyle = b.c;
        ctx.globalAlpha = Math.max(0, k);
        for (const s of b.sparks) {
          s.vx *= 0.985; s.vy = s.vy * 0.985 + 40 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          ctx.fillRect(s.x, s.y, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      bursts = bursts.filter((b) => b.life < b.max);
    }
  }

  function kick() {
    if (!raf && kind && !paused && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(step); }
    if (!kind || paused) ctx.clearRect(0, 0, W, H);
    canvas.hidden = !kind || paused;
  }

  V.fx = {
    // effect: 'leaves' | 'snow' | 'embers' | 'sparks' | 'fireworks' | null; colors: palette for leaves
    set(effect, colors) {
      const next = reduce.matches ? null : effect || null;
      const pal = colors && colors.length ? colors : palette;
      if (next === kind && pal.join() === palette.join()) return kick();
      palette = pal;
      sprites.clear();
      kind = next;
      resize();
      seed();
      kick();
    },
    pause(on) { paused = !!on; kick(); },
    get kind() { return kind; },
  };

  document.body.prepend(canvas);
  resize();
  window.addEventListener('resize', () => { resize(); seed(); });
  document.addEventListener('visibilitychange', kick);
  if (reduce.addEventListener) reduce.addEventListener('change', () => V.applyTheme && V.applyTheme());
})();
