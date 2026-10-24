import { useEffect, useRef, useState } from "react";
import { Card, ColorPicker, Field, Modal, Notice, Segmented, Select, Slider, ToggleRow, Tooltip } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { PRESET_THEMES, applyTheme, resolveTheme, exportTheme, importTheme } from "../lib/theme";
import { LANGUAGES } from "../lib/i18n";
import { vex, errMsg } from "../lib/bridge";
import { DEFAULT_SETTINGS, DEFAULT_TRAIL, type ThemeDef, type TrailSettings, type TrailStyle } from "../../electron/shared/settingsModel";
import type { ShortcutStatus, GameSettings } from "../vex";
import { McHead } from "../components/McHead";
import { useUpdateState } from "../components/UpdateBanner";
import { SignInCard } from "./Friends";
import { ServiceUpdate } from "../components/ServiceUpdate";
import { PhoneCard } from "../features/PhoneCard";
import { Avatar } from "../components/Shell";
import { isServiceUrl } from "../../electron/shared/settingsModel";

function BugReport({ onClose }: { onClose(): void }) {
  const { toast, account } = useApp();
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await window.vex!.online.reportBug(title, body); toast("success", "Bug report sent", "Thanks! The VEX admins will look at it."); onClose(); }
    catch (e) { toast("error", "Couldn't send the report", errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Report a bug" onClose={onClose}>
      {!account?.signedIn ? <SignInCard compact /> : (
        <div className="stack">
          <Field label="What went wrong?">{(id) => <input id={id} className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crosshair pack doesn't show in 1.21.11" />}</Field>
          <Field label="Details" hint="What did you do, what happened, what did you expect? Your VEX version is added automatically.">{(id) => <textarea id={id} className="input" style={{ height: 130, padding: 10, resize: "vertical" }} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || title.trim().length < 4 || body.trim().length < 10} onClick={send}>{busy ? <span className="spinner" /> : <Icon name="bug" size={15} />}Send report</button></div>
        </div>)}
    </Modal>
  );
}

function MicrosoftCard() {
  const { ms, refreshMs, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await window.vex!.ms.add(); toast("success", "Microsoft account added"); }
    catch (e) { toast("error", "Microsoft sign-in didn't finish", errMsg(e)); }
    finally { setBusy(false); refreshMs(); }
  };
  return (
    <Card title="Minecraft accounts" icon="user" sub="Microsoft accounts that own Minecraft: Java Edition. Needed to play. Add as many as you like.">
      <div className="stack" style={{ gap: 4 }}>
        {ms?.accounts.length ? ms.accounts.map((a) => (
          <div key={a.uuid} className={`list-item ${a.active ? "selected" : ""}`}>
            <McHead uuid={a.uuid} name={a.name} size={36} />
            <div style={{ flex: 1 }}><b className="small">{a.name}</b>
              <div className="tiny faint">{a.needsLogin ? <span style={{ color: "var(--warn)" }}>Sign-in expired — remove and add again</span> : a.active ? "Used when you press Play" : "Microsoft account"}</div></div>
            {!a.active && <button className="btn sm" onClick={async () => { await window.vex!.ms.setActive(a.uuid); refreshMs(); }}>Use</button>}
            <button className="btn ghost sm danger" aria-label={`Sign out ${a.name}`} onClick={async () => { await window.vex!.ms.signOut(a.uuid); refreshMs(); toast("info", `Signed out ${a.name}`); }}><Icon name="trash" size={14} /></button>
          </div>
        )) : <p className="small faint">No Microsoft accounts yet.</p>}
        <button className="btn primary" style={{ alignSelf: "flex-start", marginTop: 6 }} disabled={busy} onClick={add}>{busy ? <span className="spinner" /> : <Icon name="plus" size={15} />}{busy ? "Waiting for Microsoft…" : "Add Microsoft account"}</button>
        <p className="tiny faint">You sign in on Microsoft's own page. VEX never sees your password; the sign-in is stored encrypted by Windows{ms && !ms.secureStorage ? " (not available on this PC — you'll sign in each time)" : ""}.</p>
      </div>
    </Card>
  );
}

