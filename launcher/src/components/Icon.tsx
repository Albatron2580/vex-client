// Original line-icon set for VEX CLIENT (24px grid, 1.8 stroke).
const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  instances: "M4 6h16M4 12h16M4 18h10M18 16v4m-2-2h4",
  discover: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5z",
  skins: "M8 3h8l4 4-3 2v12H7V9L4 7z",
  features: "M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z",
  friends: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 10a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6m2 16a5 5 0 0 0-3-4.6",
  shop: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L14.3 3h-4.6l-.4 2.4A7 7 0 0 0 7.1 6.7l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3l.4 2.4h4.6l.4-2.4a7 7 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
  play: "M7 4.5v15l13-7.5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.3-4.3",
  close: "M6 6l12 12M18 6 6 18",
  min: "M5 12h14", max: "M5 5h14v14H5z",
  check: "M5 12.5 10 17l9-10",
  alert: "M12 8v5m0 3.5v.5M10.3 3.8 2.6 17.4A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.6L13.7 3.8a2 2 0 0 0-3.4 0Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9v.5",
  download: "M12 3v12m-5-5 5 5 5-5M4 20h16",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  upload: "M12 16V4m-5 5 5-5 5 5M4 20h16",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  eraser: "M7 21h12M5.5 14.5 14 6l5 5-8.5 8.5H8z",
  pencil: "M4 20l1-5L16 4l4 4L9 19z",
  mirror: "M12 3v18M8 7 4 12l4 5V7Zm8 0 4 5-4 5z",
  clear: "M4 4l16 16M20 4 4 20",
  totem: "M9 3h6v5h3v4h-3v3h2v6H7v-6h2v-3H6V8h3z",
  crosshair: "M12 3v6m0 6v6M3 12h6m6 0h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  zip: "M6 3h9l5 5v13H6zM11 3v2m0 2v2m0 2v2m-1 2h2v3h-2z",
  save: "M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 0v5h8V3M7 21v-7h10v7",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
  refresh: "M20 11a8 8 0 0 0-14.8-3.7L4 9m0-5v5h5m-5 4a8 8 0 0 0 14.8 3.7L20 15m0 5v-5h-5",
  cube: "M12 2 21 7v10l-9 5-9-5V7zm0 0v20M3 7l9 5 9-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  panelClose: "M4 4h16v16H4zM9 4v16M15 9l-3 3 3 3",
  panelOpen: "M4 4h16v16H4zM9 4v16M13 9l3 3-3 3",
  chevron: "m6 9 6 6 6-6",
  collab: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a6 6 0 0 1 9.5-4.9M22 20a6 6 0 0 0-9.5-4.9M12 13v8m-3-3 3 3 3-3",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zm-3 9 2 2 4-4",
  bug: "M8 9h8v6a4 4 0 0 1-8 0zM9 9V7a3 3 0 0 1 6 0v2M4 13h4m8 0h4M5 8l3 2m11-2-3 2M5 19l3-2m11 2-3-2",
  megaphone: "M3 10v4h3l7 4V6l-7 4zm13-2a5 5 0 0 1 0 8M6 14l1 5h3l-1-5",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  sparkle: "M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z",
};
export type IconName = keyof typeof P;
export function Icon({ name, size = 18, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name] ?? P.info} fill={name === "play" ? "currentColor" : "none"} />
    </svg>
  );
}
