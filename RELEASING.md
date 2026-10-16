# Publishing Vex Client updates

Changing the source code does **not** update anyone. A change reaches users only after you
build it, sign it and publish it as a GitHub release. The steps below do that for you.

## How updates reach users

```
you: edit code → note it in CHANGELOG.md → npm run release -- patch → git push --follow-tags
GitHub Actions (windows-latest):
   tests → electron-builder builds Vex-Client-Setup-X.Y.Z.exe + latest.yml
         → scripts/make-manifest.js writes vex-release.json and signs it with your private key
         → uploads everything to a draft release, then publishes it
every installed launcher (at start + every 4 h):
   downloads vex-release.json + .sig → checks the Ed25519 signature with the public key built into the app
   → newer? electron-updater downloads the installer in the background (resumes, never twice)
   → SHA-512 of the download must match the signed manifest → "Restart to update"
   → installs on restart, or when the launcher closes. Never while Minecraft is running.
```

User data lives in `%APPDATA%\.vex` (settings, profiles, mods, worlds, packs, capes, screenshots)
and `%APPDATA%\vex-client` (the key that protects saved sign-ins). The installer only replaces the
program folder (`%LOCALAPPDATA%\Programs\Vex Client`), so updates never touch this data.
Before a new version first runs, settings, profiles, sign-ins and each profile's mod list are
backed up to `%APPDATA%\.vex\backups` (the last 8 are kept).

## One-time setup (about 10 minutes)

1. **Create a GitHub repository** for the launcher (public, or private with releases that users
   can download; a public repo is simplest) and push this folder to it.
2. On your PC, in this folder: `npm install`, then
   `npm run setup-updates -- <your-github-name>/<repo-name>`
   This writes your repository and a **public** key into `package.json`, and creates
   `update-signing-key.pem`, the **private** key.
3. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VEX_UPDATE_PRIVATE_KEY`
   - Value: the full contents of `update-signing-key.pem` (including the BEGIN/END lines)
4. Keep `update-signing-key.pem` somewhere safe (a password manager, for example) and **never
   commit it**. `.gitignore` already excludes it. If you lose it you can't publish updates that
   existing installs will accept; they'd have to reinstall manually.
5. Commit `package.json` and push.
6. Optional: if you buy a Windows code-signing certificate, add `CSC_LINK` (the .pfx file as
   base64) and `CSC_KEY_PASSWORD` as secrets. The installer is then Authenticode-signed and
   Windows SmartScreen stops warning on first install. Updates are verified either way.

## Publishing a release

1. Write what changed under `## Unreleased` in `CHANGELOG.md`, for example:
   ```
   ## Unreleased
   ### New
   - Christmas theme snow is thicker
   ### Fixed
   - Crash when opening Shaders with no profile
   ```
2. Pick the update type and run **one** of:
   - `npm run release -- patch`: bug fixes and security fixes (1.1.0 → 1.1.1)
   - `npm run release -- minor`: new features, themes and UI changes (1.1.1 → 1.2.0)
   - `npm run release -- major`: big redesigns (1.2.0 → 2.0.0)

   Add `--critical` for an important security or compatibility fix. Users get a clear warning,
   it downloads even if they turned automatic downloads off, and it can't be skipped.
   Add `--minimum 1.2.0` to treat every version below 1.2.0 as needing this update.
   Everything else is **optional**: users can skip it or install it later.
3. `git push --follow-tags`
4. Watch the build under the repo's **Actions** tab (about 5–10 minutes). When it's green, the
   release is live and every installed launcher picks it up within 4 hours, or straight away
   when it is started or the user presses **Check for updates**.

If the build fails, nothing is published. Fix the problem, delete the tag
(`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), and run the release step again.

## Publishing from the launcher (Admin panel)

The accounts listed in `package.json` → `vexAdmins` (now HAckerbest11, RaxMc and UNCdel) see an
**Admin** entry in the sidebar. The account name is checked against the profile Minecraft's servers
return for the signed-in account, so editing a local file doesn't unlock it. Add or remove admins
by editing that list and publishing an update.

Each admin connects GitHub once (Admin → Connect GitHub) with their **own** fine-grained token:
- their GitHub account must be a collaborator on the launcher repository;
- Repository access: only that repository;
- Permissions: **Contents: Read and write**, **Actions: Read and write**.

The token is encrypted with Windows and only sent to api.github.com. Admin powers come from this
token, not from the launcher: someone who hacked the panel open would still need write access to
your repository. If the default branch is protected, allow GitHub Actions to push to it (or the
"Prepare version" step can't commit the version bump).

In the panel:
- **Publish an update**: pick Patch / Minor / Major, optionally Critical and a minimum version,
  write the notes (with preview) and press Publish. This starts the same GitHub Actions workflow
  as `npm run release`. It bumps the version, writes CHANGELOG.md, tags, builds, signs and publishes.
- **Build**: live steps of the running build, with a link to the full log on GitHub.
- **Releases**: downloads per release, which one is live, **Pause** (stops launchers that haven't
  updated yet from getting it, and the previous release becomes live again) and **Resume**.

## Getting the first installed version onto PCs

Auto-update works in the **installed** app. Copies started with `Start Vex Client.bat` run from
source; they can check for updates but can't install them.
- After your first release: download `Vex-Client-Setup-X.Y.Z.exe` from the GitHub release and run it.
- Or build one locally: double-click `Build Installer.bat` and run the file it puts in `dist`.

Saved sign-ins, settings, profiles and worlds carry over from the source version to the installed one.

## If an update goes wrong

- **Broken release:** publish a fixed patch release (optionally `--critical`). Launchers that can
  still start will pick it up.
- **A version that won't start:** if a new version fails to start twice in a row, the launcher
  offers to reinstall the last version that worked on that PC (downloaded and verified like any
  update), or to restore the settings backup made before the update.
- **Manual rollback:** Settings → Launcher updates → *Reinstall X.Y.Z*.
- **Logs:** `%APPDATA%\.vex\updater.log` and `%APPDATA%\.vex\launcher.log`.

## Testing an update end to end (do this once, on Windows)

1. Release `1.1.0` as above and install it from the release page.
2. Make a small visible change, add a changelog line, `npm run release -- patch`, push.
3. In the installed 1.1.0 press **Check for updates**. You should see 1.1.1, its notes and
   download progress, then "downloaded and verified".
4. Start Minecraft and check that "Restart to update" is disabled while it runs. Close the game,
   press Restart, and confirm the app restarts on 1.1.1 with your theme, sign-in, profiles and mods
   unchanged, and with a new folder in `%APPDATA%\.vex\backups`.
5. Unplug the network during a download and confirm it reports an error, then finishes on the next check.
