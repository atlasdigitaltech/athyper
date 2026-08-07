"use client";

import type { AtlasRateLimitNotice as Notice } from "../provider/atlas-context";

export function AtlasRateLimitNotice({
  notice,
}: {
  notice: Notice | null;
}) {
  if (!notice) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="mx-4 mb-2 rounded-md border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-900"
      data-atlas-notice="rate-limit"
    >
      {notice.message}
    </p>
  );
}
