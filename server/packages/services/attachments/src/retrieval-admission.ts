import { createHash } from "node:crypto";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";

type Tx = Transaction<Record<string, never>>;
export interface AttachmentRetrievalRequest {
  readonly context: VerifiedRequestContext;
  readonly source: {
    readonly tenantId: string;
    readonly sourceKind: string;
    readonly sourceId: string;
    readonly entityCode?: string;
    readonly permissionCode: string;
  };
  readonly citation: {
    readonly sourceId: string;
    readonly sourceVersionId: string;
    readonly contentHash: string;
    readonly characterStart: number;
    readonly characterEnd: number;
  };
}
/** Owner of entity-linked attachment eligibility. No object URL or passage is disclosed. */
export function createAttachmentRetrievalAdmission(options: {
  readonly transactions: PlaneTransactionCoordinator<Tx>;
  readonly authorizer: Authorizer;
  /** Must use current published metadata and authorized Records membership, never raw SQL. */
  readonly authorizeParent: (input: {
    context: VerifiedRequestContext;
    entityCode: string;
    recordId: string;
  }) => Promise<boolean>;
}) {
  return {
    async authorize({
      context,
      source,
      citation,
    }: AttachmentRetrievalRequest): Promise<boolean> {
      try {
        if (
          source.sourceKind !== "attachment" ||
          source.tenantId !== context.tenantId ||
          source.sourceId !== citation.sourceId ||
          !/^[0-9a-f-]{36}$/i.test(source.sourceId) ||
          !source.entityCode ||
          !/^[a-z][a-z0-9_]*$/.test(source.entityCode) ||
          !Number.isSafeInteger(citation.characterStart) ||
          !Number.isSafeInteger(citation.characterEnd) ||
          citation.characterStart < 0 ||
          citation.characterEnd <= citation.characterStart ||
          citation.characterEnd > 1_000_000 ||
          citation.characterEnd - citation.characterStart > 16_000
        )
          return false;
        const actor = {
          tenantId: context.tenantId,
          principalId: context.principalId,
        };
        // Source version is the immutable attachment ID plus scanned file checksum.
        const load = (text: boolean, parentId?: string) =>
          options.transactions.run(context.planeKey, actor, async (tx) => {
            return (
              await sql<{
                entity_id: string;
                text: string | null;
              }>`SELECT l.entity_id,
            ${text ? sql`a.extracted_text` : sql`NULL::text`} AS text
            FROM document.attachment a
            JOIN document.attachment_series s ON s.tenant_id=a.tenant_id AND s.id=a.series_id
            JOIN document.attachment_link l ON l.tenant_id=s.tenant_id AND l.attachment_series_id=s.id
            WHERE a.tenant_id=${context.tenantId}::uuid AND a.id=${source.sourceId}::uuid
              AND a.status='active' AND a.is_active AND a.is_virus_scanned
              AND a.text_extraction_status='extracted'
              AND octet_length(a.extracted_text)<=1000000
              AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
              AND s.status='active' AND s.current_attachment_id=a.id
              AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp())
              AND (l.pinned_attachment_id IS NULL OR l.pinned_attachment_id=a.id)
              AND l.entity_type=${source.entityCode}
              AND (${parentId ?? null}::text IS NULL OR l.entity_id=${parentId ?? null})
              AND (a.id::text || ':' || a.sha256)=${citation.sourceVersionId}
            ORDER BY l.entity_id LIMIT 21`.execute(tx)
            ).rows;
          });
        const parents = await load(false);
        if (!parents.length || parents.length > 20) return false;
        for (const parent of parents) {
          if (
            !(await options.authorizeParent({
              context,
              entityCode: source.entityCode,
              recordId: parent.entity_id,
            }))
          )
            continue;
          const permission = await options.authorizer.authorize({
            context,
            permissionCode:
              context.planeKey === "neon"
                ? "neon.collaboration.attachment.read"
                : `${context.planeKey}.catalog.attachment.read`,
            resource: {
              tenantId: context.tenantId,
              resourceCode: source.entityCode,
              recordId: parent.entity_id,
              entityType: source.entityCode,
              entityId: parent.entity_id,
              resourceId: source.sourceId,
              attachmentId: source.sourceId,
            },
          });
          if (!permission.allowed) continue;
          // Recheck lifecycle/link after authorization and load bounded owner text only then.
          const current = (await load(true, parent.entity_id)).find(
            (row) => row.entity_id === parent.entity_id,
          );
          if (!current?.text || current.text.length < citation.characterEnd)
            return false;
          return (
            createHash("sha256")
              .update(
                current.text.slice(
                  citation.characterStart,
                  citation.characterEnd,
                ),
                "utf8",
              )
              .digest("hex") === citation.contentHash
          );
        }
        return false;
      } catch {
        return false;
      }
    },
  };
}
