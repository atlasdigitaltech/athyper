import { createAtlasSemanticIndex, type AtlasSemanticConfig } from "./atlas-semantic-index.js";
import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  Application,
  RequestHandler,
  Response,
} from "@athyper/server-runtime-http";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type {
  RecordQueryService,
  RecordListScopeCoordinate,
} from "@athyper/server-contract-records";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { AtlasKnowledgeIndex } from "@athyper/server-contract-ai";
import {
  AtlasKnowledgeService,
  KyselyAtlasKnowledgeRepository,
} from "@athyper/server-platform-ai";
import { createAttachmentRetrievalAdmission } from "@athyper/server-service-attachments";
import {
  createMeilisearchIndex,
  type MeilisearchIndexConfig,
} from "@athyper/server-adapter-search-meilisearch";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";

type Tx = Transaction<Record<string, never>>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const deny = (reason = "context") => {
  throw Object.assign(
    new Error("Attachment knowledge unavailable: " + reason),
    { status: 403 },
  );
};
/** Local-runtime attachment ingestion and locator retrieval. Text remains owner-authorized. */
export type AtlasAttachmentKnowledgeOptions = {
  authenticate: RequestHandler;
  readContext: (res: Response) => VerifiedRequestContext;
  transactions: PlaneTransactionCoordinator<Tx>;
  authorizer: Authorizer;
  metadata: MetadataReader;
  records: RecordQueryService;
  search: MeilisearchIndexConfig;
  semantic?: AtlasSemanticConfig;
};
export function createAtlasAttachmentKnowledge(
  options: AtlasAttachmentKnowledgeOptions,
) {
  const semantic = options.semantic ? createAtlasSemanticIndex(options.search, options.semantic) : undefined;
  const search = createMeilisearchIndex({
    ...options.search,
    indexUid: options.search.indexUid ?? "atlas_attachment_knowledge_neon",
  });
  let initialized: Promise<void> | undefined;
  const initialize = () =>
    (initialized ??= search.initialize().catch((e) => {
      initialized = undefined;
      throw e;
    }));
  return {
    async execute(
      context: VerifiedRequestContext,
      body: Record<string, unknown>,
      ingest: boolean,
      signal?: AbortSignal,
    ) {
      signal?.throwIfAborted();
      if (context.planeKey !== "neon") return deny();
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Object.assign(new Error("JSON object required"), {
          status: 400,
        });
      const entityCode =
        typeof body.entityCode === "string" ? body.entityCode : "";
      const recordId = typeof body.recordId === "string" ? body.recordId : "";
      if (!/^[a-z][a-z0-9_]*$/.test(entityCode) || !uuid.test(recordId))
        throw Object.assign(
          new Error("Entity and record coordinates required"),
          { status: 400 },
        );
      const scopeCoordinate = body.scopeCoordinate as
        RecordListScopeCoordinate | undefined;
      if (
        scopeCoordinate !== undefined &&
        (!scopeCoordinate ||
          typeof scopeCoordinate !== "object" ||
          Array.isArray(scopeCoordinate))
      )
        throw Object.assign(new Error("Invalid work scope"), { status: 400 });
      const permissionCode = "neon.collaboration.attachment.read";
      const resource = {
        tenantId: context.tenantId,
        resourceCode: entityCode,
        recordId,
        entityType: entityCode,
        entityId: recordId,
      };
      if (
        !(
          await options.authorizer.authorize({
            context,
            permissionCode: "neon.ai.agent.use",
            resource: { tenantId: context.tenantId },
          })
        ).allowed
      )
        return deny("Atlas admission");
      const authorizeParent = async (input: {
        context: VerifiedRequestContext;
        entityCode: string;
        recordId: string;
      }) => {
        if (input.entityCode !== entityCode || input.recordId !== recordId)
          return false;
        const d = await options.metadata.getEntityDescriptor(
          input.context,
          entityCode,
        );
        if (!d?.ai?.enabled || !d.operations.read || d.planeKey !== "neon")
          return false;
        const found = await options.records.list({
          context: input.context,
          entityCode,
          recordIds: [recordId],
          fields: [d.storage.idField],
          scopeCoordinate,
          limit: 1,
          countMode: "none",
          hydrateReferences: false,
        });
        return (
          found.data.length === 1 &&
          String(found.data[0]?.[d.storage.idField]) === recordId
        );
      };
      if (!(await authorizeParent({ context, entityCode, recordId })))
        return deny("parent record admission");
      const tx = <T>(work: (tx: Tx) => Promise<T>) =>
        options.transactions.run(
          "neon",
          { tenantId: context.tenantId, principalId: context.principalId },
          work,
        );
      const admission = createAttachmentRetrievalAdmission({
        transactions: options.transactions,
        authorizer: options.authorizer,
        authorizeParent,
      });
      const index: AtlasKnowledgeIndex = {
        async index(input) {
          await initialize();
          const text = input.chunks.map((c) => c.text).join("");
          const id = input.revisionId;
          await search.upsert({
            id,
            planeKey: "neon",
            tenantId: input.tenantId,
            attachmentId: input.source.sourceId,
            resourceType: "attachment",
            resourceId: id,
            entityType: entityCode,
            entityId: recordId,
            title: "Entity attachment",
            text,
            contentType: "text/plain",
            fileName: "",
            piiTypes: [],
            updatedAt: new Date().toISOString(),
          });
          return input.chunks.map((c) => ({
            ordinal: c.ordinal,
            indexReference: id,
            embeddingModel: "meilisearch-lexical-v1",
          }));
        },
        async search(input) {
          if (semantic) return semantic.search({tenantId:input.tenantId,entityCode,recordId},input.query,input.limit,signal);
          await initialize();
          const hits = await search.search({
            planeKey: "neon",
            tenantId: input.tenantId,
            text: input.query,
            entityTypes: [entityCode],
            resourceTypes: ["attachment"],
            limit: input.limit,
            offset: 0,
          });
          const revisions = hits.hits
            .filter(
              (h) =>
                h.entityId === recordId &&
                h.resourceId &&
                uuid.test(h.resourceId),
            )
            .map((h) => h.resourceId!);
          if (!revisions.length) return [];
          const rows = await tx(
            async (db) =>
              (
                await sql<{
                  source_id: string;
                  source_version_id: string;
                  revision_id: string;
                  chunk_id: string;
                  checksum: string;
                  character_start: number;
                  character_end: number;
                  permission_code: string;
                }>`SELECT s.source_id,r.source_version_id,r.id revision_id,c.id chunk_id,c.checksum,c.character_start,c.character_end,s.permission_code FROM ai.atlas_knowledge_source s JOIN ai.atlas_knowledge_revision r ON r.source_id=s.id AND r.tenant_id=s.tenant_id JOIN ai.atlas_knowledge_chunk c ON c.revision_id=r.id AND c.tenant_id=r.tenant_id WHERE s.tenant_id=${input.tenantId}::uuid AND s.entity_code=${entityCode} AND r.id=ANY(ARRAY[${sql.join(revisions.map((id) => sql`${id}::uuid`))}]::uuid[]) AND s.status='active' AND r.status='ready' AND c.index_status='ready' ORDER BY array_position(ARRAY[${sql.join(revisions.map((id) => sql`${id}::uuid`))}]::uuid[],r.id),c.ordinal LIMIT ${input.limit}`.execute(
                  db,
                )
              ).rows,
          );
          return rows.map((r) => ({
            citation: {
              sourceId: r.source_id,
              sourceVersionId: r.source_version_id,
              revisionId: r.revision_id,
              chunkId: r.chunk_id,
              contentHash: r.checksum,
              characterStart: r.character_start,
              characterEnd: r.character_end,
            },
            permissionCode: r.permission_code,
            score: 1,
          }));
        },
        async remove(input) {
          for (const id of input.revisionIds) await search.remove(id);
        },
        async health() {
          return { healthy: (await search.health()).status === "healthy" };
        },
      };
      const knowledge = new AtlasKnowledgeService({
        repository: new KyselyAtlasKnowledgeRepository(options.transactions),
        index,
        admission,
      });
      if (!ingest) {
        if (
          typeof body.query !== "string" ||
          !body.query.trim() ||
          body.query.length > 4096
        )
          throw Object.assign(new Error("Bounded search query required"), {
            status: 400,
          });
        return {
          citations: await knowledge.search({
            context,
            query: body.query,
            limit: 8,
          }),
        };
      }
      const attachmentId =
        typeof body.attachmentId === "string" ? body.attachmentId : "";
      if (!uuid.test(attachmentId))
        throw Object.assign(new Error("Attachment ID required"), {
          status: 400,
        });
      for (const code of [
        permissionCode,
        "neon.collaboration.attachment.create",
      ])
        if (
          !(
            await options.authorizer.authorize({
              context,
              permissionCode: code,
              resource: {
                ...resource,
                resourceId: attachmentId,
                attachmentId,
              },
            })
          ).allowed
        )
          return deny("attachment permission");
      const attachment = await tx(
        async (db) =>
          (
            await sql<{
              text: string;
              sha256: string;
            }>`SELECT a.extracted_text text,a.sha256 FROM document.attachment a JOIN document.attachment_series s ON s.id=a.series_id AND s.tenant_id=a.tenant_id JOIN document.attachment_link l ON l.attachment_series_id=s.id AND l.tenant_id=s.tenant_id WHERE a.tenant_id=${context.tenantId}::uuid AND a.id=${attachmentId}::uuid AND a.status='active' AND a.is_active AND a.is_virus_scanned AND a.text_extraction_status='extracted' AND octet_length(a.extracted_text)<=1000000 AND s.status='active' AND s.current_attachment_id=a.id AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp()) AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp()) AND (l.pinned_attachment_id IS NULL OR l.pinned_attachment_id=a.id) AND l.entity_type=${entityCode} AND l.entity_id=${recordId} LIMIT 1`.execute(
              db,
            )
          ).rows[0],
      );
      if (!attachment?.text) return deny("extraction eligibility");
      const sourceVersionId = attachmentId + ":" + attachment.sha256;
      if (
        !(await admission.authorize({
          context,
          source: {
            tenantId: context.tenantId,
            sourceKind: "attachment",
            sourceId: attachmentId,
            entityCode,
            permissionCode,
          },
          citation: {
            sourceId: attachmentId,
            sourceVersionId,
            contentHash: hash(attachment.text.slice(0, 2000)),
            characterStart: 0,
            characterEnd: Math.min(attachment.text.length, 2000),
          },
        }))
      )
        return deny("live attachment owner admission");
      await knowledge.registerSource({
        context,
        sourceKind: "attachment",
        sourceId: attachmentId,
        entityCode,
        permissionCode,
      });
      const ingested = await knowledge.ingest({context,sourceId:attachmentId,sourceVersionId,text:attachment.text});
      if (semantic) {
        const chunks = await tx(async db => (await sql<{id:string;checksum:string;character_start:number;character_end:number}>`SELECT id,checksum,character_start,character_end FROM ai.atlas_knowledge_chunk WHERE tenant_id=${context.tenantId}::uuid AND revision_id=${ingested.revisionId}::uuid AND index_status='ready' ORDER BY ordinal`.execute(db)).rows);
        if (chunks.length !== ingested.chunkCount) throw new Error("Canonical passage coverage incomplete");
        const passages=chunks.map(c=>{
          const text=attachment.text.slice(c.character_start,c.character_end);
          if(hash(text)!==c.checksum)throw new Error("Canonical passage checksum mismatch");
          return {text,permissionCode,citation:{sourceId:attachmentId,sourceVersionId,revisionId:ingested.revisionId,chunkId:c.id,contentHash:c.checksum,characterStart:c.character_start,characterEnd:c.character_end}};
        });
        await semantic.index({tenantId:context.tenantId,entityCode,recordId},passages,signal);
      }
      return {attachmentId,sourceVersionId,...ingested,retrievalMode:semantic?"hybrid":"lexical",...(options.semantic?{embeddingModel:options.semantic.model,embeddingDigest:options.semantic.digest}:{})};
    },
  };
}

