// The VEX mark: two angular blades forming a V, with a notch cut where they meet.
export function Logo({ size = 40, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="VEX CLIENT logo" role="img"
      style={glow ? { filter: "drop-shadow(0 0 calc(10px * var(--glow)) color-mix(in oklab, var(--accent) 70%, transparent))" } : undefined}>
      <defs>
        <linearGradient id="vexA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <linearGradient id="vexB" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" /><stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path d="M4 8h16l14 34-6 14z" fill="url(#vexA)" />
      <path d="M60 8H44L30.5 40.5 34.6 50z" fill="url(#vexB)" />
      <path d="M20 8h6l-3 7z" fill="var(--accent-2)" opacity="0.8" />
    </svg>
  );
}
