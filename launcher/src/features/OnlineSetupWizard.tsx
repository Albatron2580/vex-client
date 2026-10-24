import { tr } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Modal, Notice } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex } from "../lib/bridge";
import type { SetupState } from "../vex";

const STEPS: [string, string][] = [
  ["node", tr("Node.js")], ["tools", tr("Install tools")], ["cloudflare", tr("Sign in to Cloudflare")], ["database", tr("Create the friends database")],
  ["deploy", tr("Put the service online")], ["check", tr("Check it works")], ["connect", tr("Connect VEX")],
];

export function OnlineSetupWizard({ onClose }: { onClose(): void }) {
  const { toast } = useApp();
  const [s, setS] = useState<SetupState | null>(null);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    vex().onlineSetup.state().then((st) => { setS(st); if (!st.running && !st.finished) vex().onlineSetup.start(); });
    return vex().onlineSetup.onState(setS);
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [s?.log.length, showLog]);
  useEffect(() => { if (s?.finished) toast("success", tr("VEX online is set up"), tr("You're signed in with your Minecraft account.")); }, [s?.finished]);

  const need = s?.need;

  return (
    <Modal title={tr("Set up VEX online")} onClose={onClose} wide>
      <div className="stack">
        {!s?.finished && <p className="small muted">{tr("This puts Friends, Collab and the admin panel online on your own free Cloudflare account. VEX does every step — you just click")}{" "}<b>{tr("Allow")}</b> {tr("in your browser. Players then sign in with their Minecraft account automatically.")}</p>}
        <ol className="setup-steps">
          {STEPS.map(([id, label]) => {
            const st = s?.steps[id as keyof SetupState["steps"]];
            const status = st?.status ?? "pending";
            return (
              <li key={id} className={`setup-step ${status}`}>
                <span className="setup-icon">{status === "running" ? <span className="spinner" /> : status === "done" ? <Icon name="check" size={14} /> : status === "error" ? <Icon name="alert" size={14} /> : status === "waiting" ? <Icon name="user" size={13} /> : null}</span>
                <span style={{ flex: 1 }}><b className="small">{label}</b>{st?.detail && <span className="tiny" style={{ display: "block", color: status === "error" ? "var(--danger)" : "var(--text-faint)" }}>{st.detail}</span>}</span>
              </li>
            );
          })}
        </ol>

        {need?.kind === "cloudflare-login" && <Notice><b>{tr("Check your browser.")}</b> {tr("Log in or create a free Cloudflare account, then click")}{" "}<b>{tr("Allow")}</b>{tr(". VEX continues by itself.")}</Notice>}

        {need?.kind === "subdomain" && !s?.running && (
          <Notice kind="warn">
            <b>{tr("Cloudflare needs a name for your address")}</b> {tr("(one time only).")}
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>{tr("Click")}{" "}<b>{tr("Open Cloudflare")}</b>{tr(". In the menu go to")}{" "}<b>{tr("Compute → Workers & Pages")}</b>.</li>
              <li>{tr("On the right, next to")}{" "}<b>{tr("Subdomain")}</b> {tr("(or")}{" "}<i>{tr("your workers.dev")}</i>{tr("), click")}{" "}<b>{tr("Change")}</b> / <b>{tr("Set up")}</b>.</li>
              <li>{tr("Type any name, e.g. your username, and confirm.")}</li>
              <li>{tr("Come back here and click")}{" "}<b>{tr("Continue")}</b>.</li>
            </ol>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => vex().onlineSetup.open("cloudflare")}><Icon name="external" size={14} />{tr("Open Cloudflare")}</button>
              <button className="btn primary sm" onClick={() => vex().onlineSetup.start()}>{tr("Continue")}</button>
            </div>
          </Notice>
        )}

        {s?.error && !s.running && <Notice kind="danger">{s.error}</Notice>}
        {s?.finished && <Notice><b>{tr("All done!")}</b> {tr("VEX online runs at")}{" "}<span className="mono">{s.url}</span> {tr("and you're signed in with your Minecraft account. Send this address to build it into VEX for your friends.")}</Notice>}

        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowLog((v) => !v)}><Icon name="info" size={13} />{showLog ? tr("Hide details") : tr("Show details")}</button>
        {showLog && <pre ref={logRef} className="setup-log mono">{s?.log.join("\n") || tr("Nothing yet.")}</pre>}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          {!s?.running && !s?.finished && s?.error && <button className="btn" onClick={() => vex().onlineSetup.start()}><Icon name="refresh" size={14} />{tr("Retry")}</button>}
          <button className={`btn ${s?.finished ? "primary" : "ghost"}`} onClick={onClose}>{s?.finished ? tr("Done") : s?.running ? tr("Hide (keeps running)") : tr("Close")}</button>
        </div>
      </div>
    </Modal>
  );
}
