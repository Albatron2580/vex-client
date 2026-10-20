import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Notice, SearchBar } from "../components/ui";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Shell";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import type { Friend } from "../vex";
import { OnlineSetupWizard } from "../features/OnlineSetupWizard";

type Lists = { friends: Friend[]; incoming: Friend[]; outgoing: Friend[] };
type Found = Friend & { relation: "none" | "friends" | "outgoing" | "incoming" };

const ago = (t?: number | null) => {
  if (!t) return "Offline";
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `Last seen ${m} min ago` : m < 1440 ? `Last seen ${Math.round(m / 60)} h ago` : `Last seen ${Math.round(m / 1440)} d ago`;
};

export function SignInCard({ compact }: { compact?: boolean }) {
  const { account, toast, desktop } = useApp();
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState(false);
  // The wizard stays mounted after setup connects VEX, so it can show "All done".
  const wiz = wizard && <OnlineSetupWizard onClose={() => setWizard(false)} />;
  if (!account?.configured) return (
    <div className="stack" style={{ alignItems: compact ? "flex-start" : "center", textAlign: compact ? "left" : "center", gap: 10 }}>
      {!compact && <><Icon name="friends" size={40} /><b style={{ fontSize: 18 }}>Set up VEX online</b></>}
      <span className="small muted" style={{ maxWidth: 460 }}>Friends and Modrinth sign-in need the VEX online service. VEX can set it up for you on a free Cloudflare account — it takes a few minutes.</span>
      <button className="btn primary" disabled={!desktop} onClick={() => setWizard(true)}><Icon name="sparkle" size={16} />Set up online service</button>
      {wiz}
    </div>
  );
  const signIn = async () => {
    setBusy(true);
    try { const s = await vex().account.login(); toast("success", `Signed in as ${s.profile?.username}`); }
    catch (e) { toast("error", "Sign-in didn't finish", errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ alignItems: compact ? "flex-start" : "center", textAlign: compact ? "left" : "center", gap: 10 }}>
      {!compact && <><Icon name="friends" size={40} /><b style={{ fontSize: 18 }}>Sign in to see your friends</b>
        <span className="small muted" style={{ maxWidth: 440 }}>Use your Modrinth account. Your browser opens Modrinth's own login page — VEX never sees your password, and it doesn't touch your Minecraft account.</span></>}
      <div className="row">
        <button className="btn primary" disabled={!desktop || busy} onClick={signIn}>{busy ? <span className="spinner" /> : <Icon name="user" size={16} />}{busy ? "Waiting for your browser…" : "Sign in with Modrinth"}</button>
        {busy && <button className="btn ghost sm" onClick={() => vex().account.cancel()}>Cancel</button>}
      </div>
      {!account.persistent && <span className="hint">This PC can't encrypt saved sign-ins, so you'll sign in again next time.</span>}
      {wiz}
    </div>
  );
}

