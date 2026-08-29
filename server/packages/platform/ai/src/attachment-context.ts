import type { AtlasDataClass } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { AtlasServiceError } from "./errors.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;

export interface AtlasAttachmentContext {
  readonly attachmentId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sha256: string;
  readonly text: string;
}

export interface AtlasAttachmentContextResolver {
  resolve(input: {
    readonly context: VerifiedRequestContext;
    readonly attachmentContextId: string;
    readonly attachmentIds: readonly string[];
    readonly dataClass: AtlasDataClass;
  }): Promise<readonly AtlasAttachmentContext[]>;
}

export class KyselyAtlasAttachmentContextResolver implements AtlasAttachmentContextResolver {
  constructor(
    private readonly transactions: PlaneTransactionCoordinator<Tx>,
    private readonly limits: { readonly maxAttachments?: number; readonly maxCharacters?: number; readonly maxCharactersPerAttachment?: number } = {},
  ) {}

  resolve(input: { readonly context: VerifiedRequestContext; readonly attachmentContextId: string; readonly attachmentIds: readonly string[]; readonly dataClass: AtlasDataClass }): Promise<readonly AtlasAttachmentContext[]> {
    const maxAttachments = this.limits.maxAttachments ?? 5;
    if (!uuid(input.attachmentContextId) || !input.attachmentIds.length || input.attachmentIds.length > maxAttachments || new Set(input.attachmentIds).size !== input.attachmentIds.length || input.attachmentIds.some((id) => !uuid(id))) {
      throw new AtlasServiceError("INVALID_ARGUMENT", `Atlas accepts between 1 and ${maxAttachments} unique attachment references.`);
    }
    return this.transactions.run(input.context.planeKey, actor(input.context), async (tx) => {
      const contexts: AtlasAttachmentContext[] = [];
      let totalCharacters = 0;
      for (const attachmentId of input.attachmentIds) {
        const result = await sql<Row>`SELECT attachment.id,attachment.file_name,attachment.content_type,attachment.sha256,attachment.text_extraction_status,attachment.extracted_text,attachment.pii_detected
          FROM document.attachment attachment
          JOIN document.attachment_link link ON link.tenant_id=attachment.tenant_id AND link.attachment_id=attachment.id
          WHERE attachment.tenant_id=${input.context.tenantId}::uuid
            AND attachment.id=${attachmentId}::uuid
            AND attachment.uploaded_by=${input.context.principalId}::uuid
            AND attachment.status='active' AND attachment.is_active AND attachment.is_current AND attachment.is_virus_scanned
            AND link.entity_type='atlas.prompt' AND link.entity_id=${input.attachmentContextId}
            AND link.created_by=${input.context.principalId}::uuid
          LIMIT 1`.execute(tx);
        const row = result.rows[0];
        if (!row) throw new AtlasServiceError("PERMISSION_DENIED", "An Atlas attachment is unavailable or does not belong to this prompt.");
        const extractionStatus = String(row["text_extraction_status"] ?? "");
        if (!extractionStatus || extractionStatus === "pending") throw new AtlasServiceError("ATTACHMENT_NOT_READY", "An Atlas attachment is still being scanned or indexed.");
        if (extractionStatus !== "extracted" || typeof row["extracted_text"] !== "string" || !row["extracted_text"].trim()) throw new AtlasServiceError("DOCUMENT_REJECTED", "An Atlas attachment could not provide usable text.");
        if (row["pii_detected"] === true && input.dataClass === "public") throw new AtlasServiceError("ADMISSION_DENIED", "An attachment containing detected personal data cannot be used in public Atlas mode.");
        const maxPerAttachment = this.limits.maxCharactersPerAttachment ?? 20_000;
        const text = normalize(row["extracted_text"]).slice(0, maxPerAttachment);
        totalCharacters += text.length;
        if (totalCharacters > (this.limits.maxCharacters ?? 50_000)) throw new AtlasServiceError("RESULT_TOO_LARGE", "The extracted Atlas attachment context is too large. Remove a file or attach a smaller document.");
        contexts.push(Object.freeze({ attachmentId: String(row["id"]), fileName: String(row["file_name"]), contentType: String(row["content_type"] ?? "application/octet-stream"), sha256: String(row["sha256"]), text }));
      }
      return Object.freeze(contexts);
    });
  }
}

function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId }; }
function uuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function normalize(value: string): string { return value.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim(); }
