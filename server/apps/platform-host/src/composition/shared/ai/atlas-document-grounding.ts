import { createHash } from "node:crypto";
import { atlasRequestsRecordOverview } from "./atlas-record-question.js";
import { sql } from "kysely";
import type {
  AtlasAttachmentContextResolver,
  AtlasAttachmentContext,
} from "@athyper/server-platform-ai";
import { AtlasServiceError } from "@athyper/server-platform-ai";
import type { AtlasBusinessContextV1 } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createAttachmentRetrievalAdmission } from "@athyper/server-service-attachments";
import {
  createAtlasAttachmentKnowledge,
  type AtlasAttachmentKnowledgeOptions,
} from "./atlas-attachment-knowledge.js";

import { atlasDocumentSearchTerms } from "./atlas-semantic-index.js";
export { atlasDocumentSearchTerms } from "./atlas-semantic-index.js";
/** The same owner reads protect initial model context, final disclosure, history and replay. */
export function createAtlasDocumentGrounding(
  options: AtlasAttachmentKnowledgeOptions & {
    refresh(context: VerifiedRequestContext): Promise<VerifiedRequestContext>;
  },
) {
  const knowledge = createAtlasAttachmentKnowledge(options);
  const denied = (): never => {
    throw new AtlasServiceError(
      "PERMISSION_DENIED",
      "The document context is no longer available.",
    );
  };
  const attachments: AtlasAttachmentContextResolver = {
    async resolve(input) {
      const page = input.businessContext;
      if (
        input.context.planeKey !== "neon" ||
        page?.kind !== "record" ||
        page.asOf ||
        page.recordId !== input.attachmentContextId ||
        !input.attachmentIds.length ||
        input.attachmentIds.length > 3 ||
        new Set(input.attachmentIds).size !== input.attachmentIds.length ||
        (input.attachmentChunkIds !== undefined &&
          (input.attachmentChunkIds.length !== input.attachmentIds.length ||
            input.attachmentChunkIds.some(
              (id) => !/^[0-9a-f-]{36}$/i.test(id),
            )))
      )
        return denied();
      const context = await options.refresh(input.context);
      const authorizeParent = async ({
        entityCode,
        recordId,
      }: {
        entityCode: string;
        recordId: string;
      }) => {
        if (entityCode !== page.entityCode || recordId !== page.recordId)
          return false;
        const d = await options.metadata.getEntityDescriptor(
          context,
          entityCode,
        );
        if (!d?.ai?.enabled || !d.operations.read) return false;
        const result = await options.records.list({
          context,
          entityCode,
          recordIds: [recordId],
          fields: [d.storage.idField],
          scopeCoordinate: page.workContext,
          limit: 1,
          countMode: "none",
          hydrateReferences: false,
        });
        return (
          result.data.length === 1 &&
          String(result.data[0]?.[d.storage.idField]) === recordId
        );
      };
      if (
        !(
          await options.authorizer.authorize({
            context,
            permissionCode: "neon.ai.agent.use",
            resource: { tenantId: context.tenantId },
          })
        ).allowed ||
        !(await authorizeParent({
          entityCode: page.entityCode,
          recordId: page.recordId,
        }))
      )
        return denied();
      const admission = createAttachmentRetrievalAdmission({
        transactions: options.transactions,
        authorizer: options.authorizer,
        authorizeParent,
      });
      const result: AtlasAttachmentContext[] = [];
      for (const [position, id] of input.attachmentIds.entries()) {
        const selectedChunkId = input.attachmentChunkIds?.[position];
        if (!/^[0-9a-f-]{36}$/i.test(id)) return denied();
        // Read only canonical locators until both owner permissions have been checked.
        const source = await options.transactions.run(
          "neon",
          { tenantId: context.tenantId, principalId: context.principalId },
          async (tx) =>
            (
              await sql<{
                revision_id: string;
                source_version_id: string;
                chunk_id: string;
                checksum: string;
                character_start: number;
                character_end: number;
              }>`SELECT r.id revision_id,r.source_version_id,c.id chunk_id,c.checksum,c.character_start,c.character_end FROM ai.atlas_knowledge_source s JOIN ai.atlas_knowledge_revision r ON r.source_id=s.id AND r.tenant_id=s.tenant_id JOIN ai.atlas_knowledge_chunk c ON c.revision_id=r.id AND c.tenant_id=r.tenant_id WHERE s.tenant_id=${context.tenantId}::uuid AND s.source_kind='attachment' AND s.source_id=${id} AND s.entity_code=${page.entityCode} AND s.permission_code='neon.collaboration.attachment.read' AND s.status='active' AND r.status='ready' AND c.index_status='ready' AND ${selectedChunkId ? sql`c.id=${selectedChunkId}::uuid` : sql`c.ordinal=0`} LIMIT 1`.execute(
                tx,
              )
            ).rows[0],
        );
        if (!source) return denied();
        const citation = {
          sourceId: id,
          sourceVersionId: source.source_version_id,
          contentHash: source.checksum,
          characterStart: source.character_start,
          characterEnd: source.character_end,
        };
        if (
          !(await admission.authorize({
            context,
            source: {
              tenantId: context.tenantId,
              sourceKind: "attachment",
              sourceId: id,
              entityCode: page.entityCode,
              permissionCode: "neon.collaboration.attachment.read",
            },
            citation,
          }))
        )
          return denied();
        const row = await options.transactions.run(
          "neon",
          { tenantId: context.tenantId, principalId: context.principalId },
          async (tx) =>
            (
              await sql<{
                file_name: string;
                content_type: string;
                sha256: string;
                extracted_text: string;
                pii_detected: boolean;
              }>`SELECT file_name,content_type,sha256,extracted_text,pii_detected FROM document.attachment WHERE tenant_id=${context.tenantId}::uuid AND id=${id}::uuid AND status='active' AND is_active AND is_virus_scanned AND text_extraction_status='extracted' AND octet_length(extracted_text)<=1000000 AND id::text||':'||sha256=${source.source_version_id}`.execute(
                tx,
              )
            ).rows[0],
        );
        if (!row || (row.pii_detected && input.dataClass === "public"))
          return denied();
        const text = row.extracted_text.slice(
          source.character_start,
          source.character_end,
        );
        if (
          text.length > 2000 ||
          createHash("sha256").update(text, "utf8").digest("hex") !==
            source.checksum
        )
          return denied();
        // Recheck link/version/expiry after the passage read, before returning any model context.
        if (
          !(await admission.authorize({
            context,
            source: {
              tenantId: context.tenantId,
              sourceKind: "attachment",
              sourceId: id,
              entityCode: page.entityCode,
              permissionCode: "neon.collaboration.attachment.read",
            },
            citation,
          }))
        )
          return denied();
        result.push({
          attachmentId: id,
          fileName: row.file_name,
          contentType: row.content_type,
          sha256: row.sha256,
          text,
          provenance: {
            ...citation,
            revisionId: source.revision_id,
            chunkId: source.chunk_id,
          },
        });
      }
      return result;
    },
  };
  return {
    attachments,
    async select(
      context: VerifiedRequestContext,
      page: AtlasBusinessContextV1 | undefined,
      query: string,
      signal?: AbortSignal,
    ) {
      if (context.planeKey !== "neon" || page?.kind !== "record" || page.asOf)
        return undefined;
      if (atlasRequestsRecordOverview(query)) return undefined;
      const current = await options.refresh(context);
      const found = await knowledge.execute(
        current,
        {
          entityCode: page.entityCode,
          recordId: page.recordId,
          scopeCoordinate: page.workContext,
          query: options.semantic ? query : atlasDocumentSearchTerms(query),
        },
        false,
        signal,
      );
      if (!("citations" in found) || !found.citations?.length) return undefined;
      // Pack whole ranked passages without silently truncating canonical evidence.
      if (options.semantic) {
        const selected: typeof found.citations = [];
        let characters = 0;
        for (const item of found.citations) {
          const length =
            item.citation.characterEnd - item.citation.characterStart;
          if (
            selected.some(
              (x) => x.citation.sourceId === item.citation.sourceId,
            ) ||
            characters + length > 2000
          )
            continue;
          selected.push(item);
          characters += length;
          if (selected.length === 3) break;
        }
        if (!selected.length) return undefined;
        return {
          attachmentContextId: page.recordId,
          attachmentIds: selected.map((x) => x.citation.sourceId),
          attachmentChunkIds: selected.map((x) => x.citation.chunkId),
        };
      }
      return {
        attachmentContextId: page.recordId,
        attachmentIds: [
          ...new Set(found.citations.map((x) => x.citation.sourceId)),
        ].slice(0, 3),
      };
    },
  };
}
