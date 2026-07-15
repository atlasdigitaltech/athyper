"use client";

/**
 * RichCommentRenderer — renders comment body with rich content support.
 *
 * Priority:
 *  1. contentHtml (TipTap-serialized HTML) — sanitized by DOMPurify before display
 *  2. commentText (plain-text fallback) — whitespace-preserved paragraph
 *
 * Tables are wrapped in overflow-x-auto so wide SAP/Excel pastes don't break
 * the drawer layout.
 */

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "@athyper/theme/utils";

// ── Allowed HTML for DOMPurify ────────────────────────────────────────────────
// TipTap only outputs safe semantic tags, but we run DOMPurify as a
// belt-and-suspenders measure in case content_html was ever set by a
// non-TipTap path (e.g., a migration or import script).

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre",
  "ul", "ol", "li",
  "blockquote",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "a",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "hr",
  "span", "div",
];

const ALLOWED_ATTR = ["href", "rel", "target", "class", "id", "colspan", "rowspan", "style"];

// Strip unsafe CSS properties from style attributes after sanitization
const SAFE_CSS_DISPLAY = new Set([
  "background-color", "color", "text-align", "font-weight", "font-style",
  "border", "border-top", "border-bottom", "border-left", "border-right",
  "width", "min-width", "max-width", "padding", "vertical-align",
]);

if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLElement)) return;
    const raw = node.getAttribute("style");
    if (!raw) return;
    const safe = raw.split(";")
      .filter(Boolean)
      .filter((d) => SAFE_CSS_DISPLAY.has(d.split(":")[0]?.trim().toLowerCase() ?? ""))
      .join(";");
    if (safe) node.setAttribute("style", safe);
    else node.removeAttribute("style");
  });
}

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Forbid javascript: and data: URLs on links
    FORCE_BODY: false,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface RichCommentRendererProps {
  commentText: string;
  contentHtml?: string | null;
  contentFormat?: string | null;
  className?: string;
}

export function RichCommentRenderer({
  commentText,
  contentHtml,
  contentFormat,
  className,
}: RichCommentRendererProps) {
  const isRich = contentFormat === "rich_json" || contentFormat === "sanitized_html";

  const safeHtml = useMemo(() => {
    if (!isRich || !contentHtml) return null;
    return sanitizeHtml(contentHtml);
  }, [isRich, contentHtml]);

  if (safeHtml) {
    return (
      <div
        className={cn(
          "mt-0.5 text-sm leading-relaxed text-foreground",
          // Prose baseline
          "[&_strong]:font-medium",
          "[&_em]:italic",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_code]:font-mono",
          "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs [&_pre]:font-mono",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:mb-0.5",
          "[&_a]:text-primary [&_a]:underline",
          "[&_p]:mb-1 [&_p:last-child]:mb-0",
          "[&_h1]:text-base [&_h1]:font-medium [&_h1]:text-foreground [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground",
          // Table — wrap in scroll container via CSS
          "[&_table]:min-w-full [&_table]:border-collapse [&_table]:text-xs",
          "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_th]:text-left [&_th]:text-foreground",
          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-foreground",
          // Table wrapper for horizontal scroll
          "[&_table]:block [&_table]:overflow-x-auto",
          className,
        )}
        // DOMPurify has already sanitized this HTML
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  // Plain text fallback
  return (
    <p className={cn("mt-0.5 whitespace-pre-wrap text-sm text-foreground", className)}>
      {commentText}
    </p>
  );
}