function Row({ f, children }: { f: Friend; children?: React.ReactNode }) {
  const state = f.online ? (f.status === "playing" ? "playing" : "online") : "offline";
  return (
    <div className="list-item">
      <span style={{ position: "relative" }}><Avatar name={f.username} url={f.avatar} size={36} />{f.online !== undefined && <span className={`presence-dot ${state}`} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="small">{f.username}</b>
        {f.online !== undefined && <div className="tiny" style={{ color: f.online ? (state === "playing" ? "var(--accent)" : "var(--ok)") : "var(--text-faint)" }}>
          {f.online ? (state === "playing" ? `Playing${f.detail ? ` · ${f.detail}` : ""}` : f.detail ?? "Online") : ago(f.lastSeen)}</div>}
      </div>
      <div className="row" style={{ gap: 6 }}>{children}</div>
    </div>
  );
}

export function FriendsPage() {
  const { account, toast } = useApp();
  const [lists, setLists] = useState<Lists | null>(null);
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);
  const signedIn = !!account?.signedIn;

  const load = useCallback(async () => {
    try { setLists(await vex().friends.list()); setError(null); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { if (!signedIn) return; load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [signedIn, load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound(null); return; }
    const my = ++seq.current; setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await vex().friends.search(term); if (my === seq.current) setFound(r); }
      catch (e) { if (my === seq.current) setError(errMsg(e)); }
      finally { if (my === seq.current) setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const act = async (id: string, kind: "add" | "remove", msg: string) => {
    setBusyId(id);
    try {
      const r = await vex().friends[kind](id);
      setFound((f) => f?.map((x) => (x.id === id ? { ...x, relation: r.relation as Found["relation"] } : x)) ?? null);
      await load(); toast("success", msg);
    } catch (e) { toast("error", "That didn't work", errMsg(e)); }
    finally { setBusyId(null); }
  };

  if (!signedIn) return (
    <div className="page">
      <div className="page-head"><div><span className="eyebrow">Social</span><h1>Friends</h1><p>See who's online and join them.</p></div></div>
      <Card><div style={{ padding: "24px 0" }}><SignInCard /></div></Card>
    </div>
  );

  const online = lists?.friends.filter((f) => f.online).length ?? 0;
  const reqCount = (lists?.incoming.length ?? 0);
  return (
    <div className="page">
      <div className="page-head">
        <div><span className="eyebrow">Social</span><h1>Friends</h1><p>{lists ? `${online} of ${lists.friends.length} online` : "Loading…"}</p></div>
        <button className="btn sm" onClick={load}><Icon name="refresh" size={14} />Refresh</button>
      </div>
      <Card title="Add friends" icon="search" sub="Search by Modrinth username. Only people who've signed in to VEX show up.">
        <SearchBar value={q} onChange={setQ} placeholder="Search players" />
        {q.trim().length >= 2 && (
          <div className="stack" style={{ gap: 4, marginTop: 10 }}>
            {searching && !found && <div className="row small muted"><span className="spinner" />Searching…</div>}
            {found?.length === 0 && <p className="small faint">Nobody called “{q.trim()}” has signed in to VEX yet. Ask them to install VEX and sign in with Modrinth.</p>}
            {found?.map((f) => (
              <Row key={f.id} f={f}>
                {f.relation === "none" && <button className="btn primary sm" disabled={busyId === f.id} onClick={() => act(f.id, "add", `Friend request sent to ${f.username}`)}><Icon name="plus" size={14} />Add</button>}
                {f.relation === "outgoing" && <><span className="chip">Requested</span><button className="btn ghost sm" disabled={busyId === f.id} onClick={() => act(f.id, "remove", "Request cancelled")}>Cancel</button></>}
                {f.relation === "incoming" && <button className="btn primary sm" disabled={busyId === f.id} onClick={() => act(f.id, "add", `You and ${f.username} are now friends`)}><Icon name="check" size={14} />Accept</button>}
                {f.relation === "friends" && <span className="chip ok">Friends</span>}
              </Row>
            ))}
          </div>
        )}
      </Card>
      {error && <Notice kind="danger">{error}</Notice>}
      <Card>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "friends"} onClick={() => setTab("friends")}>Friends<span className="count">{lists?.friends.length ?? 0}</span></button>
          <button role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>Requests{reqCount > 0 && <span className="count">{reqCount}</span>}</button>
        </div>
        <div className="stack" style={{ gap: 4, marginTop: 12 }}>
          {!lists ? <div className="row small muted"><span className="spinner" />Loading…</div> : tab === "friends" ? (
            lists.friends.length ? lists.friends.map((f) => (
              <Row key={f.id} f={f}><button className="btn ghost sm danger" disabled={busyId === f.id} onClick={() => act(f.id, "remove", `Removed ${f.username}`)} aria-label={`Remove ${f.username}`}><Icon name="trash" size={14} /></button></Row>
            )) : <div className="empty"><Icon name="friends" size={30} /><span className="small">No friends yet — search above to add some.</span></div>
          ) : (
            <>
              <div className="label">Incoming</div>
              {lists.incoming.length ? lists.incoming.map((f) => (
                <Row key={f.id} f={f}>
                  <button className="btn primary sm" disabled={busyId === f.id} onClick={() => act(f.id, "add", `You and ${f.username} are now friends`)}><Icon name="check" size={14} />Accept</button>
                  <button className="btn ghost sm" disabled={busyId === f.id} onClick={() => act(f.id, "remove", "Request declined")}>Decline</button>
                </Row>
              )) : <p className="small faint">No requests waiting.</p>}
              <div className="label" style={{ marginTop: 10 }}>Sent</div>
              {lists.outgoing.length ? lists.outgoing.map((f) => (
                <Row key={f.id} f={f}><span className="chip">Pending</span><button className="btn ghost sm" disabled={busyId === f.id} onClick={() => act(f.id, "remove", "Request cancelled")}>Cancel</button></Row>
              )) : <p className="small faint">No sent requests.</p>}
            </>
          )}
        </div>
      </Card>
      <p className="tiny faint">Friends only see your username, picture and whether you're online. VEX stores your Modrinth name and picture, nothing else.</p>
    </div>
  );
}
