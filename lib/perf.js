// Performance presets per profile: memory, Java (JVM) tuning, video settings and performance mods.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const modrinth = require('./modrinth');

// Tuned G1 garbage collector settings for the Minecraft client: shorter, rarer GC pauses (fewer stutters).
const JVM_FLAGS = [
  '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4', '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:G1RSetUpdatingPauseTimePercent=5', '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem', '-XX:MaxTenuringThreshold=1',
];

// Modrinth slugs and which loaders they exist for.
const PERF_MODS = {
  sodium: { title: 'Sodium', loaders: ['fabric', 'neoforge'], what: 'much faster rendering' },
  lithium: { title: 'Lithium', loaders: ['fabric', 'neoforge'], what: 'faster game logic' },
  'ferrite-core': { title: 'FerriteCore', loaders: ['fabric', 'forge', 'neoforge'], what: 'less memory use' },
  entityculling: { title: 'EntityCulling', loaders: ['fabric', 'forge', 'neoforge'], what: 'skips hidden mobs and chests' },
  immediatelyfast: { title: 'ImmediatelyFast', loaders: ['fabric', 'neoforge'], what: 'faster HUD and text' },
};

// video: graphicsMode 0 fast / 1 fancy; particles 0 all / 1 decreased / 2 minimal; clouds "false" | "fast" | "true"
const PRESETS = {
  potato: {
    label: 'Potato', desc: 'Lowest settings for weak PCs and laptops.', ram: 3,
    video: { renderDistance: 6, simulationDistance: 5, graphicsMode: 0, particles: 2, renderClouds: '"false"', entityShadows: false, ao: false, biomeBlendRadius: 0, mipmapLevels: 0, entityDistanceScaling: 0.5, maxFps: 120, enableVsync: false },
    mods: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast'],
  },
  balanced: {
    label: 'Balanced', desc: 'Good looks and smooth FPS on most PCs.', ram: 4,
    video: { renderDistance: 12, simulationDistance: 8, graphicsMode: 1, particles: 1, renderClouds: '"fast"', entityShadows: true, ao: true, biomeBlendRadius: 2, mipmapLevels: 4, entityDistanceScaling: 1.0, maxFps: 260, enableVsync: false },
    mods: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast'],
  },
  performance: {
    label: 'Performance', desc: 'Highest FPS for PvP: fast graphics, shorter view distance.', ram: 4,
    video: { renderDistance: 8, simulationDistance: 6, graphicsMode: 0, particles: 1, renderClouds: '"false"', entityShadows: false, ao: true, biomeBlendRadius: 0, mipmapLevels: 2, entityDistanceScaling: 0.75, maxFps: 260, enableVsync: false },
    mods: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast'],
  },
  visual: {
    label: 'Visual', desc: 'Far view distance and full effects. Needs a strong PC.', ram: 6,
    video: { renderDistance: 20, simulationDistance: 10, graphicsMode: 1, particles: 0, renderClouds: '"true"', entityShadows: true, ao: true, biomeBlendRadius: 5, mipmapLevels: 4, entityDistanceScaling: 1.5, maxFps: 260, enableVsync: true },
    mods: ['sodium', 'ferrite-core', 'entityculling', 'immediatelyfast'],
  },
};

const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

// Validates a perf object coming from the UI.
function clean(input) {
  const p = input || {};
  const preset = PRESETS[p.preset] || p.preset === 'custom' ? p.preset : 'balanced';
  // (custom starts from the balanced values)
  const base = PRESETS[preset] || PRESETS.balanced;
  const v = { ...base.video, ...(preset === 'custom' ? p.video || {} : {}) };
  return {
    preset,
    ram: clamp(p.ram ?? base.ram, 1, 64, base.ram),
    jvmFlags: p.jvmFlags !== false,
    installMods: p.installMods !== false,
    video: {
      renderDistance: clamp(v.renderDistance, 2, 32, 12),
      simulationDistance: clamp(v.simulationDistance, 5, 32, 8),
      graphicsMode: clamp(v.graphicsMode, 0, 2, 1),
      particles: clamp(v.particles, 0, 2, 1),
      renderClouds: ['"false"', '"fast"', '"true"'].includes(v.renderClouds) ? v.renderClouds : '"fast"',
      entityShadows: !!v.entityShadows,
      ao: !!v.ao,
      biomeBlendRadius: clamp(v.biomeBlendRadius, 0, 7, 2),
      mipmapLevels: clamp(v.mipmapLevels, 0, 4, 4),
      entityDistanceScaling: clamp(v.entityDistanceScaling, 0.5, 5, 1),
      maxFps: clamp(v.maxFps, 10, 260, 260),
      enableVsync: !!v.enableVsync,
    },
  };
}

function writeOptions(profile, video) {
  const f = path.join(store.profileDir(profile.id), 'options.txt');
  if (!fs.existsSync(f)) return false;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (const [k, val] of Object.entries(video)) {
    const s = typeof val === 'boolean' ? String(val) : String(val);
    const i = lines.findIndex((l) => l.startsWith(k + ':'));
    if (i >= 0) lines[i] = `${k}:${s}`;
    else lines.splice(Math.max(1, lines.length - 1), 0, `${k}:${s}`);
  }
  fs.writeFileSync(f + '.vexbak', fs.readFileSync(f)); // one-step backup of the previous settings
  fs.writeFileSync(f, lines.join('\n'));
  return true;
}

// Applies a preset to a profile. Video settings go into options.txt now (or at the next launch if the
// profile has never been started); performance mods are installed from Modrinth.
async function apply(profileId, input, ctx) {
  const profile = store.getProfile(profileId);
  const perf = clean(input);
  const done = { video: false, mods: [], skipped: [], notes: [] };
  done.video = writeOptions(profile, perf.video);
  store.updateProfile(profile.id, { perf: { ...perf, pendingVideo: !done.video } });
  if (!done.video) done.notes.push('Video settings will be applied the next time you launch this profile (it has no settings file yet).');
  if (perf.installMods && profile.loader !== 'vanilla') {
    const want = (PRESETS[perf.preset] || PRESETS.balanced).mods.filter((m) => PERF_MODS[m].loaders.includes(profile.loader));
    const have = new Set(modrinth.installedMods(profile).map((m) => m.slug).filter(Boolean));
    for (const slug of want) {
      if (have.has(slug)) continue;
      try {
        const r = await modrinth.installMod(profile, slug, ctx);
        if (r.installed.length) done.mods.push(PERF_MODS[slug].title);
      } catch (e) { done.skipped.push(`${PERF_MODS[slug].title}: ${e.message.replace(/^Install failed: /, '')}`); }
    }
  } else if (profile.loader === 'vanilla') {
    done.notes.push('Performance mods need Fabric or NeoForge; this profile is Vanilla.');
  }
  return done;
}

// Called before every launch: memory + JVM flags, and any video settings still waiting for options.txt.
function launchOptions(profile) {
  const perf = profile.perf;
  if (!perf) return {};
  if (perf.pendingVideo && writeOptions(profile, perf.video)) store.updateProfile(profile.id, { perf: { ...perf, pendingVideo: false } });
  return { ram: perf.ram, jvmArgs: perf.jvmFlags ? JVM_FLAGS : [] };
}

module.exports = { PRESETS, PERF_MODS, JVM_FLAGS, clean, apply, launchOptions, writeOptions };
