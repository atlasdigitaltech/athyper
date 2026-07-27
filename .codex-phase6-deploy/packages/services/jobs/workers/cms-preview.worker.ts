/**
 * CMS Preview Worker — Sprint 36 (Task 11.2)
 *
 * Consumes `jobs-cms-preview` queue jobs queued by the content route whenever
 * a new snapshot.content_item_version is saved.
 *
 * For each job the worker:
 *   1. Reads the version body_json from snapshot.content_item_version
 *   2. Extracts plain text via a recursive JSON tree walker
 *   3. Renders a lightweight HTML snippet (first N block nodes)
 *   4. Writes preview_text, preview_html, preview_generated_at to master.content_item
 *
 * Body formats supported:
 *   slate   — { type, children: [{text}, ...], ... } recursive tree
 *   prosemirror — { type, content: [{type, text|content}, ...] } recursive tree
 *   html    — body_json is a raw HTML string (stringified); stored as-is (truncated)
 *   markdown — body_json is a markdown string; stored as plain text (no rendering)
 *
 * The worker is idempotent — re-processing the same version writes the same output.
 */

import { Worker, type ConnectionOptions } from "bullmq";
import type { Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type PreviewContentJobData,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ── Text extraction constants ─────────────────────────────────────────────────

const MAX_PREVIEW_CHARS  = 500;
const MAX_PREVIEW_BLOCKS = 3;   // how many top-level block nodes → HTML

// ── Body-format text extraction ───────────────────────────────────────────────

/**
 * Recursively extract all leaf text from a Slate/ProseMirror node tree.
 * Returns a flat string with paragraph breaks between block nodes.
 */
function extractTextFromNode(node: unknown, depth = 0): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";

  const n = node as Record<string, unknown>;

  // Leaf node: { text: "..." }
  if (typeof n["text"] === "string") return n["text"];

  // Slate: { type, children: [...] }
  if (Array.isArray(n["children"])) {
    const childTexts = (n["children"] as unknown[]).map((c) => extractTextFromNode(c, depth + 1));
    // Add paragraph break between top-level block nodes
    const sep = depth === 0 ? "\n\n" : "";
    return childTexts.filter(Boolean).join(sep);
  }

  // ProseMirror: { type, content: [...] }
  if (Array.isArray(n["content"])) {
    const childTexts = (n["content"] as unknown[]).map((c) => extractTextFromNode(c, depth + 1));
    const sep = depth === 0 ? "\n\n" : "";
    return childTexts.filter(Boolean).join(sep);
  }

  return "";
}

/**
 * Convert a Slate/ProseMirror block node to a minimal HTML string.
 * Returns an empty string for non-block nodes.
 */
function blockToHtml(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  const nodeType = String(n["type"] ?? "paragraph");
  const text     = extractTextFromNode(node).trim();
  if (!text) return "";

  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (nodeType.startsWith("heading") || nodeType === "h1" || nodeType === "h2" || nodeType === "h3") {
    const level = nodeType.match(/\d/)?.[0] ?? "2";
    return `<h${level}>${escaped}</h${level}>`;
  }
  if (nodeType === "blockquote") {
    return `<blockquote>${escaped}</blockquote>`;
  }
  if (nodeType === "code_block" || nodeType === "code-block" || nodeType === "codeBlock") {
    return `<pre><code>${escaped}</code></pre>`;
  }
  // Default: paragraph
  return `<p>${escaped}</p>`;
}

/**
 * Generate preview_text and preview_html from a body_json + body_format pair.
 */
function generatePreview(
  bodyJson: string,
  bodyFormat: string,
): { previewText: string; previewHtml: string } {
  // html / markdown formats: body_json is the raw string value
  if (bodyFormat === "html") {
    const stripped = bodyJson.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      previewText: stripped.slice(0, MAX_PREVIEW_CHARS),
      previewHtml: bodyJson.slice(0, 4096), // cap at 4 KB
    };
  }

  if (bodyFormat === "markdown") {
    const plain = bodyJson.replace(/[#*`_~[\]()!]/g, "").replace(/\s+/g, " ").trim();
    return {
      previewText: plain.slice(0, MAX_PREVIEW_CHARS),
      previewHtml: `<pre>${plain.slice(0, 2048)}</pre>`,
    };
  }

  // slate / prosemirror: parse JSON tree
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyJson);
  } catch {
    return { previewText: "", previewHtml: "" };
  }

  const root = parsed as Record<string, unknown>;

  // Get top-level block array
  const blocks: unknown[] =
    Array.isArray(root["children"]) ? (root["children"] as unknown[]) :
    Array.isArray(root["content"])  ? (root["content"]  as unknown[]) :
    Array.isArray(root)             ? (root as unknown[]) :
    [];

  // Plain text
  const plainText = extractTextFromNode(parsed).replace(/\n{3,}/g, "\n\n").trim();
  const previewText = plainText.slice(0, MAX_PREVIEW_CHARS);

  // HTML snippet: first N block nodes
  const htmlParts: string[] = [];
  for (const block of blocks) {
    if (htmlParts.length >= MAX_PREVIEW_BLOCKS) break;
    const html = blockToHtml(block);
    if (html) htmlParts.push(html);
  }
  const previewHtml = htmlParts.join("\n");

  return { previewText, previewHtml };
}

// ── Worker factory ────────────────────────────────────────────────────────────

export interface CmsPreviewWorkerDeps {
  db:         DB;
  connection: ConnectionOptions;
  logger?:    JobLogger;
}

export function createCmsPreviewWorker(deps: CmsPreviewWorkerDeps): Worker<PreviewContentJobData> {
  const { db, connection, logger } = deps;

  return new Worker<PreviewContentJobData>(
    QUEUE_NAME.CMS_PREVIEW,
    async (job) => {
      const { contentItemId, versionId, tenantId } = job.data;

      // Fetch the version body
      const version = await db
        .selectFrom("snapshot.content_item_version as v" as never)
        .select(["v.body_json" as never, "v.body_format" as never])
        .where("v.id" as never, "=", versionId as never)
        .where("v.tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as { body_json: string; body_format: string } | undefined;

      if (!version) {
        logger?.warn("cms_preview_version_not_found", { contentItemId, versionId, tenantId });
        return;
      }

      const { previewText, previewHtml } = generatePreview(
        version.body_json,
        version.body_format ?? "slate",
      );

      // Write preview columns back to master.content_item
      await db
        .updateTable("master.content_item" as never)
        .set({
          preview_text:          previewText  || null,
          preview_html:          previewHtml  || null,
          preview_generated_at:  new Date(),
          updated_at:            new Date(),
          updated_by:            SYSTEM_ACTOR_ID,
        } as never)
        .where("id" as never, "=", contentItemId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .execute();

      logger?.info("cms_preview_generated", {
        contentItemId,
        versionId,
        tenantId,
        previewTextLength: previewText.length,
        previewHtmlLength: previewHtml.length,
      });
    },
    {
      connection,
      concurrency:   4,
      // No excessive retries — if body_json is malformed there's no point retrying
      // indefinitely. Two attempts covers transient DB issues.
      limiter: { max: 10, duration: 1000 },
    },
  );
}