function GameCard() {
  const { desktop, settings, update } = useApp();
  const [g, setG] = useState<GameSettings | null>(null);
  useEffect(() => { if (desktop) window.vex!.game.settings().then(setG); }, [desktop]);
  const set = async (patch: Partial<GameSettings>) => setG(await window.vex!.game.setSettings(patch));
  if (!g) return null;
  return (
    <Card title="Game" icon="play" sub="Applies to every instance. Memory is set per instance.">
      <div className="toggle-row"><div className="text"><b>Window</b></div>
        <Segmented label="Window mode" value={g.windowMode} onChange={(v) => set({ windowMode: v })} options={[{ value: "windowed", label: "Windowed" }, { value: "fullscreen", label: "Fullscreen" }]} /></div>
      {g.windowMode === "windowed" && <div className="toggle-row"><div className="text"><b>Window size</b></div>
        <Select<string> label="Window size" value={`${g.width}x${g.height}`} onChange={(v) => { const [w, h] = v.split("x").map(Number); set({ width: w, height: h }); }}
          options={["854x480", "1280x720", "1600x900", "1920x1080", "2560x1440"].concat([`${g.width}x${g.height}`]).filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ value: v, label: v.replace("x", " × ") }))} /></div>}
      <ToggleRow title="VEX in-game mod" desc="Adds the VEX mod and Fabric API to Fabric instances (Minecraft 1.21.11). In game, Right Shift opens the VEX menu." checked={settings.vexMod} onChange={(v) => update({ vexMod: v })} />
      <div className="toggle-row"><div className="text"><b>Java</b><span>{g.javaPath ? g.javaPath : "Automatic — VEX downloads Mojang's Java when needed"}</span></div>
        {g.javaPath && <button className="btn sm" onClick={() => set({ javaPath: "" })}>Use automatic</button>}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => window.vex!.game.openLogsWindow()}><Icon name="server" size={14} />Minecraft Logs window</button>
        <button className="btn sm" onClick={() => window.vex!.game.openLog()}><Icon name="folder" size={14} />Open log file</button>
      </div>
    </Card>
  );
}

function AccountCard() {
  const { account, settings, update, toast } = useApp();
  const [url, setUrl] = useState(settings.onlineServiceUrl);
  const p = account?.signedIn ? account.profile : null;
  const urlOk = url === "" || isServiceUrl(url);
  return (
    <Card title="VEX online" icon="friends" sub="Friends, Collab, news and admin. You're signed in automatically with your Minecraft account.">
      {p ? (
        <div className="row">
          <Avatar name={p.username} url={p.avatar} size={44} />
          <div style={{ flex: 1 }}><b>{p.username}</b><div className="tiny faint">Connected{p.admin ? " · admin" : ""}</div></div>
          <span className="chip ok"><span className="dot" />Online</span>
        </div>
      ) : <SignInCard compact />}
      <div style={{ marginTop: 12 }}><ServiceUpdate /></div>
      <details style={{ marginTop: 14 }}>
        <summary className="small muted" style={{ cursor: "pointer" }}>Online service address</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input mono" placeholder={account?.serviceUrl && !settings.onlineServiceUrl ? `Built-in: ${account.serviceUrl}` : "https://vex-online.<you>.workers.dev"} aria-invalid={!urlOk}
            value={url} onChange={(e) => setUrl(e.target.value.trim())} />
          <button className="btn" disabled={!urlOk || url === settings.onlineServiceUrl} onClick={() => { update({ onlineServiceUrl: url.replace(/\/+$/, "") }); toast("success", url ? "Online service saved" : "Using the built-in service"); }}>Save</button>
        </div>
        <span className="hint">{urlOk ? "Leave empty to use the one built into this version of VEX." : "Use an https:// address."}</span>
      </details>
    </Card>
  );
}

const TRAILS: { id: TrailStyle; label: string; swatch: string }[] = [
  { id: "petals", label: "Sakura petals", swatch: "linear-gradient(135deg,#ffb7d5,#ff8cc6)" },
  { id: "aurora", label: "Aurora particles", swatch: "linear-gradient(135deg,#4fe0c0,#b48cff)" },
  { id: "light", label: "Cyan light", swatch: "linear-gradient(135deg,#7df9ff,#4fd8ff)" },
  { id: "stardust", label: "Purple stardust", swatch: "linear-gradient(135deg,#b48cff,#ffffff)" },
  { id: "soft", label: "Soft trail", swatch: "var(--gradient)" },
  { id: "minimal", label: "Minimal", swatch: "#ffffff" },
  { id: "off", label: "Disabled", swatch: "transparent" },
];

