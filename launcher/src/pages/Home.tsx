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

export function HomePage() {
  const { instances, settings, update, go, info, desktop, toast, ms, account } = useApp();
  const upd = useUpdateState();
  const activeMs = ms?.accounts.find((a) => a.active);
  const selected = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0] ?? null;
  const recent = settings.recentInstanceIds.map((id) => instances.find((i) => i.id === id)).filter(Boolean);
  const [sc, setSc] = useState<ShortcutStatus | null>(null);
  useEffect(() => { if (desktop) vex().shortcuts.status().then(setSc).catch(() => {}); }, [desktop]);
  const addDesktop = async () => {
    try { setSc(await vex().shortcuts.set("desktop", true)); toast("success", "Desktop shortcut added", "Look for the VEX CLIENT icon on your desktop."); }
    catch (e) { toast("error", "Couldn't add the shortcut", errMsg(e)); }
  };

  return (
    <div className="page">
      <section className="home-hero">
        <div className="hero-v" aria-hidden><Logo size={380} glow={false} /></div>
        <div style={{ minWidth: 0, position: "relative" }}>
          <span className="greeting">{activeMs ? `Hey ${activeMs.name}` : "Welcome to VEX"}</span>
          <h1>{selected ? selected.name : "No instance yet"}</h1>
          <p className="sub">{selected ? `Minecraft ${selected.version}${selected.loader === "vanilla" ? "" : `, ${selected.loader[0].toUpperCase()}${selected.loader.slice(1)}`}` : "Make an instance to start playing."}</p>
          <div className="row wrap" style={{ marginTop: 18 }}>
            {instances.length > 1 && <div style={{ width: 260 }}>
              <Select label="Instance" value={selected?.id ?? ""} onChange={(id) => update({ selectedInstanceId: id })} options={instances.map((i) => ({ value: i.id, label: `${i.name} (${i.version})` }))} />
            </div>}
            {!instances.length && <button className="btn" onClick={() => go("instances")}><Icon name="plus" size={16} />New instance</button>}
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
          <h2 className="section-title">Jump back in</h2>
          {recent.length ? (
            <div className="recent-list">{recent.slice(0, 6).map((i) => (
              <button key={i!.id} className="recent-item" onClick={() => update({ selectedInstanceId: i!.id })} aria-pressed={i!.id === selected?.id}>
                <span className="inst-tile" style={{ background: "var(--accent)" }}>{i!.name[0]?.toUpperCase()}</span>
                <span style={{ minWidth: 0, flex: 1, textAlign: "left" }}><b>{i!.name}</b><span className="tiny faint">Minecraft {i!.version}{i!.loader === "vanilla" ? "" : `, ${i!.loader}`}</span></span>
              </button>
            ))}</div>
          ) : <p className="small faint">The instances you play show up here.</p>}
        </section>
        <section>
          <h2 className="section-title">Status</h2>
          <dl className="status-list">
            <dt>Minecraft account</dt>
            <dd>{activeMs ? <span className={`chip ${activeMs.needsLogin ? "warn" : "ok"}`}><span className="dot" />{activeMs.needsLogin ? "Sign in again" : activeMs.name}</span> : <span className="chip warn">Not signed in</span>}</dd>
            <dt>VEX online</dt>
            <dd>{account?.signedIn ? <span className="chip ok"><span className="dot" />Connected</span> : account?.configured ? <button className="btn sm ghost" onClick={() => go("friends")}>Connect</button> : <span className="chip">Not set up</span>}</dd>
            <dt>VEX CLIENT {info?.version ?? ""}</dt>
            <dd><span className={`chip ${upd.status === "ready" ? "warn" : ""}`}>{upd.status === "ready" ? `${upd.version} ready` : upd.status === "downloading" ? `Downloading ${upd.pct}%` : upd.status === "checking" ? "Checking" : "Up to date"}</span></dd>
            {sc?.supported && sc.packaged && <><dt>Desktop shortcut</dt>
              <dd>{sc.desktop ? <span className="chip ok">On desktop</span> : <button className="btn sm" onClick={addDesktop}><Icon name="plus" size={14} />Add</button>}</dd></>}
          </dl>
          {!desktop && <Notice kind="warn">This is the browser preview. Open the desktop app to play.</Notice>}
        </section>
      </div>
    </div>
  );
}
