import type { Kysely } from "kysely";
import {
  authorizeSourcingEventCreation,
  authorizeSourcingOperation,
  type SourcingPermissionChecker,
} from "./sourcing-authorization.service.js";

type SourcingDb = Kysely<Record<string, any>>;

export interface SourcingDocumentDeps {
  db: SourcingDb;
  tenantId: string;
  principalId: string;
  checkPermission: SourcingPermissionChecker;
}

export interface CreateSourcingEventInput {
  code: string;
  name: string;
  operatingOrganizationId: string;
  eventType?: "rfp" | "rfq";
  buyingModel?: "federated" | "central_buyer";
  centralBuyerCompanyId?: string | null;
  participantCompanyCodeIds: readonly string[];
  openAt?: string | null;
  closeAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AwardAllocationInput {
  companyCodeId: string;
  allocationPercent?: number | null;
  allocationAmount?: number | null;
}

export class SourcingDocumentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "SourcingDocumentError";
  }
}

function permissionChecker(deps: SourcingDocumentDeps): SourcingPermissionChecker {
  return deps.checkPermission;
}

export async function createSourcingEvent(deps: SourcingDocumentDeps, input: CreateSourcingEventInput): Promise<Record<string, unknown>> {
  if (!input.code.trim() || !input.name.trim() || !input.operatingOrganizationId) {
    throw new SourcingDocumentError(400, "EVENT_IDENTITY_REQUIRED", "code, name, and operatingOrganizationId are required.");
  }
  const buyingModel = input.buyingModel ?? "federated";
  const participantIds = [...new Set(input.participantCompanyCodeIds.filter(Boolean))];
  if (participantIds.length === 0) throw new SourcingDocumentError(400, "PARTICIPANTS_REQUIRED", "At least one participant Company Code is required.");
  if (buyingModel === "central_buyer" && !input.centralBuyerCompanyId) {
    throw new SourcingDocumentError(422, "CENTRAL_BUYER_REQUIRED", "Central-buyer events require a central buyer Company Code.");
  }

  await authorizeSourcingEventCreation({
    db: deps.db, tenantId: deps.tenantId, principalId: deps.principalId,
    operatingOrganizationId: input.operatingOrganizationId, checkPermission: permissionChecker(deps),
  });
  const companies = await deps.db.selectFrom("master.company_code").select("id")
    .where("tenant_id", "=", deps.tenantId).where("id", "in", participantIds).where("status", "=", "active").execute();
  if (companies.length !== participantIds.length) {
    throw new SourcingDocumentError(422, "PARTICIPANT_COMPANY_INVALID", "Every participant Company Code must be active in this tenant.");
  }
  if (input.centralBuyerCompanyId && !participantIds.includes(input.centralBuyerCompanyId)) {
    throw new SourcingDocumentError(422, "CENTRAL_BUYER_NOT_PARTICIPANT", "The central buyer must be one of the event participants.");
  }

  return deps.db.transaction().execute(async (tx) => {
    const event = await tx.insertInto("document.sourcing_event").values({
      tenant_id: deps.tenantId, code: input.code.trim(), name: input.name.trim(),
      operating_organization_id: input.operatingOrganizationId, event_type: input.eventType ?? "rfp",
      buying_model: buyingModel, central_buyer_company_id: input.centralBuyerCompanyId ?? null,
      requested_by: deps.principalId, created_by: deps.principalId,
      open_at: input.openAt ?? null, close_at: input.closeAt ?? null, metadata: input.metadata ?? {},
    }).returning(["id", "tenant_id", "code", "name", "operating_organization_id", "buying_model", "status"])
      .executeTakeFirstOrThrow();
    await tx.insertInto("document.sourcing_event_company").values(participantIds.map((companyCodeId, index) => ({
      tenant_id: deps.tenantId, sourcing_event_id: event.id, company_code_id: companyCodeId,
      participation_role: index === 0 ? "lead_buyer" : "participant", created_by: deps.principalId,
    }))).execute();
    return event as Record<string, unknown>;
  });
}

