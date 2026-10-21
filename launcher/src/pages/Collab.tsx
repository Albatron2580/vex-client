import { useCallback, useEffect, useState } from "react";
import { Card, Field, Notice, Progress, Select } from "../components/ui";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Shell";
import { useApp } from "../state/AppState";
import { SignInCard } from "./Friends";
import { vex, errMsg } from "../lib/bridge";
import type { Friend, Share } from "../vex";

const LOADER: Record<string, string> = { vanilla: "Vanilla", fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt" };
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function CollabPage() {
  const { account, instances, toast, go, play, settings, update } = useApp();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [shares, setShares] = useState<{ incoming: Share[]; sent: Share[] } | null>(null);
  const [instId, setInstId] = useState("");
  const [friendId, setFriendId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [installing, setInstalling] = useState<{ id: number; done: number; total: number; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = !!account?.signedIn;

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([vex().friends.list(), vex().collab.shares()]);
      setFriends(f.friends); setShares(s); setError(null);
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { if (!signedIn) return; load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [signedIn, load]);
  useEffect(() => vex().collab.onProgress((p) => setInstalling((cur) => (cur ? { ...cur, ...p } : cur))), []);
  useEffect(() => { if (!instId && instances[0]) setInstId(settings.selectedInstanceId ?? instances[0].id); }, [instances]);
  useEffect(() => { if (!friendId && friends?.[0]) setFriendId(friends[0].id); }, [friends]);

  if (!signedIn) return (
    <div className="page">
      <div className="page-head"><div><h1>Collab</h1><p>Share instances with friends and play together.</p></div></div>
      <Card><div style={{ padding: "24px 0" }}><SignInCard /></div></Card>
    </div>
  );

  const share = async () => {
    setSharing(true);
    try {
      const r = await vex().collab.share(instId, friendId);
      const who = friends?.find((f) => f.id === friendId)?.username ?? "your friend";
      toast("success", `Sent to ${who}`, `${r.mods} mod${r.mods === 1 ? "" : "s"} from Modrinth${r.missing.length ? ` · ${r.missing.length} not on Modrinth (they'll add those by hand)` : ""}.`);
      load();
    } catch (e) { toast("error", "Couldn't share that instance", errMsg(e)); }
    finally { setSharing(false); }
  };
  const install = async (s: Share) => {
    setInstalling({ id: s.id, done: 0, total: s.instance.mods.length, title: "" });
    try {
      const r = await vex().collab.install(s.instance);
      await vex().collab.dismiss(s.id);
      await update({ selectedInstanceId: r.instance.id });
      toast(r.failed.length ? "info" : "success", `Installed “${r.instance.name}”`, r.failed.length ? `${r.failed.length} mod(s) couldn't download: ${r.failed.slice(0, 3).join(", ")}` : `${r.installed} mods ready. Press Play!`);
      load();
    } catch (e) { toast("error", "Couldn't install the shared instance", errMsg(e)); }
    finally { setInstalling(null); }
  };
  const playing = friends?.filter((f) => f.online) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Collab</h1><p>Send your instance to a friend — same version, loader and mods — so you can play together.</p></div>
        <button className="btn sm" onClick={load}><Icon name="refresh" size={14} />Refresh</button>
      </div>
      {error && <Notice kind="danger">{error}</Notice>}
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card title="Share an instance" icon="upload" sub="Mods found on Modrinth are sent as a list; your friend's VEX downloads the exact same versions.">
          {!instances.length ? <div className="empty"><Icon name="cube" size={26} /><span className="small">Create an instance first.</span><button className="btn sm" onClick={() => go("instances")}>Instances</button></div>
            : !friends?.length ? <div className="empty"><Icon name="friends" size={26} /><span className="small">Add a friend first.</span><button className="btn sm" onClick={() => go("friends")}>Friends</button></div>
            : <div className="stack">
                <Field label="Instance">{(id) => <Select id={id} value={instId} onChange={setInstId} options={instances.map((i) => ({ value: i.id, label: `${i.name} · ${i.version} ${LOADER[i.loader]}` }))} />}</Field>
                <Field label="Friend">{(id) => <Select id={id} value={friendId} onChange={setFriendId} options={friends.map((f) => ({ value: f.id, label: f.username + (f.online ? " · online" : "") }))} />}</Field>
                <button className="btn primary" disabled={sharing || !instId || !friendId} onClick={share}>{sharing ? <span className="spinner" /> : <Icon name="upload" size={15} />}{sharing ? "Checking mods on Modrinth…" : "Send instance"}</button>
                <span className="hint">Worlds, configs and your settings stay on your PC. Only the version, loader and mod list are sent.</span>
              </div>}
        </Card>
        <Card title="Friends online" icon="friends" extra={<span className="chip">{playing.length}</span>}>
          {friends === null ? <div className="row small muted"><span className="spinner" />Loading…</div>
            : playing.length ? <div className="stack" style={{ gap: 4 }}>{playing.map((f) => (
                <div key={f.id} className="list-item">
                  <span style={{ position: "relative" }}><Avatar name={f.username} url={f.avatar} size={32} /><span className={`presence-dot ${f.status === "playing" ? "playing" : "online"}`} /></span>
                  <div style={{ flex: 1 }}><b className="small">{f.username}</b><div className="tiny" style={{ color: f.status === "playing" ? "var(--accent)" : "var(--ok)" }}>{f.status === "playing" ? `Playing${f.detail ? ` · ${f.detail}` : ""}` : f.detail ?? "Online"}</div></div>
                  {instances.length > 0 && <button className="btn sm" onClick={() => { setFriendId(f.id); }}>Share with</button>}
                </div>))}</div>
            : <p className="small faint">None of your friends are online right now.</p>}
        </Card>
      </div>

      <Card title="Shared with you" icon="download" extra={shares && shares.incoming.length > 0 ? <span className="chip accent">{shares.incoming.length}</span> : undefined}>
        {shares === null ? <div className="row small muted"><span className="spinner" />Loading…</div>
          : !shares.incoming.length ? <div className="empty"><Icon name="collab" size={28} /><span className="small">Nothing yet. When a friend sends you an instance, it shows up here.</span></div>
          : <div className="stack" style={{ gap: 8 }}>{shares.incoming.map((s) => (
              <div key={s.id} className="list-item" style={{ border: "1px solid var(--line)", alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
                <div className="row" style={{ width: "100%" }}>
                  <Avatar name={s.from.username} url={s.from.avatar ?? null} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}><b>{s.instance.name}</b><div className="tiny faint">from {s.from.username} · {s.instance.version} · {LOADER[s.instance.loader]} · {s.instance.mods.length} mods · {ago(s.createdAt)}</div></div>
                  <button className="btn primary sm" disabled={!!installing} onClick={() => install(s)}><Icon name="download" size={14} />Install</button>
                  <button className="btn ghost sm" disabled={!!installing} onClick={async () => { await vex().collab.dismiss(s.id); load(); }}>Dismiss</button>
                </div>
                {s.instance.mods.length > 0 && <div className="row wrap" style={{ gap: 4 }}>{s.instance.mods.slice(0, 12).map((m) => <span key={m.versionId} className="chip">{m.title}</span>)}{s.instance.mods.length > 12 && <span className="chip">+{s.instance.mods.length - 12} more</span>}</div>}
                {s.instance.missing.length > 0 && <span className="tiny" style={{ color: "var(--warn)" }}>Not on Modrinth (ask {s.from.username} for these): {s.instance.missing.slice(0, 5).join(", ")}{s.instance.missing.length > 5 ? "…" : ""}</span>}
                {installing?.id === s.id && <div style={{ width: "100%" }}><div className="row tiny muted">{installing.title ? `Downloading ${installing.title}…` : "Starting…"}<span className="spacer" />{installing.done}/{installing.total}</div>
                  <Progress value={installing.total ? Math.round((installing.done / installing.total) * 100) : null} label="Installing shared instance" /></div>}
              </div>))}</div>}
      </Card>

      {shares && shares.sent.length > 0 && (
        <Card title="Sent" icon="upload">
          <div className="stack" style={{ gap: 4 }}>{shares.sent.slice(0, 10).map((s) => (
            <div key={s.id} className="list-item"><Icon name="cube" /><div style={{ flex: 1 }}><b className="small">{s.instance.name}</b><div className="tiny faint">to {s.to.username} · {ago(s.createdAt)} · waiting for them to install</div></div>
              <button className="btn ghost sm" onClick={async () => { await vex().collab.dismiss(s.id); load(); }}>Cancel</button></div>))}</div>
        </Card>
      )}
      {instances.length > 0 && <div className="row"><span className="tiny faint">Tip: once you're both in the same instance, start a world and use “Open to LAN”, or join the same server.</span><span className="spacer" /><button className="btn sm" onClick={() => { const i = instances.find((x) => x.id === settings.selectedInstanceId) ?? instances[0]; play(i.id); }}><Icon name="play" size={13} />Play selected</button></div>}
    </div>
  );
}
