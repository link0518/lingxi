type AvatarProps = {
  size?: number;
  className?: string;
};

export function Avatar({ size = 40, className }: AvatarProps) {
  return (
    <div
      className={[
        "relative shrink-0 overflow-hidden rounded-full border border-line bg-surface-2",
        "shadow-[0_10px_26px_rgba(42,36,48,0.05)]",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Soft color blobs */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgb(var(--cta-soft)_/_0.95),transparent_60%),radial-gradient(circle_at_70%_70%,rgb(var(--pink-soft)_/_0.95),transparent_60%),radial-gradient(circle_at_60%_20%,rgb(var(--pink)_/_0.18),transparent_60%)]" />

      {/* Noise texture (subtle) */}
      <div
        className="absolute inset-0 opacity-[0.10] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.65'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Highlight edge */}
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/60" />
      <div className="pointer-events-none absolute -left-3 -top-3 h-10 w-10 rounded-full bg-white/45 blur-xl" />
      <div className="pointer-events-none absolute -right-4 top-2 h-10 w-10 rounded-full bg-gold/20 blur-xl" />

      {/* Inner vignette */}
      <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_-12px_24px_rgba(42,36,48,0.12)]" />
    </div>
  );
}
