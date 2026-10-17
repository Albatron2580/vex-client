// Mocked backend for the UI tests: replaces window.vex so the renderer runs in a plain browser.
const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAAABJRU5ErkJggg==';

function mock(signedIn, opts = {}) {
  return `(() => {
  const PIX = ${JSON.stringify(PIX)};
  const profiles = [{ id: 'p1', name: 'Default', version: '1.21.1', loader: 'fabric', loaderVersion: '0.16.9', modCount: 2, lastPlayed: 0 }, { id: 'p2', name: 'Survival', version: '1.20.1', loader: 'forge', loaderVersion: '47.3.0', modCount: 0, lastPlayed: Date.now() - 86400000 }];
  const settings = { gameRoot: '', selectedProfile: 'p1', activeAccount: ${signedIn ? "'u1'" : "''"}, ram: 4, javaPath: '', theme: ${JSON.stringify(opts.theme || 'vex')}, accent: '', seasonalThemes: ${opts.seasonal ? 'true' : 'false'}, seasonOptOut: '', themeEffects: true, autoCheckUpdates: true, autoDownloadUpdates: true, skippedUpdate: '', width: 1280, height: 720, windowMode: 'windowed', modUpdates: 'notify', activeCape: '' };
  const hit = (i) => ({ id: 'P' + i, slug: 'mod-' + i, title: 'Example Mod ' + i, description: 'A description of this project that goes on for a bit to test wrapping behaviour.', author: 'someone', downloads: 123456 * i, icon: '', categories: ['utility'], loaders: ['fabric'], type: 'mod' });
  const handlers = {
    'settings:get': () => settings,
    'settings:save': (p) => Object.assign(settings, p),
    'app:info': () => ({ version: '1.0.0', electron: '31', node: '20', platform: 'Windows_NT 10 x64', baseDir: 'C:\\\\Users\\\\x\\\\AppData\\\\Roaming\\\\.vex', gameRoot: 'C:\\\\Users\\\\x\\\\AppData\\\\Roaming\\\\.vex', totalMemGb: 16, admins: ['HAckerbest11', 'RaxMc', 'UNCdel'] }),
    'accounts:status': () => ({ secureStorage: true, accounts: ${signedIn ? `[{ uuid: 'u1', name: ${JSON.stringify(opts.user || 'Steve')}, active: true, needsLogin: false }]` : '[]'} }),
    'accounts:skin': () => null,
    'profiles:list': () => ({ profiles, selected: 'p1' }),
    'game:state': () => (${opts.running ? "{ state: 'running', profileId: 'p1' }" : "{ state: 'idle', profileId: '' }"}),
    'news:list': () => [{ title: 'Minecraft news', text: 'Something happened.', image: '', link: 'https://minecraft.net', date: '2026-01-01' }],
    'versions:list': () => ({ latest: { release: '1.21.1', snapshot: '1.21.1' }, versions: [{ id: '1.21.1', type: 'release' }, { id: '1.20.1', type: 'release' }] }),
    'loaders:choices': () => [{ value: '0.16.9', label: '0.16.9' }],
    'mods:search': () => ({ total: 3, offset: 0, hits: [hit(1), hit(2), hit(3)] }),
    'mods:categories': () => ['utility', 'adventure'],
    'mods:installed': () => [{ file: 'a.jar', name: 'A Mod', version: '1.0', enabled: true, title: 'A Mod', icon: '', issues: [] }],
    'mods:checkUpdates': () => [],
    'mods:status': () => ({ running: ${opts.running ? 'true' : 'false'}, confirmed: true, pending: 1, support: { mods: false, modsReason: 'Fabric loads mods only when Minecraft starts.', resourcePacks: true, shaders: true },
      mods: [{ file: 'a.jar', enabled: true, size: 1000, title: 'A Mod', version: '1.0', icon: '', issues: [], source: 'modrinth', status: ${opts.running ? "'loaded'" : "'installed'"}, pendingId: '', error: '', updateQueued: '' },
             { file: 'b.jar', enabled: true, size: 0, title: 'B Mod', version: '2.0', icon: '', issues: [], source: 'modrinth', status: 'pending-install', pendingId: 'x1', error: '', updateQueued: '' },
             { file: 'c.jar.disabled', enabled: false, size: 2000, title: 'C Mod', version: '', icon: '', issues: ['Needs "fabric-api", which is not installed.'], source: 'manual', status: 'disabled', pendingId: '', error: '', updateQueued: '' }] }),
    'themes:assets': () => (${JSON.stringify(opts.assets || {})}),
    'updater:state': () => (${JSON.stringify(opts.updater || null)} || { supported: true, configured: true, current: '1.1.0', status: 'idle', latest: null, progress: null, error: '', lastCheck: Date.now() - 600000, history: [] }),
    'updater:check': () => ({ status: 'up-to-date' }),
    'app:ready': () => null,
    'import:scan': () => ({ parts: { mods: { label: 'Mods', default: true }, options: { label: 'Game settings & keybinds', default: true }, saves: { label: 'Worlds', default: false } },
      groups: [{ id: 'minecraft', label: 'Minecraft Launcher', items: [{ source: 'minecraft', name: 'Fabric 1.21.11', path: 'C:/Users/you/AppData/Roaming/.minecraft', version: '1.21.11', loader: 'fabric', modCount: 23, parts: { mods: { count: 23 }, options: { count: 1 }, saves: { count: 4, size: 380000000 } } }] },
        { id: 'modrinth', label: 'Modrinth App', items: [{ source: 'modrinth', name: 'PvP Pack', path: 'C:/Users/you/AppData/Roaming/ModrinthApp/profiles/PvP Pack', version: '1.21.4', loader: 'fabric', modCount: 41, guessed: true, parts: { mods: { count: 41 }, options: { count: 1 } } }] },
        { id: 'norisk', label: 'NoRisk Client', items: [] }] }),
    'perf:presets': () => ({ totalMemGb: 16, mods: { sodium: { title: 'Sodium', loaders: ['fabric'], what: 'x' }, lithium: { title: 'Lithium', loaders: ['fabric'], what: 'x' } },
      presets: { potato: { label: 'Potato', desc: 'Lowest settings', ram: 3, mods: ['sodium'], video: { renderDistance: 6, simulationDistance: 5, graphicsMode: 0, particles: 2, renderClouds: '"false"', maxFps: 120 } },
        balanced: { label: 'Balanced', desc: 'Good looks', ram: 4, mods: ['sodium', 'lithium'], video: { renderDistance: 12, simulationDistance: 8, graphicsMode: 1, particles: 1, renderClouds: '"fast"', maxFps: 260 } } } }),
    'server:info': () => ({ name: 'VexVanilla', host: 'vexvanilla.net', port: 25565, region: 'EU', discord: 'https://discord.gg/VexVanilla' }),
    'server:status': () => ({ online: true, players: { online: 67, max: 1000 }, version: 'Velocity 1.8-1.21.x', latency: 38, icon: '',
      motd: [{ text: '★ ', color: 'gold' }, { text: 'VEX VANILLA', color: 'gold', bold: true }, { text: ' ★ ', color: 'gold' }, { text: '▶ ', color: 'dark_gray' }, { text: '.gg/VexVanilla', color: 'gold' }, { text: '\\n' }, { text: '✷ NEW SEASON OUT ', color: 'yellow', bold: true }, { text: 'JOIN NOW', color: 'green', bold: true }] }),
    'admin:status': () => (${JSON.stringify(opts.adminStatus || {"name": "HAckerbest11", "repo": "lyano/vex-client", "github": {"login": "hackerbest", "repo": "lyano/vex-client", "canPush": true, "branch": "main"}, "secure": true, "version": "1.1.0"})}),
    'admin:overview': () => ({ latest: '1.1.0', totalDownloads: 1843, releases: [
      { id: 3, tag: 'v1.1.0', version: '1.1.0', date: '2026-10-16T12:00:00Z', draft: false, prerelease: false, latest: true, url: 'https://github.com/x/y', downloads: 1204, critical: false, signed: true, notes: '' },
      { id: 2, tag: 'v1.0.1', version: '1.0.1', date: '2026-10-02T12:00:00Z', draft: false, prerelease: false, latest: false, url: 'https://github.com/x/y', downloads: 512, critical: true, signed: true, notes: '' },
      { id: 1, tag: 'v1.0.0', version: '1.0.0', date: '2026-09-20T12:00:00Z', draft: false, prerelease: true, latest: false, url: 'https://github.com/x/y', downloads: 127, critical: false, signed: true, notes: '' }],
      builds: [{ id: 99, title: 'Release v1.1.1', status: 'in_progress', conclusion: null, event: 'workflow_dispatch', date: new Date(Date.now() - 180000).toISOString(), url: 'https://github.com/x/y', actor: 'hackerbest' },
               { id: 98, title: 'Release v1.1.0', status: 'completed', conclusion: 'success', event: 'workflow_dispatch', date: '2026-10-16T11:50:00Z', url: 'https://github.com/x/y', actor: 'raxmc' }] }),
    'admin:build': () => ({ id: 99, status: 'in_progress', conclusion: null, url: 'https://github.com/x/y', title: 'Release v1.1.1', steps: [
      { name: 'Run actions/checkout@v4', status: 'completed', conclusion: 'success' }, { name: 'Prepare version (Admin panel)', status: 'completed', conclusion: 'success' },
      { name: 'Install', status: 'completed', conclusion: 'success' }, { name: 'Test', status: 'completed', conclusion: 'success' }, { name: 'Build installer', status: 'in_progress', conclusion: null },
      { name: 'Sign release manifest', status: 'queued', conclusion: null }, { name: 'Publish GitHub release', status: 'queued', conclusion: null }] }),
    'packs:list': () => ({ packs: [], packFormat: 34, canEnable: true }),
    'cape:list': () => [], 'cape:mojang': () => [],
    'media:screenshots': () => [], 'media:logs': () => [{ id: 'launcher', name: 'Launcher log', size: 10 }], 'media:readLog': () => 'log line',
    'java:detect': () => [{ major: 21, version: '21.0.1', exe: 'C:\\\\Java\\\\bin\\\\java.exe' }],
    'diag:run': () => ({ checks: [{ name: 'Java', ok: true, detail: 'ok' }], report: 'r' }),
    'modpacks:versions': () => [],
  };
  window.__calls = [];
  window.vex = {
    call: async (ch, ...a) => { window.__calls.push(ch); if (!(ch in handlers)) { console.warn('UNMOCKED ' + ch); return ch.endsWith('list') ? [] : null; } return handlers[ch](...a); },
    onEvent: () => {},
  };
})();`;
}

module.exports = { mock };
