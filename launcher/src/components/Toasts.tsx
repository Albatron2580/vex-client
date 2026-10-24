import { tr } from "../lib/i18n";
import { useApp } from "../state/AppState";
import { Icon } from "./Icon";
export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} size={18} />
          <div><b>{t.title}</b>{t.body && <span className="muted">{t.body}</span>}</div>
          <button className="btn ghost sm icon x" onClick={() => dismiss(t.id)} aria-label={tr("Dismiss")}><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
