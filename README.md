# VEX CLIENT — Play Different

A Minecraft launcher (Electron + React + TypeScript) and, from Stage 5, an in-game client (Fabric mod).

```
vex-client/
├─ launcher/                  Desktop launcher
│  ├─ electron/               Main process: windows, files, Mojang APIs, storage, logging
│  │  ├─ main.ts, preload.ts  Secure window + the only UI↔system bridge (contextIsolation, sandbox)
│  │  ├─ ipc/                 skins, skinLibrary, versions, jsonStore, logger, paths
│  │  └─ shared/              settingsModel.ts — validation & migration used by both sides
│  ├─ src/
│  │  ├─ styles/              tokens.css (design tokens) + base.css (component styles)
│  │  ├─ components/          Sidebar, Card, Toggle, Slider, Select, Segmented, SearchBar, Tooltip,
│  │  │                       Modal, Toasts, Progress, ColorPicker, PixelImage, Particles, Logo, Icon
│  │  ├─ features/            totem/, skinLookup/, crosshair/ (Stage 3 tools)
│  │  ├─ pages/               Home, Instances, Discover, Skins, Features, Friends, Shop, Settings
│  │  ├─ lib/                 png encoder, pixels, pack formats, resource-pack builder, theme, i18n
│  │  └─ state/               App state, settings persistence, toasts
│  └─ tests/                  Vitest unit tests
├─ mod/                       Fabric in-game mod (built by .github/workflows/mod.yml)
├─ server/                    VEX online service (Cloudflare Worker + D1): Modrinth sign-in, friends
└─ shared/                    Theme presets + JSON schema shared with the in-game client
```

## Run it (Windows)

Requires **Node.js 20+** (22 LTS recommended).

```powershell
cd vex-client\launcher
npm install
npm run dev          # launcher with hot reload
npm test             # unit tests
npm run typecheck
```

## Build an installer

```powershell
npm run dist         # → launcher\release\VEX-CLIENT-Setup-2.0.0.exe  (needs NSIS: winget install NSIS.NSIS)
```
The installer is per-user (no admin prompt) and puts a **VEX CLIENT icon on the desktop** and in the Start menu. Uninstall from Windows Settings → Apps; your settings, instances and skins in `%APPDATA%\VEX CLIENT` are kept.

`installer/vex-installer.nsi` is an alternative hand-written installer with the same behaviour, used when building on Linux without 32-bit Wine.
`npm run dist:dir` builds an unpacked app without an installer (quicker to test). See **Publishing an update** below for automatic updates.

## What works now (Stages 1–3)

| Area | Status |
|---|---|
| Design system | Tokens, 6 theme presets, custom themes with live preview, import/export JSON, glass panels, glow, animated petals, reduced/off animation modes, UI scale |
| Navigation & shell | Frameless window with custom title bar, sidebar with animated active state, toasts, modals, keyboard focus styles |
| Settings | Persisted, validated, migrated; folders, startup (open at login), notifications, verbose logging, open logs, reset to defaults |
| Instances | Create / edit / delete (optionally with files), real Mojang version list (cached for offline), loader choice, memory capped at 75 % of RAM, custom folder, JVM args |
| **Skin Lookup** | Mojang's official public API, slim/classic detection, cape detection, front-view preview, download PNG, save to library, send to totem; invalid / not-found / rate-limited / network states |
| **Skin library** | Import PNG, validate 64×64 / 64×32, preview, download, remove |
| **Custom Totem** | Classic / Arms Out / Big Head from a username or file, 64×32 legacy skins, slim arms; real resource pack (1.20 → 26.3 formats, `min_format`/`max_format` for 1.21.9+), install into an instance's `resourcepacks` or save as ZIP, progress |
| **Custom Sky** | Any image (or the built-in Aurora preset) → seamless 6-face sky in OptiFine format; horizon line, night-only, rotate; install/ZIP. Needs Nuit + Nuit Interop (Fabric/NeoForge) or OptiFine in game |
| **Import** | Instances → Import: finds Modrinth App, CurseForge, Prism, MultiMC and normal-launcher installs; copies mods, configs, game settings/keybinds/servers, resource & shader packs and (optionally) worlds into a new instance. Source folders are only read, never changed |
| **Friends & Modrinth sign-in** | Sign in with Modrinth (browser login, nothing pasted), search players, send/accept/decline requests, see who's online/playing. Needs the VEX online service: click **Set up online service** in Friends (or Settings → Account) and VEX deploys it to your free Cloudflare account for you |
| **Auto-update** | Checks GitHub releases, downloads in the background, verifies SHA-256, then asks to restart. Push a `v*.*.*` tag and `.github/workflows/release.yml` builds and publishes the release |
| **Cursor trail** | Sakura petals, aurora, cyan light, stardust, soft, minimal; length, density, opacity, speed, size, glow, colour, performance mode |
| **Layout** | Sectioned, collapsible sidebar with account box; floating instance switcher + Play bar |
| **Shortcuts** | Installer adds Desktop + Start menu icons; toggle them in Settings, or “Add to desktop” on Home |
| **Crosshair Designer** | 15×15 pixel editor (draw/erase/right-click erase, 4 mirror modes, keyboard painting), palette + custom colour, 8 presets, arm length / thickness / gap / outline / dot, day & night preview with vanilla blending simulation, save/load designs, PNG export, resource pack install/ZIP (1.20.2+), in-app instructions |

## Not yet — clearly labelled in the app

- **Online service:** until it's set up, Friends shows a **Set up online service** button. The in-app wizard (or `server/Set up VEX online.bat`) deploys it.
- **Stage 4:** Microsoft sign-in (official OAuth device/browser flow), downloading game files from Mojang, Java runtime, Fabric/Forge install, **Play**. The Play button is disabled until this exists; it never fakes a launch.
- **Applying a skin** to your account needs Microsoft sign-in (Stage 4).
- **Stage 5:** In-game radial menu, GUI settings, theme editor and module manager (Fabric mod). Combat module names from the brief will appear as clearly marked placeholders — automation that gives an unfair advantage (auto crystal, anchor macro, auto totem, etc.) is banned on most servers and won't be implemented.
- **Stage 6:** Launcher ↔ client config sync via `shared/`.
- **Friends & Shop** need an online VEX service; both pages explain this instead of showing fake data.
- Dutch translation covers navigation only so far.

## Publishing an update
1. Bump `version` in `launcher/package.json` (e.g. 2.0.1) and commit to `main`.
2. `git tag v2.0.1 && git push origin main --tags` — or on GitHub: **Actions → Release → Run workflow**.
3. GitHub Actions tests, builds `VEX-CLIENT-Setup-2.0.1.exe` + its `.sha256`, and publishes the release.
4. Every installed VEX CLIENT notices within a few hours (or Settings → Updates → Check now), downloads it in the background, checks the SHA-256, and shows **Restart now**. Settings, instances and skins are kept.

The previous launcher (Vex Client 1.2.0) is kept on the `legacy-1.2.0` branch.

## Notes
- Custom crosshairs need **1.20.2+** (vanilla moved the crosshair into its own sprite then). Vanilla inverts crosshair colours; pure black pixels are invisible there.
- Skin lookups use `api.mojang.com` and `sessionserver.mojang.com` only. No passwords or tokens are requested.
- Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
