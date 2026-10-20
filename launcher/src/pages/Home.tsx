import { Card, Notice, Progress, ToggleRow, Tooltip, Select } from "../components/ui";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { useEffect, useState } from "react";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { ShortcutStatus } from "../vex";

export function HomePage() {
  const { t, instances, settings, update, go, info, desktop, toast } = useApp();
  const selected = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0] ?? null;
  const recent = settings.recentInstanceIds.map((id) => instances.find((i) => i.id === id)).filter(Boolean);
  const mcDir = settings.minecraftDir || info?.defaultMinecraftDir || "—";
  const [sc, setSc] = useState<ShortcutStatus | null>(null);
  useEffect(() => { if (desktop) vex().shortcuts.status().then(setSc).catch(() => {}); }, [desktop]);
  const addDesktop = async () => {
    try { setSc(await vex().shortcuts.set("desktop", true)); toast("success", "Desktop shortcut added", "Look for the VEX CLIENT icon on your desktop."); }
    catch (e) { toast("error", "Couldn't add the shortcut", errMsg(e)); }
  };

  return (
    <div className="page">
      <section className="card glow" style={{ padding: "var(--s6)", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", right: -60, top: -80, opacity: 0.12, transform: "rotate(-8deg)" }}><Logo size={360} glow={false} /></div>
        <div className="row" style={{ gap: 32, alignItems: "flex-end", flexWrap: "wrap", position: "relative" }}>
          <div className="stack" style={{ flex: 1, minWidth: 280, gap: 6 }}>
            <span className="eyebrow">{t("home.welcome")}</span>
            <h1 style={{ fontSize: "var(--fs-hero)", lineHeight: 1.05, fontWeight: 700 }}>VEX <span style={{ background: "var(--gradient)", WebkitBackgroundClip: "text", color: "transparent" }}>CLIENT</span></h1>
            <p className="muted" style={{ maxWidth: 460 }}>Play different. Your instances, cosmetics and tools in one place.</p>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <div style={{ width: 280 }}>
                <Select label="Instance" value={selected?.id ?? ""} onChange={(id) => update({ selectedInstanceId: id })}
                  options={instances.length ? instances.map((i) => ({ value: i.id, label: `${i.name} · ${i.version}` })) : [{ value: "", label: "No instances yet" }]} />
              </div>
              {!instances.length && <button className="btn" onClick={() => go("instances")}><Icon name="plus" size={16} />Create one</button>}
            </div>
          </div>
          <div className="stack" style={{ alignItems: "flex-end", gap: 10 }}>
            <Tooltip text={!selected ? "Create an instance first." : "Installing and launching Minecraft arrives in Stage 4 (Microsoft sign-in + game download)."}>
              <button className="play-btn" disabled><Icon name="play" size={22} />{t("home.play")}</button>
            </Tooltip>
            <span className="tiny faint">Launching isn't available yet — Stage 4</span>
          </div>
        </div>
      </section>

      <div className="grid grid-3">
        <Card title="Selected instance" icon="cube">
          {selected ? (
            <dl className="kv">
              <dt>Name</dt><dd>{selected.name}</dd>
              <dt>Version</dt><dd>{selected.version} · {selected.loader}</dd>
              <dt>Memory</dt><dd>{(selected.memoryMb / 1024).toFixed(1)} GB</dd>
              <dt>Folder</dt><dd title={selected.gameDir} className="mono">{selected.gameDir}</dd>
              <dt>Status</dt><dd>{selected.installed ? <span className="chip ok"><span className="dot" />Installed</span> : <span className="chip warn"><span className="dot" />Not installed</span>}</dd>
            </dl>
          ) : <div className="empty"><Icon name="cube" size={28} /><span className="small">No instance selected</span><button className="btn sm" onClick={() => go("instances")}>Open Instances</button></div>}
        </Card>

        <Card title="Status" icon="info">
          <div className="stack">
            <div className="row small"><span className="muted" style={{ flex: 1 }}>Account</span><span className="chip warn"><span className="dot" />Not signed in</span></div>
            <div className="row small"><span className="muted" style={{ flex: 1 }}>Minecraft folder</span>
              {info?.defaultMinecraftDirExists || settings.minecraftDir ? <span className="chip ok"><span className="dot" />Found</span> : <span className="chip">Not found</span>}</div>
            <div className="mono faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mcDir}>{mcDir}</div>
            {sc?.supported && sc.packaged && (
              <div className="row small"><span className="muted" style={{ flex: 1 }}>Desktop shortcut</span>
                {sc.desktop ? <span className="chip ok"><span className="dot" />On desktop</span> : <button className="btn sm" onClick={addDesktop}><Icon name="plus" size={14} />Add to desktop</button>}</div>
            )}
            <div className="row small"><span className="muted" style={{ flex: 1 }}>Client updates</span><span className="chip">Not set up yet</span></div>
            <div className="row small"><span className="muted" style={{ flex: 1 }}>Downloads</span><span className="chip">Idle</span></div>
            <Progress value={0} label="No download running" />
            {!desktop && <Notice kind="warn">You're viewing the UI in a browser. Open the desktop app for real data.</Notice>}
          </div>
        </Card>

        <Card title="Quick settings" icon="settings">
          <ToggleRow title="Particles" checked={settings.particles} onChange={(v) => update({ particles: v })} />
          <ToggleRow title="Background glow" checked={settings.backgroundEffects} onChange={(v) => update({ backgroundEffects: v })} />
          <ToggleRow title="Notifications" checked={settings.notifications} onChange={(v) => update({ notifications: v })} />
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => go("settings")}>All settings<Icon name="external" size={14} /></button>
        </Card>
      </div>

      <Card title="Recently played" icon="clock">
        {recent.length ? (
          <div className="stack" style={{ gap: 4 }}>{recent.map((i) => <div key={i!.id} className="list-item"><Icon name="cube" />{i!.name}<span className="faint small">{i!.version}</span></div>)}</div>
        ) : <p className="small faint">Instances you launch will show up here.</p>}
      </Card>
    </div>
  );
}
