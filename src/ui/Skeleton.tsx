export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={[
        "animate-pulse rounded-control bg-surface-2/80",
        className ?? "",
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

