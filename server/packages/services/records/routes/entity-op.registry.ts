/**
 * Entity Operation Registry — dispatch backend for
 *   POST /records/:entity/op/:code
 *
 * Runtime map (entity_code, op_code) → handler. Records-route resolves the
 * op, applies auth + tenant + principal in a thin dispatcher, and then hands
 * the body to the handler.
 *
 * Mirrors write-facade.registry.ts, but broader in intent:
 *   - write-facade only handles CREATE on view-backed entities
 *   - entity-op handles any named operation on any entity (P2P chain
 *     transitions like commitment-from-requisition today; extendable to
 *     workflow transitions, batch actions, custom flows)
 *
 * Each registration is discoverable from control.entity_operation
 * (permission_code doubles as opCode) so tenants can see what's available
 * without reading source. The registry is authoritative for dispatch; the
 * DB row is for UI/permissions.
 */

import type { Kysely } from "kysely";
import {
  createCommitmentFromRequisitionInTransaction,
  createReceiptFromCommitmentInTransaction,
  createServiceSheetFromCommitmentInTransaction,
  createInvoiceFromReceiptInTransaction,
  createInvoiceFromServiceSheetInTransaction,
  createPaymentFromInvoiceInTransaction,
  resolveCompanyAndBaseCurrency,
  resolveFiscalPeriod,
  allocateDocumentNumber,
  type CommitmentFromRequisitionLineInput,
  type ReceiptFromCommitmentLineInput,
  type ServiceSheetFromCommitmentLineInput,
  type InvoiceFromReceiptLineInput,
  type InvoiceFromServiceSheetLineInput,
  type PaymentFromInvoiceAllocationInput,
  aggregateSourcingDemand,
  allocateSourcingAward,
  convertSourcingAward,
  createSourcingEvent,
  SourcingDocumentError,
  type SourcingPermissionDecision,
  allocateSalesQuotation,
  convertSalesQuotation,
  createSalesOpportunity,
  createSalesQuotation,
  SalesDocumentError,
} from "@athyper/svc-business";
import { checkPermission as iamCheckPermission } from "@athyper/svc-iam";
import { sql } from "kysely";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface Logger {
  // `warn` is required so this Logger is assignable to BusinessLogger from
  // @athyper/svc-business, which the preflight helpers rely on.
  warn(event: string, fields?: Record<string, unknown>): void;
  info?(event: string, fields?: Record<string, unknown>): void;
  error?(event: string, fields?: Record<string, unknown>): void;
}

export interface EntityOpDeps {
  db:          AnyDb;
  tenantId:    string;
  principalId: string;
  logger?:     Logger;
}

export interface EntityOpOutcome {
  status: number;
  body:   Record<string, unknown>;
}

export type EntityOpHandler = (
  deps: EntityOpDeps,
  body: Record<string, unknown>,
) => Promise<EntityOpOutcome>;

export interface RegisteredEntityOp {
  entityCode:   string;
  opCode:       string;
  handler:      EntityOpHandler;
  /** Future: mirror entity_operation.emits_outbox_event so the dispatcher
   *  can auto-emit without each handler wiring its own outbox call. */
  outboxEvent?: string;
  /** Declarative workspace binding consumed by the generic dispatcher. */
  workspaceScope: EntityOpWorkspaceScope;
}

export interface EntityOpWorkspaceScope {
  sourceDocument: {
    /** Entity owning the document(s) that authorize this operation. */
    entityCode: string;
    /** Dot paths in the request body; `[]` denotes one or more source ids. */
    acceptedIdPaths: readonly string[];
    required: boolean;
    /** `single` rejects more than one resolved source; `multiple` requires a capability per source. */
    cardinality: "single" | "multiple";
  };
  /** Capability profile required on every declared source document. */
  workspaceProfile: "edit" | "approve" | "create";
  createsDocument: boolean;
  targetEntityCode?: string;
  runtimeEventPolicy: {
    eventType: string;
    invalidationSource: "operation";
    /** Compiled-plan operation action; `*` is the compiler's document-operation wildcard. */
    invalidationOperationKey: string;
    /** Whether this operation writes a document collection node. */
    itemsMutated: boolean;
    sourceBehavior: "advance" | "none";
    targetBehavior: "initialize" | "advance" | "none";
  };
  idempotencyPolicy: {
    operationKey: string;
    requestIdentityPaths: readonly string[];
    replayResponsePolicy: "stored_response";
  };
}

function key(entityCode: string, opCode: string): string {
  return `${entityCode}::${opCode}`;
}

export function registerEntityOp(op: RegisteredEntityOp): void {
  const k = key(op.entityCode, op.opCode);
  validateEntityOpWorkspaceScope(op);
  entityHandlerRegistryFamily.register("entity_operation", k, op);
}

