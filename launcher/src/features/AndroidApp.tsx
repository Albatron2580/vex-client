import { tr } from "../lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { Card, Notice } from "../components/ui";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { AndroidStatus } from "../vex";

const LISTING = {
  name: "VEX — Minecraft crew companion",
  short: "Friends, news and shared instances from VEX CLIENT, on your phone.",
  full: `VEX is the phone companion for VEX CLIENT, the Minecraft launcher you and your friends use on PC.

• See which friends are online and what they're playing
• Search players, add friends, accept or decline requests
• Read VEX news and grab the featured server's address in one tap
• See instances your friends sent you with Collab, ready to install on your PC
• Admins: post news, set the featured server, handle bug reports and moderate players

Connecting is quick: in VEX CLIENT on your PC, open Settings → Phone app → Connect a phone and type the code. Your Microsoft password never touches VEX.

No ads. No trackers.

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.`,
};

/** Admin → Android app: build the app on GitHub, sign it for Google Play, and walk through the Play Console. */
export function AndroidApp() {
  const { toast, settings, account } = useApp();
  const [st, setSt] = useState<AndroidStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<{ code: string; expiresAt: number } | null>(null);
  const load = useCallback(() => vex().android.status().then(setSt).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const running = st?.runs.some((r) => r.status !== "completed");
  useEffect(() => { if (!running) return; const t = setInterval(load, 15_000); return () => clearInterval(t); }, [running, load]);
  const run = async (key: string, fn: () => Promise<AndroidStatus>, ok: string) => {
    setBusy(key);
    try { setSt(await fn()); toast("success", ok); } catch (e) { toast("error", tr("That didn't work"), errMsg(e)); } finally { setBusy(null); }
  };
  const copy = (t: string, what: string) => navigator.clipboard.writeText(t).then(() => toast("success", `${what} copied`));
  const service = (settings.onlineServiceUrl || account?.serviceUrl || "").replace(/\/+$/, "");
  const lastRun = st?.runs[0];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card title={tr("The app")} icon="phone" sub={tr("VEX for Android: the phone app (friends, news, Collab, admin) as a real app. GitHub builds it.")}>
          {!st ? <div className="row small muted"><span className="spinner" />{tr("Loading…")}</div> : (
            <div className="stack">
              {st.release ? (
                <dl className="status-list">
                  <dt>{tr("Last build")}</dt><dd>{new Date(st.release.builtAt).toLocaleString()}</dd>
                  <dt>{tr("Ready for Google Play")}</dt><dd>{st.release.signed ? <span className="chip ok"><span className="dot" />{tr("Signed")}</span> : <span className="chip warn">{tr("Not signed yet")}</span>}</dd>
                  <dt>{tr("VEX online built in")}</dt><dd className="small">{service || tr("Asks on first start")}</dd>
                </dl>
              ) : <Notice>{tr("No Android build yet. Set up signing below, or start a build.")}</Notice>}
              {lastRun && lastRun.status !== "completed" && <div className="row small muted"><span className="spinner" />{tr("Building… (about 5 minutes)")}</div>}
              {lastRun && lastRun.status === "completed" && lastRun.conclusion !== "success" && <Notice kind="danger">{tr("The last build failed.")}{" "}<button className="btn ghost sm" onClick={() => vex().android.open(lastRun.url)}>{tr("See why")}</button></Notice>}
              <div className="row wrap">
                {st.release?.apk && <button className="btn" onClick={() => vex().android.open("https://github.com/Albatron2580/vex-client/releases/tag/android")}><Icon name="download" size={15} />{tr("Download APK / AAB")}</button>}
                <button className="btn" disabled={!st.githubConnected || !!busy || running} onClick={() => run("build", () => vex().android.build(), "Android build started (about 5 minutes)")}>{busy === "build" ? <span className="spinner" /> : <Icon name="refresh" size={15} />}{tr("Build again")}</button>
              </div>
              {!st.githubConnected && <Notice kind="warn">{tr("Connect GitHub first in")}{" "}<b>{tr("Publish update")}</b> {tr("(the token also needs")}{" "}<b>{tr("Secrets: Read and write")}</b>).</Notice>}
              <span className="tiny faint">{tr("The APK installs directly on any Android phone (allow \"install unknown apps\"). The AAB is the file Google Play wants.")}</span>
            </div>
          )}
        </Card>

        <Card title={tr("Google Play signing")} icon="lock" sub={tr("Google Play needs every version signed with the same upload key. VEX makes one on this PC, keeps a backup in your Documents, and gives GitHub an encrypted copy.")}>
          {st?.signingSetUp ? (
            <div className="stack">
              <span className="chip ok" style={{ alignSelf: "flex-start" }}><span className="dot" />{tr("Upload key made")}</span>
              <span className="small muted">{tr("Backup:")}{" "}<span className="mono">{st.backupDir}</span>{tr(". Keep that folder safe and private; you need it for every update.")}</span>
              <div className="row wrap">
                <button className="btn" onClick={() => vex().android.openBackup()}><Icon name="folder" size={15} />{tr("Open backup folder")}</button>
                <button className="btn" disabled={!st.githubConnected || !!busy} onClick={() => run("sign", () => vex().android.setupSigning(), "Signing re-sent to GitHub, building")}>{busy === "sign" ? <span className="spinner" /> : <Icon name="refresh" size={15} />}{tr("Send key to GitHub again")}</button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <button className="btn primary" disabled={!st?.githubConnected || !!busy} onClick={() => run("sign", () => vex().android.setupSigning(), "Upload key made and the signed build started")}>
                {busy === "sign" ? <span className="spinner" /> : <Icon name="lock" size={15} />}{tr("Set up Play Store signing")}</button>
              <span className="tiny faint">{tr("Takes a few seconds. Builds the signed app afterwards.")}</span>
            </div>
          )}
        </Card>
      </div>

      <Card title={tr("Put it on Google Play")} icon="upload" sub={tr("Only you can do these steps: Google needs your own developer account. Everything VEX can prepare is ready below.")}>
        <ol className="play-steps">
          <li><b>{tr("Make a Google Play developer account")}</b> {tr("(one-time 25 USD, needs ID check).")}{" "}<button className="btn ghost sm" onClick={() => vex().android.open("https://play.google.com/console/signup")}><Icon name="external" size={13} />{tr("Open")}</button></li>
          <li><b>{tr("Create app")}</b> {tr("→ name")}{" "}<i>VEX</i>{tr(", App, Free. Turn on")}{" "}<b>{tr("Play App Signing")}</b> {tr("when asked (recommended).")}</li>
          <li><b>{tr("Store listing:")}</b> {tr("paste the texts, upload the icon, feature graphic and screenshots from the")}{" "}<b>{tr("store kit")}</b>.
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={() => copy(LISTING.name, "App name")}>{tr("Copy name")}</button>
              <button className="btn sm" onClick={() => copy(LISTING.short, "Short description")}>{tr("Copy short description")}</button>
              <button className="btn sm" onClick={() => copy(LISTING.full, "Full description")}>{tr("Copy full description")}</button>
              {st?.release?.kit && <button className="btn sm" onClick={() => vex().android.open("https://github.com/Albatron2580/vex-client/releases/tag/android")}><Icon name="download" size={13} />{tr("Store kit")}</button>}
            </div></li>
          <li><b>{tr("Privacy policy URL:")}</b> {service ? <><span className="mono">{service}/privacy</span> <button className="btn ghost sm" onClick={() => copy(`${service}/privacy`, "Privacy URL")}>{tr("Copy")}</button></> : tr("your VEX online address + /privacy")}</li>
          <li><b>{tr("App access:")}</b> {tr("choose \"All or some functionality is restricted\" and give Google a review code (works 30 days, signs in as a demo player, not as you).")}
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn sm" disabled={!account?.signedIn || busy === "review"} onClick={async () => { setBusy("review"); try { setReview(await vex().android.reviewCode()); } catch (e) { toast("error", tr("Couldn't make a review code"), errMsg(e)); } finally { setBusy(null); } }}>{tr("Make a review code")}</button>
              {review && <><span className="phone-code" style={{ fontSize: 20 }}>{review.code}</span><button className="btn ghost sm" onClick={() => copy(`Server: ${service}\nCode: ${review.code}\nOpen the app, enter the server address if asked, then type the code.`, "Review instructions")}>{tr("Copy instructions")}</button></>}
            </div></li>
          <li><b>{tr("Data safety, content rating, target audience:")}</b> {tr("answers are in")}{" "}<span className="mono">listing.md</span> {tr("in the store kit (13+, no ads, collects Minecraft name/UUID only).")}</li>
          <li><b>{tr("Release:")}</b> {tr("Testing → Internal testing (or Production) → Create release → upload")}{" "}<span className="mono">vex-android.aab</span> {tr("→ Save → Send for review. New personal accounts must first run a closed test with 12 testers for 14 days.")}</li>
        </ol>
      </Card>
    </div>
  );
}
