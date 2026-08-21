import { describe, expect, it, vi } from "vitest";
import {
  aggregateSourcingDemand,
  allocateSourcingAward,
  convertSourcingAward,
  createSourcingEvent,
} from "../procurement/sourcing/sourcing-document.service";
import {
  allocateSalesQuotation,
  convertSalesQuotation,
  createSalesOpportunity,
  createSalesQuotation,
} from "../sales/sales-document.service";

type Row = Record<string, any>;

const TENANT_ID = "tenant-athyper";
const PRINCIPAL_ID = "principal-buyer";
const PROCUREMENT_OO = "oo-procurement";
const SALES_OO = "oo-sales";
const CUSTOMER_ID = "customer-1";
const COMPANIES = ["cc-athq", "cc-amre", "cc-aqtu", "cc-asac", "cc-auet"];
const SIXTH_COMPANY = "cc-sixth";

function normalizeTable(table: string): string {
  return table.replace(/\s+as\s+\w+$/i, "");
}

function makeDb(options: {
  organization: Row;
  companies?: Row[];
  event?: Row;
  eventParticipants?: string[];
  demandLines?: Row[];
  award?: Row;
  awardAllocations?: Row[];
  opportunity?: Row;
  opportunityParticipants?: string[];
  quotation?: Row;
  quotationParticipants?: string[];
  quotationAllocations?: Row[];
}) {
  const writes: Array<{ table: string; kind: string; values?: unknown; set?: unknown }> = [];
  const companies = (options.companies ?? COMPANIES.map((id) => ({ id, base_currency_code: "USD", status: "active" })))
    .map((row) => ({ tenant_id: TENANT_ID, ...row }));

  const rowsFor = (table: string): Row[] => {
    const name = normalizeTable(table);
    if (name === "master.operating_organization") return [{ tenant_id: TENANT_ID, ...options.organization }];
    if (name === "master.company_code") return companies;
    if (name === "document.sourcing_event") return options.event ? [{ tenant_id: TENANT_ID, ...options.event }] : [];
    if (name === "document.sourcing_event_company") return (options.eventParticipants ?? []).map((companyCodeId) => ({
      company_code_id: companyCodeId,
      event_id: options.event?.id,
      sourcing_event_id: options.event?.id,
      status: "active",
    }));
    if (name === "document.purchase_requisition_line") return (options.demandLines ?? []).map((row) => ({ tenant_id: TENANT_ID, ...row }));
    if (name === "document.sourcing_event_award") return options.award ? [{
      tenant_id: TENANT_ID,
      central_buyer_company_id: options.event?.central_buyer_company_id ?? null,
      ...options.award,
    }] : [];
    if (name === "document.sourcing_event_award_allocation") return (options.awardAllocations ?? []).map((row) => ({
      tenant_id: TENANT_ID,
      award_id: options.award?.id,
      sourcing_event_award_id: options.award?.id,
      central_buyer_company_id: options.event?.central_buyer_company_id,
      ...row,
    }));
    if (name === "document.sales_opportunity") return options.opportunity ? [{ tenant_id: TENANT_ID, ...options.opportunity }] : [];
    if (name === "document.sales_opportunity_company") return (options.opportunityParticipants ?? []).map((company_code_id) => ({
      company_code_id,
      opportunity_id: options.opportunity?.id,
      status: "active",
    }));
    if (name === "document.sales_quotation") return options.quotation ? [{ tenant_id: TENANT_ID, ...options.quotation }] : [];
    if (name === "document.sales_quotation_company") return (options.quotationParticipants ?? []).map((company_code_id) => ({
      tenant_id: TENANT_ID,
      company_code_id,
      quotation_id: options.quotation?.id,
      status: "active",
    }));
    if (name === "document.sales_quotation_allocation") return (options.quotationAllocations ?? []).map((row) => ({
      tenant_id: TENANT_ID,
      quotation_id: options.quotation?.id,
      ...row,
    }));
    return [];
  };

  const applyFilters = (rows: Row[], filters: Array<unknown[]>): Row[] => {
    return rows.filter((row) => filters.every((args) => {
      const [column, operator, value] = args;
      if (typeof column !== "string" || typeof operator !== "string") return true;
      const key = column.split(".").pop()!;
      if (operator === "in" && Array.isArray(value)) return value.includes(row[key]);
      if (operator === "=") return row[key] === value || value === undefined;
      return true;
    }));
  };

  const db: any = {
    writes,
    selectFrom(table: string) { return query(table, "select"); },
    insertInto(table: string) { return query(table, "insert"); },
    updateTable(table: string) { return query(table, "update"); },
    transaction() { return { execute: async (callback: (transaction: any) => Promise<unknown>) => callback(db) }; },
  };

  function query(table: string, kind: string) {
    const state: { filters: Array<unknown[]>; values?: unknown; set?: unknown } = { filters: [] };
    const chain = new Proxy({}, {
      get(_target, property: string | symbol) {
        if (property === "then") return undefined;
        if (property === "execute") {
          return async () => {
            if (kind !== "select") writes.push({ table: normalizeTable(table), kind, values: state.values, set: state.set });
            return kind === "select"
              ? (normalizeTable(table).endsWith("sourcing_event_company")
                ? rowsFor(table)
                : applyFilters(rowsFor(table), state.filters))
              : [];
          };
        }
        if (property === "executeTakeFirst") {
          return async () => applyFilters(rowsFor(table), state.filters)[0];
        }
        if (property === "executeTakeFirstOrThrow") {
          return async () => {
            if (kind !== "select") {
              const values = Array.isArray(state.values) ? state.values[0] : state.values;
              const id = normalizeTable(table).includes("commitment") ? `commitment-${writes.length + 1}` :
                normalizeTable(table).includes("sales_order") ? `sales-order-${writes.length + 1}` :
                normalizeTable(table).includes("sales_opportunity") ? "opportunity-created" :
                normalizeTable(table).includes("sales_quotation") ? "quotation-created" :
                normalizeTable(table).includes("sourcing_event") ? "event-created" : `row-${writes.length + 1}`;
              writes.push({ table: normalizeTable(table), kind, values: state.values, set: state.set });
              return { ...(values ?? {}), id };
            }
            const row = applyFilters(rowsFor(table), state.filters)[0];
            if (!row) throw new Error(`No fake row for ${table}`);
            return row;
          };
        }
        return (...args: unknown[]) => {
          if (property === "where" && typeof args[0] === "string") state.filters.push(args);
          if (property === "values") state.values = args[0];
          if (property === "set") state.set = args[0];
          return chain;
        };
      },
    });
    return chain;
  }

  return db as { writes: typeof writes; [key: string]: any };
}

