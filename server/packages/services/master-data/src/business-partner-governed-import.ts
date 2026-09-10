import { createHash } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequestService, CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

export const businessPartnerGovernedImportVersion = "business_partner.import.governed_requests.v1";
type Row = { readonly rowKey: string; readonly operatingOrganizationId: string; readonly companyCodeId?: string; readonly proposedPayload: CreateBusinessPartnerRequestCommand["proposedPayload"]; readonly extensions?: CreateBusinessPartnerRequestCommand["extensions"] };
export interface BusinessPartnerGovernedImportInput { readonly schemaVersion: 1; readonly batchKey: string; readonly rows: readonly Row[] }
export interface BusinessPartnerGovernedImportOutcome { readonly rowKey: string; readonly status: "created" | "replayed" | "failed" | "not_executed"; readonly requestId?: string; readonly diagnosticReference?: string }
const invalid = () => new MasterDataError(400, "BP_GOVERNED_IMPORT_INVALID", "Invalid governed supplier import batch");
const key = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,99}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function object(value: unknown, keys?: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || (keys && Object.keys(value).some(k => !keys.includes(k)))) throw invalid();
}
export function parseBusinessPartnerGovernedImport(raw: unknown): BusinessPartnerGovernedImportInput {
  object(raw, ["schemaVersion", "batchKey", "rows"]);
  if (raw.schemaVersion !== 1 || !key(raw.batchKey) || !Array.isArray(raw.rows) || !raw.rows.length || raw.rows.length > 100) throw invalid();
  if (Buffer.byteLength(JSON.stringify(raw)) > 4 * 1024 * 1024) throw invalid();
  const seen = new Set<string>();
  for (const row of raw.rows) {
    object(row, ["rowKey", "operatingOrganizationId", "companyCodeId", "proposedPayload", "extensions"]);
    if (!key(row.rowKey) || seen.has(row.rowKey) || !uuid(row.operatingOrganizationId) || (row.companyCodeId !== undefined && !uuid(row.companyCodeId))) throw invalid();
    seen.add(row.rowKey); object(row.proposedPayload);
    if (row.extensions !== undefined) object(row.extensions, ["addresses", "contactPersons", "contactChannels", "identifiers", "taxRegistrations", "classifications", "certifications"]);
  }
  // Detach the full batch before the first asynchronous authorization check.
  return structuredClone(raw) as unknown as BusinessPartnerGovernedImportInput;
}

/** Target-only adapter. Composition must select an authenticated reviewed import
 * revision before exposing it. Gateway and row authority are separately refreshed.
 * The real request owner retains schema, idempotency, audit and transaction rules. */
export function createBusinessPartnerGovernedImport(options: {
  readonly requests: BusinessPartnerRequestService;
  readonly refreshContext: (context: VerifiedRequestContext) => Promise<VerifiedRequestContext>;
  readonly authorizeGateway: (context: VerifiedRequestContext) => Promise<void>;
  readonly resolveRow: (context: VerifiedRequestContext, row: Row) => Promise<void>;
}) {
  const refresh = async (initial: VerifiedRequestContext) => {
    const context = await options.refreshContext(initial);
    if (context.planeKey !== "neon" || initial.planeKey !== "neon" || context.tenantId !== initial.tenantId || context.principalId !== initial.principalId) throw new MasterDataError(403, "BP_GOVERNED_IMPORT_CONTEXT_CHANGED", "Import identity changed");
    await options.authorizeGateway(context);
    return context;
  };
  const command = (context: VerifiedRequestContext, batchKey: string, row: Row): CreateBusinessPartnerRequestCommand => ({
    context, kind: "new_partner", requestedRole: "supplier", source: {kind: "import"}, registrationMode: "integration",
    idempotencyKey: `bp-import:${createHash("sha256").update(JSON.stringify([context.tenantId, context.principalId, batchKey, row.rowKey])).digest("hex")}`,
    operatingOrganizationId: row.operatingOrganizationId,
    ...(row.companyCodeId ? {companyCodeId: row.companyCodeId} : {}),
    proposedPayload: row.proposedPayload, ...(row.extensions ? {extensions: row.extensions} : {}),
  });
  return { async execute(initial: VerifiedRequestContext, raw: unknown): Promise<{readonly outcomes: readonly BusinessPartnerGovernedImportOutcome[]}> {
    const batch = parseBusinessPartnerGovernedImport(raw);
    if (!options.requests.preflightCreate) throw new MasterDataError(503, "BP_GOVERNED_IMPORT_VALIDATOR_UNAVAILABLE", "Governed import validation is unavailable");
    const prepared: CreateBusinessPartnerRequestCommand[] = [];
    // Nothing is written until every row passes owning-service rules and scope checks.
    for (const row of batch.rows) {
      const context = await refresh(initial);
      await options.resolveRow(context, row);
      const draft = command(context, batch.batchKey, row);
      const result = await options.requests.preflightCreate(draft);
      if (!result.validation.valid) throw new MasterDataError(400, "BP_GOVERNED_IMPORT_VALIDATION_FAILED", `Import row ${row.rowKey} failed request validation`);
      prepared.push({...draft, expectedForm: result.schema});
    }
    const outcomes: BusinessPartnerGovernedImportOutcome[] = [];
    let stopped = false;
    for (const [index, row] of batch.rows.entries()) {
      if (stopped) {outcomes.push({rowKey: row.rowKey, status: "not_executed"}); continue;}
      try {
        const context = await refresh(initial);
        await options.resolveRow(context, row);
        const draft = {...prepared[index]!, context};
        const current = await options.requests.preflightCreate(draft);
        if (!current.validation.valid) throw invalid();
        const result = await options.requests.create(draft);
        outcomes.push({rowKey: row.rowKey, status: result.replayed ? "replayed" : "created", requestId: result.request.id});
      } catch {
        // The request owner may have committed before a transport failure. A
        // stable key makes retry safe; never claim rollback of previous drafts.
        outcomes.push({rowKey: row.rowKey, status: "failed", diagnosticReference: initial.requestId});
        stopped = true;
      }
    }
    return {outcomes};
  } };
}
