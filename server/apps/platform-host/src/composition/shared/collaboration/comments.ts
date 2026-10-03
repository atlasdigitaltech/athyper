import { createHash } from "node:crypto";
import { sql } from "kysely";
import { exactCollaborationEntityCoordinates, type CollaborationEntityCoordinates } from "@athyper/server-platform-collaboration";
import { canReplyAtDepth } from "@athyper/server-platform-experience";
import { commentDescendants } from "./comment-descendants.js";
import type {
  CollaborationTransactions,
  CollaborationSectionProvider,
} from "./contracts.js";

/** Called only after entity-runtime section/capability admission; row visibility remains enforced in SQL. */
export function createCommentSectionProvider(
  transactions: CollaborationTransactions,
  entityCoordinates: CollaborationEntityCoordinates = exactCollaborationEntityCoordinates,
): CollaborationSectionProvider {
  const collaborationEntityTypes = entityCoordinates.entityTypes;
  return {
    async read({
      context,
      core,
      recordId,
      limit,
      cursor,
      resourceContext,
      capability,
    }) {
      // Section admission has already established current record participation.
      // Private rows remain author-only even for another record collaborator.
      // Resolve names only for these admitted comments via the existing bounded,
      // tenant/membership-scoped directory. Direct principal joins are self-only
      // under RLS and would anonymize other authors. Missing/inactive names retain
      // the UI fallback; do not broaden principal SELECT privileges.
      const threadRootId = resourceContext?.threadRootId;
      const pageLimit = threadRootId ? Math.min(limit, 20) : limit;
      const descendants = (root: ReturnType<typeof sql>) =>
        commentDescendants({
          entityCoordinates,
          tenantId: context.tenantId,
          principalId: context.principalId,
          entityType: core.entityCode,
          entityId: recordId,
          root,
        });
      const mentionFilter =
        resourceContext?.commentFilter === "mentions" && !threadRootId
          ? sql`AND EXISTS (SELECT 1 FROM document.comment_mention mention
                    JOIN document.comment mentioned ON mentioned.tenant_id=mention.tenant_id AND mentioned.id=mention.comment_id
                    WHERE mention.tenant_id=${context.tenantId}::uuid AND mention.mentioned_id=${context.principalId}::uuid
                      AND mentioned.status<>'deleted'
                      AND (mention.comment_id=comment.id OR mention.comment_id IN (${descendants(sql`comment.id`)})))`
          : sql``;
      const result = await transactions.run(
        context.planeKey,
        context,
        async (tx) => {
          const [rows, draft, unread, total] = await Promise.all([
            (
              await sql<{
                id: string;
                text: string;
                content_json: unknown;
                content_format: string;
                revision_no: number;
                author_id: string;
                author_display_name: string | null;
                visibility: string;
                status: string;
                report_status: string | null;
                viewer_report: Record<string, unknown> | null;
                decision_code: string | null;
                reactions: unknown;
                viewer_reactions: unknown;
                pinned_files: unknown;
                created_at: Date | string;
                updated_at: Date | string | null;
                parent_comment_id: string | null;
                reply_count: string;
                reply_to_name: string | null;
                reply_parent: { deleted: boolean; excerpt: string } | null;
                thread_depth: number;
              }>`SELECT comment.id::text,comment.comment_text text,comment.content_json,comment.content_format,comment.revision_no,comment.commenter_id::text author_id,principal.name author_display_name,comment.visibility,comment.status,(SELECT flag.status FROM event.comment_flag flag WHERE flag.tenant_id=comment.tenant_id AND flag.comment_id=comment.id AND flag.reporter_principal_id=${context.principalId}::uuid ORDER BY flag.created_at DESC,flag.id DESC LIMIT 1) report_status,(SELECT jsonb_build_object('reason',flag.reason_code,'detail',flag.detail,'submittedAt',flag.created_at,'status',COALESCE(moderation.status::text,flag.status::text),'decision',moderation.decision_code) FROM event.comment_flag flag LEFT JOIN governance.comment_moderation moderation ON moderation.tenant_id=flag.tenant_id AND moderation.comment_flag_id=flag.id WHERE flag.tenant_id=comment.tenant_id AND flag.comment_id=comment.id AND flag.reporter_principal_id=${context.principalId}::uuid ORDER BY flag.created_at DESC,flag.id DESC LIMIT 1) viewer_report,(SELECT moderation.decision_code FROM event.comment_flag flag JOIN governance.comment_moderation moderation ON moderation.tenant_id=flag.tenant_id AND moderation.comment_flag_id=flag.id WHERE flag.tenant_id=comment.tenant_id AND flag.comment_id=comment.id AND flag.reporter_principal_id=${context.principalId}::uuid ORDER BY flag.created_at DESC,flag.id DESC LIMIT 1) decision_code,COALESCE((SELECT jsonb_agg(jsonb_build_object('code',reaction_type,'count',count)) FROM (SELECT reaction_type,count(*) count FROM document.comment_reaction reaction WHERE reaction.tenant_id=comment.tenant_id AND reaction.comment_id=comment.id GROUP BY reaction_type) grouped),'[]'::jsonb) reactions,COALESCE((SELECT jsonb_agg(reaction_type) FROM document.comment_reaction reaction WHERE reaction.tenant_id=comment.tenant_id AND reaction.comment_id=comment.id AND reaction.principal_id=${context.principalId}::uuid),'[]'::jsonb) viewer_reactions,COALESCE((SELECT jsonb_agg(jsonb_build_object('attachmentId',attachment.id::text,'fileName',attachment.file_name,'version',attachment.version_no,'sizeBytes',attachment.size_bytes)) FROM document.attachment_link link JOIN document.attachment attachment ON attachment.tenant_id=link.tenant_id AND attachment.id=link.pinned_attachment_id WHERE link.tenant_id=comment.tenant_id AND link.entity_type='document.comment' AND link.entity_id=comment.id::text AND link.link_kind='comment'),'[]'::jsonb) pinned_files,${threadRootId ? sql`'0'::text` : sql`(SELECT count(*)::text FROM (${descendants(sql`comment.id`)}) replies)`} reply_count,(SELECT author.name FROM document.comment parent LEFT JOIN LATERAL (SELECT display_name AS name FROM document.collaboration_principal_candidates('',parent.commenter_id)) author ON true WHERE parent.id=comment.parent_comment_id AND parent.tenant_id=comment.tenant_id AND parent.context_type=comment.context_type AND parent.entity_type=comment.entity_type AND parent.entity_id=comment.entity_id AND (parent.visibility IN ('public','internal') OR parent.commenter_id=${context.principalId}::uuid)) reply_to_name,(SELECT jsonb_build_object('deleted',parent.status='deleted','excerpt',CASE WHEN parent.status='deleted' THEN '' ELSE left(parent.comment_text,140) END) FROM document.comment parent WHERE parent.id=comment.parent_comment_id AND parent.tenant_id=comment.tenant_id AND parent.context_type=comment.context_type AND parent.entity_type=comment.entity_type AND parent.entity_id=comment.entity_id AND (parent.visibility IN ('public','internal') OR parent.commenter_id=${context.principalId}::uuid)) reply_parent,comment.thread_depth,comment.created_at,comment.updated_at,comment.parent_comment_id::text FROM document.comment comment LEFT JOIN LATERAL (SELECT display_name AS name FROM document.collaboration_principal_candidates('',comment.commenter_id)) principal ON true WHERE comment.tenant_id=${context.tenantId}::uuid AND comment.context_type='entity' AND comment.entity_type=ANY(${collaborationEntityTypes(core.entityCode)}::text[]) AND comment.entity_id=${recordId} AND (comment.visibility IN ('public','internal') OR comment.commenter_id=${context.principalId}::uuid) ${threadRootId ? sql`AND comment.id IN (${descendants(sql`${threadRootId}::uuid`)})` : sql`AND comment.parent_comment_id IS NULL`} ${mentionFilter} ${cursor ? sql`AND (comment.created_at,comment.id)${threadRootId ? sql`>` : sql`<`}(SELECT created_at,id FROM document.comment WHERE tenant_id=${context.tenantId}::uuid AND id=${cursor}::uuid)` : sql``} ORDER BY comment.created_at ${threadRootId ? sql`ASC` : sql`DESC`},comment.id ${threadRootId ? sql`ASC` : sql`DESC`} LIMIT ${pageLimit + 1}`.execute(
                tx,
              )
            ).rows,
            (
              await sql<{
                id: string;
                draft_text: string;
                content_format: string;
                content_json: unknown;
                content_schema: string | null;
                visibility: string;
                updated_at: Date | string | null;
                created_at: Date | string;
                parent_comment_id: string | null;
              }>`SELECT id::text,draft_text,content_format,content_json,content_schema,visibility,updated_at,created_at,parent_comment_id::text FROM document.comment_draft WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND context_type='entity' AND entity_type=ANY(${collaborationEntityTypes(core.entityCode)}::text[]) AND entity_id=${recordId} AND parent_comment_id IS NOT DISTINCT FROM ${threadRootId ?? null}::uuid AND expires_at>clock_timestamp() LIMIT 1`.execute(
                tx,
              )
            ).rows[0],
            (
              await sql<{
                count: string | number;
              }>`SELECT count(*)::text count FROM document.comment comment LEFT JOIN document.comment_feed_cursor cursor ON cursor.tenant_id=comment.tenant_id AND cursor.principal_id=${context.principalId}::uuid AND cursor.entity_type=comment.entity_type AND cursor.entity_id=comment.entity_id WHERE comment.tenant_id=${context.tenantId}::uuid AND comment.context_type='entity' AND comment.entity_type=ANY(${collaborationEntityTypes(core.entityCode)}::text[]) AND comment.entity_id=${recordId} AND comment.status<>'deleted' AND comment.commenter_id<>${context.principalId}::uuid AND (comment.visibility IN ('public','internal') OR comment.commenter_id=${context.principalId}::uuid) AND comment.created_at>COALESCE(cursor.last_read_at,'-infinity'::timestamptz)`.execute(
                tx,
              )
            ).rows[0]?.count,
            (
              await sql<{
                count: string | number;
              }>`SELECT count(*)::text count FROM document.comment comment WHERE comment.tenant_id=${context.tenantId}::uuid AND comment.context_type='entity' AND comment.entity_type=ANY(${collaborationEntityTypes(core.entityCode)}::text[]) AND comment.entity_id=${recordId} AND (comment.visibility IN ('public','internal') OR comment.commenter_id=${context.principalId}::uuid) ${threadRootId ? sql`AND comment.id IN (${descendants(sql`${threadRootId}::uuid`)})` : sql`AND comment.parent_comment_id IS NULL`} ${mentionFilter}`.execute(
                tx,
              )
            ).rows[0]?.count,
          ]);
          return {
            rows,
            draft,
            unread: Number(unread ?? 0),
            total: Number(total ?? 0),
          };
        },
      );
      const rows = result.rows;
      const items = rows.slice(0, pageLimit).map((row) =>
        Object.freeze({
          id: row.id,
          replyCount: Number(row.reply_count),
          threadDepth: row.thread_depth,
          canReply:
            !!capability &&
            "maxDepth" in capability.binding &&
            canReplyAtDepth(
              row.status,
              row.thread_depth,
              capability.binding.maxDepth,
            ),
          ...(row.reply_parent
            ? {
                replyToDeleted: row.reply_parent.deleted,
                replyToExcerpt: row.reply_parent.excerpt,
              }
            : {}),
          ...(row.reply_to_name ? { replyToName: row.reply_to_name } : {}),
          text: row.status === "deleted" ? "" : row.text,
          ...(row.status !== "deleted" &&
          row.content_format === "rich_json" &&
          row.content_json
            ? { content: row.content_json, format: "rich_json" }
            : {}),
          revision: row.revision_no,
          authorId: row.author_id,
          ...(row.author_display_name
            ? { authorDisplayName: row.author_display_name }
            : {}),
          visibility: row.visibility,
          tombstone: row.status === "deleted",
          ...(row.report_status ? { reportStatus: row.report_status } : {}),
          ...(row.viewer_report ? { viewerReport: row.viewer_report } : {}),
          ...(row.decision_code
            ? { moderationDecision: row.decision_code }
            : {}),
          reactions: row.status === "deleted" ? [] : row.reactions,
          viewerReactions: row.status === "deleted" ? [] : row.viewer_reactions,
          pinnedFiles: row.status === "deleted" ? [] : row.pinned_files,
          createdAt: new Date(row.created_at).toISOString(),
          ...(row.updated_at
            ? { updatedAt: new Date(row.updated_at).toISOString() }
            : {}),
          ...(row.parent_comment_id
            ? { parentCommentId: row.parent_comment_id }
            : {}),
        }),
      );
      const draft = result.draft
        ? Object.freeze({
            id: result.draft.id,
            text: result.draft.draft_text,
            format: result.draft.content_format,
            ...(result.draft.content_json
              ? { content: result.draft.content_json }
              : {}),
            ...(result.draft.content_schema
              ? { contentSchema: result.draft.content_schema }
              : {}),
            visibility: result.draft.visibility,
            revision: new Date(
              result.draft.updated_at ?? result.draft.created_at,
            ).toISOString(),
          })
        : undefined;
      return Object.freeze({
        revision: createHash("sha256")
          .update(
            JSON.stringify({
              items,
              draft,
              total: result.total,
              unread: result.unread,
            }),
          )
          .digest("hex"),
        data: Object.freeze({
          items,
          totalCount: result.total,
          unreadCount: result.unread,
          ...(threadRootId ? { threadRootId } : {}),
          ...(draft ? { draft } : {}),
          ...(rows.length > pageLimit && items.at(-1)?.id
            ? { nextCursor: items.at(-1)!.id }
            : {}),
        }),
      });
    },
  };
}
