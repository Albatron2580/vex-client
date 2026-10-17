# Vex Client architecture

Vex Client has two parts that ship together:

1. **The launcher**: an Electron app for Windows. It handles sign-in, profiles, mods, packs, themes, updates and the admin panel.
2. **The in-game mod**: a Fabric mod for Minecraft 1.21.11. It provides the Right Shift "VEX CLIENT" menu, the HUD, the modules and the shaders page. The launcher installs it into Fabric 1.21.11 profiles when "Vex look in Minecraft" is on.

```
vex-client/
├── main.js                 Electron main process: windows, IPC handlers (h('area:action', fn))
├── preload.js              the only bridge to the page: channels must match ^[a-z]+:[a-zA-Z]+$
├── lib/                    main-process modules (plain Node, unit-tested)
│   ├── store.js            settings.json / profiles.json in %APPDATA%\.vex, validated on every write
│   ├── auth.js             Microsoft → Xbox → Minecraft sign-in; tokens encrypted with safeStorage (DPAPI)
│   ├── launch.js           starts Minecraft through MCLC (Java, loaders, quick-play join, perf flags)
│   ├── modrinth.js         search / install / update mods, packs, shaders; identifies installed jars
│   ├── livemods.js         mod changes while the game runs are queued and applied when it closes
│   ├── importer.js         import from Minecraft Launcher, Modrinth App, NoRisk Client or any folder
│   ├── perf.js             performance presets (Potato, Balanced, Performance, Visual, Custom)
│   ├── vexassets.js        before launch: theme pack, config/vex-theme.json, the Vex mod + Fabric API
│   ├── server.js           Server List Ping for the featured server card
│   ├── updater.js          electron-updater + signed release manifest (Ed25519, lib/release.js)
│   ├── appstate.js         backups before updates, boot-health check, rollback
│   └── admin.js            update publishing for the listed Minecraft accounts (GitHub workflow_dispatch)
├── renderer/               the launcher UI (sandboxed page, no Node)
│   ├── themes.js           theme registry + seasons (also required by Node and by tools/make-ui-pack.py)
│   ├── core.js             V helpers: h(), modal, toasts, theme application, page registry
│   ├── fx.js / biome.js    falling-leaf effect / painted landscape background
│   └── <page>.js           one file per page: home, profiles, browse, packs, settings, updates, admin…
├── mod/                    the Fabric mod (Gradle + Loom, built in CI: .github/workflows/mod.yml)
├── tools/make-ui-pack.py   builds a Minecraft resource pack per theme (logo, buttons, panorama)
├── assets/ui-packs/        those packs, bundled with the launcher
├── scripts/                release tooling: setup-updates, release, make-manifest
└── tests/                  node tests/run.js (offline, fake servers) + Playwright UI screenshots
```

## Launcher data flow

- The page calls `V.call('area:action', …)`. preload forwards the call to `main.js`, which calls a `lib/` function and returns the result or throws a readable error.
- Settings and profiles live in `%APPDATA%\.vex`. Each profile has its own game folder, `profiles/<id>/`, containing mods, config, options.txt, saves and so on.
- `store.js` whitelists keys and validates types, so a damaged or hand-edited file can't break the app.
- Account tokens are never written in plain text. They're encrypted with Electron safeStorage, which uses DPAPI on Windows.

### Importing from other launchers (`lib/importer.js`)

- Looks in the default locations of the three sources:
  - Minecraft Launcher: `.minecraft`
  - Modrinth App: `ModrinthApp/profiles/*`
  - NoRisk Client: its instance folders
- Works out the version and loader from the instance metadata, `logs/latest.log`, or the mod jars themselves.
- Copies the parts you pick into a **new** profile: mods, packs, shaders, config, options/keybinds, servers, worlds and screenshots. The source folder is only ever read.
- Writes `vex-import.json` into the new profile. "Undo" deletes a profile only if that marker is present.
- Microsoft sign-ins are not copied. Every launcher locks its tokens to itself, so you sign in once in Vex instead.

### Performance (`lib/perf.js`)

- A preset sets four things:
  - memory (RAM)
  - optional G1GC JVM flags
  - video settings, written to `options.txt` (backed up first as `options.txt.vexbak`)
  - performance mods from Modrinth: Sodium, Lithium, FerriteCore, EntityCulling and ImmediatelyFast, limited to the ones that exist for the profile's loader
- If the profile has never been launched it has no `options.txt` yet. In that case the video settings are applied at the next launch.

## The mod (`mod/src/main/java/net/vexclient/mod`)

```
VexClientMod        entry point: Right Shift key, tick → Modules.tick, adds the "Vex Client" button
VexConfig           config/vex-client.json (menu leaves; older settings, migrated on first run)
VexTitleBackground  title/menu background: theme landscape + falling leaves (config/vex-theme.json)
module/             Module (on/off, key, settings, singleplayerOnly), Setting (Bool/Num/Color/Choice),
                    Modules registry → config/vex-modules.json
module/impl/        Zoom, Always Sprint, Fullbright, Player ESP*, Flight*   (* singleplayer / own LAN only)
hud/                HudElement, Elements (FPS, coords, position, ping, effects, armor, waypoints,
                    friends nearby), Hud → config/vex-hud.json (3 layout slots)
data/               Waypoints (per server / world / dimension), Friends, Json (atomic writes)
gui/                VexMenuScreen (Settings / Display / Shaders tabs), HudEditorScreen (drag),
                    Shaders (Iris through its public API, reflective: works without Iris), Ui (look)
mixin/              Gui (draw HUD), GameRenderer (zoom FOV), LightTexture (fullbright),
                    Minecraft (ESP glow), Screen (menu background), TitleScreen / PauseScreen (button)
```

- **Adding a module:** extend `Module`, add `Setting`s with `add(...)`, and register it in `Modules.init()`. The menu, keybinds and saving pick it up automatically.
- **Adding a HUD element:** extend `HudElement` and add it to `Hud.ELEMENTS` (and to `resetPositions`).
- **Config safety:** all mod config files are JSON, written atomically through a temp file and a move. If a broken file is found, it is copied to `*.broken` and the defaults are used.
- **Mixin safety:** mixins are `required: false` with `defaultRequire: 0`. If a Minecraft update moves a method, that one feature stops working, but the game doesn't crash.
- **Cheats:** the cheat modules check `Module.allowedHere()`, which means the integrated (singleplayer) server is running. On multiplayer servers they stay off. Fake payments and fake stats are not part of Vex Client.

## Themes

- `renderer/themes.js` defines every theme:
  - colours
  - leaf colours
  - landscape palette
  - whether it is seasonal
- **Holidays:** Halloween, Christmas and New Year, controlled by the "Seasonal themes" switch.
- **Nature seasons:** Spring, Summer and Autumn, controlled by their own switch, which is off by default. Holidays win when both apply.
- Picking a theme by hand during a season opts you out for the rest of that season only.
- The same theme is applied inside Minecraft:
  - `tools/make-ui-pack.py` builds one resource pack per theme.
  - `lib/vexassets.js` installs the active theme's pack.
  - It also writes `config/vex-theme.json`, which the mod reads for the leaves and landscape.

## Updates

- The flow is described in RELEASING.md:
  1. Pushing a tag `vX.Y.Z` (or Publish in the admin panel) runs `.github/workflows/release.yml`.
  2. That workflow builds the NSIS installer and signs `vex-release.json` with the Ed25519 key from the `VEX_UPDATE_PRIVATE_KEY` secret.
  3. It publishes the result to GitHub Releases.
- The launcher checks the manifest's signature before installing anything. It backs up your data first, and rolls back if the new version fails to start.