function TrailCard() {
  const { settings, update } = useApp();
  const t = settings.trail;
  const set = (patch: Partial<TrailSettings>) => update({ trail: { ...t, ...patch } });
  const sliders: [keyof TrailSettings, string][] = [["length", "Trail length"], ["density", "Particle density"], ["opacity", "Opacity"], ["speed", "Speed"], ["size", "Size"], ["glow", "Glow"]];
  const off = t.style === "off";
  return (
    <Card title="Cursor trail" icon="sparkle" sub="Particles that follow your mouse around the launcher. Move the mouse to try it.">
      <div className="row wrap" style={{ gap: 6 }}>
        {TRAILS.map((x) => (
          <button key={x.id} className={`btn sm ${t.style === x.id ? "is-on" : ""}`} aria-pressed={t.style === x.id} onClick={() => set({ style: x.id })}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: x.swatch, border: x.id === "off" ? "1px dashed var(--line-strong)" : 0 }} />{x.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12, opacity: off ? 0.45 : 1, pointerEvents: off ? "none" : undefined }} aria-disabled={off}>
        {sliders.map(([k, label]) => (
          <div key={k} className="toggle-row"><div className="text"><b>{label}</b></div>
            <div style={{ width: 240 }}><Slider label={label} value={t[k] as number} min={0} max={100} onChange={(v) => set({ [k]: v } as Partial<TrailSettings>)} format={(v) => `${v}%`} /></div></div>
        ))}
        <div className="toggle-row"><div className="text"><b>Colour</b><span>{t.color ? "Custom colour" : "Uses the style's own colours"}</span></div>
          <span className="color-input" style={{ width: 44, height: 26, background: t.color ?? "var(--gradient)" }}><input type="color" aria-label="Trail colour" value={t.color ?? "#ff6fb5"} onChange={(e) => set({ color: e.target.value })} /></span>
          <button className="btn sm" disabled={!t.color} onClick={() => set({ color: null })}>Use style default</button></div>
        <ToggleRow title="Trail performance mode" desc="Fewer particles, no glow — easier on older PCs." checked={t.performance} onChange={(v) => set({ performance: v })} />
      </div>
      <div className="row" style={{ marginTop: 8 }}><span className="spacer" /><button className="btn ghost sm" onClick={() => update({ trail: DEFAULT_TRAIL })}><Icon name="refresh" size={13} />Reset trail</button></div>
      {settings.animations === "off" && <Notice kind="warn">Animations are off (Appearance), so the trail is hidden.</Notice>}
    </Card>
  );
}