export async function aggregateSourcingDemand(deps: SourcingDocumentDeps, input: { sourcingEventId: string; demandLineIds: readonly string[] }): Promise<Record<string, unknown>> {
  const lineIds = [...new Set(input.demandLineIds.filter(Boolean))];
  if (!input.sourcingEventId || lineIds.length === 0) throw new SourcingDocumentError(400, "DEMAND_LINES_REQUIRED", "sourcingEventId and at least one demand line are required.");
  const auth = await authorizeSourcingOperation({ ...deps, sourcingEventId: input.sourcingEventId, operation: "aggregate_demand", demandLineIds: lineIds });
  const lines = await deps.db.selectFrom("document.purchase_requisition_line as prl")
    .innerJoin("document.purchase_requisition as pr", (join) => join.onRef("pr.id", "=", "prl.purchase_requisition_id").onRef("pr.tenant_id", "=", "prl.tenant_id"))
    .select(["prl.id", "prl.quantity", "prl.net_amount", "pr.company_code_id"])
    .where("prl.tenant_id", "=", deps.tenantId).where("prl.id", "in", lineIds).execute();
  const participants = new Set(auth.participantCompanyCodeIds);
  if (lines.some((line) => !participants.has(line.company_code_id))) throw new SourcingDocumentError(422, "DEMAND_PARTICIPANT_REQUIRED", "Every demand Company Code must participate in the sourcing event.");
  await deps.db.transaction().execute(async (tx) => {
    await tx.insertInto("document.sourcing_event_demand").values(lines.map((line) => ({
      tenant_id: deps.tenantId, sourcing_event_id: input.sourcingEventId, purchase_requisition_line_id: line.id,
      demand_company_code_id: line.company_code_id, requested_quantity: line.quantity, requested_amount: line.net_amount,
      created_by: deps.principalId,
    }))).onConflict((conflict) => conflict.columns(["tenant_id", "sourcing_event_id", "purchase_requisition_line_id"]).doNothing()).execute();
  });
  return { sourcingEventId: input.sourcingEventId, demandLineIds: lines.map((line) => line.id), companyCodeIds: auth.demandCompanyCodeIds };
}

export async function allocateSourcingAward(deps: SourcingDocumentDeps, awardId: string, allocations: readonly AwardAllocationInput[]): Promise<Record<string, unknown>> {
  const award = await deps.db.selectFrom("document.sourcing_event_award").select(["id", "sourcing_event_id"])
    .where("tenant_id", "=", deps.tenantId).where("id", "=", awardId).executeTakeFirst();
  if (!award) throw new SourcingDocumentError(404, "AWARD_NOT_FOUND", "The sourcing award is not available in this tenant.");
  const normalized = allocations.filter((allocation) => allocation.companyCodeId);
  if (normalized.length === 0) throw new SourcingDocumentError(400, "ALLOCATIONS_REQUIRED", "At least one award allocation is required.");
  if (normalized.reduce((sum, allocation) => sum + Number(allocation.allocationPercent ?? 0), 0) > 100.0001) throw new SourcingDocumentError(422, "ALLOCATION_EXCEEDS_TOTAL", "Award allocation percentages cannot exceed 100%.");
  const auth = await authorizeSourcingOperation({ ...deps, sourcingEventId: award.sourcing_event_id, operation: "allocate_award", allocationCompanyCodeIds: normalized.map((allocation) => allocation.companyCodeId) });
  const participants = new Set(auth.participantCompanyCodeIds);
  if (normalized.some((allocation) => !participants.has(allocation.companyCodeId))) throw new SourcingDocumentError(422, "PARTICIPANT_COMPANY_REQUIRED", "Award allocations must target event participants.");
  const allocationIds = await deps.db.transaction().execute(async (tx) => {
    const ids: string[] = [];
    for (const allocation of normalized) {
      const row = await tx.insertInto("document.sourcing_event_award_allocation").values({
        tenant_id: deps.tenantId, award_id: awardId, company_code_id: allocation.companyCodeId,
        allocation_percent: allocation.allocationPercent ?? null, allocation_amount: allocation.allocationAmount ?? null, created_by: deps.principalId,
      }).onConflict((conflict) => conflict.columns(["tenant_id", "award_id", "company_code_id"]).doUpdateSet({
        allocation_percent: allocation.allocationPercent ?? null, allocation_amount: allocation.allocationAmount ?? null,
        status: "planned", updated_at: new Date(), updated_by: deps.principalId,
      })).returning("id").executeTakeFirstOrThrow();
      ids.push(row.id);
    }
    return ids;
  });
  return { awardId, allocationIds };
}

