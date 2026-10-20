# Shared configuration

Files here are the contract between the **launcher** and the **in-game client** (Fabric mod, Stage 5). Neither side reads the other's code — only these documented formats.

## `themes.json` / `theme.schema.json`
The six built-in presets (Sakura, Rose, Sunflower, Lavender, Cornflower, Snowdrop). A theme is:

| Field | Type | Meaning |
|---|---|---|
| `id` | string `^[a-z0-9-]{1,40}$` | Stable identifier |
| `name` | string ≤ 40 | Display name |
| `accent`, `accent2` | `#rrggbb` | Accent and second gradient stop |
| `background`, `panel`, `border`, `text` | `#rrggbb` | Surface colours |
| `opacity` | 0.3 – 1 | Panel opacity |
| `glow` | 0 – 1 | Glow intensity |
| `radius` | 0 – 28 (int) | Corner radius, px |

**Export format** (Settings → Theme → Export): `{ "schemaVersion": 1, "theme": { …theme } }`. Import also accepts a bare theme object. Invalid colours are rejected; out-of-range numbers are clamped.

## Launcher `settings.json`
Stored in the launcher's data folder (`%APPDATA%\VEX CLIENT\settings.json` on Windows). Current `schemaVersion` is **2**. Every read and write passes through `validateSettings()` (`launcher/electron/shared/settingsModel.ts`): unknown fields are dropped, invalid values fall back to defaults, and older versions are migrated (v1 → v2 renamed `theme` → `themeId` and added `crosshairs`). Writes are atomic (temp file + rename) and the previous copy is kept as `settings.json.bak`.

Settings never contain passwords or sign-in tokens. From Stage 4, Microsoft tokens will be stored with Electron `safeStorage` (Windows DPAPI), not in this file.

## `instances.json`
Array of instances `{ id, name, version, loader: "vanilla"|"fabric"|"forge", gameDir, memoryMb (1024–32768), jvmArgs, createdAt, lastPlayed, installed }`. `installed` is only ever set true by the installer after verifying files (Stage 4).