function UpdatesCard() {
  const { info, desktop } = useApp();
  const s = useUpdateState();
  const when = "checkedAt" in s && s.checkedAt ? new Date(s.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const text = {
    idle: "VEX checks for updates automatically.", checking: "Checking for updates…", "up-to-date": `You're on the latest version${when ? ` (checked ${when})` : ""}.`,
    unsupported: "Automatic updates work in the installed Windows app.", downloading: "", ready: "", error: "",
  } as Record<string, string>;
  return (
    <Card title="Updates" icon="refresh">
      <div className="row">
        <div style={{ flex: 1 }}>
          <b>VEX {info?.version ?? "dev"}</b>
          <div className="small faint">
            {s.status === "downloading" ? `Downloading ${s.version}… ${s.pct}%` : s.status === "ready" ? `Version ${s.version} is downloaded — restart to install.` : s.status === "error" ? `Update check failed: ${s.message}` : (s as any).message ?? text[s.status]}
          </div>
        </div>
        {s.status === "ready"
          ? <button className="btn primary sm" onClick={() => window.vex!.updater.install()}><Icon name="refresh" size={14} />Restart now</button>
          : <button className="btn sm" disabled={!desktop || s.status === "checking" || s.status === "downloading" || s.status === "unsupported"} onClick={() => window.vex!.updater.check()}>
              {s.status === "checking" ? <span className="spinner" /> : <Icon name="refresh" size={14} />}Check now</button>}
      </div>
      <p className="tiny faint" style={{ marginTop: 10 }}>Updates come from the official VEX GitHub releases. Each download is checked against its SHA-256 checksum before it can be installed.</p>
    </Card>
  );
}

function ShortcutRows() {
  const { toast, desktop } = useApp();
  const [st, setSt] = useState<ShortcutStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (desktop) vex().shortcuts.status().then(setSt).catch(() => setSt(null)); }, [desktop]);
  const unavailable = !st?.supported ? "Windows only" : !st.packaged ? "Works in the installed app" : undefined;
  const set = async (kind: "desktop" | "startMenu", on: boolean) => {
    setBusy(true);
    try {
      const next = await vex().shortcuts.set(kind, on); setSt(next);
      const label = kind === "desktop" ? "Desktop" : "Start menu";
      toast("success", on ? `${label} shortcut added` : `${label} shortcut removed`, on ? "Look for the VEX CLIENT icon." : undefined);
    } catch (e) { toast("error", "Couldn't change the shortcut", errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <ToggleRow title="Desktop shortcut" desc={unavailable ?? "VEX CLIENT icon on your desktop"} checked={!!st?.desktop} disabled={!!unavailable || busy} onChange={(v) => set("desktop", v)} />
      <ToggleRow title="Start menu shortcut" desc={unavailable ?? "Find VEX CLIENT by searching in Start"} checked={!!st?.startMenu} disabled={!!unavailable || busy} onChange={(v) => set("startMenu", v)} />
    </>
  );
}

function ThemeSwatch({ t, selected, onClick }: { t: ThemeDef; selected: boolean; onClick(): void }) {
  return (
    <button className="theme-card" aria-pressed={selected} onClick={onClick} style={{ ["--a" as any]: t.accent, ["--b" as any]: t.accent2, ["--p" as any]: t.panel, ["--bg2" as any]: t.background }}>
      <span className="theme-chip" /><span>{t.name}</span>{selected && <Icon name="check" size={14} />}
    </button>
  );
}

function ThemeEditor({ base, onClose }: { base: ThemeDef; onClose(): void }) {
  const { settings, update, toast } = useApp();
  const isCustom = settings.customThemes.some((t) => t.id === base.id);
  const [t, setT] = useState<ThemeDef>(isCustom ? base : { ...base, id: `custom-${Date.now().toString(36)}`, name: `${base.name} Custom` });
  const set = <K extends keyof ThemeDef>(k: K, v: ThemeDef[K]) => { const n = { ...t, [k]: v }; setT(n); applyTheme(n); }; // live preview
  const close = () => { applyTheme(resolveTheme(settings.themeId, settings.customThemes)); onClose(); };
  const save = async () => {
    if (!t.name.trim()) return;
    await update({ customThemes: [...settings.customThemes.filter((x) => x.id !== t.id), { ...t, name: t.name.trim() }], themeId: t.id });
    toast("success", `Theme “${t.name.trim()}” saved`); onClose();
  };
  const colors: [keyof ThemeDef, string][] = [["accent", "Accent"], ["accent2", "Accent gradient"], ["background", "Background"], ["panel", "Panels"], ["border", "Borders"], ["text", "Text"]];
  return (
    <Modal title={isCustom ? `Edit ${base.name}` : "New custom theme"} onClose={close}>
      <div className="stack">
        <Notice>Changes preview live across the launcher. Close without saving to undo.</Notice>
        <Field label="Theme name">{(id) => <input id={id} className="input" maxLength={40} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />}</Field>
        {colors.map(([k, label]) => <Field key={k} label={label}>{() => <ColorPicker label={label} value={t[k] as string} onChange={(v) => set(k, v as any)}
          palette={k === "background" || k === "panel" ? ["#170b16", "#2a1328", "#100b1a", "#1f1533", "#080d18", "#111c33", "#06130f", "#150709"] : k === "text" ? ["#fbeaf4", "#ffffff", "#f1ebff", "#e8f0ff", "#e6fff8"] : undefined} />}</Field>)}
        <Field label="Panel opacity">{() => <Slider label="Panel opacity" value={t.opacity} min={0.3} max={1} step={0.02} onChange={(v) => set("opacity", v)} format={(v) => `${Math.round(v * 100)}%`} />}</Field>
        <Field label="Glow intensity">{() => <Slider label="Glow intensity" value={t.glow} min={0} max={1} step={0.05} onChange={(v) => set("glow", v)} format={(v) => `${Math.round(v * 100)}%`} />}</Field>
        <Field label="Corner radius">{() => <Slider label="Corner radius" value={t.radius} min={0} max={28} onChange={(v) => set("radius", v)} format={(v) => `${v}px`} />}</Field>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn ghost" onClick={close}>Cancel</button><button className="btn primary" disabled={!t.name.trim()} onClick={save}><Icon name="save" size={15} />Save theme</button></div>
      </div>
    </Modal>
  );
}

export function SettingsPage() {
  const { settings, update, toast, info, desktop } = useApp();
  const [editing, setEditing] = useState<ThemeDef | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bug, setBug] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const current = resolveTheme(settings.themeId, settings.customThemes);
  const isCustom = settings.customThemes.some((t) => t.id === current.id);

  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      if (f.size > 20_000) throw new Error("Theme files are tiny — this one is too big to be a VEX theme.");
      const t = importTheme(await f.text());
      const id = PRESET_THEMES.some((p) => p.id === t.id) ? `${t.id}-imported` : t.id;
      await update({ customThemes: [...settings.customThemes.filter((x) => x.id !== id), { ...t, id }], themeId: id });
      toast("success", `Imported “${t.name}”`);
    } catch (e) { toast("error", "Couldn't import theme", errMsg(e)); }
    if (importRef.current) importRef.current.value = "";
  };
  const doExport = async () => {
    try { const r = await vex().files.saveAs(`${current.name} theme`, "json", new TextEncoder().encode(exportTheme(current))); if (r.ok) toast("success", "Theme exported", r.path); }
    catch (e) { toast("error", "Couldn't export theme", errMsg(e)); }
  };
  const pickDir = async (key: "downloadDir" | "minecraftDir", title: string) => { const d = await vex().files.pickDir(title); if (d) update({ [key]: d }); };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack" style={{ gap: "var(--s4)" }}>
          <Card title="Theme" icon="sparkle">
            <div className="theme-grid">
              {PRESET_THEMES.map((t) => <ThemeSwatch key={t.id} t={t} selected={t.id === current.id} onClick={() => update({ themeId: t.id })} />)}
              {settings.customThemes.map((t) => <ThemeSwatch key={t.id} t={t} selected={t.id === current.id} onClick={() => update({ themeId: t.id })} />)}
            </div>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <button className="btn sm" onClick={() => setEditing(current)}><Icon name={isCustom ? "edit" : "plus"} size={14} />{isCustom ? "Edit theme" : "Customise"}</button>
              {isCustom && <button className="btn sm danger" onClick={() => update({ customThemes: settings.customThemes.filter((t) => t.id !== current.id), themeId: "sakura" })}><Icon name="trash" size={14} />Delete</button>}
              <span className="spacer" />
              <Tooltip text="Import a .json theme"><button className="btn sm" onClick={() => importRef.current?.click()}><Icon name="upload" size={14} />Import</button></Tooltip>
              <Tooltip text="Export as JSON (shared/theme.schema.json)"><button className="btn sm" disabled={!desktop} onClick={doExport}><Icon name="download" size={14} />Export</button></Tooltip>
              <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
            </div>
          </Card>
          <TrailCard />
          <Card title="Appearance" icon="sun">
            <div className="stack">
              <Field label="UI scale">{() => <Segmented label="UI scale" value={settings.uiScale} onChange={(v) => update({ uiScale: v })} options={[0.9, 1, 1.1, 1.25].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} />}</Field>
              <Field label="Animations">{() => <Segmented label="Animations" value={settings.animations} onChange={(v) => update({ animations: v })} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }, { value: "off", label: "Off" }]} />}</Field>
              <div>
                <ToggleRow title="Background glow" desc="Ambient lighting behind panels" checked={settings.backgroundEffects} onChange={(v) => update({ backgroundEffects: v })} />
                <ToggleRow title="Particles" desc="Floating petals" checked={settings.particles} onChange={(v) => update({ particles: v })} />
              </div>
              <Field label="Particle intensity">{() => <Slider label="Particle intensity" value={settings.particleIntensity} min={0} max={100} onChange={(v) => update({ particleIntensity: v })} format={(v) => `${v}%`} />}</Field>
              <Field label="Language" hint="Dutch covers navigation so far; more strings follow.">{(id) => <Select id={id} value={settings.language} onChange={(v) => update({ language: v })} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />}</Field>
            </div>
          </Card>
        </div>
        <div className="stack" style={{ gap: "var(--s4)" }}>
          <MicrosoftCard />
          <AccountCard />
          <PhoneCard />
          <GameCard />
          <Card title="Startup & launching" icon="play">
            <ShortcutRows />
            <ToggleRow title="Open VEX when Windows starts" desc={desktop ? "Takes effect in the installed app" : undefined} checked={settings.openAtLogin} onChange={(v) => update({ openAtLogin: v })} />
            <div className="toggle-row"><div className="text"><b>After the game starts</b><span>Used once launching arrives</span></div>
              <Select label="After the game starts" value={settings.afterLaunch} onChange={(v) => update({ afterLaunch: v })} options={[{ value: "keep", label: "Keep open" }, { value: "minimize", label: "Minimise" }, { value: "close", label: "Close launcher" }]} /></div>
            <ToggleRow title="Notifications" desc="Desktop alerts for installs and errors" checked={settings.notifications} onChange={(v) => update({ notifications: v })} />
          </Card>
          <Card title="Folders" icon="folder">
            <div className="stack">
              <Field label="Minecraft folder" hint="Where the “Default Minecraft folder” option installs packs.">{(id) => <div className="row">
                <input id={id} className="input mono" readOnly value={settings.minecraftDir || info?.defaultMinecraftDir || ""} />
                <button className="btn" disabled={!desktop} onClick={() => pickDir("minecraftDir", "Choose your .minecraft folder")}>Change</button>
                {settings.minecraftDir && <button className="btn ghost icon" aria-label="Reset" onClick={() => update({ minecraftDir: "" })}><Icon name="refresh" size={14} /></button>}</div>}</Field>
              <Field label="Download folder" hint="Default location for saved skins, PNGs and ZIPs.">{(id) => <div className="row">
                <input id={id} className="input mono" readOnly value={settings.downloadDir || info?.downloadsDir || ""} />
                <button className="btn" disabled={!desktop} onClick={() => pickDir("downloadDir", "Choose a download folder")}>Change</button>
                {settings.downloadDir && <button className="btn ghost icon" aria-label="Reset" onClick={() => update({ downloadDir: "" })}><Icon name="refresh" size={14} /></button>}</div>}</Field>
            </div>
          </Card>
          <UpdatesCard />
          <Card title="Diagnostics" icon="info">
            <ToggleRow title="Verbose logging" desc="Adds debug detail to launcher.log" checked={settings.verboseLogging} onChange={(v) => update({ verboseLogging: v })} />
            <div className="row wrap" style={{ marginTop: 10 }}>
              <button className="btn sm" disabled={!desktop} onClick={() => vex().files.open("logs")}><Icon name="folder" size={14} />Open logs</button>
              <button className="btn sm" disabled={!desktop} onClick={() => vex().files.open("userData")}><Icon name="folder" size={14} />Open data folder</button>
              <span className="spacer" />
              <button className="btn sm" onClick={() => setBug(true)}><Icon name="bug" size={14} />Report a bug</button>
              <button className="btn sm danger" onClick={() => setConfirmReset(true)}><Icon name="refresh" size={14} />Reset to defaults</button>
            </div>
            <p className="tiny faint" style={{ marginTop: 10 }}>VEX {info?.version ?? "dev"} · {info?.platform ?? "browser"} · Settings never contain passwords or sign-in tokens.</p>
          </Card>
        </div>
      </div>
      {bug && <BugReport onClose={() => setBug(false)} />}
      {editing && <ThemeEditor base={editing} onClose={() => setEditing(null)} />}
      {confirmReset && (
        <Modal title="Reset all settings?" onClose={() => setConfirmReset(false)}>
          <div className="stack"><p className="small muted">Theme, appearance, folders and saved crosshairs go back to defaults. Instances and your skin library are kept.</p>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn danger" onClick={async () => { await update({ ...DEFAULT_SETTINGS, selectedInstanceId: settings.selectedInstanceId, recentInstanceIds: settings.recentInstanceIds }); setConfirmReset(false); toast("success", "Settings reset"); }}>Reset</button></div></div>
        </Modal>
      )}
    </div>
  );
}
