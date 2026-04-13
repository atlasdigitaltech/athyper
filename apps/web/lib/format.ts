/**
 * Shared formatting utilities for the web app.
 */

/**
 * Converts a kebab-case slug to a display title.
 * "purchase-invoice" → "Purchase Invoice"
 */
export function formatTitle(code: string): string {
  return code.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Maps a document/record status string to a Badge variant token.
 * Used consistently across document list and detail pages.
 */
export function statusVariant(
  status: string,
): "success" | "warning" | "destructive" | "muted" | "info" {
  const s = status.toLowerCase();
  if (s.includes("approved") || s.includes("paid") || s.includes("completed")) return "success";
  if (s.includes("in_progress") || s.includes("submitted")) return "info";
  if (s.includes("rejected") || s.includes("cancelled")) return "destructive";
  if (s.includes("partial")) return "warning";
  return "muted";
}
