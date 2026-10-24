import { tr } from "../lib/i18n";
import { useState } from "react";
import { useApp } from "../state/AppState";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { errMsg } from "../lib/bridge";

/** Shown when no Microsoft account is signed in. */
export function LoginScreen({ onSkip }: { onSkip(): void }) {
  const { refreshMs, toast, ms } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = ms?.accounts.find((a) => a.active && a.needsLogin);
  const signIn = async () => {
    setBusy(true); setError(null);
    try { await window.vex!.ms.add(); await refreshMs(); toast("success", tr("Welcome to VEX CLIENT")); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="login-screen" role="dialog" aria-modal="true" aria-label={tr("Sign in")}>
      <div className="login-card card glow">
        <Logo size={72} />
        <h1>VEX CLIENT</h1>
        <p className="muted">{expired ? tr("Your sign-in for {0} expired. Sign in again to play.", expired.name) : tr("Sign in with the Microsoft account you play Minecraft with.")}</p>
        <button className="btn primary login-btn" disabled={busy} onClick={signIn}>
          {busy ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : <Icon name="user" size={18} />}{busy ? tr("Waiting for Microsoft…") : tr("Sign in with Microsoft")}
        </button>
        {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
        <ul className="login-points small muted">
          <li><Icon name="lock" size={14} />{tr("You sign in on Microsoft's own page — VEX never sees your password.")}</li>
          <li><Icon name="friends" size={14} />{tr("The same account connects you to friends, Collab and VEX online.")}</li>
          <li><Icon name="cube" size={14} />{tr("Needs Minecraft: Java Edition to play.")}</li>
        </ul>
        <button className="btn ghost sm" onClick={onSkip}>{tr("Skip for now")}</button>
      </div>
    </div>
  );
}
