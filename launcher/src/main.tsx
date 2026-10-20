import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import { AppProvider } from "./state/AppState";
import { App } from "./App";

window.addEventListener("error", (e) => window.vex?.log("error", `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => window.vex?.log("error", `Unhandled: ${String(e.reason?.stack ?? e.reason)}`));

createRoot(document.getElementById("root")!).render(<StrictMode><AppProvider><App /></AppProvider></StrictMode>);
