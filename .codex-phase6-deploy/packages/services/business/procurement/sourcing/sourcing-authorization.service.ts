import type { Kysely } from "kysely";

type SourcingDb = Kysely<Record<string, any>>;

export type SourcingAuthorizationOperation =
  | "create_event"
  | "aggregate_demand"
  | "evaluate_award"
  | "allocate_award"
  | "convert_award";

export interface SourcingPermissionDecision {
  decision: "allow" | "deny" | "not_found" | "not_granted" | string;
  scope?: { company_code_ids?: string[] };
  reason?: string;
}

export interface SourcingPermissionChecker {
  (permissionCode: string, context?: Record<string, unknown>): Promise<SourcingPermissionDecision>;
}

export interface SourcingAuthorizationRequest {
  db: SourcingDb;
  tenantId: string;
  principalId: string;
  sourcingEventId: string;
  operation: SourcingAuthorizationOperation;
  demandLineIds?: readonly string[];
  allocationCompanyCodeIds?: readonly string[];
  checkPermission: SourcingPermissionChecker;
}

export interface SourcingAuthorizationResult {
  allowed: true;
  operatingOrganizationId: string;
  participantCompanyCodeIds: string[];
  demandCompanyCodeIds: string[];
}

export class SourcingAuthorizationError extends Error {
  readonly status = 403;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SourcingAuthorizationError";
  }
}

export async function authorizeSourcingEventCreation(request: {
  db: SourcingDb;
  tenantId: string;
  principalId: string;
  operatingOrganizationId: string;
  checkPermission: SourcingPermissionChecker;
}): Promise<{ operatingOrganizationId: string }> {
  const organization = await request.db
    .selectFrom("master.operating_organization as oo")
    .select(["oo.id", "oo.domain"])
    .where("oo.tenant_id", "=", request.tenantId)
    .where("oo.id", "=", request.operatingOrganizationId)
    .where("oo.domain", "=", "procurement")
    .where("oo.status", "=", "active")
    .executeTakeFirst();
  if (!organization) {
    throw new SourcingAuthorizationError("PROCUREMENT_CONTEXT_REQUIRED", "The event must be owned by an active Procurement Operating Organization.");
  }
  const permission = await request.checkPermission("SOURCE.EVENT.CREATE", {
    operatingOrganizationId: organization.id,
    domain: "procurement",
  });
  requireAllowed(permission, "SOURCE.EVENT.CREATE");
  return { operatingOrganizationId: organization.id };
}

/**
 * Enforces the procurement dual-authorization boundary:
 *
 * 1. The principal must be authorized for the Procurement Operating Organization.
 * 2. Aggregated demand must be authorized for each originating Company Code.
 * 3. Award allocations may target only event participants.
 *
 * This service does not create documents. It is intentionally reusable by the
 * sourcing event, demand aggregation, and award conversion handlers.
 */
