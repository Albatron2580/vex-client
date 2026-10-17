// Theme registry and seasonal rules.
// To add a theme: add an entry to THEMES below (lib/store.js reads the ids from here),
// and for image themes drop background.jpg|png|webp into renderer/themes/<id>/.
// This file runs in the launcher window and is also loaded by the Node tests.
(function (root) {
  'use strict';

  // vars: colours for every surface. Image themes use translucent panels so the background shows through.
  // overlay: drawn over the background image to keep text readable.
  // land: colours for the pixel-art landscape background (plain themes derive it from the accent).
  // effect: optional lightweight animation (see fx.js); leafColors tints the 'leaves' effect. decor: CSS decorations keyed off data-theme.
  const THEMES = [
    {
      id: 'vex', name: 'Vex', tagline: 'Electric blue, built for PvP', image: true, effect: 'leaves', leafColors: ['#2f7dff', '#5b9bff', '#1d4fb5', '#8fb8ff', '#3d6ee0'],
      land: {
        sky: ['#030817', '#0b2466', '#3d72dc'], glow: '#5b8cff', body: { color: '#e4ecff', size: 0.055, x: 0.78, y: 0.17 }, stars: true,
        clouds: '#8fa9e8', cloudAlpha: 0.22, far: '#2c4fa4', near: '#071431', fog: '#3a6ad0',
        grass: ['#5584e6', '#2a62e0'], dirt: '#0d1d4a', peakSnow: '#d6e2ff',
        trees: { type: 'oak', trunk: '#0a1230', leaves: ['#12398c', '#1b4db3', '#0e2f73'] },
      },
      accent: '#2f7dff', position: 'center',
      vars: { bg: 'rgba(3,8,22,.72)', bgSolid: '#030816', panel: 'rgba(7,16,40,.84)', panel2: 'rgba(14,30,72,.9)', line: 'rgba(52,104,220,.42)', text: '#eaf1ff', dim: '#93a8d8' },
      overlay: 'linear-gradient(180deg, rgba(2,6,20,.45) 0%, rgba(2,6,20,.62) 55%, rgba(2,6,20,.82) 100%)',
      fallback: 'radial-gradient(ellipse at 70% 20%, #123a9c 0%, transparent 55%), radial-gradient(ellipse at 15% 85%, #0b2a75 0%, transparent 50%), linear-gradient(160deg, #030816 0%, #061538 60%, #020611 100%)',
    },
    {
      id: 'halloween', name: 'Halloween', tagline: 'Pumpkin orange and witching purple', image: true, seasonal: true, effect: 'leaves',
      leafColors: ['#ff7a1a', '#e85d1c', '#c2471a', '#ffad47', '#9b4dca', '#7a2f9e'],
      land: {
        sky: ['#14061a', '#43144a', '#e0602c'], glow: '#ff8a2a', body: { color: '#ffb347', size: 0.085, x: 0.74, y: 0.2 }, stars: true,
        clouds: '#6a2452', cloudAlpha: 0.35, far: '#6b2a52', near: '#160812', fog: '#b14d32',
        grass: ['#e07030', '#ff7a1a'], dirt: '#2e1018',
        trees: { type: 'oak', trunk: '#1c0a10', leaves: ['#ff7a1a', '#e85d1c', '#c2471a', '#ffad47', '#8a2f7e'] },
      },
      accent: '#ff7a1a', position: 'center',
      vars: { bg: 'rgba(10,5,14,.74)', bgSolid: '#0a050e', panel: 'rgba(20,10,26,.86)', panel2: 'rgba(36,17,44,.92)', line: 'rgba(150,72,180,.4)', text: '#fff1e6', dim: '#c4a7c9' },
      overlay: 'linear-gradient(180deg, rgba(8,3,12,.5) 0%, rgba(8,3,12,.66) 55%, rgba(5,2,8,.86) 100%)',
      fallback: 'radial-gradient(ellipse at 78% 18%, rgba(255,140,40,.45) 0%, transparent 40%), radial-gradient(ellipse at 20% 90%, #3a1250 0%, transparent 55%), linear-gradient(170deg, #12061a 0%, #1d0a24 55%, #060208 100%)',
    },
    {
      id: 'christmas', name: 'Christmas', tagline: 'Pine green, berry red and a little gold', image: true, seasonal: true, effect: 'leaves', leafColors: ['#2b7b47', '#1f6a3e', '#3f9a5c', '#e2333f', '#f2f8f6'],
      land: {
        sky: ['#020b10', '#0e2e3a', '#2f6e70'], glow: '#a6f0d2', body: { color: '#f6f2e0', size: 0.05, x: 0.8, y: 0.15 }, stars: true, aurora: ['#3fd37a', '#2fb8a0', '#7be0b0'],
        clouds: '#d2e6e6', cloudAlpha: 0.16, far: '#355f66', near: '#0a1c1a', fog: '#5a9694',
        grass: ['#e6f2f2', '#f6fbfa'], dirt: '#1e302e', snow: '#f2f8f6',
        trees: { type: 'pine', trunk: '#2a160c', leaves: ['#1f6a3e', '#17583a', '#2b7b47'], snow: '#eef6f2' },
      },
      accent: '#e2333f', position: 'center',
      vars: { bg: 'rgba(4,14,10,.72)', bgSolid: '#04100b', panel: 'rgba(8,24,18,.86)', panel2: 'rgba(14,40,30,.92)', line: 'rgba(212,175,90,.34)', text: '#f6fbf7', dim: '#a9c4b4' },
      overlay: 'linear-gradient(180deg, rgba(3,10,8,.42) 0%, rgba(3,10,8,.6) 55%, rgba(2,8,6,.84) 100%)',
      fallback: 'radial-gradient(ellipse at 75% 15%, rgba(226,51,63,.35) 0%, transparent 45%), radial-gradient(ellipse at 20% 85%, #0f4a2f 0%, transparent 55%), linear-gradient(170deg, #06160f 0%, #0a2318 55%, #030a07 100%)',
    },
    {
      id: 'newyear', name: 'New Year', tagline: 'Midnight blue with silver and gold', image: true, seasonal: true, effect: 'leaves', leafColors: ['#e6b84a', '#f4e2a8', '#c9cfe0', '#9fb4ff', '#d9a531'],
      land: {
        sky: ['#01030b', '#0d1a4e', '#454a8a'], glow: '#e6b84a', body: { color: '#f4e2a8', size: 0.05, x: 0.22, y: 0.16 }, stars: true,
        clouds: '#9aa2d0', cloudAlpha: 0.18, far: '#2b3472', near: '#060a1a', fog: '#555a96',
        grass: ['#b4bcd8', '#dde1ee'], dirt: '#151b38', peakSnow: '#eef0fa',
        trees: { type: 'pine', trunk: '#05070f', leaves: ['#18224a', '#202c5c'] },
      },
      accent: '#e6b84a', position: 'center',
      vars: { bg: 'rgba(3,6,18,.72)', bgSolid: '#03060f', panel: 'rgba(8,12,30,.86)', panel2: 'rgba(16,22,50,.92)', line: 'rgba(200,205,225,.26)', text: '#f4f6ff', dim: '#a6aeca' },
      overlay: 'linear-gradient(180deg, rgba(2,4,14,.42) 0%, rgba(2,4,14,.6) 55%, rgba(1,2,8,.84) 100%)',
      fallback: 'radial-gradient(ellipse at 70% 15%, rgba(230,184,74,.3) 0%, transparent 40%), radial-gradient(ellipse at 20% 80%, #14204e 0%, transparent 55%), linear-gradient(170deg, #050a1e 0%, #0a1232 55%, #010309 100%)',
    },
    {
      id: 'spring', name: 'Spring', tagline: 'Cherry blossom pink and fresh green', image: true, seasonal: true, nature: true, effect: 'leaves',
      leafColors: ['#ffb7d5', '#ff8fbf', '#ffd6e7', '#f7a1c4', '#9be37a'],
      land: {
        sky: ['#2a1e4a', '#7a5aa8', '#ffb0c8'], glow: '#ffd0e0', body: { color: '#fff4d6', size: 0.06, x: 0.76, y: 0.2 }, stars: false,
        clouds: '#ffe6f0', cloudAlpha: 0.32, far: '#8a6aa8', near: '#1e2a22', fog: '#d89ab8',
        grass: ['#7fd16a', '#9be37a'], dirt: '#3a2a22',
        trees: { type: 'oak', trunk: '#3a2228', leaves: ['#ffb7d5', '#ff8fbf', '#f7a1c4', '#ffd6e7'] },
      },
      accent: '#ff7eb6', position: 'center',
      vars: { bg: 'rgba(22,10,24,.72)', bgSolid: '#160a18', panel: 'rgba(34,16,36,.86)', panel2: 'rgba(52,24,54,.92)', line: 'rgba(255,140,190,.36)', text: '#fff2f8', dim: '#d6aec4' },
      overlay: 'linear-gradient(180deg, rgba(18,6,20,.42) 0%, rgba(18,6,20,.6) 55%, rgba(12,4,14,.84) 100%)',
      fallback: 'radial-gradient(ellipse at 75% 18%, rgba(255,140,190,.4) 0%, transparent 45%), radial-gradient(ellipse at 20% 85%, #2e5a2a 0%, transparent 55%), linear-gradient(170deg, #1c0c20 0%, #2a1230 55%, #0c050e 100%)',
    },
    {
      id: 'summer', name: 'Summer', tagline: 'Sunset orange over a warm purple sky', image: true, seasonal: true, nature: true, effect: 'leaves',
      leafColors: ['#5fc94a', '#3fa83a', '#8ee05a', '#ffd34f', '#ff9a3c'],
      land: {
        sky: ['#1a0d3a', '#8a2f78', '#ffa64a'], glow: '#ffcc66', body: { color: '#ffe08a', size: 0.09, x: 0.7, y: 0.3 }, stars: false,
        clouds: '#ffc9a0', cloudAlpha: 0.3, far: '#7a3a6a', near: '#14200e', fog: '#e07a50',
        grass: ['#5fc94a', '#8ee05a'], dirt: '#3a2414',
        trees: { type: 'oak', trunk: '#2a1a0e', leaves: ['#3fa83a', '#5fc94a', '#2e8a30'] },
      },
      accent: '#ff9a3c', position: 'center',
      vars: { bg: 'rgba(20,8,26,.72)', bgSolid: '#14081a', panel: 'rgba(30,12,38,.86)', panel2: 'rgba(48,20,56,.92)', line: 'rgba(255,154,60,.36)', text: '#fff5ec', dim: '#d4b0c0' },
      overlay: 'linear-gradient(180deg, rgba(16,6,22,.4) 0%, rgba(16,6,22,.58) 55%, rgba(10,4,14,.84) 100%)',
      fallback: 'radial-gradient(ellipse at 70% 30%, rgba(255,166,74,.45) 0%, transparent 45%), radial-gradient(ellipse at 20% 85%, #4a1a50 0%, transparent 55%), linear-gradient(170deg, #1a0a26 0%, #2a0f30 55%, #0a0410 100%)',
    },
    {
      id: 'autumn', name: 'Autumn', tagline: 'Copper leaves and a purple dusk', image: true, seasonal: true, nature: true, effect: 'leaves',
      leafColors: ['#d9622b', '#b8461f', '#e8a23a', '#9c3a1a', '#c97a2a'],
      land: {
        sky: ['#140a24', '#4a2250', '#c8683a'], glow: '#e89a50', body: { color: '#ffd9a0', size: 0.07, x: 0.24, y: 0.22 }, stars: true,
        clouds: '#b07a6a', cloudAlpha: 0.28, far: '#5a3048', near: '#1a0e0a', fog: '#a85a3a',
        grass: ['#a8802a', '#c99a3a'], dirt: '#2e1a10',
        trees: { type: 'oak', trunk: '#24140c', leaves: ['#d9622b', '#b8461f', '#e8a23a', '#9c3a1a'] },
      },
      accent: '#e07a2e', position: 'center',
      vars: { bg: 'rgba(18,8,12,.72)', bgSolid: '#12080c', panel: 'rgba(30,14,18,.86)', panel2: 'rgba(46,22,26,.92)', line: 'rgba(224,122,46,.36)', text: '#fff2e8', dim: '#cfaea0' },
      overlay: 'linear-gradient(180deg, rgba(14,6,10,.42) 0%, rgba(14,6,10,.6) 55%, rgba(8,4,6,.84) 100%)',
      fallback: 'radial-gradient(ellipse at 25% 20%, rgba(232,154,80,.4) 0%, transparent 45%), radial-gradient(ellipse at 80% 85%, #4a1e24 0%, transparent 55%), linear-gradient(170deg, #160a12 0%, #24101a 55%, #0a0408 100%)',
    },
    {
      id: 'navy', name: 'Classic', tagline: 'The original Vex Client look', accent: '#3d7bff',
      vars: { bg: '#050b1a', bgSolid: '#050b1a', panel: '#0a1530', panel2: '#0f1e42', line: '#1b3470', text: '#e8efff', dim: '#8a9cc8' },
    },
    {
      id: 'midnight', name: 'Midnight', tagline: 'Pure black, easy on the eyes', accent: '#3d7bff',
      vars: { bg: '#000000', bgSolid: '#000000', panel: '#09090e', panel2: '#11121b', line: '#23283a', text: '#f0f2fa', dim: '#8b90a8' },
    },
    {
      id: 'violet', name: 'Violet', tagline: 'Deep purple', accent: '#9b6bff',
      vars: { bg: '#0b0618', bgSolid: '#0b0618', panel: '#140c2b', panel2: '#1c1140', line: '#3a2670', text: '#f1ebff', dim: '#a597cf' },
    },
  ];

  const DEFAULT_THEME = 'vex';
  const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));
  const get = (id) => byId[id] || byId[DEFAULT_THEME];

  // Seasons use the computer's local date. Ranges are inclusive.
  // Holidays (the "Seasonal themes" switch):
  //   Halloween  1 Oct – 31 Oct
  //   Christmas  1 Dec – 26 Dec
  //   New Year  27 Dec –  3 Jan
  // Nature seasons (the separate "Spring, summer, autumn" switch, off by default; holidays win):
  //   Spring  1 Mar – 31 May,  Summer  1 Jun – 31 Aug,  Autumn  1 Sep – 30 Nov (Halloween wins in October when both are on)
  // The key names one occurrence (e.g. "newyear-2026" runs 27 Dec 2026 – 3 Jan 2027).
  function holidayFor(d) {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const y = d.getFullYear();
    if (m === 10) return { theme: 'halloween', key: `halloween-${y}`, ends: new Date(y, 10, 1) };
    if (m === 12 && day <= 26) return { theme: 'christmas', key: `christmas-${y}`, ends: new Date(y, 11, 27) };
    if (m === 12 && day >= 27) return { theme: 'newyear', key: `newyear-${y}`, ends: new Date(y + 1, 0, 4) };
    if (m === 1 && day <= 3) return { theme: 'newyear', key: `newyear-${y - 1}`, ends: new Date(y, 0, 4) };
    return null;
  }

  function natureFor(d) {
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    if (m >= 3 && m <= 5) return { theme: 'spring', key: `spring-${y}`, ends: new Date(y, 5, 1) };
    if (m >= 6 && m <= 8) return { theme: 'summer', key: `summer-${y}`, ends: new Date(y, 8, 1) };
    if (m >= 9 && m <= 11) return { theme: 'autumn', key: `autumn-${y}`, ends: new Date(y, 11, 1) };
    return null;
  }

  // opts.holidays (default true) and opts.nature (default false) pick which kinds of season count.
  function seasonFor(date, opts) {
    const d = date || new Date();
    const o = opts || {};
    return (o.holidays !== false ? holidayFor(d) : null) || (o.nature ? natureFor(d) : null);
  }

  const seasonOpts = (s) => ({ holidays: !!s.seasonalThemes, nature: !!s.natureSeasons });
  const anySeasons = (s) => !!(s && (s.seasonalThemes || s.natureSeasons));

  // Which theme is on screen right now, and why.
  // settings: { theme, seasonalThemes, natureSeasons, seasonOptOut }
  function effective(settings, date) {
    const s = settings || {};
    const preferred = byId[s.theme] ? s.theme : DEFAULT_THEME;
    const season = anySeasons(s) ? seasonFor(date, seasonOpts(s)) : null;
    if (season && s.seasonOptOut !== season.key) {
      return { id: season.theme, auto: true, season, preferred };
    }
    return { id: preferred, auto: false, season, preferred };
  }

  // Settings patch for "the user picked this theme by hand".
  // While a season is active and automatic switching is on, picking a different theme opts out
  // of the rest of that season only; picking the seasonal theme itself opts back in.
  function choosePatch(settings, id, date) {
    const patch = { theme: id, accent: '' };
    const season = anySeasons(settings) ? seasonFor(date, seasonOpts(settings)) : null;
    if (season) patch.seasonOptOut = id === season.theme ? '' : season.key;
    return patch;
  }

  const api = { THEMES, DEFAULT_THEME, get, seasonFor, effective, choosePatch, ids: THEMES.map((t) => t.id) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VexThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
