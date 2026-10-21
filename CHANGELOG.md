# Changelog

## 2.6.2 — 2026-10-21
- **Fix: mods from NoRisk Client weren't imported.** NoRisk doesn't keep your mods in the instance folder: it keeps them in one shared cache and loads them when the game starts. VEX now reads NoRisk's own mod list for each profile and copies those mods from its cache.
- VEX also reads changes the NoRisk Client and Modrinth apps haven't saved to their main database file yet, so recent mods and profiles show up even while those apps are open.
- Already imported an empty NoRisk instance? Open it in Instances → **Mods** → **Copy from launcher** and pick the NoRisk profile.

## 2.6.1 — 2026-10-21
- Fixed importing from NoRisk Client (EPERM symlink error): VEX now copies the real files behind linked folders. If one part can't be copied, the rest still imports and VEX says what was skipped.

## 2.6.1 — 2026-10-21
- **Fix: importing from NoRisk Client failed with "EPERM: operation not permitted, symlink".** NoRisk shares folders like resourcepacks with .minecraft through links, and Windows only lets admins make links. VEX now copies the real files those links point to.
- If one part of an import can't be copied, the rest still imports and VEX tells you what was skipped, instead of cancelling everything.

## 2.6.0 — 2026-10-21
- New look for the whole launcher: calm solid surfaces, a new headline font and no more all-caps labels.
- The Play button has pixel corners and presses down like a key; icons sit in inventory-style slots.
- New Home with your instance front and centre, Jump back in and a clear status list.
- In game, the VEX menu pages get the same inventory look.

## 2.6.0 — 2026-10-21
- **New look for the whole launcher.** Solid, calm surfaces instead of glass and glow; new headline font (Bricolage Grotesque); no more shouty all-caps labels.
- A Minecraft touch where it counts: the **Play** button has pixel corners and presses down like a key, and instance icons, heads and mod icons sit in inventory-style slots.
- **New Home:** your instance big and front, Play next to it, then "Jump back in" and a clear status list.
- Cleaner sidebar, buttons, switches, sliders, menus and the Minecraft Logs window.
- In game, the VEX menu pages get the same inventory bevel (mod 1.6.0, downloaded automatically).

## 2.5.0 — 2026-10-21
- VEX online sign-in fixed: VEX proves your account with Minecraft's own signed key, so the VEX server never needs to reach Mojang. Your online service updates itself.
- New Mods page (replaces Discover): add mods, shaders and resource packs from Modrinth to any instance in one click.
- Account menu no longer cut off; calmer, cleaner look.

## 2.5.0 — 2026-10-21
- **VEX online sign-in fixed for real.** The VEX server can't talk to Mojang from Cloudflare, so it no longer has to: VEX proves your account with Minecraft's own signed key (the one used for signed chat), and the server checks Mojang's signature itself. Your online service updates itself.
- Admins are matched by Minecraft UUID, so renaming can't fake an admin.
- **Mods** (replaces Discover): search Modrinth for mods, shaders and resource packs and add them to an instance in one click, with everything they need.
- The account menu no longer gets cut off, and VEX online in it shows who you're connected as (click to connect).
- Calmer look: less glow, flatter cards, fewer filler texts, no "Shop — Soon" placeholder. Home shows your instance, VEX online and update status.

## 2.4.2 — 2026-10-21
- Fixed "Mojang didn't accept that Minecraft sign-in": VEX online now checks your account through Mojang's session server, like Minecraft servers do (your online service updates itself).
- The big Connect button is gone: VEX connects by itself.
- Update alerts: a Windows notification and a what's-new message when VEX updates.

## 2.4.2 — 2026-10-21
- **Fix: "Mojang didn't accept that Minecraft sign-in".** VEX online now signs you in the way Minecraft servers check players: your PC tells Mojang, and the VEX server asks Mojang. Your Minecraft token never goes to the VEX server. Your online service updates itself for this.
- The big "Connect as…" button is gone: VEX connects by itself and only shows a small message with **Try again** if something's wrong.
- **Update alerts:** when an update is downloaded you get a Windows notification and a banner in VEX with what's new; after restarting, VEX shows **"VEX updated to …"** with the changes. VEX now checks for updates every 30 minutes.

