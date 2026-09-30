import type { HTMLAttributes } from "react";

/** Atlas-owned asset; never depends on a plane application's icon path.
 * Decorative by default. Supply a title when the mark stands alone. */
export function AtlasBrandIcon({
  size = 20,
  title,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  readonly size?: number | string;
}) {
  const mask = 'url("/brand/atlas/app-icon.svg") center / contain no-repeat';
  return (
    <span
      {...props}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        verticalAlign: "middle",
        backgroundColor: "currentColor",
        mask,
        WebkitMask: mask,
        ...style,
      }}
    />
  );
}
