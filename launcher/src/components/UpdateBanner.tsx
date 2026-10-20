import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Progress } from "./ui";
import type { UpdateState } from "../vex";
import { errMsg } from "../lib/bridge";

export function useUpdateState() {
  const [s, setS] = useState<UpdateState>({ status: "idle" });
  useEffect(() => {
    if (!window.vex) return;
    window.vex.updater.state().then(setS).catch(() => {});
    return window.vex.updater.onState(setS);
  }, []);
  return s;
}

/** Shows download progress, then asks to restart once a verified update is ready. */
export function UpdateBanner() {
  const s = useUpdateState();
  const [later, setLater] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (s.status === "downloading") {
    return (
      <div className="update-banner small" role="status">
        <Icon name="download" size={16} /><span>Downloading VEX {s.version}…</span>
        <div style={{ width: 120 }}><Progress value={s.pct} label="Update download" /></div><span className="faint">{s.pct}%</span>
      </div>
    );
  }
  if (s.status !== "ready" || later === s.version) return null;
  return (
    <div className="update-banner glow" role="alertdialog" aria-label="Update ready">
      <Icon name="sparkle" size={18} />
      <div style={{ minWidth: 0 }}>
        <b>VEX {s.version} is ready</b>
        <div className="tiny muted">{error ?? "Restart to finish updating. It takes a few seconds."}</div>
      </div>
      <button className="btn ghost sm" onClick={() => setLater(s.version)}>Later</button>
      <button className="btn primary sm" onClick={async () => { try { await window.vex!.updater.install(); } catch (e) { setError(errMsg(e)); } }}><Icon name="refresh" size={14} />Restart now</button>
    </div>
  );
}