export async function authorizeSourcingOperation(
  request: SourcingAuthorizationRequest,
): Promise<SourcingAuthorizationResult> {
  const event = await request.db
    .selectFrom("document.sourcing_event as se")
    .select(["se.operating_organization_id", "se.buying_model", "se.central_buyer_company_id"])
    .where("se.tenant_id", "=", request.tenantId)
    .where("se.id", "=", request.sourcingEventId)
    .where("se.status", "<>", "cancelled")
    .executeTakeFirst();

  if (!event) {
    throw new SourcingAuthorizationError("SOURCING_EVENT_NOT_FOUND", "The sourcing event is not available in this tenant.");
  }

  const organization = await request.db
    .selectFrom("master.operating_organization as oo")
    .select(["oo.id", "oo.domain"])
    .where("oo.tenant_id", "=", request.tenantId)
    .where("oo.id", "=", event.operating_organization_id)
    .where("oo.domain", "=", "procurement")
    .where("oo.status", "=", "active")
    .executeTakeFirst();

  if (!organization) {
    throw new SourcingAuthorizationError("PROCUREMENT_CONTEXT_REQUIRED", "The event is not owned by an active Procurement Operating Organization.");
  }

  const eventPermission = await request.checkPermission("SOURCE.EVENT.CREATE", {
    operatingOrganizationId: organization.id,
    domain: "procurement",
    resourceId: request.sourcingEventId,
  });
  requireAllowed(eventPermission, "SOURCE.EVENT.CREATE");

  const participantRows = await request.db
    .selectFrom("document.sourcing_event_company as sec")
    .select("sec.company_code_id")
    .where("sec.tenant_id", "=", request.tenantId)
    .where("sec.sourcing_event_id", "=", request.sourcingEventId)
    .where("sec.status", "=", "active")
    .execute();
  const participantCompanyCodeIds = participantRows.map((row) => row.company_code_id);

  const demandCompanyCodeIds = await resolveDemandCompanies(request);

  if (request.operation === "aggregate_demand" && demandCompanyCodeIds.length > 0) {
    const demandPermission = await request.checkPermission("SOURCE.DEMAND.AGGREGATE", {
      operatingOrganizationId: organization.id,
      domain: "procurement",
      companyCodeIds: demandCompanyCodeIds,
      resourceId: request.sourcingEventId,
    });
    requireAllowed(demandPermission, "SOURCE.DEMAND.AGGREGATE");
    requireCompanyScope(demandPermission, demandCompanyCodeIds);
  }

  if (
    request.operation === "evaluate_award" ||
    request.operation === "allocate_award" ||
    request.operation === "convert_award"
  ) {
    const evaluationPermission = await request.checkPermission("SOURCE.EVENT.EVALUATE", {
      operatingOrganizationId: organization.id,
      domain: "procurement",
      resourceId: request.sourcingEventId,
    });
    requireAllowed(evaluationPermission, "SOURCE.EVENT.EVALUATE");
  }

  if (request.operation === "allocate_award") {
    const allocationIds = request.allocationCompanyCodeIds ?? [];
    const unknownIds = allocationIds.filter((id) => !participantCompanyCodeIds.includes(id));
    if (unknownIds.length > 0) {
      throw new SourcingAuthorizationError("PARTICIPANT_COMPANY_REQUIRED", "Award allocations must target participating Company Codes.");
    }
    if (event.buying_model === "central_buyer" && !event.central_buyer_company_id) {
      throw new SourcingAuthorizationError("CENTRAL_BUYER_REQUIRED", "Central-buyer events require an explicit central buyer Company Code.");
    }
  }

  return { allowed: true, operatingOrganizationId: organization.id, participantCompanyCodeIds, demandCompanyCodeIds };
}

async function resolveDemandCompanies(request: SourcingAuthorizationRequest): Promise<string[]> {
  const ids = request.demandLineIds ?? [];
  if (ids.length === 0) return [];

  const rows = await request.db
    .selectFrom("document.purchase_requisition_line as prl")
    .innerJoin("document.purchase_requisition as pr", (join) => join
      .onRef("pr.id", "=", "prl.purchase_requisition_id")
      .onRef("pr.tenant_id", "=", "prl.tenant_id"))
    .select(["prl.id", "pr.company_code_id"])
    .where("prl.tenant_id", "=", request.tenantId)
    .where("prl.id", "in", ids as string[])
    .execute();

  const requestedIds = new Set(ids);
  const foundIds = new Set(rows.map((row) => row.id));
  if (foundIds.size !== requestedIds.size || [...requestedIds].some((id) => !foundIds.has(id))) {
    throw new SourcingAuthorizationError("DEMAND_NOT_FOUND", "One or more demand lines are not available in this tenant.");
  }
  return Array.from(new Set(rows.map((row) => row.company_code_id)));
}

function requireAllowed(decision: SourcingPermissionDecision, permissionCode: string): void {
  if (decision.decision !== "allow") {
    throw new SourcingAuthorizationError("PERMISSION_DENIED", `${permissionCode} is required for this sourcing operation.`);
  }
}

function requireCompanyScope(decision: SourcingPermissionDecision, companyCodeIds: readonly string[]): void {
  const allowed = new Set(decision.scope?.company_code_ids ?? []);
  if (companyCodeIds.some((id) => !allowed.has(id))) {
    throw new SourcingAuthorizationError("COMPANY_SCOPE_DENIED", "The principal is not authorized for every demand Company Code.");
  }
}