function allowAll(scope = COMPANIES) {
  return vi.fn(async () => ({ decision: "allow", scope: { company_code_ids: scope } }));
}

describe("Phase 6 procurement document integration", () => {
  it("aggregates five Company Codes, rejects an unauthorized sixth, and creates federated commitments", async () => {
    const db = makeDb({
      organization: { id: PROCUREMENT_OO, tenant_id: TENANT_ID, domain: "procurement", status: "active" },
      event: { id: "event-1", tenant_id: TENANT_ID, operating_organization_id: PROCUREMENT_OO, buying_model: "federated", central_buyer_company_id: null },
      eventParticipants: [...COMPANIES, SIXTH_COMPANY],
      demandLines: COMPANIES.map((company_code_id, index) => ({ id: `demand-${index + 1}`, company_code_id })),
      award: { id: "award-1", code: "AWARD-1", sourcing_event_id: "event-1", award_status: "approved", buying_model: "federated" },
      awardAllocations: COMPANIES.map((company_code_id, index) => ({ id: `award-allocation-${index + 1}`, company_code_id, allocation_amount: 100 + index, allocation_percent: 20, status: "planned" })),
    });
    const checkPermission = allowAll();
    const deps = { db, tenantId: TENANT_ID, principalId: PRINCIPAL_ID, checkPermission } as never;

    await createSourcingEvent(deps, {
      code: "RFP-LAPTOP",
      name: "Group laptop RFP",
      operatingOrganizationId: PROCUREMENT_OO,
      participantCompanyCodeIds: COMPANIES,
      buyingModel: "federated",
    } as never);
    await aggregateSourcingDemand(deps, { sourcingEventId: "event-1", demandLineIds: COMPANIES.map((_, i) => `demand-${i + 1}`) });

    const deniedDeps = {
      ...deps,
      checkPermission: vi.fn(async (_permission: string, context: Row) => ({
        decision: "allow",
        scope: { company_code_ids: context.companyCodeIds?.includes(SIXTH_COMPANY) ? COMPANIES : [...COMPANIES, SIXTH_COMPANY] },
      })),
    } as never;
    const demandDb = makeDb({
      organization: { id: PROCUREMENT_OO, tenant_id: TENANT_ID, domain: "procurement", status: "active" },
      event: { id: "event-1", tenant_id: TENANT_ID, operating_organization_id: PROCUREMENT_OO, buying_model: "federated", central_buyer_company_id: null },
      eventParticipants: [...COMPANIES, SIXTH_COMPANY],
      demandLines: [...COMPANIES.map((company_code_id, index) => ({ id: `demand-${index + 1}`, company_code_id })), { id: "demand-6", company_code_id: SIXTH_COMPANY }],
    });
    await expect(aggregateSourcingDemand({ ...(deniedDeps as any), db: demandDb } as never, { sourcingEventId: "event-1", demandLineIds: ["demand-6"] })).rejects.toMatchObject({ code: "COMPANY_SCOPE_DENIED" });

    await allocateSourcingAward(deps, "award-1", COMPANIES.map((companyCodeId) => ({ companyCodeId, allocationPercent: 20, allocationAmount: 100 })));
    await convertSourcingAward(deps, "award-1", "USD");
    expect(db.writes.filter((write) => write.table === "document.commitment")).toHaveLength(COMPANIES.length);
    expect(db.writes.filter((write) => write.table === "document.sourcing_event_intercompany_allocation")).toHaveLength(0);
  });

  it("creates one central-buyer commitment and beneficiary intercompany allocations", async () => {
    const db = makeDb({
      organization: { id: PROCUREMENT_OO, tenant_id: TENANT_ID, domain: "procurement", status: "active" },
      event: { id: "event-central", tenant_id: TENANT_ID, operating_organization_id: PROCUREMENT_OO, buying_model: "central_buyer", central_buyer_company_id: COMPANIES[0] },
      eventParticipants: COMPANIES,
      award: { id: "award-central", code: "AWARD-CENTRAL", sourcing_event_id: "event-central", award_status: "approved", buying_model: "central_buyer" },
      awardAllocations: COMPANIES.map((company_code_id, index) => ({ id: `central-allocation-${index + 1}`, company_code_id, allocation_amount: 100 + index, allocation_percent: 20, status: "planned" })),
    });
    await convertSourcingAward({ db, tenantId: TENANT_ID, principalId: PRINCIPAL_ID, checkPermission: allowAll() } as never, "award-central", "USD");
    expect(db.writes.filter((write) => write.table === "document.commitment")).toHaveLength(1);
    expect(db.writes.filter((write) => write.table === "document.sourcing_event_intercompany_allocation")).toHaveLength(COMPANIES.length);
  });
});

