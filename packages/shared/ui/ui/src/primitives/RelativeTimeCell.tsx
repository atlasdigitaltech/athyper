"use client";

/**
 * RelativeTimeCell — compact relative-time signal for list rows.
 *
 * Renders abbreviated distances: "5m", "2h", "3d", "2w", "4M", "2y".
 * Full ISO datetime is in the title attribute (native tooltip).
 * Returns null for null/undefined/empty input.
 *
 * Suppression rule (enforced by caller — RowMetaStrip):
 *   Do not render when updated_at is already visible as a data column.
 */

function relativeAbbrev(date: Date): string {
  const now  = Date.now();
  const diff = now - date.getTime(); // ms, positive = past

  const MINUTE = 60_000;
  const HOUR   = 60 * MINUTE;
  const DAY    = 24 * HOUR;
  const WEEK   = 7  * DAY;
  const MONTH  = 30 * DAY;
  const YEAR   = 365 * DAY;

  if (diff < MINUTE)       return "now";
  if (diff < HOUR)         return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY)          return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK)         return `${Math.floor(diff / DAY)}d`;
  if (diff < MONTH)        return `${Math.floor(diff / WEEK)}w`;
  if (diff < YEAR)         return `${Math.floor(diff / MONTH)}M`;
  return `${Math.floor(diff / YEAR)}y`;
}

export interface RelativeTimeCellProps {
  value:      string | Date | null | undefined;
  className?: string;
}

export function RelativeTimeCell({ value, className }: RelativeTimeCellProps) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) return null;

  return (
    <span
      className={className ?? "text-xs tabular-nums text-muted-foreground/50"}
      title={date.toLocaleString()}
    >
      {relativeAbbrev(date)}
    </span>
  );
}
