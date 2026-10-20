import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/AppState";
import { Icon } from "./Icon";
import { Tooltip } from "./ui";

const TILE = ["#7cc4ff", "#7cf0d6", "#ffb37c", "#ff8cc6", "#b48cff", "#ffd27a"];
export const tileColor = (id: string) => TILE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % TILE.length];
const LOADER: Record<string, string> = { vanilla: "Vanilla", fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt" };

/** Floating instance switcher + Play button, shown at the bottom of every page except Home. */
export function PlayBar() {
  const { instances, settings, update, go } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = instances.find((i) => i.id === settings.selectedInstanceId) ?? instances[0] ?? null;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("mousedown", close); addEventListener("keydown", close);
    return () => { removeEventListener("mousedown", close); removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div className="playbar" ref={ref}>
      {open && (
        <div className="playbar-menu" role="listbox" aria-label="Choose instance">
          {instances.map((i) => (
            <button key={i.id} role="option" aria-selected={i.id === sel?.id} className={`list-item ${i.id === sel?.id ? "selected" : ""}`} onClick={() => { update({ selectedInstanceId: i.id }); setOpen(false); }}>
              <span className="inst-tile" style={{ background: tileColor(i.id) }}>{i.name[0]?.toLowerCase()}</span>
              <span style={{ textAlign: "left", minWidth: 0 }}><b className="small">{i.name}</b><span className="tiny faint" style={{ display: "block" }}>{i.version} · {LOADER[i.loader]}</span></span>
            </button>
          ))}
          <button className="list-item" onClick={() => { setOpen(false); go("instances"); }}><span className="inst-tile ghost"><Icon name="plus" size={14} /></span><span className="small">Manage instances</span></button>
        </div>
      )}
      <button className="playbar-inst" onClick={() => (instances.length ? setOpen((o) => !o) : go("instances"))} aria-haspopup="listbox" aria-expanded={open}>
        {sel ? <>
          <span className="inst-tile" style={{ background: tileColor(sel.id) }}>{sel.name[0]?.toLowerCase()}</span>
          <span style={{ textAlign: "left", minWidth: 0 }}><b className="small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{sel.name}</b><span className="tiny faint">{sel.version} · {LOADER[sel.loader]}</span></span>
          <Icon name="chevron" size={14} />
        </> : <><span className="inst-tile ghost"><Icon name="plus" size={14} /></span><span className="small">Create an instance</span></>}
      </button>
      <Tooltip text="Launching arrives in Stage 4 (Microsoft sign-in + game download)">
        <button className="playbar-play" disabled><Icon name="play" size={14} />Play</button>
      </Tooltip>
    </div>
  );
}