/** Validates the declarative operation contract at registration/start-up time. */
export function validateEntityOpWorkspaceScope(op: RegisteredEntityOp): void {
  const scope = op.workspaceScope;
  const sourceDocument = scope?.sourceDocument;
  if (!sourceDocument || !sourceDocument.entityCode?.trim() || !sourceDocument.acceptedIdPaths?.length || !sourceDocument.required) {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} must declare a source workspace scope.`);
  }
  if (!sourceDocument.acceptedIdPaths.every((path) => /^[A-Za-z][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[\])?)*$/.test(path))) {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} has an invalid source id path.`);
  }
  if (new Set(sourceDocument.acceptedIdPaths).size !== sourceDocument.acceptedIdPaths.length) {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} has ambiguous duplicate source id paths.`);
  }
  if (sourceDocument.cardinality !== "single" && sourceDocument.cardinality !== "multiple") {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} has an invalid source cardinality.`);
  }
  if (scope.createsDocument !== Boolean(scope.targetEntityCode?.trim())) {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} target entity must be declared iff it creates a document.`);
  }
  const runtimeEventPolicy = scope.runtimeEventPolicy;
  if (!runtimeEventPolicy?.eventType?.trim() || runtimeEventPolicy.invalidationSource !== "operation") {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} must declare an operation runtime event policy.`);
  }
  if (!runtimeEventPolicy.invalidationOperationKey?.trim()) {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} must declare an operation invalidation key.`);
  }
  const idempotencyPolicy = scope.idempotencyPolicy;
  if (!idempotencyPolicy?.operationKey?.trim() || !idempotencyPolicy.requestIdentityPaths?.length || idempotencyPolicy.replayResponsePolicy !== "stored_response") {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} must declare idempotency identity paths.`);
  }
  if (!idempotencyPolicy.requestIdentityPaths.every((path) => /^[A-Za-z][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[\])?)*$/.test(path))) {
    throw new Error(`Entity op ${op.entityCode}::${op.opCode} has an invalid idempotency identity path.`);
  }
}

export function getEntityOp(
  entityCode: string,
  opCode:     string,
): RegisteredEntityOp | undefined {
  return entityHandlerRegistryFamily.resolve<RegisteredEntityOp>("entity_operation", key(entityCode, opCode));
}

export function listEntityOpsForEntity(entityCode: string): RegisteredEntityOp[] {
  const out: RegisteredEntityOp[] = [];
  for (const handlerKey of entityHandlerRegistryFamily.list("entity_operation")) {
    const op = entityHandlerRegistryFamily.resolve<RegisteredEntityOp>("entity_operation", handlerKey)!;
    if (op.entityCode === entityCode) out.push(op);
  }
  return out;
}

/** Extracts and de-duplicates source document ids using declared body paths. */
export function resolveEntityOpSourceIds(
  scope: EntityOpWorkspaceScope,
  body: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  for (const path of scope.sourceDocument.acceptedIdPaths) {
    for (const value of readPathValues(body, path.split("."))) {
      if (typeof value === "string" && value.trim()) ids.add(value.trim());
    }
  }
  return [...ids].sort();
}

/** Canonical, metadata-limited request projection used to hash idempotent operations. */
export function buildEntityOpRequestIdentity(
  scope: EntityOpWorkspaceScope,
  body: Record<string, unknown>,
): Record<string, unknown[]> {
  return Object.fromEntries(scope.idempotencyPolicy.requestIdentityPaths
    .slice()
    .sort()
    .map((path) => [path, readPathValues(body, path.split("."))]));
}

function readPathValues(value: unknown, parts: string[]): unknown[] {
  if (parts.length === 0) return [value];
  const [part, ...rest] = parts;
  if (!part) return [];
  const isMany = part.endsWith("[]");
  const key = isMany ? part.slice(0, -2) : part;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const child = (value as Record<string, unknown>)[key];
  if (isMany) {
    return Array.isArray(child) ? child.flatMap((item) => readPathValues(item, rest)) : [];
  }
  return readPathValues(child, rest);
}

export function resetEntityOpRegistryForTests(): void {
  entityHandlerRegistryFamily.clear("entity_operation");
}

function sourcingErrorOutcome(error: unknown): EntityOpOutcome {
  if (error instanceof SourcingDocumentError || error instanceof SalesDocumentError) return { status: error.status, body: { error: error.code, message: error.message } };
  if (error instanceof Error && ["SourcingAuthorizationError", "SalesAuthorizationError"].includes(error.name)) {
    const authError = error as Error & { status?: number; code?: string };
    return { status: authError.status ?? 403, body: { error: authError.code ?? "PERMISSION_DENIED", message: authError.message } };
  }
  throw error;
}

function sourcingPermissionChecker(deps: EntityOpDeps) {
  return async (permissionCode: string, context?: Record<string, unknown>): Promise<SourcingPermissionDecision> => {
    const permissionLogger = deps.logger
      ? {
          warn: deps.logger.warn,
          error: deps.logger.error ?? (() => undefined),
          info: deps.logger.info ?? (() => undefined),
        }
      : undefined;
    const result = await iamCheckPermission(deps.db, deps.tenantId, deps.principalId, permissionCode, context, permissionLogger);
    return result as unknown as SourcingPermissionDecision;
  };
}

const sourcingCreateHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { code?: string; name?: string; operatingOrganizationId?: string; eventType?: "rfp" | "rfq"; buyingModel?: "federated" | "central_buyer"; centralBuyerCompanyId?: string | null; participantCompanyCodeIds?: string[]; openAt?: string | null; closeAt?: string | null; metadata?: Record<string, unknown> };
    return { status: 201, body: await createSourcingEvent({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, {
      code: input.code ?? "", name: input.name ?? "", operatingOrganizationId: input.operatingOrganizationId ?? "", eventType: input.eventType, buyingModel: input.buyingModel, centralBuyerCompanyId: input.centralBuyerCompanyId, participantCompanyCodeIds: input.participantCompanyCodeIds ?? [], openAt: input.openAt, closeAt: input.closeAt, metadata: input.metadata,
    }) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const sourcingAggregateDemandHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { sourcingEventId?: string; demandLineIds?: string[] };
    return { status: 200, body: await aggregateSourcingDemand({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, { sourcingEventId: input.sourcingEventId ?? "", demandLineIds: input.demandLineIds ?? [] }) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const sourcingAllocateAwardHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { awardId?: string; allocations?: Array<{ companyCodeId: string; allocationPercent?: number | null; allocationAmount?: number | null }> };
    return { status: 201, body: await allocateSourcingAward({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, input.awardId ?? "", input.allocations ?? []) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const sourcingConvertAwardHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { awardId?: string; currencyCode?: string };
    return { status: 201, body: await convertSourcingAward({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, input.awardId ?? "", input.currencyCode) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const salesOpportunityCreateHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { code?: string; name?: string; customerId?: string; operatingOrganizationId?: string; sellingModel?: "federated" | "principal_seller"; principalSellerCompanyId?: string | null; participantCompanyCodeIds?: string[] };
    return { status: 201, body: await createSalesOpportunity({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, {
      code: input.code ?? "", name: input.name ?? "", customerId: input.customerId ?? "", operatingOrganizationId: input.operatingOrganizationId ?? "",
      sellingModel: input.sellingModel, principalSellerCompanyId: input.principalSellerCompanyId, participantCompanyCodeIds: input.participantCompanyCodeIds ?? [],
    }) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const salesQuotationCreateHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { opportunityId?: string; code?: string; name?: string };
    return { status: 201, body: await createSalesQuotation({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, { opportunityId: input.opportunityId ?? "", code: input.code ?? "", name: input.name ?? "" }) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const salesQuotationAllocateHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { quotationId?: string; allocations?: Array<{ companyCodeId: string; allocationPercent?: number | null; allocationAmount?: number | null }> };
    return { status: 201, body: await allocateSalesQuotation({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, input.quotationId ?? "", input.allocations ?? []) };
  } catch (error) { return sourcingErrorOutcome(error); }
};

const salesQuotationConvertHandler: EntityOpHandler = async (deps, body) => {
  try {
    const input = body as { quotationId?: string; currencyCode?: string };
    return { status: 201, body: await convertSalesQuotation({ ...deps, checkPermission: sourcingPermissionChecker(deps) }, input.quotationId ?? "", input.currencyCode ?? "USD") };
  } catch (error) { return sourcingErrorOutcome(error); }
};

registerEntityOp({
  entityCode: "sales_opportunity",
  opCode: "create",
  outboxEvent: "sales.opportunity.created",
  workspaceScope: sourcingScope("operating_organization", ["operatingOrganizationId"], "sales.opportunity.created", ["operatingOrganizationId", "code"], true, "sales_opportunity"),
  handler: salesOpportunityCreateHandler,
});
registerEntityOp({
  entityCode: "sales_quotation",
  opCode: "create",
  outboxEvent: "sales.quotation.created",
  workspaceScope: sourcingScope("sales_opportunity", ["opportunityId"], "sales.quotation.created", ["opportunityId", "code"], true, "sales_quotation"),
  handler: salesQuotationCreateHandler,
});
registerEntityOp({
  entityCode: "sales_quotation",
  opCode: "allocate",
  outboxEvent: "sales.quotation.allocated",
  workspaceScope: sourcingScope("sales_quotation", ["quotationId"], "sales.quotation.allocated", ["quotationId", "allocations[].companyCodeId"]),
  handler: salesQuotationAllocateHandler,
});
registerEntityOp({
  entityCode: "sales_quotation",
  opCode: "convert",
  outboxEvent: "sales.quotation.converted",
  workspaceScope: sourcingScope("sales_quotation", ["quotationId"], "sales.quotation.converted", ["quotationId", "currencyCode"], true, "sales_order"),
  handler: salesQuotationConvertHandler,
});

/**
 * Non-HTTP dispatch helper. Used by tests, background workers, and the
 * legacy /p2p/* alias handlers that convert their URL params into an op
 * lookup. Returns a 404-shaped outcome when the op is unknown.
 */
export async function dispatchEntityOp(args: {
  db:          AnyDb;
  tenantId:    string;
  principalId: string;
  entityCode:  string;
  opCode:      string;
  body:        Record<string, unknown>;
  logger?:     Logger;
}): Promise<EntityOpOutcome> {
  const op = getEntityOp(args.entityCode, args.opCode);
  if (!op) {
    return { status: 404, body: {
      error:   "ENTITY_OP_NOT_FOUND",
      message: `No op '${args.opCode}' registered for entity '${args.entityCode}'.`,
    }};
  }
  return op.handler({
    db:          args.db,
    tenantId:    args.tenantId,
    principalId: args.principalId,
    logger:      args.logger,
  }, args.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Source-doc lookups (share across handlers)
// ─────────────────────────────────────────────────────────────────────────────

async function loadReceiptCompanyCode(
  db:        AnyDb,
  tenantId:  string,
  receiptId: string,
): Promise<string | null> {
  const result = await sql<{ company_code_id: string }>`
    SELECT company_code_id
      FROM document.receipt
     WHERE tenant_id = ${tenantId}::uuid
       AND id        = ${receiptId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.company_code_id ?? null;
}

async function loadServiceSheetCompanyCode(
  db:             AnyDb,
  tenantId:       string,
  serviceSheetId: string,
): Promise<string | null> {
  const result = await sql<{ company_code_id: string }>`
    SELECT company_code_id
      FROM document.service_sheet
     WHERE tenant_id = ${tenantId}::uuid
       AND id        = ${serviceSheetId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.company_code_id ?? null;
}

async function loadPaymentInvoiceCompanyCode(
  db:          AnyDb,
  tenantId:    string,
  allocations: PaymentFromInvoiceAllocationInput[],
): Promise<
  | { ok: true;  companyCodeId: string }
  | { ok: false; status: number; error: string; message: string }
> {
  const invoiceIds = [...new Set(allocations.map((a) => a.invoiceId).filter(Boolean))];
  if (invoiceIds.length === 0) {
    return { ok: false, status: 400, error: "NO_ALLOCATIONS",
      message: "At least one invoice allocation is required." };
  }
  const result = await sql<{ company_code_id: string; invoice_count: string | number }>`
    SELECT company_code_id, COUNT(DISTINCT id)::int AS invoice_count
      FROM document.purchase_invoice
     WHERE tenant_id = ${tenantId}::uuid
       AND id        = ANY(${invoiceIds}::uuid[])
     GROUP BY company_code_id
  `.execute(db);
  const foundCount = result.rows.reduce((sum, r) => sum + Number(r.invoice_count ?? 0), 0);
  if (foundCount !== invoiceIds.length) {
    return { ok: false, status: 404, error: "INVOICES_NOT_FOUND",
      message: "One or more selected invoices were not found for tenant." };
  }
  if (result.rows.length !== 1) {
    return { ok: false, status: 422, error: "MULTIPLE_COMPANIES",
      message: "All payment allocations must belong to one company_code_id." };
  }
  return { ok: true, companyCodeId: result.rows[0]!.company_code_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Common pre-flight: company_code + fiscal_period + document_number
// ─────────────────────────────────────────────────────────────────────────────

interface PreflightArgs {
  db:              AnyDb;
  tenantId:        string;
  companyHint:     string | null;
  documentDate:    string;
  entityCode:      string;
  numberField:     string;
  fallbackPrefix:  string;
  logger?:         Logger;
}

interface PreflightOk {
  ok:               true;
  companyCodeId:    string;
  baseCurrencyCode: string;
  fiscalYear:       number;
  periodNumber:     number;
  documentNumber:   string;
}

interface PreflightErr {
  ok:      false;
  status:  number;
  error:   string;
  message: string;
  details?: Record<string, unknown>;
}

async function runPreflight(args: PreflightArgs): Promise<PreflightOk | PreflightErr> {
  const company = await resolveCompanyAndBaseCurrency(args.db, {
    tenantId:          args.tenantId,
    companyCodeIdHint: args.companyHint,
  });
  if (!company.companyCodeId || !company.baseCurrencyCode) {
    return {
      ok: false, status: 422, error: "COMPANY_CODE_REQUIRED",
      message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
    };
  }
  const fp = await resolveFiscalPeriod(args.db, {
    tenantId:      args.tenantId,
    companyCodeId: company.companyCodeId,
    documentDate:  args.documentDate,
    logger:        args.logger,
  });
  if (!fp.ok) {
    return {
      ok: false, status: 422, error: "FISCAL_PERIOD_MISSING",
      message: `No fiscal_period covers ${args.documentDate} for the resolved company_code.`,
      details: { tenantId: args.tenantId, companyCodeId: company.companyCodeId, documentDate: args.documentDate },
    };
  }
  const documentNumber = await allocateDocumentNumber(args.db, {
    tenantId:       args.tenantId,
    entityCode:     args.entityCode,
    numberField:    args.numberField,
    companyCodeId:  company.companyCodeId,
    fiscalYear:     fp.fiscalYear,
    periodNumber:   fp.periodNumber,
    effectiveDate:  args.documentDate,
    fallbackPrefix: args.fallbackPrefix,
  });
  return {
    ok:               true,
    companyCodeId:    company.companyCodeId,
    baseCurrencyCode: company.baseCurrencyCode,
    fiscalYear:       fp.fiscalYear,
    periodNumber:     fp.periodNumber,
    documentNumber,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: purchase_order.commitment_from_requisition
// ─────────────────────────────────────────────────────────────────────────────
const commitmentFromRequisitionHandler: EntityOpHandler = async (deps, body) => {
  const b = body as {
    requisitionId?:  string;
    supplierId?:     string;
    documentDate?:   string;
    effectiveDate?:  string;
    paymentTermId?:  string;
    notes?:          string;
    companyCodeId?:  string;
    lineSelections?: CommitmentFromRequisitionLineInput[];
  };
  if (!b.requisitionId) return { status: 400, body: { error: "REQUISITION_REQUIRED", message: "requisitionId is required." } };
  if (!b.supplierId)    return { status: 400, body: { error: "SUPPLIER_REQUIRED",    message: "supplierId is required." } };
  if (!Array.isArray(b.lineSelections)) {
    return { status: 400, body: { error: "LINE_SELECTIONS_REQUIRED", message: "lineSelections must be an array." } };
  }

  const docDate = b.documentDate ?? today();
  const pre = await runPreflight({
    db: deps.db, tenantId: deps.tenantId,
    companyHint: b.companyCodeId ?? null,
    documentDate: docDate,
    entityCode: "commitment", numberField: "document_no", fallbackPrefix: "PO",
    logger: deps.logger,
  });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error, message: pre.message, ...(pre.details ? { details: pre.details } : {}) } };

  const outcome = await createCommitmentFromRequisitionInTransaction(deps.db, {
    tenantId:         deps.tenantId,
    principalId:      deps.principalId,
    requisitionId:    b.requisitionId,
    supplierId:       b.supplierId,
    companyCodeId:    pre.companyCodeId,
    documentDate:     docDate,
    effectiveDate:    b.effectiveDate,
    paymentTermId:    b.paymentTermId,
    notes:            b.notes,
    commitmentNumber: pre.documentNumber,
    fiscalYear:       pre.fiscalYear,
    periodNumber:     pre.periodNumber,
    baseCurrencyCode: pre.baseCurrencyCode,
    lineSelections:   b.lineSelections,
  });
  if (!outcome.ok) {
    return { status: outcome.status, body: {
      error: outcome.error, message: outcome.message,
      ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    }};
  }
  deps.logger?.warn?.("commitment_from_requisition_created", {
    tenantId: deps.tenantId, requisitionId: b.requisitionId,
    commitmentId: outcome.commitmentId, commitmentNumber: outcome.commitmentNumber,
    linesWritten: outcome.linesWritten,
  });
  return { status: 201, body: {
    ok: true, commitmentId: outcome.commitmentId,
    commitmentNumber: outcome.commitmentNumber, linesWritten: outcome.linesWritten,
  }};
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: receipt.receipt_from_commitment
// ─────────────────────────────────────────────────────────────────────────────
const receiptFromCommitmentHandler: EntityOpHandler = async (deps, body) => {
  const b = body as {
    commitmentId?:         string;
    documentDate?:         string;
    deliveryNoteId?:       string;
    notes?:                string;
    receivingSiteId?:      string;
    receivingWarehouseId?: string;
    companyCodeId?:        string;
    lineAcceptances?:      ReceiptFromCommitmentLineInput[];
  };
  if (!b.commitmentId)                    return { status: 400, body: { error: "COMMITMENT_REQUIRED",       message: "commitmentId is required." } };
  if (!Array.isArray(b.lineAcceptances)) return { status: 400, body: { error: "LINE_ACCEPTANCES_REQUIRED", message: "lineAcceptances must be an array." } };

  const docDate = b.documentDate ?? today();
  const pre = await runPreflight({
    db: deps.db, tenantId: deps.tenantId,
    companyHint: b.companyCodeId ?? null,
    documentDate: docDate,
    entityCode: "receipt", numberField: "document_no", fallbackPrefix: "RCP",
    logger: deps.logger,
  });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error, message: pre.message, ...(pre.details ? { details: pre.details } : {}) } };

  const outcome = await createReceiptFromCommitmentInTransaction(deps.db, {
    tenantId:             deps.tenantId,
    principalId:          deps.principalId,
    commitmentId:         b.commitmentId,
    companyCodeId:        pre.companyCodeId,
    documentDate:         docDate,
    deliveryNoteId:       b.deliveryNoteId,
    notes:                b.notes,
    receivingSiteId:      b.receivingSiteId,
    receivingWarehouseId: b.receivingWarehouseId,
    receiptNumber:        pre.documentNumber,
    fiscalYear:           pre.fiscalYear,
    periodNumber:         pre.periodNumber,
    baseCurrencyCode:     pre.baseCurrencyCode,
    lineAcceptances:      b.lineAcceptances,
  });
  if (!outcome.ok) {
    return { status: outcome.status, body: {
      error: outcome.error, message: outcome.message,
      ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    }};
  }
  deps.logger?.warn?.("receipt_from_commitment_created", {
    tenantId: deps.tenantId, commitmentId: b.commitmentId,
    receiptId: outcome.receiptId, receiptNumber: outcome.receiptNumber,
    linesWritten: outcome.linesWritten,
  });
  return { status: 201, body: {
    ok: true, receiptId: outcome.receiptId,
    receiptNumber: outcome.receiptNumber, linesWritten: outcome.linesWritten,
  }};
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: service_sheet.service_sheet_from_commitment
// ─────────────────────────────────────────────────────────────────────────────
const serviceSheetFromCommitmentHandler: EntityOpHandler = async (deps, body) => {
  const b = body as {
    commitmentId?:      string;
    servicePeriodFrom?: string;
    servicePeriodTo?:   string;
    documentDate?:      string;
    siteId?:            string;
    notes?:             string;
    companyCodeId?:     string;
    lineEntries?:       ServiceSheetFromCommitmentLineInput[];
  };
  if (!b.commitmentId) return { status: 400, body: { error: "COMMITMENT_REQUIRED", message: "commitmentId is required." } };
  if (!b.servicePeriodFrom || !b.servicePeriodTo) {
    return { status: 400, body: { error: "SERVICE_PERIOD_REQUIRED", message: "servicePeriodFrom and servicePeriodTo are both required." } };
  }
  if (!Array.isArray(b.lineEntries)) {
    return { status: 400, body: { error: "LINE_ENTRIES_REQUIRED", message: "lineEntries must be an array." } };
  }

  const docDate = b.documentDate ?? today();
  const pre = await runPreflight({
    db: deps.db, tenantId: deps.tenantId,
    companyHint: b.companyCodeId ?? null,
    documentDate: docDate,
    entityCode: "service_sheet", numberField: "document_no", fallbackPrefix: "SES",
    logger: deps.logger,
  });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error, message: pre.message, ...(pre.details ? { details: pre.details } : {}) } };

  const outcome = await createServiceSheetFromCommitmentInTransaction(deps.db, {
    tenantId:           deps.tenantId,
    principalId:        deps.principalId,
    commitmentId:       b.commitmentId,
    companyCodeId:      pre.companyCodeId,
    documentDate:       docDate,
    servicePeriodFrom:  b.servicePeriodFrom,
    servicePeriodTo:    b.servicePeriodTo,
    siteId:             b.siteId,
    notes:              b.notes,
    serviceSheetNumber: pre.documentNumber,
    fiscalYear:         pre.fiscalYear,
    periodNumber:       pre.periodNumber,
    baseCurrencyCode:   pre.baseCurrencyCode,
    lineEntries:        b.lineEntries,
  });
  if (!outcome.ok) {
    return { status: outcome.status, body: {
      error: outcome.error, message: outcome.message,
      ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    }};
  }
  return { status: 201, body: {
    ok: true, serviceSheetId: outcome.serviceSheetId,
    serviceSheetNumber: outcome.serviceSheetNumber, linesWritten: outcome.linesWritten,
  }};
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: purchase_invoice.invoice_from_receipt
// ─────────────────────────────────────────────────────────────────────────────
const invoiceFromReceiptHandler: EntityOpHandler = async (deps, body) => {
  const b = body as {
    receiptId?:             string;
    supplierInvoiceNumber?: string;
    supplierInvoiceDate?:   string;
    documentDate?:          string;
    notes?:                 string;
    companyCodeId?:         string;
    lineSelections?:        InvoiceFromReceiptLineInput[];
  };
  if (!b.receiptId) return { status: 400, body: { error: "RECEIPT_REQUIRED", message: "receiptId is required." } };
  if (!b.supplierInvoiceNumber || !b.supplierInvoiceDate) {
    return { status: 400, body: { error: "SUPPLIER_INVOICE_METADATA_REQUIRED", message: "supplierInvoiceNumber and supplierInvoiceDate are both required." } };
  }
  if (!Array.isArray(b.lineSelections)) {
    return { status: 400, body: { error: "LINE_SELECTIONS_REQUIRED", message: "lineSelections must be an array." } };
  }

  const docDate = b.documentDate ?? today();
  const sourceCompanyCodeId = await loadReceiptCompanyCode(deps.db, deps.tenantId, b.receiptId);
  if (!sourceCompanyCodeId) {
    return { status: 404, body: { error: "RECEIPT_NOT_FOUND", message: `Receipt ${b.receiptId} not found for tenant.` } };
  }
  if (b.companyCodeId && b.companyCodeId !== sourceCompanyCodeId) {
    return { status: 422, body: {
      error: "COMPANY_CODE_MISMATCH",
      message: "Invoice-from-receipt must use the receipt's company_code_id.",
      details: { receiptId: b.receiptId, requestedCompanyCodeId: b.companyCodeId, sourceCompanyCodeId },
    }};
  }
  const pre = await runPreflight({
    db: deps.db, tenantId: deps.tenantId,
    companyHint: sourceCompanyCodeId,
    documentDate: docDate,
    entityCode: "purchase_invoice", numberField: "code", fallbackPrefix: "PI",
    logger: deps.logger,
  });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error, message: pre.message, ...(pre.details ? { details: pre.details } : {}) } };

  const outcome = await createInvoiceFromReceiptInTransaction(deps.db, {
    tenantId:              deps.tenantId,
    principalId:           deps.principalId,
    receiptId:             b.receiptId,
    companyCodeId:         pre.companyCodeId,
    supplierInvoiceNumber: b.supplierInvoiceNumber,
    supplierInvoiceDate:   b.supplierInvoiceDate,
    documentDate:          docDate,
    notes:                 b.notes,
    invoiceNumber:         pre.documentNumber,
    fiscalYear:            pre.fiscalYear,
    periodNumber:          pre.periodNumber,
    baseCurrencyCode:      pre.baseCurrencyCode,
    lineSelections:        b.lineSelections,
  });
  if (!outcome.ok) {
    return { status: outcome.status, body: {
      error: outcome.error, message: outcome.message,
      ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    }};
  }
  return { status: 201, body: {
    ok: true, invoiceId: outcome.invoiceId,
    invoiceNumber: outcome.invoiceNumber, linesWritten: outcome.linesWritten,
  }};
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: purchase_invoice.invoice_from_service_sheet
// ─────────────────────────────────────────────────────────────────────────────
const invoiceFromServiceSheetHandler: EntityOpHandler = async (deps, body) => {
  const b = body as {
    serviceSheetId?:        string;
    supplierInvoiceNumber?: string;
    supplierInvoiceDate?:   string;
    documentDate?:          string;
    notes?:                 string;
    companyCodeId?:         string;
    lineSelections?:        InvoiceFromServiceSheetLineInput[];
  };
  if (!b.serviceSheetId) return { status: 400, body: { error: "SERVICE_SHEET_REQUIRED", message: "serviceSheetId is required." } };
  if (!b.supplierInvoiceNumber || !b.supplierInvoiceDate) {
    return { status: 400, body: { error: "SUPPLIER_INVOICE_METADATA_REQUIRED", message: "supplierInvoiceNumber and supplierInvoiceDate are both required." } };
  }
  if (!Array.isArray(b.lineSelections)) {
    return { status: 400, body: { error: "LINE_SELECTIONS_REQUIRED", message: "lineSelections must be an array." } };
  }

  const docDate = b.documentDate ?? today();
  const sourceCompanyCodeId = await loadServiceSheetCompanyCode(deps.db, deps.tenantId, b.serviceSheetId);
  if (!sourceCompanyCodeId) {
    return { status: 404, body: { error: "SERVICE_SHEET_NOT_FOUND", message: `Service sheet ${b.serviceSheetId} not found for tenant.` } };
  }
  if (b.companyCodeId && b.companyCodeId !== sourceCompanyCodeId) {
    return { status: 422, body: {
      error: "COMPANY_CODE_MISMATCH",
      message: "Invoice-from-service-sheet must use the service sheet's company_code_id.",
      details: { serviceSheetId: b.serviceSheetId, requestedCompanyCodeId: b.companyCodeId, sourceCompanyCodeId },
    }};
  }
  const pre = await runPreflight({
    db: deps.db, tenantId: deps.tenantId,
    companyHint: sourceCompanyCodeId,
    documentDate: docDate,
    entityCode: "purchase_invoice", numberField: "code", fallbackPrefix: "PI",
    logger: deps.logger,
  });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error, message: pre.message, ...(pre.details ? { details: pre.details } : {}) } };

  const outcome = await createInvoiceFromServiceSheetInTransaction(deps.db, {
    tenantId:              deps.tenantId,
    principalId:           deps.principalId,
    serviceSheetId:        b.serviceSheetId,
    companyCodeId:         pre.companyCodeId,
    supplierInvoiceNumber: b.supplierInvoiceNumber,
    supplierInvoiceDate:   b.supplierInvoiceDate,
    documentDate:          docDate,
    notes:                 b.notes,
    invoiceNumber:         pre.documentNumber,
    fiscalYear:            pre.fiscalYear,
    periodNumber:          pre.periodNumber,
    baseCurrencyCode:      pre.baseCurrencyCode,
    lineSelections:        b.lineSelections,
  });
  if (!outcome.ok) {
    return { status: outcome.status, body: {
      error: outcome.error, message: outcome.message,
      ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    }};
  }
  return { status: 201, body: {
    ok: true, invoiceId: outcome.invoiceId,
    invoiceNumber: outcome.invoiceNumber, linesWritten: outcome.linesWritten,
  }};
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: payment_entry.payment_from_invoice
// ─────────────────────────────────────────────────────────────────────────────
const paymentFromInvoiceHandler: EntityOpHandler = async (deps, body) => {
  const b = body as {
    documentDate?:    string;
    paymentMethodId?: string;
    notes?:           string;
    companyCodeId?:   string;
    allocations?:     PaymentFromInvoiceAllocationInput[];
  };
  if (!Array.isArray(b.allocations)) {
    return { status: 400, body: { error: "ALLOCATIONS_REQUIRED", message: "allocations must be an array." } };
  }

  const docDate = b.documentDate ?? today();
  const sourceCompany = await loadPaymentInvoiceCompanyCode(deps.db, deps.tenantId, b.allocations);
  if (!sourceCompany.ok) {
    return { status: sourceCompany.status, body: { error: sourceCompany.error, message: sourceCompany.message } };
  }
  if (b.companyCodeId && b.companyCodeId !== sourceCompany.companyCodeId) {
    return { status: 422, body: {
      error: "COMPANY_CODE_MISMATCH",
      message: "Payment-from-invoice must use the selected invoice company_code_id.",
      details: { requestedCompanyCodeId: b.companyCodeId, sourceCompanyCodeId: sourceCompany.companyCodeId },
    }};
  }
  const pre = await runPreflight({
    db: deps.db, tenantId: deps.tenantId,
    companyHint: sourceCompany.companyCodeId,
    documentDate: docDate,
    entityCode: "payment_entry", numberField: "document_no", fallbackPrefix: "PMT",
    logger: deps.logger,
  });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error, message: pre.message, ...(pre.details ? { details: pre.details } : {}) } };

  const outcome = await createPaymentFromInvoiceInTransaction(deps.db, {
    tenantId:         deps.tenantId,
    principalId:      deps.principalId,
    companyCodeId:    pre.companyCodeId,
    documentDate:     docDate,
    paymentMethodId:  b.paymentMethodId,
    notes:            b.notes,
    paymentNumber:    pre.documentNumber,
    fiscalYear:       pre.fiscalYear,
    periodNumber:     pre.periodNumber,
    baseCurrencyCode: pre.baseCurrencyCode,
    allocations:      b.allocations,
  });
  if (!outcome.ok) {
    return { status: outcome.status, body: {
      error: outcome.error, message: outcome.message,
      ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    }};
  }
  return { status: 201, body: {
    ok: true, paymentId: outcome.paymentId,
    paymentNumber: outcome.paymentNumber,
    allocationsWritten: outcome.allocationsWritten,
    totalAmount: outcome.totalAmount,
  }};
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration (side-effect on module import)
// ─────────────────────────────────────────────────────────────────────────────

registerEntityOp({
  entityCode:  "purchase_order",
  opCode:      "commitment_from_requisition",
  outboxEvent: "p2p.commitment.created_from_requisition",
  workspaceScope: conversionScope("purchase_requisition", ["requisitionId"], "commitment", "p2p.commitment.created_from_requisition", ["requisitionId", "supplierId", "lineSelections[]"]),
  handler:     commitmentFromRequisitionHandler,
});
registerEntityOp({
  entityCode:  "receipt",
  opCode:      "receipt_from_commitment",
  outboxEvent: "p2p.receipt.created_from_commitment",
  workspaceScope: conversionScope("commitment", ["commitmentId"], "receipt", "p2p.receipt.created_from_commitment", ["commitmentId", "lineAcceptances[]"]),
  handler:     receiptFromCommitmentHandler,
});
registerEntityOp({
  entityCode:  "service_sheet",
  opCode:      "service_sheet_from_commitment",
  outboxEvent: "p2p.service_sheet.created_from_commitment",
  workspaceScope: conversionScope("commitment", ["commitmentId"], "service_sheet", "p2p.service_sheet.created_from_commitment", ["commitmentId", "lineEntries[]"]),
  handler:     serviceSheetFromCommitmentHandler,
});
registerEntityOp({
  entityCode:  "purchase_invoice",
  opCode:      "invoice_from_receipt",
  outboxEvent: "p2p.invoice.created_from_receipt",
  workspaceScope: conversionScope("receipt", ["receiptId"], "purchase_invoice", "p2p.invoice.created_from_receipt", ["receiptId", "supplierInvoiceNumber", "lineSelections[]"]),
  handler:     invoiceFromReceiptHandler,
});
registerEntityOp({
  entityCode:  "purchase_invoice",
  opCode:      "invoice_from_service_sheet",
  outboxEvent: "p2p.invoice.created_from_service_sheet",
  workspaceScope: conversionScope("service_sheet", ["serviceSheetId"], "purchase_invoice", "p2p.invoice.created_from_service_sheet", ["serviceSheetId", "supplierInvoiceNumber", "lineSelections[]"]),
  handler:     invoiceFromServiceSheetHandler,
});
registerEntityOp({
  entityCode:  "payment_entry",
  opCode:      "payment_from_invoice",
  outboxEvent: "p2p.payment.created_from_invoice",
  workspaceScope: conversionScope("purchase_invoice", ["allocations[].invoiceId"], "payment_entry", "p2p.payment.created_from_invoice", ["allocations[].invoiceId", "allocations[].amount"], "approve", "multiple"),
  handler:     paymentFromInvoiceHandler,
});

function sourcingScope(
  sourceEntityCode: string,
  sourceIdPaths: readonly string[],
  eventType: string,
  requestIdentityPaths: readonly string[],
  createsDocument = false,
  targetEntityCode?: string,
): EntityOpWorkspaceScope {
  return {
    sourceDocument: { entityCode: sourceEntityCode, acceptedIdPaths: sourceIdPaths, required: true, cardinality: "single" },
    workspaceProfile: createsDocument ? "create" : "edit",
    createsDocument,
    ...(targetEntityCode ? { targetEntityCode } : {}),
    runtimeEventPolicy: {
      eventType, invalidationSource: "operation", invalidationOperationKey: "*", itemsMutated: true,
      sourceBehavior: "none", targetBehavior: createsDocument ? "initialize" : "none",
    },
    idempotencyPolicy: { operationKey: eventType, requestIdentityPaths, replayResponsePolicy: "stored_response" },
  };
}

registerEntityOp({
  entityCode: "sourcing_event",
  opCode: "create",
  outboxEvent: "procurement.sourcing_event.created",
  workspaceScope: sourcingScope("operating_organization", ["operatingOrganizationId"], "procurement.sourcing_event.created", ["operatingOrganizationId", "code"], true, "sourcing_event"),
  handler: sourcingCreateHandler,
});
registerEntityOp({
  entityCode: "sourcing_event",
  opCode: "aggregate_demand",
  outboxEvent: "procurement.sourcing_event.demand_aggregated",
  workspaceScope: sourcingScope("sourcing_event", ["sourcingEventId"], "procurement.sourcing_event.demand_aggregated", ["sourcingEventId", "demandLineIds[]"]),
  handler: sourcingAggregateDemandHandler,
});
registerEntityOp({
  entityCode: "sourcing_event_award",
  opCode: "allocate_award",
  outboxEvent: "procurement.sourcing_event.award_allocated",
  workspaceScope: sourcingScope("sourcing_event_award", ["awardId"], "procurement.sourcing_event.award_allocated", ["awardId", "allocations[].companyCodeId"]),
  handler: sourcingAllocateAwardHandler,
});
registerEntityOp({
  entityCode: "sourcing_event_award",
  opCode: "convert_award",
  outboxEvent: "procurement.sourcing_event.award_converted",
  workspaceScope: sourcingScope("sourcing_event_award", ["awardId"], "procurement.sourcing_event.award_converted", ["awardId", "currencyCode"], true, "commitment"),
  handler: sourcingConvertAwardHandler,
});

function conversionScope(
  sourceEntityCode: string,
  sourceIdPaths: readonly string[],
  targetEntityCode: string,
  eventType: string,
  requestIdentityPaths: readonly string[],
  workspaceProfile: EntityOpWorkspaceScope["workspaceProfile"] = "edit",
  cardinality: EntityOpWorkspaceScope["sourceDocument"]["cardinality"] = "single",
): EntityOpWorkspaceScope {
  return {
    sourceDocument: {
      entityCode: sourceEntityCode,
      acceptedIdPaths: sourceIdPaths,
      required: true,
      cardinality,
    },
    workspaceProfile,
    createsDocument: true,
    targetEntityCode,
    runtimeEventPolicy: {
      eventType,
      invalidationSource: "operation",
      invalidationOperationKey: "*",
      itemsMutated: true,
      sourceBehavior: "advance",
      targetBehavior: "initialize",
    },
    idempotencyPolicy: {
      operationKey: eventType,
      requestIdentityPaths,
      replayResponsePolicy: "stored_response",
    },
  };
}
