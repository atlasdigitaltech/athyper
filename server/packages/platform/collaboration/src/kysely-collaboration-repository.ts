import { CollaborationError } from "./errors.js";
import { sql, type Transaction } from "kysely";
import type {
  CollaborationRepository,
  CommentRecord,
  CreateCommentCommand,
  EditCommentCommand,
  PrincipalDirectory,
} from "@athyper/server-contract-collaboration";
export type CollaborationTransaction = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
export function createKyselyPrincipalDirectory(): PrincipalDirectory {
  return {
    async resolveActivePrincipals(context, ids, transaction) {
      if (!ids.length) return [];
      const result = await sql<{
        id: string;
      }>`SELECT id FROM master.principal WHERE tenant_id=${context.tenantId}::uuid AND id=ANY(${ids}::uuid[]) AND status='active' ORDER BY id`.execute(
        transaction as CollaborationTransaction,
      );
      return result.rows.map((row) => row.id);
    },
  };
}
export function createKyselyCollaborationRepository(): CollaborationRepository<CollaborationTransaction> {
  return {
    async history(input, tx) {
      const owner = (await sql<{status:string;deleted_at:Date|string|null;deleted_by:string|null}>`SELECT status,deleted_at,deleted_by::text FROM document.comment WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.commentId}::uuid AND commenter_id=${input.context.principalId}::uuid`.execute(tx)).rows[0];
      if (!owner) throw new CollaborationError(403,"HISTORY_UNAVAILABLE","History is unavailable");
      if(owner.status === "deleted") return {items:[],deletion:{...(owner.deleted_at?{deletedAt:new Date(owner.deleted_at).toISOString()}:{}),...(owner.deleted_by?{deletedBy:owner.deleted_by}:{})}};
      const limit=input.limit ?? 20;
      const rows=(await sql<{revision_no:number;comment_text:string;content_format:"plain"|"rich_json";content_json:Record<string,unknown>|null;created_at:Date|string}>`SELECT revision_no,comment_text,content_format,content_json,created_at FROM document.comment_revision WHERE tenant_id=${input.context.tenantId}::uuid AND comment_id=${input.commentId}::uuid ${input.beforeRevision ? sql`AND revision_no<${input.beforeRevision}` : sql``} ORDER BY revision_no DESC LIMIT ${limit+1}`.execute(tx)).rows;
      const items=rows.slice(0,limit).map(row=>({revision:row.revision_no,text:row.comment_text,format:row.content_format,...(row.content_json?{content:row.content_json}:{}),createdAt:new Date(row.created_at).toISOString()}));
      return {items,...(rows.length>limit?{nextRevision:items.at(-1)!.revision}:{})};
    },
    async create(command, mentions, tx) {
      await requireLookup(
        tx,
        command.context.tenantId,
        "document.comment_type",
        command.contextType ?? "entity",
      );
      await requireLookup(
        tx,
        command.context.tenantId,
        "document.comment_intent",
        command.intent ?? "general",
      );
      let depth = 0;
      if (command.parentCommentId) {
        // Parent coordinates/depth are immutable; a plain SELECT uses the read policy.
        const parent = (
          await sql<{
            thread_depth: number;
          }>`SELECT thread_depth FROM document.comment WHERE tenant_id=${command.context.tenantId}::uuid AND id=${command.parentCommentId}::uuid AND context_type=${command.contextType ?? "entity"} AND entity_type=${command.entityType} AND entity_id=${command.entityId} AND status<>'deleted'`.execute(
            tx,
          )
        ).rows[0];
        if (!parent)
          throw new CollaborationError(
            404,
            "COMMENT_PARENT_NOT_FOUND",
            "Parent comment was not found in this context",
          );
        depth = Number(parent.thread_depth) + 1;
        if (depth > 5)
          throw new CollaborationError(
            422,
            "COMMENT_THREAD_DEPTH_EXCEEDED",
            "Comment nesting depth cannot exceed five",
          );
      }
      const result =
        await sql<Row>`INSERT INTO document.comment(tenant_id,context_type,entity_type,entity_id,comment_intent,commenter_id,comment_text,content_format,content_json,content_html,content_schema,parent_comment_id,thread_depth,visibility,created_by) VALUES(${command.context.tenantId}::uuid,${command.contextType ?? "entity"},${command.entityType},${command.entityId},${command.intent ?? "general"},${command.context.principalId}::uuid,${command.text},${command.format ?? "plain"},${command.content ? JSON.stringify(command.content) : null}::jsonb,${command.html ?? null},${command.contentSchema ?? null},${command.parentCommentId ?? null}::uuid,${depth},${command.visibility ?? "public"},${command.context.principalId}::uuid) RETURNING *`.execute(
          tx,
        );
      const comment = map(required(result.rows[0]));
      await replaceRelations(command, comment.id, mentions, tx);
      return comment;
    },
    async edit(command, mentions, tx) {
      const current = (
        await sql<Row>`SELECT * FROM document.comment WHERE tenant_id=${command.context.tenantId}::uuid AND id=${command.commentId}::uuid AND commenter_id=${command.context.principalId}::uuid AND status<>'deleted' FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (
        !current ||
        Number(current["revision_no"]) !== command.expectedRevision
      )
        return null;
      const result =
        await sql<Row>`UPDATE document.comment SET comment_text=${command.text},content_format=${command.format ?? String(current["content_format"])},content_json=${command.content ? JSON.stringify(command.content) : null}::jsonb,content_html=${command.html ?? null},content_schema=${command.contentSchema ?? null},updated_at=clock_timestamp(),updated_by=${command.context.principalId}::uuid WHERE tenant_id=${command.context.tenantId}::uuid AND id=${command.commentId}::uuid RETURNING *`.execute(
          tx,
        );
      const orphanedAttachmentIds=await replaceRelations(command, command.commentId, mentions, tx);
      return {comment:map(required(result.rows[0])),orphanedAttachmentIds};
    },
    async softDelete(tenantId, id, principalId, tx) {
      const r =
        await sql`UPDATE document.comment SET status='deleted',deleted_at=clock_timestamp(),deleted_by=${principalId}::uuid,updated_at=clock_timestamp(),updated_by=${principalId}::uuid WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND commenter_id=${principalId}::uuid AND status<>'deleted'`.execute(
          tx,
        );
      return Number(r.numAffectedRows ?? 0n) > 0;
    },
    async putReaction(tenantId, commentId, principalId, code, tx) {
      await requireLookup(tx, tenantId, "document.reaction_type", code);
      const r =
        await sql`INSERT INTO document.comment_reaction(tenant_id,comment_id,principal_id,reaction_type,created_by) SELECT ${tenantId}::uuid,c.id,${principalId}::uuid,${code},${principalId}::uuid FROM document.comment c WHERE c.tenant_id=${tenantId}::uuid AND c.id=${commentId}::uuid AND c.status<>'deleted' ON CONFLICT(tenant_id,comment_id,principal_id,reaction_type) DO NOTHING`.execute(
          tx,
        );
      return Number(r.numAffectedRows ?? 0n) > 0;
    },
    async deleteReaction(tenantId, commentId, principalId, code, tx) {
      const r =
        await sql`DELETE FROM document.comment_reaction WHERE tenant_id=${tenantId}::uuid AND comment_id=${commentId}::uuid AND principal_id=${principalId}::uuid AND reaction_type=${code}`.execute(
          tx,
        );
      return Number(r.numAffectedRows ?? 0n) > 0;
    },
    async putDraft(command, tx) {
      await requireLookup(
        tx,
        command.context.tenantId,
        "document.comment_type",
        command.contextType ?? "entity",
      );
      if (command.parentCommentId) {
        const parent =
          await sql`SELECT id FROM document.comment WHERE tenant_id=${command.context.tenantId}::uuid AND id=${command.parentCommentId}::uuid AND context_type=${command.contextType ?? "entity"} AND entity_type=${command.entityType} AND entity_id=${command.entityId} AND status<>'deleted'`.execute(
            tx,
          );
        if (!parent.rows.length)
          throw new CollaborationError(
            404,
            "COMMENT_PARENT_NOT_FOUND",
            "Parent comment was not found in this context",
          );
      }
      const saved = await sql<{id:string}>`INSERT INTO document.comment_draft(expires_at,tenant_id,principal_id,context_type,entity_type,entity_id,parent_comment_id,draft_text,content_format,content_json,content_html,content_schema,visibility,created_by) VALUES(clock_timestamp()+make_interval(days=>${command.draftRetentionDays ?? 30}),${command.context.tenantId}::uuid,${command.context.principalId}::uuid,${command.contextType ?? "entity"},${command.entityType},${command.entityId},${command.parentCommentId ?? null}::uuid,${command.text},${command.format ?? "plain"},${command.content ? JSON.stringify(command.content) : null}::jsonb,${command.html ?? null},${command.contentSchema ?? null},${command.visibility ?? "public"},${command.context.principalId}::uuid) ON CONFLICT(tenant_id,principal_id,context_type,entity_type,entity_id,parent_comment_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,draft_text=EXCLUDED.draft_text,content_format=EXCLUDED.content_format,content_json=EXCLUDED.content_json,content_html=EXCLUDED.content_html,content_schema=EXCLUDED.content_schema,visibility=EXCLUDED.visibility,updated_at=clock_timestamp(),updated_by=EXCLUDED.principal_id RETURNING id::text`.execute(
        tx,
      );
      if (!saved.rows[0]?.id) throw new CollaborationError(409, "DRAFT_WRITE_CONFLICT", "Draft could not be saved");
      return saved.rows[0].id;
    },
    async deleteDraft(tenantId, principalId, c, parentId, tx) {
      const r =
        await sql`UPDATE document.comment_draft SET expires_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=${principalId}::uuid WHERE tenant_id=${tenantId}::uuid AND principal_id=${principalId}::uuid AND context_type=${c.contextType ?? "entity"} AND entity_type=${c.entityType} AND entity_id=${c.entityId} AND parent_comment_id IS NOT DISTINCT FROM ${parentId ?? null}::uuid`.execute(
          tx,
        );
      return Number(r.numAffectedRows ?? 0n) > 0;
    },
    async markRead(tenantId, principalId, c, readAt, tx) {
      await sql`INSERT INTO document.comment_feed_cursor(tenant_id,principal_id,entity_type,entity_id,last_read_at) VALUES(${tenantId}::uuid,${principalId}::uuid,${c.entityType},${c.entityId},${readAt}::timestamptz) ON CONFLICT(tenant_id,principal_id,entity_type,entity_id) DO UPDATE SET last_read_at=GREATEST(document.comment_feed_cursor.last_read_at,EXCLUDED.last_read_at),updated_at=clock_timestamp(),updated_by=EXCLUDED.principal_id`.execute(
        tx,
      );
    },
    async createFlag(tenantId, commentId, principalId, reasonCode, detail, tx) {
      const r = await sql<{
        id: string;
      }>`INSERT INTO event.comment_flag(tenant_id,comment_id,reporter_principal_id,reason_code,detail,created_by) SELECT ${tenantId}::uuid,c.id,${principalId}::uuid,${reasonCode},${detail ?? null},${principalId}::uuid FROM document.comment c WHERE c.tenant_id=${tenantId}::uuid AND c.id=${commentId}::uuid AND c.status<>'deleted' ON CONFLICT(tenant_id,comment_id,reporter_principal_id,resolved_at) DO UPDATE SET reason_code=EXCLUDED.reason_code,detail=EXCLUDED.detail RETURNING id`.execute(
        tx,
      );
      if (!r.rows[0])
        throw new CollaborationError(
          404,
          "COMMENT_NOT_FOUND",
          "Comment was not found",
        );
      return r.rows[0].id;
    },
  };
}
async function replaceRelations(
  command: CreateCommentCommand | EditCommentCommand,
  commentId: string,
  mentions: readonly string[],
  tx: CollaborationTransaction,
) {
  const sourceCoordinates =
    "entityType" in command
      ? command
      : required(
          (
            await sql<{ entity_type: string; entity_id: string }>`SELECT entity_type,entity_id FROM document.comment WHERE tenant_id=${command.context.tenantId}::uuid AND id=${commentId}::uuid`.execute(
              tx,
            )
          ).rows[0],
        );
  const coordinates =
    "entityType" in sourceCoordinates
      ? { entityType: sourceCoordinates.entityType, entityId: sourceCoordinates.entityId }
      : { entityType: sourceCoordinates.entity_type, entityId: sourceCoordinates.entity_id };
  await sql`SELECT id FROM document.comment_draft WHERE tenant_id=${command.context.tenantId}::uuid AND principal_id=${command.context.principalId}::uuid AND entity_type=${coordinates.entityType} AND entity_id=${coordinates.entityId} ORDER BY id FOR UPDATE`.execute(tx);
  await sql`DELETE FROM document.comment_mention WHERE tenant_id=${command.context.tenantId}::uuid AND comment_id=${commentId}::uuid`.execute(
    tx,
  );
  for (const id of mentions)
    await sql`INSERT INTO document.comment_mention(tenant_id,comment_id,mentioned_id,created_by) VALUES(${command.context.tenantId}::uuid,${commentId}::uuid,${id}::uuid,${command.context.principalId}::uuid)`.execute(
      tx,
    );
  const removed = await sql<{ attachment_series_id: string }>`DELETE FROM document.attachment_link WHERE tenant_id=${command.context.tenantId}::uuid AND entity_type='document.comment' AND entity_id=${commentId} AND link_kind='comment' RETURNING attachment_series_id::text`.execute(
    tx,
  );
  for (const id of new Set(command.attachmentIds ?? [])) {
    const linked =
      await sql`INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind,created_by) SELECT ${command.context.tenantId}::uuid,'document.comment',${commentId},a.series_id,a.id,'comment',${command.context.principalId}::uuid FROM document.attachment a WHERE a.tenant_id=${command.context.tenantId}::uuid AND a.id=${id}::uuid AND a.status='active' AND a.is_active AND a.is_virus_scanned AND a.metadata->>'entity_type'=${coordinates.entityType} AND a.metadata->>'entity_id'=${coordinates.entityId} AND a.uploaded_by=${command.context.principalId}::uuid AND (a.draft_id IS NULL OR EXISTS(SELECT 1 FROM document.comment_draft d WHERE d.tenant_id=a.tenant_id AND d.id=a.draft_id AND d.principal_id=${command.context.principalId}::uuid AND d.entity_type=${coordinates.entityType} AND d.entity_id=${coordinates.entityId} AND d.expires_at>clock_timestamp())) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
    if (Number(linked.numAffectedRows ?? 0n) === 0) {
      const attachment =
        await sql`SELECT id FROM document.attachment a WHERE a.tenant_id=${command.context.tenantId}::uuid AND a.id=${id}::uuid AND a.status='active' AND a.is_active AND a.is_virus_scanned AND a.metadata->>'entity_type'=${coordinates.entityType} AND a.metadata->>'entity_id'=${coordinates.entityId} AND a.uploaded_by=${command.context.principalId}::uuid AND (a.draft_id IS NULL OR EXISTS(SELECT 1 FROM document.comment_draft d WHERE d.tenant_id=a.tenant_id AND d.id=a.draft_id AND d.principal_id=${command.context.principalId}::uuid AND d.entity_type=${coordinates.entityType} AND d.entity_id=${coordinates.entityId} AND d.expires_at>clock_timestamp()))`.execute(
          tx,
        );
      if (!attachment.rows.length)
        throw new CollaborationError(
          422,
          "ATTACHMENT_NOT_FOUND",
          "Every attachment must be active and owned by this draft author",
        );
    }
    // This transaction is the only audience expansion for a draft upload: the
    // immutable comment link is written first, then the private draft marker is
    // released. A failed comment command rolls both writes back.
    await sql`UPDATE document.attachment SET draft_id=NULL,metadata=metadata-'draft_id'-'draft_principal_id',updated_at=clock_timestamp(),updated_by=${command.context.principalId}::uuid WHERE tenant_id=${command.context.tenantId}::uuid AND id=${id}::uuid AND uploaded_by=${command.context.principalId}::uuid AND draft_id IS NOT NULL`.execute(tx);
  }
  // Evaluate only after the replacement pins exist. This keeps a selected pin
  // and any other comment/context link alive, while every active version in a
  // now-unreferenced removed series becomes a retention candidate atomically.
  if (!removed.rows.length) return [];
  const orphaned=await sql<{ id: string }>`UPDATE document.attachment attachment SET status='orphaned',is_active=false,status_changed_at=clock_timestamp(),status_changed_by=${command.context.principalId}::uuid,updated_at=clock_timestamp(),updated_by=${command.context.principalId}::uuid WHERE attachment.tenant_id=${command.context.tenantId}::uuid AND attachment.series_id=ANY(${[...new Set(removed.rows.map(row=>row.attachment_series_id))]}::uuid[]) AND attachment.status='active' AND NOT EXISTS(SELECT 1 FROM document.attachment_link remaining WHERE remaining.tenant_id=attachment.tenant_id AND remaining.attachment_series_id=attachment.series_id) RETURNING attachment.id::text`.execute(tx);
  return orphaned.rows.map(row=>row.id);
}
function map(r: Row): CommentRecord {
  return {
    id: String(r["id"]),
    tenantId: String(r["tenant_id"]),
    contextType: String(r["context_type"]),
    entityType: String(r["entity_type"]),
    entityId: String(r["entity_id"]),
    authorId: String(r["commenter_id"]),
    text: String(r["comment_text"]),
    format: String(r["content_format"]) as CommentRecord["format"],
    ...(r["content_json"]
      ? { content: r["content_json"] as Record<string, unknown> }
      : {}),
    ...(r["content_schema"]
      ? { contentSchema: String(r["content_schema"]) }
      : {}),
    ...(r["content_html"] ? { html: String(r["content_html"]) } : {}),
    ...(r["parent_comment_id"]
      ? { parentCommentId: String(r["parent_comment_id"]) }
      : {}),
    threadDepth: Number(r["thread_depth"]),
    visibility: String(r["visibility"]) as CommentRecord["visibility"],
    intent: String(r["comment_intent"]),
    status: String(r["status"]) as CommentRecord["status"],
    createdAt: iso(r["created_at"]),
    revision: Number(r["revision_no"]),
    ...(r["updated_at"] ? { updatedAt: iso(r["updated_at"]) } : {}),
  };
}
function iso(v: unknown) {
  return (v instanceof Date ? v : new Date(String(v))).toISOString();
}
function required<T>(v: T | undefined): T {
  if (!v) throw new Error("COLLABORATION_PERSISTENCE_CONFLICT");
  return v;
}

async function requireLookup(
  tx: CollaborationTransaction,
  tenantId: string,
  key: string,
  code: string,
): Promise<void> {
  const result = await sql<{
    active: boolean;
  }>`SELECT control.lookup_value_is_active(${key},${code},${tenantId}::uuid) AS active`.execute(
    tx,
  );
  if (!result.rows[0]?.active)
    throw new CollaborationError(
      422,
      "INVALID_COLLABORATION_LOOKUP",
      "Unknown or inactive collaboration code",
    );
}
