/**
 * StatusBadge — renders a status code with semantic color + icon.
 *
 * Bridge between @athyper/theme/semantic-colors and @athyper/icons/statuses.
 * The `intent` prop drives both color and icon.
 */
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { getStatusIcon } from "@athyper/icons/statuses";
import { cn } from "@athyper/theme/utils";

export interface StatusBadgeProps {
  intent: SemanticIntent;
  label: string;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ intent, label, dot = false, className }: StatusBadgeProps) {
  const colors = resolveSemanticColors(intent);
  const Icon = getStatusIcon(intent);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        colors.badge,
        className,
      )}
    >
      {dot ? (
        <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
      ) : (
        <Icon size={12} />
      )}
      {label}
    </span>
  );
}
