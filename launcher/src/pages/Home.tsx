import { tr } from "../lib/i18n";
import { Notice, Select } from "../components/ui";
import { useUpdateState } from "../components/UpdateBanner";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { useEffect, useState } from "react";
import { useApp } from "../state/AppState";
import { PlayButton, GameProgress } from "../components/PlayButton";
import { HomeOnline } from "../features/HomeOnline";
import { vex, errMsg } from "../lib/bridge";
import type { ShortcutStatus } from "../vex";
import { InstanceIcon } from "../components/InstanceIcon";
import { ModsDialog } from "../features/ModsDialog";

export function HomePage() {
  const { instances, settings, update, go, info, desktop, toast, ms, account } = useApp();
  const upd = useUpdateState();
  const activeMs = ms?.accounts.find((a) => a.active);
  const selected = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0] ?? null;
  const recent = settings.recentInstanceIds.map((id) => instances.find((i) => i.id === id)).filter(Boolean);
  const [sc, setSc] = useState<ShortcutStatus | null>(null);
  const [modsOpen, setModsOpen] = useState(false);
  const [modCount, setModCount] = useState<number | null>(null);
  useEffect(() => {
    setModCount(null);
    if (desktop && selected && selected.loader !== "vanilla") vex().mods.list(selected.id).then((m) => setModCount(m.filter((x) => x.enabled).length)).catch(() => {});
  }, [desktop, selected?.id, modsOpen]);
  const ago = (t: number | null) => {
    if (!t) return tr("Never played");
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? tr("Played just now") : m < 60 ? tr("Played {0} min ago", m) : m < 1440 ? tr("Played {0} h ago", Math.round(m / 60)) : tr("Played {0} d ago", Math.round(m / 1440));
  };
  const shelf = (recent.length ? recent : instances).slice(0, 6);
  useEffect(() => { if (desktop) vex().shortcuts.status().then(setSc).catch(() => {}); }, [desktop]);
  const addDesktop = async () => {
    try { setSc(await vex().shortcuts.set("desktop", true)); toast("success", tr("Desktop shortcut added"), tr("Look for the VEX CLIENT icon on your desktop.")); }
    catch (e) { toast("error", tr("Couldn't add the shortcut"), errMsg(e)); }
  };

  return (
    <div className="page">
      <section className="home-hero">
        <div className="hero-v" aria-hidden><Logo size={380} glow={false} /></div>
        <div className="hero-main">
          {selected && <div className="hero-icon"><InstanceIcon id={selected.id} loader={selected.loader} size={96} /></div>}
          <div style={{ minWidth: 0 }}>
          <span className="greeting">{activeMs ? tr("Hey {0}", activeMs.name) : tr("Welcome to VEX")}</span>
          <h1>{selected ? selected.name : tr("No instance yet")}</h1>
          <p className="sub">{selected ? `Minecraft ${selected.version}${selected.loader === "vanilla" ? "" : `, ${selected.loader[0].toUpperCase()}${selected.loader.slice(1)}`}` : tr("Make an instance to start playing.")}</p>
          <div className="row wrap" style={{ marginTop: 18 }}>
            {instances.length > 1 && <div style={{ width: 260 }}>
              <Select label={tr("Instance")} value={selected?.id ?? ""} onChange={(id) => update({ selectedInstanceId: id })} options={instances.map((i) => ({ value: i.id, label: `${i.name} (${i.version})` }))} />
            </div>}
            {!instances.length && <button className="btn" onClick={() => go("instances")}><Icon name="plus" size={16} />{tr("New instance")}</button>}
            {selected && <div className="hero-actions">
              {selected.loader !== "vanilla" && <button className="btn sm ghost" onClick={() => setModsOpen(true)}><Icon name="puzzle" size={14} />{modCount === null ? tr("Mods") : tr("{0} mods", modCount)}</button>}
              <button className="btn sm ghost" onClick={() => vex().files.open("path", selected.gameDir)}><Icon name="folder" size={14} />{tr("Folder")}</button>
              <button className="btn sm ghost" onClick={() => window.vex?.game.openLogsWindow()}><Icon name="server" size={14} />{tr("Logs")}</button>
              <span className="tiny faint">{ago(selected.lastPlayed)}</span>
            </div>}
          </div>
          </div>
        </div>
        <div className="stack" style={{ alignItems: "flex-end", gap: 10, position: "relative" }}>
          <PlayButton big />
          <div style={{ width: 250 }}><GameProgress /></div>
        </div>
      </section>

      <HomeOnline />

      <div className="home-cols">
        <section>
          <h2 className="section-title">{recent.length ? tr("Jump back in") : tr("Your instances")}</h2>
          {shelf.length ? (
            <div className="recent-list">{shelf.map((i) => (
              <button key={i!.id} className="recent-item" onClick={() => update({ selectedInstanceId: i!.id })} aria-pressed={i!.id === selected?.id}>
                <InstanceIcon id={i!.id} loader={i!.loader} size={40} />
                <span style={{ minWidth: 0, flex: 1, textAlign: "left" }}><b>{i!.name}</b><span className="tiny faint">Minecraft {i!.version}{i!.loader === "vanilla" ? "" : `, ${i!.loader}`}</span></span>
              </button>
            ))}</div>
          ) : <button className="recent-item" onClick={() => go("instances")}><span className="inst-tile ghost" style={{ width: 40, height: 40 }}><Icon name="plus" size={16} /></span><b>{tr("Make your first instance")}</b></button>}
        </section>
        <section>
          <h2 className="section-title">{tr("Status")}</h2>
          <dl className="status-list">
            <dt>{tr("Minecraft account")}</dt>
            <dd>{activeMs ? <span className={`chip ${activeMs.needsLogin ? "warn" : "ok"}`}><span className="dot" />{activeMs.needsLogin ? tr("Sign in again") : activeMs.name}</span> : <span className="chip warn">{tr("Not signed in")}</span>}</dd>
            <dt>{tr("VEX online")}</dt>
            <dd>{account?.signedIn ? <span className="chip ok"><span className="dot" />{tr("Connected")}</span> : account?.configured ? <button className="btn sm ghost" onClick={() => go("friends")}>{tr("Connect")}</button> : <span className="chip">{tr("Not set up")}</span>}</dd>
            <dt>VEX CLIENT {info?.version ?? ""}</dt>
            <dd><span className={`chip ${upd.status === "ready" ? "warn" : ""}`}>{upd.status === "ready" ? `${upd.version} ready` : upd.status === "downloading" ? tr("Downloading {0}%", upd.pct) : upd.status === "checking" ? tr("Checking") : tr("Up to date")}</span></dd>
            {sc?.supported && sc.packaged && <><dt>{tr("Desktop shortcut")}</dt>
              <dd>{sc.desktop ? <span className="chip ok">{tr("On desktop")}</span> : <button className="btn sm" onClick={addDesktop}><Icon name="plus" size={14} />{tr("Add")}</button>}</dd></>}
          </dl>
          {!desktop && <Notice kind="warn">{tr("This is the browser preview. Open the desktop app to play.")}</Notice>}
        </section>
      </div>
      {modsOpen && selected && <ModsDialog inst={selected} onClose={() => setModsOpen(false)} />}
    </div>
  );
}
