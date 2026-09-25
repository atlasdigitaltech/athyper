import { sql, type Transaction } from "kysely";
import type { NotificationSourceEvent } from "@athyper/server-contract-notifications";
import type { NotificationPlanningPolicy } from "./notification-planner.js";
import { isUuid } from "./notification-planning-support.js";
type Tx = Transaction<Record<string, never>>;
export const isCollaborationNotification = (source: NotificationSourceEvent) =>
  source.planeKey === "neon" &&
  (source.eventCode.startsWith("collaboration.comment.") ||
    source.eventCode.startsWith("attachments."));
/** Admission is supplied by the host's existing record/capability boundary. */
export function createCollaborationNotificationPolicy(options: {
  fallback: NotificationPlanningPolicy;
  recordHref?(source: NotificationSourceEvent): Promise<string | undefined>;
  authorize(
    source: NotificationSourceEvent,
    principalId: string,
  ): Promise<boolean>;
}): NotificationPlanningPolicy {
  return {
    immediate: (source) =>
      isCollaborationNotification(source) ||
      options.fallback.immediate?.(source) === true,
    async prepare(source, tx) {
      if (!isCollaborationNotification(source))
        return options.fallback.prepare(source, tx);
      if (!source.eventCode.startsWith("collaboration.comment.")) {
        if (!isUuid(source.entityId)) return null;
        const attachment = (
          await sql<{
            entity_type: string;
            entity_id: string;
            file_name: string;
          }>`SELECT metadata->>'entity_type' entity_type,metadata->>'entity_id' entity_id,file_name FROM document.attachment WHERE tenant_id=${source.tenantId}::uuid AND id=${source.entityId}::uuid AND draft_id IS NULL`.execute(
            tx,
          )
        ).rows[0];
        if (!attachment?.entity_type || !attachment.entity_id) return null;
        return {
          ...source,
          payload: {
            ...source.payload,
            entity_type: attachment.entity_type,
            entity_id: attachment.entity_id,
            excerpt: attachment.file_name,
          },
        };
      }
      if (!isUuid(source.entityId)) return null;
      const row = (
        await sql<{
          entity_type: string;
          entity_id: string;
          comment_text: string;
        }>`SELECT entity_type,entity_id,comment_text FROM document.comment WHERE tenant_id=${source.tenantId}::uuid AND id=${source.entityId}::uuid AND status<>'deleted'`.execute(
          tx,
        )
      ).rows[0];
      if (!row) return null;
      const prepared = {
        ...source,
        payload: {
          ...source.payload,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          excerpt: row.comment_text.slice(0, 240),
        },
      };
      const href = await options.recordHref?.(prepared);
      return {
        ...prepared,
        payload: { ...prepared.payload, ...(href ? { entity_url: href } : {}) },
      };
    },
    async forRecipient(source, principalId, tx, work) {
      if (!isCollaborationNotification(source))
        return options.fallback.forRecipient
          ? options.fallback.forRecipient(source, principalId, tx, work)
          : work();
      const previous =
        (
          await sql<{
            principal: string;
          }>`SELECT current_setting('app.current_principal_id',true) principal`.execute(
            tx,
          )
        ).rows[0]?.principal ?? "";
      await sql`SELECT set_config('app.current_principal_id',${principalId},true)`.execute(
        tx,
      );
      try {
        await work();
      } finally {
        await sql`SELECT set_config('app.current_principal_id',${previous},true)`.execute(
          tx,
        );
      }
    },
    async authorizeRecipient(source, principalId, channel, tx) {
      if (!isCollaborationNotification(source))
        return options.fallback.authorizeRecipient(
          source,
          principalId,
          channel,
          tx,
        );
      if (source.eventCode === "collaboration.comment.mentioned") {
        const commentId =
          source.payload.comment_id ??
          source.payload.resource_id ??
          source.entityId;
        if (
          !isUuid(commentId) ||
          !(
            await sql`SELECT 1 FROM document.comment_mention WHERE tenant_id=${source.tenantId}::uuid AND comment_id=${commentId}::uuid AND mentioned_id=${principalId}::uuid`.execute(
              tx,
            )
          ).rows.length
        )
          return false;
      }
      return options.authorize(source, principalId);
    },
  };
}
