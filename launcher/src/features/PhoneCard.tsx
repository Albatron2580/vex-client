import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card, Notice } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { errMsg } from "../lib/bridge";

/** Settings → Phone app: a QR code + one-time code that connects the VEX phone app to your account. */
export function PhoneCard() {
  const { account, desktop } = useApp();
  const [pair, setPair] = useState<{ code: string; expiresAt: number; url: string; appUrl: string; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!pair) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [pair]);
  const left = pair ? Math.max(0, Math.round((pair.expiresAt - now) / 1000)) : 0;
  const make = async () => {
    setBusy(true); setError(null);
    try {
      const p = await window.vex!.online.pairPhone();
      const qr = await QRCode.toDataURL(p.url, { margin: 1, width: 360, color: { dark: "#0c0c0f", light: "#ffffff" }, errorCorrectionLevel: "M" });
      setPair({ ...p, qr }); setNow(Date.now());
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Card title="Phone app" icon="friends" sub="Friends, news, Collab and admin on your phone. Works on iPhone and Android, nothing to install from a store.">
      {!account?.signedIn ? <Notice>Connect to VEX online first (it happens by itself once you're signed in with Microsoft).</Notice>
        : pair && left > 0 ? (
          <div className="phone-pair">
            <img src={pair.qr} alt="QR code that opens the VEX phone app" width={180} height={180} />
            <div className="stack" style={{ gap: 8, minWidth: 0 }}>
              <b>Scan this with your phone's camera</b>
              <span className="small muted">Or open <span className="mono">{pair.appUrl}</span> on your phone and type:</span>
              <span className="phone-code">{pair.code}</span>
              <span className="tiny faint">Works once, for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} more. Then choose “Add to Home Screen” in your phone's browser to keep VEX as an app.</span>
              <div className="row"><button className="btn sm" onClick={make} disabled={busy}><Icon name="refresh" size={14} />New code</button></div>
            </div>
          </div>
        ) : (
          <div className="row wrap">
            <button className="btn primary" disabled={!desktop || busy} onClick={make}>{busy ? <span className="spinner" /> : <Icon name="plus" size={16} />}Connect a phone</button>
            {pair && <span className="small faint">That code expired. Make a new one.</span>}
          </div>
        )}
      {error && <Notice kind="danger">{/404/.test(error) ? "Your online service is older than this VEX. Update it (VEX does this by itself on the PC that set it up)." : error}</Notice>}
    </Card>
  );
}
