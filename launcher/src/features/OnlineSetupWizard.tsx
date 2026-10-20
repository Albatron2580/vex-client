import { useEffect, useRef, useState } from "react";
import { Modal, Notice } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex } from "../lib/bridge";
import type { SetupState } from "../vex";

const STEPS: [string, string][] = [
  ["node", "Node.js"], ["tools", "Install tools"], ["cloudflare", "Sign in to Cloudflare"], ["database", "Create the friends database"],
  ["deploy", "Put the service online"], ["check", "Check it works"], ["connect", "Connect VEX"],
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
  useEffect(() => { if (s?.finished) toast("success", "VEX online is set up", "You're signed in with your Minecraft account."); }, [s?.finished]);

  const need = s?.need;

  return (
    <Modal title="Set up VEX online" onClose={onClose} wide>
      <div className="stack">
        {!s?.finished && <p className="small muted">This puts Friends, Collab and the admin panel online on your own free Cloudflare account. VEX does every step — you just click <b>Allow</b> in your browser. Players then sign in with their Minecraft account automatically.</p>}
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

        {need?.kind === "cloudflare-login" && <Notice><b>Check your browser.</b> Log in or create a free Cloudflare account, then click <b>Allow</b>. VEX continues by itself.</Notice>}

        {need?.kind === "subdomain" && !s?.running && (
          <Notice kind="warn">
            <b>Cloudflare needs a name for your address</b> (one time only).
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>Click <b>Open Cloudflare</b>. In the menu go to <b>Compute → Workers &amp; Pages</b>.</li>
              <li>On the right, next to <b>Subdomain</b> (or <i>your workers.dev</i>), click <b>Change</b> / <b>Set up</b>.</li>
              <li>Type any name, e.g. your username, and confirm.</li>
              <li>Come back here and click <b>Continue</b>.</li>
            </ol>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => vex().onlineSetup.open("cloudflare")}><Icon name="external" size={14} />Open Cloudflare</button>
              <button className="btn primary sm" onClick={() => vex().onlineSetup.start()}>Continue</button>
            </div>
          </Notice>
        )}

        {s?.error && !s.running && <Notice kind="danger">{s.error}</Notice>}
        {s?.finished && <Notice><b>All done!</b> VEX online runs at <span className="mono">{s.url}</span> and you're signed in with your Minecraft account. Send this address to build it into VEX for your friends.</Notice>}

        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowLog((v) => !v)}><Icon name="info" size={13} />{showLog ? "Hide details" : "Show details"}</button>
        {showLog && <pre ref={logRef} className="setup-log mono">{s?.log.join("\n") || "Nothing yet."}</pre>}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          {!s?.running && !s?.finished && s?.error && <button className="btn" onClick={() => vex().onlineSetup.start()}><Icon name="refresh" size={14} />Retry</button>}
          <button className={`btn ${s?.finished ? "primary" : "ghost"}`} onClick={onClose}>{s?.finished ? "Done" : s?.running ? "Hide (keeps running)" : "Close"}</button>
        </div>
      </div>
    </Modal>
  );
}