describe("Phase 7 sales document integration", () => {
  it("creates a multi-company quotation and federated legal-seller orders", async () => {
    const db = makeDb({
      organization: { id: SALES_OO, tenant_id: TENANT_ID, domain: "sales", status: "active" },
      opportunity: { id: "opportunity-1", tenant_id: TENANT_ID, customer_id: CUSTOMER_ID, operating_organization_id: SALES_OO, selling_model: "federated", principal_seller_company_id: null },
      opportunityParticipants: COMPANIES.slice(0, 3),
      quotation: { id: "quotation-1", code: "QUOTE-1", customer_id: CUSTOMER_ID, selling_model: "federated", principal_seller_company_id: null, status: "approved" },
      quotationParticipants: COMPANIES.slice(0, 3),
      quotationAllocations: COMPANIES.slice(0, 3).map((company_code_id, index) => ({ id: `quote-allocation-${index + 1}`, company_code_id, allocation_amount: 100, status: "planned" })),
    });
    const deps = { db, tenantId: TENANT_ID, principalId: PRINCIPAL_ID, checkPermission: allowAll() } as never;
    await createSalesOpportunity(deps, { code: "OPP-1", name: "Enterprise laptops", operatingOrganizationId: SALES_OO, customerId: CUSTOMER_ID, participantCompanyCodeIds: COMPANIES.slice(0, 3), sellingModel: "federated" } as never);
    await createSalesQuotation(deps, { opportunityId: "opportunity-1", code: "QUOTE-1", name: "Enterprise quotation" });
    await allocateSalesQuotation(deps, "quotation-1", COMPANIES.slice(0, 3).map((companyCodeId) => ({ companyCodeId, allocationPercent: 33.33, allocationAmount: 100 })));
    await convertSalesQuotation(deps, "quotation-1", "USD");
    expect(db.writes.filter((write) => write.table === "document.sales_order")).toHaveLength(3);
    expect(db.writes.filter((write) => write.table === "document.sales_order_intercompany_fulfillment")).toHaveLength(0);
  });

  it("creates one principal-seller order and intercompany fulfillment for the other sellers", async () => {
    const principal = COMPANIES[0]!;
    const db = makeDb({
      organization: { id: SALES_OO, tenant_id: TENANT_ID, domain: "sales", status: "active" },
      quotation: { id: "quotation-principal", code: "QUOTE-PRINCIPAL", customer_id: CUSTOMER_ID, selling_model: "principal_seller", principal_seller_company_id: principal, status: "approved" },
      quotationParticipants: COMPANIES.slice(0, 3),
      quotationAllocations: COMPANIES.slice(0, 3).map((company_code_id, index) => ({ id: `principal-allocation-${index + 1}`, company_code_id, allocation_amount: 100, status: "planned" })),
    });
    await convertSalesQuotation({ db, tenantId: TENANT_ID, principalId: PRINCIPAL_ID, checkPermission: allowAll() } as never, "quotation-principal", "USD");
    expect(db.writes.filter((write) => write.table === "document.sales_order")).toHaveLength(1);
    expect(db.writes.filter((write) => write.table === "document.sales_order_intercompany_fulfillment")).toHaveLength(2);
  });
});

