import type { Kysely } from "kysely";
import {
  authorizeSalesOpportunityCreation,
  authorizeSalesOperation,
  authorizeSalesQuotationCreation,
  type SalesPermissionChecker,
} from "./sales-authorization.service.js";

type SalesDb = Kysely<Record<string, any>>;

export interface SalesDocumentDeps {
  db: SalesDb;
  tenantId: string;
  principalId: string;
  checkPermission: SalesPermissionChecker;
}

export class SalesDocumentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "SalesDocumentError";
  }
}

export async function createSalesOpportunity(deps: SalesDocumentDeps, input: {
  code: string; name: string; operatingOrganizationId: string; customerId: string;
  sellingModel?: "federated" | "principal_seller"; principalSellerCompanyId?: string | null; participantCompanyCodeIds: readonly string[];
}): Promise<Record<string, unknown>> {
  if (!input.code.trim() || !input.name.trim() || !input.customerId) throw new SalesDocumentError(400, "OPPORTUNITY_IDENTITY_REQUIRED", "code, name, and customerId are required.");
  const sellingModel = input.sellingModel ?? "federated";
  const participants = [...new Set(input.participantCompanyCodeIds.filter(Boolean))];
  if (participants.length === 0) throw new SalesDocumentError(400, "PARTICIPANTS_REQUIRED", "At least one participant Company Code is required.");
  if (sellingModel === "principal_seller" && !input.principalSellerCompanyId) throw new SalesDocumentError(422, "PRINCIPAL_SELLER_REQUIRED", "Principal-seller opportunities require an explicit selling Company Code.");
  await authorizeSalesOpportunityCreation({ db: deps.db, tenantId: deps.tenantId, operatingOrganizationId: input.operatingOrganizationId, checkPermission: deps.checkPermission });
  const companies = await deps.db.selectFrom("master.company_code").select("id").where("tenant_id", "=", deps.tenantId).where("id", "in", participants).where("status", "=", "active").execute();
  if (companies.length !== participants.length) throw new SalesDocumentError(422, "PARTICIPANT_COMPANY_INVALID", "Every participant Company Code must be active in this tenant.");
  if (input.principalSellerCompanyId && !participants.includes(input.principalSellerCompanyId)) throw new SalesDocumentError(422, "PRINCIPAL_SELLER_NOT_PARTICIPANT", "The principal seller must be one of the opportunity participants.");
  return deps.db.transaction().execute(async (tx) => {
    const opportunity = await tx.insertInto("document.sales_opportunity").values({
      tenant_id: deps.tenantId, code: input.code.trim(), name: input.name.trim(), customer_id: input.customerId,
      operating_organization_id: input.operatingOrganizationId, selling_model: sellingModel, principal_seller_company_id: input.principalSellerCompanyId ?? null,
      requested_by: deps.principalId, created_by: deps.principalId,
    }).returning(["id", "code", "name", "operating_organization_id", "selling_model", "status"]).executeTakeFirstOrThrow();
    await tx.insertInto("document.sales_opportunity_company").values(participants.map((companyCodeId, index) => ({
      tenant_id: deps.tenantId, opportunity_id: opportunity.id, company_code_id: companyCodeId,
      participation_role: index === 0 ? "lead_seller" : "participant", created_by: deps.principalId,
    }))).execute();
    return opportunity as Record<string, unknown>;
  });
}

