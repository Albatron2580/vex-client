// Painted Minecraft biome background.
// Blocky Minecraft shapes (terrain columns, block trees, flat clouds) rendered like a painting:
// atmospheric haze between mountain layers, soft glow around the sun or moon, per-block colour
// variation and a final pass of brush strokes sampled from the picture itself.
// It is drawn once per theme change or window resize (not animated), so it costs nothing while idle.
(function () {
  'use strict';
  const V = window.V;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hex = (c) => {
    if (c.startsWith('hsl')) { const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; c = ctx.fillStyle; }
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => { const x = hex(a); const y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
  const rgbArr = (c) => (c.startsWith('rgb') ? c.match(/\d+/g).slice(0, 3).map(Number) : hex(c));
  const shade = (c, k) => { const [r, g, b] = rgbArr(c); const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
  const alpha = (c, a) => { const [r, g, b] = rgbArr(c); return `rgba(${r},${g},${b},${a})`; };

  // Palette for themes that don't define one: built from the accent hue.
  V.biomeFromHue = (hue) => {
    const H = (s, l) => `hsl(${hue},${s}%,${l}%)`;
    return {
      sky: [H(55, 4), H(55, 14), H(60, 34)], glow: H(80, 60), body: { color: H(45, 88), size: 0.06 }, stars: true,
      clouds: H(40, 60), cloudAlpha: 0.18, far: H(40, 30), near: H(45, 7), fog: H(55, 32),
      grass: [H(45, 40), H(55, 34)], dirt: H(40, 10), peakSnow: H(30, 82),
      trees: { type: 'oak', trunk: H(35, 6), leaves: [H(45, 14), H(50, 18), H(40, 11)] },
    };
  };

  function paint(canvas, P, opts = {}) {
    const W = canvas.width;
    const Hh = canvas.height;
    if (!W || !Hh) return;
    const ctx = canvas.getContext('2d');
    const R = rng(opts.seed || 20261016);
    const small = W < 400; // theme previews
    const unit = opts.unit || Math.max(0.35, Math.min(W, Hh * 1.6) / 1400);

    // ---- sky ----
    const sky = ctx.createLinearGradient(0, 0, 0, Hh * 0.75);
    sky.addColorStop(0, P.sky[0]);
    sky.addColorStop(0.55, P.sky[1]);
    sky.addColorStop(1, P.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, Hh);

    // aurora (Christmas)
    if (P.aurora && !small) {
      for (let band = 0; band < 3; band++) {
        const col = P.aurora[band % P.aurora.length];
        const baseY = Hh * (0.12 + band * 0.07);
        const ph = R() * 6;
        for (let x = 0; x < W; x += 3) {
          const y = baseY + Math.sin(x / (W / 3.2) + ph) * Hh * 0.05 + Math.sin(x / 90 + ph * 2) * 8;
          const len = Hh * (0.08 + 0.05 * Math.sin(x / 140 + ph));
          const g = ctx.createLinearGradient(0, y, 0, y + len);
          g.addColorStop(0, alpha(col, 0));
          g.addColorStop(0.4, alpha(col, 0.16));
          g.addColorStop(1, alpha(col, 0));
          ctx.fillStyle = g;
          ctx.fillRect(x, y, 3, len);
        }
      }
    }

    // stars
    if (P.stars) {
      const n = Math.round((W * Hh) / (small ? 900 : 5200));
      for (let i = 0; i < n; i++) {
        const y = R() * Hh * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + R() * 0.6) * (1 - y / (Hh * 0.55))})`;
        const s = R() > 0.9 ? 2.5 : 1.5;
        ctx.fillRect(R() * W, y, s, s);
      }
    }

    // sun / moon with a soft glow (square, like Minecraft's)
    const b = opts.noBody ? { color: 'rgba(0,0,0,0)', size: 0 } : P.body || {};
    const bs = Math.round(Math.min(W, Hh) * (b.size || 0.06));
    const bx = W * (b.x || 0.76);
    const by = Hh * (b.y || 0.18);
    if (!opts.noBody) {
    const glow = ctx.createRadialGradient(bx, by, bs * 0.3, bx, by, bs * 6);
    glow.addColorStop(0, alpha(P.glow, 0.55));
    glow.addColorStop(0.35, alpha(P.glow, 0.16));
    glow.addColorStop(1, alpha(P.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, Hh);
    ctx.fillStyle = b.color;
    ctx.fillRect(bx - bs / 2, by - bs / 2, bs, bs);
    ctx.fillStyle = shade(b.color, -0.12);
    const q = bs / 8;
    ctx.fillRect(bx - bs / 2 + q, by - bs / 2 + q * 2, q * 2, q * 2);
    ctx.fillRect(bx + q, by + q, q * 2, q);
    ctx.fillRect(bx - q, by - bs / 2 + q * 5, q, q);
    }

    // flat blocky clouds
    const cb = Math.max(4, Math.round(14 * unit));
    const clouds = small ? 3 : 7;
    for (let i = 0; i < clouds; i++) {
      const cx = R() * W;
      const cy = Hh * (0.06 + R() * 0.3);
      const cols = 4 + Math.floor(R() * 9);
      const a = (P.cloudAlpha || 0.25) * (0.6 + R() * 0.6);
      for (let row = 0; row < 2 + (R() > 0.5 ? 1 : 0); row++) {
        const off = Math.floor(R() * 3) - 1;
        const len = cols - row * 2 + Math.floor(R() * 3);
        for (let c = 0; c < len; c++) {
          ctx.fillStyle = alpha(row === 0 ? shade(P.clouds, 0.15) : P.clouds, a);
          ctx.fillRect(cx + (c + off + row) * cb * 1.6, cy + row * cb, cb * 1.6 + 0.5, cb + 0.5);
        }
      }
    }

    // ---- terrain: far to near, each layer hazier the further away it is ----
    const layers = [
      { base: 0.5, amp: 0.2, block: 7, trees: 0 },
      { base: 0.6, amp: 0.12, block: 10, trees: 0.05 },
      { base: 0.69, amp: 0.08, block: 14, trees: 0.09 },
      { base: 0.8, amp: 0.06, block: 20, trees: 0.13 },
      { base: 0.93, amp: 0.04, block: 28, trees: 0.1 },
    ];
    const tops = [];
    layers.forEach((L, li) => {
      const t = li / (layers.length - 1);
      const blk = Math.max(3, Math.round(L.block * unit));
      const haze = (1 - t) * 0.62;
      const body = mix(mix(P.far, P.near, t), P.fog, haze * 0.7);
      const grass = mix(mix(P.grass[0], P.grass[1], t), P.fog, haze * 0.32);
      const dirt = mix(mix(P.dirt, P.near, 0.3), P.fog, haze * 0.7);
      const ph = [R() * 6.3, R() * 6.3, R() * 6.3];
      const cols = Math.ceil(W / blk) + 1;
      const heights = [];
      for (let c = 0; c < cols; c++) {
        const x = c / cols;
        const T2 = Math.PI * 2;
        const n = opts.periodic
          ? Math.sin(x * T2 * 2 + ph[0]) * 0.55 + Math.sin(x * T2 * 5 + ph[1]) * 0.3 + Math.sin(x * T2 * 11 + ph[2]) * 0.15
          : Math.sin(x * 5.1 + ph[0]) * 0.55 + Math.sin(x * 11.7 + ph[1]) * 0.3 + Math.sin(x * 23.3 + ph[2]) * 0.15;
        let y = Hh * L.base - n * Hh * L.amp;
        y = Math.round(y / blk) * blk;
        if (c > 0 && !opts.periodic) y = Math.max(heights[c - 1] - blk * 2, Math.min(heights[c - 1] + blk * 2, y)); // max 2-block steps
        heights.push(y);
      }
      tops.push(heights);
      const peak = Math.min(...heights);
      for (let c = 0; c < cols; c++) {
        const x = c * blk;
        const top = heights[c];
        // body: per-block colour jitter, darker toward the bottom
        for (let y = top; y < Hh; y += blk) {
          const depth = (y - top) / blk;
          let col = depth === 0 ? grass : depth < 3 ? dirt : body;
          if (depth === 0 && P.peakSnow && li < 3 && top < peak + blk * 3) col = mix(P.peakSnow, P.fog, haze * 0.4);
          if (depth === 0 && P.snow) col = mix(P.snow, P.fog, haze * 0.35);
          const k = (R() - 0.5) * 0.1 - Math.min(0.25, depth * 0.012);
          ctx.fillStyle = shade(col, k);
          ctx.fillRect(x, y, blk + 0.5, blk + 0.5);
          if (depth === 0) {
            // bright rim on top and grass hanging over the dirt, like a grass block's side
            ctx.fillStyle = shade(col, 0.18);
            ctx.fillRect(x, y, blk + 0.5, Math.max(1, blk * 0.2));
            ctx.fillStyle = shade(col, -0.05);
            for (let d = 0; d < 4; d++) if (R() > 0.4) ctx.fillRect(x + (d * blk) / 4, y + blk, blk / 4 + 0.5, (blk / 4) * (1 + Math.floor(R() * 2)));
          }
        }
        // light from the sun/moon side on the block edge
        if (c > 0 && heights[c - 1] > top) {
          ctx.fillStyle = alpha('#ffffff', 0.05 + 0.05 * t);
          ctx.fillRect(x, top, Math.max(1, blk * 0.18), heights[c - 1] - top);
        }
      }
      // trees
      if (L.trees && P.trees) {
        for (let c = 2; c < cols - 2; c++) {
          if (R() > L.trees) continue;
          drawTree(ctx, P.trees, c * blk, heights[c], blk, haze, P, R);
          c += 2;
        }
      }
      // haze band in front of the layer, so the next one stands out
      if (li < layers.length - 1) {
        const yTop = Hh * (L.base - L.amp * 0.3);
        const g = ctx.createLinearGradient(0, yTop, 0, Hh * (L.base + 0.1));
        g.addColorStop(0, alpha(P.fog, 0));
        g.addColorStop(1, alpha(P.fog, 0.32 * (1 - t * 0.7)));
        ctx.fillStyle = g;
        ctx.fillRect(0, yTop, W, Hh - yTop);
      }
    });

    // ---- paint: short strokes that pick up the colour underneath ----
    if (!opts.noStrokes) {
      const img = ctx.getImageData(0, 0, W, Hh).data;
      const strokes = Math.round((W * Hh) / (small ? 60 : 260));
      for (let i = 0; i < strokes; i++) {
        const x = R() * W;
        const y = R() * Hh;
        const p = (Math.floor(y) * W + Math.floor(x)) * 4;
        const k = (R() - 0.5) * 0.18;
        const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
        ctx.fillStyle = `rgba(${f(img[p])},${f(img[p + 1])},${f(img[p + 2])},${0.22 + R() * 0.2})`;
        const len = (small ? 3 : 6) + R() * (small ? 5 : 16);
        const wd = 1 + R() * (small ? 1.5 : 3);
        const ang = y < Hh * 0.5 ? (R() - 0.5) * 0.25 : (R() - 0.5) * 0.9;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, len / 2, wd / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // canvas grain and a soft vignette
    if (!small) {
      const n = document.createElement('canvas');
      n.width = n.height = 96;
      const nc = n.getContext('2d');
      const d = nc.createImageData(96, 96);
      for (let i = 0; i < d.data.length; i += 4) { const v = R() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 14; }
      nc.putImageData(d, 0, 0);
      ctx.fillStyle = ctx.createPattern(n, 'repeat');
      ctx.fillRect(0, 0, W, Hh);
    }
    if (opts.noVignette) return;
    const v = ctx.createRadialGradient(W / 2, Hh * 0.45, Math.min(W, Hh) * 0.35, W / 2, Hh * 0.5, Math.max(W, Hh) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, Hh);
  }

  function drawTree(ctx, T, x, ground, blk, haze, P, R) {
    const fog = (c) => mix(c, P.fog, haze * 0.6);
    const leaf = () => fog(T.leaves[Math.floor(R() * T.leaves.length)]);
    const b = blk * 0.85;
    const trunkH = 3 + Math.floor(R() * 3);
    ctx.fillStyle = fog(T.trunk);
    ctx.fillRect(x + b, ground - b * trunkH, b, b * trunkH);
    if (T.type === 'pine') {
      const tiers = [[5, 1], [3, 1], [3, 1], [1, 1]];
      let y = ground - b * (trunkH - 1);
      tiers.forEach(([w], i) => {
        y -= b;
        for (let k = 0; k < w; k++) {
          ctx.fillStyle = shade(leaf(), (R() - 0.5) * 0.15);
          ctx.fillRect(x + b + (k - Math.floor(w / 2)) * b, y, b + 0.5, b + 0.5);
        }
        if (T.snow) { ctx.fillStyle = fog(T.snow); ctx.fillRect(x + b - Math.floor(w / 2) * b, y, w * b, Math.max(1, b * 0.28)); }
        if (i === 0) y -= 0;
      });
    } else {
      const top = ground - b * trunkH;
      const rows = [[5, 1], [5, 0], [3, -1]];
      rows.forEach(([w, dy]) => {
        for (let k = 0; k < w; k++) {
          ctx.fillStyle = shade(leaf(), (R() - 0.5) * 0.2);
          ctx.fillRect(x + b + (k - Math.floor(w / 2)) * b, top + dy * b - b, b + 0.5, b + 0.5);
        }
      });
    }
  }

  // Small previews: canvas already sized by the caller.
  V.paintBiomeInto = (canvas, palette, opts) => paint(canvas, palette, opts);

  // canvas: drawn at its parent's size (or the window for a full-page background)
  V.paintBiome = (canvas, palette, opts) => {
    const full = canvas.parentElement === document.body;
    canvas.width = Math.round(full ? window.innerWidth : canvas.clientWidth || canvas.parentElement.clientWidth);
    canvas.height = Math.round(full ? window.innerHeight : canvas.clientHeight || canvas.parentElement.clientHeight);
    paint(canvas, palette, opts);
  };
})();
