/**
 * Records Routes â€” CRUD for master entity records
 *
 * GET    /api/records/:entity           â€” paginated list
 * GET    /api/records/:entity/:id       â€” single record
 * POST   /api/records/:entity           â€” create
 * PUT    /api/records/:entity/:id       â€” full update (requires { data: {...} } wrapper)
 * PATCH  /api/records/:entity/:id       â€” partial update (flat body or { data: {...} } wrapper)
 * DELETE /api/records/:entity/:id       â€” delete
 *
 * Routes resolve the entity's backing table from control.entity,
 * then execute queries against {schema}.{table_name}.
 *
 * Create/update inject required audit columns (tenant_id, created_by/updated_by)
 * from the request auth token and X-Org / X-Realm headers.
 * Field names in the request body are remapped to their physical column_names
 * via control.entity_field, so the form can use logical field names.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { DocumentEditSubmitRequestV1Schema } from "@athyper/api-contracts/document-edit-submit";
import {
  verifyBearer,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdOrNull,
  resolvePrincipalIdWithJit,
  resolveFieldMap,
  resolveArrayColumns,
  resolveJsonColumns,
  coerceArrayFields,
  serializeJsonFields,
  buildDurableMutationEventKey,
  executeDurableMutationTransaction,
  emitOutboxEvent,
  mapPostgresBusinessError,
  writeRequiredRouteAudit,
  resolveDocumentFxRate,
} from "@athyper/svc-shared";
import { applyFieldSecurityMask } from "@athyper/svc-policy";
import {
  checkPermission,
  createCompanyCodeScopeService,
  requireAllow,
  requireVerifiedContext,
} from "@athyper/svc-iam";
import {
  acquireLock,
  verifyLock,
  renewLock,
  releaseLock,
  forceReleaseLock,
  getLockStatus,
  resolveConcurrencyPolicy,
  resolveActiveFiscalContext,
} from "@athyper/svc-shared";
import type { CacheClient } from "@athyper/svc-iam";
import type { ExecutionDescriptorProvider } from "@athyper/svc-metadata";
import { observeFrameworkInfrastructure } from "@athyper/adapter-telemetry";
import {
  resolveParameterSnapshot,
  getIntParam,
  getStringParam,
} from "@athyper/svc-iam";
import {
  resolveLineClassification,
  resolveFiscalPeriod,
  allocateDocumentNumber,
  purchaseInvoiceSubmitPreflight,
  purchaseOrderSubmitPreflight,
  canMutateP2pChild,
  applyPurchaseInvoiceLineDefaults,
  handleCreateApInvoice,
  copyCommitmentLine,
  supersedeSchedulesForLine,
} from "@athyper/svc-business";
import {
  authorizeEntityMutation,
  checkEntityMutationAuthorization,
  resolveEntityWriteFieldRules,
  type EntityMutationTableInfo,
  type EntityWriteFieldRule,
} from "./entity-mutation-guard.js";
import { buildDocumentWorkspaceDraftMasks } from "../document-workspace-draft-context.js";
import { resolveRecordStatusSource } from "./record-status-policy.js";
import {
  getWriteFacade,
} from "./write-facade.registry.js";
import {
  getEntityOp,
  buildEntityOpRequestIdentity,
  resolveEntityOpSourceIds,
} from "./entity-op.registry.js";
import {
  computeDistributionDocumentAmount,
  readDistributionBasis,
} from "../distribution-amounts.js";
import type { RedisClient } from "@athyper/adapter-memory-cache";
import {
  buildEntityListCountCacheKey,
  buildEntityListPageCacheKey,
  invalidateEntityListCache,
  resolveEntityListVersion,
  stableEntityListCacheHash,
} from "../cache/list-cache.js";
import {
  enrichSingleReferenceLabels,
  enrichWithReferenceLabels,
  fetchTargetLabels,
  resolveTargetTable,
  type ReferenceFieldSpec,
} from "../enrich-reference-labels.js";
import {
  applyServerSourceChangeActions,
  buildSourceChangeErrorPayload,
  computeBffDependencyWarnings,
} from "../source-change-validation.js";
import { getEntityLineDefaulter } from "./entity-line-defaults-registry.js";
import { getEntityLineRefresher } from "./entity-line-refresh-registry.js";
import { getEntityLineChildEffect } from "./entity-line-child-effects-registry.js";
import { getEntityLineDeleter }   from "./entity-line-delete-registry.js";
import { mergeFieldProvenance, resolveEntityIdentity } from "../entity-identity-policy.js";
import {
  createEntityMutationService,
  DOCUMENT_WORKSPACE_AGGREGATE_HANDLER,
} from "../mutation/entity-mutation.service.js";
import type {
  AggregateChangeSet,
  AggregateMutationCommand,
  MutationResult,
} from "../mutation/entity-mutation.types.js";
import { mapMutationResultToHttp } from "../mutation/entity-mutation-http.js";
import { KyselyEntityDescriptorRepository } from "../repositories/entity-descriptor.repository.js";
import { registerEntityMutationRoutes } from "./entity-mutation.route.js";
import {
  hasFieldViolations,
  validateEntityWriteFields,
  type MutationFieldViolationReason,
} from "../mutation/field-validation.js";
import { EntityQueryService } from "../query/entity-query.service.js";
import { KyselyEntityQueryExecutor } from "../query/entity-query.kysely.js";
import { DescriptorReferenceLabelResolver } from "../query/descriptor-reference-resolver.js";
import {
  resolveMutationKernelRollout,
  type MutationKernelRolloutStage,
} from "../mutation/mutation-kernel-rollout.js";
import type { EntityCountMode, EntityQueryFilter, EntityQuerySort } from "../query/entity-query.types.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 500;
const DEFAULT_LOCK_TTL_SECONDS = 300;
const DOCUMENT_RUNTIME_IDEMPOTENCY_LEASE_MS = 30_000;
const DOCUMENT_RUNTIME_IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;
const DOCUMENT_RUNTIME_EVENT_RETENTION_MS = 7 * 24 * 60 * 60_000;
const DOCUMENT_WORKSPACE_TOKEN_VERSION = "dew1";
const DOCUMENT_WORKSPACE_LEGACY_KEY_ID = "legacy";
const DOCUMENT_WORKSPACE_KEY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_PROCUREMENT_LINE_UOM_PARAMETER_CODE = "finance.ap.default_procurement_line_uom";
const DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK = "EA";
const TEXT_SEARCH_DATA_TYPES = new Set([
  "email",
  "enum",
  "lifecycle_state",
  "phone",
  "string",
  "text",
  "url",
]);
type EntitySearchOperator = "contains";

interface EntitySearchConfig {
  enabled: boolean;
  fields: string[];
  rank: Record<string, number>;
  minQueryLength: number;
  operator: EntitySearchOperator;
  hasConfiguredFields: boolean;
}

const LINE_CLASSIFICATION_INPUT_FIELDS = [
  "commodity_category_id",
  "business_intent_id",
  "item_id",
  "item_description",
  "description",
  "metadata",
  "data",
  "unspsc_code",
  "hs_code",
  "trade_code",
  "commodity_code",
  "commodity_domain",
  "commodity_domain_code",
  "line_commodity_code",
  "quantity",
  "unit_price",
  "price_unit",
  "gross_amount",
  "line_amount",
  "discount_pct",
  "tax_group_id",
  "withholding_tax_group_id",
  "asset_class_id",
];

type DocumentRuntimeIdempotencyClaim =
  | { kind: "acquired"; id: string }
  | { kind: "replay"; response: Record<string, unknown>; responseStatus: number }
  | { kind: "in_progress" }
  | { kind: "mismatch" };

function validateDocumentWorkspaceCapability(input: {
  token: string | undefined;
  tenantId: string;
  principalId: string | null | undefined;
  entityCode: string;
  recordId: string;
  profile?: "edit" | "approve" | "create";
}): boolean {
  return inspectDocumentWorkspaceCapability(input).valid;
}

function inspectDocumentWorkspaceCapability(input: {
  token: string | undefined;
  tenantId: string;
  principalId: string | null | undefined;
  entityCode: string;
  recordId: string;
  profile?: "edit" | "approve" | "create";
}): { valid: true; planHash: string; permissionStamp: string } | { valid: false; reason: "invalid" | "stale" | "profile" } {
  if (documentWorkspaceTokenBypassEnabled()) return { valid: true, planHash: "", permissionStamp: "" };
  if (!input.token || !input.principalId) return { valid: false, reason: "invalid" };
  const verified = verifyDocumentWorkspaceTokenSignature(input.token);
  if (!verified) return { valid: false, reason: "invalid" };
  try {
    const scope = JSON.parse(Buffer.from(verified.encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof scope["expiresAt"] !== "number" || scope["expiresAt"] <= Date.now()) return { valid: false, reason: "stale" };
    if (scope["profile"] !== (input.profile ?? "edit")) return { valid: false, reason: "profile" };
    if (scope["tenantId"] !== input.tenantId || scope["principalId"] !== input.principalId
      || scope["entityCode"] !== input.entityCode || scope["recordId"] !== input.recordId
      || typeof scope["permissionStamp"] !== "string" || typeof scope["planHash"] !== "string") {
      return { valid: false, reason: "invalid" };
    }
    return { valid: true, permissionStamp: scope["permissionStamp"], planHash: scope["planHash"] };
  } catch {
    return { valid: false, reason: "invalid" };
  }
}

/** Local development can exercise compatibility paths; production never can. */
function documentWorkspaceTokenBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.DOCUMENT_EDIT_REQUIRE_WORKSPACE_TOKEN === "0";
}

function verifyDocumentWorkspaceTokenSignature(token: string): { encoded: string; keyId: string } | null {
  const parts = token.split(".");
  if (parts[0] !== DOCUMENT_WORKSPACE_TOKEN_VERSION) return null;
  const keys = documentWorkspaceVerificationKeys();

  if (parts.length === 4) {
    const [, keyId, encoded, supplied] = parts;
    if (!keyId || !DOCUMENT_WORKSPACE_KEY_ID_RE.test(keyId) || !encoded || !supplied) return null;
    const secret = keys.get(keyId);
    if (!secret || !documentWorkspaceSignatureMatches(`${keyId}.${encoded}`, supplied, secret)) return null;
    return { encoded, keyId };
  }

  if (parts.length === 3) {
    const [, encoded, supplied] = parts;
    if (!encoded || !supplied) return null;
    for (const [keyId, secret] of keys) {
      if (documentWorkspaceSignatureMatches(encoded, supplied, secret)) return { encoded, keyId };
    }
  }
  return null;
}

function documentWorkspaceVerificationKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const configured = process.env.DOCUMENT_EDIT_WORKSPACE_TOKEN_KEYS?.trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (DOCUMENT_WORKSPACE_KEY_ID_RE.test(keyId) && typeof value === "string" && value.length >= 32) keys.set(keyId, value);
        }
      }
    } catch {
      // Fail closed unless a separately configured legacy secret is valid.
    }
  }
  const legacySecret = process.env.DOCUMENT_EDIT_WORKSPACE_TOKEN_SECRET;
  if (legacySecret && legacySecret.length >= 32 && !keys.has(DOCUMENT_WORKSPACE_LEGACY_KEY_ID)) {
    keys.set(DOCUMENT_WORKSPACE_LEGACY_KEY_ID, legacySecret);
  }
  return keys;
}

function documentWorkspaceSignatureMatches(value: string, supplied: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(value).digest("base64url");
  return expected.length === supplied.length
    && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function documentSaveAndTransitionDisabled(tenantId: string, entityCode: string): boolean {
  const entries = new Set(
    (process.env.DOCUMENT_EDIT_SAVE_AND_TRANSITION_DISABLED ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return entries.has(`${tenantId}:${entityCode}`)
    || entries.has(`*:${entityCode}`)
    || entries.has(`${tenantId}:*`)
    || entries.has("*:*");
}

function buildDocumentRuntimeIdempotency(input: {
  request: Request;
  entityCode: string;
  recordId: string;
  expectedVersion: number;
  body: unknown;
  operationKey?: string;
}): { key: string; requestHash: string } {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      entityCode: input.entityCode,
      recordId: input.recordId,
      expectedVersion: input.expectedVersion,
      operationKey: input.operationKey ?? "document.workspace_submit",
      body: input.body,
    }))
    .digest("hex");
  const supplied = input.request.header("Idempotency-Key")?.trim();
  return {
    // Some entity operations derive their stable key when the transport does
    // not require a caller-supplied idempotency key.
    key: supplied && supplied.length <= 256
      ? supplied
      : `${input.operationKey ?? "workspace-submit"}:${requestHash}`,
    requestHash,
  };
}

function buildEntityCreateIdempotency(input: {
  request: Request;
  entityCode: string;
  body: unknown;
}): { key: string; requestHash: string; documentId: string } | null {
  const supplied = input.request.header("Idempotency-Key")?.trim();
  if (!supplied || supplied.length > 256) return null;
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ entityCode: input.entityCode, operationKey: "entity.create", body: input.body }))
    .digest("hex");
  const raw = requestHash.slice(0, 32);
  return {
    key: supplied,
    requestHash,
    // The shared ledger requires a UUID document identity before the actual
    // record exists. A deterministic request UUID keeps claims replayable.
    documentId: `${raw.slice(0, 8)}-${raw.slice(8, 12)}-5${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20)}`,
  };
}

async function claimDocumentRuntimeIdempotency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Kysely<any>,
  input: {
    tenantId: string;
    principalId: string;
    entityCode: string;
    documentId: string;
    idempotencyKey: string;
    requestHash: string;
    operationKey?: string;
  },
): Promise<DocumentRuntimeIdempotencyClaim> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + DOCUMENT_RUNTIME_IDEMPOTENCY_LEASE_MS);
  const expiresAt = new Date(now.getTime() + DOCUMENT_RUNTIME_IDEMPOTENCY_TTL_MS);
  const inserted = await sql<{ id: string }>`
    insert into event.document_runtime_idempotency (
      tenant_id, principal_id, operation_key, idempotency_key, request_hash,
      entity_code, document_id, status, lease_expires_at, expires_at,
      created_by, updated_by
    ) values (
      ${input.tenantId}, ${input.principalId}, ${input.operationKey ?? "document.edit_session"}, ${input.idempotencyKey}, ${input.requestHash},
      ${input.entityCode}, ${input.documentId}, 'in_progress', ${leaseExpiresAt}, ${expiresAt},
      ${input.principalId}, ${input.principalId}
    ) on conflict (tenant_id, principal_id, operation_key, idempotency_key) do nothing
    returning id
  `.execute(trx);
  const insertedId = inserted.rows[0]?.id;
  if (insertedId) return { kind: "acquired", id: insertedId };

  const existing = await sql<{
    id: string;
    request_hash: string;
    status: string;
    lease_expires_at: Date;
    response_status: number | null;
    response_payload: Record<string, unknown> | null;
  }>`
    select id, request_hash, status, lease_expires_at, response_status, response_payload
    from event.document_runtime_idempotency
    where tenant_id = ${input.tenantId}
      and principal_id = ${input.principalId}
      and operation_key = ${input.operationKey ?? "document.edit_session"}
      and idempotency_key = ${input.idempotencyKey}
    for update
  `.execute(trx);
  const row = existing.rows[0];
  if (!row) throw new Error("DOCUMENT_RUNTIME_IDEMPOTENCY_CLAIM_MISSING");
  if (row.request_hash !== input.requestHash) return { kind: "mismatch" };
  if (row.status === "succeeded" && row.response_payload) {
    return { kind: "replay", response: row.response_payload, responseStatus: row.response_status ?? 200 };
  }
  if (row.status === "in_progress" && new Date(row.lease_expires_at).getTime() > now.getTime()) {
    return { kind: "in_progress" };
  }

  await sql`
    update event.document_runtime_idempotency
       set status = 'in_progress', lease_expires_at = ${leaseExpiresAt},
           response_status = null, response_payload = null, error_code = null,
           completed_at = null, expires_at = ${expiresAt},
           updated_at = ${now}, updated_by = ${input.principalId}
     where id = ${row.id}
  `.execute(trx);
  return { kind: "acquired", id: row.id };
}

async function completeDocumentRuntimeIdempotency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Kysely<any>,
  input: { id: string; actorId: string; response: Record<string, unknown>; responseStatus?: number },
): Promise<void> {
  await sql`
    update event.document_runtime_idempotency
       set status = 'succeeded', response_status = ${input.responseStatus ?? 200},
           response_payload = ${JSON.stringify(input.response)}::jsonb,
           completed_at = now(), updated_at = now(), updated_by = ${input.actorId}
     where id = ${input.id}
  `.execute(trx);
}

async function releaseDocumentRuntimeIdempotency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Kysely<any>,
  id: string,
): Promise<void> {
  await sql`delete from event.document_runtime_idempotency where id = ${id}`.execute(trx);
}

async function advanceDocumentRuntimeState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Kysely<any>,
  input: {
    tenantId: string;
    entityCode: string;
    documentId: string;
    actorId: string;
    affectedNodeKeys: string[];
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<{ documentVersion: number }> {
  const versionResult = await sql<{ document_version: number }>`
    insert into event.document_runtime_document_version (
      tenant_id, entity_code, document_id, document_version, updated_by
    ) values (${input.tenantId}, ${input.entityCode}, ${input.documentId}, 1, ${input.actorId})
    on conflict (tenant_id, entity_code, document_id) do update
      set document_version = event.document_runtime_document_version.document_version + 1,
          updated_at = now(), updated_by = excluded.updated_by
    returning document_version
  `.execute(trx);
  const documentVersion = Number(versionResult.rows[0]?.document_version);
  if (!Number.isFinite(documentVersion) || documentVersion < 1) {
    throw new Error("DOCUMENT_RUNTIME_VERSION_ADVANCE_FAILED");
  }

  const nodeKeys = [...new Set(input.affectedNodeKeys)].sort();
  for (const nodeKey of nodeKeys) {
    await sql`
      insert into event.document_runtime_node_version (
        tenant_id, entity_code, document_id, node_key, node_version, updated_by
      ) values (${input.tenantId}, ${input.entityCode}, ${input.documentId}, ${nodeKey}, 1, ${input.actorId})
      on conflict (tenant_id, entity_code, document_id, node_key) do update
        set node_version = event.document_runtime_node_version.node_version + 1,
            updated_at = now(), updated_by = excluded.updated_by
    `.execute(trx);
  }

  await sql`
    insert into event.document_runtime_event (
      tenant_id, entity_code, document_id, document_version, event_type,
      affected_node_keys, payload, occurred_at, retained_until, actor_id
    ) values (
      ${input.tenantId}, ${input.entityCode}, ${input.documentId}, ${documentVersion}, ${input.eventType},
      ${nodeKeys}, ${JSON.stringify(input.payload)}::jsonb, now(),
      ${new Date(Date.now() + DOCUMENT_RUNTIME_EVENT_RETENTION_MS)}, ${input.actorId}
    )
  `.execute(trx);
  return { documentVersion };
}

async function resolveCompiledRuntimeInvalidationNodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Kysely<any>,
  input: {
    entityVersionId: string;
    changedFields: string[];
    itemsMutated: boolean;
    operationKey?: string;
  },
): Promise<string[]> {
  const snapshot = await (trx.selectFrom("snapshot.entity_compiled" as never) as any)
    .select("compiled_json")
    .where("entity_version_id", "=", input.entityVersionId)
    .executeTakeFirst() as { compiled_json?: unknown } | undefined;
  const compiled = snapshot?.compiled_json;
  const plan = compiled && typeof compiled === "object" && !Array.isArray(compiled)
    ? (compiled as Record<string, unknown>)["document_runtime_plan"]
    : null;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return [];
  const runtimePlan = plan as Record<string, unknown>;
  if (runtimePlan["source"] !== "compiled_v6" || runtimePlan["schemaVersion"] !== "document-edit-runtime/v6.0") {
    return [];
  }
  const actions = Array.isArray(runtimePlan["invalidationActions"])
    ? runtimePlan["invalidationActions"] as Array<Record<string, unknown>>
    : [];
  const sourceKeys = new Set<string>([
    ...input.changedFields.map((field) => `field:${field}`),
    ...(input.itemsMutated ? ["node_mutation:items"] : []),
    `operation:${input.operationKey ?? "edit_session"}`,
  ]);
  const nodes = new Set<string>();
  for (const action of actions) {
    const source = action["source"];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const sourceRecord = source as Record<string, unknown>;
    const type = sourceRecord["type"];
    const key = sourceRecord["key"];
    if (typeof type !== "string" || typeof key !== "string"
      || (!sourceKeys.has(`${type}:${key}`) && !(type === "operation" && key === "*"))) continue;
    const targets = Array.isArray(action["targets"]) ? action["targets"] : [];
    for (const target of targets) {
      if (!target || typeof target !== "object" || Array.isArray(target)) continue;
      const node = (target as Record<string, unknown>)["node"];
      if (typeof node === "string" && node.trim()) nodes.add(node);
    }
  }
  return [...nodes].sort();
}

async function readDurableDocumentRuntimeEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  input: { tenantId: string; entityCode: string; documentId: string; afterCursor: number },
): Promise<Array<{ cursor: number; event_type: string; document_version: number; affected_node_keys: string[]; payload: Record<string, unknown>; occurred_at: Date }>> {
  const rows = await sql<{
    cursor: number;
    event_type: string;
    document_version: number;
    affected_node_keys: string[];
    payload: Record<string, unknown>;
    occurred_at: Date;
  }>`
    select cursor, event_type, document_version, affected_node_keys, payload, occurred_at
      from event.document_runtime_event
     where tenant_id = ${input.tenantId}
       and entity_code = ${input.entityCode}
       and document_id = ${input.documentId}
       and cursor > ${input.afterCursor}
     order by cursor asc
     limit 200
  `.execute(db);
  return rows.rows;
}

class EntityOperationAbort extends Error {
  constructor(readonly outcome: { status: number; body: Record<string, unknown> }) {
    super("ENTITY_OPERATION_ABORT");
  }
}

function targetDocumentIdFromOperationBody(entityCode: string, body: Record<string, unknown>): string | null {
  const fieldByEntity: Record<string, string> = {
    commitment: "commitmentId",
    receipt: "receiptId",
    service_sheet: "serviceSheetId",
    purchase_invoice: "invoiceId",
    payment_entry: "paymentId",
  };
  const value = body[fieldByEntity[entityCode] ?? ""];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function normalizeEntityOperationSourceIds(input: {
  db: Kysely<any>;
  tenantId: string;
  entityCode: string;
  sourcePaths: readonly string[];
  body: Record<string, unknown>;
}): Promise<{ sourceIds: string[]; body: Record<string, unknown> } | null> {
  const table = await resolveEntityTable(input.db, input.entityCode);
  if (!table) return null;
  const fieldMap = await resolveFieldMap(input.db, input.entityCode);
  const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
  const normalized = structuredClone(input.body);
  const ids = new Set<string>();
  for (const path of input.sourcePaths) {
    const values = readOperationPathValues(normalized, path.split("."));
    for (const value of values) {
      if (typeof value !== "string" || !value.trim()) return null;
      const row = await resolveRecordRow(input.db, fullTable, value.trim(), table.natural_key_fields, fieldMap, input.tenantId);
      const physicalId = typeof row?.["id"] === "string" ? row.id : null;
      if (!physicalId || row?.["tenant_id"] !== input.tenantId) return null;
      replaceOperationPathValue(normalized, path.split("."), value, physicalId);
      ids.add(physicalId);
    }
  }
  return { sourceIds: [...ids].sort(), body: normalized };
}

function readOperationPathValues(value: unknown, parts: string[]): unknown[] {
  if (parts.length === 0) return [value];
  const [part, ...rest] = parts;
  if (!part || !value || typeof value !== "object" || Array.isArray(value)) return [];
  const many = part.endsWith("[]");
  const child = (value as Record<string, unknown>)[many ? part.slice(0, -2) : part];
  return many && Array.isArray(child)
    ? child.flatMap((item) => readOperationPathValues(item, rest))
    : readOperationPathValues(child, rest);
}

function replaceOperationPathValue(value: unknown, parts: string[], from: string, to: string): void {
  if (parts.length === 0 || !value || typeof value !== "object" || Array.isArray(value)) return;
  const [part, ...rest] = parts;
  if (!part) return;
  const many = part.endsWith("[]");
  const key = many ? part.slice(0, -2) : part;
  const record = value as Record<string, unknown>;
  const child = record[key];
  if (rest.length === 0) {
    if (child === from) record[key] = to;
    return;
  }
  if (many && Array.isArray(child)) child.forEach((item) => replaceOperationPathValue(item, rest, from, to));
  else replaceOperationPathValue(child, rest, from, to);
}

async function resolveDocumentRuntimePlanHashes(db: Kysely<any>, entityVersionId: string): Promise<string[]> {
  const snapshot = await (db.selectFrom("snapshot.entity_compiled" as never) as any)
    .select("compiled_json")
    .where("entity_version_id", "=", entityVersionId)
    .executeTakeFirst() as { compiled_json?: unknown } | undefined;
  const compiled = snapshot?.compiled_json;
  const plan = compiled && typeof compiled === "object" && !Array.isArray(compiled)
    ? (compiled as Record<string, unknown>)["document_runtime_plan"] : null;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return [];
  const record = plan as Record<string, unknown>;
  return [record["planHash"], record["schemaVersion"]].filter((value): value is string => typeof value === "string" && value.length > 0);
}

interface DocumentRuntimeChildCollectionBinding {
  key: string;
  entityCode: string;
  mutationPolicy: { create?: boolean; update?: boolean; delete?: boolean };
}

/** Read the compiler-owned workspace collection plan at the authoritative boundary. */
async function resolveDocumentRuntimeChildCollections(
  db: Kysely<any>,
  entityVersionId: string,
): Promise<DocumentRuntimeChildCollectionBinding[]> {
  const snapshot = await (db.selectFrom("snapshot.entity_compiled" as never) as any)
    .select("compiled_json")
    .where("entity_version_id", "=", entityVersionId)
    .executeTakeFirst() as { compiled_json?: unknown } | undefined;
  const compiled = snapshot?.compiled_json;
  const plan = compiled && typeof compiled === "object" && !Array.isArray(compiled)
    ? (compiled as Record<string, unknown>)["document_runtime_plan"] : null;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return [];
  const children = (plan as Record<string, unknown>)["childCollections"];
  if (!Array.isArray(children)) return [];
  return children.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const child = value as Record<string, unknown>;
    if (typeof child["key"] !== "string" || typeof child["entityCode"] !== "string") return [];
    const policy = child["mutationPolicy"];
    return [{
      key: child["key"],
      entityCode: child["entityCode"],
      mutationPolicy: policy && typeof policy === "object" && !Array.isArray(policy)
        ? policy as DocumentRuntimeChildCollectionBinding["mutationPolicy"] : {},
    }];
  });
}

export interface RecordsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    info?(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  cache?: CacheClient;
  /**
   * Phase 11 #2: optional ioredis client for record-level pub/sub. When
   * present, status changes during edit publish to `record:<tenant>:<entity>:<id>`
   * channels and the SSE endpoint subscribes. When absent the SSE endpoint
   * still serves keepalive comments; clients can fall back to polling.
   */
  redis?: RedisClient;
  /** P3 descriptor provider used by the P5 read kernel. */
  executionDescriptorProvider?: ExecutionDescriptorProvider;
  /** Explicit allow-list. An empty set keeps the extracted query path disabled. */
  entityQueryPilotCodes?: ReadonlySet<string>;
  /** HMAC key for opaque keyset cursors. Required when a pilot is enabled. */
  entityQueryCursorSecret?: string;
}

// â”€â”€ Entity table resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EntityTableInfo {
  entity_id:           string;
  version_id:          string;
  name:                string;
  table_schema:        string;
  table_name:          string;
  natural_key_fields:  string[];
  entity_class:        string;
  ownership_model:     string;
  backing_type:        string;
  mutability:          string;
  create_mode:         string;
  draft_ttl_hours:     number | null;
  numbering_strategy:  string;
  identity_config:     Record<string, unknown>;
  feature_flags:       Record<string, unknown>;
  concurrency_policy:  Record<string, unknown>;
}

interface EntityLineBinding {
  linesTable:     `${string}.${string}`;
  fkCol:          string;
  lineEntityCode: string;
}

function rejectGenericDocumentMutation(res: Response, table: EntityTableInfo): boolean {
  if (table.entity_class !== "DOCUMENT") return false;
  res.status(409).json({
    error: "DOCUMENT_WORKSPACE_REQUIRED",
    message: "Documents must be mutated through the aggregate workspace or lifecycle command boundary.",
  });
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityTable(db: Kysely<any>, entityCode: string): Promise<EntityTableInfo | null> {
  // Normalise URL slug â†’ DB name (journal-entry â†’ journal_entry)
  const name = entityCode.replace(/-/g, "_");
  const row = await db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select([
      "e.id",
      "e.name",
      "e.table_schema",
      "e.table_name",
      "e.entity_class",
      "e.ownership_model",
      "e.backing_type",
      "e.mutability",
      "e.create_mode",
      "e.draft_ttl_hours",
      "e.numbering_strategy",
      "e.identity_config",
      "e.feature_flags",
      "e.concurrency_policy",
      sql<string>`ev.id`.as("version_id"),
    ] as never[])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .where("ev.status", "=", "EFFECTIVE")
    .executeTakeFirst() as Record<string, unknown> | undefined;
  if (!row) return null;

  const identityConfig = asPlainObject(row["identity_config"]);
  const featureFlags = (row["feature_flags"] && typeof row["feature_flags"] === "object")
    ? (row["feature_flags"] as Record<string, unknown>)
    : {};
  if (featureFlags["generic_runtime_disabled"] === true || featureFlags["records_api_disabled"] === true) {
    return null;
  }

  const businessKeyFields = stringArray(identityConfig["business_key_fields"]);
  const identityNaturalKeyFields = stringArray(identityConfig["natural_key_fields"])
    .filter((fieldName) => fieldName !== "tenant_id" && fieldName !== "id");

  return {
    entity_id:           String(row["id"]),
    version_id:          String(row["version_id"]),
    name:                String(row["name"]),
    table_schema:        String(row["table_schema"]),
    table_name:          String(row["table_name"]),
    natural_key_fields:  businessKeyFields.length > 0
      ? businessKeyFields
      : identityNaturalKeyFields,
    entity_class:        String(row["entity_class"] ?? ""),
    ownership_model:     String(row["ownership_model"] ?? "system"),
    backing_type:        String(row["backing_type"] ?? "table"),
    mutability:          String(row["mutability"] ?? "controlled"),
    create_mode:         String(row["create_mode"] ?? "FORM_ONLY"),
    draft_ttl_hours:     row["draft_ttl_hours"] == null ? null : Number(row["draft_ttl_hours"]),
    numbering_strategy:  String(row["numbering_strategy"] ?? "none"),
    identity_config:     identityConfig,
    feature_flags:       featureFlags,
    concurrency_policy:  (row["concurrency_policy"] && typeof row["concurrency_policy"] === "object") ? (row["concurrency_policy"] as Record<string, unknown>) : {},
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityLineBinding(db: Kysely<any>, table: EntityTableInfo): Promise<EntityLineBinding> {
  const loadRelation = async (owner: EntityTableInfo): Promise<Record<string, unknown> | undefined> =>
    await db
      .selectFrom("control.entity_relation as er")
      .innerJoin("control.entity as child", (join) =>
        join.onRef("child.name", "=", "er.target_entity")
          .on("child.tenant_id", "is", null),
      )
      .select([
        "er.target_entity",
        "er.fk_field",
        "child.table_schema",
        "child.table_name",
      ] as never[])
      .where("er.entity_version_id", "=", owner.version_id)
      .where("er.name", "=", "lines")
      .where("er.relation_kind", "=", "has_many")
      .where("er.resolution_kind", "=", "fk")
      .executeTakeFirst() as Record<string, unknown> | undefined;

  let relation = await loadRelation(table);

  const backingSource = typeof table.feature_flags["backing_source"] === "string"
    ? table.feature_flags["backing_source"].trim()
    : "";
  if (!relation && backingSource) {
    const backingTable = await resolveEntityTable(db, backingSource);
    if (backingTable) relation = await loadRelation(backingTable);
  }

  if (relation && relation["fk_field"]) {
    return {
      linesTable: `${String(relation["table_schema"])}.${String(relation["table_name"])}` as `${string}.${string}`,
      fkCol: String(relation["fk_field"]),
      lineEntityCode: String(relation["target_entity"]),
    };
  }

  return {
    linesTable: `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`,
    fkCol: `${table.table_name}_id`,
    lineEntityCode: `${table.name}_line`,
  };
}

function toMutationTableInfo(table: EntityTableInfo): EntityMutationTableInfo {
  return {
    entity_id: table.entity_id,
    version_id: table.version_id,
    name: table.name,
    table_schema: table.table_schema,
    table_name: table.table_name,
    backing_type: table.backing_type,
    entity_class: table.entity_class,
    mutability: table.mutability,
    feature_flags: table.feature_flags,
  };
}

type EntityOperationCompanyScopeResult =
  | { allowed: true }
  | { allowed: false; error: string; message: string };

/**
 * Conversion sources are records, not just opaque ids. Enforce the verified
 * active-company/LE context and the principal's company-code scope before a
 * P2P operation can create its target document.
 */
async function checkEntityOperationCompanyScope(input: {
  db: Kysely<any>;
  table: EntityTableInfo;
  tenantId: string;
  principalId: string;
  recordId: string;
  activeCompanyCodeId?: string;
  activeLegalEntityId?: string;
}): Promise<EntityOperationCompanyScopeResult> {
  const qualifiedTable = `${input.table.table_schema}.${input.table.table_name}`;
  const source = await (input.db.selectFrom(qualifiedTable as never) as any)
    .select("company_code_id")
    .where("tenant_id", "=", input.tenantId)
    .where("id", "=", input.recordId)
    .executeTakeFirst() as { company_code_id?: string | null } | undefined;
  const companyCodeId = source?.company_code_id;
  if (!companyCodeId) return { allowed: true };

  if (input.activeCompanyCodeId && companyCodeId !== input.activeCompanyCodeId) {
    return {
      allowed: false,
      error: "COMPANY_SCOPE_DENIED",
      message: "The source document is outside the active company context.",
    };
  }
  if (input.activeLegalEntityId) {
    const company = await input.db
      .selectFrom("master.company_code as cc")
      .select("cc.id")
      .where("cc.id", "=", companyCodeId)
      .where("cc.tenant_id", "=", input.tenantId)
      .where("cc.legal_entity_id", "=", input.activeLegalEntityId)
      .executeTakeFirst();
    if (!company) {
      return {
        allowed: false,
        error: "COMPANY_SCOPE_DENIED",
        message: "The source document is outside the active legal-entity context.",
      };
    }
  }
  const hasScope = await createCompanyCodeScopeService(input.db)
    .hasAccess(input.principalId, companyCodeId, input.tenantId);
  return hasScope
    ? { allowed: true }
    : {
        allowed: false,
        error: "COMPANY_SCOPE_DENIED",
        message: "The principal is not authorized for the source document company.",
      };
}

function resolveLineOnlyTouchTarget(
  entityCode: string,
  table: EntityTableInfo,
): { table: `${string}.${string}`; extraWhere?: { column: string; value: unknown } } {
  if (
    (entityCode === "purchase_order" || entityCode === "commitment")
    && table.table_schema === "document"
    && table.table_name === "purchase_order"
  ) {
    return {
      table: "document.commitment",
      extraWhere: { column: "commitment_type", value: "purchase_order" },
    };
  }

  return {
    table: `${table.table_schema}.${table.table_name}` as `${string}.${string}`,
  };
}

async function hydrateCommitmentLinePricingProjection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  linesTable: string,
  rows: Record<string, unknown>[],
  tenantId: string | null,
): Promise<Record<string, unknown>[]> {
  if (linesTable !== "document.commitment_line" || tenantId === null || rows.length === 0) {
    return rows;
  }

  const lineIds = rows
    .map((row) => row["id"])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (lineIds.length === 0) return rows;

  const result = await sql<{
    commitment_line_id: string;
    pricing_base_amount: string;
    pricing_discount_amount: string;
    pricing_charge_amount: string;
    pricing_net_amount: string;
    pricing_tax_amount: string;
    pricing_withholding_amount: string;
    pricing_total_amount: string;
  }>`
    SELECT
      commitment_line_id,
      pricing_base_amount,
      pricing_discount_amount,
      pricing_charge_amount,
      pricing_net_amount,
      pricing_tax_amount,
      pricing_withholding_amount,
      pricing_total_amount
    FROM document.v_commitment_line_pricing_summary
    WHERE tenant_id = ${tenantId}
      AND commitment_line_id IN (${sql.join(lineIds)})
  `.execute(db);

  const byLineId = new Map(result.rows.map((row) => [row.commitment_line_id, row]));
  return rows.map((row) => {
    const id = row["id"];
    const projection = typeof id === "string" ? byLineId.get(id) : undefined;
    return projection ? { ...row, ...projection } : row;
  });
}

/**
 * Fetches the current status of a record for field-level gate evaluation.
 *
 * For child entities whose editability is governed by a parent document's
 * lifecycle (e.g. `purchase_invoice_line` follows `purchase_invoice.status`),
 * this resolves the parent's status instead of the child's own status column
 * (which represents a different concept like 'open'/'closed' on line rows).
 *
 * Returns null when the entity has no status column or the record is missing â€”
 * isEntityFieldWritable interprets null as "no status gate enforced."
 */
async function fetchRecordStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  fullTable: `${string}.${string}`,
  recordId: string,
  tenantId: string,
): Promise<string | null> {
  const statusSource = resolveRecordStatusSource(fullTable);

  // â”€â”€ purchase_invoice_line â†’ parent purchase_invoice.status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (statusSource === "purchase_invoice_parent") {
    try {
      const row = await sql<{ status: string }>`
        SELECT pi.status
          FROM document.purchase_invoice pi
          JOIN document.purchase_invoice_line pil
            ON pil.purchase_invoice_id = pi.id
           AND pil.tenant_id           = pi.tenant_id
         WHERE pil.id        = ${recordId}::uuid
           AND pil.tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      return row.rows[0]?.status ?? null;
    } catch {
      return null;
    }
  }

  // â”€â”€ accounting_distribution â†’ polymorphic parent doc status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // source_doc_type identifies the parent table; source_doc_id is the parent
  // HEADER id (verified via invoice-posting.service.ts insert pattern).
  // Sprint 1 covers purchase_invoice_line only; other source types fall
  // through to the own-status path (which returns null â†’ no gate enforced).
  if (statusSource === "accounting_distribution_parent") {
    try {
      const row = await sql<{ status: string }>`
        SELECT pi.status
          FROM document.accounting_distribution ad
          JOIN document.purchase_invoice pi
            ON pi.id        = ad.source_doc_id
           AND pi.tenant_id = ad.tenant_id
         WHERE ad.id              = ${recordId}::uuid
           AND ad.tenant_id       = ${tenantId}::uuid
           AND ad.source_doc_type = 'purchase_invoice_line'
         LIMIT 1
      `.execute(db);
      if (row.rows[0]?.status) return row.rows[0].status;
      // Fall through: other source_doc_type values not yet wired
      return null;
    } catch {
      return null;
    }
  }

  // â”€â”€ Default: read own status column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (db.selectFrom(fullTable) as any)
      .select(["status"])
      .where("id", "=", recordId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst() as { status?: string } | undefined;
    if (!row) return null;
    return typeof row.status === "string" ? row.status : null;
  } catch {
    // Entity has no `status` column â€” return null so the guard skips the check.
    return null;
  }
}

interface DocumentAuditContext {
  status: string;
  companyCodeId: string | null;
}

async function loadPurchaseInvoiceAuditContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string | null,
  invoiceId: string,
): Promise<DocumentAuditContext | null> {
  if (!tenantId) return null;
  const row = await sql<{ status: string; company_code_id: string | null }>`
    SELECT status, company_code_id
      FROM document.purchase_invoice
     WHERE id = ${invoiceId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  const first = row.rows[0];
  if (!first) return null;
  return { status: first.status, companyCodeId: first.company_code_id };
}

function rejectChildReplaceWhenLocked(
  res: Response,
  status: string,
  childLabel: string,
): boolean {
  if (canMutateP2pChild(status, "replace")) return false;
  res.status(422).json({
    error: "CHILD_NOT_EDITABLE",
    message: `Invoice is in '${status}'. ${childLabel} can be changed only while the invoice is draft/proforma; request revision or reopen to draft.`,
  });
  return true;
}

/**
 * Resolves a `change_reason_code.code` string from a request body into the
 * matching row's id. Searches the system-scoped rows (tenant_id IS NULL)
 * first, then the tenant's custom rows. Returns null when the code is
 * absent, blank, or doesn't resolve to an active row.
 *
 * Callers requiring the reason on a high-risk path should 422 when this
 * returns null after the path's required-reason guard has fired.
 */
async function resolveChangeReasonCodeId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string | null,
  code: unknown,
): Promise<string | null> {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) return null;
  // System (tenant_id IS NULL) first; tenant-custom overrides allowed if a
  // tenant chooses to alias a system code under their own row (unlikely but
  // supported by the unique key on (tenant_id, code)).
  const row = await sql<{ id: string }>`
    SELECT id
      FROM master.change_reason_code
     WHERE code   = ${trimmed}
       AND status = 'active'
       AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
     ORDER BY (tenant_id IS NOT NULL) DESC  -- prefer tenant-custom over system
     LIMIT 1
  `.execute(db);
  return row.rows[0]?.id ?? null;
}

/**
 * Thin wrapper over the shared writeRouteAudit so AD mutations carry the same
 * shape every other route does (changed_fields, reason_code, correlation_id
 * propagation). `changed_fields` stays pinned to ['accounting_distributions']
 * â€” AD edits are recorded under the parent invoice's entity_type, so the diff
 * is at the child-set granularity, not per-column.
 */
async function writeAccountingDistributionAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  args: {
    tenantId: string;
    actor: string;
    invoiceId: string;
    companyCodeId: string | null;
    operation: "insert" | "update" | "delete";
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    /** Optional FK to master.change_reason_code; required by callers on
     *  high-risk paths (manual GL override). */
    reasonCode?: string | null;
  },
): Promise<void> {
  await writeRequiredRouteAudit(db, {
    tenantId:      args.tenantId,
    entityType:    "purchase_invoice",
    entityId:      args.invoiceId,
    operation:     args.operation,
    actorId:       args.actor,
    actorType:     "principal",
    companyCodeId: args.companyCodeId,
    oldValues:     args.oldValues,
    newValues:     args.newValues,
    changedFields: ["accounting_distributions"],
    reasonCode:    args.reasonCode ?? null,
  });
}

/**
 * Maps server FieldNonWritableReason â†’ client-side LockedFieldReason string.
 *
 * Kept in sync with the LockedFieldReason enum in
 * packages/shared/data-integration/api-contracts/src/schemas/document-edit-draft.ts.
 *
 * Returns null for FIELD_NOT_REGISTERED â€” those fields are simply omitted
 * from the mask rather than reported as locked, since the entity does not
 * acknowledge them at all.
 */
function parseJsonPathColumn(columnName: string): { root: string; path: string[] } | null {
  const dotIdx = columnName.indexOf(".");
  if (dotIdx <= 0) return null;
  const root = columnName.slice(0, dotIdx);
  const rest = columnName.slice(dotIdx + 1);
  if (root !== "metadata") return null;
  const path = rest.split(".").map((part) => part.trim()).filter(Boolean);
  if (path.length === 0) return null;
  if (!path.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part))) return null;
  return { root, path };
}

function storageColumnName(columnName: string): string {
  return parseJsonPathColumn(columnName)?.root ?? columnName;
}

function isTextSearchDataType(dataType: string | null | undefined): boolean {
  return TEXT_SEARCH_DATA_TYPES.has(String(dataType ?? "").toLowerCase());
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch { /* keep empty object */ }
  }
  return {};
}

function markEditedIdentityName(
  mappedData: Record<string, unknown>,
  oldRow: Record<string, unknown> | undefined,
  inputData: Record<string, unknown>,
  identityConfig: Record<string, unknown>,
  fieldMap: Map<string, string>,
): void {
  const naming = asPlainObject(identityConfig["naming"]);
  const logicalField = typeof naming["field"] === "string" ? naming["field"] : "";
  if (!logicalField || !Object.prototype.hasOwnProperty.call(inputData, logicalField)) return;
  const physicalField = fieldMap.get(logicalField) ?? logicalField;
  if (!Object.prototype.hasOwnProperty.call(mappedData, physicalField)) return;
  mappedData["metadata"] = mergeFieldProvenance(mappedData["metadata"] ?? oldRow?.["metadata"], {
    [logicalField]: { source: "user", context: "edit", system_managed: false },
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

async function resolvePurchaseOrderCommitmentType(db: Kysely<any>): Promise<string> {
  const view = await sql<{ viewdef: string | null }>`
    SELECT pg_get_viewdef('document.purchase_order'::regclass, true) AS viewdef
  `.execute(db).catch(() => ({ rows: [] as Array<{ viewdef: string | null }> }));
  const viewdef = String(view.rows[0]?.viewdef ?? "");
  return viewdef.includes("'PURCHASE_ORDER'") || viewdef.includes("= 'PURCHASE_ORDER'")
    ? "PURCHASE_ORDER"
    : "purchase_order";
}

async function resolveDraftCompanyCode(
  db: Kysely<any>,
  req: { headers: Record<string, unknown> },
  tenantId: string,
): Promise<{ id: string; functional_currency: string } | null> {
  const orgContextType = String(req.headers["x-org-context-type"] ?? "").toLowerCase().trim();
  const organizationId = String(req.headers["x-organization-id"] ?? "").trim();
  const legalEntityHeader = String(req.headers["x-legal-entity-id"] ?? "").trim();
  const companyCodeHint = String(req.headers["x-company-code-id"] ?? "").trim();

  // X-Company-Code-ID is a fiscal-calendar hint sourced from
  // master.principal_ui_profile â€” it can point at a CC that is not under the
  // caller's active org. If we stamped that CC on the draft, the reader's
  // scope filter (resolveScopeFilters in apps/neon meta-entity-records.ts)
  // would exclude the row and the UI would show "Record was not found in the
  // active organization scope." Reconcile the hint against the active-org
  // scope before trusting it.
  const activeCompanyCodeScope = orgContextType === "company_code" && isUuidLike(organizationId)
    ? organizationId
    : null;
  const activeLegalEntityScope = isUuidLike(legalEntityHeader)
    ? legalEntityHeader
    : (orgContextType === "legal_entity" && isUuidLike(organizationId) ? organizationId : null);

  const readCompanyCode = async (id: string): Promise<{ id: string; legal_entity_id: string; functional_currency: string } | null> => {
    const scoped = await sql<{ id: string; legal_entity_id: string; functional_currency: string }>`
      SELECT id, legal_entity_id, functional_currency
        FROM master.company_code
       WHERE tenant_id = ${tenantId}::uuid
         AND id = ${id}::uuid
         AND status = 'active'
       LIMIT 1
    `.execute(db);
    return scoped.rows[0] ?? null;
  };

  const readFirstCompanyCodeForLegalEntity = async (id: string): Promise<{ id: string; functional_currency: string } | null> => {
    const scoped = await sql<{ id: string; functional_currency: string }>`
      SELECT id, functional_currency
        FROM master.company_code
       WHERE tenant_id = ${tenantId}::uuid
         AND legal_entity_id = ${id}::uuid
         AND status = 'active'
       ORDER BY created_at ASC
       LIMIT 1
    `.execute(db);
    return scoped.rows[0] ?? null;
  };

  // CC-scoped session: the org itself is the CC â€” use it directly and ignore
  // the fiscal hint, which may lag the active-org switch.
  if (activeCompanyCodeScope) {
    const scoped = await readCompanyCode(activeCompanyCodeScope);
    if (scoped) return { id: scoped.id, functional_currency: scoped.functional_currency };
  }

  // LE-scoped session: honour the fiscal hint only when it belongs to the
  // active LE; otherwise pick the first active CC under that LE so the draft
  // lands inside the reader's scope.
  if (activeLegalEntityScope) {
    if (isUuidLike(companyCodeHint)) {
      const scoped = await readCompanyCode(companyCodeHint);
      if (scoped && scoped.legal_entity_id === activeLegalEntityScope) {
        return { id: scoped.id, functional_currency: scoped.functional_currency };
      }
    }
    const fallback = await readFirstCompanyCodeForLegalEntity(activeLegalEntityScope);
    if (fallback) return fallback;
  }

  // No active-org scope headers â€” accept the fiscal hint at face value.
  if (!activeCompanyCodeScope && !activeLegalEntityScope && isUuidLike(companyCodeHint)) {
    const scoped = await readCompanyCode(companyCodeHint);
    if (scoped) return { id: scoped.id, functional_currency: scoped.functional_currency };
  }

  const fallback = await sql<{ id: string; functional_currency: string }>`
    SELECT id, functional_currency
      FROM master.company_code
     WHERE tenant_id = ${tenantId}::uuid
       AND status = 'active'
     ORDER BY created_at ASC
     LIMIT 1
  `.execute(db);
  return fallback.rows[0] ?? null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isPostgresUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [err];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (record["code"] === "23505") return true;
    if (typeof record["message"] === "string" && record["message"].includes("duplicate key value violates unique constraint")) {
      return true;
    }
    stack.push(record["cause"], record["error"], record["original"], record["parent"]);
  }
  return false;
}

function numberRecord(value: unknown): Record<string, number> {
  const record = asPlainObject(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (key && Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function normalizeEntitySearchConfig(
  searchConfigRaw: unknown,
  defaultMinQueryLength = 1,
): EntitySearchConfig {
  const searchConfig = asPlainObject(searchConfigRaw);
  const hasConfiguredFields = Array.isArray(searchConfig["fields"]);
  const configuredFields = stringArray(searchConfig["fields"]);

  const minQueryLengthRaw = Number(searchConfig["min_query_length"] ?? defaultMinQueryLength);
  const minQueryLength = Number.isFinite(minQueryLengthRaw)
    ? Math.max(1, Math.floor(minQueryLengthRaw))
    : 1;

  return {
    enabled: searchConfig["enabled"] !== false,
    fields: hasConfiguredFields ? configuredFields : [],
    rank: numberRecord(searchConfig["rank"]),
    minQueryLength,
    operator: "contains",
    hasConfiguredFields,
  };
}

function searchPattern(term: string, operator: EntitySearchOperator): string {
  switch (operator) {
    case "contains":
    default:
      return `%${term}%`;
  }
}

function searchRankForField(config: EntitySearchConfig, fieldName: string, fallbackIndex: number): number {
  const configured = config.rank[fieldName];
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) return configured;
  const configuredIndex = config.fields.indexOf(fieldName);
  if (configuredIndex >= 0) return Math.max(1, config.fields.length - configuredIndex);
  if (config.fields.length > 0) return Math.max(1, config.fields.length - fallbackIndex);
  return 1;
}

function buildSearchScoreExpression(
  fields: Array<{ columnName: string; rank: number }>,
  term: string,
) {
  const exactPattern = term;
  const prefixPattern = `${term}%`;
  const containsPattern = `%${term}%`;
  const parts = fields.map(({ columnName, rank }) => sql<number>`
    CASE
      WHEN COALESCE(${sql.ref(columnName)}::text, '') ILIKE ${exactPattern} THEN ${rank * 100}
      WHEN COALESCE(${sql.ref(columnName)}::text, '') ILIKE ${prefixPattern} THEN ${rank * 10}
      WHEN COALESCE(${sql.ref(columnName)}::text, '') ILIKE ${containsPattern} THEN ${rank}
      ELSE 0
    END
  `);
  return sql<number>`(${sql.join(parts, sql` + `)})`;
}

function setJsonPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]!;
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]!] = value;
}

function getJsonPath(source: unknown, path: string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor ?? null;
}

function assignMappedValue(mappedData: Record<string, unknown>, columnName: string, value: unknown): void {
  const jsonPath = parseJsonPathColumn(columnName);
  if (!jsonPath) {
    mappedData[columnName] = value;
    return;
  }
  const rootObject = asPlainObject(mappedData[jsonPath.root]);
  setJsonPath(rootObject, jsonPath.path, value);
  mappedData[jsonPath.root] = rootObject;
}

function readMappedValue(row: Record<string, unknown>, columnName: string): unknown {
  const jsonPath = parseJsonPathColumn(columnName);
  if (!jsonPath) return row[columnName];
  return getJsonPath(row[jsonPath.root], jsonPath.path);
}

function remapRecordRow(row: Record<string, unknown>, fieldMap: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [fieldName, columnName] of fieldMap.entries()) {
    const value = readMappedValue(row, columnName);
    if (value !== undefined) out[fieldName] = value;
  }
  return out;
}

function mergeJsonColumnUpdates(
  mappedData: Record<string, unknown>,
  existingRow: Record<string, unknown> | undefined,
  jsonColumns: Map<string, string>,
): void {
  for (const columnName of jsonColumns.keys()) {
    const nextValue = mappedData[columnName];
    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) continue;
    mappedData[columnName] = {
      ...asPlainObject(existingRow?.[columnName]),
      ...(nextValue as Record<string, unknown>),
    };
  }
}

function includeMappedJsonObjects(
  mappedData: Record<string, unknown>,
  jsonColumns: Map<string, string>,
): void {
  if (mappedData["metadata"] !== undefined) jsonColumns.set("metadata", "jsonb");
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "off"].includes(normalized)) return false;
  return null;
}

function jsonStringArray(value: unknown): string[] {
  const raw = typeof value === "string" && value.trim().startsWith("[")
    ? (() => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    })()
    : value;

  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase());
}

function normalizeCommodityCategoryDomainGuards(
  entityCode: string,
  mappedData: Record<string, unknown>,
  existingRow?: Record<string, unknown>,
): void {
  if (entityCode.replace(/-/g, "_") !== "commodity_category") return;

  const isHsRequired = parseBooleanLike(
    mappedData["is_hs_required"] ?? existingRow?.["is_hs_required"],
  );
  if (isHsRequired !== true) return;

  const domains = new Set(jsonStringArray(
    mappedData["allowed_classification_domains"] ?? existingRow?.["allowed_classification_domains"],
  ));
  domains.add("hs");
  mappedData["allowed_classification_domains"] = [...domains];
}

function parseFeatureScope(scope: unknown): { column: string; value: string } | null {
  if (typeof scope !== "string") return null;
  const eqIdx = scope.indexOf("=");
  if (eqIdx <= 0) return null;

  const column = scope.slice(0, eqIdx).trim();
  const value  = scope.slice(eqIdx + 1).trim();

  if (!column || !value) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(column)) return null;

  return { column, value };
}

// â”€â”€ Business-key / UUID dual resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stringConfigValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identityParentRecord(identityConfig: Record<string, unknown>): Record<string, unknown> {
  return asPlainObject(identityConfig["parent"]);
}

function parentFkFromConfigs(
  identityConfig: Record<string, unknown>,
  featureFlags: Record<string, unknown>,
): string | null {
  return stringConfigValue(identityParentRecord(identityConfig)["field"])
    ?? stringConfigValue(featureFlags["parent_fk"]);
}

function parentScopeFromConfigs(
  identityConfig: Record<string, unknown>,
  featureFlags: Record<string, unknown>,
): string | null {
  return stringConfigValue(identityParentRecord(identityConfig)["scope"])
    ?? stringConfigValue(featureFlags["parent_scope"]);
}

function configuredListEntityCode(table: EntityTableInfo): string | null {
  return stringConfigValue(table.identity_config["list_entity_code"])
    ?? stringConfigValue(table.feature_flags["list_entity_code"]);
}

function configuredIdentityVia(table: EntityTableInfo): string | null {
  return stringConfigValue(table.identity_config["identity_via"])
    ?? stringConfigValue(table.feature_flags["identity_via"]);
}

function configuredParentFk(table: EntityTableInfo): string | null {
  return parentFkFromConfigs(table.identity_config, table.feature_flags);
}

function configuredParentScope(table: EntityTableInfo): string | null {
  return parentScopeFromConfigs(table.identity_config, table.feature_flags);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rejectInvalidUuidParam(res: Response, value: string, label: string): boolean {
  if (UUID_RE.test(value)) return false;
  res.status(400).json({ error: "INVALID_ID", message: `${label} must be a valid UUID` });
  return true;
}

type PaymentSourceInvoiceGuard =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

async function validatePaymentEntrySourceInvoiceCreate(
  db: Kysely<Record<string, unknown>>,
  tenantId: string,
  sourceInvoiceId: string,
  mappedData: Record<string, unknown>,
): Promise<PaymentSourceInvoiceGuard> {
  if (!UUID_RE.test(sourceInvoiceId)) {
    return { ok: false, status: 400, body: { error: "INVALID_SOURCE_INVOICE_ID" } };
  }

  const result = await sql<{
    id: string;
    code: string;
    company_code_id: string;
    supplier_id: string;
    currency_code: string;
    status: string;
    terminal_status: string | null;
    invoice_type: string;
    payable_amount: string | number | null;
    already_allocated: string | number | null;
  }>`
    SELECT
      pi.id,
      pi.code,
      pi.company_code_id,
      pi.supplier_id,
      pi.currency_code,
      pi.status,
      pi.terminal_status,
      pi.invoice_type,
      pi.payable_amount::numeric AS payable_amount,
      COALESCE((
        SELECT SUM(pea.allocated_amount)::numeric
          FROM document.payment_entry_allocation pea
          JOIN document.payment_entry pe
            ON pe.id = pea.payment_entry_id
           AND pe.tenant_id = pea.tenant_id
         WHERE pea.tenant_id = pi.tenant_id
           AND pea.purchase_invoice_id = pi.id
           AND pe.status NOT IN ('voided', 'reversed', 'cancelled')
      ), 0) AS already_allocated
    FROM document.purchase_invoice pi
    WHERE pi.tenant_id = ${tenantId}::uuid
      AND pi.id        = ${sourceInvoiceId}::uuid
    LIMIT 1
  `.execute(db);

  const invoice = result.rows[0];
  if (!invoice) {
    return { ok: false, status: 404, body: { error: "SOURCE_INVOICE_NOT_FOUND" } };
  }
  if (invoice.terminal_status) {
    return {
      ok: false,
      status: 422,
      body: { error: "INVOICE_NOT_PAYABLE", message: `Invoice ${invoice.code} is terminal (${invoice.terminal_status}).` },
    };
  }
  if (["credit_note", "debit_note"].includes(invoice.invoice_type)) {
    return {
      ok: false,
      status: 422,
      body: { error: "INVOICE_NOT_PAYABLE", message: "Credit/debit notes must be settled through credit application, not cash payment." },
    };
  }
  if (!["posted", "partially_paid"].includes(invoice.status)) {
    return {
      ok: false,
      status: 422,
      body: { error: "INVOICE_NOT_PAYABLE", message: `Invoice ${invoice.code} must be posted before payment.` },
    };
  }

  const paymentAmount = Number(mappedData["payment_amount"] ?? 0);
  const remaining = Number(invoice.payable_amount ?? 0) - Number(invoice.already_allocated ?? 0);
  if (Number.isFinite(paymentAmount) && paymentAmount > remaining) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "ALLOCATION_OVER_REMAINING",
        message: `Payment amount ${paymentAmount} exceeds remaining invoice amount ${remaining}.`,
      },
    };
  }

  if (mappedData["company_code_id"] && mappedData["company_code_id"] !== invoice.company_code_id) {
    return { ok: false, status: 422, body: { error: "COMPANY_CODE_MISMATCH" } };
  }
  if (mappedData["supplier_id"] && mappedData["supplier_id"] !== invoice.supplier_id) {
    return { ok: false, status: 422, body: { error: "SUPPLIER_MISMATCH" } };
  }
  if (mappedData["currency_code"] && mappedData["currency_code"] !== invoice.currency_code) {
    return { ok: false, status: 422, body: { error: "CURRENCY_MISMATCH" } };
  }

  return { ok: true };
}

async function loadPurchaseInvoiceLineAmount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string | null,
  invoiceId: string,
  lineId: string,
): Promise<{ lineAmount: number; lineQuantity: number; currencyCode: string } | null> {
  try {
    let result: { rows: Array<{ line_amount: string | number | null; line_quantity: string | number | null; currency_code: string | null }> };
    if (tenantId !== null) {
      result = await sql<{ line_amount: string | number | null; line_quantity: string | number | null; currency_code: string | null }>`
        SELECT ABS(COALESCE(pil.net_amount, 0) + COALESCE((
                 SELECT SUM(CASE
                   WHEN ct.default_cost_effect = 'REDUCE_COST' THEN -pc.computed_amount
                   WHEN ct.default_cost_effect = 'ADD_TO_COST' THEN pc.computed_amount
                   WHEN ct.id IS NULL AND pc.term_type = 'discount' THEN -pc.computed_amount
                   WHEN ct.id IS NULL AND pc.term_type = 'charge' THEN pc.computed_amount
                   WHEN pc.term_type = 'tax' THEN pc.computed_amount * (1 - LEAST(100, GREATEST(0, COALESCE(pc.recoverable_pct, 100))) / 100)
                   ELSE 0
                 END)
                   FROM document.pricing_component pc
                   LEFT JOIN master.condition_type ct ON ct.id = pc.condition_type_id
                  WHERE pc.source_doc_type = 'purchase_invoice_line'
                    AND pc.source_doc_id = pil.purchase_invoice_id
                    AND pc.source_line_id = pil.id
                    AND pc.superseded_by_id IS NULL
               ), 0)) AS line_amount,
               COALESCE(pil.quantity, 0) AS line_quantity,
               pi.currency_code AS currency_code
          FROM document.purchase_invoice_line pil
          JOIN document.purchase_invoice pi
            ON pi.id = pil.purchase_invoice_id AND pi.tenant_id = pil.tenant_id
         WHERE pil.id = ${lineId}::uuid
           AND pil.purchase_invoice_id = ${invoiceId}::uuid
           AND pil.tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
    } else {
      result = await sql<{ line_amount: string | number | null; line_quantity: string | number | null; currency_code: string | null }>`
        SELECT ABS(COALESCE(pil.net_amount, 0) + COALESCE((
                 SELECT SUM(CASE
                   WHEN ct.default_cost_effect = 'REDUCE_COST' THEN -pc.computed_amount
                   WHEN ct.default_cost_effect = 'ADD_TO_COST' THEN pc.computed_amount
                   WHEN ct.id IS NULL AND pc.term_type = 'discount' THEN -pc.computed_amount
                   WHEN ct.id IS NULL AND pc.term_type = 'charge' THEN pc.computed_amount
                   WHEN pc.term_type = 'tax' THEN pc.computed_amount * (1 - LEAST(100, GREATEST(0, COALESCE(pc.recoverable_pct, 100))) / 100)
                   ELSE 0
                 END)
                   FROM document.pricing_component pc
                   LEFT JOIN master.condition_type ct ON ct.id = pc.condition_type_id
                  WHERE pc.source_doc_type = 'purchase_invoice_line'
                    AND pc.source_doc_id = pil.purchase_invoice_id
                    AND pc.source_line_id = pil.id
                    AND pc.superseded_by_id IS NULL
               ), 0)) AS line_amount,
               COALESCE(pil.quantity, 0) AS line_quantity,
               pi.currency_code AS currency_code
          FROM document.purchase_invoice_line pil
          JOIN document.purchase_invoice pi
            ON pi.id = pil.purchase_invoice_id AND pi.tenant_id = pil.tenant_id
         WHERE pil.id = ${lineId}::uuid
           AND pil.purchase_invoice_id = ${invoiceId}::uuid
         LIMIT 1
      `.execute(db);
    }
    const row = result.rows[0];
    if (!row) return null;
    return {
      lineAmount:   Number(row.line_amount ?? 0),
      lineQuantity: Number(row.line_quantity ?? 0),
      currencyCode: row.currency_code ?? "USD",
    };
  } catch {
    return null;
  }
}

function sourceDocTypeForLineEntity(lineEntityCode: string): string | null {
  switch (lineEntityCode) {
    case "purchase_requisition_line": return "purchase_requisition_line";
    case "commitment_line":           return "commitment_line";
    case "purchase_invoice_line":     return "purchase_invoice_line";
    case "receipt_line":              return "receipt_line";
    case "service_sheet_line":        return "service_sheet_line";
    default:                          return null;
  }
}

async function loadDistributionLineAmount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string | null,
  sourceDocType: string,
  sourceDocId: string,
  lineId: string,
): Promise<{ lineAmount: number; lineQuantity: number; currencyCode: string } | null> {
  if (sourceDocType === "purchase_invoice_line") {
    return loadPurchaseInvoiceLineAmount(db, tenantId, sourceDocId, lineId);
  }

  try {
    if (sourceDocType === "commitment_line") {
      const result = tenantId !== null
        ? await sql<{ line_amount: string | number | null; line_quantity: string | number | null; currency_code: string | null }>`
            SELECT ABS(COALESCE(cl.net_amount, 0) + COALESCE((
                     SELECT SUM(CASE
                       WHEN ct.default_cost_effect = 'REDUCE_COST' THEN -pc.computed_amount
                       WHEN ct.default_cost_effect = 'ADD_TO_COST' THEN pc.computed_amount
                       WHEN ct.id IS NULL AND pc.term_type = 'discount' THEN -pc.computed_amount
                       WHEN ct.id IS NULL AND pc.term_type = 'charge' THEN pc.computed_amount
                       WHEN pc.term_type = 'tax' THEN pc.computed_amount * (1 - LEAST(100, GREATEST(0, COALESCE(pc.recoverable_pct, 100))) / 100)
                       ELSE 0
                     END)
                       FROM document.pricing_component pc
                       LEFT JOIN master.condition_type ct ON ct.id = pc.condition_type_id
                      WHERE pc.source_doc_type = 'commitment_line'
                        AND pc.source_doc_id = cl.commitment_id
                        AND pc.source_line_id = cl.id
                        AND pc.superseded_by_id IS NULL
                   ), 0)) AS line_amount,
                   COALESCE(cl.quantity, 0) AS line_quantity,
                   COALESCE(cl.currency_code, c.currency_code) AS currency_code
              FROM document.commitment_line cl
              JOIN document.commitment c
                ON c.id = cl.commitment_id AND c.tenant_id = cl.tenant_id
             WHERE cl.id = ${lineId}::uuid
               AND cl.commitment_id = ${sourceDocId}::uuid
               AND cl.tenant_id = ${tenantId}::uuid
             LIMIT 1
          `.execute(db)
        : await sql<{ line_amount: string | number | null; line_quantity: string | number | null; currency_code: string | null }>`
            SELECT ABS(COALESCE(cl.net_amount, 0) + COALESCE((
                     SELECT SUM(CASE
                       WHEN ct.default_cost_effect = 'REDUCE_COST' THEN -pc.computed_amount
                       WHEN ct.default_cost_effect = 'ADD_TO_COST' THEN pc.computed_amount
                       WHEN ct.id IS NULL AND pc.term_type = 'discount' THEN -pc.computed_amount
                       WHEN ct.id IS NULL AND pc.term_type = 'charge' THEN pc.computed_amount
                       WHEN pc.term_type = 'tax' THEN pc.computed_amount * (1 - LEAST(100, GREATEST(0, COALESCE(pc.recoverable_pct, 100))) / 100)
                       ELSE 0
                     END)
                       FROM document.pricing_component pc
                       LEFT JOIN master.condition_type ct ON ct.id = pc.condition_type_id
                      WHERE pc.source_doc_type = 'commitment_line'
                        AND pc.source_doc_id = cl.commitment_id
                        AND pc.source_line_id = cl.id
                        AND pc.superseded_by_id IS NULL
                   ), 0)) AS line_amount,
                   COALESCE(cl.quantity, 0) AS line_quantity,
                   COALESCE(cl.currency_code, c.currency_code) AS currency_code
              FROM document.commitment_line cl
              JOIN document.commitment c
                ON c.id = cl.commitment_id AND c.tenant_id = cl.tenant_id
             WHERE cl.id = ${lineId}::uuid
               AND cl.commitment_id = ${sourceDocId}::uuid
             LIMIT 1
          `.execute(db);
      const row = result.rows[0];
      if (!row) return null;
      return {
        lineAmount:   Number(row.line_amount ?? 0),
        lineQuantity: Number(row.line_quantity ?? 0),
        currencyCode: row.currency_code ?? "USD",
      };
    }
  } catch {
    return null;
  }

  return null;
}

interface DistributionReplaceRowInput {
  distribution_basis: "PERCENT" | "AMOUNT" | "QUANTITY";
  split_pct: number | null;
  split_amount: number | null;
  split_quantity: number | null;
  distributed_amount: number;
  gl_account_id: string | null;
  account_source: "PENDING" | "OVERRIDE";
  cost_center_id: string | null;
  profit_center_id: string | null;
  project_id: string | null;
  asset_id: string | null;
  description: string | null;
  reason_code: unknown;
}

interface DistributionReplaceParseResult {
  ok: boolean;
  rows: DistributionReplaceRowInput[];
  error?: string;
  message?: string;
}

function readNullableUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundDistributionValue(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function parseDistributionReplaceRows(
  body: Record<string, unknown>,
  lineAmount: { lineAmount: number; lineQuantity: number; currencyCode: string },
): DistributionReplaceParseResult {
  const rawRows = Array.isArray(body["distributions"]) ? body["distributions"] : null;
  if (!rawRows || rawRows.length === 0) {
    return {
      ok: false,
      rows: [],
      error: "DISTRIBUTIONS_REQUIRED",
      message: "Provide at least one distribution row.",
    };
  }
  if (rawRows.length > 100) {
    return {
      ok: false,
      rows: [],
      error: "TOO_MANY_DISTRIBUTIONS",
      message: "A line can have at most 100 distribution rows.",
    };
  }

  const rows: DistributionReplaceRowInput[] = [];
  let basis: "PERCENT" | "AMOUNT" | "QUANTITY" | null = null;

  for (const [index, raw] of rawRows.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        rows: [],
        error: "INVALID_DISTRIBUTION_ROW",
        message: `Distribution row ${index + 1} is not an object.`,
      };
    }
    const row = raw as Record<string, unknown>;
    const rowBasis = readDistributionBasis(row["distribution_basis"]);
    if (!basis) basis = rowBasis;
    if (rowBasis !== basis) {
      return {
        ok: false,
        rows: [],
        error: "MIXED_DISTRIBUTION_BASIS",
        message: "All split rows in one save must use the same basis.",
      };
    }

    const splitPct = rowBasis === "PERCENT" ? readFiniteNumber(row["split_pct"]) : null;
    const splitAmount = rowBasis === "AMOUNT" ? readFiniteNumber(row["split_amount"]) : null;
    const splitQuantity = rowBasis === "QUANTITY" ? readFiniteNumber(row["split_quantity"]) : null;
    const basisValue = rowBasis === "PERCENT" ? splitPct : rowBasis === "AMOUNT" ? splitAmount : splitQuantity;
    if (basisValue === null || basisValue <= 0) {
      return {
        ok: false,
        rows: [],
        error: "INVALID_SPLIT_VALUE",
        message: `Distribution row ${index + 1} needs a positive ${rowBasis.toLowerCase()} value.`,
      };
    }

    const glAccountId = readNullableUuid(row["gl_account_id"]);
    const inputForAmount = {
      distribution_basis: rowBasis,
      split_pct:          splitPct,
      split_amount:       splitAmount,
      split_quantity:     splitQuantity,
    };
    rows.push({
      distribution_basis: rowBasis,
      split_pct:          splitPct,
      split_amount:       splitAmount,
      split_quantity:     splitQuantity,
      distributed_amount: computeDistributionDocumentAmount(inputForAmount, lineAmount),
      gl_account_id:      glAccountId,
      account_source:     glAccountId ? "OVERRIDE" : "PENDING",
      cost_center_id:     readNullableUuid(row["cost_center_id"]),
      profit_center_id:   readNullableUuid(row["profit_center_id"]),
      project_id:         readNullableUuid(row["project_id"]),
      asset_id:           readNullableUuid(row["asset_id"]),
      description:        readNullableText(row["description"]),
      reason_code:        row["reason_code"] ?? body["reason_code"],
    });
  }

  const activeBasis = basis ?? "PERCENT";
  const expected = activeBasis === "PERCENT"
    ? 100
    : activeBasis === "AMOUNT"
      ? lineAmount.lineAmount
      : lineAmount.lineQuantity;
  const actual = rows.reduce((sum, row) => {
    if (activeBasis === "PERCENT") return sum + (row.split_pct ?? 0);
    if (activeBasis === "AMOUNT") return sum + (row.split_amount ?? 0);
    return sum + (row.split_quantity ?? 0);
  }, 0);
  const tolerance = activeBasis === "PERCENT" ? 0.0001 : 0.005;
  if (Math.abs(roundDistributionValue(actual) - roundDistributionValue(expected)) > tolerance) {
    const unit = activeBasis === "PERCENT" ? "%" : activeBasis === "AMOUNT" ? lineAmount.currencyCode : "quantity";
    return {
      ok: false,
      rows: [],
      error: "DISTRIBUTIONS_NOT_BALANCED",
      message: `Distribution total ${roundDistributionValue(actual)} ${unit} must equal ${roundDistributionValue(expected)} ${unit}.`,
    };
  }

  return { ok: true, rows };
}

type CreateGraphContract = {
  child_entity: string;
  writer: string;
  mode: string;
};

async function loadCreateGraphContract(
  kysely: Kysely<any>,
  entityCode: string,
  tenantId: string | null,
): Promise<Map<string, CreateGraphContract>> {
  const result = await sql<{ create_graph: unknown }>`
    SELECT feature_flags -> 'create_graph' AS create_graph
      FROM control.entity
     WHERE entity_code = ${entityCode}
       AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
       AND feature_flags -> 'create_graph' IS NOT NULL
     ORDER BY (tenant_id IS NOT NULL) DESC
     LIMIT 1
  `.execute(kysely);
  const raw = result.rows[0]?.create_graph;
  const children = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as { children?: unknown }).children
    : null;
  const contracts = new Map<string, CreateGraphContract>();
  if (!Array.isArray(children)) return contracts;
  for (const value of children) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    if (typeof item["child_entity"] !== "string" || typeof item["writer"] !== "string") continue;
    contracts.set(item["child_entity"], {
      child_entity: item["child_entity"],
      writer: item["writer"],
      mode: typeof item["mode"] === "string" ? item["mode"] : "replace_default",
    });
  }
  return contracts;
}

function readJwtSubject(claims: Record<string, unknown>): string | null {
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  return sub.length > 0 ? sub : null;
}

function requireJwtSubject(claims: Record<string, unknown>, res: Response): string | null {
  const sub = readJwtSubject(claims);
  if (sub) return sub;
  res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
  return null;
}

function isCertificationBackingTable(table: EntityTableInfo): boolean {
  return table.table_schema === "master" && table.table_name === "certification";
}

function isCommodityClassificationBackingTable(table: EntityTableInfo): boolean {
  return table.table_schema === "master" && table.table_name === "commodity_classification";
}

// Adds display-only values from the existing certification_type table. These are
// virtual API fields, not DDL columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichCertificationTypeDisplayFields(
  db: Kysely<any>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const typeIds = Array.from(new Set(
    rows
      .map((row) => row["certification_type_id"])
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
  ));

  if (typeIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      certification_display_name: row["custom_name"] ?? null,
      certification_type_name:    null,
      certification_type_code:    null,
      certification_category:     null,
      certification_issuing_body: null,
    }));
  }

  const typeRows = await db
    .selectFrom("master.certification_type as ct" as never)
    .select([
      "ct.id",
      "ct.code",
      "ct.name",
      "ct.category",
      "ct.issuing_body",
    ] as never[])
    .where("ct.id" as never, "in", typeIds as never)
    .execute() as Record<string, unknown>[];

  const typeById = new Map<string, Record<string, unknown>>();
  for (const typeRow of typeRows) {
    if (typeof typeRow["id"] === "string") typeById.set(typeRow["id"], typeRow);
  }

  return rows.map((row) => {
    const typeId = row["certification_type_id"];
    const typeRow = typeof typeId === "string" ? typeById.get(typeId) : undefined;
    const typeName = typeRow?.["name"] ?? null;

    return {
      ...row,
      certification_display_name: typeName ?? row["custom_name"] ?? null,
      certification_type_name:    typeName,
      certification_type_code:    typeRow?.["code"] ?? null,
      certification_category:     typeRow?.["category"] ?? null,
      certification_issuing_body: typeRow?.["issuing_body"] ?? null,
    };
  });
}

// Adds display-only code values for the polymorphic commodity_classification
// bridge. These are virtual API fields backed by shared.commodity_code or
// shared.industry_code, so the generic app can avoid showing code_id UUIDs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichCommodityClassificationDisplayFields(
  db: Kysely<any>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const commodityIds = Array.from(new Set(
    rows
      .filter((row) => row["classification_type"] === "commodity")
      .map((row) => row["code_id"])
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
  ));
  const industryIds = Array.from(new Set(
    rows
      .filter((row) => row["classification_type"] === "industry")
      .map((row) => row["code_id"])
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
  ));

  const [commodityRows, industryRows] = await Promise.all([
    commodityIds.length > 0
      ? db
        .selectFrom("shared.commodity_code as cc" as never)
        .select(["cc.id", "cc.code", "cc.name", "cc.domain_code", "cc.level_no"] as never[])
        .where("cc.id" as never, "in", commodityIds as never)
        .execute() as Promise<Record<string, unknown>[]>
      : Promise.resolve([]),
    industryIds.length > 0
      ? db
        .selectFrom("shared.industry_code as ic" as never)
        .select(["ic.id", "ic.code", "ic.name", "ic.domain_code", "ic.level_no"] as never[])
        .where("ic.id" as never, "in", industryIds as never)
        .execute() as Promise<Record<string, unknown>[]>
      : Promise.resolve([]),
  ]);

  const codeById = new Map<string, Record<string, unknown>>();
  for (const codeRow of [...commodityRows, ...industryRows]) {
    if (typeof codeRow["id"] === "string") codeById.set(codeRow["id"], codeRow);
  }

  return rows.map((row) => {
    const codeId = row["code_id"];
    const codeRow = typeof codeId === "string" ? codeById.get(codeId) : undefined;
    const code = codeRow?.["code"] ?? null;
    const name = codeRow?.["name"] ?? null;
    const label = code && name ? `${code} - ${name}` : (code ?? name ?? null);

    return {
      ...row,
      system_code:  code,
      system_name:  name,
      system_label: label,
      code_domain:  codeRow?.["domain_code"] ?? row["domain_code"] ?? null,
      code_level:   codeRow?.["level_no"] ?? null,
    };
  });
}

/**
 * Resolve a record row by either UUID (globally unique, no tenant scope) or
 * canonical business key (tenant-scoped via natural_key_fields).
 *
 * Returns undefined when:
 *   - id is not a UUID and no natural_key_fields are configured
 *   - id is not a UUID and tenantId is null
 *   - the row simply does not exist
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveRecordRow(
  db:               Kysely<any>,
  fullTable:        `${string}.${string}`,
  id:               string,
  naturalKeyFields: string[],
  fieldMap:         Map<string, string>,
  tenantId:         string | null,
): Promise<Record<string, unknown> | undefined> {
  if (UUID_RE.test(id)) {
    return db
      .selectFrom(fullTable)
      .selectAll()
      .where("id" as never, "=", id as never)
      .executeTakeFirst() as Promise<Record<string, unknown> | undefined>;
  }

  // Business-key path â€” requires tenant scope and at least one natural key field
  if (!tenantId || naturalKeyFields.length === 0) return undefined;

  // Map logical field names â†’ physical column names
  const nkColumns = naturalKeyFields.map((f) => fieldMap.get(f) ?? f);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db
    .selectFrom(fullTable)
    .selectAll()
    .where("tenant_id" as never, "=", tenantId as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or(nkColumns.map((col: string) => eb(col as never, "=", id as never))),
    )
    .executeTakeFirst() as Promise<Record<string, unknown> | undefined>;
}

// â”€â”€ Filter sigil parser (mirrors client parseFilterSigil, no shared dep) â”€â”€â”€â”€â”€

type ServerFilterOp =
  | { type: "in";       values: unknown[] }
  | { type: "not_in";   values: unknown[] }
  | { type: "gt";       value: unknown }
  | { type: "lt";       value: unknown }
  | { type: "gte";      value: unknown }
  | { type: "lte";      value: unknown }
  | { type: "between";  lo: unknown; hi: unknown }
  | { type: "is_null" }
  | { type: "is_not_null" }
  | { type: "ilike";    value: string }
  | { type: "range";    from: string; to: string };

function coerce(s: string): unknown {
  const normalized = s.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== "" ? n : s;
}

function coerceList(raw: string): unknown[] {
  return raw.split(",").filter(Boolean).map((value) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  });
}

/**
 * `@this_period` / `@last_period` need a DB lookup against master.fiscal_period â€”
 * `parseServerFilterSigil` stays sync (it's called from many synchronous
 * codepaths), so we expose a small async wrapper that dispatches to
 * `resolvePeriodRange` for these two keys and delegates everything else to the
 * sync parser.
 */
const PERIOD_SIGIL_KEYS = new Set<string>(["this_period", "last_period"]);

async function parseServerFilterSigilAsync(
  req: import("express").Request,
  raw: string,
  fiscalCtx: {
    today: string;
    weekStart: 0 | 1 | 6;
    fiscalYearStartMonth: number;
    companyCodeId: string | null;
  },
  deps: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: Kysely<any>;
    tenantId: string;
    logger?: { warn(event: string, fields?: Record<string, unknown>): void };
  },
): Promise<ServerFilterOp> {
  if (raw.startsWith("@")) {
    const key = raw.slice(1);
    if (PERIOD_SIGIL_KEYS.has(key) && fiscalCtx.companyCodeId) {
      const range = await resolvePeriodRange(req, key as PeriodSigilKey, {
        db: deps.db,
        tenantId: deps.tenantId,
        companyCodeId: fiscalCtx.companyCodeId,
        today: fiscalCtx.today,
        logger: deps.logger,
      });
      if (range) return { type: "range", from: range.from, to: range.to };
      // No matching period row â€” fall through to the sync path so the filter
      // degrades to eq/no-op instead of silently including everything.
    }
  }
  return parseServerFilterSigil(raw, fiscalCtx);
}

function parseServerFilterSigil(raw: string, fiscalCtx?: {
  today: string;
  weekStart: 0 | 1 | 6;
  fiscalYearStartMonth: number;
}): ServerFilterOp {
  if (raw === "null")    return { type: "is_null" };
  if (raw === "notnull") return { type: "is_not_null" };

  if (raw.startsWith("@")) {
    const range = resolveRelativeRange(raw.slice(1), fiscalCtx);
    if (range) return { type: "range", from: range.from, to: range.to };
  }
  if (raw.startsWith("~"))  return { type: "ilike", value: raw.slice(1) };
  if (raw.startsWith(">=")) return { type: "gte", value: coerce(raw.slice(2)) };
  if (raw.startsWith("<=")) return { type: "lte", value: coerce(raw.slice(2)) };
  if (raw.startsWith(">"))  return { type: "gt",  value: coerce(raw.slice(1)) };
  if (raw.startsWith("<"))  return { type: "lt",  value: coerce(raw.slice(1)) };

  if (raw.startsWith("between:")) {
    const rest  = raw.slice("between:".length);
    const comma = rest.indexOf(",");
    if (comma > 0) return { type: "between", lo: coerce(rest.slice(0, comma)), hi: coerce(rest.slice(comma + 1)) };
  }
  if (raw.startsWith("not_in:")) {
    return { type: "not_in", values: coerceList(raw.slice("not_in:".length)) };
  }
  if (raw.startsWith("in:")) {
    return { type: "in", values: coerceList(raw.slice("in:".length)) };
  }

  // Default: comma-separated â†’ IN
  return { type: "in", values: coerceList(raw) };
}

function singleStringQueryParam(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

function singleStringFilterValue(op: ServerFilterOp | undefined): string | null {
  if (!op) return null;
  if (op.type === "in" && op.values.length === 1 && typeof op.values[0] === "string" && op.values[0].trim()) {
    return op.values[0].trim();
  }
  return null;
}

function singleStringLegacyFilterValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

function booleanFilterValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (Array.isArray(value) && value.length === 1) return booleanFilterValue(value[0]);
  return null;
}

function booleanFilterOpValue(op: ServerFilterOp | undefined): boolean | null {
  if (!op) return null;
  if (op.type === "in" && op.values.length === 1) return booleanFilterValue(op.values[0]);
  return null;
}

// â”€â”€ Relative range resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Server-side expansion of the `@<token>` filter sigils lives in
// `./lib/relative-range.ts` so it can be unit-tested in isolation. Both the
// client (@athyper/finance-rules) and server delegate to the same pure
// predicate â€” client/server disagreement on the resolved range is impossible
// by construction. Async period-service dispatch (`@this_period` / `@last_period`)
// lives in `./lib/period-range.ts`.

import { resolveRelativeRange } from "./lib/relative-range.js";
import { resolvePeriodRange, type PeriodSigilKey } from "./lib/period-range.js";

function parseCachedCount(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function readVerifiedRoleCodes(res: Response): string[] {
  const value = (res.locals as Record<string, unknown>)["verifiedRoleCodes"];
  return Array.isArray(value)
    ? value.filter((role): role is string => typeof role === "string")
    : [];
}

function parseEntityQueryFilters(query: Request["query"]): EntityQueryFilter[] {
  const result: EntityQueryFilter[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith("filter.") || typeof raw !== "string") continue;
    const field = key.slice("filter.".length);
    if (!field) continue;
    if (raw === "null") { result.push({ field, operator: "is_null" }); continue; }
    if (raw === "notnull") { result.push({ field, operator: "is_not_null" }); continue; }
    let matched = false;
    for (const [prefix, operator] of [[">=", "gte"], ["<=", "lte"], [">", "gt"], ["<", "lt"]] as const) {
      if (raw.startsWith(prefix)) { result.push({ field, operator, value: coerce(raw.slice(prefix.length)) }); matched = true; break; }
    }
    if (matched) continue;
    const values = (raw.startsWith("in:") ? raw.slice(3) : raw).split(",").filter(Boolean).map(coerce);
    result.push({ field, operator: values.length === 1 ? "eq" : "in", value: values.length === 1 ? values[0] : values });
  }
  return result;
}

function parseEntityQuerySort(raw: unknown): EntityQuerySort[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const result = raw.split(",").flatMap((token) => {
    const [field, direction, nulls] = token.trim().split(":");
    if (!field) return [];
    return [{ field, direction: direction === "desc" ? "desc" as const : "asc" as const, nulls: nulls === "nfirst" ? "first" as const : "last" as const }];
  });
  return result.length ? result : undefined;
}

function parseEntityCountMode(raw: unknown): EntityCountMode | undefined {
  return raw === "none" || raw === "cached" || raw === "approximate" || raw === "exact" ? raw : undefined;
}

// â”€â”€ Route factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createRecordsRoute(router: Router, deps: RecordsRouteDeps): Router {
  const { db, auth, logger, cache, redis } = deps;
  const queryPilots = new Set([...(deps.entityQueryPilotCodes ?? [])].map((code) => code.replace(/-/g, "_").toLowerCase()));
  const entityQueryService = deps.executionDescriptorProvider && queryPilots.size > 0 && deps.entityQueryCursorSecret
    ? new EntityQueryService({
        executor: new KyselyEntityQueryExecutor(db),
        cursorSecret: deps.entityQueryCursorSecret,
        references: new DescriptorReferenceLabelResolver(db, deps.executionDescriptorProvider),
        countCache: cache ? {
          get: async (key) => {
            const value = await cache.get(key).catch(() => null);
            const count = value === null ? Number.NaN : Number(value);
            return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
          },
          set: async (key, value) => { await cache.set(key, String(value), "EX", 120); },
        } : undefined,
        resultCache: cache ? {
          get: async (key) => {
            const value = await cache.get(key).catch(() => null);
            if (!value) return undefined;
            try { return JSON.parse(value) as Awaited<ReturnType<EntityQueryService["list"]>>; } catch { return undefined; }
          },
          set: async (key, value) => { await cache.set(key, JSON.stringify(value), "EX", 45); },
        } : undefined,
      })
    : undefined;

  const shouldUseEntityQuery = (req: Request, entityCode: string): boolean =>
    entityQueryService !== undefined
    && queryPilots.has(entityCode.replace(/-/g, "_").toLowerCase())
    && ["1", "true", "yes"].includes(String(req.query["query_v1"] ?? "").toLowerCase())
    && req.query["facets"] === undefined
    && req.query["group"] === undefined
    && req.query["parent_id"] === undefined
    && req.query["through_entity"] === undefined
    && Object.entries(req.query).every(([key, value]) => !key.startsWith("filter.")
      || typeof value !== "string"
      || !value.startsWith("~") && !value.startsWith("@") && !value.startsWith("between:") && !value.startsWith("not_in:"));

  const resolveExecutionDescriptor = async (req: Request, res: Response, entityCode: string) => {
    const context = requireVerifiedContext(req, res);
    const locals = res.locals as Record<string, unknown>;
    const memo = (locals["executionDescriptorMemo"] ??= new Map()) as Map<string, Promise<Awaited<ReturnType<ExecutionDescriptorProvider["get"]>>>>;
    return deps.executionDescriptorProvider!.get({ plane: context.planeKey, tenantId: context.tenantId, entityCode }, memo);
  };
  const aggregateBoundaryHandlers = new Map<
    string,
    (command: AggregateMutationCommand) => Promise<MutationResult>
  >();
  const entityMutationService = createEntityMutationService({
    db,
    ...(deps.executionDescriptorProvider ? { executionDescriptorProvider: deps.executionDescriptorProvider } : {}),
    logger,
    handlers: { aggregateBoundary: aggregateBoundaryHandlers },
    enrichAfterCommit: async ({ entityCode, tenantId, record }) =>
      await enrichSingleReferenceLabels(db, { entityCode, tenantId, row: record }) ?? record,
  });
  const entityDescriptorRepository = new KyselyEntityDescriptorRepository(db, deps.executionDescriptorProvider);

  const referenceLabelsResolveHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_REQUIRED" });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const raw = Array.isArray(body["references"]) ? body["references"] : [];
      if (raw.length === 0 || raw.length > 100) {
        res.status(422).json({ error: "INVALID_REFERENCE_BATCH", message: "Provide 1 to 100 references." });
        return;
      }

      const references = raw.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const key = typeof row["key"] === "string" ? row["key"] : "";
        const entity = typeof row["entity"] === "string" ? row["entity"].replace(/-/g, "_") : "";
        const value = typeof row["value"] === "string" ? row["value"] : "";
        const valueField = typeof row["valueField"] === "string" ? row["valueField"] : "id";
        const labelField = typeof row["labelField"] === "string" ? row["labelField"] : "name";
        const codeField = typeof row["codeField"] === "string" ? row["codeField"] : "code";
        return key && entity && value ? [{ key, entity, value, valueField, labelField, codeField }] : [];
      });
      if (references.length !== raw.length) {
        res.status(422).json({ error: "INVALID_REFERENCE" });
        return;
      }

      const results: Array<{ key: string; value: string; label: string | null; code: string | null }> = [];
      for (const reference of references) {
        const declared = await sql<{ ok: boolean }>`
          SELECT true AS ok
            FROM control.entity_field ef
            JOIN control.entity_version ev ON ev.id = ef.entity_version_id
            JOIN control.entity e ON e.id = ev.entity_id
           WHERE ev.status = 'EFFECTIVE'
             AND ef.is_active = true
             AND COALESCE(ef.reference_config->>'target_entity', ef.reference_config->>'ref_entity', ef.validation->>'ref_entity') = ${reference.entity}
             AND COALESCE(ef.reference_config->>'target_field', ef.reference_config->>'value_field', 'id') = ${reference.valueField}
             AND COALESCE(ef.reference_config->>'label_field', ef.reference_config->>'display_field', 'name') = ${reference.labelField}
             AND COALESCE(ef.reference_config->>'code_field', ef.reference_config->'picker'->>'code_field', 'code') = ${reference.codeField}
           LIMIT 1
        `.execute(db);
        if (!declared.rows[0]?.ok) {
          results.push({ key: reference.key, value: reference.value, label: null, code: null });
          continue;
        }
        const target = await resolveTargetTable(db, reference.entity);
        if (!target) {
          results.push({ key: reference.key, value: reference.value, label: null, code: null });
          continue;
        }
        const spec: ReferenceFieldSpec = {
          fieldName: reference.key,
          columnName: reference.key,
          targetEntity: reference.entity,
          targetField: reference.valueField,
          labelField: reference.labelField,
          codeField: reference.codeField,
          descriptionField: null,
        };
        const labels = await fetchTargetLabels(db, target, spec, [reference.value], tenantId);
        const resolved = labels.get(reference.value);
        results.push({
          key: reference.key,
          value: reference.value,
          label: resolved?.label ?? null,
          code: resolved?.code ?? null,
        });
      }
      res.json({ data: results });
    } catch (err) {
      logger?.error("reference_labels_resolve_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ Phase 11 #2: record-level pub/sub for the edit-during-status-change
  // recovery flow. Channel format mirrors the collab activity SSE so a
  // single Redis instance can host both topics without collision.
  const recordChannel = (tenantId: string, entityCode: string, recordId: string): string =>
    `record:${tenantId}:${entityCode}:${recordId}`;

  /** PUBLISH a record event to all SSE subscribers of this record. Fire-and-forget. */
  const publishRecordEvent = (
    tenantId: string,
    entityCode: string,
    recordId: string,
    eventType: "record.statusChanged" | "record.deleted",
    data: Record<string, unknown>,
    createdAt: string,
  ): void => {
    if (!redis) return;
    const ch = recordChannel(tenantId, entityCode, recordId);
    redis.publish(ch, JSON.stringify({ eventType, createdAt, data })).catch((err: unknown) => {
      logger?.error("records_pubsub_publish_error", { err: String(err), entity: entityCode, recordId });
    });
  };

  function normalizeDefaultProcurementLineUom(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK;
    if (trimmed.toLowerCase() === "each") return DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK;
    return trimmed.toUpperCase();
  }

  async function resolveDefaultProcurementLineUom(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    tenantId: string | null,
  ): Promise<string> {
    const snapshot = tenantId && cache
      ? await resolveParameterSnapshot(kysely, cache, tenantId, "finance.ap").catch(() => null)
      : null;
    return normalizeDefaultProcurementLineUom(
      getStringParam(snapshot, DEFAULT_PROCUREMENT_LINE_UOM_PARAMETER_CODE, DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK),
    );
  }

  // â”€â”€ LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // Query params (canonical â€” matches EntityListQueryState URL serialization):
  //   ?page=<n>          current page (1-based, default 1)
  //   ?page_size=<n>     records per page (default 20, max 500; picker_tree can raise this)
  //   ?q=<term>          free-text ILIKE search on is_searchable fields
  //   ?filter.<field>=<sigil>   per-field operator filter (preferred)
  //   ?filters=<json>    legacy JSON map (deprecated, still accepted)
  //   ?sort=<field>:<dir>  field = logical field name; dir = asc | desc
  //   ?facets=cheap|all  return value-count map for enum/boolean fields
  //
  const invalidateListCachesForEntity = async (
    tenantId:   string,
    entityCode: string,
    table?:     EntityTableInfo,
  ): Promise<void> => {
    await invalidateEntityListCache(cache, tenantId, entityCode);
    const listEntityCode = table ? configuredListEntityCode(table) : null;
    if (listEntityCode && listEntityCode !== entityCode) {
      await invalidateEntityListCache(cache, tenantId, listEntityCode);
    }
  };

  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);
      const { tenantId, principalId } = verifiedContext;
      const roles = readVerifiedRoleCodes(res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      if (shouldUseEntityQuery(req, entityCode)) {
        const resolved = await resolveExecutionDescriptor(req, res, entityCode);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query["page_size"] ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
        const result = await entityQueryService!.list({
          context: verifiedContext,
          descriptor: resolved.descriptor,
          generation: resolved.generation,
          limit: pageSize,
          cursor: typeof req.query["cursor"] === "string" ? req.query["cursor"] : undefined,
          filters: parseEntityQueryFilters(req.query),
          sort: parseEntityQuerySort(req.query["sort"]),
          search: typeof req.query["q"] === "string" ? req.query["q"] : undefined,
          countMode: parseEntityCountMode(req.query["count_mode"]),
        });
        res.setHeader("X-Entity-Query", "v1");
        res.setHeader("X-Descriptor-Hash", resolved.descriptor.identity.compiledHash);
        res.setHeader("X-Descriptor-Cache", resolved.cacheState);
        res.json(result);
        return;
      }
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const page          = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
      const rawPageSize   = parseInt(String(req.query["page_size"] ?? "0"), 10) || 0;
      const pickerTreeMode = ["1", "true", "yes"].includes(String(req.query["picker_tree"] ?? "").toLowerCase());

      const searchTerm = typeof req.query["q"] === "string" && req.query["q"].trim()
        ? req.query["q"].trim()
        : null;

      // Resolve tenant + fiscal context BEFORE sigil parsing so `@this_week` etc.
      // respect the caller's company-code timezone + fiscal calendar instead of
      // UTC/Mon/calendar-year defaults. `resolveActiveFiscalContext` is per-request
      // memoised â€” future callers within this handler share the same lookup.
      const fiscalCtx = await resolveActiveFiscalContext(req, { db, tenantId, principalId, logger });

      // â”€â”€ Parse filter params: prefer filter.<field>=<sigil>; fall back to ?filters=<JSON> â”€â”€
      // Async so `@this_period` / `@last_period` can hit master.fiscal_period.
      // Other sigils are sync â€” the wrapper delegates to parseServerFilterSigil.
      const sigilFilters: Record<string, ServerFilterOp> = {};
      if (tenantId) {
        for (const [key, val] of Object.entries(req.query)) {
          if (key.startsWith("filter.") && typeof val === "string" && val) {
            const field = key.slice("filter.".length);
            if (field) {
              sigilFilters[field] = await parseServerFilterSigilAsync(
                req, val, fiscalCtx, { db, tenantId, logger },
              );
            }
          }
        }
      } else {
        for (const [key, val] of Object.entries(req.query)) {
          if (key.startsWith("filter.") && typeof val === "string" && val) {
            const field = key.slice("filter.".length);
            if (field) sigilFilters[field] = parseServerFilterSigil(val, fiscalCtx);
          }
        }
      }
      // Legacy fallback â€” parse ?filters=<JSON> if no sigil params were found
      const legacyFilters: Record<string, unknown> = {};
      if (Object.keys(sigilFilters).length === 0 && typeof req.query["filters"] === "string") {
        try {
          Object.assign(legacyFilters, JSON.parse(req.query["filters"]) as Record<string, unknown>);
        } catch { /* ignore malformed */ }
      }

      // Sort â€” "field:dir[,field:dir:nfirst,...]"  nfirst = NULLS FIRST; default = NULLS LAST
      const sortRaw = typeof req.query["sort"] === "string" ? req.query["sort"].trim() : null;
      type SortEntry = { fieldName: string; dir: "asc" | "desc"; nulls: "first" | "last" };
      const sortEntries: SortEntry[] = [];
      if (sortRaw) {
        for (const token of sortRaw.split(",")) {
          const parts = token.trim().split(":");
          if (parts.length < 2 || !parts[0]) continue;
          sortEntries.push({
            fieldName: parts[0],
            dir:       parts[1] === "desc" ? "desc" : "asc",
            nulls:     parts[2] === "nfirst" ? "first" : "last",
          });
        }
      }
      // Legacy compat â€” expose primary sort for computed-field check below
      const sortFieldName = sortEntries[0]?.fieldName ?? null;

      const facetsParam = typeof req.query["facets"] === "string" ? req.query["facets"] : null;
      const includeFacets = facetsParam === "cheap" || facetsParam === "all";

      const groupParam = typeof req.query["group"] === "string" && req.query["group"].trim()
        ? req.query["group"].trim()
        : null;

      // â”€â”€ Index table redirect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // If identity_config.list_entity_code is set, list queries run against the
      // denormalized index table (e.g. supplier_app_index) instead of the thin
      // role table.  Identity + role fields are co-located in the index for fast
      // list/search.  The canonical table is still used for detail GET and writes.
      const listEntityCode = configuredListEntityCode(table) ?? undefined;
      const listTable      = listEntityCode ? (await resolveEntityTable(db, listEntityCode) ?? table) : table;
      let   fullTable      = `${listTable.table_schema}.${listTable.table_name}` as `${string}.${string}`;
      const listCode       = listTable !== table ? listEntityCode! : entityCode;

      const [paginationSnap, searchSnap, listSnap] = tenantId && cache
        ? await Promise.all([
            resolveParameterSnapshot(db, cache, tenantId, "api.pagination").catch(() => null),
            resolveParameterSnapshot(db, cache, tenantId, "api.search").catch(() => null),
            resolveParameterSnapshot(db, cache, tenantId, "api.list").catch(() => null),
          ])
        : [null, null, null] as const;
      const defaultPageSize = getIntParam(paginationSnap, "api.pagination.default_page_size", DEFAULT_PAGE_SIZE);
      const defaultSearchMinQueryLength = getIntParam(searchSnap, "api.search.min_query_length", 2);
      const listPageCacheTtlSeconds = getIntParam(listSnap, "api.list.redis_page_cache_ttl_seconds", 45);
      const listCountCacheTtlSeconds = getIntParam(listSnap, "api.list.redis_count_cache_ttl_seconds", 120);
      const maxPageSize = Math.min(
        MAX_PAGE_SIZE,
        getIntParam(paginationSnap, "api.pagination.max_page_size", MAX_PAGE_SIZE),
      );
      const pickerTreeMinPageSize = getIntParam(
        paginationSnap,
        "api.pagination.picker_tree_min_page_size",
        500,
      );
      const effectiveMaxPageSize = pickerTreeMode
        ? Math.max(maxPageSize, Math.min(MAX_PAGE_SIZE, Math.max(500, pickerTreeMinPageSize)))
        : maxPageSize;
      const requestedPageSize = pickerTreeMode
        ? Math.max(rawPageSize || defaultPageSize, 500)
        : rawPageSize || defaultPageSize;
      const pageSize = Math.min(effectiveMaxPageSize, Math.max(1, requestedPageSize));
      const offset   = (page - 1) * pageSize;

      let fieldMap = await resolveFieldMap(db, listCode);

      // â”€â”€ F5: resolve field metadata + display_config for sort fallback â”€â”€â”€â”€â”€â”€â”€â”€
      // Uses listCode so that fieldMeta columns + sort defaults match the index table.
      let [fieldMeta, entityVersionRow, physicalColumns] = await Promise.all([
        db
          .selectFrom("control.entity_field as ef")
          .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
          .innerJoin("control.entity as e",          "e.id",  "ev.entity_id")
          .select(["ef.name", "ef.column_name", "ef.is_computed", "ef.is_searchable", "ef.data_type", "ef.reference_config"])
          .where("e.name",       "=",  listCode)
          .where("e.tenant_id",  "is", null)
          .where("ev.status",    "=",  "EFFECTIVE")
          .where("ef.is_active", "=",  true)
          .execute() as Promise<{ name: string; column_name: string; is_computed: boolean; is_searchable: boolean; data_type: string; reference_config: Record<string, unknown> | null }[]>,
        db
          .selectFrom("control.entity_version as ev")
          .innerJoin("control.entity as e", "e.id", "ev.entity_id")
          .select(["e.id as entity_id", "e.display_config", "e.search_config", "ev.version_no", "ev.version_hash"])
          .where("e.name",      "=", listCode)
          .where("e.tenant_id", "is", null)
          .where("ev.status",   "=", "EFFECTIVE")
          .executeTakeFirst() as Promise<{
            entity_id: string;
            display_config: Record<string, unknown> | null;
            search_config: Record<string, unknown> | null;
            version_no: number | null;
            version_hash: string | null;
          } | undefined>,
        db
          .selectFrom("information_schema.columns as c")
          .select(["c.column_name"])
          .where("c.table_schema", "=", listTable.table_schema)
          .where("c.table_name", "=", listTable.table_name)
          .execute() as Promise<{ column_name: string }[]>,
      ]);

      const computedFieldNames = new Set(fieldMeta.filter((f) => f.is_computed).map((f) => f.name));
      const metadataColumnNames = new Set(fieldMeta.map((f) => f.column_name));
      const physicalColumnNames = new Set(physicalColumns.map((f) => f.column_name));
      const queryableColumnNames = physicalColumnNames.size > 0 ? physicalColumnNames : metadataColumnNames;
      const hasTenantColumn = queryableColumnNames.has("tenant_id");

      // Reject attempts to filter/sort on computed fields â€” with one
      // narrow carve-out. Presence-only ops (is_null / is_not_null)
      // never reveal a computed value; they only test whether the
      // column is set. Allowing them on computed columns lets the
      // document-runtime binding registry exclude rows by emptiness
      // (e.g. `filter.superseded_by_id=null` for the active-only PC
      // slice) without compromising the audit boundary the
      // `is_computed` flag was protecting.
      const isPresenceOnly = (op: ServerFilterOp): boolean =>
        op.type === "is_null" || op.type === "is_not_null";
      const computedFilterKeys = Object.keys(sigilFilters)
        .filter((f) => computedFieldNames.has(f) && !isPresenceOnly(sigilFilters[f]!));
      const computedSortKeys   = sortEntries.filter((e) => computedFieldNames.has(e.fieldName)).map((e) => e.fieldName);
      if (computedFilterKeys.length > 0 || computedSortKeys.length > 0) {
        res.status(422).json({
          error:   "COMPUTED_FIELD_NOT_QUERYABLE",
          message: "Computed fields cannot be used in filters or sort",
          fields:  [...computedFilterKeys, ...computedSortKeys],
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let listQuery: any  = db.selectFrom(fullTable).selectAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let countQuery: any = db.selectFrom(fullTable).select(db.fn.countAll<string>().as("count"));

      // Group counts query â€” parallel COUNT(*) GROUP BY when ?group= is provided.
      // Validated: field must exist in fieldMap and must not be computed.
      const groupCol = groupParam && !computedFieldNames.has(groupParam)
        ? (fieldMap.get(groupParam) ?? (metadataColumnNames.has(groupParam) ? groupParam : null))
        : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let groupCountQuery: any = groupCol && queryableColumnNames.has(groupCol)
        ? db.selectFrom(fullTable).select([
            sql.raw(`COALESCE("${groupCol}"::text, '__null__') AS group_value`) as never,
            db.fn.countAll<string>().as("count"),
          ]).groupBy(sql.raw(`COALESCE("${groupCol}"::text, '__null__')`) as never)
        : null;

      if (tenantId && hasTenantColumn) {
        const includeSystemConditionTypes =
          listCode === "condition_type"
          && queryableColumnNames.has("is_system");

        if (includeSystemConditionTypes) {
          const tenantOrSystemConditionType = sql<boolean>`
            (
              tenant_id = ${tenantId}::uuid
              OR (tenant_id IS NULL AND is_system = true)
            )
          `;
          listQuery  = listQuery.where(tenantOrSystemConditionType as never);
          countQuery = countQuery.where(tenantOrSystemConditionType as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(tenantOrSystemConditionType as never);
        } else {
          listQuery  = listQuery.where("tenant_id"  as never, "=", tenantId as never);
          countQuery = countQuery.where("tenant_id" as never, "=", tenantId as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where("tenant_id" as never, "=", tenantId as never);
        }
      }

      if (queryableColumnNames.has("is_provisional") && req.query["include_provisional"] !== "true") {
        const hideProvisional = sql<boolean>`COALESCE(is_provisional, false) = false`;
        listQuery  = listQuery.where(hideProvisional as never);
        countQuery = countQuery.where(hideProvisional as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where(hideProvisional as never);
      }

      // â”€â”€ Org-context scope: Legal Entity / Company Code â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // The relay injects X-Org-Context-Type / X-Organization-ID / X-Legal-Entity-ID
      // from the user's active session. We enforce the org boundary here so the
      // generic relay list path applies the same scope as the RSC/BFF helper path.
      //
      // User-supplied company_code_id filters are AND-ed with the scope, never broadened.
      // Enforcement runs before field filters so scope cannot be bypassed by URL params.
      {
        const orgContextType = verifiedContext.companyCodeId
          ? "company_code"
          : verifiedContext.legalEntityId || verifiedContext.organizationId
            ? "legal_entity"
            : "";
        const orgId = verifiedContext.companyCodeId
          ?? verifiedContext.organizationId
          ?? verifiedContext.legalEntityId
          ?? "";
        const legalEntityId = verifiedContext.legalEntityId ?? "";
        const purchaseInvoiceIdFilter = singleStringFilterValue(sigilFilters["purchase_invoice_id"]);

        // Helper: apply a scope predicate to list + count + group-count in one call
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyWhere = (col: string, op: "=" | "in", value: string | string[]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const add = (q: any) => q.where(col as never, op as never, value as never);
          listQuery  = add(listQuery);
          countQuery = add(countQuery);
          if (groupCountQuery) groupCountQuery = add(groupCountQuery);
        };
        const applyPredicate = (predicate: ReturnType<typeof sql<boolean>>) => {
          listQuery  = listQuery.where(predicate as never);
          countQuery = countQuery.where(predicate as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(predicate as never);
        };
        const applyEmpty = () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const add = (q: any) => q.where(sql<boolean>`false` as never);
          listQuery  = add(listQuery);
          countQuery = add(countQuery);
          if (groupCountQuery) groupCountQuery = add(groupCountQuery);
        };

        const entityFieldNames = new Set(fieldMeta.map((f) => f.name));
        const parentPurchaseInvoiceScopeApplies =
          listCode === "purchase_invoice_line"
          && purchaseInvoiceIdFilter !== null;

        if (tenantId && orgContextType === "company_code" && orgId) {
          // Active org context is a specific company code.
          if (listCode === "legal_entity") {
            // Reverse lookup: show only the LE that owns this company code.
            const leRows = await sql<{ legal_entity_id: string }>`
              SELECT legal_entity_id FROM master.company_code
              WHERE tenant_id = ${tenantId}::uuid AND id = ${orgId}::uuid
            `.execute(db);
            const leIds = leRows.rows.map((r) => r.legal_entity_id).filter(Boolean);
            leIds.length > 0 ? applyWhere("id", "in", leIds) : applyEmpty();
          } else if (listCode === "company_code") {
            applyWhere("id", "in", [orgId]);
          } else if (entityFieldNames.has("legal_entity_id")) {
            // Resolve LE for this company code, then scope by legal_entity_id.
            const leRows = await sql<{ legal_entity_id: string }>`
              SELECT legal_entity_id FROM master.company_code
              WHERE tenant_id = ${tenantId}::uuid AND id = ${orgId}::uuid
            `.execute(db);
            const leIds = leRows.rows.map((r) => r.legal_entity_id).filter(Boolean);
            const leCol = fieldMap.get("legal_entity_id") ?? "legal_entity_id";
            if (leIds.length > 0 && queryableColumnNames.has(leCol)) {
              applyWhere(leCol, "in", leIds);
            }
          } else if (parentPurchaseInvoiceScopeApplies) {
            applyPredicate(sql<boolean>`purchase_invoice_id IN (
              SELECT id
                FROM document.purchase_invoice
               WHERE tenant_id = ${tenantId}::uuid
                 AND id = ${purchaseInvoiceIdFilter}::uuid
                 AND company_code_id = ${orgId}::uuid
            )`);
          } else if (entityFieldNames.has("company_code_id")) {
            const ccCol = fieldMap.get("company_code_id") ?? "company_code_id";
            if (queryableColumnNames.has(ccCol)) applyWhere(ccCol, "in", [orgId]);
          } else if (entityFieldNames.has("site_id")) {
            // Multi-hop: company_code â†’ sites â†’ site_id
            const siteRows = await sql<{ id: string }>`
              SELECT id FROM master.site
              WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${orgId}::uuid
            `.execute(db);
            const siteIds = siteRows.rows.map((r) => r.id).filter(Boolean);
            const siteCol = fieldMap.get("site_id") ?? "site_id";
            if (siteIds.length === 0) {
              applyEmpty();
            } else if (queryableColumnNames.has(siteCol)) {
              applyWhere(siteCol, "in", siteIds);
            }
          }
        }

        if (tenantId && orgContextType === "legal_entity" && legalEntityId) {
          // Active org context is a legal entity â€” scope to its subtree.
          if (listCode === "legal_entity") {
            applyWhere("id", "=", legalEntityId);
          } else if (listCode === "company_code" || entityFieldNames.has("legal_entity_id")) {
            const leCol = fieldMap.get("legal_entity_id") ?? "legal_entity_id";
            if (queryableColumnNames.has(leCol)) {
              applyWhere(leCol, "=", legalEntityId);
            }
          } else if (parentPurchaseInvoiceScopeApplies) {
            applyPredicate(sql<boolean>`purchase_invoice_id IN (
              SELECT pi.id
                FROM document.purchase_invoice pi
                JOIN master.company_code cc
                  ON cc.tenant_id = pi.tenant_id
                 AND cc.id = pi.company_code_id
               WHERE pi.tenant_id = ${tenantId}::uuid
                 AND pi.id = ${purchaseInvoiceIdFilter}::uuid
                 AND cc.legal_entity_id = ${legalEntityId}::uuid
            )`);
          } else if (entityFieldNames.has("company_code_id")) {
            // Resolve company codes for this legal entity, then scope by company_code_id.
            const ccRows = await sql<{ id: string }>`
              SELECT id FROM master.company_code
              WHERE tenant_id = ${tenantId}::uuid AND legal_entity_id = ${legalEntityId}::uuid
            `.execute(db);
            const ccIds = ccRows.rows.map((r) => r.id).filter(Boolean);
            if (ccIds.length === 0) {
              applyEmpty();
            } else {
              const ccCol = fieldMap.get("company_code_id") ?? "company_code_id";
              if (queryableColumnNames.has(ccCol)) applyWhere(ccCol, "in", ccIds);
            }
          } else if (entityFieldNames.has("site_id")) {
            // Two-hop: legal_entity â†’ company_codes â†’ sites â†’ site_id
            const siteRows = await sql<{ id: string }>`
              SELECT id FROM master.site
              WHERE tenant_id = ${tenantId}::uuid
                AND company_code_id IN (
                  SELECT id FROM master.company_code
                  WHERE tenant_id = ${tenantId}::uuid AND legal_entity_id = ${legalEntityId}::uuid
                )
            `.execute(db);
            const siteIds = siteRows.rows.map((r) => r.id).filter(Boolean);
            const siteCol = fieldMap.get("site_id") ?? "site_id";
            if (siteIds.length === 0) {
              applyEmpty();
            } else if (queryableColumnNames.has(siteCol)) {
              applyWhere(siteCol, "in", siteIds);
            }
          }
        }
      }

      // â”€â”€ Parent FK filter for child entities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // ?parent_id=<uuid> narrows results to records belonging to that parent.
      // Uses identity_config.parent.field to resolve the physical FK column.
      // identity_config.parent.scope ("col=val") adds any extra discriminator.
      // Virtual quick filters are configured in entity.display_config.filter_bar.
      // Handle generic __ keys here, then remove them before normal field filters.
      const virtualFilterKeys = Object.keys(sigilFilters).filter((field) => field.startsWith("__"));
      if (virtualFilterKeys.length > 0) {
        if (sigilFilters["__bookmarked"]) {
          if (tenantId && principalId) {
            const recordIdRef = sql.ref(`${listTable.table_name}.id`);
            const bookmarkedPredicate = sql<boolean>`exists (
              select 1
              from master.record_bookmark rb
              where rb.tenant_id = ${tenantId}::uuid
                and rb.principal_id = ${principalId}::uuid
                and rb.entity_code = ${entityCode}
                and rb.record_id = ${recordIdRef}
            )`;
            listQuery = listQuery.where(bookmarkedPredicate as never);
            countQuery = countQuery.where(bookmarkedPredicate as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(bookmarkedPredicate as never);
          } else {
            listQuery = listQuery.where(sql<boolean>`false` as never);
            countQuery = countQuery.where(sql<boolean>`false` as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(sql<boolean>`false` as never);
          }
          delete sigilFilters["__bookmarked"];
        }

        if (sigilFilters["__created_by"]) {
          const createdByCol = fieldMap.get("created_by") ?? "created_by";
          if (createdByCol && principalId) {
            listQuery = listQuery.where(createdByCol as never, "=" as never, principalId as never);
            countQuery = countQuery.where(createdByCol as never, "=" as never, principalId as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(createdByCol as never, "=" as never, principalId as never);
          } else {
            listQuery = listQuery.where(sql<boolean>`false` as never);
            countQuery = countQuery.where(sql<boolean>`false` as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(sql<boolean>`false` as never);
          }
          delete sigilFilters["__created_by"];
        }
      }

      const parentIdParam     = typeof req.query["parent_id"]     === "string" ? req.query["parent_id"]     : null;
      const parentFkCol       = configuredParentFk(table);
      const throughEntityCode = typeof req.query["through_entity"] === "string" ? req.query["through_entity"] : null;
      const parentScope       = parseFeatureScope(configuredParentScope(table));

      if (parentIdParam && parentFkCol) {
        if (throughEntityCode) {
          // â”€â”€ Two-hop: child.parentFkCol IN (SELECT id FROM throughTable WHERE throughParentFk = parentId) â”€â”€
          // All metadata (through table schema/name, through parent FK) is resolved from
          // control.entity at runtime â€” nothing entity-specific is hardcoded here.
          const throughMeta = await db
            .selectFrom("control.entity as e")
            .select(["e.table_schema", "e.table_name", "e.identity_config", "e.feature_flags"])
            .where("e.entity_code", "=", throughEntityCode)
            .where("e.tenant_id",   "is", null)
            .executeTakeFirst() as { table_schema: string; table_name: string; identity_config: unknown; feature_flags: unknown } | undefined;

          if (throughMeta) {
            const throughParentFk = parentFkFromConfigs(
              asPlainObject(throughMeta.identity_config),
              asPlainObject(throughMeta.feature_flags),
            );
            if (throughParentFk) {
              const throughTable = `${throughMeta.table_schema}.${throughMeta.table_name}`;
              const inPredicate = tenantId
                ? sql<boolean>`${sql.ref(parentFkCol)} IN (SELECT id FROM ${sql.raw(throughTable)} WHERE ${sql.raw(throughParentFk)} = ${parentIdParam}::uuid AND tenant_id = ${tenantId}::uuid)`
                : sql<boolean>`${sql.ref(parentFkCol)} IN (SELECT id FROM ${sql.raw(throughTable)} WHERE ${sql.raw(throughParentFk)} = ${parentIdParam}::uuid)`;
              listQuery  = listQuery.where(inPredicate  as never);
              countQuery = countQuery.where(inPredicate as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where(inPredicate as never);
            }
          }

          // Apply the entity's own parent_scope (e.g. owner_type=supplier) â€” driven by
          // the entity registry, never overridden when using through_entity.
          if (parentScope && queryableColumnNames.has(parentScope.column)) {
            listQuery  = listQuery.where(parentScope.column  as never, "=", parentScope.value as never);
            countQuery = countQuery.where(parentScope.column as never, "=", parentScope.value as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentScope.column as never, "=", parentScope.value as never);
          }
        } else {
          // â”€â”€ Direct parent filter â€” existing logic unchanged â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          listQuery  = listQuery.where(parentFkCol  as never, "=", parentIdParam as never);
          countQuery = countQuery.where(parentFkCol as never, "=", parentIdParam as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentFkCol as never, "=", parentIdParam as never);
          if (parentScope && queryableColumnNames.has(parentScope.column)) {
            // Allow caller to override the entity's default parent_scope value via
            // ?{col}_filter=X (e.g. ?owner_type_filter=business_partner). This lets
            // polymorphic tables be queried from detail tabs without a separate
            // entity registration for each owner kind.
            const overrideKey = `${parentScope.column}_filter`;
            const scopeVal = (typeof req.query[overrideKey] === "string" ? req.query[overrideKey] : null)
              ?? parentScope.value;
            listQuery  = listQuery.where(parentScope.column  as never, "=", scopeVal as never);
            countQuery = countQuery.where(parentScope.column as never, "=", scopeVal as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentScope.column as never, "=", scopeVal as never);
          }
        }
      }

      // Apply registry discriminator scope even for top-level list requests.
      // Polymorphic backing tables share rows across owner/party types; without
      // this guard, a business_partner_* entity can list supplier/customer/LE
      // rows when no parent_id is provided.
      if (!parentIdParam && parentScope && queryableColumnNames.has(parentScope.column)) {
        listQuery  = listQuery.where(parentScope.column  as never, "=", parentScope.value as never);
        countQuery = countQuery.where(parentScope.column as never, "=", parentScope.value as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentScope.column as never, "=", parentScope.value as never);
      }

      // Owner-type scope for exposed polymorphic relation tables.
      const requiresOwnerTypeScope = listTable.feature_flags["requires_owner_type_scope"] === true
        || (
          listTable.table_schema === "master"
          && (listTable.table_name === "bank_account_link" || listTable.table_name === "commodity_classification")
        );
      if (requiresOwnerTypeScope) {
        const ownerTypeColumn = typeof listTable.feature_flags["owner_type_column"] === "string"
          ? listTable.feature_flags["owner_type_column"]
          : "owner_type";

        if (!queryableColumnNames.has(ownerTypeColumn)) {
          res.status(500).json({
            error: "ENTITY_SCOPE_MISCONFIGURED",
            message: `Entity '${listCode}' requires owner_type scoping but '${ownerTypeColumn}' is not queryable`,
          });
          return;
        }

        const queryOwnerType = singleStringQueryParam(req.query[`${ownerTypeColumn}_filter`])
          ?? singleStringQueryParam(req.query[ownerTypeColumn]);
        const sigilOwnerType = singleStringFilterValue(sigilFilters[ownerTypeColumn]);
        const legacyOwnerType = singleStringLegacyFilterValue(legacyFilters[ownerTypeColumn]);
        const hasInvalidOwnerTypeFilter =
          (!!sigilFilters[ownerTypeColumn] && !sigilOwnerType)
          || (Object.prototype.hasOwnProperty.call(legacyFilters, ownerTypeColumn) && !legacyOwnerType);

        if (hasInvalidOwnerTypeFilter) {
          res.status(400).json({
            error: "OWNER_TYPE_SCOPE_REQUIRED",
            message: `${listCode} requires exactly one ${ownerTypeColumn} filter`,
          });
          return;
        }

        const ownerTypeValues = [queryOwnerType, sigilOwnerType, legacyOwnerType]
          .filter((value): value is string => typeof value === "string" && value.length > 0);
        const uniqueOwnerTypes = new Set(ownerTypeValues);
        if (uniqueOwnerTypes.size > 1) {
          res.status(400).json({
            error: "OWNER_TYPE_SCOPE_CONFLICT",
            message: `${listCode} received conflicting ${ownerTypeColumn} filters`,
          });
          return;
        }

        const defaultOwnerType = singleStringQueryParam(listTable.feature_flags["default_owner_type_scope"])
          ?? singleStringQueryParam(listTable.feature_flags["default_owner_type"]);
        const ownerType = ownerTypeValues[0] ?? defaultOwnerType ?? null;
        if (!ownerType) {
          res.status(400).json({
            error: "OWNER_TYPE_SCOPE_REQUIRED",
            message: `${listCode} requires ${ownerTypeColumn}_filter or filter.${ownerTypeColumn}`,
          });
          return;
        }

        listQuery  = listQuery.where(ownerTypeColumn  as never, "=", ownerType as never);
        countQuery = countQuery.where(ownerTypeColumn as never, "=", ownerType as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where(ownerTypeColumn as never, "=", ownerType as never);
        delete sigilFilters[ownerTypeColumn];
        delete legacyFilters[ownerTypeColumn];
      }

      // Apply company-code ACL filtering after all explicit entity filters.
      if (entityCode === "company_code" && tenantId) {
        if (principalId) {
          const scope = await createCompanyCodeScopeService(db).resolveScope(principalId, tenantId);
          if (!scope.isUnrestricted) {
            if (scope.companyCodeIds.length === 0) {
              listQuery  = listQuery.where(sql<boolean>`false` as never);
              countQuery = countQuery.where(sql<boolean>`false` as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where(sql<boolean>`false` as never);
            } else {
              listQuery  = listQuery.where("id"  as never, "in", scope.companyCodeIds as never);
              countQuery = countQuery.where("id" as never, "in", scope.companyCodeIds as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where("id" as never, "in", scope.companyCodeIds as never);
            }
          }
        }
      }

      // Virtual GL-account picker filter. Reporting taxonomy leaves are rollup
      // targets, not journal-postable accounts, even when node_type='posting'.
      if (listCode === "gl_account") {
        const postingAllowedFilter =
          booleanFilterValue(legacyFilters["posting_allowed"])
          ?? booleanFilterOpValue(sigilFilters["posting_allowed"]);

        if (postingAllowedFilter !== null) {
          const predicate = postingAllowedFilter
            ? sql<boolean>`node_type = 'posting' AND COALESCE((metadata->>'_journal_postable')::boolean, true) = true`
            : sql<boolean>`(node_type <> 'posting' OR COALESCE((metadata->>'_journal_postable')::boolean, true) = false)`;

          listQuery = listQuery.where(predicate as never);
          countQuery = countQuery.where(predicate as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(predicate as never);

          delete legacyFilters["posting_allowed"];
          delete sigilFilters["posting_allowed"];
        }
      }

      // â”€â”€ Sigil-based filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyOp = (q: any, col: never, op: ServerFilterOp): any => {
        switch (op.type) {
          case "in":
            return op.values.length === 0
              ? q.where(sql<boolean>`false` as never)
              : q.where(col, "in", op.values as never);
          case "not_in":   return q.where(col, "not in", op.values as never);
          case "gt":       return q.where(col, ">",       op.value as never);
          case "lt":       return q.where(col, "<",       op.value as never);
          case "gte":      return q.where(col, ">=",      op.value as never);
          case "lte":      return q.where(col, "<=",      op.value as never);
          case "between":  return q.where(col, ">=", op.lo as never).where(col, "<=", op.hi as never);
          case "is_null":  return q.where(col, "is",     null as never);
          case "is_not_null": return q.where(col, "is not", null as never);
          case "ilike":    return q.where(col, "ilike",  `%${op.value}%` as never);
          case "range":    return q.where(col, ">=", op.from as never).where(col, "<", op.to as never);
          default:         return q;
        }
      };

      for (const [fieldName, op] of Object.entries(sigilFilters)) {
        if (fieldName.startsWith("_")) continue;
        const colName = fieldMap.get(fieldName) ?? fieldName;
        if (!queryableColumnNames.has(colName)) continue;
        const col = colName as never;
        listQuery  = applyOp(listQuery,  col, op);
        countQuery = applyOp(countQuery, col, op);
        if (groupCountQuery) groupCountQuery = applyOp(groupCountQuery, col, op);
      }

      // â”€â”€ Legacy JSON filters (backward compat) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      for (const [fieldName, value] of Object.entries(legacyFilters)) {
        if (value === undefined || value === null || fieldName.startsWith("_")) continue;
        const colName = fieldMap.get(fieldName) ?? fieldName;
        if (!queryableColumnNames.has(colName)) continue;
        const col = colName as never;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyLegacy = (q: any) => {
          if (Array.isArray(value) && value.length > 0) return q.where(col, "in", value as never);
          if (Array.isArray(value) && value.length === 0) return q.where(sql<boolean>`false` as never);
          return q.where(col, "=", value as never);
        };
        listQuery  = applyLegacy(listQuery);
        countQuery = applyLegacy(countQuery);
        if (groupCountQuery) groupCountQuery = applyLegacy(groupCountQuery);
      }

      // â”€â”€ F1: fail-closed search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // When a search term is provided but the entity has no searchable fields,
      // return empty results with a reasons flag rather than silently returning all rows.
      const reasons: Record<string, boolean> = {};
      if (searchTerm) {
        const searchConfig = normalizeEntitySearchConfig(entityVersionRow?.search_config, defaultSearchMinQueryLength);

        if (!searchConfig.enabled) {
          reasons["search_disabled"] = true;
          res.json({
            data: [],
            pagination: { total: 0, page, page_size: pageSize, total_pages: 0 },
            reasons,
          });
          return;
        }

        if (searchTerm.length < searchConfig.minQueryLength) {
          reasons["search_min_query_length"] = true;
        } else {
        const configuredSearchFields = new Set(searchConfig.fields);
        const usesConfiguredFields = searchConfig.hasConfiguredFields || searchConfig.fields.length > 0;
        const searchableFields = fieldMeta
          .filter((f) =>
            (usesConfiguredFields ? configuredSearchFields.has(f.name) : f.is_searchable) &&
            isTextSearchDataType(f.data_type) &&
            queryableColumnNames.has(f.column_name))
          .map((f, index) => ({
            columnName: f.column_name,
            rank: searchRankForField(searchConfig, f.name, index),
          }));
        const searchableCols = [...new Set(searchableFields.map((f) => f.columnName))];
        if (searchableCols.length > 0) {
          const pattern = searchPattern(searchTerm, searchConfig.operator) as never;
          const rankingFields = [...new Map(
            searchableFields.map((f) => [
              f.columnName,
              { columnName: f.columnName, rank: f.rank },
            ]),
          ).values()];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const applySearch = (q: any) => q.where((eb: any) =>
            eb.or(searchableCols.map((col: string) => eb(col as never, "ilike", pattern))),
          );
          listQuery  = applySearch(listQuery);
          countQuery = applySearch(countQuery);
          if (groupCountQuery) groupCountQuery = applySearch(groupCountQuery);
          listQuery = listQuery.orderBy(buildSearchScoreExpression(rankingFields, searchTerm), "desc");
        } else {
          logger?.warn("records_search_no_searchable_fields", { entityCode, searchTerm });
          reasons["search_unsupported"] = true;
          // Return empty â€” don't silently return all rows when search is requested
          res.json({
            data: [],
            pagination: { total: 0, page, page_size: pageSize, total_pages: 0 },
            reasons,
          });
          return;
        }
        }
      }

      // â”€â”€ Sort + F2 id tie-breaker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const columnNames = queryableColumnNames;
      const fieldNames  = new Set(fieldMeta.map((f) => f.name));

      // Filter requested sort entries to columns that actually exist on the table.
      // Stale URL params (e.g. sort=name:asc on a thin BP-role table) are silently
      // dropped so the fallback sort logic below kicks in instead of a SQL error.
      const validSortEntries = sortEntries.filter(({ fieldName }) => {
        const col = fieldMap.get(fieldName) ?? fieldName;
        return columnNames.has(col);
      });

      if (validSortEntries.length > 0) {
        for (const { fieldName, dir, nulls } of validSortEntries) {
          const col = fieldMap.get(fieldName) ?? fieldName;
          const nullsClause = nulls === "first" ? "NULLS FIRST" : "NULLS LAST";
          listQuery = listQuery.orderBy(sql.raw(`"${col}" ${dir.toUpperCase()} ${nullsClause}`) as never);
        }
      } else {
        // A3: metadata-driven fallback â€” display_config.default_sort_field â†’ created_at â†’ natural key â†’ id
        const displayConfig = entityVersionRow?.display_config as Record<string, unknown> | null | undefined;
        const metaSortField = typeof displayConfig?.default_sort_field === "string"
          ? displayConfig.default_sort_field
          : null;
        const metaSortDir   = displayConfig?.default_sort_order === "asc" ? "asc" : "desc";

        // Resolve: metadata field â†’ created_at â†’ natural key (code/name) â†’ skip (id covers it)
        const resolveDefaultSortCol = (): { col: string; dir: string } | null => {
          if (metaSortField) {
            const col = fieldMap.get(metaSortField) ?? (columnNames.has(metaSortField) ? metaSortField : null);
            if (col && columnNames.has(col)) return { col, dir: metaSortDir };
          }
          if (columnNames.has("created_at") || (fieldNames.has("created_at") && columnNames.has(fieldMap.get("created_at") ?? "created_at"))) {
            return { col: fieldMap.get("created_at") ?? "created_at", dir: "desc" };
          }
          for (const natural of ["code", "name", "number"]) {
            if (fieldNames.has(natural)) {
              const col = fieldMap.get(natural) ?? natural;
              if (columnNames.has(col)) return { col, dir: "asc" };
            }
          }
          return null;
        };

        const defaultSort = resolveDefaultSortCol();
        if (defaultSort) {
          listQuery = listQuery.orderBy(sql.raw(`"${defaultSort.col}" ${defaultSort.dir.toUpperCase()} NULLS LAST`) as never);
        }
      }
      // Always append id ASC as tie-breaker to guarantee stable pagination
      listQuery = listQuery.orderBy("id" as never, "asc" as never);

      const descriptorHash = stableEntityListCacheHash({
        versionHash: entityVersionRow?.version_hash,
        versionNo:   entityVersionRow?.version_no,
        entityId:    entityVersionRow?.entity_id,
        displayConfig: entityVersionRow?.display_config,
        searchConfig:  entityVersionRow?.search_config,
        // Include reference_config so that a target_entity / label_field /
        // code_field change rolls the cache key â€” the runtime reference-
        // label enricher reads these to attach companion display keys, and
        // stale pages would show out-of-date labels until next invalidation.
        // Doesn't rely on entity_version.version_hash being current.
        fields: fieldMeta.map((field) => ({
          name: field.name,
          column: field.column_name,
          searchable: field.is_searchable,
          type: field.data_type,
          referenceConfig: field.reference_config ?? null,
        })),
      });
      const scopeHash = stableEntityListCacheHash({
        tenantId,
        realmKey: verifiedContext.realmKey,
        organizationId: verifiedContext.organizationId ?? "",
        companyCodeId: verifiedContext.companyCodeId ?? "",
        legalEntityId: verifiedContext.legalEntityId ?? "",
      });
      const securityHash = stableEntityListCacheHash({
        principalId,
        profileHash: verifiedContext.profileHash,
        authEpoch: verifiedContext.authEpoch,
        scopeHash,
      });
      const filterHash = stableEntityListCacheHash({
        sigilFilters,
        legacyFilters,
        parentId: parentIdParam,
        throughEntity: throughEntityCode,
        pickerTreeMode,
        facets: facetsParam,
        group: groupParam,
      });
      const sortHash = stableEntityListCacheHash(validSortEntries);
      const searchHash = searchTerm
        ? stableEntityListCacheHash({ q: searchTerm, scope: req.query["search_scope"] ?? "implicit" })
        : "none";
      const listCacheVersion = tenantId && cache
        ? await resolveEntityListVersion(cache, tenantId, listCode)
        : "0";
      const listCacheKeyInput = tenantId && cache ? {
        tenantId,
        entityCode: listCode,
        scopeHash,
        securityHash,
        descriptorHash,
        filterHash,
        sortHash,
        searchHash,
        page,
        pageSize,
        version: listCacheVersion,
      } : null;
      const pageCacheKey = listCacheKeyInput && listPageCacheTtlSeconds > 0
        ? buildEntityListPageCacheKey(listCacheKeyInput)
        : null;
      const countCacheKey = listCacheKeyInput && listCountCacheTtlSeconds > 0
        ? buildEntityListCountCacheKey(listCacheKeyInput)
        : null;

      if (cache && pageCacheKey) {
        const cachedPage = await cache.get(pageCacheKey).catch(() => null);
        if (cachedPage) {
          try {
            res.setHeader("X-List-Cache", "hit");
            res.json(JSON.parse(cachedPage) as Record<string, unknown>);
            return;
          } catch {
            await cache.del(pageCacheKey).catch(() => undefined);
          }
        }
      }

      const cachedTotal = cache && countCacheKey
        ? parseCachedCount(await cache.get(countCacheKey).catch(() => null))
        : null;

      // â”€â”€ Execute list + count + group counts (parallel) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const [rows, countResult, groupCountRows] = await Promise.all([
        listQuery.limit(pageSize).offset(offset).execute(),
        cachedTotal === null ? countQuery.executeTakeFirst() : Promise.resolve({ count: String(cachedTotal) }),
        groupCountQuery ? (groupCountQuery as { execute(): Promise<{ group_value: string; count: string }[]> }).execute() : Promise.resolve(null),
      ]);

      const total = parseInt(String(countResult?.count ?? "0"), 10);

      const remappedRows = (rows as Record<string, unknown>[]).map((row) => {
        return remapRecordRow(row, fieldMap);
      });
      let responseRows = remappedRows;
      if (isCertificationBackingTable(listTable)) {
        responseRows = await enrichCertificationTypeDisplayFields(db, responseRows);
      }
      if (isCommodityClassificationBackingTable(listTable)) {
        responseRows = await enrichCommodityClassificationDisplayFields(db, responseRows);
      }

      // Reference-label hydration: walks descriptor reference_config fields
      // and attaches ${field}_label / ${field}_code companion keys driven
      // off control.entity_relation. Runs before field-security mask so the
      // masker can strip companion keys for hidden FK columns (Phase 4).
      // Failures degrade silently â€” labels become null and the existing
      // UUID safety net at record-display.ts renders Ref: <shortid>.
      try {
        responseRows = await enrichWithReferenceLabels(db, {
          entityCode: listCode,
          tenantId:   tenantId ?? null,
          rows:       responseRows,
        });
      } catch (enrichErr) {
        logger?.warn("records_list_enrich_labels_failed", {
          entity: listCode,
          err:    String(enrichErr),
        });
      }

      // â”€â”€ Facets with budget (F7: scoped to the same filtered context) â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Budget: 20-field cap, 200-value cardinality cap per field, 2s hard timeout.
      // facet_status communicates whether the response is complete or budget-trimmed.
      const FACET_FIELD_CAP   = 20;
      const FACET_VALUE_CAP   = 200;
      const FACET_TIMEOUT_MS  = 2000;

      let facets: Record<string, { value: string; count: number }[]> | undefined;
      let facetStatus: "complete" | "truncated" | "timeout" | undefined;

      if (includeFacets && tenantId) {
        // cheap scope: enum + boolean only (bounded cardinality, fast GROUP BY)
        // all scope: also include string/text fields (useful for category, label, type fields
        //            typed as string rather than enum â€” bounded by FACET_VALUE_CAP)
        const isFacetEligible = (dt: string) =>
          dt === "enum" || dt === "boolean" ||
          (facetsParam === "all" && (dt === "string" || dt === "text"));

        const eligibleFieldMeta = fieldMeta
          .filter((f) => isFacetEligible(f.data_type) && !f.is_computed && columnNames.has(f.column_name))
          .slice(0, FACET_FIELD_CAP);

        const wasFieldCapped = fieldMeta.filter(
          (f) => isFacetEligible(f.data_type) && !f.is_computed && columnNames.has(f.column_name),
        ).length > FACET_FIELD_CAP;

        const facetWork = Promise.all(
          eligibleFieldMeta.map(async ({ name, column_name }) => {
            // Build from the filtered countQuery so counts reflect applied filters (F7).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const facetQ: any = countQuery
              .clearSelect()
              .select([
                column_name as never,
                db.fn.countAll<string>().as("count") as never,
              ])
              .groupBy(column_name as never)
              .orderBy(db.fn.countAll<string>() as never, "desc" as never)
              .limit(FACET_VALUE_CAP + 1); // +1 to detect truncation

            const raw = await facetQ.execute() as Record<string, string>[];
            const hasMore = raw.length > FACET_VALUE_CAP;
            return {
              name,
              values: raw.slice(0, FACET_VALUE_CAP).map((row) => ({
                value: String(row[column_name] ?? ""),
                count: parseInt(row["count"] ?? "0", 10),
              })),
              hasMore,
            };
          }),
        );

        const timeoutSentinel = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), FACET_TIMEOUT_MS),
        );

        const result = await Promise.race([facetWork, timeoutSentinel]);

        if (result === "timeout") {
          facetStatus = "timeout";
        } else {
          facets = {};
          let anyTruncated = wasFieldCapped;
          for (const { name, values, hasMore } of result) {
            facets[name] = values;
            if (hasMore) anyTruncated = true;
          }
          facetStatus = anyTruncated ? "truncated" : "complete";
        }
      }

      // Build group_counts: map __null__ sentinel back to __unassigned__ (matches KanbanView)
      const groupCounts = groupCountRows
        ? Object.fromEntries(
            groupCountRows.map(({ group_value, count }) => [
              group_value === "__null__" ? "__unassigned__" : group_value,
              parseInt(count, 10),
            ]),
          )
        : undefined;

      const responseBody: Record<string, unknown> = {
        data: responseRows,
        pagination: {
          total,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(total / pageSize),
        },
        ...(groupCounts  ? { group_counts: groupCounts } : {}),
        ...(facets       ? { facets }                   : {}),
        ...(facetStatus  ? { facet_status: facetStatus } : {}),
        ...(Object.keys(reasons).length > 0 ? { reasons } : {}),
      };
      res.setHeader("X-List-Cache", pageCacheKey ? "miss" : "bypass");

      if (tenantId) {
        await applyFieldSecurityMask(db, tenantId, entityCode, roles, responseBody, logger);
      }

      if (cache) {
        if (pageCacheKey) {
          await cache.set(pageCacheKey, JSON.stringify(responseBody), "EX", listPageCacheTtlSeconds).catch(() => undefined);
        }
        if (countCacheKey && cachedTotal === null) {
          await cache.set(countCacheKey, String(total), "EX", listCountCacheTtlSeconds).catch(() => undefined);
        }
      }

      res.json(responseBody);
    } catch (err) {
      logger?.error("records_list_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET BY ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getHandler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);
      const { tenantId } = verifiedContext;
      const roles = readVerifiedRoleCodes(res);

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      if (shouldUseEntityQuery(req, entityCode)) {
        const resolved = await resolveExecutionDescriptor(req, res, entityCode.replace(/-/g, "_"));
        const result = await entityQueryService!.detail({
          context: verifiedContext,
          descriptor: resolved.descriptor,
          generation: resolved.generation,
          id,
        });
        if (!result.data) {
          res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
          return;
        }
        res.setHeader("X-Entity-Query", "v1");
        res.setHeader("X-Descriptor-Hash", resolved.descriptor.identity.compiledHash);
        res.setHeader("X-Descriptor-Cache", resolved.cacheState);
        res.json({ id: result.data["id"] ?? id, entity_code: entityCode, data: result.data });
        return;
      }
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve field map early â€” needed for both business-key lookup and response remapping
      const fieldMap = await resolveFieldMap(db, entityCode);
      const row = await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId);

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Remap DB row keys and expose aliases for metadata-backed logical fields.
      const data = remapRecordRow(row, fieldMap);

      // â”€â”€ BP identity merge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // When identity_config.identity_via = 'business_partner', the role table (supplier/customer)
      // holds only commercial fields.  Fetch the linked BP record and merge
      // identity fields (name, legal_name, country, etc.) into data so the detail
      // header can display them without a second client-side request.
      // Role fields (supplier_code, status, etc.) take precedence â€” BP fields only
      // fill keys that are absent from the role row.
      if (configuredIdentityVia(table) === "business_partner") {
        const bpId = row["business_partner_id"] as string | undefined;
        if (bpId) {
          const bpRow = await db
            .selectFrom("master.business_partner as bp")
            .selectAll("bp")
            .where("bp.id" as never, "=", bpId as never)
            .executeTakeFirst() as Record<string, unknown> | undefined;
          if (bpRow) {
            const BP_MERGE_FIELDS = [
              "code", "name", "display_name", "legal_name", "legal_form",
              "registration_no", "registration_country_code", "tax_residence_country_code",
              "partner_category", "website_url", "description", "long_description",
              "external_ref", "aliases", "tags",
              "business_types", "founded_year", "employee_count_band", "annual_revenue_band",
            ] as const;
            for (const f of BP_MERGE_FIELDS) {
              if (bpRow[f] !== undefined && data[f] === undefined) {
                data[f] = bpRow[f];
              }
            }
            // Always expose bp_code regardless of field collision
            data["business_partner_code"] = bpRow["code"];
          }
        }

        // Qualification merge â€” surfaces key approval/risk fields for header status strip
        // without a separate client-side request.  Fields are merged only if absent from
        // the role row so role-level overrides always win.
        if (entityCode === "supplier" && typeof row.id === "string") {
          const qualRow = await db
            .selectFrom("master.supplier_qualification as sq" as never)
            .select(["sq.is_approved_supplier", "sq.is_blocked", "sq.risk_tier", "sq.onboarding_status"] as never[])
            .where("sq.supplier_id" as never, "=", row.id as never)
            .executeTakeFirst() as Record<string, unknown> | undefined;
          if (qualRow) {
            const QUAL_MERGE = ["is_approved_supplier", "is_blocked", "risk_tier", "onboarding_status"] as const;
            for (const f of QUAL_MERGE) {
              if (qualRow[f] !== undefined && data[f] === undefined) data[f] = qualRow[f];
            }
          }
        }
      }

      let responseData = data;
      if (isCertificationBackingTable(table)) {
        responseData = (await enrichCertificationTypeDisplayFields(db, [responseData]))[0] ?? responseData;
      }
      if (isCommodityClassificationBackingTable(table)) {
        responseData = (await enrichCommodityClassificationDisplayFields(db, [responseData]))[0] ?? responseData;
      }

      // Reference-label hydration â€” same contract as listHandler. Runs
      // before field-security mask so the masker can strip companion keys
      // for hidden FK columns. Failures degrade silently â†’ null labels.
      try {
        responseData = await enrichSingleReferenceLabels(db, {
          entityCode,
          tenantId:   tenantId ?? null,
          row:        responseData,
        }) ?? responseData;
      } catch (enrichErr) {
        logger?.warn("records_get_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
      }

      const detailBody: Record<string, unknown> = {
        id:               row.id,
        entity_code:      entityCode,
        tenant_id:        row.tenant_id,
        status:           row.status,
        is_active:        row.is_active,
        created_at:       row.created_at,
        created_by:       row.created_by,
        updated_at:       row.updated_at ?? null,
        updated_by:       row.updated_by ?? null,
        status_changed_at: row.status_changed_at ?? null,
        status_changed_by: row.status_changed_by ?? null,
        data:             responseData,
      };

      // Apply field-security masking using tenantId from the fetched row
      if (typeof row.tenant_id === "string") {
        await applyFieldSecurityMask(db, row.tenant_id, entityCode, roles, detailBody, logger);
      }

      // â”€â”€ BFF dependency warnings (Phase 5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Surfaces `_dependency_warnings` for fields whose value no longer
      // matches their dependent_filter against the row's own source values.
      // Picker UI renders "needs review" without silently clearing.
      // Spec: docs/specs/entity_field_defaults.md Â§5 (bff_on_load_hydrate)
      if (typeof row.tenant_id === "string") {
        try {
          const fieldMapForLogical = await resolveFieldMap(db, entityCode);
          const physicalToLogical = new Map<string, string>();
          for (const [logical, physical] of fieldMapForLogical.entries()) {
            physicalToLogical.set(physical, logical);
          }
          const logicalRow: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(row)) {
            logicalRow[physicalToLogical.get(k) ?? k] = v;
          }
          const warnings = await computeBffDependencyWarnings({
            entityCode,
            row:      logicalRow,
            db,
            tenantId: row.tenant_id,
          });
          if (Object.keys(warnings).length > 0) {
            detailBody["_dependency_warnings"] = warnings;
          }
        } catch (warnErr) {
          logger?.warn("records_get_dep_warnings_failed", { entity: entityCode, err: String(warnErr) });
        }
      }

      res.json(detailBody);
    } catch (err) {
      logger?.error("records_get_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ CREATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const createHandler: RequestHandler = async (req, res, next) => {
    let createIdempotencyClaimId: string | undefined;
    try {
      const { tenantId, principalId } = requireVerifiedContext(req, res);

      const entityCode = req.params["entity"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }
      if (rejectGenericDocumentMutation(res, table)) return;

      // Remap form field names â†’ physical column names via entity_field
      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      const body = req.body as { data?: Record<string, unknown> };
      const inputData = body.data ?? {};
      const createParentFk = configuredParentFk(table);
      const fieldInput = { ...inputData };
      // parent_id is an envelope/control value consumed below, not a discarded entity field.
      if (createParentFk) delete fieldInput["parent_id"];
      const fieldDecision = validateEntityWriteFields({
        input: fieldInput,
        rules: writeRules,
        action: "create",
        validationMode: "strict",
      });
      if (hasFieldViolations(fieldDecision.violations)) {
        res.status(422).json({ error: "FIELDS_NOT_WRITABLE", fields: fieldDecision.violations });
        return;
      }
      const writableInputData: Record<string, unknown> = {};
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(fieldDecision.accepted)) {
        if (value !== undefined) {
          writableInputData[fieldName] = value;
        }
        const columnName = writeRules.get(fieldName)!.column_name;
        // Skip undefined/null values so DB column defaults can apply
        if (columnName && value !== undefined && value !== null) {
          assignMappedValue(mappedData, columnName, value);
        }
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      const jsonColumns = await resolveJsonColumns(db, entityCode);
      includeMappedJsonObjects(mappedData, jsonColumns);
      normalizeCommodityCategoryDomainGuards(entityCode, mappedData);
      serializeJsonFields(mappedData, jsonColumns);

      // Inject parent FK when entity is a child (identity_config.parent.field + scope).
      // The caller passes parent_id in body.data; we resolve the physical FK column from
      // metadata so the form never needs to know the internal column name.
      const createParentId  = typeof inputData["parent_id"] === "string" ? inputData["parent_id"] : null;
      if (createParentFk && createParentId) {
        mappedData[createParentFk] = createParentId;
        const scopeStr = configuredParentScope(table);
        if (scopeStr) {
          const eqIdx = scopeStr.indexOf("=");
          if (eqIdx > 0) {
            const scopeCol = scopeStr.slice(0, eqIdx);
            // Only apply entity default if the caller did not already supply the
            // discriminator column (e.g. form pre-fills owner_type=business_partner
            // from the add_href_template URL param for polymorphic child entities).
            if (mappedData[scopeCol] === undefined) {
              mappedData[scopeCol] = scopeStr.slice(eqIdx + 1);
            }
          }
        }
      }

      mappedData.tenant_id = tenantId;

      mappedData.created_by = principalId;

      const createIdempotency = buildEntityCreateIdempotency({ request: req, entityCode, body });
      if (table.create_mode === "DIRECT_CREATE" && !createIdempotency) {
        res.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required for DIRECT_CREATE." });
        return;
      }
      const claimCreate = async (): Promise<boolean> => {
        if (!createIdempotency || createIdempotencyClaimId) return true;
        const claim = await db.transaction().execute((trx) => claimDocumentRuntimeIdempotency(trx, {
          tenantId,
          principalId,
          entityCode,
          documentId: createIdempotency.documentId,
          idempotencyKey: createIdempotency.key,
          requestHash: createIdempotency.requestHash,
          operationKey: "entity.create",
        }));
        if (claim.kind === "replay") {
          res.status(claim.responseStatus).json(claim.response);
          return false;
        }
        if (claim.kind === "mismatch") {
          res.status(409).json({ error: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency-Key was already used for a different create request." });
          return false;
        }
        if (claim.kind === "in_progress") {
          res.status(409).json({ error: "IDEMPOTENCY_IN_PROGRESS", message: "An identical create is already in progress. Retry with the same Idempotency-Key." });
          return false;
        }
        createIdempotencyClaimId = claim.id;
        return true;
      };
      const completeCreate = async (response: Record<string, unknown>): Promise<void> => {
        if (!createIdempotencyClaimId) return;
        await completeDocumentRuntimeIdempotency(db, { id: createIdempotencyClaimId, actorId: principalId, response, responseStatus: 201 });
        createIdempotencyClaimId = undefined;
      };
      const releaseCreate = async (): Promise<void> => {
        if (!createIdempotencyClaimId) return;
        await releaseDocumentRuntimeIdempotency(db, createIdempotencyClaimId);
        createIdempotencyClaimId = undefined;
      };

      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "create",
        logger,
      })) return;

      // â”€â”€ View-backed entity write-facade dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // The guard above lets backing_type!='table' through only when a
      // write_facade is declared. For those entities, route the create to
      // the registered facade and skip the rest of the generic flow
      // (auto-population + auto-numbering + direct INSERT into the view).
      if (entityCode === "purchase_invoice") {
        if (!await claimCreate()) return;
        const { status, body: createBody } = await handleCreateApInvoice(
          db,
          tenantId,
          principalId,
          writableInputData as Parameters<typeof handleCreateApInvoice>[3],
          logger,
        );

        if (status >= 400) {
          await releaseCreate();
          res.status(status).json(createBody);
          return;
        }

        const createdRecord = createBody["record"] as Record<string, unknown> | undefined;
        await invalidateListCachesForEntity(tenantId, entityCode, table);

        if (createdRecord) {
          try {
            createBody["record"] = await enrichSingleReferenceLabels(db, {
              entityCode,
              tenantId: tenantId ?? null,
              row:      createdRecord,
            }) ?? createdRecord;
          } catch (enrichErr) {
            logger?.warn("records_create_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
          }
        }

        await completeCreate(createBody);
        res.status(status).json(createBody);
        return;
      }

      if (table.backing_type !== "table") {
        const facadeName = stringConfigValue(table.feature_flags["write_facade"]);
        if (!facadeName) {
          // Should never happen â€” guard would have already 403'd. Belt-and-
          // braces in case the guard contract drifts.
          res.status(403).json({
            error:   "ENTITY_BACKING_READ_ONLY",
            message: `Entity '${entityCode}' is view-backed without a write facade.`,
          });
          return;
        }
        const facade = getWriteFacade(facadeName);
        if (!facade) {
          logger?.error("write_facade_not_registered", { entity: entityCode, facade: facadeName });
          res.status(500).json({
            error:   "WRITE_FACADE_NOT_REGISTERED",
            message: `Write facade '${facadeName}' is declared by entity '${entityCode}' but not registered.`,
          });
          return;
        }
        if (!await claimCreate()) return;
        const outcome = await executeDurableMutationTransaction(db, async (trx) => {
          const result = await facade.create({
            // Kysely Transaction exposes the same query surface required by
            // facades; the registry's legacy alias is typed as root Kysely.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            db: trx as unknown as Kysely<Record<string, any>>, tenantId, principalId, input: inputData,
          });
          if (!result.ok) return result;
          const recordId = String(result.record["id"] ?? "");
          if (recordId) {
            const eventType = `${entityCode}.created`;
            const version = result.record["row_version"] ?? 0;
            await writeRequiredRouteAudit(trx, {
              tenantId,
              entityType: entityCode,
              entityId: recordId,
              operation: "insert",
              actorId: principalId,
              actorType: "principal",
              oldValues: null,
              newValues: result.record,
            });
            await emitOutboxEvent(trx, {
              tenantId,
              topic: "search",
              eventType,
              entityType: entityCode,
              entityId: recordId,
              eventKey: buildDurableMutationEventKey({ tenantId, entityType: entityCode, entityId: recordId, version: String(version), eventType }),
              actorId: principalId,
              payload: { origin: "classic" },
            });
          }
          if (createIdempotencyClaimId) {
            await completeDocumentRuntimeIdempotency(trx, {
              id: createIdempotencyClaimId,
              actorId: principalId,
              response: result.record,
              responseStatus: 201,
            });
          }
          return result;
        });
        if (!outcome.ok) {
          await releaseCreate();
          res.status(outcome.status).json({ error: outcome.error, message: outcome.message });
          return;
        }

        const newId = String(outcome.record["id"] ?? "");
        if (newId && createIdempotencyClaimId) createIdempotencyClaimId = undefined;
        await invalidateListCachesForEntity(tenantId, entityCode, table);
        let createdRecord = outcome.record;
        try {
          createdRecord = await enrichSingleReferenceLabels(db, {
            entityCode,
            tenantId:   tenantId ?? null,
            row:        createdRecord as Record<string, unknown>,
          }) ?? createdRecord;
        } catch (enrichErr) {
          logger?.warn("records_create_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
        }
        await completeCreate(createdRecord);
        res.status(201).json(createdRecord);
        return;
      }

      // Hoisted payment_entry post-insert data (set inside enrichment block below)
      let peSourceInvoiceId: string | undefined;

      // Auto-populate DOCUMENT-entity system fields that the generic form doesn't expose
      if (table.entity_class === "DOCUMENT") {
        if (!mappedData["company_code_id"]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc = await (db as any)
            .selectFrom("master.company_code")
            .select(["id", "functional_currency"])
            .where("tenant_id", "=", tenantId)
            .where("status", "=", "active")
            .orderBy("created_at", "asc")
            .executeTakeFirst() as { id: string; functional_currency: string } | undefined;
          if (cc) {
            mappedData["company_code_id"] = cc.id;
            if (!mappedData["base_currency_code"]) {
              mappedData["base_currency_code"] = cc.functional_currency;
            }
          }
        } else if (!mappedData["base_currency_code"]) {
          // company_code_id was provided, resolve functional_currency from it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc = await (db as any)
            .selectFrom("master.company_code")
            .select(["functional_currency"])
            .where("id", "=", mappedData["company_code_id"])
            .executeTakeFirst() as { functional_currency: string } | undefined;
          if (cc) mappedData["base_currency_code"] = cc.functional_currency;
        }
        // Fallback: use currency_code as base_currency_code if still missing
        if (!mappedData["base_currency_code"] && mappedData["currency_code"]) {
          mappedData["base_currency_code"] = mappedData["currency_code"];
        }
        // journal_entry uses the column name "base_currency" (not "base_currency_code") and
        // it is auto-synced from company_code_id by trg_je_sync_base_currency â€” skip injection
        if (entityCode === "journal_entry") {
          delete mappedData["base_currency_code"];

          const jeCompanyId = mappedData["company_code_id"] as string | undefined;

          // Manual JE creation omits the locked source field from the form, but
          // document.journal_entry.source_doc_type is NOT NULL.
          if (!mappedData["source_doc_type"]) {
            mappedData["source_doc_type"] = "manual";
          }

          // Resolve book_id via company_code_book_assignment (statutory book)
          if (!mappedData["book_id"] && jeCompanyId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const book = await (db as any)
              .selectFrom("master.company_code_book_assignment as ba")
              .innerJoin("master.ledger_book as lb", "lb.id", "ba.book_id")
              .select(["ba.book_id"])
              .where("ba.tenant_id",       "=", tenantId)
              .where("ba.company_code_id", "=", jeCompanyId)
              .where("ba.status",          "=", "active")
              .where("lb.is_manual_je_allowed", "=", true)
              .where("lb.category",        "=", "statutory")
              .orderBy("ba.priority", "asc")
              .executeTakeFirst() as { book_id: string } | undefined;
            if (book) mappedData["book_id"] = book.book_id;
          }

          // Resolve fiscal_period_id + fiscal_year + period_number from posting_date.
          // trg_je_period_gate fires before trg_je_sync_fiscal_period (alphabetical order),
          // so all three must be set in app code for the gate to see correct values.
          const jePd = mappedData["posting_date"] as string | undefined;
          if (!mappedData["fiscal_period_id"] && jePd && jeCompanyId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fp = await (db as any)
              .selectFrom("master.fiscal_period as fp")
              .select(["fp.id", "fp.fiscal_year", "fp.period_number"])
              .where("fp.tenant_id",       "=", tenantId)
              .where("fp.company_code_id", "=", jeCompanyId)
              .where("fp.period_number",   ">=", 1)
              .where("fp.period_number",   "<=", 12)
              .where("fp.start_date",      "<=", jePd)
              .where("fp.end_date",        ">=", jePd)
              .orderBy("fp.period_number", "asc")
              .executeTakeFirst() as { id: string; fiscal_year: number; period_number: number } | undefined;
            if (fp) {
              mappedData["fiscal_period_id"] = fp.id;
              mappedData["fiscal_year"]      = fp.fiscal_year;
              mappedData["period_number"]    = fp.period_number;
            }
          }

          // document_date is NOT NULL; mirror posting_date when not explicitly provided
          if (!mappedData["document_date"] && jePd) {
            mappedData["document_date"] = jePd;
          }
        }
        // receipt / service_sheet / purchase_requisition â€” auto-resolve the
        // NOT NULL fields the create form hides as system-managed (P2P plan
        // Plan 3a + D). The form surfaces only document_date + the
        // operational selectors; the server resolves fiscal_year +
        // period_number from document_date via the shared
        // resolveFiscalPeriod helper (Gregorian fallback + warn log per the
        // AUDIT NOTE in business/p2p/resolve-document-defaults.ts).
        // total_amount falls back to the DB DEFAULT 0 (rolls up from lines
        // via trg_rcpl_sync_header once lines are added).
        if (entityCode === "receipt" || entityCode === "service_sheet" || entityCode === "purchase_requisition") {
          const rcpCompanyId = mappedData["company_code_id"] as string | undefined;
          const rcpDate      = (
            entityCode === "receipt"
              ? mappedData["received_date"] ?? mappedData["document_date"] ?? mappedData["posting_date"]
              : entityCode === "service_sheet"
              ? mappedData["service_date"] ?? mappedData["document_date"] ?? mappedData["posting_date"]
              : mappedData["document_date"] ?? mappedData["posting_date"]
          ) as string | undefined;

          if ((!mappedData["fiscal_year"] || !mappedData["period_number"]) && rcpDate && rcpCompanyId) {
            // Strict by default â€” fail-fast with an actionable 422 when no
            // fiscal_period covers the document date. The AUDIT NOTE in
            // business/p2p/resolve-document-defaults.ts explains why
            // permissive Gregorian fallback is opt-in only.
            const resolved = await resolveFiscalPeriod(db as never, {
              tenantId,
              companyCodeId:    rcpCompanyId,
              documentDate:     rcpDate,
              logger,
            });
            if (!resolved.ok) {
              res.status(422).json({
                error:   "FISCAL_PERIOD_MISSING",
                message: `No fiscal_period covers ${rcpDate} for the resolved company_code. Seed master.fiscal_period for this date, or supply fiscal_year/period_number explicitly.`,
                details: {
                  tenantId, companyCodeId: rcpCompanyId, documentDate: rcpDate,
                },
              });
              return;
            }
            mappedData["fiscal_year"]   = resolved.fiscalYear;
            mappedData["period_number"] = resolved.periodNumber;
          }

          // Translate the UI's legacy document_date alias to the canonical
          // document-specific date columns before generic insert.
          if (entityCode === "receipt") {
            if (!mappedData["received_date"] && rcpDate) mappedData["received_date"] = rcpDate;
            delete mappedData["document_date"];
          } else if (entityCode === "service_sheet") {
            if (!mappedData["service_date"] && rcpDate) mappedData["service_date"] = rcpDate;
            delete mappedData["document_date"];
          } else if (!mappedData["document_date"] && mappedData["posting_date"]) {
            mappedData["document_date"] = mappedData["posting_date"];
          }

          // PR-specific: requested_by is NOT NULL with no DB default. Default
          // to the principal creating the requisition when the form omits it.
          if (entityCode === "purchase_requisition" && !mappedData["requested_by"] && principalId) {
            mappedData["requested_by"] = principalId;
          }
        }

        // purchase_invoice-specific NOT NULL defaults
        if (entityCode === "purchase_invoice") {
          // currency_code is NOT NULL â€” fall back to the company's functional currency
          if (!mappedData["currency_code"]) {
            mappedData["currency_code"] = mappedData["base_currency_code"];
          }
          // tax_mode is required for non-proforma invoices (pi_tax_mode_req CHECK)
          if (!mappedData["tax_mode"] && mappedData["status"] !== "proforma") {
            mappedData["tax_mode"]        = "exclusive";
            mappedData["tax_mode_source"] = "cannot_infer";
          }
          if (mappedData["supplier_invoice_number"] === undefined) {
            mappedData["supplier_invoice_number"] = "";
          }
        }

        // payment_entry-specific enrichment
        if (entityCode === "payment_entry") {
          const postingDate = mappedData["posting_date"] as string | undefined;

          // source_invoice_id is not a DB column so fieldMap drops it from mappedData.
          // Read it from the raw inputData body instead.
          peSourceInvoiceId = inputData["source_invoice_id"] as string | undefined;

          // payment_type is the settlement classification. Older drafts used this field for
          // instrument mode; keep that compatibility by moving non-contract values to metadata.
          const paymentEntryTypes = new Set([
            "standard", "advance", "retention_release", "partial",
            "final", "down_payment", "urgent", "netting",
          ]);
          const rawPaymentType = String(mappedData["payment_type"] ?? "").trim().toLowerCase();
          const instrumentMode = String(
            inputData["payment_instrument_mode"] ??
            (rawPaymentType && !paymentEntryTypes.has(rawPaymentType) ? rawPaymentType : "") ??
            "",
          ).trim();
          if (!rawPaymentType) {
            mappedData["payment_type"] = "standard";
          } else if (!paymentEntryTypes.has(rawPaymentType)) {
            mappedData["payment_type"] = "standard";
          }
          const existingMeta = (typeof mappedData["metadata"] === "object" && mappedData["metadata"] !== null)
            ? (mappedData["metadata"] as Record<string, unknown>)
            : {};
          mappedData["metadata"] = instrumentMode
            ? { ...existingMeta, instrument_mode: instrumentMode }
            : existingMeta;

          // supplier_name: denormalized NOT NULL; resolve through the supplier app index.
          if (!mappedData["supplier_name"] && mappedData["supplier_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const supplierRow = await (db as any)
              .selectFrom("master.supplier_app_index as s")
              .select([
                sql<string>`COALESCE(s.display_name, s.name, s.supplier_code)`.as("supplier_name"),
              ])
              .where("s.supplier_id", "=", mappedData["supplier_id"])
              .where("s.tenant_id",   "=", tenantId)
              .executeTakeFirst() as { supplier_name: string } | undefined;
            mappedData["supplier_name"] = supplierRow?.supplier_name ?? "Unknown Supplier";
          }
          if (!mappedData["supplier_name"]) mappedData["supplier_name"] = "Unknown Supplier";

          // fiscal_year + period_number: NOT NULL â€” resolve from master.fiscal_period
          if (!mappedData["fiscal_year"] && postingDate) {
            const peCompanyId = mappedData["company_code_id"] as string | undefined;
            if (peCompanyId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fp = await (db as any)
                .selectFrom("master.fiscal_period as fp")
                .select(["fp.fiscal_year", "fp.period_number"])
                .where("fp.tenant_id",       "=", tenantId)
                .where("fp.company_code_id", "=", peCompanyId)
                .where("fp.period_number",   ">=", 1)
                .where("fp.period_number",   "<=", 12)
                .where("fp.start_date",      "<=", postingDate)
                .where("fp.end_date",        ">=", postingDate)
                .orderBy("fp.period_number", "asc")
                .executeTakeFirst() as { fiscal_year: number; period_number: number } | undefined;
              if (fp) {
                mappedData["fiscal_year"]   = fp.fiscal_year;
                mappedData["period_number"] = fp.period_number;
              }
            }
            // Fallback: extract from date directly
            if (!mappedData["fiscal_year"]) {
              const d = new Date(postingDate);
              mappedData["fiscal_year"]   = d.getFullYear();
              mappedData["period_number"] = d.getMonth() + 1;
            }
          }

          // payment_method_id: NOT NULL â€” look up by legacy instrument_mode only when absent.
          if (!mappedData["payment_method_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pm: { id: string } | undefined;
            if (instrumentMode) {
              pm = await (db as any)
                .selectFrom("master.payment_method as pm")
                .select(["pm.id"])
                .where("pm.tenant_id",       "=", tenantId)
                .where("pm.instrument_mode", "=", instrumentMode)
                .where("pm.is_active",       "=", true)
                .orderBy("pm.sort_order",    "asc")
                .executeTakeFirst() as { id: string } | undefined;
            }
            // Fallback: any active method for this tenant
            if (!pm) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pm = await (db as any)
                .selectFrom("master.payment_method as pm")
                .select(["pm.id"])
                .where("pm.tenant_id", "=", tenantId)
                .where("pm.is_active", "=", true)
                .orderBy("pm.sort_order", "asc")
                .executeTakeFirst() as { id: string } | undefined;
            }
            if (pm) mappedData["payment_method_id"] = pm.id;
          }

          // value_date: NOT NULL DEFAULT CURRENT_DATE â€” mirror posting_date when absent
          if (!mappedData["value_date"] && postingDate) {
            mappedData["value_date"] = postingDate;
          }
        }

        // Auto-generate the system document number when the wizard doesn't supply one.
        // Each document type has its own NOT NULL number column; a short random suffix
        // keeps it unique within the tenant without a DB sequence.
        const DOC_NUMBER_COLS: Record<string, { col: string; prefix: string }> = {
          purchase_invoice:            { col: "code",            prefix: "PI"  },
          journal_entry:               { col: "je_number",                 prefix: "JE"  },
          purchase_order:              { col: "code",                      prefix: "PO"  },
          payment_entry:               { col: "payment_number",            prefix: "PMT" },
          receipt:                     { col: "code",                      prefix: "RCP" },
          service_sheet:               { col: "code",                      prefix: "SES" },
          purchase_requisition:        { col: "requisition_number",        prefix: "PR"  },
          purchase_order_confirmation: { col: "confirmation_number",       prefix: "POC" },
          delivery_note:               { col: "delivery_note_number",      prefix: "DN"  },
        };
        const docNum = DOC_NUMBER_COLS[entityCode];
        if (docNum && !mappedData[docNum.col]) {
          mappedData[docNum.col] = await allocateDocumentNumber(db as never, {
            tenantId,
            entityCode,
            numberField:   docNum.col === "code" ? "code" : "document_no",
            companyCodeId: typeof mappedData["company_code_id"] === "string" ? mappedData["company_code_id"] : null,
            fiscalYear:    typeof mappedData["fiscal_year"] === "number" ? mappedData["fiscal_year"] : Number(mappedData["fiscal_year"] ?? "") || null,
            periodNumber:  typeof mappedData["period_number"] === "number" ? mappedData["period_number"] : Number(mappedData["period_number"] ?? "") || null,
            effectiveDate: typeof mappedData["posting_date"] === "string"
              ? mappedData["posting_date"]
              : typeof mappedData["document_date"] === "string"
              ? mappedData["document_date"]
              : null,
            fallbackPrefix: docNum.prefix,
          });
          if (entityCode === "service_sheet" && !mappedData["service_sheet_number"]) {
            mappedData["service_sheet_number"] = mappedData[docNum.col];
          }
        }
      }

      if (entityCode === "payment_entry" && peSourceInvoiceId) {
        const guard = await validatePaymentEntrySourceInvoiceCreate(
          db as Kysely<Record<string, unknown>>,
          tenantId,
          peSourceInvoiceId,
          mappedData,
        );
        if (!guard.ok) {
          res.status(guard.status).json(guard.body);
          return;
        }
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      if (!await claimCreate()) return;
      const row = await executeDurableMutationTransaction(db, async (trx) => {
        const inserted = await trx
          .insertInto(fullTable)
          .values(mappedData as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (!inserted) return inserted;

        if (entityCode === "payment_entry" && peSourceInvoiceId) {
            const paymentId     = inserted["id"] as string;
            const currencyCode  = inserted["currency_code"] as string;
            const paymentAmount = String(inserted["payment_amount"] ?? "0");
            await sql`
              INSERT INTO document.payment_entry_allocation (
                id, tenant_id, payment_entry_id, line_no,
                purchase_invoice_id,
                currency_code,
                allocated_amount, discount_amount, withholding_tax_amount,
                advance_recovery_amount, retention_amount,
                created_by
              ) VALUES (
                ${crypto.randomUUID()}, ${tenantId}, ${paymentId}, 1,
                ${peSourceInvoiceId},
                ${currencyCode},
                ${paymentAmount}, 0, 0,
                0, 0,
                ${principalId}
              )
            `.execute(trx);
        }

        const recordId = String(inserted["id"] ?? "");
        const eventType = `${entityCode}.created`;
        const version = inserted["row_version"] ?? 0;
        await writeRequiredRouteAudit(trx, {
          tenantId,
          entityType: entityCode,
          entityId: recordId,
          operation: "insert",
          actorId: principalId,
          actorType: "principal",
          oldValues: null,
          newValues: inserted,
        });
        await emitOutboxEvent(trx, {
          tenantId,
          topic: "search",
          eventType,
          entityType: entityCode,
          entityId: recordId,
          eventKey: buildDurableMutationEventKey({ tenantId, entityType: entityCode, entityId: recordId, version: String(version), eventType }),
          actorId: principalId,
          payload: { origin: "classic" },
        });
        if (createIdempotencyClaimId) {
          await completeDocumentRuntimeIdempotency(trx, {
            id: createIdempotencyClaimId,
            actorId: principalId,
            response: inserted,
            responseStatus: 201,
          });
        }
        return inserted;
      });
      if (row && createIdempotencyClaimId) createIdempotencyClaimId = undefined;

      // Draft payment allocations are created transactionally with payment_entry.
      // Invoice settlement still changes only after payment posting, where
      // resolveInvoicePaymentStatus reads posted/non-voided allocations.
      // Emit search-topic outbox event â€” best-effort; must not fail the
      // request. The generic search outbox handler routes this through
      // control.entity â†’ Meilisearch.
      await invalidateListCachesForEntity(tenantId, entityCode, table);

      let createdRow = row as Record<string, unknown> | undefined;
      try {
        if (createdRow) {
          createdRow = await enrichSingleReferenceLabels(db, {
            entityCode,
            tenantId:   tenantId ?? null,
            row:        createdRow,
          }) ?? createdRow;
        }
      } catch (enrichErr) {
        logger?.warn("records_create_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
      }

      if (createdRow) await completeCreate(createdRow);
      else await releaseCreate();
      res.status(201).json(createdRow);
    } catch (err) {
      if (createIdempotencyClaimId) {
        try { await releaseDocumentRuntimeIdempotency(db, createIdempotencyClaimId); } catch { /* preserve original failure */ }
      }
      const businessError = mapPostgresBusinessError(err);
      if (businessError) {
        logger?.warn("records_create_business_error", {
          err: businessError.code,
          message: businessError.message,
          details: businessError.details,
        });
      } else {
        logger?.error("records_create_error", { err: String(err) });
      }
      next(err);
    }
  };

  // â”€â”€ UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updateHandler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);
      const { tenantId, principalId } = verifiedContext;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }
      if (rejectGenericDocumentMutation(res, table)) return;

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Remap form field names â†’ physical column names.
      // Strip columns that are system-managed and must never be set via PUT:
      //   is_active / is_deleted  â€” lifecycle flags owned by status transitions
      //   id / tenant_id          â€” identity, never mutable
      //   created_at / created_by â€” immutable creation audit
      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      // lock_token and expected_row_version are top-level concurrency fields alongside data
      const body = req.body as { data?: Record<string, unknown>; lock_token?: string; expected_row_version?: number };
      const inputData = body.data ?? {};

      // Resolve UUID from business key when caller passes a canonical key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const fieldDecision = validateEntityWriteFields({
        input: inputData,
        rules: writeRules,
        action: "update",
        validationMode: "strict",
        currentStatus: recordStatus,
      });
      if (hasFieldViolations(fieldDecision.violations)) {
        res.status(422).json({ error: "FIELDS_NOT_WRITABLE", fields: fieldDecision.violations });
        return;
      }

      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(fieldDecision.accepted)) {
        const columnName = writeRules.get(fieldName)!.column_name;
        assignMappedValue(mappedData, columnName, value);
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      const jsonColumns = await resolveJsonColumns(db, entityCode);
      includeMappedJsonObjects(mappedData, jsonColumns);

      // â”€â”€ Concurrency guard (lease_plus_version) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
      })) return;

      const policy = resolveConcurrencyPolicy(table.concurrency_policy);
      if (policy.strategy === "lease_plus_version") {
        const lockToken        = typeof body["lock_token"]         === "string" ? body["lock_token"]         : null;
        const expectedVersion  = typeof body["expected_row_version"] === "number" ? body["expected_row_version"] : null;

        if (policy.rollout === "enforced" || (policy.rollout === "optional" && lockToken !== null)) {
          if (!lockToken || !principalId) {
            res.status(423).json({ error: "LOCK_REQUIRED", message: "lock_token is required to edit this document" });
            return;
          }
          const lockCheck = await verifyLock(db, { tenantId, entityName: entityCode, recordId: physicalId, lockedBy: principalId, lockToken });
          if (!lockCheck.valid) {
            const status = lockCheck.reason === "expired" ? 410 : 423;
            res.status(status).json({ error: lockCheck.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID", reason: lockCheck.reason });
            return;
          }
          if (expectedVersion === null) {
            res.status(400).json({ error: "VERSION_REQUIRED", message: "expected_row_version is required when lock_token is provided" });
            return;
          }
        }

        if (policy.rollout === "observe" && lockToken) {
          const lockCheck = await verifyLock(db, { tenantId, entityName: entityCode, recordId: physicalId, lockedBy: principalId ?? "", lockToken });
          if (!lockCheck.valid) {
            logger?.warn("records_lock_observe_invalid", { entity: entityCode, id: physicalId, reason: lockCheck.reason });
          }
        }

        // Bind expectedVersion into the WHERE clause (null = skip version check)
        if (expectedVersion !== null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const versionRow = await (db.selectFrom(fullTable) as any)
            .select(["row_version"])
            .where("id", "=", physicalId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst() as { row_version: number } | undefined;

          if (!versionRow) {
            res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
            return;
          }
          if (versionRow.row_version !== expectedVersion) {
            res.status(409).json({ error: "VERSION_CONFLICT", message: "Document was modified by another user. Reload and try again.", current_version: versionRow.row_version });
            return;
          }
        }
      }
      // â”€â”€ end concurrency guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      // Fetch current state for before/after diff in activity log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldRow = (await (db.selectFrom(fullTable) as any)
        .selectAll()
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()) as Record<string, unknown> | undefined;

      // â”€â”€ Source-change validation (defaults.on_source_change, server layer) â”€â”€
      // Spec: docs/specs/entity_field_defaults.md Â§6
      if (oldRow) {
        const physicalToLogical = new Map<string, string>();
        for (const [logical, physical] of fieldMap.entries()) {
          physicalToLogical.set(physical, logical);
        }
        const currentLogicalRow: Record<string, unknown> = {};
        for (const [physical, value] of Object.entries(oldRow)) {
          currentLogicalRow[physicalToLogical.get(physical) ?? physical] = value;
        }

        const outcome = await applyServerSourceChangeActions({
          entityCode,
          currentRow:    currentLogicalRow,
          incomingPatch: inputData,
          db,
          tenantId,
          userId: principalId ?? SYSTEM_PRINCIPAL_UUID,
        });

        if (outcome.errors.length > 0) {
          res.status(422).json(buildSourceChangeErrorPayload(outcome.errors));
          return;
        }

        for (const logicalField of outcome.autoCleared) {
          const physicalCol = fieldMap.get(logicalField);
          if (physicalCol) mappedData[physicalCol] = null;
        }
        for (const [logicalField, value] of Object.entries(outcome.autoFilled)) {
          const physicalCol = fieldMap.get(logicalField);
          if (physicalCol) mappedData[physicalCol] = value;
        }
      }

      mergeJsonColumnUpdates(mappedData, oldRow, jsonColumns);
      markEditedIdentityName(mappedData, oldRow, inputData, table.identity_config, fieldMap);
      normalizeCommodityCategoryDomainGuards(entityCode, mappedData, oldRow);
      serializeJsonFields(mappedData, jsonColumns);

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      const diffBefore: Record<string, unknown> = {};
      const diffAfter: Record<string, unknown>  = {};
      for (const [fieldName, newValue] of Object.entries(inputData)) {
        const colName  = fieldMap.get(fieldName) ?? fieldName;
        const oldValue = oldRow ? readMappedValue(oldRow, colName) : null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }

      const row = await executeDurableMutationTransaction(db, async (trx) => {
        if (principalId) {
          await sql`select set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (trx.updateTable(fullTable) as any)
          .set(mappedData)
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (!updated) return updated;
        const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
        const eventType = `${entityCode}.updated`;
        const version = updated["row_version"] ?? 0;
        await writeRequiredRouteAudit(trx, {
          tenantId,
          entityType: entityCode,
          entityId: physicalId,
          operation: "update",
          actorId,
          actorType: "principal",
          oldValues: diffBefore,
          newValues: diffAfter,
          changedFields: Object.keys(diffAfter),
          correlationId: verifiedContext.correlationId ?? null,
          requestId: verifiedContext.requestId,
        });
        await emitOutboxEvent(trx, {
          tenantId,
          topic: "search",
          eventType,
          entityType: entityCode,
          entityId: physicalId,
          eventKey: buildDurableMutationEventKey({
            tenantId,
            entityType: entityCode,
            entityId: physicalId,
            version: String(version),
            eventType,
          }),
          actorId,
          payload: { requestId: verifiedContext.requestId, origin: "classic" },
        });
        return updated;
      });

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      let updatedRow = row as Record<string, unknown>;
      try {
        updatedRow = await enrichSingleReferenceLabels(db, {
          entityCode,
          tenantId:   tenantId ?? null,
          row:        updatedRow,
        }) ?? updatedRow;
      } catch (enrichErr) {
        logger?.warn("records_update_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
      }
      res.json(updatedRow);
    } catch (err) {
      logger?.error("records_update_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /records/:entity/:id/stream â€” Phase 11 #2 SSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Streams record-level events (currently `record.statusChanged`) to clients
  // that are actively editing this record. Subscribes to a per-record Redis
  // channel; in environments without Redis the endpoint still accepts the
  // connection and emits keepalive comments â€” clients can fall back to
  // periodic polling.
  //
  // Auth: bearer required + tenant resolution (same as every other records
  // endpoint). Read access is implicit â€” anyone who can read the record
  // can observe its status events.
  const KEEPALIVE_MS = 15_000;

  const recordStreamHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const fieldMap = await resolveFieldMap(db, entityCode);
      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Capture current etag + status so the client can compare incoming
      // events against the version it saw at connection time. Also serves
      // as the first event so reconnect logic gets a known-good baseline.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initialRow = await (db.selectFrom(fullTable) as any)
        .select(["status", "row_version"])
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst() as { status?: string; row_version?: number } | undefined;
      const initialEtag = String(initialRow?.row_version ?? 0);
      const initialStatus = typeof initialRow?.status === "string" ? initialRow.status : "unknown";
      const rawCursor = req.header("Last-Event-ID") ?? String(req.query["lastEventId"] ?? "");
      let durableCursor = /^\d+$/.test(rawCursor) ? Number(rawCursor) : 0;
      if (rawCursor) observeFrameworkInfrastructure("sse_reconnect", 1, { entity: entityCode });

      // â”€â”€ Redis subscription with 2s timeout fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Mirrors the collab activity SSE pattern: race subscribe() against
      // a short timeout so a down Redis degrades to keepalive-only mode.
      const channel = recordChannel(tenantId, entityCode, physicalId);
      let subscriber: RedisClient | undefined;
      let feedMode: "pubsub" | "keepalive-only" = "keepalive-only";

      if (redis) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          subscriber = redis.duplicate();
          await Promise.race([
            subscriber.subscribe(channel),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error("pubsub_timeout")), 2_000);
            }),
          ]);
          if (timeoutId) clearTimeout(timeoutId);
          feedMode = "pubsub";
        } catch (err) {
          if (timeoutId) clearTimeout(timeoutId);
          logger?.error("records_stream_subscribe_error", { err: String(err), entity: entityCode, recordId: physicalId });
          try { subscriber?.disconnect(); } catch { /* ignore */ }
          subscriber = undefined;
        }
      }

      // â”€â”€ SSE headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      res.setHeader("Content-Type",      "text/event-stream");
      res.setHeader("Cache-Control",     "no-cache, no-transform");
      res.setHeader("Connection",        "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("X-Feed-Mode",       feedMode);
      res.flushHeaders();

      const sendEvent = (event: string, data: unknown, cursor?: number): void => {
        try {
          const writable = res.write(`${cursor ? `id: ${cursor}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          if (!writable) {
            logger?.warn("records_stream_slow_client", { entity: entityCode, recordId: physicalId });
            observeFrameworkInfrastructure("sse_slow_client_disconnect", 1, { entity: entityCode });
            res.destroy();
          }
        } catch (err) {
          logger?.warn("records_stream_write_error", { err: String(err) });
        }
      };
      const sendKeepalive = (): void => {
        try { res.write(`:keepalive ${Date.now()}\n\n`); } catch { /* socket closed */ }
      };

      // Initial baseline event â€” lets the client compare incoming etag
      // against the one it observed at connection time without an extra
      // additional round-trip.
      sendEvent("record.connected", {
        etag:   initialEtag,
        status: initialStatus,
        cursor: durableCursor,
      });

      const retention = await sql<{ oldest_cursor: number | null }>`
        select min(cursor) as oldest_cursor
          from event.document_runtime_event
         where tenant_id = ${tenantId}
           and entity_code = ${entityCode}
           and document_id = ${physicalId}
      `.execute(db);
      const oldestCursor = Number(retention.rows[0]?.oldest_cursor ?? 0);
      if (durableCursor > 0 && oldestCursor > 0 && durableCursor < oldestCursor) {
        sendEvent("document.runtime.reset", {
          reason: "cursor_expired",
          action: "refetch_core",
          oldestCursor,
        });
        durableCursor = 0;
      }

      // PostgreSQL is the source of truth. Redis below only wakes this drain
      // early; periodic draining closes the wake-up loss window.
      let drainInFlight: Promise<void> | undefined;
      const drainDurableEvents = async (): Promise<void> => {
        if (drainInFlight) return drainInFlight;
        drainInFlight = (async () => {
        const events = await readDurableDocumentRuntimeEvents(db, {
          tenantId,
          entityCode,
          documentId: physicalId,
          afterCursor: durableCursor,
        });
        for (const event of events) {
          durableCursor = event.cursor;
          sendEvent(event.event_type, {
            documentVersion: event.document_version,
            affectedNodeKeys: event.affected_node_keys,
            ...event.payload,
            occurredAt: new Date(event.occurred_at).toISOString(),
          }, event.cursor);
        }
        })();
        try { await drainInFlight; } finally { drainInFlight = undefined; }
      };
      await drainDurableEvents();

      // Forward published events to this client.
      if (subscriber) {
        subscriber.on("message", (_channel: string, payload: string) => {
          void payload;
          void drainDurableEvents().catch((err) => {
            logger?.warn("records_stream_durable_drain_error", { err: String(err) });
          });
        });
      }

      const keepalive = setInterval(sendKeepalive, KEEPALIVE_MS);
      req.on("close", () => {
        clearInterval(keepalive);
        try { subscriber?.disconnect(); } catch { /* ignore */ }
      });
    } catch (err) {
      logger?.error("records_stream_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ Shared document mutation service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Shared transactional mutation service for document workspace submit.
  //   If-Match: <etag>
  //   Body: { header?: {...}, lines?: { create?, update?, delete? } }
  //
  // Phase 4 supports the `header` bundle. The `lines` bundle is forward-
  // declared in the versioned document submit contract and rejected
  // here with 501; transactional line writes land in Phase 6 alongside
  // virtual row editing.
  //
  // Response always includes a fresh etag + updated fieldMask + sectionMask
  // so the client can recompute editability if the save triggered a status
  // change. On etag mismatch returns 412 with { currentEtag } in the body.
  type DocumentEditChanges = {
    header?: Record<string, unknown>;
    collections?: Record<string, {
      create?: Record<string, unknown>[];
      update?: { id: string; data: Record<string, unknown> }[];
      delete?: string[];
    }>;
    /** Legacy v1 alias. Collection-aware callers use collections.<key>. */
    lines?: {
      create?: Record<string, unknown>[];
      update?: { id: string; data: Record<string, unknown> }[];
      delete?: string[];
    };
  };
  type DocumentEditMutationResult = {
    status: number;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  };

  /**
   * Transport-independent aggregate mutation. HTTP authentication, workspace
   * validation and header parsing belong to the route adapters below; every
   * database rule and side effect of a document save belongs here.
   */
  const applyDocumentEditMutation = async (input: {
    authorizationContext: import("@athyper/svc-iam").VerifiedRequestContext;
    tenantId: string;
    principalId: string | null;
    entityCode: string;
    recordId: string;
    expectedVersion: number;
    changes: DocumentEditChanges;
    idempotency: { key: string; requestHash: string; operationKey?: string };
    transition?: { code: string; payload?: Record<string, unknown> };
    allowEmptyChanges?: boolean;
  }): Promise<DocumentEditMutationResult> => {
    try {
      const {
        tenantId,
        principalId,
        entityCode,
        recordId: id,
        expectedVersion,
        changes: body,
        idempotency: runtimeIdempotency,
        transition,
        allowEmptyChanges = false,
      } = input;

      const target = await resolveDocumentEditMutationTarget(entityCode, id, tenantId);
      if (!target.ok) return target.result;
      const { table, fieldMap, fullTable, physicalId } = target;
      const lockConflict = await checkApplicableEditLock({
        table,
        tenantId,
        principalId,
        entityCode,
        recordId: physicalId,
      });
      if (lockConflict) return lockConflict;
      const headerPatch = body.header ?? {};
      const workflowStateFields = ["status", "workflow_status", "lifecycle_status", "state"];
      const clientWorkflowFields = workflowStateFields.filter((field) => Object.prototype.hasOwnProperty.call(headerPatch, field));
      const linesBundle = body.lines;
      let validatedLinesBundle = linesBundle;
      const hasHeader = Object.keys(headerPatch).length > 0;
      const hasLineCreates = (linesBundle?.create?.length ?? 0) > 0;
      const hasLineUpdates = (linesBundle?.update?.length ?? 0) > 0;
      const hasLineDeletes = (linesBundle?.delete?.length ?? 0) > 0;
      const hasLines = hasLineCreates || hasLineUpdates || hasLineDeletes;
      if (!hasHeader && !hasLines && !allowEmptyChanges) {
        return {
          status: 400,
          body: {
            error: "EMPTY_PATCH",
            message: "Document edit must contain at least one header field or line change.",
          },
        };
      }

      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      const touchTarget = hasHeader || !hasLines
        ? { table: fullTable }
        : resolveLineOnlyTouchTarget(entityCode, table);

      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const headerDecision = validateEntityWriteFields({
        input: headerPatch,
        rules: writeRules,
        action: "update",
        validationMode: "strict",
        currentStatus: recordStatus,
        pathPrefix: "header",
      });
      const aggregateFieldViolations: Record<string, MutationFieldViolationReason> = {
        ...headerDecision.violations,
      };
      for (const field of clientWorkflowFields) {
        aggregateFieldViolations[`header.${field}`] = "SYSTEM_MANAGED";
      }

      // Lines bundle guard: child-table convention must hold.
      const unsupportedLines = hasLines ? nonConventionalLineMutationError(entityCode) : null;
      if (unsupportedLines) return { status: 422, body: unsupportedLines };

      const mappedData: Record<string, unknown> = {};
      if (hasHeader) {
        for (const [fieldName, value] of Object.entries(headerDecision.accepted)) {
          const columnName = writeRules.get(fieldName)!.column_name;
          assignMappedValue(mappedData, columnName, value);
        }
        coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
        const jsonColumnsForHeader = await resolveJsonColumns(db, entityCode);
        includeMappedJsonObjects(mappedData, jsonColumnsForHeader);
      }
      // Always touch updated_at + updated_by so row_version bumps even on
      // lines-only saves â€” keeps the etag fresh for the next save.
      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();
      const jsonColumns = await resolveJsonColumns(db, entityCode);

      // Authorization (full RBAC + policy gate).
      const authorization = await checkEntityMutationAuthorization({
        db,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
        authorizationContext: input.authorizationContext,
      });
      if (!authorization.allowed) {
        return {
          status: authorization.status,
          body: {
            error: authorization.error,
            message: authorization.message,
            ...(authorization.decision !== undefined ? { decision: authorization.decision } : {}),
          },
        };
      }

      // Optimistic concurrency: If-Match â†’ expected row_version.
      if (hasHeader) {
        serializeJsonFields(mappedData, jsonColumns);
      }

      const lineBinding = await resolveEntityLineBinding(db, table);
      const linesTable = lineBinding.linesTable;
      const fkCol      = lineBinding.fkCol;
      const lineRefresher = tenantId ? getEntityLineRefresher(entityCode) : null;
      let lineWriteRules: Map<string, EntityWriteFieldRule> | undefined;

      // Child mutations are authorized against the child entity, never by
      // inheriting the aggregate root's update decision. This keeps document
      // workspace ownership independent from child CRUD permissions.
      if (hasLines) {
        const lineEntityCode = lineBinding.lineEntityCode;
        const lineTable = await resolveEntityTable(db, lineEntityCode);
        if (!lineTable) {
          return {
            status: 422,
            body: {
              error: "CHILD_COLLECTION_NOT_DECLARED",
              message: `Document line entity '${lineEntityCode}' is not available for workspace mutation.`,
            },
          };
        }
        const authorizeLineMutation = async (
          action: "create" | "update" | "delete",
          recordId?: string,
        ): Promise<DocumentEditMutationResult | null> => {
          const outcome = await checkEntityMutationAuthorization({
            db,
            table: toMutationTableInfo(lineTable),
            entityCode: lineEntityCode,
            tenantId,
            principalId,
            action,
            recordId,
            logger,
            authorizationContext: input.authorizationContext,
          });
          if (outcome.allowed) return null;
          return {
            status: outcome.status,
            body: {
              error: outcome.error,
              message: outcome.message,
              ...(outcome.decision !== undefined ? { decision: outcome.decision } : {}),
            },
          };
        };

        if (hasLineCreates) {
          const denial = await authorizeLineMutation("create");
          if (denial) return denial;
        }
        for (const line of linesBundle?.update ?? []) {
          const denial = await authorizeLineMutation("update", line.id);
          if (denial) return denial;
        }
        for (const lineId of linesBundle?.delete ?? []) {
          const denial = await authorizeLineMutation("delete", lineId);
          if (denial) return denial;
        }

        const resolvedLineWriteRules = withLineInputAliases(await resolveEntityWriteFieldRules(db, lineEntityCode));
        lineWriteRules = resolvedLineWriteRules;
        const validatedCreates = (linesBundle?.create ?? []).map((data, index) => {
          const decision = validateEntityWriteFields({
            input: data,
            rules: resolvedLineWriteRules,
            action: "create",
            validationMode: "strict",
            pathPrefix: `lines.create[${index}]`,
          });
          Object.assign(aggregateFieldViolations, decision.violations);
          return decision.accepted;
        });
        const validatedUpdates = (linesBundle?.update ?? []).map((line, index) => {
          const decision = validateEntityWriteFields({
            input: line.data,
            rules: resolvedLineWriteRules,
            action: "update",
            validationMode: "strict",
            currentStatus: recordStatus,
            pathPrefix: `lines.update[${index}]`,
          });
          Object.assign(aggregateFieldViolations, decision.violations);
          return { ...line, data: decision.accepted };
        });
        validatedLinesBundle = {
          create: validatedCreates,
          update: validatedUpdates,
          delete: linesBundle?.delete,
        };
      }

      if (hasFieldViolations(aggregateFieldViolations)) {
        return {
          status: 422,
          body: { error: "FIELDS_NOT_WRITABLE", fields: aggregateFieldViolations },
        };
      }

      // Phase 8: capture lines that need post-commit classification. Per-line
      // POST/PATCH endpoints classify inline after the row commits; the
      // bundle handler matches that by collecting affected line IDs during
      // the transaction and running classification after commit. Failures
      // here are best-effort and do NOT roll back the bundle.
      const isApBundleEntity = isPurchaseInvoiceLineMutation(table);
      type ClassifyCandidate = {
        lineId: string;
        body?: Record<string, unknown>;
      };
      const classifyCandidates: ClassifyCandidate[] = [];

      let conflictEtag: string | null = null;
      let oldRow: Record<string, unknown> | undefined;

      const mutation = await executeDurableMutationTransaction(db, async (trx) => {
        const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
        const idempotency = await claimDocumentRuntimeIdempotency(trx, {
          tenantId,
          principalId: actorId,
          entityCode,
          documentId: physicalId,
          idempotencyKey: runtimeIdempotency.key,
          requestHash: runtimeIdempotency.requestHash,
          operationKey: runtimeIdempotency.operationKey,
        });
        if (idempotency.kind === "replay") return idempotency;
        if (idempotency.kind === "in_progress" || idempotency.kind === "mismatch") return idempotency;

        // Header UPDATE â€” always runs so row_version bumps even on lines-only
        // saves. mappedData carries at minimum updated_by + updated_at.
        // Lock the aggregate root before checking row_version so concurrent
        // concurrent workspace submits cannot both pass the same optimistic check.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let lockQuery = (trx.selectFrom(touchTarget.table) as any)
          .selectAll()
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId);
        if (touchTarget.extraWhere) {
          lockQuery = lockQuery.where(touchTarget.extraWhere.column, "=", touchTarget.extraWhere.value);
        }
        const lockedRow = (await lockQuery
          .forUpdate()
          .executeTakeFirst()) as Record<string, unknown> | undefined;

        if (!lockedRow) return { kind: "not_found" as const };

        const currentVersion = Number(lockedRow["row_version"]);
        if (currentVersion !== expectedVersion) {
          conflictEtag = String(currentVersion);
          return { kind: "conflict" as const };
        }

        oldRow = lockedRow;
        if (hasHeader) {
          mergeJsonColumnUpdates(mappedData, oldRow, jsonColumns);
          normalizeCommodityCategoryDomainGuards(entityCode, mappedData, oldRow);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let updateQuery = (trx.updateTable(touchTarget.table) as any)
          .set(mappedData)
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId);
        if (touchTarget.extraWhere) {
          updateQuery = updateQuery.where(touchTarget.extraWhere.column, "=", touchTarget.extraWhere.value);
        }
        const updatedRow = await updateQuery
          .returningAll()
          .executeTakeFirst();

        if (!updatedRow) return { kind: "not_found" as const };

        // Lines bundle inside the same transaction. Order: delete â†’ update â†’
        // create. Deletes first avoids constraint violations when a create
        // reuses a line_no slot. Creates last so auto-numbering sees the
        // post-delete state.
        if (hasLineDeletes) {
          for (const lineId of validatedLinesBundle!.delete!) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (trx.deleteFrom(linesTable) as any)
              .where("id", "=", lineId)
              .where(fkCol, "=", physicalId)
              .where("tenant_id", "=", tenantId)
              .execute();
          }
        }

        if (hasLineUpdates) {
          for (const { id: lineId, data } of validatedLinesBundle!.update!) {
            const patchRow = lineBodyToDb(data, fkCol, physicalId, tenantId, lineWriteRules);
            delete patchRow["tenant_id"];
            delete patchRow[fkCol];
            // Phase 8: apply purchase_invoice derived amounts + metadata merge
            // inside the transaction so the final UPDATE writes both user
            // fields and derived ones in a single round-trip. Helpers are
            // tenant-aware and no-op on non-AP entities.
            await applyDerivedPatchLineAmounts(trx, linesTable, fkCol, physicalId, lineId, tenantId, data, patchRow);
            await mergePatchLineMetadata(trx, linesTable, fkCol, physicalId, lineId, tenantId, patchRow);
            await stripGeneratedLineColumns(trx, linesTable, patchRow);
            await stripUnavailableLineColumns(trx, linesTable, patchRow);
            if (Object.keys(patchRow).length === 0) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (trx.updateTable(linesTable) as any)
              .set(patchRow)
              .where("id", "=", lineId)
              .where(fkCol, "=", physicalId)
              .where("tenant_id", "=", tenantId)
              .execute();

            const childEffect = getEntityLineChildEffect(entityCode);
            if (childEffect) {
              await childEffect(trx, {
                tenantId,
                parentId:      physicalId,
                lineId,
                principalId:   principalId || null,
                changedFields: Object.keys(data),
                mode:          "update",
              });
            }

            if (lineRefresher) {
              await lineRefresher(trx, {
                tenantId,
                parentId:    physicalId,
                lineId,
                principalId: principalId || null,
              });
            }

            if (isApBundleEntity) {
              classifyCandidates.push({ lineId, body: data });
            }
          }
        }

        if (hasLineCreates) {
          // Phase 8: pre-resolve the "AP standalone line" UOM default and
          // parent-source-doc flag once per bundle (rather than per line) since
          // they're invariant across creates within the same save.
          const parentHasSourceDocumentForBundle = isApBundleEntity
            ? await purchaseInvoiceHasSourceDocument(trx, physicalId, tenantId)
            : false;
          let cachedStandaloneUom: string | null = null;
          const resolveStandaloneUom = async (): Promise<string | null> => {
            if (cachedStandaloneUom !== null) return cachedStandaloneUom;
            cachedStandaloneUom = await resolveDefaultProcurementLineUom(trx, tenantId);
            return cachedStandaloneUom;
          };

          let nextLineNo: number | null = null;
          for (const lineData of validatedLinesBundle!.create!) {
            const insertRow = lineBodyToDb(lineData, fkCol, physicalId, tenantId, lineWriteRules);
            await applyParentLineCreateDefaults(trx, table, physicalId, tenantId, insertRow);
            await applyItemLineCreateDefaults(trx, tenantId, insertRow);
            if (insertRow["line_no"] == null) {
              if (nextLineNo == null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const maxRow = await (trx.selectFrom(linesTable) as any)
                  .select((eb: any) => eb.fn.max("line_no").as("max_no"))
                  .where(fkCol, "=", physicalId)
                  .where("tenant_id", "=", tenantId)
                  .executeTakeFirst() as { max_no: number | null } | undefined;
                nextLineNo = (maxRow?.max_no ?? 0) + 1;
              }
              insertRow["line_no"] = nextLineNo;
              nextLineNo++;
            }
            // AP standalone line default UOM (matches per-line POST behavior).
            if (
              isApBundleEntity
              && !isPresentLineValue(insertRow["item_id"])
              && !requestHasLineSourceDocument(lineData, insertRow)
              && !parentHasSourceDocumentForBundle
            ) {
              const uom = await resolveStandaloneUom();
              if (uom && !insertRow["uom_code"]) insertRow["uom_code"] = uom;
            }
            if (!insertRow["item_description"]) insertRow["item_description"] = "";
            normalizeLineCreateUnits(insertRow);
            if (!isPresentLineValue(insertRow["uom_code"]) && isProcurementLineEntity(lineBinding.lineEntityCode)) {
              insertRow["uom_code"] = await resolveDefaultProcurementLineUom(trx, tenantId);
            }
            if (insertRow["quantity"]   == null) insertRow["quantity"]   = 1;
            if (insertRow["unit_price"] == null) insertRow["unit_price"] = 0;
            // Phase 8: derived amount fields (gross_amount from qty*price etc.)
            // computed inside the transaction so the INSERT writes them.
            applyDerivedCreateLineAmounts(insertRow, lineData);
            await stripGeneratedLineColumns(trx, linesTable, insertRow);
            await stripUnavailableLineColumns(trx, linesTable, insertRow);
            insertRow["created_by"] = principalId;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inserted = await (trx.insertInto(linesTable) as any)
              .values(insertRow)
              .returning(["id"])
              .executeTakeFirstOrThrow() as { id: string };

            const defaulter = getEntityLineDefaulter(entityCode);
            if (defaulter) {
              await defaulter(trx, {
                tenantId,
                parentId:    physicalId,
                lineId:      inserted.id,
                principalId: principalId || null,
              });
            }

            const childEffect = getEntityLineChildEffect(entityCode);
            if (childEffect) {
              await childEffect(trx, {
                tenantId,
                parentId:      physicalId,
                lineId:        inserted.id,
                principalId:   principalId || null,
                changedFields: Object.keys(lineData),
                mode:          "create",
              });
            }

            if (isApBundleEntity && inserted.id) {
              classifyCandidates.push({ lineId: inserted.id, body: lineData });
            }
          }
        }

        const affectedNodeKeys = await resolveCompiledRuntimeInvalidationNodes(trx, {
          entityVersionId: table.version_id,
          changedFields: Object.keys(headerPatch),
          itemsMutated: hasLines,
        });
        const runtimeVersion = await advanceDocumentRuntimeState(trx, {
          tenantId,
          entityCode,
          documentId: physicalId,
          actorId,
          affectedNodeKeys,
          // Preserve the established event vocabulary during transport migration.
          eventType: "document.edit_session_committed",
          payload: {
            headerFields: Object.keys(headerPatch).sort(),
            lineCreates: linesBundle?.create?.length ?? 0,
            lineUpdates: linesBundle?.update?.length ?? 0,
            lineDeletes: linesBundle?.delete?.length ?? 0,
          },
        });

        // The existing search outbox is part of the same unit of work. A
        // committed document version can therefore never exist without its
        // corresponding downstream indexing signal.
        await emitOutboxEvent(trx, {
          tenantId,
          topic: "entity_mutation",
          eventType: `${entityCode}.updated`,
          eventKey: buildDurableMutationEventKey({
            tenantId,
            entityType: entityCode,
            entityId: physicalId,
            version: runtimeVersion.documentVersion,
            eventType: `${entityCode}.updated`,
          }),
          entityType: entityCode,
          entityId: physicalId,
          actorId,
          payload: {
            origin: "workspace",
            requestId: input.authorizationContext.requestId,
            durableCategories: ["search", "cache", "realtime", "notifications", "integrations"],
          },
        });

        if (transition) {
          await emitOutboxEvent(trx, {
            tenantId,
          topic: "wf",
          eventType: "document.edit_transition.requested",
          eventKey: buildDurableMutationEventKey({
            tenantId,
            entityType: entityCode,
            entityId: physicalId,
            version: runtimeVersion.documentVersion,
            eventType: "document.edit_transition.requested",
          }),
            entityType: entityCode,
            entityId: physicalId,
            aggregateType: "document_edit",
            aggregateId: physicalId,
            actorId,
            payload: {
              actionCode: transition.code,
              actionPayload: transition.payload ?? {},
              documentVersion: runtimeVersion.documentVersion,
              transactionality: "staged_with_compensate",
              recoverableState: "mutation_committed_action_pending",
            },
          });
        }

        const finalStatusInTransaction = await fetchRecordStatus(trx, fullTable, physicalId, tenantId);
        const { fieldMask: committedFieldMask, sectionMask: committedSectionMask } = buildDocumentWorkspaceDraftMasks(
          writeRules,
          finalStatusInTransaction,
        );
        const committedRow = updatedRow as Record<string, unknown>;
        const committedResponse = {
          record: {
            id: physicalId,
            data: committedRow,
            status: typeof committedRow["status"] === "string"
              ? committedRow["status"]
              : (finalStatusInTransaction ?? "unknown"),
          },
          etag: String(committedRow["row_version"] ?? expectedVersion + 1),
          status: typeof committedRow["status"] === "string"
            ? committedRow["status"]
            : (finalStatusInTransaction ?? "unknown"),
          fieldMask: committedFieldMask,
          sectionMask: committedSectionMask,
          invalidations: [
            { type: "core", key: "record" },
            ...affectedNodeKeys.map((key) => ({ type: "node", key })),
          ],
          documentVersion: runtimeVersion.documentVersion,
          ...(transition ? {
            actionResult: {
              code: transition.code,
              state: "mutation_committed_action_pending",
              recoverable: true,
              transactionality: "staged_with_compensate",
            },
          } : {}),
        };
        await writeRequiredRouteAudit(trx, {
          tenantId,
          entityType: entityCode,
          entityId: physicalId,
          operation: "update",
          actorId,
          oldValues: oldRow ?? null,
          newValues: committedRow,
          changedFields: [
            ...Object.keys(headerPatch).map((field) => `header.${field}`),
            ...(hasLines ? ["collections.lines"] : []),
          ],
          reasonCode: transition ? `workspace:${transition.code}` : "workspace:save",
        });
        await completeDocumentRuntimeIdempotency(trx, {
          id: idempotency.id,
          actorId,
          response: committedResponse,
        });
        return { kind: "committed" as const, row: committedRow, response: committedResponse };
      }, { tenantId, principalId: principalId ?? SYSTEM_PRINCIPAL_UUID });

      if (mutation?.kind === "mismatch") {
        return {
          status: 409,
          body: {
            error: "IDEMPOTENCY_KEY_REUSED",
            message: "Idempotency-Key was already used with a different document edit request.",
          },
        };
      }

      if (mutation?.kind === "in_progress") {
        return {
          status: 409,
          body: {
            error: "IDEMPOTENCY_IN_PROGRESS",
            message: "An identical document edit is already in progress. Retry shortly with the same Idempotency-Key.",
          },
        };
      }

      if (mutation?.kind === "replay") {
        return {
          status: 200,
          body: mutation.response,
          headers: { "X-Document-Edit-Cache": "idempotency" },
        };
      }

      if (conflictEtag || mutation?.kind === "conflict") {
        return {
          status: 412,
          body: {
            error: "VERSION_CONFLICT",
            message: "Document was modified by another user.",
            currentEtag: conflictEtag,
          },
        };
      }

      if (!mutation || mutation.kind === "not_found") {
        return { status: 404, body: { error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` } };
      }

      // Phase 8: post-commit classification pass for purchase_invoice bundle lines.
      // Mirrors the per-line POST/PATCH semantics where classification runs
      // inline after the row commits. Best-effort â€” individual failures are
      // logged but do NOT roll back the bundle (which is already committed).
      if (isApBundleEntity && classifyCandidates.length > 0) {
        for (const candidate of classifyCandidates) {
          try {
            const refreshed = await refreshLineRow(db, linesTable, fkCol, physicalId, candidate.lineId, tenantId);
            if (!refreshed) continue;
            await maybeClassifyPurchaseInvoiceLine({
              table,
              linesTable,
              fkCol,
              tenantId,
              principalId,
              invoiceId:  physicalId,
              lineId:     candidate.lineId,
              lineRow:    refreshed,
              body:       candidate.body,
            });
          } catch (err) {
            logger?.warn("records_document_edit_bundle_classify_error", {
              entity:  entityCode,
              lineId:  candidate.lineId,
              err:     err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      return { status: 200, body: mutation.response };
    } catch (err) {
      logger?.error("records_document_edit_mutation_error", { err: String(err) });
      throw err;
    }
  };

  aggregateBoundaryHandlers.set(DOCUMENT_WORKSPACE_AGGREGATE_HANDLER, async (command) => {
    const lineChanges = command.changes.collections["lines"];
    const mutation = await applyDocumentEditMutation({
      authorizationContext: command.context,
      tenantId: command.context.tenantId,
      principalId: command.context.principalId,
      entityCode: command.entityCode,
      recordId: command.recordId,
      expectedVersion: command.expectedVersion!,
      changes: {
        header: { ...command.changes.header.patch },
        ...(lineChanges ? {
          lines: {
            create: lineChanges.create?.map((value) => ({ ...value })),
            update: lineChanges.update?.map((value) => ({ id: value.id, data: { ...value.patch } })),
            delete: lineChanges.delete ? [...lineChanges.delete] : undefined,
          },
        } : {}),
      },
      idempotency: {
        key: command.idempotencyKey!,
        requestHash: command.requestHash ?? createHash("sha256").update(JSON.stringify({
          entityCode: command.entityCode,
          recordId: command.recordId,
          expectedVersion: command.expectedVersion,
          changes: command.changes,
          transition: command.transition,
          planHash: command.planHash,
        })).digest("hex"),
        operationKey: "document.edit_submit",
      },
      ...(command.transition ? {
        transition: {
          code: command.transition.code,
          payload: command.transition.payload ? { ...command.transition.payload } : undefined,
        },
      } : {}),
      allowEmptyChanges: Boolean(command.transition),
    });
    if (mutation.status >= 400) {
      return { kind: "AggregateRejected", status: mutation.status, body: mutation.body };
    }
    const version = typeof mutation.body["etag"] === "string"
      ? Number(mutation.body["etag"])
      : undefined;
    return {
      kind: "Committed",
      action: "aggregate",
      entityCode: command.entityCode,
      recordId: command.recordId,
      record: mutation.body,
      ...(Number.isFinite(version) ? { version } : {}),
      replayed: mutation.headers?.["X-Document-Edit-Cache"] === "idempotency",
      durableSideEffects: true,
    };
  });

  // â”€â”€ PATCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Partial update. Accepts either:
  //   Flat body:   { fieldName: value, ... }          â€” used by KanbanView status transitions
  //   Wrapped:     { data: { fieldName: value, ... } } â€” matches PUT convention
  // Only the provided fields are written; omitted fields are left unchanged.
  const documentEditSubmitHandler: RequestHandler = async (req, res, next) => {
    const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
    const recordId = req.params["id"] as string;
    const startedAt = Date.now();
    res.once("finish", () => {
      logger?.info?.("records_document_edit_submit_request", {
        transportMode: "workspace_submit",
        entityCode,
        recordId,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: res.statusCode >= 200 && res.statusCode < 400 ? "success" : "failure",
        idempotencyReplay: res.getHeader("X-Document-Edit-Cache") === "idempotency",
        workspaceHeaderPresent: Boolean(req.header("X-Document-Edit-Workspace")),
      });
    });
    try {
      const actor = await resolveDocumentEditMutationActor(req, res, recordId);
      if (!actor) return;
      const verifiedContext = requireVerifiedContext(req, res);

      const parsed = DocumentEditSubmitRequestV1Schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          error: "VALIDATION",
          message: "The document submit request is invalid.",
          fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [
            issue.path.length > 0 ? issue.path.map(String).join(".") : "request",
            issue.message,
          ])),
        });
        return;
      }
      if (parsed.data.intent === "save_and_transition" && documentSaveAndTransitionDisabled(
        actor.tenantId,
        entityCode,
      )) {
        res.status(409).json({
          error: "SAVE_AND_TRANSITION_DISABLED",
          message: "Save and transition is temporarily disabled for this document entity.",
        });
        return;
      }

      const expectedVersion = readDocumentEditExpectedVersion(req, res, "document submit");
      if (expectedVersion === null) return;
      const suppliedIdempotencyKey = req.header("Idempotency-Key")?.trim();
      if (!suppliedIdempotencyKey) {
        res.status(428).json({
          error: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key header is required for document submit.",
        });
        return;
      }

      const target = await resolveDocumentEditMutationTarget(entityCode, recordId, actor.tenantId);
      if (!target.ok) {
        writeDocumentEditMutationResult(res, target.result);
        return;
      }
      const capability = String(req.header("X-Document-Edit-Workspace") ?? "")
        .split(",")
        .map((value) => value.trim())
        .find(Boolean);
      if (!capability) {
        res.status(428).json({ error: "WORKSPACE_REQUIRED", message: "Open the document workspace before submitting changes." });
        return;
      }
      const workspace = inspectDocumentWorkspaceCapability({
        token: capability,
        tenantId: actor.tenantId,
        principalId: actor.principalId,
        entityCode,
        recordId: target.physicalId,
        profile: target.isProvisional ? "create" : "edit",
      });
      if (!workspace.valid) {
        const error = workspace.reason === "profile"
          ? "WORKSPACE_PROFILE_DENIED"
          : workspace.reason === "stale" ? "STALE_WORKSPACE" : "INVALID_WORKSPACE";
        res.status(workspace.reason === "profile" ? 403 : 409).json({
          error,
          message: workspace.reason === "stale"
            ? "The document workspace is stale. Open it again before submitting."
            : "The document workspace is not valid for this submit operation.",
        });
        return;
      }
      const currentPlanHashes = await resolveDocumentRuntimePlanHashes(db, target.table.version_id);
      if (currentPlanHashes.length > 0 && !currentPlanHashes.includes(workspace.planHash)) {
        res.status(409).json({
          error: "STALE_WORKSPACE",
          message: "The document edit plan changed. Open the workspace again before submitting.",
        });
        return;
      }

      const submit = parsed.data;
      const collectionChanges = submit.changes.collections ?? {};
      const submittedCollectionChanges = new Map(Object.entries(collectionChanges));
      if (submit.changes.lines) submittedCollectionChanges.set("lines", submit.changes.lines);
      const declaredCollections = await resolveDocumentRuntimeChildCollections(db, target.table.version_id);
      for (const [key, changes] of submittedCollectionChanges) {
        const collection = declaredCollections.find((candidate) => candidate.key === key);
        if (!collection) {
          res.status(422).json({
            error: "CHILD_COLLECTION_NOT_DECLARED",
            message: `Child collection '${key}' is not declared as workspace-owned by the authoritative runtime plan.`,
            collection: key,
          });
          return;
        }
        const denied = [
          (changes.create?.length ?? 0) > 0 && !collection.mutationPolicy.create ? "create" : null,
          (changes.update?.length ?? 0) > 0 && !collection.mutationPolicy.update ? "update" : null,
          (changes.delete?.length ?? 0) > 0 && !collection.mutationPolicy.delete ? "delete" : null,
        ].filter((operation): operation is string => operation !== null);
        if (denied.length > 0) {
          res.status(403).json({
            error: "CHILD_MUTATION_DENIED",
            message: `The runtime plan does not permit one or more '${key}' mutations.`,
            collection: key,
            operations: denied,
          });
          return;
        }
      }
      const unsupportedCollections = [...submittedCollectionChanges.keys()].filter((key) => key !== "lines");
      // This service is the trust boundary. Until a collection has a
      // transactional storage binding, reject it explicitly instead of
      // accepting a BFF-validated payload and silently dropping its writes.
      if (unsupportedCollections.length > 0) {
        res.status(422).json({
          error: "CHILD_COLLECTION_NOT_DECLARED",
          message: "One or more child collections do not have an authoritative workspace mutation binding.",
          collections: unsupportedCollections,
        });
        return;
      }
      const normalizedChanges: AggregateChangeSet = {
        header: { patch: submit.changes.header ?? {} },
        collections: Object.fromEntries([...submittedCollectionChanges.entries()].map(([key, changes]) => [
          key,
          {
            ...(changes.create ? { create: changes.create } : {}),
            ...(changes.update ? {
              update: changes.update.map((value) => ({ id: value.id, patch: value.data })),
            } : {}),
            ...(changes.delete ? { delete: changes.delete } : {}),
          },
        ])),
      };
      if (submit.intent === "save_and_transition") {
        const preflight = await runDocumentSubmitPreflight(entityCode, actor.tenantId, target.physicalId);
        const blockers = Array.isArray(preflight["blockers"]) ? preflight["blockers"] : [];
        if (preflight["ok"] === false || blockers.length > 0) {
          res.status(422).json({
            error: "SUBMIT_PREFLIGHT_FAILED",
            message: "Resolve the submit blockers before continuing.",
            ...preflight,
          });
          return;
        }
      }

      const idempotency = buildDocumentRuntimeIdempotency({
        request: req,
        entityCode,
        recordId: target.physicalId,
        expectedVersion,
        body: submit,
        operationKey: "document.edit_submit",
      });
      const mutation = await entityMutationService.mutateAggregate({
        context: verifiedContext,
        entityCode,
        recordId: target.physicalId,
        expectedVersion,
        changes: normalizedChanges,
        planHash: workspace.planHash,
        invalidationGraph: [],
        idempotencyKey: suppliedIdempotencyKey,
        requestHash: idempotency.requestHash,
        origin: "workspace",
        validationMode: "strict",
        ...(submit.intent === "save_and_transition" && submit.action
          ? { transition: submit.action }
          : {}),
      });
      if (mutation.kind !== "Committed") {
        const mapped = mapMutationResultToHttp(mutation);
        writeDocumentEditMutationResult(res, mapped);
        return;
      }
      const mutationBody = mutation.record ?? {};
      if (mutation.replayed) res.setHeader("X-Document-Edit-Cache", "idempotency");
      writeDocumentEditMutationResult(res, {
        status: 200,
        body: {
          ...mutationBody,
          ok: true,
          intent: submit.intent,
        },
      });
    } catch (error) {
      logger?.error("records_document_edit_submit_error", {
        entityCode,
        recordId,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  };

  async function resolveDocumentEditMutationTarget(
    entityCode: string,
    recordId: string,
    tenantId: string,
  ) {
    const table = await resolveEntityTable(db, entityCode);
    if (!table) {
      return {
        ok: false as const,
        result: {
          status: 404,
          body: { error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` },
        },
      };
    }
    const fieldMap = await resolveFieldMap(db, entityCode);
    const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
    const physicalId = UUID_RE.test(recordId)
      ? recordId
      : String((await resolveRecordRow(
        db,
        fullTable,
        recordId,
        table.natural_key_fields,
        fieldMap,
        tenantId,
      ))?.id ?? "");
    if (!physicalId) {
      return {
        ok: false as const,
        result: {
          status: 404,
          body: { error: "RECORD_NOT_FOUND", message: `Record '${recordId}' not found` },
        },
      };
    }
    let isProvisional = false;
    if (stringConfigValue(table.feature_flags["backing_source"]) === "commitment") {
      const provisional = await (db.selectFrom(fullTable) as any)
        .select("is_provisional")
        .where("tenant_id", "=", tenantId)
        .where("id", "=", physicalId)
        .executeTakeFirst() as { is_provisional?: boolean } | undefined;
      if (!provisional) {
        return {
          ok: false as const,
          result: { status: 404, body: { error: "RECORD_NOT_FOUND", message: `Record '${recordId}' not found` } },
        };
      }
      isProvisional = provisional.is_provisional === true;
    }
    return { ok: true as const, table, fieldMap, fullTable, physicalId, isProvisional };
  }

  async function resolveDocumentEditMutationActor(
    req: Request,
    res: Response,
    _recordId: string,
  ): Promise<{ tenantId: string; principalId: string | null } | null> {
    const { tenantId, principalId } = requireVerifiedContext(req, res);
    return { tenantId, principalId };
  }

  function readDocumentEditExpectedVersion(
    req: Request,
    res: Response,
    lifecycle: string,
  ): number | null {
    const value = req.headers["if-match"];
    const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
    if (!raw) {
      res.status(428).json({
        error: "PRECONDITION_REQUIRED",
        message: `If-Match header is required for ${lifecycle} writes.`,
      });
      return null;
    }
    const normalized = raw.trim().replace(/^W\//i, "").replace(/^"(\d+)"$/, "$1");
    if (!/^\d+$/.test(normalized)) {
      res.status(400).json({ error: "BAD_ETAG", message: "If-Match must be a numeric etag." });
      return null;
    }
    return Number.parseInt(normalized, 10);
  }

  async function checkApplicableEditLock(input: {
    table: EntityTableInfo;
    tenantId: string;
    principalId: string | null;
    entityCode: string;
    recordId: string;
  }): Promise<DocumentEditMutationResult | null> {
    const policy = resolveConcurrencyPolicy(input.table.concurrency_policy);
    if (policy.strategy !== "lease_plus_version" || policy.rollout === "observe") return null;
    const editLock = await getLockStatus(db, {
      tenantId: input.tenantId,
      entityName: input.entityCode,
      recordId: input.recordId,
    });
    if (!editLock.locked || editLock.lockedBy === input.principalId) return null;
    return {
      status: 423,
      body: {
        error: "LOCKED",
        message: "This record is locked by another editor.",
        locked_by: editLock.lockedBy,
        expires_at: editLock.expiresAt,
      },
    };
  }

  function writeDocumentEditMutationResult(res: Response, result: DocumentEditMutationResult): void {
    for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
    res.status(result.status).json(result.body);
  }

  const patchHandler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);
      const { tenantId, principalId } = verifiedContext;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }
      if (rejectGenericDocumentMutation(res, table)) return;

      // Unwrap body â€” support both flat and { data: {...} } forms
      const body = req.body as Record<string, unknown>;
      const inputData: Record<string, unknown> =
        typeof body["data"] === "object" && body["data"] !== null && !Array.isArray(body["data"])
          ? (body["data"] as Record<string, unknown>)
          : Object.fromEntries(Object.entries(body).filter(([name]) =>
              name !== "lock_token" && name !== "expected_row_version"));

      if (Object.keys(inputData).length === 0) {
        res.status(400).json({ error: "EMPTY_PATCH", message: "PATCH body must contain at least one field" });
        return;
      }

      // Map logical field names â†’ physical column names
      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve UUID from business key when caller passes a canonical key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const fieldDecision = validateEntityWriteFields({
        input: inputData,
        rules: writeRules,
        action: "update",
        validationMode: "strict",
        currentStatus: recordStatus,
      });
      if (hasFieldViolations(fieldDecision.violations)) {
        res.status(422).json({ error: "FIELDS_NOT_WRITABLE", fields: fieldDecision.violations });
        return;
      }

      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(fieldDecision.accepted)) {
        const columnName = writeRules.get(fieldName)!.column_name;
        assignMappedValue(mappedData, columnName, value);
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      const jsonColumns = await resolveJsonColumns(db, entityCode);
      includeMappedJsonObjects(mappedData, jsonColumns);

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      // â”€â”€ Concurrency guard (lease_plus_version) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
      })) return;

      const expectedVersion = readDocumentEditExpectedVersion(req, res, "entity patch");
      if (expectedVersion === null) return;
      const suppliedIdempotencyKey = req.header("Idempotency-Key")?.trim();
      if (!suppliedIdempotencyKey) {
        res.status(428).json({
          error: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key header is required for entity PATCH.",
        });
        return;
      }
      if (suppliedIdempotencyKey.length > 256) {
        res.status(400).json({ error: "BAD_IDEMPOTENCY_KEY", message: "Idempotency-Key must not exceed 256 characters." });
        return;
      }
      const lockConflict = await checkApplicableEditLock({ table, tenantId, principalId, entityCode, recordId: physicalId });
      if (lockConflict) {
        writeDocumentEditMutationResult(res, lockConflict);
        return;
      }
      // â”€â”€ end concurrency guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      // Fetch current state for before/after diff in activity log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldRow = (await (db.selectFrom(fullTable) as any)
        .selectAll()
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()) as Record<string, unknown> | undefined;

      // â”€â”€ Source-change validation (defaults.on_source_change, server layer) â”€â”€
      // Spec: docs/specs/entity_field_defaults.md Â§6
      if (oldRow) {
        const physicalToLogical = new Map<string, string>();
        for (const [logical, physical] of fieldMap.entries()) {
          physicalToLogical.set(physical, logical);
        }
        const currentLogicalRow: Record<string, unknown> = {};
        for (const [physical, value] of Object.entries(oldRow)) {
          currentLogicalRow[physicalToLogical.get(physical) ?? physical] = value;
        }

        const outcome = await applyServerSourceChangeActions({
          entityCode,
          currentRow:    currentLogicalRow,
          incomingPatch: inputData,
          db,
          tenantId,
          userId: principalId ?? SYSTEM_PRINCIPAL_UUID,
        });

        if (outcome.errors.length > 0) {
          res.status(422).json(buildSourceChangeErrorPayload(outcome.errors));
          return;
        }

        for (const logicalField of outcome.autoCleared) {
          const physicalCol = fieldMap.get(logicalField);
          if (physicalCol) mappedData[physicalCol] = null;
        }
        for (const [logicalField, value] of Object.entries(outcome.autoFilled)) {
          const physicalCol = fieldMap.get(logicalField);
          if (physicalCol) mappedData[physicalCol] = value;
        }
      }

      mergeJsonColumnUpdates(mappedData, oldRow, jsonColumns);
      markEditedIdentityName(mappedData, oldRow, inputData, table.identity_config, fieldMap);
      normalizeCommodityCategoryDomainGuards(entityCode, mappedData, oldRow);
      serializeJsonFields(mappedData, jsonColumns);

      const diffBefore: Record<string, unknown> = {};
      const diffAfter: Record<string, unknown>  = {};
      for (const [fieldName, newValue] of Object.entries(inputData)) {
        const colName  = fieldMap.get(fieldName) ?? fieldName;
        const oldValue = oldRow ? readMappedValue(oldRow, colName) : null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }

      const runtimeIdempotency = buildDocumentRuntimeIdempotency({
        request: req,
        entityCode,
        recordId: physicalId,
        expectedVersion,
        body: inputData,
        operationKey: "entity.patch",
      });

      const mutation = await executeDurableMutationTransaction(db, async (trx) => {
        if (principalId) {
          await sql`select set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
        }
        const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
        const idempotency = await claimDocumentRuntimeIdempotency(trx, {
          tenantId,
          principalId: actorId,
          entityCode,
          documentId: physicalId,
          idempotencyKey: runtimeIdempotency.key,
          requestHash: runtimeIdempotency.requestHash,
          operationKey: "entity.patch",
        });
        if (idempotency.kind === "replay") return idempotency;
        if (idempotency.kind === "in_progress" || idempotency.kind === "mismatch") return idempotency;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let updateQuery = (trx.updateTable(fullTable) as any)
          .set(mappedData)
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId);
        if (expectedVersion !== null) {
          updateQuery = updateQuery.where("row_version", "=", expectedVersion);
        }
        const updatedRow = await updateQuery
          .returningAll()
          .executeTakeFirst();
        if (!updatedRow) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const current = await (trx.selectFrom(fullTable) as any)
            .select(["row_version"])
            .where("id", "=", physicalId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst() as { row_version: number } | undefined;
          await releaseDocumentRuntimeIdempotency(trx, idempotency.id);
          return current
            ? { kind: "conflict" as const, currentVersion: current.row_version }
            : { kind: "not_found" as const };
        }
        const committedRow = updatedRow as Record<string, unknown>;
        const eventType = `${entityCode}.updated`;
        const version = committedRow["row_version"] ?? expectedVersion ?? 0;
        await writeRequiredRouteAudit(trx, {
          tenantId,
          entityType: entityCode,
          entityId: physicalId,
          operation: "update",
          actorId,
          actorType: "principal",
          oldValues: diffBefore,
          newValues: diffAfter,
          changedFields: Object.keys(diffAfter),
          correlationId: verifiedContext.correlationId ?? null,
          requestId: verifiedContext.requestId,
        });
        await emitOutboxEvent(trx, {
          tenantId,
          topic: "search",
          eventType,
          entityType: entityCode,
          entityId: physicalId,
          eventKey: buildDurableMutationEventKey({
            tenantId,
            entityType: entityCode,
            entityId: physicalId,
            version: String(version),
            eventType,
          }),
          actorId,
          payload: { requestId: verifiedContext.requestId, origin: "classic" },
        });
        let responseRow = updatedRow as Record<string, unknown>;
        try {
          responseRow = await enrichSingleReferenceLabels(trx, {
            entityCode,
            tenantId,
            row: responseRow,
          }) ?? responseRow;
        } catch (enrichErr) {
          logger?.warn("records_patch_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
        }
        await completeDocumentRuntimeIdempotency(trx, {
          id: idempotency.id,
          actorId,
          response: responseRow,
        });
        return { kind: "committed" as const, row: responseRow };
      });

      if (mutation.kind === "mismatch") {
        res.status(409).json({
          error: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency-Key was already used with a different entity PATCH request.",
        });
        return;
      }
      if (mutation.kind === "in_progress") {
        res.status(409).json({
          error: "IDEMPOTENCY_IN_PROGRESS",
          message: "An identical entity PATCH is already in progress. Retry with the same Idempotency-Key.",
        });
        return;
      }
      if (mutation.kind === "conflict") {
        res.status(412).json({
          error: "VERSION_CONFLICT",
          message: "Record was modified by another user. Reload and try again.",
          current_version: mutation.currentVersion,
          currentEtag: String(mutation.currentVersion),
        });
        return;
      }
      if (mutation.kind === "not_found") {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }
      if (mutation.kind === "replay") {
        const replay = mutation.response;
        if (typeof replay["row_version"] === "number") {
          res.setHeader("ETag", `"${String(replay["row_version"])}"`);
        }
        res.setHeader("X-Idempotency-Cache", "replay");
        res.json(replay);
        return;
      }
      const row = mutation.row;

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      let patchedRow = row as Record<string, unknown>;
      try {
        patchedRow = await enrichSingleReferenceLabels(db, {
          entityCode,
          tenantId:   tenantId ?? null,
          row:        patchedRow,
        }) ?? patchedRow;
      } catch (enrichErr) {
        logger?.warn("records_patch_enrich_labels_failed", { entity: entityCode, err: String(enrichErr) });
      }
      if (typeof patchedRow["row_version"] === "number") {
        res.setHeader("ETag", `"${String(patchedRow["row_version"])}"`);
      }
      res.json(patchedRow);
    } catch (err) {
      logger?.error("records_patch_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ DELETE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const deleteHandler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);
      const { tenantId, principalId } = verifiedContext;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }
      if (rejectGenericDocumentMutation(res, table)) return;

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve UUID from business key so the delete is always by primary key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, new Map(), tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "delete",
        recordId: physicalId,
        logger,
      })) return;

      const expectedVersion = readDocumentEditExpectedVersion(req, res, "entity delete");
      if (expectedVersion === null) return;
      const idempotencyKey = req.header("Idempotency-Key")?.trim();
      if (!idempotencyKey) {
        res.status(428).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required for entity DELETE." });
        return;
      }
      const result = await entityMutationService.delete({
        context: verifiedContext,
        entityCode,
        recordId: physicalId,
        expectedVersion,
        lockToken: req.header("X-Lock-Token")?.trim(),
        idempotencyKey,
        origin: "classic",
        validationMode: "strict",
      });
      if (result.kind !== "Committed") {
        const mapped = mapMutationResultToHttp(result);
        res.status(mapped.status).json(mapped.body);
        return;
      }

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      // Phase 11 #2: notify any other clients viewing this record so their
      // SSE handler can route them to the list (or show an "Item removed"
      // banner). Mirrors the statusChanged emit on save.
      publishRecordEvent(tenantId, entityCode, physicalId, "record.deleted", {
        actorId: principalId ?? null,
      }, new Date().toISOString());

      res.status(204).end();
    } catch (err) {
      logger?.error("records_delete_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ DEBUG (dev only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const debugHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const table = await resolveEntityTable(db, entityCode);

      const fieldRows = await db
        .selectFrom("control.entity_field as ef")
        .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
        .innerJoin("control.entity as e", "e.id", "ev.entity_id")
        .select(["ef.name", "ef.column_name", "ef.data_type", "ef.is_active", "ef.is_required", "ef.origin", "ev.status as version_status"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .execute();

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantCode = xOrg.split("--")[0] ?? null;
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const sub = readJwtSubject(claims);
      const principalId = sub && tenantId ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims) : null;

      res.json({
        entity: table,
        fields: fieldRows,
        tenant: { xOrg, xRealm, tenantCode, resolvedId: tenantId },
        principal: { sub, resolvedId: principalId },
      });
    } catch (err) {
      logger?.error("records_debug_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ Sub-resource stubs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Return { data: [] } once auth + entity are verified.
  // Each sub-resource will be replaced with a real implementation when the
  // backing service layer is ready.
  function subResourceStub(subPath: string): RequestHandler {
    return async (req, res, next) => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;
        const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
        const table = await resolveEntityTable(db, entityCode);
        if (!table) {
          res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
          return;
        }
        res.json({ data: [] });
      } catch (err) {
        logger?.error(`records_${subPath.replace(/-/g, "_")}_error`, { err: String(err) });
        next(err);
      }
    };
  }

  // â”€â”€ GET /:entity/:id/submit-preflight â€” pre-submit blocker/warning check â”€â”€
  // Read-only; surfaces the same financial/structural blockers the actual
  // submit handler would hit, plus a couple of soft warnings (partial
  // payment received, no manual distributions). Currently dispatches by
  // entity_code; only purchase_invoice has real checks today â€” other
  // entities return ok:true with empty lists so the client can mount the
  // hook uniformly without conditional wiring.
  async function runDocumentSubmitPreflight(
    entityCode: string,
    tenantId: string,
    recordId: string,
  ): Promise<Record<string, unknown>> {
    if (entityCode === "purchase_invoice") {
      return await purchaseInvoiceSubmitPreflight(db, tenantId, recordId) as unknown as Record<string, unknown>;
    }
    if (entityCode === "purchase_order") {
      return await purchaseOrderSubmitPreflight(db, tenantId, recordId) as unknown as Record<string, unknown>;
    }
    return { ok: true, blockers: [], warnings: [] };
  }

  const submitPreflightHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id = req.params["id"] as string;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      res.json(await runDocumentSubmitPreflight(entityCode, tenantId, id));

      // Generic stub for other entities â€” empty preflight means "no
      // pre-submit checks defined". The client renders nothing in that case.
    } catch (err) {
      logger?.error("records_submit_preflight_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /:entity/:id/distributions â€” accounting_distribution by source_doc_id â”€
  const distributionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("document.accounting_distribution")
          .selectAll()
          .where("source_doc_id", "=", id);
        if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
        q = q
          .orderBy("source_line_id", "asc")
          .orderBy("distribution_no", "asc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      // Reference-label hydration for the AD drawer (and any other consumer
      // of this subresource). Same contract as the generic listHandler.
      try {
        rows = await enrichWithReferenceLabels(db, {
          entityCode: "accounting_distribution",
          tenantId:   tenantId ?? null,
          rows,
        });
      } catch (enrichErr) {
        logger?.warn("records_distributions_enrich_labels_failed", { err: String(enrichErr) });
      }

      res.json({ data: rows });
    } catch (err) {
      logger?.error("records_distributions_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /:entity/:id/lines/:lineId/distributions â€” per-line distributions â”€â”€â”€â”€â”€â”€â”€
  const lineDistributionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id     = req.params["id"]     as string;
      const lineId = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const lineBinding = await resolveEntityLineBinding(db, table);
      const sourceDocType = sourceDocTypeForLineEntity(lineBinding.lineEntityCode);
      if (!sourceDocType) {
        res.status(400).json({ error: "UNSUPPORTED_DISTRIBUTION_PARENT" });
        return;
      }

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("document.accounting_distribution")
          .selectAll()
          .where("source_doc_type", "=", sourceDocType)
          .where("source_doc_id",  "=", id)
          .where("source_line_id", "=", lineId);
        if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
        q = q.orderBy("distribution_no", "asc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      try {
        rows = await enrichWithReferenceLabels(db, {
          entityCode: "accounting_distribution",
          tenantId:   tenantId ?? null,
          rows,
        });
      } catch (enrichErr) {
        logger?.warn("records_line_distributions_enrich_labels_failed", { err: String(enrichErr) });
      }

      res.json({ data: rows });
    } catch (err) {
      logger?.error("records_line_distributions_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /:entity/:id/workflow â€” document.workflow_request + stages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const workflowHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("document.workflow_request as wr")
          .select([
            "wr.id", "wr.workflow_type", "wr.entity_type", "wr.entity_id",
            "wr.status", "wr.decision", "wr.decided_by", "wr.decided_at",
            "wr.reason", "wr.requested_by", "wr.requested_at",
            "wr.metadata", "wr.created_at", "wr.updated_at",
          ] as never[])
          .where("wr.entity_type" as never, "=", entityCode as never)
          .where("wr.entity_id"   as never, "=", recordId   as never);
        if (tenantId) q = q.where("wr.tenant_id" as never, "=", tenantId as never);
        q = q.orderBy("wr.requested_at" as never, "desc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      // Attach stages (with SLA metrics) to each workflow_request
      const enriched = await Promise.all(rows.map(async (wr) => {
        let stageRows: Record<string, unknown>[] = [];
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stageRows = await (db as any)
            .selectFrom("document.workflow_stage as ws")
            .leftJoin("control.workflow_sla_policy as sp", "sp.id" as never, "ws.sla_policy_id" as never)
            .select([
              "ws.id", "ws.stage_no", "ws.name", "ws.mode",
              "ws.status", "ws.outcome", "ws.started_at", "ws.completed_at",
              "sp.code as sla_code", "sp.name as sla_name", "sp.timers as sla_timers",
            ] as never[])
            .where("ws.workflow_request_id" as never, "=", (wr["id"] as string) as never)
            .orderBy("ws.stage_no" as never, "asc")
            .execute();
        } catch { stageRows = []; }

        // Compute SLA metrics per stage
        const now = Date.now();
        const stages = stageRows.map((ws) => {
          const timers = ws["sla_timers"] as Array<{ after_minutes: number; action: string }> | null;
          // sla_target_hours = first timer's after_minutes / 60 (the breach/escalate timer)
          const escalateTimer = timers?.find((t) => t.action === "escalate") ?? timers?.[0];
          const slaTargetHours = escalateTimer ? escalateTimer.after_minutes / 60 : undefined;

          const startedAt  = ws["started_at"]   ? new Date(ws["started_at"] as string).getTime()   : undefined;
          const completedAt = ws["completed_at"] ? new Date(ws["completed_at"] as string).getTime() : undefined;

          const slaDeadlineMs = startedAt && slaTargetHours
            ? startedAt + slaTargetHours * 3_600_000 : undefined;
          const slaDeadline = slaDeadlineMs
            ? new Date(slaDeadlineMs).toISOString() : undefined;

          const elapsedToMs = completedAt ?? now;
          const timeElapsedHours = startedAt
            ? (elapsedToMs - startedAt) / 3_600_000 : undefined;

          let slaStatus: string | undefined;
          if (slaTargetHours !== undefined && timeElapsedHours !== undefined) {
            const ratio     = timeElapsedHours / slaTargetHours;
            const isActive  = ws["status"] === "active" || ws["status"] === "pending";
            if (!isActive)         slaStatus = ratio <= 1 ? "completed_ok" : "completed_late";
            else if (ratio > 1)    slaStatus = "breached";
            else if (ratio >= 0.75) slaStatus = "at_risk";
            else                   slaStatus = "on_track";
          }

          // Omit raw timers JSONB from client response â€” replace with computed fields
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { sla_timers: _timers, ...rest } = ws as Record<string, unknown>;
          return {
            ...rest,
            sla_target_hours:    slaTargetHours,
            sla_deadline:        slaDeadline,
            time_elapsed_hours:  timeElapsedHours !== undefined ? Math.round(timeElapsedHours * 10) / 10 : undefined,
            sla_status:          slaStatus,
          };
        });

        return { ...wr, stages };
      }));

      res.json({ data: enriched });
    } catch (err) {
      logger?.error("records_workflow_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /:entity/:id/approvals â€” event.work_item (task_type=approval) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const approvalsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("event.work_item as wi")
          .innerJoin("document.workflow_request as wr", "wr.id" as never, "wi.workflow_request_id" as never)
          .leftJoin("master.principal_profile as pp", "pp.principal_id" as never, "wi.assignee_id" as never)
          .select([
            "wi.id", "wi.task_type", "wi.workflow_request_id", "wi.workflow_stage_id",
            "wi.assignee_id", "wi.designated_id",
            "wi.order_index", "wi.status", "wi.decision", "wi.reason",
            "wi.assigned_at", "wi.started_at", "wi.completed_at", "wi.due_at",
            "wi.metadata",
            "pp.display_name as assignee_display_name",
            "pp.given_name as assignee_given_name",
            "pp.family_name as assignee_family_name",
          ] as never[])
          .where("wr.entity_type" as never, "=", entityCode as never)
          .where("wr.entity_id"   as never, "=", recordId   as never);
        if (tenantId) q = q.where("wi.tenant_id" as never, "=", tenantId as never);
        q = q
          .orderBy("wi.order_index" as never, "asc")
          .orderBy("wi.created_at"  as never, "asc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      res.json({ data: rows });
    } catch (err) {
      logger?.error("records_approvals_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /:entity/:id/approvals â€” add an ad-hoc approver to the active workflow â”€
  const addApproverHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;

      const body       = (req.body ?? {}) as Record<string, unknown>;
      const assigneeId = typeof body["assignee_id"] === "string" ? body["assignee_id"] : null;
      const reason     = typeof body["reason"]      === "string" ? body["reason"]      : null;

      if (!assigneeId) {
        res.status(400).json({ error: "MISSING_ASSIGNEE", message: "assignee_id is required" });
        return;
      }

      // Find the active workflow_request for this entity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wr = await (db as any)
        .selectFrom("document.workflow_request as wr")
        .select(["wr.id"] as never[])
        .where("wr.entity_type" as never, "=", entityCode as never)
        .where("wr.entity_id"   as never, "=", recordId   as never)
        .where("wr.tenant_id"   as never, "=", tenantId   as never)
        .where("wr.status"      as never, "=", "pending"  as never)
        .orderBy("wr.requested_at" as never, "desc")
        .limit(1)
        .executeTakeFirst() as { id: string } | undefined;

      if (!wr) {
        res.status(422).json({ error: "NO_ACTIVE_WORKFLOW", message: "No pending workflow request found for this record" });
        return;
      }

      // Find the currently active stage (link ad-hoc item to it if one exists)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stage = await (db as any)
        .selectFrom("document.workflow_stage as ws")
        .select(["ws.id"] as never[])
        .where("ws.workflow_request_id" as never, "=", (wr["id"] as string) as never)
        .where("ws.status"              as never, "in", (["pending", "active"] as unknown) as never)
        .orderBy("ws.stage_no" as never, "asc")
        .limit(1)
        .executeTakeFirst() as { id: string } | undefined;

      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserted = await (db as any)
        .insertInto("event.work_item")
        .values({
          tenant_id:           tenantId,
          task_type:           "approval",
          workflow_request_id: wr["id"],
          workflow_stage_id:   stage?.id ?? null,
          designated_id:       assigneeId,
          assignee_id:         assigneeId,
          order_index:         99,
          status:              "assigned",
          assigned_at:         now,
          metadata:            JSON.stringify({ added_manually: true, ...(reason ? { reason } : {}) }),
          created_by:          principalId ?? SYSTEM_PRINCIPAL_UUID,
        })
        .returningAll()
        .executeTakeFirst() as Record<string, unknown>;

      res.status(201).json({ ok: true, data: inserted });
    } catch (err) {
      logger?.error("records_add_approver_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ Helpers shared by line mutation handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function rejectNonConventionalLineMutation(res: Response, entityCode: string): boolean {
    const error = nonConventionalLineMutationError(entityCode);
    if (error) {
      res.status(422).json(error);
      return true;
    }
    return false;
  }

  function nonConventionalLineMutationError(entityCode: string): Record<string, unknown> | null {
    if (entityCode === "journal_entry") {
      return {
        error: "UNSUPPORTED_LINE_MUTATION",
        message: "Journal Entry lines use document.journal_line and require a GL account plus debit or credit amounts. Use the journal editor flow or /api/finance/journals instead.",
      };
    }

    if (entityCode === "payment_entry") {
      return {
        error: "UNSUPPORTED_LINE_MUTATION",
        message: "Payment Entry allocation lines are derived from payment allocation data and cannot be changed through the generic records line endpoint.",
      };
    }

    return null;
  }

  const LINE_PRICE_FIELDS = ["quantity", "unit_price", "price_unit"];
  const LINE_AMOUNT_DERIVATION_FIELDS = [
    ...LINE_PRICE_FIELDS,
    "discount_pct",
    "discount_amount",
    "tax_amount",
    "withholding_tax_amount",
    "retention_pct",
    "retention_amount",
  ];

  function hasOwnBodyField(body: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, key);
  }

  function isEmptyAmountValue(value: unknown): boolean {
    return value == null || (typeof value === "string" && value.trim() === "");
  }

  function isPresentLineValue(value: unknown): boolean {
    return value != null && (typeof value !== "string" || value.trim() !== "");
  }

  function requestHasLineSourceDocument(body: Record<string, unknown>, row: Record<string, unknown>): boolean {
    return [
      body["commitment_line_id"],
      body["receipt_line_id"],
      body["service_sheet_line_id"],
      row["commitment_line_id"],
      row["receipt_line_id"],
      row["service_sheet_line_id"],
    ].some(isPresentLineValue);
  }

  function isProcurementLineEntity(entityCode: string): boolean {
    return [
      "commitment_line",
      "purchase_requisition_line",
      "purchase_invoice_line",
      "receipt_line",
      "service_sheet_line",
    ].includes(entityCode);
  }

  // Phase 8: helpers below accept an explicit `kysely` executor so the bundle
  // applyDocumentEditMutation can run them inside its transaction. Pass `db`
  // from per-line handlers (they're not wrapped in tx) or `trx` from inside
  // `db.transaction().execute(async (trx) => ...)` for bundle operations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function purchaseInvoiceHasSourceDocument(kysely: Kysely<any>, invoiceId: string, tenantId: string | null): Promise<boolean> {
    if (!tenantId) return false;
    const row = await sql<{ commitment_id: string | null }>`
      SELECT commitment_id
      FROM document.purchase_invoice
      WHERE id = ${invoiceId}::uuid
        AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `.execute(kysely);
    return Boolean(row.rows[0]?.commitment_id);
  }

  function explicitLineAmount(body: Record<string, unknown>): number | null {
    const raw = hasOwnBodyField(body, "gross_amount") && !isEmptyAmountValue(body["gross_amount"])
      ? body["gross_amount"]
      : hasOwnBodyField(body, "line_amount") && !isEmptyAmountValue(body["line_amount"])
      ? body["line_amount"]
      : undefined;
    if (raw === undefined) return null;
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : null;
  }

  function finiteNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function lineGrossAmount(
    quantity: unknown,
    unitPrice: unknown,
    priceUnit: unknown,
  ): number {
    const qty   = finiteNumber(quantity, 1);
    const price = finiteNumber(unitPrice, 0);
    const unit  = finiteNumber(priceUnit, 1);
    return (qty * price) / (unit || 1);
  }

  function normalizeLineCreateUnits(row: Record<string, unknown>): void {
    const rawPriceUnit = row["price_unit"];
    if (rawPriceUnit == null || rawPriceUnit === "") {
      row["price_unit"] = 1;
      return;
    }

    const numericPriceUnit = Number(rawPriceUnit);
    if (Number.isFinite(numericPriceUnit) && numericPriceUnit > 0) {
      row["price_unit"] = numericPriceUnit;
      return;
    }

    if (!isPresentLineValue(row["uom_code"]) && typeof rawPriceUnit === "string") {
      row["uom_code"] = normalizeDefaultProcurementLineUom(rawPriceUnit);
    }
    row["price_unit"] = 1;
  }

  function applyDerivedCreateLineAmounts(
    row:  Record<string, unknown>,
    body: Record<string, unknown>,
  ): void {
    const amount = explicitLineAmount(body);
    if (amount !== null) {
      row["quantity"]     = 1;
      row["unit_price"]   = amount;
      row["price_unit"]   = 1;
      row["gross_amount"] = amount;
      return;
    }
    row["gross_amount"] = lineGrossAmount(
      row["quantity"],
      row["unit_price"],
      row["price_unit"] ?? 1,
    );
  }

  async function applyDerivedPatchLineAmounts(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    fkCol: string,
    parentId: string,
    lineId: string,
    tenantId: string | null,
    body: Record<string, unknown>,
    patchRow: Record<string, unknown>,
  ): Promise<void> {
    const hasDerivedInputChange = LINE_AMOUNT_DERIVATION_FIELDS.some((field) => hasOwnBodyField(body, field));
    const amount = hasDerivedInputChange ? null : explicitLineAmount(body);
    if (amount !== null) {
      patchRow["quantity"]     = 1;
      patchRow["unit_price"]   = amount;
      patchRow["price_unit"]   = 1;
      patchRow["gross_amount"] = amount;
      if (hasOwnBodyField(body, "uom_code") && isEmptyAmountValue(body["uom_code"])) {
        delete patchRow["uom_code"];
      }
      return;
    }

    const priceFieldChanged = LINE_PRICE_FIELDS.some((field) => hasOwnBodyField(body, field));
    if (!priceFieldChanged) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (kysely as any)
      .selectFrom(linesTable)
      .select(["quantity", "unit_price", "price_unit"] as never[])
      .where("id" as never, "=", lineId as never)
      .where(fkCol as never, "=", parentId as never);
    if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

    const current = await q.executeTakeFirst() as Record<string, unknown> | undefined;
    if (!current) return;

    patchRow["gross_amount"] = lineGrossAmount(
      hasOwnBodyField(body, "quantity")   ? body["quantity"]   : current["quantity"],
      hasOwnBodyField(body, "unit_price") ? body["unit_price"] : current["unit_price"],
      hasOwnBodyField(body, "price_unit") ? body["price_unit"] : current["price_unit"],
    );
  }

  async function mergePatchLineMetadata(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    fkCol: string,
    parentId: string,
    lineId: string,
    tenantId: string | null,
    patchRow: Record<string, unknown>,
  ): Promise<void> {
    const metadataPatch = patchRow["metadata"];
    if (!metadataPatch || typeof metadataPatch !== "object" || Array.isArray(metadataPatch)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (kysely as any)
      .selectFrom(linesTable)
      .select(["metadata"] as never[])
      .where("id" as never, "=", lineId as never)
      .where(fkCol as never, "=", parentId as never);
    if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

    const current = await q.executeTakeFirst() as Record<string, unknown> | undefined;
    patchRow["metadata"] = {
      ...asPlainObject(current?.["metadata"]),
      ...(metadataPatch as Record<string, unknown>),
    };
  }

  /** Maps a DocumentLine-shaped request body to the DB column set for the line table. */
  function lineBodyToDb(
    body: Record<string, unknown>,
    fkCol: string,
    parentId: string,
    tenantId: string | null,
    writeRules?: ReadonlyMap<string, EntityWriteFieldRule>,
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if (tenantId)                              row["tenant_id"]      = tenantId;
    row[fkCol]                                                       = parentId;
    const directColumns = [
      "line_no",
      "company_code_id",
      "item_description",
      "procurement_type",
      "line_type",
      "item_id",
      "commodity_category_id",
      "business_intent_id",
      "classification_decision",
      "asset_class_id",
      "uom_code",
      "quantity",
      "unit_price",
      "price_unit",
      "currency_code",
      "gross_amount",
      "over_delivery_tolerance",
      "under_delivery_tolerance",
      "tax_group_id",
      "withholding_tax_group_id",
      "tax_amount",
      "withholding_tax_amount",
      "required_by_date",
      "warehouse_id",
      "storage_location",
      "shipto_address_id",
      "billto_address_id",
      "billfrom_address_id",
      "supplier_id",
      "shipfrom_address_id",
      "remitto_address_id",
      "discount_pct",
      "discount_amount",
      "retention_pct",
      "retention_amount",
      "cost_center_id",
      "profit_center_id",
      "project_id",
      "site_id",
      "match_status",
      "matched_quantity",
      "commitment_line_id",
      "receipt_line_id",
      "service_sheet_line_id",
      // source_binding (jsonb) â€” written by @athyper/runtime-add-item adapters
      // (catalog / open_po_line / open_receipt_line / open_service_sheet_line
      // / manual_invoice_line). The column was added to
      // document.purchase_invoice_line in DDL 01s_tables_source_binding.sql
      // with a CHECK constraint that gates shape. INSERT only succeeds
      // against line tables that have the column; if a future line entity
      // is wired through the framework but hasn't had the column added,
      // PostgreSQL will reject with "column source_binding does not exist".
      "source_binding",
    ];

    for (const column of directColumns) {
      if (body[column] !== undefined) row[column] = body[column];
    }

    if (body["line_number"] != null)           row["line_no"]        = Number(body["line_number"]);
    if (body["description"]   !== undefined)   row["item_description"] = body["description"] ?? "";
    if (body["line_type"]     != null)         row["line_type"]      = body["line_type"];
    if (body["type"]          != null && row["line_type"] === undefined) row["line_type"] = body["type"];
    if (body["unit_code"]     !== undefined)   row["uom_code"]       = body["unit_code"]   ?? "";
    if (body["procurementType"] !== undefined) row["procurement_type"] = body["procurementType"];
    // Framework-side adapters use camelCase (`sourceBinding`); DB column is
    // snake_case. Accept both forms at the boundary so consumers don't have
    // to translate. Shape is validated server-side by the DB CHECK
    // constraint (must be an object with a string `sourceType` field) and
    // client-side by SourceBindingSchema in @athyper/runtime-contracts.
    if (body["sourceBinding"] !== undefined)   row["source_binding"]  = body["sourceBinding"];
    if (body["quantity"]      !== undefined)   row["quantity"]       = body["quantity"]    ?? 1;
    if (body["unit_price"]    !== undefined)   row["unit_price"]     = body["unit_price"]  ?? 0;
    if (body["line_amount"]   !== undefined)   row["gross_amount"]   = body["line_amount"] ?? 0;
    if (body["tax_group_id"]  !== undefined)   row["tax_group_id"]    = body["tax_group_id"] ?? null;
    if (body["withholding_tax_group_id"] !== undefined) row["withholding_tax_group_id"] = body["withholding_tax_group_id"] ?? null;
    if (body["tax_amount"]    !== undefined)   row["tax_amount"]     = body["tax_amount"]  ?? 0;
    if (body["withholding_tax_amount"] !== undefined) row["withholding_tax_amount"] = body["withholding_tax_amount"] ?? 0;
    if (body["discount_pct"]  !== undefined)   row["discount_pct"]   = body["discount_pct"]  ?? 0;
    if (body["discount_amount"] !== undefined) row["discount_amount"] = body["discount_amount"] ?? 0;
    if (hasOwnBodyField(body, "gross_amount") && isEmptyAmountValue(body["gross_amount"])) {
      delete row["gross_amount"];
    }
    if (hasOwnBodyField(body, "line_amount") && isEmptyAmountValue(body["line_amount"])) {
      delete row["gross_amount"];
    }
    // Metadata-backed logical fields have no dedicated DB column.
    const data = body["data"];
    const hasData = data && typeof data === "object" && !Array.isArray(data);
    const metadataAliases = [
      "item_code",
      "tax_code",
      "unspsc_code",
      "hs_code",
      "trade_code",
      "commodity_code",
      "commodity_domain",
      "commodity_domain_code",
      "line_commodity_code",
    ];
    const hasMetaAliases = metadataAliases.some((alias) => body[alias] !== undefined);
    if (hasData || hasMetaAliases) {
      const aliasData = Object.fromEntries(
        metadataAliases
          .filter((alias) => body[alias] !== undefined)
          .map((alias) => [alias, body[alias]]),
      );
      row["metadata"] = {
        ...(hasData ? data as Record<string, unknown> : {}),
        ...aliasData,
      };
    }
    // Metadata remains the authority for fields beyond the legacy adapter's
    // convenience aliases. Every field accepted by strict validation is
    // therefore guaranteed to reach its compiled physical projection.
    for (const [name, value] of Object.entries(body)) {
      const columnName = writeRules?.get(name)?.column_name;
      if (columnName) assignMappedValue(row, columnName, value);
    }
    return row;
  }

  function withLineInputAliases(
    rules: ReadonlyMap<string, EntityWriteFieldRule>,
  ): Map<string, EntityWriteFieldRule> {
    const expanded = new Map(rules);
    const aliases: Record<string, string> = {
      line_number: "line_no",
      description: "item_description",
      type: "line_type",
      unit_code: "uom_code",
      procurementType: "procurement_type",
      sourceBinding: "source_binding",
      line_amount: "gross_amount",
      data: "metadata",
      item_code: "metadata",
      tax_code: "metadata",
      unspsc_code: "metadata",
      hs_code: "metadata",
      trade_code: "metadata",
      commodity_code: "metadata",
      commodity_domain: "metadata",
      commodity_domain_code: "metadata",
      line_commodity_code: "metadata",
    };
    for (const [alias, target] of Object.entries(aliases)) {
      const rule = rules.get(target);
      if (rule) expanded.set(alias, {
        ...rule,
        name: alias,
        column_name: target === "metadata" && alias !== "data" ? `metadata.${alias}` : rule.column_name,
      });
    }
    return expanded;
  }

  async function applyParentLineCreateDefaults(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    table: EntityTableInfo,
    parentId: string,
    tenantId: string | null,
    row: Record<string, unknown>,
  ): Promise<void> {
    if (row["company_code_id"] && row["currency_code"]) return;

    try {
      const parentTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (kysely as any)
        .selectFrom(parentTable)
        .select(["company_code_id", "currency_code"] as never[])
        .where("id" as never, "=", parentId as never);
      if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

      const parent = await q.executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row["company_code_id"] && parent?.["company_code_id"]) {
        row["company_code_id"] = parent["company_code_id"];
      }
      if (!row["currency_code"] && parent?.["currency_code"]) {
        row["currency_code"] = parent["currency_code"];
      }
    } catch {
      // Some conventional parents do not expose both defaults; their line DDL
      // either does not need them or will raise the appropriate DB constraint.
    }
  }

  async function applyItemLineCreateDefaults(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    tenantId: string | null,
    row: Record<string, unknown>,
  ): Promise<void> {
    const itemId = row["item_id"];
    if (!tenantId || !isPresentLineValue(itemId)) return;

    try {
      const item = await (kysely as any)
        .selectFrom("master.item")
        .select(["name", "uom_code", "commodity_category_id"] as never[])
        .where("tenant_id" as never, "=", tenantId as never)
        .where("id" as never, "=", itemId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!item) return;
      if (!isPresentLineValue(row["item_description"]) && item["name"]) {
        row["item_description"] = item["name"];
      }
      if (!isPresentLineValue(row["uom_code"]) && item["uom_code"]) {
        row["uom_code"] = item["uom_code"];
      }
      if (!isPresentLineValue(row["commodity_category_id"]) && item["commodity_category_id"]) {
        row["commodity_category_id"] = item["commodity_category_id"];
      }
    } catch {
      // Best effort enrichment; required fields are still validated below/DB-side.
    }
  }

  async function stripGeneratedLineColumns(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    row: Record<string, unknown>,
  ): Promise<void> {
    const [schemaName, tableName] = linesTable.split(".");
    if (!schemaName || !tableName) return;

    try {
      const result = await sql<{ column_name: string }>`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = ${schemaName}
           AND table_name = ${tableName}
           AND is_generated <> 'NEVER'
      `.execute(kysely);

      for (const generated of result.rows) {
        delete row[generated.column_name];
      }
    } catch {
      // Best effort; the DB remains the final guard for invalid writes.
    }
  }

  async function stripUnavailableLineColumns(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    row: Record<string, unknown>,
  ): Promise<void> {
    const [schemaName, tableName] = linesTable.split(".");
    if (!schemaName || !tableName) return;

    try {
      const result = await sql<{ column_name: string }>`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = ${schemaName}
           AND table_name = ${tableName}
      `.execute(kysely);
      const physicalColumns = new Set(result.rows.map((item) => item.column_name));

      for (const column of Object.keys(row)) {
        if (!physicalColumns.has(column)) delete row[column];
      }
    } catch {
      // Best effort; the DB remains the final guard for invalid writes.
    }
  }

  /** Normalises a raw DB line row back to the DocumentLine contract shape. */
  function normaliseLineRow(r: Record<string, unknown>, fkCol: string): Record<string, unknown> {
    const meta = (r["metadata"] as Record<string, unknown> | undefined) ?? {};
    return {
      ...r,
      document_id:             r[fkCol]                              ?? r["document_id"],
      line_number:             r["line_no"]                          ?? r["line_number"],
      description:             r["item_description"]                 ?? r["description"],
      unit_code:               r["uom_code"]                         ?? r["unit_code"],
      line_amount:             r["gross_amount"] ?? r["net_amount"]  ?? r["line_amount"],
      net_amount:              r["net_amount"]   ?? null,
      gross_amount:            r["gross_amount"] ?? null,
      item_code:               meta["item_code"] ?? r["item_code"]   ?? null,
      tax_code:                meta["tax_code"]  ?? r["tax_code"]    ?? null,
      unspsc_code:             meta["unspsc_code"] ?? r["unspsc_code"] ?? null,
      hs_code:                 meta["hs_code"] ?? meta["trade_code"] ?? r["hs_code"] ?? null,
      trade_code:              meta["trade_code"] ?? meta["hs_code"] ?? r["trade_code"] ?? null,
      discount_pct:            r["discount_pct"]            ?? null,
      discount_amount:         r["discount_amount"]          ?? null,
      tax_amount:              r["tax_amount"]               ?? null,
      retention_pct:           r["retention_pct"]            ?? null,
      retention_amount:        r["retention_amount"]         ?? null,
      withholding_tax_amount:  r["withholding_tax_amount"]   ?? null,
      // Surface source_binding under both casing conventions: the DB column
      // (snake_case) flows through the `...r` spread above; this entry
      // mirrors it under the camelCase name the framework uses for the
      // SourceBindingSchema shape consumers read on the client.
      sourceBinding:           r["source_binding"]           ?? null,
      data:                    meta,
    };
  }

  function isPurchaseInvoiceLineMutation(table: EntityTableInfo): boolean {
    return table.table_schema === "document" && table.table_name === "purchase_invoice";
  }

  function lineHasSourceDocument(row: Record<string, unknown>): boolean {
    return Boolean(
      row["commitment_line_id"]
      || row["receipt_line_id"]
      || row["service_sheet_line_id"],
    );
  }

  function hasLineClassificationInput(body: Record<string, unknown>): boolean {
    return LINE_CLASSIFICATION_INPUT_FIELDS.some((field) => hasOwnBodyField(body, field));
  }

  async function refreshLineRow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    fkCol: string,
    parentId: string,
    lineId: string,
    tenantId: string | null,
  ): Promise<Record<string, unknown> | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (kysely as any)
      .selectFrom(linesTable)
      .selectAll()
      .where("id" as never, "=", lineId as never)
      .where(fkCol as never, "=", parentId as never);
    if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);
    const row = await q.executeTakeFirst() as Record<string, unknown> | undefined;
    return row ?? null;
  }

  async function maybeClassifyPurchaseInvoiceLine(args: {
    table:       EntityTableInfo;
    linesTable:  `${string}.${string}`;
    fkCol:       string;
    tenantId:    string | null;
    principalId: string | null;
    invoiceId:   string;
    lineId:      string;
    lineRow:     Record<string, unknown>;
    body?:       Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (!isPurchaseInvoiceLineMutation(args.table)) return args.lineRow;
    if (!args.tenantId || !args.principalId || !args.lineId) return args.lineRow;
    if (lineHasSourceDocument(args.lineRow)) return args.lineRow;
    if (args.body && !hasLineClassificationInput(args.body)) return args.lineRow;

    try {
      await resolveLineClassification(
        { db, logger },
        {
          tenantId:    args.tenantId,
          principalId: args.principalId,
          invoiceId:   args.invoiceId,
          lineId:      args.lineId,
          mode:        "save",
        },
      );
      return await refreshLineRow(db, args.linesTable, args.fkCol, args.invoiceId, args.lineId, args.tenantId)
        ?? args.lineRow;
    } catch (err) {
      logger?.error("records_purchase_invoice_line_classify_error", {
        err: String(err),
        invoiceId: args.invoiceId,
        lineId: args.lineId,
      });
      return args.lineRow;
    }
  }

  // â”€â”€ POST /:entity/:id/lines â€” create a new line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const createLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const lineBinding = await resolveEntityLineBinding(db, table);
      const linesTable = lineBinding.linesTable;
      const fkCol      = lineBinding.fkCol;

      const suppliedBody = { ...((req.body ?? {}) as Record<string, unknown>) };
      const createGraph = suppliedBody["__create_graph"] && typeof suppliedBody["__create_graph"] === "object" && !Array.isArray(suppliedBody["__create_graph"])
        ? suppliedBody["__create_graph"] as Record<string, unknown>
        : null;
      delete suppliedBody["__create_graph"];
      const lineWriteRules = withLineInputAliases(await resolveEntityWriteFieldRules(db, lineBinding.lineEntityCode));
      const fieldDecision = validateEntityWriteFields({
        input: suppliedBody,
        rules: lineWriteRules,
        action: "create",
        validationMode: "strict",
      });
      if (hasFieldViolations(fieldDecision.violations)) {
        res.status(422).json({ error: "FIELDS_NOT_WRITABLE", fields: fieldDecision.violations });
        return;
      }
      const body = { ...fieldDecision.accepted };

      // Auto-assign line_no if not supplied (MAX + 1, 1-safe)
      if (body["line_number"] == null) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = db.selectFrom(linesTable).select((eb: any) => eb.fn.max("line_no").as("max_no")).where(fkCol as never, "=", id as never);
          if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);
          const row = await q.executeTakeFirst() as { max_no: number | null } | undefined;
          body["line_number"] = (row?.max_no ?? 0) + 1;
        } catch {
          body["line_number"] = 1;
        }
      }

      const insertRow = lineBodyToDb(body, fkCol, id, tenantId, lineWriteRules);
      await applyParentLineCreateDefaults(db, table, id, tenantId, insertRow);
      await applyItemLineCreateDefaults(db, tenantId, insertRow);
      // Defaults for NOT NULL columns when creating a blank line.
      // quantity uses falsy-check (not == null) because lineBodyToDb converts null â†’ 0,
      // which would violate the pil_qty_nonzero CHECK constraint.
      const isPurchaseInvoiceLine = isPurchaseInvoiceLineMutation(table);
      const parentHasSourceDocument = isPurchaseInvoiceLine
        ? await purchaseInvoiceHasSourceDocument(db, id, tenantId)
        : false;
      const shouldDefaultStandaloneUom =
        isPurchaseInvoiceLine
        && !isPresentLineValue(insertRow["item_id"])
        && !requestHasLineSourceDocument(body, insertRow)
        && !parentHasSourceDocument;
      const defaultUomCode = shouldDefaultStandaloneUom
        ? await resolveDefaultProcurementLineUom(db, tenantId)
        : null;
      if (!insertRow["item_description"]) insertRow["item_description"] = "";
      if (!insertRow["uom_code"] && defaultUomCode) insertRow["uom_code"] = defaultUomCode;
      normalizeLineCreateUnits(insertRow);
      if (!isPresentLineValue(insertRow["uom_code"]) && isProcurementLineEntity(lineBinding.lineEntityCode)) {
        insertRow["uom_code"] = await resolveDefaultProcurementLineUom(db, tenantId);
      }
      if (!insertRow["quantity"])          insertRow["quantity"]         = 1;
      if (insertRow["unit_price"] == null) insertRow["unit_price"]      = 0;
      applyDerivedCreateLineAmounts(insertRow, body);
      await stripGeneratedLineColumns(db, linesTable, insertRow);
      await stripUnavailableLineColumns(db, linesTable, insertRow);
      insertRow["created_by"] = principalId;

      const graphContracts = createGraph
        ? await loadCreateGraphContract(db, lineBinding.lineEntityCode, tenantId)
        : new Map<string, CreateGraphContract>();
      if (createGraph) {
        const unsupported = Object.keys(createGraph).filter((childEntity) => !graphContracts.has(childEntity));
        if (unsupported.length > 0) {
          res.status(422).json({
            error: "CREATE_GRAPH_CHILD_NOT_ALLOWED",
            message: `Staged child entities are not declared by metadata: ${unsupported.join(", ")}.`,
          });
          return;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graphResult = await (db as any).transaction().execute(async (trx: any) => {
        const inserted = await trx.insertInto(linesTable)
          .values(insertRow)
          .returningAll()
          .executeTakeFirstOrThrow() as Record<string, unknown>;
        const lineId = typeof inserted["id"] === "string" ? inserted["id"] : "";
        let defaultedInserted = inserted;
        if (isPurchaseInvoiceLine && tenantId && lineId) {
          await applyPurchaseInvoiceLineDefaults(trx, {
            tenantId, invoiceId: id, lineId, principalId: principalId || null,
          });
        } else if (tenantId && lineId) {
          const defaulter = getEntityLineDefaulter(entityCode);
          if (defaulter) {
            await defaulter(trx, { tenantId, parentId: id, lineId, principalId: principalId || null });
          }
        }

        if (createGraph && tenantId && lineId) {
          const accountingNode = createGraph["accounting_distribution"] as Record<string, unknown> | undefined;
          const accountingContract = graphContracts.get("accounting_distribution");
          if (accountingNode && accountingContract?.writer === "accounting_distribution.replace") {
            const lineAmount = await loadDistributionLineAmount(trx, tenantId, lineBinding.lineEntityCode, id, lineId);
            if (!lineAmount) throw new Error("CREATE_GRAPH_LINE_AMOUNT_UNAVAILABLE");
            const parsed = parseDistributionReplaceRows(
              { distributions: accountingNode["rows"] }, lineAmount,
            );
            if (!parsed.ok) throw Object.assign(new Error(parsed.message), { statusCode: 422, code: parsed.error });
            await trx.deleteFrom("document.accounting_distribution")
              .where("tenant_id", "=", tenantId)
              .where("source_doc_type", "=", lineBinding.lineEntityCode)
              .where("source_doc_id", "=", id)
              .where("source_line_id", "=", lineId)
              .execute();
            await trx.insertInto("document.accounting_distribution").values(parsed.rows.map((row, index) => ({
              tenant_id: tenantId, source_doc_type: lineBinding.lineEntityCode,
              source_doc_id: id, source_line_id: lineId, distribution_no: index + 1,
              distribution_basis: row.distribution_basis, split_pct: row.split_pct,
              split_amount: row.split_amount, split_quantity: row.split_quantity,
              distributed_amount: row.distributed_amount, currency_code: lineAmount.currencyCode,
              gl_account_id: row.gl_account_id, account_source: row.account_source,
              cost_center_id: row.cost_center_id, profit_center_id: row.profit_center_id,
              project_id: row.project_id, asset_id: row.asset_id, description: row.description,
              created_by: principalId || SYSTEM_PRINCIPAL_UUID,
            }))).execute();
          }

          const scheduleNode = createGraph["schedule_line"] as Record<string, unknown> | undefined;
          const scheduleContract = graphContracts.get("schedule_line");
          if (scheduleNode && scheduleContract?.writer === "schedule_line.supersede") {
            const rows = Array.isArray(scheduleNode["rows"]) ? scheduleNode["rows"] as Record<string, unknown>[] : [];
            if (rows.length) await supersedeSchedulesForLine(trx, {
              tenantId, sourceDocType: lineBinding.lineEntityCode as "commitment_line",
              sourceDocId: id, sourceLineId: lineId,
              principalId: principalId || SYSTEM_PRINCIPAL_UUID,
              newSpecs: rows.map((row, index) => ({
                scheduleNo: Number(row["schedule_no"] ?? index + 1),
                scheduleKind: (row["schedule_kind"] ?? "delivery") as "delivery",
                scheduledQuantity: Number(row["scheduled_quantity"] ?? insertRow["quantity"] ?? 1),
                scheduledAmount: row["scheduled_amount"] == null ? null : Number(row["scheduled_amount"]),
                scheduledDate: String(row["scheduled_date"] ?? ""),
                currencyCode: typeof row["currency_code"] === "string" ? row["currency_code"] : null,
                metadata: row["metadata"] && typeof row["metadata"] === "object" ? row["metadata"] as Record<string, unknown> : {},
              })),
            });
          }
        }

        if (!isPurchaseInvoiceLine && tenantId && lineId) {
          const childEffect = getEntityLineChildEffect(entityCode);
          if (childEffect) await childEffect(trx, {
            tenantId, parentId: id, lineId, principalId: principalId || null,
            changedFields: Object.keys(body), mode: "create",
          });
        }
        defaultedInserted = await refreshLineRow(trx, linesTable, fkCol, id, lineId, tenantId) ?? inserted;
        return { lineId, defaultedInserted };
      });
      const { lineId, defaultedInserted } = graphResult as { lineId: string; defaultedInserted: Record<string, unknown> };
      const classified = await maybeClassifyPurchaseInvoiceLine({
        table,
        linesTable,
        fkCol,
        tenantId,
        principalId: principalId || null,
        invoiceId: id,
        lineId,
        lineRow: defaultedInserted,
      });

      let createdLineRow = normaliseLineRow(classified, fkCol) as Record<string, unknown>;
      try {
        createdLineRow = await enrichSingleReferenceLabels(db, {
          entityCode: lineBinding.lineEntityCode,
          tenantId:   tenantId ?? null,
          row:        createdLineRow,
        }) ?? createdLineRow;
      } catch (enrichErr) {
        logger?.warn("records_create_line_enrich_labels_failed", { entity: lineBinding.lineEntityCode, err: String(enrichErr) });
      }
      res.status(201).json(createdLineRow);
    } catch (err) {
      logger?.error("records_create_line_error", { err: String(err) });
      if (err && typeof err === "object" && "statusCode" in err) {
        const graphError = err as { statusCode?: unknown; code?: unknown; message?: unknown };
        const statusCode = typeof graphError.statusCode === "number" ? graphError.statusCode : 422;
        res.status(statusCode).json({
          error: typeof graphError.code === "string" ? graphError.code : "CREATE_GRAPH_INVALID",
          message: typeof graphError.message === "string" ? graphError.message : "Invalid staged line children.",
        });
        return;
      }
      next(err);
    }
  };

  // â”€â”€ POST /:entity/:id/lines/:lineId/copy â€” controlled line clone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const copyLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"]     as string;
      const lineId     = req.params["lineId"] as string;

      if (rejectInvalidUuidParam(res, id, "Record id")) return;
      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_RESOLVED", message: "Unable to resolve tenant for line copy." });
        return;
      }

      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const lineBinding = await resolveEntityLineBinding(db, table);
      if (lineBinding.lineEntityCode !== "commitment_line") {
        res.status(501).json({
          error: "LINE_COPY_NOT_SUPPORTED",
          message: `Controlled copy is not yet implemented for '${lineBinding.lineEntityCode}'.`,
        });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const includeChildren = body["includeChildren"] && typeof body["includeChildren"] === "object"
        ? body["includeChildren"] as {
            accountingDistributions?: boolean;
            pricingComponents?: boolean;
            schedules?: boolean;
          }
        : undefined;

      const result = await copyCommitmentLine(db, {
        tenantId,
        commitmentId: id,
        lineId,
        principalId: principalId || null,
        includeChildren,
      });

      let createdLineRow = normaliseLineRow(result.line, lineBinding.fkCol) as Record<string, unknown>;
      try {
        createdLineRow = await enrichSingleReferenceLabels(db, {
          entityCode: lineBinding.lineEntityCode,
          tenantId,
          row: createdLineRow,
        }) ?? createdLineRow;
      } catch (enrichErr) {
        logger?.warn("records_copy_line_enrich_labels_failed", { entity: lineBinding.lineEntityCode, err: String(enrichErr) });
      }

      res.status(201).json({
        ...createdLineRow,
        __copy: {
          source_line_id: lineId,
          children: result.children,
          warnings: result.warnings,
        },
      });
    } catch (err) {
      logger?.error("records_copy_line_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ PATCH /:entity/:id/lines/:lineId â€” update a line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const patchLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"]     as string;
      const lineId     = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const lineBinding = await resolveEntityLineBinding(db, table);
      const linesTable = lineBinding.linesTable;
      const fkCol      = lineBinding.fkCol;

      const suppliedBody = (req.body ?? {}) as Record<string, unknown>;
      const lineWriteRules = withLineInputAliases(await resolveEntityWriteFieldRules(db, lineBinding.lineEntityCode));
      const lineStatus = tenantId ? await fetchRecordStatus(db, linesTable, lineId, tenantId) : null;
      const fieldDecision = validateEntityWriteFields({
        input: suppliedBody,
        rules: lineWriteRules,
        action: "update",
        validationMode: "strict",
        currentStatus: lineStatus,
      });
      if (hasFieldViolations(fieldDecision.violations)) {
        res.status(422).json({ error: "FIELDS_NOT_WRITABLE", fields: fieldDecision.violations });
        return;
      }
      const body = fieldDecision.accepted;
      const patchRow = lineBodyToDb(body, fkCol, id, tenantId, lineWriteRules);
      // Remove identity columns from patch
      delete patchRow["tenant_id"];
      delete patchRow[fkCol];
      await applyDerivedPatchLineAmounts(db, linesTable, fkCol, id, lineId, tenantId, body, patchRow);
      await mergePatchLineMetadata(db, linesTable, fkCol, id, lineId, tenantId, patchRow);
      await stripGeneratedLineColumns(db, linesTable, patchRow);
      await stripUnavailableLineColumns(db, linesTable, patchRow);

      if (Object.keys(patchRow).length === 0) {
        res.status(400).json({ error: "EMPTY_PATCH", message: "No updatable fields supplied" });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (db.updateTable(linesTable) as any)
        .set(patchRow)
        .where("id" as never, "=", lineId as never)
        .where(fkCol as never, "=", id as never);
      if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

      const updated = await q.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!updated) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Line not found" });
        return;
      }

      if (tenantId) {
        const childEffect = getEntityLineChildEffect(entityCode);
        if (childEffect) {
          await childEffect(db, {
            tenantId,
            parentId:      id,
            lineId,
            principalId:   principalId || null,
            changedFields: Object.keys(body),
            mode:          "update",
          });
        }
      }

      // Generic entity-line-refresh hook (system-owned AD/PC recompute after
      // quantity/price/currency change). Skipped for PIL â€” its refresh path
      // lives inside applyPurchaseInvoiceLineDefaults today.
      if (tenantId) {
        const refresher = getEntityLineRefresher(entityCode);
        if (refresher) {
          await refresher(db, {
            tenantId,
            parentId:    id,
            lineId,
            principalId: principalId || null,
          });
        }
      }

      const refreshedAfterEffects = tenantId
        ? await refreshLineRow(db, linesTable, fkCol, id, lineId, tenantId)
        : null;

      const classified = await maybeClassifyPurchaseInvoiceLine({
        table,
        linesTable,
        fkCol,
        tenantId,
        principalId: principalId || null,
        invoiceId: id,
        lineId,
        lineRow: refreshedAfterEffects ?? updated,
        body,
      });

      let patchedLineRow = normaliseLineRow(classified, fkCol) as Record<string, unknown>;
      try {
        patchedLineRow = await enrichSingleReferenceLabels(db, {
          entityCode: lineBinding.lineEntityCode,
          tenantId:   tenantId ?? null,
          row:        patchedLineRow,
        }) ?? patchedLineRow;
      } catch (enrichErr) {
        logger?.warn("records_patch_line_enrich_labels_failed", { entity: lineBinding.lineEntityCode, err: String(enrichErr) });
      }
      res.json(patchedLineRow);
    } catch (err) {
      logger?.error("records_patch_line_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ DELETE /:entity/:id/lines/:lineId â€” delete a line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const deleteLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"]     as string;
      const lineId     = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : null;

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const lineBinding = await resolveEntityLineBinding(db, table);
      const linesTable = lineBinding.linesTable;
      const fkCol      = lineBinding.fkCol;

      // Entity-specific handler owns child cleanup + lifecycle guard.
      const entityDeleter = getEntityLineDeleter(entityCode);
      if (entityDeleter) {
        if (!tenantId) {
          res.status(400).json({ error: "MISSING_TENANT", message: "tenant_id could not be resolved" });
          return;
        }
        try {
          await entityDeleter(db, {
            tenantId,
            parentId:    id,
            lineId,
            principalId: principalId ?? null,
          });
          res.status(204).end();
          return;
        } catch (err) {
          const anyErr = err as Error & { status?: number; code?: string; counters?: unknown };
          if (typeof anyErr.status === "number") {
            res.status(anyErr.status).json({
              error:   anyErr.code   ?? "LINE_DELETE_FAILED",
              message: anyErr.message,
              ...(anyErr.counters !== undefined ? { details: anyErr.counters } : {}),
            });
            return;
          }
          throw err;
        }
      }

      // Generic entity fallback (no polymorphic children).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (db.deleteFrom(linesTable) as any)
        .where("id" as never, "=", lineId as never)
        .where(fkCol as never, "=", id as never);
      if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

      const deleted = await q.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!deleted) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Line not found" });
        return;
      }

      res.status(204).end();
    } catch (err) {
      logger?.error("records_delete_line_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /:entity/:id/lines/:lineId/distributions â€” create a split â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const createDistributionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id        = req.params["id"]     as string;
      const lineId    = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND" });
        return;
      }

      if (rejectInvalidUuidParam(res, id, "Record id")) return;
      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // JWT `sub` is the Keycloak subject UUID; audit_log_actor_fk +
      // master.principal FKs expect master.principal.id. Resolve sub â†’
      // principal_id (JIT-provisioning on first use) so created_by and the
      // audit-log actor_id satisfy their FKs. Same pattern used by the
      // entity create / line PATCH handlers above.
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      const body = req.body as Record<string, unknown>;

      const lineBinding = await resolveEntityLineBinding(db, table);
      const sourceDocType = sourceDocTypeForLineEntity(lineBinding.lineEntityCode);
      if (!sourceDocType) {
        res.status(400).json({ error: "UNSUPPORTED_DISTRIBUTION_PARENT" });
        return;
      }

      const auditCtx = sourceDocType === "purchase_invoice_line"
        ? await loadPurchaseInvoiceAuditContext(db, tenantId, id)
        : null;
      if (sourceDocType === "purchase_invoice_line") {
        if (!auditCtx) {
          res.status(404).json({ error: "INVOICE_NOT_FOUND" });
          return;
        }
        if (rejectChildReplaceWhenLocked(res, auditCtx.status, "Accounting distributions")) return;
      }

      const lineAmount = await loadDistributionLineAmount(db, tenantId, sourceDocType, id, lineId);
      if (!lineAmount) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Source line not found" });
        return;
      }
      const distributionBasis = readDistributionBasis(body["distribution_basis"]);
      const splitPct = distributionBasis === "PERCENT" ? body["split_pct"] ?? 100 : null;
      const splitAmount = distributionBasis === "AMOUNT" ? body["split_amount"] ?? null : null;
      const splitQuantity = distributionBasis === "QUANTITY" ? body["split_quantity"] ?? null : null;
      const distributedAmount = computeDistributionDocumentAmount({
        distribution_basis: distributionBasis,
        split_pct:          splitPct,
        split_amount:       splitAmount,
        split_quantity:     splitQuantity,
      }, lineAmount);

      // Next distribution_no for this line
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let maxQuery: any = (db as any)
        .selectFrom("document.accounting_distribution")
        .select((eb: any) => eb.fn.max("distribution_no").as("maxNo"))
        .where("source_doc_type", "=", sourceDocType)
        .where("source_doc_id", "=", id)
        .where("source_line_id", "=", lineId);
      if (tenantId !== null) maxQuery = maxQuery.where("tenant_id", "=", tenantId);
      const maxRow = await maxQuery.executeTakeFirst();
      const nextNo = ((maxRow?.maxNo as number | null) ?? 0) + 1;

      // gl_account_id: client-authorable via the distribution drawer.
      // When the client supplies a value, account_source is stamped 'OVERRIDE'
      // so the posting service skips profile resolution and keeps the user's
      // choice. When absent, account_source stays at the DB default 'PENDING'
      // and the posting service resolves via profile/fallback as before.
      const glAccountIdRaw = body["gl_account_id"];
      const glAccountId = typeof glAccountIdRaw === "string" && glAccountIdRaw.trim()
        ? glAccountIdRaw.trim()
        : null;

      // Manual override path requires a controlled change_reason_code so the
      // audit log can answer "why was this account chosen?" without free text.
      // Only enforced when the client is actually overriding (gl_account_id is
      // non-null on insert). Default-PENDING rows don't need a reason.
      let reasonCodeId: string | null = null;
      if (glAccountId) {
        reasonCodeId = await resolveChangeReasonCodeId(db, tenantId, body["reason_code"]);
        if (!reasonCodeId) {
          res.status(422).json({
            error:   "REASON_CODE_REQUIRED",
            message: "Setting gl_account_id on an accounting_distribution requires reason_code "
                   + "(expected an active master.change_reason_code.code, e.g. 'manual_account_override').",
          });
          return;
        }
      }

      const insert: Record<string, unknown> = {
        tenant_id:          tenantId,
        source_doc_type:    sourceDocType,
        source_doc_id:      id,
        source_line_id:     lineId,
        distribution_no:    nextNo,
        distribution_basis: distributionBasis,
        split_pct:          splitPct,
        split_amount:       splitAmount,
        split_quantity:     splitQuantity,
        distributed_amount: distributedAmount,
        currency_code:      lineAmount.currencyCode,
        // business_intent_id, commodity_category_id, site_id intentionally omitted
        // â€” sourced from the P2P line, not duplicated on accounting_distribution.
        gl_account_id:      glAccountId,
        account_source:     glAccountId ? "OVERRIDE" : "PENDING",
        cost_center_id:     body["cost_center_id"]     ?? null,
        profit_center_id:   body["profit_center_id"]   ?? null,
        project_id:         body["project_id"]         ?? null,
        asset_id:           body["asset_id"]           ?? null,
        description:        body["description"]        ?? null,
        created_by:         principalId,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await executeDurableMutationTransaction(db, async (trx) => {
        const [row] = await (trx as any)
          .insertInto("document.accounting_distribution")
          .values(insert)
          .returningAll()
          .execute();
        if (tenantId && sourceDocType === "purchase_invoice_line" && auditCtx) {
          await writeAccountingDistributionAudit(trx, {
            tenantId,
            actor: principalId,
            invoiceId: id,
            companyCodeId: auditCtx.companyCodeId,
            operation: "insert",
            oldValues: null,
            newValues: row as Record<string, unknown>,
            reasonCode: reasonCodeId,
          });
        }
        return row;
      });

      let createdDist = created as Record<string, unknown>;
      try {
        createdDist = await enrichSingleReferenceLabels(db, {
          entityCode: "accounting_distribution",
          tenantId:   tenantId ?? null,
          row:        createdDist,
        }) ?? createdDist;
      } catch (enrichErr) {
        logger?.warn("records_distribution_create_enrich_labels_failed", { err: String(enrichErr) });
      }
      res.status(201).json({ data: createdDist });
    } catch (err) {
      logger?.error("records_distribution_create_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ PATCH /:entity/:id/lines/:lineId/distributions/:distId â€” update a split â”€â”€
  const patchDistributionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const lineId  = req.params["lineId"] as string;
      const distId  = req.params["distId"] as string;

      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;
      if (rejectInvalidUuidParam(res, distId, "Distribution id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // Resolve JWT sub â†’ master.principal.id before writing updated_by or
      // the audit-log actor_id â€” both FK to master.principal.
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      const body = req.body as Record<string, unknown>;
      const allowedKeys = [
        "distribution_basis","split_pct","split_amount","split_quantity",
        "cost_center_id","profit_center_id","project_id",
        "gl_account_id",
        "asset_id","description",
      ];
      const patch: Record<string, unknown> = { updated_at: new Date(), updated_by: principalId };
      for (const k of allowedKeys) {
        if (k in body) patch[k] = body[k];
      }
      // When the client touches gl_account_id, flip account_source to reflect
      // the new provenance: OVERRIDE when a UUID is set, PENDING when cleared
      // (so the next posting run can resolve it via profile/fallback). Routes
      // that don't touch gl_account_id leave account_source untouched.
      //
      // Both set-override and clear-override require a controlled reason
      // (manual_account_override / approver_correction / etc.) so the audit
      // log can answer "why was this account changed?" without free text.
      let reasonCodeId: string | null = null;
      if ("gl_account_id" in body) {
        const next = patch["gl_account_id"];
        const nextId = typeof next === "string" && next.trim() ? next.trim() : null;
        patch["gl_account_id"]  = nextId;
        patch["account_source"] = nextId ? "OVERRIDE" : "PENDING";
        reasonCodeId = await resolveChangeReasonCodeId(db, tenantId, body["reason_code"]);
        if (!reasonCodeId) {
          res.status(422).json({
            error:   "REASON_CODE_REQUIRED",
            message: "Changing gl_account_id on an accounting_distribution requires reason_code "
                   + "(expected an active master.change_reason_code.code, e.g. 'manual_account_override').",
          });
          return;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentQuery: any = (db as any)
        .selectFrom("document.accounting_distribution")
        .selectAll()
        .where("id", "=", distId)
        .where("source_line_id", "=", lineId);
      if (tenantId !== null) currentQuery = currentQuery.where("tenant_id", "=", tenantId);
      const current = await currentQuery.executeTakeFirst() as Record<string, unknown> | undefined;
      if (!current) {
        res.status(404).json({ error: "DISTRIBUTION_NOT_FOUND" });
        return;
      }

      const sourceDocId = typeof current["source_doc_id"] === "string" ? current["source_doc_id"] : "";
      const sourceDocType = typeof current["source_doc_type"] === "string" ? current["source_doc_type"] : "";
      if (!sourceDocType) {
        res.status(400).json({ error: "UNSUPPORTED_DISTRIBUTION_PARENT" });
        return;
      }
      const auditCtx = sourceDocType === "purchase_invoice_line"
        ? await loadPurchaseInvoiceAuditContext(db, tenantId, sourceDocId)
        : null;
      if (sourceDocType === "purchase_invoice_line") {
        if (!auditCtx) {
          res.status(404).json({ error: "INVOICE_NOT_FOUND" });
          return;
        }
        if (rejectChildReplaceWhenLocked(res, auditCtx.status, "Accounting distributions")) return;
      }

      const lineAmount = await loadDistributionLineAmount(db, tenantId, sourceDocType, sourceDocId, lineId);
      if (!lineAmount) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Source line not found" });
        return;
      }

      const merged = { ...current, ...patch };
      const distributionBasis = readDistributionBasis(merged["distribution_basis"]);
      patch["distribution_basis"] = distributionBasis;
      patch["distributed_amount"] = computeDistributionDocumentAmount({
        distribution_basis: distributionBasis,
        split_pct:          merged["split_pct"],
        split_amount:       merged["split_amount"],
        split_quantity:     merged["split_quantity"],
      }, lineAmount);
      patch["currency_code"] = lineAmount.currencyCode;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await executeDurableMutationTransaction(db, async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (trx as any)
          .updateTable("document.accounting_distribution")
          .set(patch)
          .where("id", "=", distId)
          .where("source_line_id", "=", lineId);
        if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
        const [row] = await q.returningAll().execute();
        if (tenantId && row && sourceDocType === "purchase_invoice_line" && auditCtx) {
          await writeAccountingDistributionAudit(trx, {
            tenantId,
            actor: principalId,
            invoiceId: sourceDocId,
            companyCodeId: auditCtx.companyCodeId,
            operation: "update",
            oldValues: current,
            newValues: row as Record<string, unknown>,
            reasonCode: reasonCodeId,
          });
        }
        return row;
      });
      let patchedDist = updated as Record<string, unknown> | undefined;
      try {
        if (patchedDist) {
          patchedDist = await enrichSingleReferenceLabels(db, {
            entityCode: "accounting_distribution",
            tenantId:   tenantId ?? null,
            row:        patchedDist,
          }) ?? patchedDist;
        }
      } catch (enrichErr) {
        logger?.warn("records_distribution_patch_enrich_labels_failed", { err: String(enrichErr) });
      }
      res.json({ data: patchedDist });
    } catch (err) {
      logger?.error("records_distribution_patch_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ PUT /:entity/:id/lines/:lineId/distributions â€” replace split set â”€â”€â”€â”€â”€â”€
  const replaceLineDistributionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id        = req.params["id"]     as string;
      const lineId    = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND" });
        return;
      }

      if (rejectInvalidUuidParam(res, id, "Record id")) return;
      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_REQUIRED" });
        return;
      }

      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const lineBinding = await resolveEntityLineBinding(db, table);
      const sourceDocType = sourceDocTypeForLineEntity(lineBinding.lineEntityCode);
      if (!sourceDocType) {
        res.status(400).json({ error: "UNSUPPORTED_DISTRIBUTION_PARENT" });
        return;
      }

      const auditCtx = sourceDocType === "purchase_invoice_line"
        ? await loadPurchaseInvoiceAuditContext(db, tenantId, id)
        : null;
      if (sourceDocType === "purchase_invoice_line") {
        if (!auditCtx) {
          res.status(404).json({ error: "INVOICE_NOT_FOUND" });
          return;
        }
        if (rejectChildReplaceWhenLocked(res, auditCtx.status, "Accounting distributions")) return;
      }

      const lineAmount = await loadDistributionLineAmount(db, tenantId, sourceDocType, id, lineId);
      if (!lineAmount) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Source line not found" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const parsed = parseDistributionReplaceRows(body, lineAmount);
      if (!parsed.ok) {
        res.status(422).json({ error: parsed.error, message: parsed.message });
        return;
      }

      const reasonByRow = new Map<number, string | null>();
      for (const [index, row] of parsed.rows.entries()) {
        if (!row.gl_account_id) {
          reasonByRow.set(index, null);
          continue;
        }
        const reasonCodeId = await resolveChangeReasonCodeId(db, tenantId, row.reason_code);
        if (!reasonCodeId) {
          res.status(422).json({
            error:   "REASON_CODE_REQUIRED",
            message: `Distribution row ${index + 1} sets gl_account_id and requires reason_code.`,
          });
          return;
        }
        reasonByRow.set(index, reasonCodeId);
      }
      const auditReasonCode = Array.from(reasonByRow.values()).find((value): value is string => Boolean(value)) ?? null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdRows = await (db as any).transaction().execute(async (trx: any) => {
        const oldRows = await trx
          .selectFrom("document.accounting_distribution")
          .selectAll()
          .where("tenant_id", "=", tenantId)
          .where("source_doc_type", "=", sourceDocType)
          .where("source_doc_id", "=", id)
          .where("source_line_id", "=", lineId)
          .orderBy("distribution_no", "asc")
          .execute();

        await trx
          .deleteFrom("document.accounting_distribution")
          .where("tenant_id", "=", tenantId)
          .where("source_doc_type", "=", sourceDocType)
          .where("source_doc_id", "=", id)
          .where("source_line_id", "=", lineId)
          .execute();

        const insertRows = parsed.rows.map((row, index) => ({
          tenant_id:          tenantId,
          source_doc_type:    sourceDocType,
          source_doc_id:      id,
          source_line_id:     lineId,
          distribution_no:    index + 1,
          distribution_basis: row.distribution_basis,
          split_pct:          row.split_pct,
          split_amount:       row.split_amount,
          split_quantity:     row.split_quantity,
          distributed_amount: row.distributed_amount,
          currency_code:      lineAmount.currencyCode,
          gl_account_id:      row.gl_account_id,
          account_source:     row.account_source,
          cost_center_id:     row.cost_center_id,
          profit_center_id:   row.profit_center_id,
          project_id:         row.project_id,
          asset_id:           row.asset_id,
          description:        row.description,
          created_by:         principalId,
        }));

        const inserted = await trx
          .insertInto("document.accounting_distribution")
          .values(insertRows)
          .returningAll()
          .execute();

        if (sourceDocType === "purchase_invoice_line" && auditCtx) {
          await writeAccountingDistributionAudit(trx, {
            tenantId,
            actor: principalId,
            invoiceId: id,
            companyCodeId: auditCtx.companyCodeId,
            operation: "update",
            oldValues: { rows: oldRows },
            newValues: { rows: inserted },
            reasonCode: auditReasonCode,
          });
        }

        return inserted as Record<string, unknown>[];
      });

      let enriched = createdRows as Record<string, unknown>[];
      try {
        enriched = await enrichWithReferenceLabels(db, {
          entityCode: "accounting_distribution",
          tenantId,
          rows: enriched,
        });
      } catch (enrichErr) {
        logger?.warn("records_distribution_replace_enrich_labels_failed", { err: String(enrichErr) });
      }

      res.json({ data: enriched });
    } catch (err) {
      logger?.error("records_distribution_replace_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ DELETE /:entity/:id/lines/:lineId/distributions/:distId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const deleteDistributionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const lineId  = req.params["lineId"] as string;
      const distId  = req.params["distId"] as string;

      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;
      if (rejectInvalidUuidParam(res, distId, "Distribution id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // Resolve JWT sub â†’ master.principal.id for audit-log actor_id FK.
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentQuery: any = (db as any)
        .selectFrom("document.accounting_distribution")
        .selectAll()
        .where("id", "=", distId)
        .where("source_line_id", "=", lineId);
      if (tenantId !== null) currentQuery = currentQuery.where("tenant_id", "=", tenantId);
      const current = await currentQuery.executeTakeFirst() as Record<string, unknown> | undefined;
      if (!current) {
        res.status(404).json({ error: "DISTRIBUTION_NOT_FOUND" });
        return;
      }

      const sourceDocId = typeof current["source_doc_id"] === "string" ? current["source_doc_id"] : "";
      const sourceDocType = typeof current["source_doc_type"] === "string" ? current["source_doc_type"] : "";
      if (!sourceDocType) {
        res.status(400).json({ error: "UNSUPPORTED_DISTRIBUTION_PARENT" });
        return;
      }
      const auditCtx = sourceDocType === "purchase_invoice_line"
        ? await loadPurchaseInvoiceAuditContext(db, tenantId, sourceDocId)
        : null;
      if (sourceDocType === "purchase_invoice_line") {
        if (!auditCtx) {
          res.status(404).json({ error: "INVOICE_NOT_FOUND" });
          return;
        }
        if (rejectChildReplaceWhenLocked(res, auditCtx.status, "Accounting distributions")) return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await executeDurableMutationTransaction(db, async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (trx as any)
          .deleteFrom("document.accounting_distribution")
          .where("id", "=", distId)
          .where("source_line_id", "=", lineId);
        if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
        await q.execute();
        if (tenantId && sourceDocType === "purchase_invoice_line" && auditCtx) {
          await writeAccountingDistributionAudit(trx, {
            tenantId,
            actor: principalId,
            invoiceId: sourceDocId,
            companyCodeId: auditCtx.companyCodeId,
            operation: "delete",
            oldValues: current,
            newValues: null,
          });
        }
      });

      res.status(204).end();
    } catch (err) {
      logger?.error("records_distribution_delete_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /:entity/:id/lines â€” query convention-based {table_name}_line table â”€â”€
  const linesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // â”€â”€ journal_entry: use document.journal_line (non-conventional table name) â”€â”€
      // â”€â”€ payment_entry: use document.payment_entry_allocation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (entityCode === "payment_entry") {
        try {
          const peRows = await sql<{
            id: string; line_no: number;
            purchase_invoice_id: string | null;
            code: string | null; invoice_date: string | null;
            currency_code: string;
            allocated_amount: string;
            discount_amount: string;
            withholding_tax_amount: string;
            advance_recovery_amount: string;
            retention_amount: string;
            net_payment_amount: string;
            base_amount: string | null;
            notes: string | null;
          }>`
            SELECT
              pea.id,
              pea.line_no,
              pea.purchase_invoice_id,
              pi.code,
              pi.supplier_invoice_date AS invoice_date,
              pea.currency_code,
              pea.allocated_amount,
              pea.discount_amount,
              pea.withholding_tax_amount,
              pea.advance_recovery_amount,
              pea.retention_amount,
              pea.net_payment_amount,
              pea.base_amount,
              pea.notes
            FROM document.payment_entry_allocation pea
            LEFT JOIN document.purchase_invoice pi
                   ON pi.id = pea.purchase_invoice_id
             WHERE pea.payment_entry_id = ${id}
               AND pea.tenant_id = ${tenantId}
             ORDER BY pea.line_no
          `.execute(db);

          const data = peRows.rows.map((r) => ({
            id:           r.id,
            document_id:  id,
            line_number:  r.line_no,
            description:  r.code ? `Invoice ${r.code}` : "On Account",
            item_code:    r.code ?? null,
            quantity:     null,
            unit_code:    null,
            unit_price:   null,
            line_amount:  Number(r.allocated_amount),
            net_amount:   Number(r.net_payment_amount),
            gross_amount: Number(r.allocated_amount),
            data: {
              purchase_invoice_id:     r.purchase_invoice_id,
              code:          r.code,
              invoice_date:            r.invoice_date,
              currency_code:           r.currency_code,
              allocated_amount:        r.allocated_amount,
              discount_amount:         r.discount_amount,
              withholding_tax_amount:  r.withholding_tax_amount,
              advance_recovery_amount: r.advance_recovery_amount,
              retention_amount:        r.retention_amount,
              net_payment_amount:      r.net_payment_amount,
              base_amount:             r.base_amount,
            },
          }));
          res.json({ data });
        } catch (err) {
          logger?.error("pe_lines_error", { err: String(err) });
          res.json({ data: [] });
        }
        return;
      }

      if (entityCode === "journal_entry") {
        try {
          const jeRows = await sql<{
            id: string; line_no: number;
            gl_account_id: string; gl_account_code: string | null; gl_account_name: string | null;
            description: string | null;
            transaction_debit: string; transaction_credit: string;
            base_debit: string; base_credit: string;
            transaction_currency: string | null; base_currency: string | null; exchange_rate: string | null;
            subledger_type: string | null; party_type: string | null; party_id: string | null;
            cost_center_id: string | null; profit_center_id: string | null; project_id: string | null;
            references: unknown;
          }>`
            SELECT jl.id, jl.line_no,
                   jl.gl_account_id,
                   ga.code  AS gl_account_code,
                   ga.name  AS gl_account_name,
                   jl.description,
                   jl.transaction_debit,  jl.transaction_credit,
                   jl.base_debit,         jl.base_credit,
                   jl.transaction_currency,
                   jl.base_currency,
                   jl.exchange_rate,
                   jl.subledger_type, jl.party_type, jl.party_id,
                   jl.cost_center_id, jl.profit_center_id, jl.project_id,
                   COALESCE(
                     jsonb_agg(
                       jsonb_build_object(
                         'id', jlr.id,
                         'ref_type', jlr.ref_type,
                         'ref_doc_type', jlr.ref_doc_type,
                         'ref_doc_id', jlr.ref_doc_id,
                         'ref_doc_line_id', jlr.ref_doc_line_id,
                         'ref_doc_number', jlr.ref_doc_number,
                         'ref_doc_label', jlr.metadata->>'ref_doc_label',
                         'ref_doc_line_label', jlr.metadata->>'ref_doc_line_label',
                         'allocated_amount', jlr.allocated_amount,
                         'currency_code', jlr.currency_code,
                         'description', jlr.description
                       )
                       ORDER BY jlr.created_at, jlr.id
                     ) FILTER (WHERE jlr.id IS NOT NULL),
                     '[]'::jsonb
                   ) AS references
              FROM document.journal_line jl
              LEFT JOIN master.gl_account ga ON ga.id = jl.gl_account_id
              LEFT JOIN document.journal_line_reference jlr
                     ON jlr.tenant_id = jl.tenant_id
                    AND jlr.journal_line_id = jl.id
             WHERE jl.journal_entry_id = ${id}
               AND jl.tenant_id = ${tenantId}
             GROUP BY jl.id, jl.line_no, jl.gl_account_id, ga.code, ga.name,
                      jl.description, jl.transaction_debit, jl.transaction_credit,
                      jl.base_debit, jl.base_credit, jl.transaction_currency,
                      jl.base_currency, jl.exchange_rate,
                      jl.subledger_type, jl.party_type, jl.party_id,
                      jl.cost_center_id, jl.profit_center_id, jl.project_id
             ORDER BY jl.line_no
          `.execute(db);

          const data = jeRows.rows.map((r) => ({
            id:           r.id,
            document_id:  id,
            line_number:  r.line_no,
            description:  r.description ?? "",
            item_code:    r.gl_account_code ?? null,
            quantity:     null,
            unit_code:    null,
            unit_price:   null,
            line_amount:  Math.max(Number(r.transaction_debit), Number(r.transaction_credit)),
            net_amount:   r.transaction_debit,
            gross_amount: r.transaction_credit,
            data: {
              gl_account_id:      r.gl_account_id,
              gl_account_code:    r.gl_account_code,
              gl_account_name:    r.gl_account_name,
              transaction_debit:  r.transaction_debit,
              transaction_credit: r.transaction_credit,
              transaction_currency: r.transaction_currency,
              base_currency:      r.base_currency,
              base_debit:         r.base_debit,
              base_credit:        r.base_credit,
              exchange_rate:      r.exchange_rate,
              subledger_type:     r.subledger_type,
              party_type:         r.party_type,
              party_id:           r.party_id,
              references:         r.references,
              is_debit:           Number(r.transaction_debit) > 0,
            },
          }));
          res.json({ data });
        } catch (err) {
          logger?.error("je_lines_error", { err: String(err) });
          res.json({ data: [] });
        }
        return;
      }

      const lineBinding = await resolveEntityLineBinding(db, table);
      const linesTable = lineBinding.linesTable;
      const fkCol      = lineBinding.fkCol;

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = db.selectFrom(linesTable).selectAll().where(fkCol as never, "=", id as never);
        if (tenantId !== null) q = q.where("tenant_id" as never, "=", tenantId as never);
        q = q.orderBy("line_no" as never, "asc");
        rows = await q.execute() as Record<string, unknown>[];
        rows = await hydrateCommitmentLinePricingProjection(db, linesTable, rows, tenantId);
      } catch {
        // Lines table may not exist for this entity â€” return empty gracefully
        rows = [];
      }

      // Normalise DB column names â†’ DocumentLine contract field names
      const data = rows.map((r) => ({
        ...r,
        document_id:       r[fkCol]                             ?? r["document_id"],
        line_number:       r["line_no"]                         ?? r["line_number"],
        description:       r["item_description"]                ?? r["description"],
        unit_code:         r["uom_code"]                        ?? r["unit_code"],
        // line_amount maps to gross_amount (after tax/discount); net_amount is pre-discount/tax
        line_amount:       r["gross_amount"] ?? r["net_amount"] ?? r["line_amount"],
        net_amount:        r["net_amount"]   ?? null,
        gross_amount:      r["gross_amount"] ?? null,
        item_code:         r["item_code"]    ?? null,
        tax_code:          r["tax_code"]     ?? null,
        // Discount
        discount_pct:      r["discount_pct"]    ?? null,
        discount_amount:   r["discount_amount"] ?? null,
        // Tax
        tax_amount:        r["tax_amount"]      ?? null,
        // Retention
        retention_pct:     r["retention_pct"]    ?? null,
        retention_amount:  r["retention_amount"] ?? null,
        // WHT
        withholding_tax_amount: r["withholding_tax_amount"] ?? null,
        data:              r["metadata"]     ?? r["data"]        ?? {},
      }));

      res.json({ data });
    } catch (err) {
      logger?.error("records_lines_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ Filter-preset handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const listPresetsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entity   = String(req.params["entity"] ?? "").trim();
      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "Tenant not found" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      type PresetRow = {
        id: string; name: string; filters: unknown;
        is_shared: boolean; created_at: string; updated_at: string;
      };
      const rows = await (db
        .selectFrom("master.filter_preset as fp" as never)
        .select([
          "fp.id" as never, "fp.name" as never, "fp.filters" as never,
          "fp.is_shared" as never, "fp.created_at" as never, "fp.updated_at" as never,
          "fp.principal_id" as never,
        ])
        .where("fp.tenant_id"   as never, "=", tenantId   as never)
        .where("fp.entity_code" as never, "=", entity     as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) => eb.or([
          eb("fp.principal_id" as never, "=", principalId as never),
          eb("fp.is_shared"    as never, "=", true        as never),
        ]))
        .orderBy("fp.name" as never, "asc")
        .execute() as Promise<(PresetRow & { principal_id: string })[]>);

      res.json({
        ok: true,
        data: rows.map((r) => ({
          id:        r.id,
          name:      r.name,
          filters:   r.filters,
          isShared:  r.is_shared,
          isOwn:     r.principal_id === principalId,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err) {
      logger?.error("records_filter_presets_list_error", { err: String(err) });
      next(err);
    }
  };

  const initiateDraftHandler: RequestHandler = async (req, res, next) => {
    const initiatedAt = performance.now();
    const phaseTimings: Array<{ name: string; durationMs: number }> = [];
    const markPhase = (name: string, startedAt: number): void => {
      phaseTimings.push({ name, durationMs: Math.max(0, performance.now() - startedAt) });
    };
    const sendDraftResponse = (status: number, response: Record<string, unknown>): void => {
      const serializationStart = performance.now();
      const serializedResponse = JSON.stringify(response);
      markPhase("response_serialization", serializationStart);
      const timingHeader = phaseTimings
        .map((timing) => `${timing.name};dur=${Math.round(timing.durationMs)}`)
        .join(",");
      res.setHeader("Server-Timing", timingHeader);
      res.setHeader("X-Draft-Initiate-Server-Ms", String(Math.round(performance.now() - initiatedAt)));
      res.status(status).type("application/json").send(serializedResponse);
    };
    try {
      const sessionStart = performance.now();
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      markPhase("session", sessionStart);

      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_");
      const descriptorStart = performance.now();
      const table = await resolveEntityTable(db, entityCode);
      markPhase("descriptor_flow", descriptorStart);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }
      if (table.create_mode !== "EARLY_DRAFT") {
        res.status(409).json({ error: "NOT_EARLY_DRAFT_ENTITY", message: `Entity '${entityCode}' does not support provisional draft initiation.` });
        return;
      }
      const draftBackingSource = stringConfigValue(table.feature_flags["backing_source"]);
      if (draftBackingSource !== "commitment") {
        res.status(501).json({
          error: "DRAFT_INITIALIZER_NOT_DECLARED",
          message: `EARLY_DRAFT metadata for '${entityCode}' does not declare a supported provisional backing source.`,
        });
        return;
      }

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant from session. Ensure you have an active org selected." });
        return;
      }
      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const draftIdempotency = buildEntityCreateIdempotency({ request: req, entityCode, body: req.body ?? {} });
      if (!draftIdempotency) {
        res.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required to initiate a draft." });
        return;
      }

      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "create",
        logger,
      })) return;

      const defaultsStart = performance.now();
      const ttlHours = table.draft_ttl_hours ?? 24;
      const [commitmentType, cc] = await Promise.all([
        resolvePurchaseOrderCommitmentType(db),
        resolveDraftCompanyCode(db, req, tenantId),
      ]);
      const companyCodeId = cc?.id;
      const currencyCode = cc?.functional_currency ?? "USD";
      if (!companyCodeId) {
        res.status(422).json({ error: "COMPANY_CODE_REQUIRED", message: "No active company_code found for tenant; cannot initiate a purchase order draft." });
        return;
      }

      const initiatedFx = await resolveDocumentFxRate(db, {
        tenantId,
        companyCodeId,
        currencyCode,
        baseCurrencyCode: currencyCode,
        eventDate: new Date(),
        fxPolicy: "spot_on_event",
      });
      if (!initiatedFx) {
        res.status(422).json({ error: "FX_RATE_UNAVAILABLE", message: `Could not resolve ${currencyCode}/${currencyCode} exchange rate for the draft.` });
        return;
      }
      markPhase("defaults", defaultsStart);

      const numberingStart = performance.now();
      const initiatedIdentity = resolveEntityIdentity({
        identityConfig: table.identity_config,
        context: "initiate",
        entityLabel: table.name.replace(/_/g, " "),
      });
      const initiatedName = String(initiatedIdentity.values["name"] ?? "");
      const initiatedMetadata = mergeFieldProvenance({}, initiatedIdentity.provenance);
      markPhase("numbering_identity", numberingStart);

      type DraftTransactionResult =
        | { kind: "respond"; status: number; response: Record<string, unknown> }
        | { kind: "mismatch" }
        | { kind: "in_progress" };

      const transactionStart = performance.now();
      let databaseInsertDurationMs = 0;
      const transactionResult = await db.transaction().execute(async (trx): Promise<DraftTransactionResult> => {
        const draftClaim = await claimDocumentRuntimeIdempotency(trx, {
          tenantId,
          principalId,
          entityCode,
          documentId: draftIdempotency.documentId,
          idempotencyKey: draftIdempotency.key,
          requestHash: draftIdempotency.requestHash,
          operationKey: "entity.draft.initiate",
        });
        if (draftClaim.kind === "replay") {
          return { kind: "respond", status: draftClaim.responseStatus, response: draftClaim.response };
        }
        if (draftClaim.kind === "mismatch") return { kind: "mismatch" };
        if (draftClaim.kind === "in_progress") return { kind: "in_progress" };

        const completeDraftInitiation = async (response: Record<string, unknown>, status: number): Promise<void> => {
          await completeDocumentRuntimeIdempotency(trx, {
            id: draftClaim.id,
            actorId: principalId,
            response,
            responseStatus: status,
          });
        };

        const readActiveDraft = async (): Promise<Record<string, unknown> | undefined> => {
          const result = await sql<Record<string, unknown>>`
        SELECT
          c.id,
          c.tenant_id,
          c.company_code_id,
          c.code,
          c.name,
          c.order_type,
          c.status,
          c.party_type,
          c.party_id,
          c.parent_commitment_id,
          c.release_sequence_no,
          c.requested_by,
          c.responsible_person_id,
          c.approved_by,
          c.approved_at,
          c.workflow_request_id,
          c.document_date,
          c.effective_date,
          c.expiry_date,
          c.fiscal_year,
          c.period_number,
          c.currency_code,
          c.base_currency_code,
          c.exchange_rate,
          c.fx_rate_snapshot,
          c.fx_policy,
          c.total_amount,
          c.scheduled_amount,
          c.released_amount,
          c.fulfilled_amount,
          c.invoiced_amount,
          c.paid_amount,
          c.payment_term_id,
          c.budget_check_result,
          c.encumbrance_je_id,
          c.renewal_terms,
          c.renewal_count,
          c.renewed_from_id,
          c.is_provisional,
          c.draft_expires_at,
          c.draft_started_at,
          c.draft_started_by,
          c.tags,
          c.metadata,
          c.is_active,
          c.status_changed_at,
          c.status_changed_by,
          c.created_at,
          c.created_by,
          c.updated_at,
          c.updated_by
          FROM document.commitment c
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.commitment_type = ${commitmentType}::text
           AND c.is_provisional = true
           AND c.draft_expires_at > now()
           AND c.draft_started_by = ${principalId}::uuid
           AND c.company_code_id = ${companyCodeId}::uuid
         ORDER BY
           c.draft_started_at DESC NULLS LAST,
           c.created_at DESC
          LIMIT 1
          `.execute(trx);
          return result.rows[0];
        };

        let existing = await readActiveDraft();
        if (existing) {
          const resumedIdentity = resolveEntityIdentity({
            identityConfig: table.identity_config,
            context: "initiate",
            entityLabel: "Purchase Order",
            targetRecord: existing,
          });
          const needsIdentityFx = existing["currency_code"] === existing["base_currency_code"]
            && existing["exchange_rate"] == null;
          if (needsIdentityFx || (!String(existing["name"] ?? "").trim() && resumedIdentity.values["name"])) {
            const resumedMetadata = mergeFieldProvenance(existing["metadata"], resumedIdentity.provenance);
            const normalized = await sql<Record<string, unknown>>`
            UPDATE document.commitment
               SET name = CASE WHEN btrim(name) = '' THEN ${String(resumedIdentity.values["name"] ?? "")} ELSE name END,
                   exchange_rate = CASE WHEN currency_code = base_currency_code AND exchange_rate IS NULL THEN 1.0 ELSE exchange_rate END,
                   fx_rate_snapshot = CASE
                     WHEN currency_code = base_currency_code AND exchange_rate IS NULL
                     THEN ${JSON.stringify(initiatedFx.fx_rate_snapshot)}::jsonb ELSE fx_rate_snapshot END,
                   metadata = ${JSON.stringify(resumedMetadata)}::jsonb,
                   updated_at = now(), updated_by = ${principalId}::uuid
             WHERE tenant_id = ${tenantId}::uuid AND id = ${String(existing["id"])}::uuid
              RETURNING *
            `.execute(trx);
            existing = normalized.rows[0] ?? existing;
          }
          const response = { ok: true, record: existing, resumed: true };
          await completeDraftInitiation(response, 200);
          return { kind: "respond", status: 200, response };
        }

        const insertStart = performance.now();
        // RETURNING directly from commitment: a WITH-CTE that inserts into
        // commitment and then SELECTs from document.purchase_order runs the
        // SELECT against the pre-INSERT snapshot, so the just-inserted row
        // is invisible to the outer JOIN (Postgres CTE semantics). The view
        // is a column-identical projection over commitment, so returning
        // the base-table row here yields the same shape the callers expect.
        const inserted = await sql<Record<string, unknown>>`
          INSERT INTO document.commitment (
            tenant_id, company_code_id, code, name, commitment_type,
            requested_by, document_date, effective_date,
            currency_code, base_currency_code, exchange_rate, fx_rate_snapshot, metadata, status,
            is_provisional, draft_expires_at, draft_started_at, draft_started_by,
            created_by
          ) VALUES (
            ${tenantId}::uuid, ${companyCodeId}::uuid, ''::text, ${initiatedName}::text, ${commitmentType}::text,
            ${principalId}::uuid, CURRENT_DATE, CURRENT_DATE,
            ${currencyCode}::char(3), ${currencyCode}::char(3), ${initiatedFx.exchange_rate}::numeric,
            ${JSON.stringify(initiatedFx.fx_rate_snapshot)}::jsonb, ${JSON.stringify(initiatedMetadata)}::jsonb, 'draft'::text,
            true, now() + (${ttlHours}::text || ' hours')::interval, now(), ${principalId}::uuid,
            ${principalId}::uuid
          )
          ON CONFLICT DO NOTHING
          RETURNING
            id, tenant_id, company_code_id, code, name, order_type, status,
            party_type, party_id, parent_commitment_id, release_sequence_no,
            requested_by, responsible_person_id, approved_by, approved_at, workflow_request_id,
            document_date, effective_date, expiry_date, fiscal_year, period_number,
            currency_code, base_currency_code, exchange_rate, fx_rate_snapshot, fx_policy,
            total_amount, scheduled_amount, released_amount, fulfilled_amount, invoiced_amount, paid_amount,
            payment_term_id, budget_check_result, encumbrance_je_id,
            renewal_terms, renewal_count, renewed_from_id,
            is_provisional, draft_expires_at, draft_started_at, draft_started_by,
            tags, metadata, is_active,
            status_changed_at, status_changed_by,
            created_at, created_by, updated_at, updated_by
        `.execute(trx);
        databaseInsertDurationMs += Math.max(0, performance.now() - insertStart);

        const record = inserted.rows[0];
        if (!record) {
          const resumed = await readActiveDraft();
          if (resumed) {
            const response = { ok: true, record: resumed, resumed: true };
            await completeDraftInitiation(response, 200);
            return { kind: "respond", status: 200, response };
          }
          throw new Error("Draft insert returned no record and no concurrent active draft was found.");
        }
        const response = { ok: true, record, resumed: false };
        await completeDraftInitiation(response, 201);
        return { kind: "respond", status: 201, response };
      });
      const transactionDurationMs = Math.max(0, performance.now() - transactionStart);
      phaseTimings.push({ name: "database_insert", durationMs: databaseInsertDurationMs });
      phaseTimings.push({
        name: "transaction_commit",
        durationMs: Math.max(0, transactionDurationMs - databaseInsertDurationMs),
      });

      if (transactionResult.kind === "mismatch") {
        sendDraftResponse(409, {
          error: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency-Key was already used for a different draft request.",
        });
        return;
      }
      if (transactionResult.kind === "in_progress") {
        sendDraftResponse(409, {
          error: "IDEMPOTENCY_IN_PROGRESS",
          message: "Draft initiation is already in progress. Retry with the same Idempotency-Key.",
        });
        return;
      }
      sendDraftResponse(transactionResult.status, transactionResult.response);
    } catch (err) {
      logger?.error("records_draft_initiate_error", { err: String(err) });
      next(err);
    }
  };

  const promoteDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_");
      const id = String(req.params["id"] ?? "");
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }
      if (entityCode !== "purchase_order") {
        res.status(501).json({ error: "MODE_NOT_IMPLEMENTED", message: `Draft promotion is not implemented for '${entityCode}' yet.` });
        return;
      }
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant from session." });
        return;
      }
      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
      if (!await authorizeEntityMutation({
        db, res, table: toMutationTableInfo(table), entityCode, tenantId, principalId, action: "update", logger,
      })) return;
      const poCommitmentType = await resolvePurchaseOrderCommitmentType(db);

      const current = await sql<{
        id: string; company_code_id: string; document_date: string; is_provisional: boolean;
        party_id: string | null; order_type: string | null; currency_code: string | null; base_currency_code: string | null;
        exchange_rate: string | number | null; fx_policy: string | null; requested_by: string | null;
        code: string; name: string; metadata: Record<string, unknown>;
      }>`
        SELECT id, company_code_id, document_date, is_provisional, party_id, order_type,
               currency_code, base_currency_code, exchange_rate, fx_policy, requested_by, code, name, metadata
          FROM document.commitment
         WHERE tenant_id = ${tenantId}::uuid
           AND id = ${id}::uuid
           AND commitment_type = ${poCommitmentType}::text
         LIMIT 1
      `.execute(db);
      const row = current.rows[0];
      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: "Purchase order draft was not found." });
        return;
      }
      if (!row.is_provisional) {
        res.status(409).json({ error: "NOT_A_PROVISIONAL_DRAFT", message: "This record has already been promoted." });
        return;
      }
      const missing = [
        !row.company_code_id ? "company_code_id" : null,
        !row.party_id ? "party_id" : null,
        !row.order_type ? "order_type" : null,
        !row.document_date ? "document_date" : null,
        !row.currency_code ? "currency_code" : null,
        !row.requested_by ? "requested_by" : null,
      ].filter(Boolean);
      if (missing.length > 0) {
        res.status(422).json({ error: "DRAFT_PROMOTION_VALIDATION_FAILED", message: "Required fields are missing before Save Draft.", fields: missing });
        return;
      }

      const resolvedFx = await resolveDocumentFxRate(db, {
        tenantId,
        companyCodeId: row.company_code_id,
        currencyCode: row.currency_code,
        baseCurrencyCode: row.base_currency_code,
        exchangeRate: row.exchange_rate,
        eventDate: row.document_date,
        fxPolicy: row.fx_policy,
        allowManualOverride: true,
      });
      if (!resolvedFx) {
        res.status(422).json({ error: "FX_RATE_UNAVAILABLE", message: "A valid exchange rate could not be resolved before Save Draft.", fields: ["exchange_rate"] });
        return;
      }

      const promotedRecord = await db.transaction().execute(async (trx) => {
        const locked = await sql<{ id: string }>`
          SELECT id FROM document.commitment
           WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND is_provisional = true
           FOR UPDATE
        `.execute(trx);
        if (!locked.rows[0]) return null;

        const numberResult = await sql<{ value: string }>`
          SELECT control.next_entity_number(
            ${tenantId}::uuid, 'purchase_order'::text, 'code'::text,
            ${row.company_code_id}::uuid, NULL::smallint, NULL::smallint, NULL,
            ${row.document_date}::date
          ) AS value
        `.execute(trx);
        const generated = numberResult.rows[0]?.value;
        if (!generated) throw new Error("Purchase order numbering returned no value");

        const promotedIdentity = resolveEntityIdentity({
          identityConfig: table.identity_config,
          context: "promote",
          entityLabel: "Purchase Order",
          targetRecord: row,
          generatedCode: generated,
        });
        const promotedName = promotedIdentity.values["name"] ?? row.name;
        const promotedMetadata = mergeFieldProvenance(row.metadata, promotedIdentity.provenance);
        const promoted = await sql<Record<string, unknown>>`
          UPDATE document.commitment
             SET code = ${generated}, name = ${promotedName},
                 currency_code = ${resolvedFx.currency_code}::char(3),
                 base_currency_code = ${resolvedFx.base_currency_code}::char(3),
                 exchange_rate = ${resolvedFx.exchange_rate}::numeric,
                 fx_rate_snapshot = ${JSON.stringify(resolvedFx.fx_rate_snapshot)}::jsonb,
                 metadata = ${JSON.stringify(promotedMetadata)}::jsonb,
                 is_provisional = false, draft_expires_at = NULL,
                 updated_at = now(), updated_by = ${principalId}::uuid
           WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND is_provisional = true
           RETURNING *
        `.execute(trx);
        return promoted.rows[0] ?? null;
      });
      if (!promotedRecord) {
        res.status(409).json({ error: "DRAFT_VERSION_CONFLICT", message: "Draft was changed before it could be promoted." });
        return;
      }
      const reread = await sql<Record<string, unknown>>`
        SELECT * FROM document.purchase_order
         WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
         LIMIT 1
      `.execute(db);
      res.status(200).json({ ok: true, record: reread.rows[0] ?? promotedRecord });
    } catch (err) {
      logger?.error("records_draft_promote_error", { err: String(err) });
      next(err);
    }
  };

  const discardDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_");
      const id = String(req.params["id"] ?? "");
      if (entityCode !== "purchase_order") {
        res.status(501).json({ error: "MODE_NOT_IMPLEMENTED", message: `Draft discard is not implemented for '${entityCode}' yet.` });
        return;
      }
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant from session." });
        return;
      }
      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
      const poCommitmentType = await resolvePurchaseOrderCommitmentType(db);
      const deleted = await sql<{ id: string }>`
        DELETE FROM document.commitment
         WHERE tenant_id = ${tenantId}::uuid
           AND id = ${id}::uuid
           AND commitment_type = ${poCommitmentType}::text
           AND is_provisional = true
           AND status = 'draft'
           AND code = ''
           AND draft_started_by = ${principalId}::uuid
         RETURNING id
      `.execute(db);
      if (!deleted.rows[0]) {
        res.status(409).json({ error: "NOT_A_PROVISIONAL_DRAFT", message: "Only the user's active provisional draft can be discarded through this endpoint." });
        return;
      }
      res.status(200).json({ ok: true, discarded: true });
    } catch (err) {
      logger?.error("records_draft_discard_error", { err: String(err) });
      next(err);
    }
  };

  const createPresetHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entity   = String(req.params["entity"] ?? "").trim();
      const body     = req.body as { name?: string; filters?: unknown; is_shared?: boolean } | undefined;
      const name     = (body?.name ?? "").trim();
      const filters  = body?.filters ?? {};
      const isShared = body?.is_shared === true;

      if (!name) { res.status(400).json({ error: "name is required" }); return; }

      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "Tenant not found" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const now = new Date().toISOString();
      const id  = crypto.randomUUID();

      await (db
        .insertInto("master.filter_preset" as never)
        .values({
          id, tenant_id: tenantId, principal_id: principalId,
          entity_code: entity, name,
          filters: JSON.stringify(filters),
          is_shared: isShared,
          created_at: now, updated_at: now,
          created_by: principalId, updated_by: principalId,
        } as never)
        .onConflict((oc) =>
          (oc as any).columns(["tenant_id", "principal_id", "entity_code", "name"]).doUpdateSet({
            filters:    JSON.stringify(filters),
            is_shared:  isShared,
            updated_at: now,
            updated_by: principalId,
          })
        )
        .execute() as Promise<unknown>);

      res.status(201).json({ ok: true, data: { id, name, filters, isShared } });
    } catch (err) {
      logger?.error("records_filter_presets_create_error", { err: String(err) });
      next(err);
    }
  };

  const deletePresetHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entity   = String(req.params["entity"]   ?? "").trim();
      const presetId = String(req.params["presetId"] ?? "").trim();

      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "Tenant not found" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      // Only the owner can delete (even if shared)
      await (db
        .deleteFrom("master.filter_preset" as never)
        .where("id" as never,           "=", presetId    as never)
        .where("tenant_id" as never,    "=", tenantId    as never)
        .where("entity_code" as never,  "=", entity      as never)
        .where("principal_id" as never, "=", principalId as never)
        .execute() as Promise<unknown>);

      res.status(204).end();
    } catch (err) {
      logger?.error("records_filter_presets_delete_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /:entity/:id/lock â€” acquire pessimistic document edit lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const acquireLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const { tenantId, principalId } = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const table = await resolveEntityTable(db, entityCode);
      if (!table) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const body      = (req.body ?? {}) as Record<string, unknown>;
      const sessionId = typeof body["session_id"] === "string" ? body["session_id"] : undefined;

      const lockSnap  = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "jobs.editlock").catch(() => null)
        : null;
      const defaultLockTtl = getIntParam(lockSnap, "jobs.editlock.default_ttl_seconds", DEFAULT_LOCK_TTL_SECONDS);
      const policy    = resolveConcurrencyPolicy(table.concurrency_policy, { lockTtlSeconds: defaultLockTtl });
      const ttl       = policy.lockTtlSeconds;

      const result = await acquireLock(db, { tenantId, entityName: entityCode, recordId, lockedBy: principalId, sessionId, ttlSeconds: ttl });

      if (!result.acquired) {
        res.status(423).json({ error: "LOCKED", locked_by: result.lockedBy, is_locked_by_self: result.isLockedBySelf, expires_at: result.expiresAt });
        return;
      }

      // Fetch current row_version so client can store it alongside the lock token
      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = await (db.selectFrom(fullTable) as any)
        .select(["row_version"])
        .where("id", "=", recordId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst() as { row_version?: number } | undefined;

      res.json({ ok: true, lock_token: result.lockToken, expires_at: result.expiresAt, row_version: rec?.row_version ?? null });
    } catch (err) {
      logger?.error("records_lock_acquire_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /:entity/:id/lock â€” read current lock state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const { tenantId } = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const status = await getLockStatus(db, { tenantId, entityName: entityCode, recordId });
      res.json(status);
    } catch (err) {
      logger?.error("records_lock_get_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ PUT /:entity/:id/lock/heartbeat â€” renew lock TTL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renewLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const { tenantId, principalId } = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body      = (req.body ?? {}) as Record<string, unknown>;
      const lockToken = typeof body["lock_token"] === "string" ? body["lock_token"] : "";
      if (!lockToken) { res.status(400).json({ error: "MISSING_LOCK_TOKEN" }); return; }

      const result = await renewLock(db, { tenantId, entityName: entityCode, recordId, lockedBy: principalId, lockToken });
      if (!result.renewed) {
        const status = result.reason === "expired" ? 410 : 423;
        res.status(status).json({ error: result.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID", reason: result.reason });
        return;
      }
      res.json({ ok: true, expires_at: result.expiresAt });
    } catch (err) {
      logger?.error("records_lock_renew_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ DELETE /:entity/:id/lock â€” release lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const releaseLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const { tenantId, principalId } = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body      = (req.body ?? {}) as Record<string, unknown>;
      const lockToken = typeof body["lock_token"] === "string" ? body["lock_token"] : "";
      if (!lockToken) { res.status(400).json({ error: "MISSING_LOCK_TOKEN" }); return; }

      await releaseLock(db, { tenantId, entityName: entityCode, recordId, lockedBy: principalId, lockToken });
      res.status(204).end();
    } catch (err) {
      logger?.error("records_lock_release_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ DELETE /:entity/:id/lock/force â€” admin force-release â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const forceReleaseLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const { tenantId, principalId } = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // Permission gate â€” caller must have records.lock.force_release
      const permissionCheck = await checkPermission(db, tenantId, principalId, "records.lock.force_release");
      if (!requireAllow(permissionCheck, res)) return;

      await forceReleaseLock(db, { tenantId, entityName: entityCode, recordId });
      res.status(204).end();
    } catch (err) {
      logger?.error("records_lock_force_release_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /records/:entity/op/:op â€” generic entity-op dispatcher (P6) â”€â”€â”€â”€â”€
  // Resolves the verified auth context once, then hands the request off to
  // whichever handler is registered under (entityCode, opCode) in
  // entity-op.registry.ts. P2P conversion UI calls this canonical endpoint;
  // line-source.route.ts exposes read-only picker routes only.
  const entityOpHandler: RequestHandler = async (req, res, next) => {
    try {
      const verifiedContext = requireVerifiedContext(req, res);
      const {
        tenantId,
        principalId,
        companyCodeId: activeCompanyCodeId,
        legalEntityId: activeLegalEntityId,
      } = verifiedContext;

      const entityCode = req.params["entity"] as string;
      const opCode     = req.params["op"] as string;
      // The legacy /records alias delegates to this exact handler while old
      // machine clients drain. It is observable and cannot select a weaker
      // auth path than /runtime/v1/entities.
      if ((req.originalUrl ?? req.url).includes("/records/")) {
        logger?.warn("legacy_entity_operation_alias_used", {
          entity: entityCode,
          operation: opCode,
          callerRoute: req.header("x-pathname") ?? null,
          migrationBlocker: req.header("x-migration-blocker") ?? null,
        });
      }
      const op = getEntityOp(entityCode, opCode);
      if (!op) {
        res.status(404).json({
          error:   "ENTITY_OP_NOT_FOUND",
          message: `No op '${opCode}' registered for entity '${entityCode}'.`,
        });
        return;
      }

      const requestedBody = (req.body ?? {}) as Record<string, unknown>;
      const requestedSourceIds = resolveEntityOpSourceIds(op.workspaceScope, requestedBody);
      if (requestedSourceIds.length === 0) {
        res.status(400).json({
          error: "INVALID_OPERATION_SOURCE",
          message: `Operation '${opCode}' requires a source document id in: ${op.workspaceScope.sourceDocument.acceptedIdPaths.join(", ")}.`,
        });
        return;
      }
      const normalizedSource = await normalizeEntityOperationSourceIds({
        db, tenantId, entityCode: op.workspaceScope.sourceDocument.entityCode,
        sourcePaths: op.workspaceScope.sourceDocument.acceptedIdPaths, body: requestedBody,
      });
      if (!normalizedSource) {
        res.status(400).json({ error: "INVALID_OPERATION_SOURCE", message: "The operation source is unknown, ambiguous, or outside the active tenant." });
        return;
      }
      const { sourceIds, body } = normalizedSource;
      if (sourceIds.length === 0) {
        res.status(400).json({
          error: "INVALID_OPERATION_SOURCE",
          message: `Operation '${opCode}' requires a source document id in: ${op.workspaceScope.sourceDocument.acceptedIdPaths.join(", ")}.`,
        });
        return;
      }
      if (op.workspaceScope.sourceDocument.cardinality === "single" && sourceIds.length !== 1) {
        res.status(400).json({
          error: "AMBIGUOUS_OPERATION_SOURCE",
          message: `Operation '${opCode}' accepts exactly one source document.`,
          sourceEntityCode: op.workspaceScope.sourceDocument.entityCode,
        });
        return;
      }
      if (!documentWorkspaceTokenBypassEnabled()) {
        const capabilities = String(req.header("X-Document-Edit-Workspace") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const sourceTable = await resolveEntityTable(db, op.workspaceScope.sourceDocument.entityCode);
        const currentPlanHashes = sourceTable ? await resolveDocumentRuntimePlanHashes(db, sourceTable.version_id) : [];
        for (const sourceId of sourceIds) {
          const inspection = capabilities
            .map((token) => inspectDocumentWorkspaceCapability({ token, tenantId, principalId, entityCode: op.workspaceScope.sourceDocument.entityCode, recordId: sourceId, profile: op.workspaceScope.workspaceProfile }))
            .find((result) => result.valid);
          if (!inspection) {
            const failures = capabilities
              .map((token) => inspectDocumentWorkspaceCapability({ token, tenantId, principalId, entityCode: op.workspaceScope.sourceDocument.entityCode, recordId: sourceId, profile: op.workspaceScope.workspaceProfile }))
              .filter((result): result is { valid: false; reason: "invalid" | "stale" | "profile" } => !result.valid);
            const reason = failures.some((result) => result.reason === "profile") ? "profile"
              : failures.some((result) => result.reason === "stale") ? "stale" : "invalid";
            const error = reason === "profile" ? "WORKSPACE_PROFILE_DENIED" : reason === "stale" ? "STALE_WORKSPACE" : "INVALID_WORKSPACE";
            const status = reason === "profile" ? 403 : 409;
            res.status(status).json({ error, message: "Reload an authorized source document workspace before running this operation.", sourceEntityCode: op.workspaceScope.sourceDocument.entityCode, sourceDocumentId: sourceId });
            return;
          }
          if (currentPlanHashes.length > 0 && !currentPlanHashes.includes(inspection.planHash)) {
            res.status(409).json({ error: "STALE_WORKSPACE", message: "The source document plan has changed; reload before running this operation.", sourceDocumentId: sourceId });
            return;
          }
        }
      }
      const sourceTable = await resolveEntityTable(db, op.workspaceScope.sourceDocument.entityCode);
      if (!sourceTable) {
        res.status(400).json({ error: "INVALID_OPERATION_SOURCE", message: "The operation source entity is not available." });
        return;
      }
      for (const sourceId of sourceIds) {
        const companyScope = await checkEntityOperationCompanyScope({
          db,
          table: sourceTable,
          tenantId,
          principalId,
          recordId: sourceId,
          activeCompanyCodeId,
          activeLegalEntityId,
        });
        if (!companyScope.allowed) {
          res.status(403).json({
            error: companyScope.error,
            message: companyScope.message,
            sourceDocumentId: sourceId,
          });
          return;
        }
        const sourceAuthorization = await checkEntityMutationAuthorization({
          db, table: toMutationTableInfo(sourceTable), entityCode: op.workspaceScope.sourceDocument.entityCode,
          tenantId, principalId, action: "update", recordId: sourceId, logger,
          authorizationContext: verifiedContext,
        });
        if (!sourceAuthorization.allowed) {
          res.status(sourceAuthorization.status).json({ error: sourceAuthorization.error, message: sourceAuthorization.message, sourceDocumentId: sourceId });
          return;
        }
      }
      if (op.workspaceScope.createsDocument && op.workspaceScope.targetEntityCode) {
        const targetTable = await resolveEntityTable(db, op.workspaceScope.targetEntityCode);
        if (!targetTable) {
          res.status(403).json({ error: "ENTITY_OPERATION_REQUIRED", message: `Target entity '${op.workspaceScope.targetEntityCode}' is not available.` });
          return;
        }
        const targetAuthorization = await checkEntityMutationAuthorization({
          db, table: toMutationTableInfo(targetTable), entityCode: op.workspaceScope.targetEntityCode,
          tenantId, principalId, action: "create", logger,
          authorizationContext: verifiedContext,
        });
        if (!targetAuthorization.allowed) {
          res.status(targetAuthorization.status).json({ error: targetAuthorization.error, message: targetAuthorization.message });
          return;
        }
      }
      const operationPermission = await (db.selectFrom("control.entity_operation as eo") as any)
        .select("permission_code")
        .where("entity_name", "=", entityCode)
        .where((eb: any) => eb.or([eb("permission_code", "=", opCode), eb("permission_code", "like", `%.${opCode}`)]))
        .where((eb: any) => eb.or([eb("tenant_id", "is", null), eb("tenant_id", "=", tenantId)]))
        .orderBy("tenant_id", "desc").executeTakeFirst() as { permission_code?: string } | undefined;
      if (!operationPermission?.permission_code) {
        res.status(403).json({ error: "ENTITY_OPERATION_REQUIRED", message: `Operation '${opCode}' is not enabled for '${entityCode}'.` });
        return;
      }
      for (const sourceId of sourceIds) {
        const permissionDecision = await checkPermission(db, tenantId, principalId, operationPermission.permission_code, {
          entity_type: op.workspaceScope.sourceDocument.entityCode, entity_id: sourceId,
        }, logger);
        if (permissionDecision.decision !== "allow") {
          res.status(403).json({ error: "PERMISSION_DENIED", message: `Permission '${operationPermission.permission_code}' is required for this operation.`, sourceDocumentId: sourceId });
          return;
        }
      }
      const operationKey = op.workspaceScope.idempotencyPolicy.operationKey;
      const requestIdentity = buildEntityOpRequestIdentity(op.workspaceScope, body);
      const idempotency = buildDocumentRuntimeIdempotency({
        request: req,
        entityCode,
        recordId: sourceIds[0]!,
        expectedVersion: 0,
        body: requestIdentity,
        operationKey,
      });
      try {
        const outcome = await db.transaction().execute(async (trx) => {
          const claim = await claimDocumentRuntimeIdempotency(trx, {
            tenantId,
            principalId,
            entityCode: op.workspaceScope.sourceDocument.entityCode,
            documentId: sourceIds[0]!,
            idempotencyKey: idempotency.key,
            requestHash: idempotency.requestHash,
            operationKey,
          });
          if (claim.kind === "replay") {
            const replay = claim.response as { status?: unknown; body?: unknown };
            if (typeof replay.status === "number" && replay.body && typeof replay.body === "object") {
              return { status: replay.status, body: replay.body as Record<string, unknown> };
            }
            throw new Error("ENTITY_OPERATION_IDEMPOTENCY_REPLAY_INVALID");
          }
          if (claim.kind === "in_progress") {
            throw new EntityOperationAbort({ status: 409, body: { error: "OPERATION_IN_PROGRESS", message: "An identical operation is already in progress." } });
          }
          if (claim.kind === "mismatch") {
            throw new EntityOperationAbort({ status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency-Key was already used for another request." } });
          }

          const domainOutcome = await op.handler({ db: trx as unknown as Kysely<Record<string, any>>, tenantId, principalId, logger }, body);
          if (domainOutcome.status >= 400 || !domainOutcome.body.ok) {
            throw new EntityOperationAbort(domainOutcome);
          }

          const sourceTable = await resolveEntityTable(trx, op.workspaceScope.sourceDocument.entityCode);
          const sourceNodes = sourceTable
            ? await resolveCompiledRuntimeInvalidationNodes(trx, {
                entityVersionId: sourceTable.version_id,
                changedFields: [], itemsMutated: op.workspaceScope.runtimeEventPolicy.itemsMutated,
                operationKey: op.workspaceScope.runtimeEventPolicy.invalidationOperationKey,
              })
            : [];
          if (op.workspaceScope.runtimeEventPolicy.sourceBehavior === "advance") {
            for (const sourceId of sourceIds) {
              await advanceDocumentRuntimeState(trx, {
                tenantId, entityCode: op.workspaceScope.sourceDocument.entityCode, documentId: sourceId,
                actorId: principalId, affectedNodeKeys: sourceNodes,
                eventType: op.workspaceScope.runtimeEventPolicy.eventType,
                payload: { operation: op.opCode, role: "source", targetEntityCode: op.workspaceScope.targetEntityCode },
              });
            }
          }

          if (op.workspaceScope.createsDocument && op.workspaceScope.runtimeEventPolicy.targetBehavior !== "none") {
            const targetEntityCode = op.workspaceScope.targetEntityCode!;
            const targetId = targetDocumentIdFromOperationBody(targetEntityCode, domainOutcome.body);
            if (!targetId) throw new Error("ENTITY_OPERATION_TARGET_DOCUMENT_MISSING");
            const targetTable = await resolveEntityTable(trx, targetEntityCode);
            const targetNodes = targetTable
              ? await resolveCompiledRuntimeInvalidationNodes(trx, {
                  entityVersionId: targetTable.version_id,
                  changedFields: [], itemsMutated: op.workspaceScope.runtimeEventPolicy.itemsMutated,
                  operationKey: op.workspaceScope.runtimeEventPolicy.invalidationOperationKey,
                })
              : [];
            await advanceDocumentRuntimeState(trx, {
              tenantId, entityCode: targetEntityCode, documentId: targetId,
              actorId: principalId, affectedNodeKeys: targetNodes,
              eventType: op.workspaceScope.runtimeEventPolicy.eventType,
              payload: { operation: op.opCode, role: "target", sourceEntityCode: op.workspaceScope.sourceDocument.entityCode, sourceDocumentIds: sourceIds },
            });
          }

          await completeDocumentRuntimeIdempotency(trx, {
            id: claim.id, actorId: principalId,
            response: { status: domainOutcome.status, body: domainOutcome.body },
            responseStatus: domainOutcome.status,
          });
          return domainOutcome;
        });
        res.status(outcome.status).json(outcome.body);
      } catch (err) {
        if (err instanceof EntityOperationAbort) {
          res.status(err.outcome.status).json(err.outcome.body);
          return;
        }
        throw err;
      }
    } catch (err) {
      logger?.error("entity_op_dispatch_error", {
        entity: req.params["entity"], op: req.params["op"], err: String(err),
      });
      next(err);
    }
  };

  // Top-level list â€” canonical + legacy alias.
  // The /records/* alias stays mounted because ~60 client files still call it
  // via the BFF relay catchall (apps/neon/app/api/records/[...path]/route.ts).
  // Delete the alias in one PR once the client cleanup track migrates all
  // callers to runtimePath.list(...). The strict guard
  // (server/scripts/check-runtime-server-paths.ts) prevents new references
  // in non-allowlisted files.
  router.post("/runtime/v1/reference-labels/resolve", referenceLabelsResolveHandler);
  router.get("/runtime/v1/entities/:entity", listHandler);
  router.get("/records/:entity",             listHandler);
  router.get("/records/:entity/_debug", debugHandler);
  // Generic entity-op dispatcher (P6) â€” canonical + legacy alias.
  // Registered before /:id so ':entity/op/:op' does not match the record-by-id
  // patterns below.
  router.post("/runtime/v1/entities/:entity/op/:op", entityOpHandler);
  router.post("/records/:entity/op/:op",             entityOpHandler);
  // Sub-resource routes must be registered before /:id to avoid shadowing
  router.get("/records/:entity/:id/lines",                                      linesHandler);
  router.post("/records/:entity/:id/lines",                                     createLineHandler);
  router.post("/records/:entity/:id/lines/:lineId/copy",                         copyLineHandler);
  router.patch("/records/:entity/:id/lines/:lineId",                            patchLineHandler);
  router.delete("/records/:entity/:id/lines/:lineId",                           deleteLineHandler);
  router.get("/records/:entity/:id/lines/:lineId/distributions",                lineDistributionsHandler);
  router.post("/records/:entity/:id/lines/:lineId/distributions",               createDistributionHandler);
  router.put("/records/:entity/:id/lines/:lineId/distributions",                replaceLineDistributionsHandler);
  router.patch("/records/:entity/:id/lines/:lineId/distributions/:distId",      patchDistributionHandler);
  router.delete("/records/:entity/:id/lines/:lineId/distributions/:distId",     deleteDistributionHandler);
  // Per-line accounting-distribution CRUD â€” canonical /runtime/v1/entities/...
  // alias. Matches runtimePath.lineDistribution{s}() in api-contracts; the
  // /records/* mount above stays in place until the client cleanup track
  // retires legacy callers, identical to the dual-mount pattern used by
  // filter-presets, workflow, lock, and the rest of the sub-resources below.
  router.get   ("/runtime/v1/entities/:entity/:id/lines/:lineId/distributions",                lineDistributionsHandler);
  router.post  ("/runtime/v1/entities/:entity/:id/lines/:lineId/copy",                         copyLineHandler);
  router.post  ("/runtime/v1/entities/:entity/:id/lines/:lineId/distributions",               createDistributionHandler);
  router.put   ("/runtime/v1/entities/:entity/:id/lines/:lineId/distributions",                replaceLineDistributionsHandler);
  router.patch ("/runtime/v1/entities/:entity/:id/lines/:lineId/distributions/:distId",      patchDistributionHandler);
  router.delete("/runtime/v1/entities/:entity/:id/lines/:lineId/distributions/:distId",     deleteDistributionHandler);
  // Filter presets â€” canonical + legacy alias.
  router.get   ("/runtime/v1/entities/:entity/filter-presets",            listPresetsHandler);
  router.post  ("/runtime/v1/entities/:entity/filter-presets",            createPresetHandler);
  router.delete("/runtime/v1/entities/:entity/filter-presets/:presetId",  deletePresetHandler);

  router.post  ("/runtime/v1/entities/:entity/draft/initiate",            initiateDraftHandler);
  router.post  ("/runtime/v1/entities/:entity/:id/draft/promote",         promoteDraftHandler);
  router.post  ("/runtime/v1/entities/:entity/:id/draft/discard",         discardDraftHandler);

  router.get   ("/records/:entity/filter-presets",                        listPresetsHandler);
  router.post  ("/records/:entity/filter-presets",                        createPresetHandler);
  router.delete("/records/:entity/filter-presets/:presetId",              deletePresetHandler);

  router.post  ("/records/:entity/draft/initiate",                        initiateDraftHandler);
  router.post  ("/records/:entity/:id/draft/promote",                     promoteDraftHandler);
  router.post  ("/records/:entity/:id/draft/discard",                     discardDraftHandler);
  // versions route is registered in index.ts via createVersionsRoute
  // Per-record sub-resource endpoints + read stubs â€” canonical + legacy alias.
  router.get ("/runtime/v1/entities/:entity/:id/workflow",           workflowHandler);
  router.get ("/runtime/v1/entities/:entity/:id/attachments",        subResourceStub("attachments"));
  router.get ("/runtime/v1/entities/:entity/:id/distributions",      distributionsHandler);
  router.get ("/runtime/v1/entities/:entity/:id/submit-preflight",   submitPreflightHandler);
  router.get ("/runtime/v1/entities/:entity/:id/approvals",          approvalsHandler);
  router.post("/runtime/v1/entities/:entity/:id/approvals",          addApproverHandler);
  router.get ("/runtime/v1/entities/:entity/:id/tasks",              subResourceStub("tasks"));
  router.get ("/runtime/v1/entities/:entity/:id/watchers",           subResourceStub("watchers"));
  router.get ("/runtime/v1/entities/:entity/:id/rules",              subResourceStub("rules"));
  router.get ("/runtime/v1/entities/:entity/:id/integration-events", subResourceStub("integration-events"));
  router.get ("/runtime/v1/entities/:entity/:id/quality",            subResourceStub("quality"));
  router.get ("/runtime/v1/entities/:entity/:id/reports",            subResourceStub("reports"));

  router.get ("/records/:entity/:id/workflow",           workflowHandler);
  router.get ("/records/:entity/:id/attachments",        subResourceStub("attachments"));
  router.get ("/records/:entity/:id/distributions",      distributionsHandler);
  router.get ("/records/:entity/:id/approvals",          approvalsHandler);
  router.post("/records/:entity/:id/approvals",          addApproverHandler);
  router.get ("/records/:entity/:id/tasks",              subResourceStub("tasks"));
  router.get ("/records/:entity/:id/watchers",           subResourceStub("watchers"));
  router.get ("/records/:entity/:id/rules",              subResourceStub("rules"));
  router.get ("/records/:entity/:id/integration-events", subResourceStub("integration-events"));
  router.get ("/records/:entity/:id/quality",            subResourceStub("quality"));
  router.get ("/records/:entity/:id/reports",            subResourceStub("reports"));
  // Lock routes â€” must be registered before /:id to avoid shadowing.
  // Canonical + legacy alias (see top-level-list comment above for the rationale).
  router.post  ("/runtime/v1/entities/:entity/:id/lock",           acquireLockHandler);
  router.get   ("/runtime/v1/entities/:entity/:id/lock",           getLockHandler);
  router.put   ("/runtime/v1/entities/:entity/:id/lock/heartbeat", renewLockHandler);
  router.delete("/runtime/v1/entities/:entity/:id/lock/force",     forceReleaseLockHandler);
  router.delete("/runtime/v1/entities/:entity/:id/lock",           releaseLockHandler);

  router.post  ("/records/:entity/:id/lock",           acquireLockHandler);
  router.get   ("/records/:entity/:id/lock",           getLockHandler);
  router.put   ("/records/:entity/:id/lock/heartbeat", renewLockHandler);
  router.delete("/records/:entity/:id/lock/force",     forceReleaseLockHandler);
  router.delete("/records/:entity/:id/lock",           releaseLockHandler);

  // Edit context, workspace submit, and SSE stream.
  router.post ("/runtime/v1/entities/:entity/:id/edit/submit",     documentEditSubmitHandler);
  router.get  ("/runtime/v1/entities/:entity/:id/stream",         recordStreamHandler);

  router.get  ("/records/:entity/:id/stream",         recordStreamHandler);

  const phase3PilotEntities = new Set(
    (process.env["ENTITY_MUTATION_SERVICE_PILOTS"] ?? "company_code,cost_center")
      .split(",")
      .map((value) => value.trim().replace(/-/g, "_"))
      .filter(Boolean),
  );
  const isPhase3Pilot = (entityCode: string): boolean =>
    phase3PilotEntities.has(entityCode.replace(/-/g, "_"));
  const configuredMutationStage = ((): MutationKernelRolloutStage => {
    const value = process.env["MUTATION_KERNEL_STAGE"];
    return value === "shadow_validation" || value === "dual_read_comparison"
      || value === "internal_tenants" || value === "small_external_cohort" || value === "full_rollout"
      ? value
      : "shadow_validation";
  })();
  const internalMutationTenants = new Set((process.env["MUTATION_KERNEL_INTERNAL_TENANTS"] ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  const externalMutationCohort = new Set((process.env["MUTATION_KERNEL_EXTERNAL_COHORT"] ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean));

  // Reads remain in the compatibility route while canonical mutations are
  // composed from their transport-only module.
  router.get   ("/runtime/v1/entities/:entity/:id", getHandler);
  router.get   ("/records/:entity/:id", getHandler);
  registerEntityMutationRoutes(router, {
    service: entityMutationService,
    descriptors: entityDescriptorRepository,
    isCanonicalEntity: isPhase3Pilot,
    resolveRollout: (context, entityCode, operation) => resolveMutationKernelRollout({
      tenantKey: context.tenantId,
      entityCode: entityCode.replace(/-/g, "_"),
      operation,
      stage: configuredMutationStage,
      isInternalTenant: internalMutationTenants.has(context.tenantId),
      isExternalCohort: externalMutationCohort.has(context.tenantId),
    }),
    legacy: { create: createHandler, put: updateHandler, patch: patchHandler, delete: deleteHandler },
    afterCommit: async (result, context) => {
      const table = await resolveEntityTable(db, result.entityCode);
      if (table) await invalidateListCachesForEntity(context.tenantId, result.entityCode, table);
      if (result.action === "delete") {
        publishRecordEvent(context.tenantId, result.entityCode, result.recordId, "record.deleted", {
          id: result.recordId,
        }, new Date().toISOString());
      }
    },
    ...(logger ? { logger } : {}),
  });

  return router;
}
