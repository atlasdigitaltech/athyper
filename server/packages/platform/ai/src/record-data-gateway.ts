import { createHash } from 'node:crypto';
import type { AtlasFieldSecurityProjector, AtlasRecordDataGateway, AtlasRecordResult } from "@athyper/server-contract-ai";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordQueryService } from "@athyper/server-contract-records";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";

export interface AtlasRecordDataGatewayOptions {
  readonly metadata: MetadataReader;
  readonly records: RecordQueryService;
  readonly fieldSecurity: AtlasFieldSecurityProjector;
  /** Explicitly cite the captured authorized projection when a published read-only entity has no row version. */
  readonly allowProjectedContentRevision?: boolean;
  readonly maxRows: number;
  readonly maxResponseBytes: number;
}
export function createAtlasRecordDataGateway(options: AtlasRecordDataGatewayOptions): AtlasRecordDataGateway {
  if (!Number.isInteger(options.maxRows) || options.maxRows < 1 || !Number.isInteger(options.maxResponseBytes) || options.maxResponseBytes < 1) throw new TypeError("Atlas record gateway limits must be positive integers.");
  return {
    async query({ context, request }): Promise<AtlasRecordResult> {
      assertAtlasContext(context);
      if (!request.entityCode.trim() || request.fields.length < 1 || new Set(request.fields).size !== request.fields.length) throw new AtlasServiceError("INVALID_ARGUMENT", "Atlas record queries require one entity and a unique field projection.");
      if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > options.maxRows) throw new AtlasServiceError("INVALID_ARGUMENT", `Atlas record queries are limited to ${options.maxRows} rows.`);
      const descriptor = await options.metadata.getEntityDescriptor(context, request.entityCode);
      if (!descriptor || descriptor.planeKey !== context.planeKey || descriptor.entityCode !== request.entityCode) throw new AtlasServiceError("PERMISSION_DENIED", "The requested Atlas entity descriptor is unavailable.");
      const descriptorFields = new Set(descriptor.fields.map((field) => field.key));
      if (request.fields.some((field) => !descriptorFields.has(field))) throw new AtlasServiceError("PERMISSION_DENIED", "The Atlas field projection exceeds the published descriptor.");
      const result = await options.records.list({ context, entityCode: request.entityCode, limit: request.limit, filters: request.filters, sort: request.sort, countMode: "none", hydrateReferences: false, ...(request.scopeCoordinate?{scopeCoordinate:request.scopeCoordinate}:{}) });
      const projected = await options.fieldSecurity.project({ context, entityCode: request.entityCode, descriptorHash: descriptor.compiledHash, requestedFields: request.fields, rows: result.data });
      const rows = projected.map((row) => Object.freeze(Object.fromEntries(request.fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]))));
      const responseBytes = Buffer.byteLength(JSON.stringify(rows), "utf8");
      if (responseBytes > options.maxResponseBytes) throw new AtlasServiceError("RESULT_TOO_LARGE", "The authorized Atlas record projection exceeds the response byte limit.");
      const idField = descriptor.storage.idField; const versionField = descriptor.storage.versionField;
      const sources = result.data.map((row, index) => {
        const recordId = row[idField]; const revision = versionField ? row[versionField] : options.allowProjectedContentRevision ? `content-sha256:${createHash("sha256").update(JSON.stringify(rows[index])).digest("hex")}` : undefined;
        if ((typeof recordId !== "string" && typeof recordId !== "number") || (typeof revision !== "string" && typeof revision !== "number")) throw new AtlasServiceError("PROVIDER_PROTOCOL_ERROR", "The Records query did not return stable source coordinates.");
        return Object.freeze({ entityCode: descriptor.entityCode, recordId: String(recordId), revision: String(revision), descriptorHash: descriptor.compiledHash });
      });
      return Object.freeze({ rows: Object.freeze(rows), sources: Object.freeze(sources), responseBytes, authorizationProfileHash: context.profileHash });
    },
  };
}
