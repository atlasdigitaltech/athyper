import type { Kysely } from "kysely";

type SalesDb = Kysely<Record<string, any>>;

export type SalesAuthorizationOperation = "allocate_quotation" | "convert_quotation";

export interface SalesPermissionDecision {
  decision: "allow" | "deny" | "not_found" | "not_granted" | string;
  scope?: { company_code_ids?: string[] };
  reason?: string;
}

export type SalesPermissionChecker = (permissionCode: string, context?: Record<string, unknown>) => Promise<SalesPermissionDecision>;

export interface SalesAuthorizationResult {
  operatingOrganizationId: string;
  sellingModel: "federated" | "principal_seller";
  principalSellerCompanyId: string | null;
  participantCompanyCodeIds: string[];
}

export class SalesAuthorizationError extends Error {
  readonly status = 403;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SalesAuthorizationError";
  }
}

export async function authorizeSalesOpportunityCreation(request: {
  db: SalesDb;
  tenantId: string;
  operatingOrganizationId: string;
  checkPermission: SalesPermissionChecker;
}): Promise<{ operatingOrganizationId: string }> {
  const organization = await request.db.selectFrom("master.operating_organization as oo").select(["oo.id", "oo.domain"])
    .where("oo.tenant_id", "=", request.tenantId).where("oo.id", "=", request.operatingOrganizationId)
    .where("oo.domain", "=", "sales").where("oo.status", "=", "active").executeTakeFirst();
  if (!organization) throw new SalesAuthorizationError("SALES_CONTEXT_REQUIRED", "The opportunity must be owned by an active Sales Operating Organization.");
  const permission = await request.checkPermission("SALES.OPPORTUNITY.CREATE", { operatingOrganizationId: organization.id, domain: "sales" });
  requireAllowed(permission, "SALES.OPPORTUNITY.CREATE");
  return { operatingOrganizationId: organization.id };
}

export async function authorizeSalesQuotationCreation(request: {
  db: SalesDb;
  tenantId: string;
  opportunityId: string;
  checkPermission: SalesPermissionChecker;
}): Promise<SalesAuthorizationResult> {
  const opportunity = await request.db.selectFrom("document.sales_opportunity as so").select(["so.operating_organization_id", "so.selling_model", "so.principal_seller_company_id"])
    .where("so.tenant_id", "=", request.tenantId).where("so.id", "=", request.opportunityId).where("so.status", "<>", "cancelled").executeTakeFirst();
  if (!opportunity) throw new SalesAuthorizationError("OPPORTUNITY_NOT_FOUND", "The sales opportunity is not available in this tenant.");
  const participants = await request.db.selectFrom("document.sales_opportunity_company").select("company_code_id")
    .where("tenant_id", "=", request.tenantId).where("opportunity_id", "=", request.opportunityId).where("status", "=", "active").execute();
  return authorizeSalesContext(request.db, request.tenantId, opportunity.operating_organization_id, opportunity.selling_model, opportunity.principal_seller_company_id, participants.map((row) => row.company_code_id), request.checkPermission);
}

export async function authorizeSalesOperation(request: {
  db: SalesDb;
  tenantId: string;
  quotationId: string;
  operation: SalesAuthorizationOperation;
  allocationCompanyCodeIds?: readonly string[];
  checkPermission: SalesPermissionChecker;
}): Promise<SalesAuthorizationResult> {
  const quotation = await request.db.selectFrom("document.sales_quotation as sq").select(["sq.operating_organization_id", "sq.selling_model", "sq.principal_seller_company_id"])
    .where("sq.tenant_id", "=", request.tenantId).where("sq.id", "=", request.quotationId).where("sq.status", "<>", "cancelled").executeTakeFirst();
  if (!quotation) throw new SalesAuthorizationError("QUOTATION_NOT_FOUND", "The sales quotation is not available in this tenant.");
  const participants = await request.db.selectFrom("document.sales_quotation_company").select("company_code_id")
    .where("tenant_id", "=", request.tenantId).where("quotation_id", "=", request.quotationId).where("status", "=", "active").execute();
  const result = await authorizeSalesContext(request.db, request.tenantId, quotation.operating_organization_id, quotation.selling_model, quotation.principal_seller_company_id, participants.map((row) => row.company_code_id), request.checkPermission);
  if (request.operation === "convert_quotation") {
    const orderPermission = await request.checkPermission("SALES.ORDER.CREATE", {
      domain: "sales", companyCodeIds: request.allocationCompanyCodeIds ?? [], resourceId: request.quotationId,
    });
    requireAllowed(orderPermission, "SALES.ORDER.CREATE");
    requireCompanyScope(orderPermission, request.allocationCompanyCodeIds ?? []);
  }
  return result;
}

async function authorizeSalesContext(
  db: SalesDb,
  tenantId: string,
  operatingOrganizationId: string,
  sellingModel: "federated" | "principal_seller",
  principalSellerCompanyId: string | null,
  participantCompanyCodeIds: string[],
  checkPermission: SalesPermissionChecker,
): Promise<SalesAuthorizationResult> {
  const organization = await db.selectFrom("master.operating_organization as oo").select(["oo.id", "oo.domain"])
    .where("oo.tenant_id", "=", tenantId).where("oo.id", "=", operatingOrganizationId)
    .where("oo.domain", "=", "sales").where("oo.status", "=", "active").executeTakeFirst();
  if (!organization) throw new SalesAuthorizationError("SALES_CONTEXT_REQUIRED", "The document is not owned by an active Sales Operating Organization.");
  const permission = await checkPermission("SALES.QUOTATION.CREATE", { operatingOrganizationId, domain: "sales" });
  requireAllowed(permission, "SALES.QUOTATION.CREATE");
  return { operatingOrganizationId: organization.id, sellingModel, principalSellerCompanyId, participantCompanyCodeIds };
}

function requireAllowed(decision: SalesPermissionDecision, permissionCode: string): void {
  if (decision.decision !== "allow") throw new SalesAuthorizationError("PERMISSION_DENIED", `${permissionCode} is required for this sales operation.`);
}

function requireCompanyScope(decision: SalesPermissionDecision, companyCodeIds: readonly string[]): void {
  const allowed = new Set(decision.scope?.company_code_ids ?? []);
  if (companyCodeIds.some((id) => !allowed.has(id))) throw new SalesAuthorizationError("COMPANY_SCOPE_DENIED", "The principal is not authorized for every sales Company Code.");
}
