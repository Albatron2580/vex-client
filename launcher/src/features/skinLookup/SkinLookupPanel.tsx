import { useState } from "react";
import { Card, Notice, PixelImage, Tooltip } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useApp } from "../../state/AppState";
import { useSkinLookup, type FoundSkin } from "./useSkinLookup";
import { renderFrontView } from "../totem/totemLayout";
import { dataUrlToBytes } from "../../lib/image";
import { vex, errMsg } from "../../lib/bridge";

const SUGGESTIONS = ["Notch", "jeb_", "Dinnerbone", "Grumm", "Dream"];

export function SkinLookupPanel({ onUseForTotem, onSaved, compact }: { onUseForTotem?(s: FoundSkin): void; onSaved?(): void; compact?: boolean }) {
  const { toast, desktop } = useApp();
  const { state, lookup } = useSkinLookup();
  const [name, setName] = useState("");
  const valid = /^[A-Za-z0-9_]{3,16}$/.test(name.trim());
  const search = (n = name) => { setName(n); if (/^[A-Za-z0-9_]{3,16}$/.test(n.trim())) lookup(n.trim()); };

  const download = async (s: FoundSkin) => {
    try { const r = await vex().files.saveAs(`${s.name}-skin`, "png", dataUrlToBytes(s.dataUrl)); if (r.ok) toast("success", "Skin saved", r.path); }
    catch (e) { toast("error", "Couldn't save the skin", errMsg(e)); }
  };
  const saveToLibrary = async (s: FoundSkin) => {
    try { await vex().skins.add(s.name, s.model, dataUrlToBytes(s.dataUrl)); toast("success", `${s.name} added to your skin library`); onSaved?.(); }
    catch (e) { toast("error", "Couldn't add the skin", errMsg(e)); }
  };

  return (
    <Card title="Skin Lookup" icon="search" glow={!compact} sub="Find any Java player's public skin via Mojang's official API.">
      <div className="stack">
        <div className="row">
          <div className="search" style={{ flex: 1 }}>
            <Icon name="search" size={16} />
            <input className="input" placeholder="Minecraft username" aria-label="Minecraft username" spellCheck={false} maxLength={16}
              value={name} aria-invalid={name.length > 0 && !valid} onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <button className="btn primary" disabled={!valid || state.status === "loading" || !desktop} onClick={() => search()}>
            {state.status === "loading" ? <span className="spinner" /> : <Icon name="search" size={16} />}Search
          </button>
        </div>
        {name.length > 0 && !valid && <span className="hint">3–16 characters: letters, numbers and _</span>}
        <div className="row wrap tiny faint">Try:
          {SUGGESTIONS.map((s) => <button key={s} className="chip" style={{ cursor: "pointer" }} onClick={() => search(s)} disabled={!desktop}>{s}</button>)}
        </div>

        <div style={{ minHeight: 236, display: "grid", placeItems: "center" }}>
          {state.status === "idle" && <div className="empty" style={{ width: "100%" }}><Icon name="user" size={30} /><span className="small">Search a username to preview their skin</span></div>}
          {state.status === "loading" && <div className="row muted small"><span className="spinner" />Looking up {state.name}…</div>}
          {state.status === "error" && (
            <div style={{ width: "100%" }}>
              <Notice kind={state.reason === "not-found" || state.reason === "invalid" ? "warn" : "danger"}>
                <b>{state.reason === "not-found" ? "Not found" : state.reason === "rate-limited" ? "Slow down" : state.reason === "invalid" ? "Invalid name" : "Network problem"}</b><br />{state.message}
              </Notice>
              {(state.reason === "network" || state.reason === "rate-limited") && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => search()}><Icon name="refresh" size={14} />Try again</button>}
            </div>
          )}
          {state.status === "done" && (
            <div className="row" style={{ gap: 20, width: "100%", alignItems: "center" }}>
              <div style={{ padding: 12, borderRadius: "var(--r-lg)", background: "radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)" }}>
                <PixelImage image={renderFrontView(state.skin.image, state.skin.model === "slim")} scale={7} label={`${state.skin.name}'s skin, front view`} />
              </div>
              <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                <div><h3 style={{ fontSize: 20 }}>{state.skin.name}</h3>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <span className="chip accent">{state.skin.model === "slim" ? "Slim arms" : "Classic arms"}</span>
                    {state.skin.hasCape && <span className="chip">Has cape</span>}
                  </div>
                </div>
                <PixelImage image={state.skin.image} scale={1.5} label="Raw skin texture" />
                <div className="row wrap">
                  <button className="btn sm" onClick={() => download(state.skin)}><Icon name="download" size={14} />Download</button>
                  <button className="btn sm" onClick={() => saveToLibrary(state.skin)}><Icon name="plus" size={14} />Library</button>
                  {onUseForTotem && <button className="btn sm" onClick={() => onUseForTotem(state.skin)}><Icon name="totem" size={14} />Totem</button>}
                  <Tooltip text="Changing your own skin needs Microsoft sign-in, which arrives in Stage 4.">
                    <button className="btn sm" disabled><Icon name="lock" size={14} />Apply</button>
                  </Tooltip>
                </div>
              </div>
            </div>
          )}
        </div>
        {!desktop && <Notice kind="warn">Lookups run in the desktop app.</Notice>}
      </div>
    </Card>
  );
}
