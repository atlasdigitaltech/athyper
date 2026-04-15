import { type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent } from "../primitives/Card";

export interface RowCardProps {
  /** Full content override — bypasses all slots. Use for rows that don't fit the standard shape. */
  children?: ReactNode;
  /** Leading element — left icon, avatar, or status indicator (renders shrink-0). */
  leading?: ReactNode;
  /** Badge area — status badge(s) rendered inline before the title. */
  badge?: ReactNode;
  /** Title — primary label of the row. */
  title?: ReactNode;
  /** Metadata — secondary info below title (xs muted text). Pass a single span for inline
   *  items or multiple block elements for stacked lines. */
  metadata?: ReactNode;
  /** Actions — right-aligned icon buttons or controls (renders shrink-0). */
  actions?: ReactNode;
  /** Click handler. Adds cursor-pointer + hover state to the Card. */
  onClick?: () => void;
  /** Navigation href. Wraps the Card in an anchor element. */
  href?: string;
  /** Applied to the Card element — use for opacity-60, border-destructive/30, etc. */
  className?: string;
}

/**
 * RowCard
 *
 * Slot-based card shell for compact list rows.
 * Padding is always p-3 (canonical compact-row exception per UI_LAYOUT_CONTRACT).
 *
 * Slots: leading | badge + title | metadata | actions
 *
 * Usage (slots):
 *   <RowCard
 *     badge={<Badge variant="success">active</Badge>}
 *     title={item.name}
 *     metadata={<span className="flex gap-3"><span>{item.code}</span><span>{item.date}</span></span>}
 *     actions={<Button size="sm" variant="ghost">Edit</Button>}
 *   />
 *
 * Usage (escape hatch — custom layout, className still applied to Card):
 *   <RowCard className="opacity-60">
 *     <div className="flex ...">...</div>
 *   </RowCard>
 */
export function RowCard({
  children,
  leading,
  badge,
  title,
  metadata,
  actions,
  onClick,
  href,
  className,
}: RowCardProps) {
  const inner = children ?? (
    <div className="flex items-start gap-3">
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1 space-y-0.5">
        {(badge ?? title) && (
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            {title && <span className="text-sm font-medium">{title}</span>}
          </div>
        )}
        {metadata && (
          <div className="text-xs text-muted-foreground">{metadata}</div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </div>
  );

  const cardCls = cn(
    "transition-colors",
    (onClick || href) && "cursor-pointer hover:border-primary/50",
    className,
  );

  if (href) {
    return (
      <a href={href}>
        <Card className={cardCls}>
          <CardContent className="p-3">{inner}</CardContent>
        </Card>
      </a>
    );
  }

  return (
    <Card className={cardCls} onClick={onClick}>
      <CardContent className="p-3">{inner}</CardContent>
    </Card>
  );
}