export async function createSalesQuotation(deps: SalesDocumentDeps, input: { opportunityId: string; code: string; name: string }): Promise<Record<string, unknown>> {
  if (!input.opportunityId || !input.code?.trim() || !input.name?.trim()) throw new SalesDocumentError(400, "QUOTATION_IDENTITY_REQUIRED", "opportunityId, code, and name are required.");
  const opportunity = await deps.db.selectFrom("document.sales_opportunity").select(["customer_id", "operating_organization_id", "selling_model", "principal_seller_company_id"]).where("tenant_id", "=", deps.tenantId).where("id", "=", input.opportunityId).executeTakeFirst();
  if (!opportunity) throw new SalesDocumentError(404, "OPPORTUNITY_NOT_FOUND", "The sales opportunity is not available in this tenant.");
  await authorizeSalesQuotationCreation({ db: deps.db, tenantId: deps.tenantId, opportunityId: input.opportunityId, checkPermission: deps.checkPermission });
  const participants = await deps.db.selectFrom("document.sales_opportunity_company").select("company_code_id").where("tenant_id", "=", deps.tenantId).where("opportunity_id", "=", input.opportunityId).where("status", "=", "active").execute();
  return deps.db.transaction().execute(async (tx) => {
    const quotation = await tx.insertInto("document.sales_quotation").values({
      tenant_id: deps.tenantId, opportunity_id: input.opportunityId, code: input.code.trim(), name: input.name.trim(), customer_id: opportunity.customer_id,
      operating_organization_id: opportunity.operating_organization_id, selling_model: opportunity.selling_model,
      principal_seller_company_id: opportunity.principal_seller_company_id, requested_by: deps.principalId, created_by: deps.principalId,
    }).returning(["id", "code", "opportunity_id", "operating_organization_id", "selling_model", "status"]).executeTakeFirstOrThrow();
    await tx.insertInto("document.sales_quotation_company").values(participants.map((row, index) => ({
      tenant_id: deps.tenantId, quotation_id: quotation.id, company_code_id: row.company_code_id,
      participation_role: index === 0 ? "lead_seller" : "participant", created_by: deps.principalId,
    }))).execute();
    return quotation as Record<string, unknown>;
  });
}

export async function allocateSalesQuotation(deps: SalesDocumentDeps, quotationId: string, allocations: ReadonlyArray<{ companyCodeId: string; allocationPercent?: number | null; allocationAmount?: number | null }>): Promise<Record<string, unknown>> {
  const quote = await deps.db.selectFrom("document.sales_quotation").select("id").where("tenant_id", "=", deps.tenantId).where("id", "=", quotationId).executeTakeFirst();
  if (!quote) throw new SalesDocumentError(404, "QUOTATION_NOT_FOUND", "The sales quotation is not available in this tenant.");
  const normalized = allocations.filter((allocation) => allocation.companyCodeId);
  if (!normalized.length) throw new SalesDocumentError(400, "ALLOCATIONS_REQUIRED", "At least one quotation allocation is required.");
  if (normalized.reduce((sum, allocation) => sum + Number(allocation.allocationPercent ?? 0), 0) > 100.0001) throw new SalesDocumentError(422, "ALLOCATION_EXCEEDS_TOTAL", "Quotation allocation percentages cannot exceed 100%.");
  const auth = await authorizeSalesOperation({ db: deps.db, tenantId: deps.tenantId, quotationId, operation: "allocate_quotation", allocationCompanyCodeIds: normalized.map((allocation) => allocation.companyCodeId), checkPermission: deps.checkPermission });
  const participants = new Set(auth.participantCompanyCodeIds);
  if (normalized.some((allocation) => !participants.has(allocation.companyCodeId))) throw new SalesDocumentError(422, "PARTICIPANT_COMPANY_REQUIRED", "Quotation allocations must target participating Company Codes.");
  const ids = await deps.db.transaction().execute(async (tx) => {
    const result: string[] = [];
    for (const allocation of normalized) {
      const row = await tx.insertInto("document.sales_quotation_allocation").values({
        tenant_id: deps.tenantId, quotation_id: quotationId, company_code_id: allocation.companyCodeId,
        allocation_percent: allocation.allocationPercent ?? null, allocation_amount: allocation.allocationAmount ?? null, created_by: deps.principalId,
      }).onConflict((conflict) => conflict.columns(["tenant_id", "quotation_id", "company_code_id"]).doUpdateSet({
        allocation_percent: allocation.allocationPercent == null ? null : allocation.allocationPercent,
        allocation_amount: allocation.allocationAmount == null ? null : allocation.allocationAmount,
        status: "planned", updated_at: new Date(), updated_by: deps.principalId,
      })).returning("id").executeTakeFirstOrThrow();
      result.push(row.id);
    }
    return result;
  });
  return { quotationId, allocationIds: ids };
}

