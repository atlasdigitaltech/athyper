/**
 * Flow Field Dispatcher — meta-driven post-submit side effects.
 *
 * Reads control.entity_flow_field bindings for a (flow_code, step_key) and
 * routes each field's value from the user-submitted draft to its declared
 * target. Today only one non-column target is supported:
 *
 *   metadata.target = {
 *     kind:           'comment',
 *     context_type:   <master.comment_type code>,        // default 'entity'
 *     comment_intent: <master.comment_intent code>,      // default 'general'
 *     scope:          'entity' | 'workflow_request' | 'lifecycle_event',
 *     visibility:     'public' | 'internal' | 'private', // default 'internal'
 *   }
 *
 * Returns a summary the calling handler can log. Empty fields are skipped.
 * Bindings without a target metadata entry are ignored — they remain the
 * responsibility of the calling handler (which still writes them to columns).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface DispatchInput {
  tenantId:           string;
  entityName:         string;          // e.g. 'purchase_invoice'
  entityId:           string;
  flowCode:           string;          // e.g. 'submit_for_approval'
  stepKey:            string;          // e.g. 'submit'
  draft:              Record<string, unknown>;
  principalId:        string | null;
  workflowRequestId?: string | null;   // when scope='workflow_request'
  lifecycleEventId?:  string | null;   // when scope='lifecycle_event'
}

export interface DispatchResult {
  commentsCreated: number;
  skipped:         number;
}

interface BindingRow {
  field_name: string;
  metadata:   Record<string, unknown> | null;
}

interface CommentTarget {
  kind:           "comment";
  context_type:   string;
  comment_intent: string;
  scope:          "entity" | "workflow_request" | "lifecycle_event";
  visibility:     "public" | "internal" | "private";
}

function readCommentTarget(meta: unknown): CommentTarget | null {
  if (!meta || typeof meta !== "object") return null;
  const target = (meta as Record<string, unknown>)["target"];
  if (!target || typeof target !== "object") return null;
  const t = target as Record<string, unknown>;
  if (t["kind"] !== "comment") return null;

  const scope = t["scope"];
  const visibility = t["visibility"];
  return {
    kind: "comment",
    context_type:   typeof t["context_type"]   === "string" ? t["context_type"]   as string : "entity",
    comment_intent: typeof t["comment_intent"] === "string" ? t["comment_intent"] as string : "general",
    scope:
      scope === "workflow_request" || scope === "lifecycle_event" ? scope : "entity",
    visibility:
      visibility === "public" || visibility === "private" ? visibility : "internal",
  };
}

interface RichValue {
  text:        string;
  contentJson: unknown;
  contentHtml: string | null;
  visibility:  "internal" | "public" | "private";
}

function isRichValue(value: unknown): value is RichValue {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["text"] === "string";
}

function blank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRichValue(value))    return value.text.trim() === "";
  return false;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRichValue(value))     return value.text;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function isVisibility(v: unknown): v is "internal" | "public" | "private" {
  return v === "internal" || v === "public" || v === "private";
}

const V_NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Loads field bindings for the given (entity, flow_code, step_key) tuple
 * that declare a non-column target in metadata, and applies them.
 */
export async function dispatchFlowFieldBindings(
  db:    AnyDb,
  input: DispatchInput,
): Promise<DispatchResult> {
  const rows = await sql<BindingRow>`
    SELECT ef.name        AS field_name,
           eff.metadata   AS metadata
    FROM   control.entity_flow_field eff
    JOIN   control.entity_flow_step  efs ON efs.id = eff.flow_step_id
    JOIN   control.entity_flow       ef0 ON ef0.id = efs.flow_id
    JOIN   control.entity_version    ev  ON ev.id  = ef0.entity_version_id
    JOIN   control.entity            e   ON e.id   = ev.entity_id
    JOIN   control.entity_field      ef  ON ef.id  = eff.entity_field_id
    WHERE  e.table_name  = ${input.entityName}
      AND  ef0.flow_code = ${input.flowCode}
      AND  efs.step_key  = ${input.stepKey}
      AND  ef0.tenant_id IS NULL
      AND  efs.tenant_id IS NULL
      AND  eff.tenant_id IS NULL
      AND  e.runtime_enabled = true
      AND  e.status = 'ACTIVE'
      AND  e.is_active = true
      AND  e.read_capability <> 'none'
      AND  ev.status = 'EFFECTIVE'
      AND  ef.is_active = true
      AND  ef.runtime_enabled = true
      AND  eff.metadata ? 'target'
  `.execute(db);

  let commentsCreated = 0;
  let skipped         = 0;

  for (const row of rows.rows) {
    const target = readCommentTarget(row.metadata);
    if (!target) { skipped++; continue; }

    const rawValue = input.draft[row.field_name];
    if (blank(rawValue)) { skipped++; continue; }

    const text = asString(rawValue).trim();
    if (text.length === 0) { skipped++; continue; }

    // Rich (TipTap) payload when the UI used ControlledRichComposer; falls
    // back to plain text when the field came through as a string. The
    // binding's metadata.target.visibility wins over any author override
    // when both are present — it expresses author-intent at design time.
    const rich         = isRichValue(rawValue) ? rawValue : null;
    const contentJson  = rich?.contentJson ?? null;
    const contentHtml  = rich?.contentHtml ?? null;
    const userVis      = rich && isVisibility(rich.visibility) ? rich.visibility : null;
    const finalVis     = target.visibility ?? userVis ?? "internal";
    const contentFormat = contentJson ? "rich_json" : "plain";

    // Resolve scope → (entity_type, entity_id) for the comment row.
    let commentEntityType = input.entityName;
    let commentEntityId   = input.entityId;
    if (target.scope === "workflow_request" && input.workflowRequestId) {
      commentEntityType = "workflow_request";
      commentEntityId   = input.workflowRequestId;
    } else if (target.scope === "lifecycle_event" && input.lifecycleEventId) {
      commentEntityType = "workflow_event";
      commentEntityId   = input.lifecycleEventId;
    }

    const commenterId = input.principalId ?? V_NIL;

    await sql`
      INSERT INTO master.comment (
        tenant_id, context_type, entity_type, entity_id,
        commenter_id, comment_text, content_format, content_json, content_html,
        visibility, comment_intent, created_by
      ) VALUES (
        ${input.tenantId}, ${target.context_type}, ${commentEntityType}, ${commentEntityId},
        ${commenterId}, ${text.slice(0, 50000)}, ${contentFormat},
        ${contentJson ? JSON.stringify(contentJson) : null}::jsonb,
        ${contentHtml},
        ${finalVis}, ${target.comment_intent}, ${commenterId}
      )
    `.execute(db);

    commentsCreated++;
  }

  return { commentsCreated, skipped };
}