## 2.4.1 — 2026-10-20
- Glass-circle Right Shift menu. VEX online: updates your online service by itself when it's too old and connects when done; always says why sign-in failed.

## 2.4.1 — 2026-10-20
- **Right Shift menu** redone as see-through glass circles around your face. Click your face for every module on one page; just type to search.
- **"Couldn't connect to VEX online" fixed for good:** when your online service is older than VEX and was set up on this PC, VEX updates it by itself in the background and connects when it's done. Otherwise it tells you exactly why.
- The "online service can be updated" notice no longer sticks around after updating.

## 2.4.0 — 2026-10-20
- VEX in Minecraft: the launcher adds the VEX mod + Fabric API to Fabric 1.21.11 instances. Right Shift opens the petal menu (Client, Settings, Misc, Mod Menu, Combat) with search, GUI Settings, themes, combat HUD (addons only), and the grey V badge.

## 2.4.0 — 2026-10-20
- **VEX in Minecraft.** VEX now adds its in-game mod (and Fabric API) to your Fabric 1.21.11 instances before they start. Turn it off in Settings → Game.
- **Right Shift opens the VEX menu:** five petals around your head and name (Client, Settings, Misc, **Mod Menu**, Combat) and a search bar for every module and setting. Just start typing.
- **GUI Settings:** Show Particles, Background Dim, Tooltips, Always Show Advanced, Edit HUD Layout, Notification Sound, Themes (Sakura, Vex, Aurora, Midnight, Mono), GUI Scale (Auto/1x/2x/3x), Auto Switch Profiles.
- **Combat** (addons only, no hacks): CPS, reach display, combo counter, armor and a low health warning. Flight and player outlines are gone.
- **Grey V badge** in the tab list and above the heads of other VEX players, so people can see you play with VEX. Needs the online service update (Settings → VEX online).
- The game window, title screen and HUD say **VEX CLIENT**.

## 2.3.2 — 2026-10-20
- Copy mods from another launcher (Modrinth App, NoRisk Client, Minecraft Launcher, CurseForge, Prism) into any instance: Instances → MODS → Copy from launcher. NoRisk Client profiles also show up in Import.

## 2.3.2 — 2026-10-20
- **Copy mods from another launcher** into any instance: Instances → MODS → **Copy from launcher**. Works with the Modrinth App, **NoRisk Client**, the normal Minecraft Launcher, CurseForge and Prism/MultiMC. Mods already in the instance are skipped; nothing in the other launcher is changed.
- **NoRisk Client** profiles now also show up in Import.
- Mods kept in version subfolders (like NoRisk's `nrc-…` folders) are copied as normal mods so Fabric loads them.

## 2.3.1 — 2026-10-20
- Fix: the Friends page now says why VEX online couldn't connect, and offers Update online service when your service is outdated.

## 2.3.1 — 2026-10-20
- **Fix:** "Couldn't connect to VEX online" now says *why*. When your online service is older than VEX (the usual cause after 2.3.0), the **Update online service** button shows right there on the Friends page.
- Online service 2.2.0 (needed for the upcoming in-game V badge).

## 2.3.0 — 2026-10-20
- **No more Modrinth registration.** VEX online signs you in with the Minecraft account you already play with (checked with Mojang). The "Connect Modrinth sign-in" step is gone everywhere.
- **Login check:** VEX connects to VEX online by itself and follows whichever Microsoft account is active. Signed out? You get the login screen.
- Friends and Collab use Minecraft names and show real skin faces.
- The **Minecraft Logs** window now has VEX's own look and follows your theme.
- Update your online service once for this: Settings → VEX online → Update online service (or finish the setup).

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
