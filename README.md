# Vex Client

A Minecraft: Java Edition launcher for Windows (Electron). It launches the real game, signs in with your own Microsoft account, and manages mods, modpacks, resource packs, shaders and profiles.

## Install (Windows)
**Recommended:** run `Vex-Client-Setup-X.Y.Z.exe` from the latest GitHub release (or build it with `Build Installer.bat`). The installed version updates itself.

**From source:**
1. Unzip this folder.
2. Double-click `Setup Vex Client.bat` and click Yes when Windows asks. It installs Node.js and Java 8, 17 and 21, installs the launcher's files and puts a Vex Client shortcut on your desktop.
3. Open Vex Client from the shortcut (or `Start Vex Client.bat`).
4. Account page: sign in with the Microsoft account that owns Minecraft: Java Edition, then press Launch on Home.

No Azure app registration is needed. Sign-in uses the Microsoft sign-in window from the `msmc` library; the launcher never sees your password. Sign-in tokens are encrypted with Windows (DPAPI) and tied to your Windows user.

## What it does
- **Play**: Vanilla, Fabric, Forge and NeoForge, any release or snapshot the loader supports. Picks the right Java for each version automatically. Download progress and game output are shown on Home.
- **Profiles**: separate version, loader, mods, packs, shaders, worlds and settings. Create, edit, duplicate, delete.
- **Mods / Modpacks / Resource packs / Shaders**: live Modrinth search with version, loader and category filters; one-click install with required dependencies; enable/disable/remove; update checks; `.mrpack` import; local `.jar`/`.zip` import; warnings for wrong-version or missing-dependency mods.
- **Cosmetics**: capes your Minecraft account owns can be equipped (visible to everyone). Local PNG capes are preview-only inside the launcher: Minecraft cannot load a cape from a file, so other players never see them.
- **Themes**: Vex, Halloween, Christmas, New Year, Classic, Midnight and Violet, with live previews; painted Minecraft-biome backgrounds in each theme's colours; falling leaves, snow, sparks or fireworks; automatic seasonal switching; a picture background option. Theme background images go in `renderer/themes/<theme>/background.png|jpg|webp`.
- **Mods while playing**: Minecraft loads mods only at startup, so mods installed, updated, removed or toggled while the game runs are downloaded and verified immediately and applied when it closes. The Installed mods tab shows Loaded / In this session / Pending / Restart required, plus conflicts and missing dependencies. Resource packs and shaders can be switched in-game without restarting.
- **Launcher updates**: automatic, signed and verified, with progress, release notes, skip, and rollback. They never interrupt a running game. See RELEASING.md for how to publish one.
- **Screens & logs, Settings (RAM, Java, folder, window, appearance, updates), Help (diagnostics)**.

## Not included
Quilt and OptiFine, cracked/offline play (not offered, a Microsoft account that owns the game is required), hot-loading mods into a running game (no loader supports it), emotes (need a mod that provides them; install one from the Mods page).

## Data location
`%APPDATA%\.vex`: `settings.json`, `profiles.json`, `accounts.json` (encrypted tokens), `profiles/<id>/` (that profile's game folder), shared game files, `backups/` (made before each new version runs), `launcher.log` and `updater.log`. Updates never touch this folder.

## Development
`npm install`, then `npm start`. `npm test` runs offline tests against local fake servers (mods, themes, updater, signed manifests, backups). `npm run dist` builds the Windows installer. `npm run setup-updates` and `npm run release` are described in RELEASING.md.
