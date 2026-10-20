import { useState } from "react";
import { TotemPanel } from "../features/totem/TotemPanel";
import { SkinLookupPanel } from "../features/skinLookup/SkinLookupPanel";
import { CrosshairPanel } from "../features/crosshair/CrosshairPanel";
import { SkyPanel } from "../features/sky/SkyPanel";
import type { FoundSkin } from "../features/skinLookup/useSkinLookup";

export function FeaturesPage() {
  const [forTotem, setForTotem] = useState<FoundSkin | null>(null);
  return (
    <div className="page">
      <div className="page-head"><div><span className="eyebrow">Tools</span><h1>Features</h1><p>Make it yours: custom totems, skin lookup, your own crosshair and sky.</p></div></div>
      <div className="features-grid">
        <TotemPanel incoming={forTotem} />
        <SkinLookupPanel onUseForTotem={(s) => setForTotem({ ...s })} />
        <CrosshairPanel />
        <SkyPanel />
      </div>
    </div>
  );
}
