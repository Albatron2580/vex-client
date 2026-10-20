# Changelog

## 2.2.0 — 2026-10-20
- **Minecraft Logs window** opens when the game starts: live log with warnings/errors coloured, filter, copy, stop game. Closing it doesn't stop Minecraft. Reopen it from the Play bar or Settings → Game.
- **Instances** are now rows like the Modrinth app: version, loader version, last played, **PLAY**, **MODS** and a settings menu.
- **Mods** window per instance: names and icons from Modrinth, turn mods on/off, remove, add .jar files.
- **Admin** shows as soon as you use an admin Minecraft account, with clear steps for what's still needed for the online parts.
- Friends shows how far the online setup got, with **Continue setup**; clearer steps for registering VEX on Modrinth.
- New app icon: a plain grey V.

## 2.1.0 — 2026-10-20
- **Play works:** sign in with Microsoft and launch Minecraft. VEX downloads the game, Java and Fabric/Forge/NeoForge for you.
- **Several accounts:** add as many Microsoft accounts as you like and switch from the account menu (bottom left). Your real skin shows next to each one.
- **Collab:** send an instance to a friend — same version, loader and Modrinth mods — and install theirs with one click.
- **News & featured server** on Home, with live player count and a Join button that launches straight into the server.
- **Report a bug** from Settings → Diagnostics.
- **Admin panel** for VEX admins: announcements, featured server, players (ban/unban), bug reports, and publishing updates.
- Game settings: window size, fullscreen, game log.
- The online service gets an update for these features: Settings → Friends account → Update online service.

## 2.0.1 — 2026-10-20
- Pop-up windows (like the online setup) are always centred now, even inside blurred panels.
- Typing in a pop-up no longer jumps back to the first box while the setup is running.
- Clearer steps for picking your Cloudflare workers.dev name.

## 2.0.0 — 2026-10-20
VEX CLIENT rebuilt from the ground up (the 1.2.0 launcher lives on the `legacy-1.2.0` branch).
- New look: themes and theme editor, sectioned sidebar, floating Play bar, cursor trails, petals.
- Features: Custom Totem, Skin Lookup and skin library, Crosshair Designer, Custom Sky (Aurora preset).
- Instances with import from Modrinth App, CurseForge, Prism, MultiMC and the normal launcher.
- Sign in with Modrinth, Friends (search, requests, online status) and an in-app online service setup.
- Automatic updates from GitHub releases, verified with SHA-256, with a "Restart now" prompt.
- Not yet: launching Minecraft (Microsoft sign-in + game install) — coming next.