export function registerAtlasAttachmentKnowledge(
  app: Application,
  options: AtlasAttachmentKnowledgeOptions,
) {
  const service = createAtlasAttachmentKnowledge(options);
  const route =
    (ingest: boolean): RequestHandler =>
    async (req, res, next) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const closed = () => { if (!res.writableEnded) abort(); };
      req.once("aborted", abort); res.once("close", closed);
      if (req.aborted || res.destroyed) abort();
      try {
        const result = await service.execute(options.readContext(res), req.body, ingest, controller.signal);
        if (!controller.signal.aborted) res.json(result);
      } catch (e) {
        if (controller.signal.aborted) return;
        const status =
          (e as { status?: number; statusCode?: number }).status ??
          (e as { statusCode?: number }).statusCode;
        if (status && status >= 400 && status < 500)
          res.status(status).json({
            code: "ATTACHMENT_KNOWLEDGE_UNAVAILABLE",
            message: (e as Error).message,
          });
        else next(e);
      } finally { req.removeListener("aborted", abort); res.removeListener("close", closed); }
    };
  for (const [path, ingest] of [
    ["/api/atlas/knowledge/attachments/reindex", true],
    ["/api/atlas/knowledge/search", false],
  ] as const) {
    registerContractRoute(
      app,
      defineRouteContract({
        method: "post",
        path,
        operationId: ingest
          ? "atlas.reindexAttachment"
          : "atlas.searchAttachmentKnowledge",
        summary: "Authorized attachment knowledge",
        tags: ["Atlas"],
        authenticated: true,
        permission: "neon.ai.agent.use",
        request: { body: { type: "object", additionalProperties: true } },
        responses: {
          200: {
            description: "Knowledge result",
            body: { type: "object", additionalProperties: true },
          },
          403: { description: "Denied" },
        },
      }),
      options.authenticate,
      route(ingest),
    );
  }
}
