# Changelog

Write what changed under "Unreleased", then run `npm run release -- patch|minor|major`.
Add `[critical]` behaviour with `--critical`. See RELEASING.md.

## Unreleased (1.2.0)
- Tested for real: every build now starts the actual launcher and the actual game (Fabric 1.21.11) on GitHub and checks them.
- Java is downloaded automatically (Mojang's own runtime) when your PC doesn't have the right version.
- More FPS: Sodium, Lithium, FerriteCore, EntityCulling and ImmediatelyFast are added on a modded profile's first launch (once), tuned Java flags by default, no costly blur effects in the launcher.
- The Vex look (logo, buttons) is on from the very first launch of a new profile.
- Redesigned Right Shift menu: switches, sliders, colour swatches, scrolling, wrapped text; HUD elements never overlap; styled HUD editor.
- Fixed: Mods page crash on second visit, theme previews, sign-in card covering the server card, Vex button position on the title screen and pause menu.
- Import from Minecraft Launcher, Modrinth App and NoRisk Client (mods, packs, shaders, settings, keybinds, servers, worlds) into a new profile, with Undo.
- Performance presets per profile: Potato, Balanced, Performance, Visual, Custom (RAM, Java flags, video settings, Sodium/Lithium/FerriteCore/EntityCulling/ImmediatelyFast).
- Spring, Summer and Autumn themes (own switch, off by default).
- In-game mod 1.2.0: Right Shift "VEX CLIENT" menu with Settings / Display / Shaders, movable HUD with 3 layouts, waypoints, friends, keybinds, fullbright, Iris shader controls, singleplayer-only Player ESP and Flight.

## Unreleased

## 1.1.0 - 2026-10-16

### New
- Themes: Vex, Halloween, Christmas and New Year, plus Classic, Midnight and Violet, with live previews.
- Painted Minecraft-biome backgrounds in each theme's colours; falling leaves for Halloween, snow for Christmas, fireworks for New Year.
- Automatic seasonal themes (Halloween 1–31 Oct, Christmas 1–26 Dec, New Year 27 Dec–3 Jan).
- Installed Mods: statuses (loaded, in this session, pending, restart required), conflict and missing-dependency checks.
- Mods installed while Minecraft runs are downloaded and verified right away and added when the game closes.
- Automatic launcher updates with signed releases, progress, release notes, skip and rollback.

## 1.0.0

- First release.
