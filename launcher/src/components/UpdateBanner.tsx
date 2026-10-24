import { tr } from "../lib/i18n";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Modal, Progress } from "./ui";
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
        <Icon name="download" size={16} /><span>{tr("Downloading VEX")}{" "}{s.version}…</span>
        <div style={{ width: 120 }}><Progress value={s.pct} label={tr("Update download")} /></div><span className="faint">{s.pct}%</span>
      </div>
    );
  }
  if (s.status !== "ready" || later === s.version) return null;
  return (
    <div className="update-banner glow" role="alertdialog" aria-label={tr("Update ready")}>
      <Icon name="sparkle" size={18} />
      <div style={{ minWidth: 0 }}>
        <b>VEX {s.version} {tr("is ready")}</b>
        <div className="tiny muted">{error ?? (firstLine(s.notes) || tr("Restart to finish updating. It takes a few seconds."))}</div>
      </div>
      <button className="btn ghost sm" onClick={() => setLater(s.version)}>{tr("Later")}</button>
      <button className="btn primary sm" onClick={async () => { try { await window.vex!.updater.install(); } catch (e) { setError(errMsg(e)); } }}><Icon name="refresh" size={14} />{tr("Restart now")}</button>
    </div>
  );
}

const clean = (l: string) => l.replace(/^[\s>#*-]+/, "").replace(/[*_`]/g, "").trim();
export const firstLine = (notes: string) => (notes || "").split(/\r?\n/).map(clean).find(Boolean) ?? "";

/** After VEX updated itself: what's new, once. */
export function WhatsNew() {
  const [u, setU] = useState<{ version: string; notes: string } | null>(null);
  useEffect(() => { window.vex?.updater.justUpdated().then(setU).catch(() => {}); }, []);
  if (!u) return null;
  const lines = u.notes.split(/\r?\n/).map(clean).filter(Boolean).slice(0, 12);
  return (
    <Modal title={tr("VEX updated to {0}", u.version)} onClose={() => setU(null)}>
      <div className="stack">
        <span className="small muted">{tr("Here's what's new:")}</span>
        {lines.length ? <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>{lines.map((l, i) => <li key={i} className="small">{l}</li>)}</ul>
          : <span className="small">{tr("Fixes and improvements.")}</span>}
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={() => setU(null)}>{tr("Nice!")}</button></div>
      </div>
    </Modal>
  );
}
