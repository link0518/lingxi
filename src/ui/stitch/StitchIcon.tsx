type StitchIconProps = {
  name: string;
  className?: string;
  fill?: 0 | 1;
  title?: string;
};

export function StitchIcon({ name, className, fill, title }: StitchIconProps) {
  const fontVariationSettings =
    typeof fill === "number" ? (`'FILL' ${fill}` as const) : undefined;

  return (
    <span
      className={["material-symbols-outlined", className].filter(Boolean).join(" ")}
      style={fontVariationSettings ? { fontVariationSettings } : undefined}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      {name}
    </span>
  );
}

