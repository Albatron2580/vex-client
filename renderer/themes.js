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
  //   Halloween  1 Oct – 31 Oct
  //   Christmas  1 Dec – 26 Dec
  //   New Year  27 Dec –  3 Jan
  // The key names one occurrence (e.g. "newyear-2026" runs 27 Dec 2026 – 3 Jan 2027).
  function seasonFor(date) {
    const d = date || new Date();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const y = d.getFullYear();
    if (m === 10) return { theme: 'halloween', key: `halloween-${y}`, ends: new Date(y, 10, 1) };
    if (m === 12 && day <= 26) return { theme: 'christmas', key: `christmas-${y}`, ends: new Date(y, 11, 27) };
    if (m === 12 && day >= 27) return { theme: 'newyear', key: `newyear-${y}`, ends: new Date(y + 1, 0, 4) };
    if (m === 1 && day <= 3) return { theme: 'newyear', key: `newyear-${y - 1}`, ends: new Date(y, 0, 4) };
    return null;
  }

  // Which theme is on screen right now, and why.
  // settings: { theme, seasonalThemes, seasonOptOut }
  function effective(settings, date) {
    const s = settings || {};
    const preferred = byId[s.theme] ? s.theme : DEFAULT_THEME;
    const season = seasonFor(date);
    if (s.seasonalThemes && season && s.seasonOptOut !== season.key) {
      return { id: season.theme, auto: true, season, preferred };
    }
    return { id: preferred, auto: false, season: s.seasonalThemes ? season : null, preferred };
  }

  // Settings patch for "the user picked this theme by hand".
  // While a season is active and automatic switching is on, picking a different theme opts out
  // of the rest of that season only; picking the seasonal theme itself opts back in.
  function choosePatch(settings, id, date) {
    const patch = { theme: id, accent: '' };
    const season = seasonFor(date);
    if (settings && settings.seasonalThemes && season) patch.seasonOptOut = id === season.theme ? '' : season.key;
    return patch;
  }

  const api = { THEMES, DEFAULT_THEME, get, seasonFor, effective, choosePatch, ids: THEMES.map((t) => t.id) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VexThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