export async function convertSourcingAward(deps: SourcingDocumentDeps, awardId: string, currencyCode?: string): Promise<Record<string, unknown>> {
  const award = await deps.db.selectFrom("document.sourcing_event_award as a")
    .innerJoin("document.sourcing_event as e", (join) => join.onRef("e.id", "=", "a.sourcing_event_id").onRef("e.tenant_id", "=", "a.tenant_id"))
    .select(["a.id", "a.sourcing_event_id", "a.supplier_id", "a.award_status", "e.code", "e.buying_model", "e.central_buyer_company_id"])
    .where("a.tenant_id", "=", deps.tenantId).where("a.id", "=", awardId).executeTakeFirst();
  if (!award) throw new SourcingDocumentError(404, "AWARD_NOT_FOUND", "The sourcing award is not available in this tenant.");
  if (award.award_status !== "approved") throw new SourcingDocumentError(422, "AWARD_NOT_APPROVED", "Only approved awards can create purchase commitments.");
  const allocations = await deps.db.selectFrom("document.sourcing_event_award_allocation")
    .select(["id", "company_code_id", "allocation_amount"]).where("tenant_id", "=", deps.tenantId).where("award_id", "=", awardId).where("status", "=", "planned").execute();
  if (allocations.length === 0) throw new SourcingDocumentError(422, "AWARD_ALLOCATIONS_REQUIRED", "An approved award requires planned Company Code allocations.");
  await authorizeSourcingOperation({ ...deps, sourcingEventId: award.sourcing_event_id, operation: "convert_award", allocationCompanyCodeIds: allocations.map((allocation) => allocation.company_code_id) });
  return deps.db.transaction().execute(async (tx) => {
    const centralBuyer = award.central_buyer_company_id;
    if (award.buying_model === "central_buyer" && !centralBuyer) throw new SourcingDocumentError(422, "CENTRAL_BUYER_REQUIRED", "Central-buyer events require a central buyer Company Code.");
    const commitmentIds: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const createCommitment = async (companyCodeId: string, amount: number, suffix: string) => {
      const company = await tx.selectFrom("master.company_code").select("base_currency_code").where("tenant_id", "=", deps.tenantId).where("id", "=", companyCodeId).executeTakeFirst();
      if (!company?.base_currency_code) throw new SourcingDocumentError(422, "COMPANY_CURRENCY_REQUIRED", "The commitment Company Code has no base currency.");
      const currency = (currencyCode ?? company.base_currency_code).toUpperCase();
      const commitment = await tx.insertInto("document.commitment").values({
        tenant_id: deps.tenantId, code: `SRC-${award.code}-${suffix}`, name: `Sourcing award ${award.code}`,
        company_code_id: companyCodeId, requested_by: deps.principalId, commitment_type: "purchase_order", order_type: "standard",
        party_type: "supplier", party_id: award.supplier_id, document_date: today, effective_date: today,
        currency_code: currency, base_currency_code: company.base_currency_code, total_amount: amount, scheduled_amount: amount,
        metadata: { source: "sourcing_award", awardId, sourceEventId: award.sourcing_event_id }, created_by: deps.principalId,
      }).returning("id").executeTakeFirstOrThrow();
      commitmentIds.push(commitment.id);
      return commitment.id;
    };
    if (award.buying_model === "central_buyer") {
      const total = allocations.reduce((sum, allocation) => sum + Number(allocation.allocation_amount ?? 0), 0);
      const commitmentId = await createCommitment(centralBuyer!, total, "CENTRAL");
      for (const allocation of allocations) {
        await tx.insertInto("document.sourcing_event_intercompany_allocation").values({
          tenant_id: deps.tenantId, award_allocation_id: allocation.id, source_company_code_id: centralBuyer!,
          beneficiary_company_code_id: allocation.company_code_id, commitment_id: commitmentId,
          allocation_amount: allocation.allocation_amount ?? 0, currency_code: currencyCode ?? null, created_by: deps.principalId,
        }).execute();
        await tx.updateTable("document.sourcing_event_award_allocation").set({ output_commitment_id: commitmentId, status: "converted", updated_at: new Date(), updated_by: deps.principalId }).where("tenant_id", "=", deps.tenantId).where("id", "=", allocation.id).execute();
      }
    } else {
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index]!;
        const commitmentId = await createCommitment(allocation.company_code_id, Number(allocation.allocation_amount ?? 0), String(index + 1).padStart(3, "0"));
        await tx.updateTable("document.sourcing_event_award_allocation").set({ output_commitment_id: commitmentId, status: "converted", updated_at: new Date(), updated_by: deps.principalId }).where("tenant_id", "=", deps.tenantId).where("id", "=", allocation.id).execute();
      }
    }
    await tx.updateTable("document.sourcing_event_award").set({ award_status: "converted", updated_at: new Date(), updated_by: deps.principalId }).where("tenant_id", "=", deps.tenantId).where("id", "=", awardId).execute();
    return { awardId, commitmentIds, buyingModel: award.buying_model };
  });
}
