import { tr } from "../lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import type { GameEvent, LogSession } from "../vex";

// Separate "Minecraft Logs" window. Closing it never stops the game.
const levelOf = (l: string) => /\/(ERROR|FATAL)\]|Exception|\bERROR\b/.test(l) ? "err" : /\/WARN\]|\bWARN\b/.test(l) ? "warn" : /^\[VEX\]/.test(l) ? "vex" : "";
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function LogsApp() {
  const [sessions, setSessions] = useState<LogSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = tr("Minecraft Logs");
    const refresh = () => window.vex?.game.logSessions().then((s) => {
      setSessions(s);
      setSelected((cur) => (cur && s.some((x) => x.id === cur) ? cur : s.find((x) => x.state !== "closed")?.id ?? s[0]?.id ?? null));
    });
    refresh();
    let pending: number | null = null;
    const off = window.vex?.game.onEvent((ev: GameEvent) => {
      if (ev.type === "accounts" || ev.type === "task") return;
      if (pending == null) pending = window.setTimeout(() => { pending = null; refresh(); }, 120); // batch bursts of log lines
    });
    return () => { off?.(); if (pending) clearTimeout(pending); };
  }, []);

  const s = sessions.find((x) => x.id === selected) ?? null;
  const lines = useMemo(() => {
    if (!s) return [];
    const f = filter.trim().toLowerCase();
    return f ? s.lines.filter((l) => l.toLowerCase().includes(f)) : s.lines;
  }, [s, filter]);
  useEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines.length, follow, selected]);
  const running = sessions.filter((x) => x.state !== "closed").length;

  return (
    <div className="logs-app">
      <header className="logs-titlebar">
        <span><Logo size={18} glow={false} /><span>Minecraft <span className="v">{tr("Logs")}</span></span></span>
        <div className="win-btns">
          <button onClick={() => window.vex?.win.minimize()} aria-label={tr("Minimise")}><Icon name="min" size={14} /></button>
          <button onClick={() => window.vex?.win.maximize()} aria-label={tr("Maximise")}><Icon name="max" size={12} /></button>
          <button className="close" onClick={() => window.vex?.win.close()} aria-label={tr("Close log window (the game keeps running)")} title={tr("Close (the game keeps running)")}><Icon name="close" size={14} /></button>
        </div>
      </header>
      <div className="logs-body">
        <main className="logs-main">
          {!s ? (
            <div className="logs-empty"><Icon name="server" size={36} /><b>{tr("No game running")}</b><span>{tr("Press Play in VEX — its log shows up here live.")}</span></div>
          ) : (
            <>
              <div className="logs-toolbar">
                <b>{s.name}</b>
                <span className={`logs-state ${s.state}`}>{s.state === "running" ? tr("Running") : s.state === "starting" ? tr("Starting") : tr("Closed {0}", s.endedAt ? time(s.endedAt) : "")}</span>
                <span className="spacer" />
                <input className="input" placeholder={tr("Filter")} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200, height: 30 }} />
                <label className="logs-check"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />{tr("Follow")}</label>
                <button className="btn sm" onClick={() => { navigator.clipboard.writeText(s.lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1200); }}><Icon name={copied ? "check" : "save"} size={13} />{copied ? tr("Copied") : tr("Copy")}</button>
                <button className="btn sm" onClick={() => window.vex?.game.openLog()}><Icon name="folder" size={13} />{tr("Log file")}</button>
                {s.state !== "closed" && <button className="btn sm danger" onClick={() => window.vex?.game.stop()}><Icon name="close" size={13} />{tr("Stop game")}</button>}
              </div>
              <div ref={box} className="logs-lines mono" onScroll={(e) => { const el = e.currentTarget; const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40; if (atEnd !== follow) setFollow(atEnd); }}>
                {lines.length ? lines.map((l, i) => <div key={i} className={levelOf(l)}>{l}</div>) : <div className="faint">{filter ? tr("No lines match.") : tr("Waiting for output…")}</div>}
              </div>
            </>
          )}
        </main>
        <aside className="logs-side">
          <div className="logs-side-title">{tr("Instances")}</div>
          {!sessions.length ? (
            <div className="logs-none"><Icon name="play" size={24} /><span>{tr("No active instances")}</span></div>
          ) : sessions.map((x) => (
            <button key={x.id} className={`logs-inst ${x.id === selected ? "on" : ""}`} onClick={() => setSelected(x.id)}>
              <i className={`dot ${x.state}`} />
              <span style={{ flex: 1, minWidth: 0 }}><b>{x.name}</b><span>{x.state === "closed" ? tr("Closed · {0}", time(x.endedAt ?? x.startedAt)) : tr("{0} · since {1}", x.state === "running" ? "Running" : "Starting", time(x.startedAt))}</span></span>
            </button>
          ))}
          <div className="logs-count">{running > 0 && <i className="dot" />}{running} running</div>
        </aside>
      </div>
    </div>
  );
}
