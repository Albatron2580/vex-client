import { tr } from "../lib/i18n";
import { Card } from "../components/ui";
import { Icon } from "../components/Icon";

export function ShopPage() {
  return (
    <div className="page">
      <div className="page-head"><div><h1>{tr("Shop")}</h1><p>{tr("Optional capes and emotes. Never required to play.")}</p></div></div>
      <Card>
        <div className="empty" style={{ border: 0 }}>
          <Icon name="shop" size={40} /><b style={{ color: "var(--text)", fontSize: 18 }}>{tr("The shop isn't open yet")}</b>
          <span className="small" style={{ maxWidth: 440 }}>{tr("Capes and emotes will be visible to other VEX players once the in-game client and VEX's cosmetics service exist. Every core feature stays free — nothing here will be needed to play.")}</span>
        </div>
      </Card>
    </div>
  );
}
