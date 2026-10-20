import { useCallback, useRef, useState } from "react";
import { vex, errMsg } from "../../lib/bridge";
import { loadRgba } from "../../lib/image";
import type { Rgba } from "../../lib/pixels";

export interface FoundSkin { name: string; uuid: string; model: "classic" | "slim"; dataUrl: string; image: Rgba; hasCape: boolean }
export type LookupState =
  | { status: "idle" } | { status: "loading"; name: string }
  | { status: "error"; reason: string; message: string } | { status: "done"; skin: FoundSkin };

export function useSkinLookup() {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const seq = useRef(0);
  const lookup = useCallback(async (name: string): Promise<FoundSkin | null> => {
    const my = ++seq.current;
    setState({ status: "loading", name });
    try {
      const r = await vex().skins.lookup(name);
      if (my !== seq.current) return null; // a newer search replaced this one
      if (!r.ok) { setState({ status: "error", reason: r.reason, message: r.message }); return null; }
      const image = await loadRgba(r.skinDataUrl);
      const skin: FoundSkin = { name: r.name, uuid: r.uuid, model: r.model, dataUrl: r.skinDataUrl, image, hasCape: !!r.capeDataUrl };
      setState({ status: "done", skin });
      return skin;
    } catch (e) {
      if (my === seq.current) setState({ status: "error", reason: "network", message: errMsg(e) });
      return null;
    }
  }, []);
  return { state, lookup };
}
