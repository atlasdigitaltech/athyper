/**
 * StatusBadge — canonical status pill across header bars and surfaces.
 *
 * Visual contract (uppercase / tracked / bordered / no dot) is shared with
 * RuntimeEntityIdentityBar so every "status of a thing" reads the same.
 * The `intent` prop drives the tinted border/bg/text via semantic-colors.
 *
 * `withIcon` and `dot` are opt-in for surfaces that need a glyph or marker;
 * the default is icon-less to keep the pill quiet.
 */
import { type SemanticIntent, resolveSemanticColors } from "@athyper/platform-theme/semantic-colors";
import { getStatusIcon } from "@athyper/platform-icons/statuses";
import { cn } from "@athyper/platform-theme/utils";

export interface StatusBadgeProps {
  intent: SemanticIntent;
  label: string;
  /** Render a small leading dot in the semantic color. */
  dot?: boolean;
  /** Render the semantic glyph (from @athyper/icons/statuses) as a leading icon. */
  withIcon?: boolean;
  className?: string;
}

export function StatusBadge({ intent, label, dot = false, withIcon = false, className }: StatusBadgeProps) {
  const colors = resolveSemanticColors(intent);
  const Icon = withIcon ? getStatusIcon(intent) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-wide",
        colors.subtleBadge,
        (dot || Icon) && "gap-1",
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", colors.dot)} />}
      {Icon && <Icon size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}
