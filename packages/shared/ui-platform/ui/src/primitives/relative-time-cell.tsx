"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Compact relative-time signal for dense table and list rows.
 *
 * The value is intentionally blank until the component mounts. That avoids
 * server/client clock drift during hydration, then updates once per minute.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export interface RelativeTimeCellProps {
  value: string | Date | null | undefined;
  className?: string;
}

function parseDateValue(value: RelativeTimeCellProps["value"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeAbbrev(date: Date, nowMs: number): string {
  const diff = nowMs - date.getTime();
  const distance = Math.abs(diff);

  if (distance < MINUTE_MS) return "now";
  if (distance < HOUR_MS) return `${Math.floor(distance / MINUTE_MS)}m`;
  if (distance < DAY_MS) return `${Math.floor(distance / HOUR_MS)}h`;
  if (distance < WEEK_MS) return `${Math.floor(distance / DAY_MS)}d`;
  if (distance < MONTH_MS) return `${Math.floor(distance / WEEK_MS)}w`;
  if (distance < YEAR_MS) return `${Math.floor(distance / MONTH_MS)}M`;
  return `${Math.floor(distance / YEAR_MS)}y`;
}

export function RelativeTimeCell({ value, className }: RelativeTimeCellProps) {
  const date = useMemo(() => parseDateValue(value), [value]);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!date) return undefined;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, [date]);

  if (!date) return null;

  const isoValue = date.toISOString();
  const relativeLabel = nowMs === null ? "" : formatRelativeAbbrev(date, nowMs);

  return (
    <span
      className={className ?? "text-xs tabular-nums text-muted-foreground/50"}
      title={isoValue}
      aria-label={relativeLabel ? `${relativeLabel} (${isoValue})` : isoValue}
    >
      {relativeLabel}
    </span>
  );
}
