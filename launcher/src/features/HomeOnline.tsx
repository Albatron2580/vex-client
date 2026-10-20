import { useEffect, useState } from "react";
import { Card } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import type { PublicHome, ServerStatus } from "../vex";

/** Announcements from the VEX admins + the featured server, both from VEX online. */
export function HomeOnline() {
  const { account, instances, settings, play, game, toast, go } = useApp();
  const [home, setHome] = useState<PublicHome | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  useEffect(() => {
    if (!account?.configured || !window.vex) return;
    const load = () => window.vex!.online.home().then(setHome).catch(() => {});
    load(); const t = setInterval(load, 5 * 60_000); return () => clearInterval(t);
  }, [account?.configured]);
  useEffect(() => {
    if (!home?.featured) return;
    const load = () => window.vex!.online.serverStatus(home.featured!.address).then(setStatus).catch(() => {});
    load(); const t = setInterval(load, 60_000); return () => clearInterval(t);
  }, [home?.featured?.address]);
  if (!home || (!home.announcements.length && !home.featured)) return null;

  const f = home.featured;
  const join = () => {
    if (!f) return;
    const sel = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0];
    const match = f.version ? instances.find((i) => i.version === f.version) : null;
    const inst = match ?? sel;
    if (!inst) { toast("info", "Create an instance first", f.version ? `This server runs Minecraft ${f.version}.` : undefined); go("instances"); return; }
    const [host, port] = f.address.split(":");
    play(inst.id, { host, port: Number(port) || 25565 });
  };

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      {home.announcements.length > 0 && (
        <Card title="News" icon="megaphone">
          <div className="stack" style={{ gap: 10 }}>{home.announcements.slice(0, 3).map((a) => (
            <div key={a.id} className={`news-item ${a.kind}`}>
              <div className="row" style={{ gap: 6 }}><span className={`chip ${a.kind === "warning" ? "warn" : a.kind === "update" ? "accent" : ""}`}>{a.kind === "update" ? "Update" : a.kind === "warning" ? "Heads up" : "News"}</span>
                <b className="small">{a.title}</b><span className="spacer" /><span className="tiny faint">{new Date(a.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}</span></div>
              <p className="small muted" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{a.body}</p>
              <span className="tiny faint">— {a.author}</span>
            </div>))}</div>
        </Card>
      )}
      {f && (
        <Card title="Featured server" icon="server" glow>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="inst-tile" style={{ width: 48, height: 48, background: "var(--gradient)", color: "#fff", fontSize: 22 }}>{f.name[0]?.toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 17 }}>{f.name}</b>
              <div className="tiny" style={{ color: status?.online ? "var(--ok)" : "var(--text-faint)" }}>
                {status === null ? "Checking…" : status.online ? `● ${status.players?.online ?? 0} / ${status.players?.max ?? 0} online${status.version ? ` · ${status.version}` : ""}` : status.unknown ? "Status unknown" : "Offline"}</div>
              {f.description && <p className="small muted" style={{ marginTop: 4 }}>{f.description}</p>}
              {status?.motd && <p className="tiny faint mono" style={{ marginTop: 4 }}>{status.motd}</p>}
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="mono tiny faint" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{f.address}</span>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(f.address).then(() => toast("success", "Address copied"))}><Icon name="save" size={13} />Copy</button>
            <button className="btn primary sm" disabled={game.state !== "idle"} onClick={join}><Icon name="play" size={13} />Join</button>
          </div>
        </Card>
      )}
    </div>
  );
}
