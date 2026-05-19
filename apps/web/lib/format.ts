/**
 * Shared formatting utilities for the web app.
 */

/**
 * Converts a snake_case entity slug to a display title.
 * "purchase_invoice" → "Purchase Invoice"
 */
export function formatTitle(code: string): string {
  return code.replace(/-/g, "_").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Converts bytes to a human-readable size string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