export async function convertSalesQuotation(deps: SalesDocumentDeps, quotationId: string, currencyCode = "USD"): Promise<Record<string, unknown>> {
  const quote = await deps.db.selectFrom("document.sales_quotation").select(["id", "code", "customer_id", "selling_model", "principal_seller_company_id", "status"]).where("tenant_id", "=", deps.tenantId).where("id", "=", quotationId).executeTakeFirst();
  if (!quote) throw new SalesDocumentError(404, "QUOTATION_NOT_FOUND", "The sales quotation is not available in this tenant.");
  if (quote.status !== "approved") throw new SalesDocumentError(422, "QUOTATION_NOT_APPROVED", "Only approved quotations can create sales orders.");
  const allocations = await deps.db.selectFrom("document.sales_quotation_allocation").select(["id", "company_code_id", "allocation_amount"]).where("tenant_id", "=", deps.tenantId).where("quotation_id", "=", quotationId).where("status", "=", "planned").execute();
  if (!allocations.length) throw new SalesDocumentError(422, "ALLOCATIONS_REQUIRED", "An approved quotation requires planned Company Code allocations.");
  const auth = await authorizeSalesOperation({ db: deps.db, tenantId: deps.tenantId, quotationId, operation: "convert_quotation", allocationCompanyCodeIds: allocations.map((allocation) => allocation.company_code_id), checkPermission: deps.checkPermission });
  if (auth.sellingModel === "principal_seller" && !auth.principalSellerCompanyId) throw new SalesDocumentError(422, "PRINCIPAL_SELLER_REQUIRED", "Principal-seller quotations require an explicit selling Company Code.");
  return deps.db.transaction().execute(async (tx) => {
    const orderIds: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const createOrder = async (companyCodeId: string, amount: number, suffix: string) => {
      const order = await tx.insertInto("document.sales_order").values({
        tenant_id: deps.tenantId, quotation_id: quotationId, code: `SO-${quote.code}-${suffix}`, name: `Sales order ${quote.code}`,
        company_code_id: companyCodeId, customer_id: quote.customer_id, order_date: today, currency_code: currencyCode.toUpperCase(),
        total_amount: amount, created_by: deps.principalId,
      }).returning("id").executeTakeFirstOrThrow();
      orderIds.push(order.id);
      return order.id;
    };
    if (auth.sellingModel === "principal_seller") {
      const orderId = await createOrder(auth.principalSellerCompanyId!, allocations.reduce((sum, allocation) => sum + Number(allocation.allocation_amount ?? 0), 0), "PRINCIPAL");
      for (const allocation of allocations) {
        if (allocation.company_code_id === auth.principalSellerCompanyId) continue;
        await tx.insertInto("document.sales_order_intercompany_fulfillment").values({
          tenant_id: deps.tenantId, sales_order_id: orderId, selling_company_code_id: auth.principalSellerCompanyId!, fulfillment_company_code_id: allocation.company_code_id,
          allocation_amount: allocation.allocation_amount ?? 0, currency_code: currencyCode.toUpperCase(), created_by: deps.principalId,
        }).execute();
        await tx.updateTable("document.sales_quotation_allocation").set({ output_sales_order_id: orderId, status: "converted", updated_at: new Date(), updated_by: deps.principalId }).where("tenant_id", "=", deps.tenantId).where("id", "=", allocation.id).execute();
      }
    } else {
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index]!;
        const orderId = await createOrder(allocation.company_code_id, Number(allocation.allocation_amount ?? 0), String(index + 1).padStart(3, "0"));
        await tx.updateTable("document.sales_quotation_allocation").set({ output_sales_order_id: orderId, status: "converted", updated_at: new Date(), updated_by: deps.principalId }).where("tenant_id", "=", deps.tenantId).where("id", "=", allocation.id).execute();
      }
    }
    if (auth.sellingModel === "principal_seller") {
      await tx.updateTable("document.sales_quotation_allocation").set({ status: "converted", updated_at: new Date(), updated_by: deps.principalId })
        .where("tenant_id", "=", deps.tenantId).where("quotation_id", "=", quotationId).where("status", "=", "planned").execute();
    }
    await tx.updateTable("document.sales_quotation").set({ status: "converted", updated_at: new Date(), updated_by: deps.principalId }).where("tenant_id", "=", deps.tenantId).where("id", "=", quotationId).execute();
    return { quotationId, orderIds, sellingModel: auth.sellingModel };
  });
}
