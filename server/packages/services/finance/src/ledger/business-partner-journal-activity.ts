import {
  financePermissions,
  type FinanceActor,
} from "@athyper/server-contract-finance";
import { sql } from "kysely";
import type { FinanceTransactionRunner } from "../shared/kysely-finance-foundation.js";

export interface BusinessPartnerJournalActivityQuery {
  readonly actor: FinanceActor;
  readonly businessPartnerId: string;
  readonly operatingOrganizationId: string;
  readonly companyCodeId: string;
  readonly asOf: string;
}
export interface BusinessPartnerJournalActivityResult {
  readonly state: "ready" | "empty" | "unavailable";
  readonly metrics: readonly {
    readonly code: string;
    readonly label: string;
    readonly value: number;
  }[];
  readonly reasonCode?: string;
  readonly observedAt: string;
}

/** Finance owns this aggregate. Its scoped reader is independent of BP directory access. */
export function createBusinessPartnerJournalActivityReader(options: {
  readonly transactions: FinanceTransactionRunner;
  readonly authorize: (
    query: BusinessPartnerJournalActivityQuery,
    permissionCode: string,
  ) => Promise<boolean>;
  readonly now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  const unavailable = (
    reasonCode: string,
  ): BusinessPartnerJournalActivityResult => ({
    state: "unavailable",
    metrics: [],
    reasonCode,
    observedAt: now().toISOString(),
  });
  const contextCompatible = async (
    query: BusinessPartnerJournalActivityQuery,
    tx: Parameters<Parameters<FinanceTransactionRunner["run"]>[1]>[0],
  ) => {
    const current = now().toISOString().slice(0, 10);
    return (
      (
        await sql`SELECT 1 FROM master.operating_organization_company_assignment link
        JOIN master.company_code company ON company.tenant_id=link.tenant_id AND company.id=link.company_code_id AND company.status='active'
        JOIN master.operating_organization organization ON organization.tenant_id=link.tenant_id AND organization.id=link.operating_organization_id AND organization.status='active'
        WHERE link.tenant_id=${query.actor.tenantId}::uuid AND link.operating_organization_id=${query.operatingOrganizationId}::uuid AND link.company_code_id=${query.companyCodeId}::uuid
          AND link.status='active' AND link.effective_from<=${current}::date AND (link.effective_until IS NULL OR link.effective_until>${current}::date)
          AND EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment bp
            WHERE bp.tenant_id=link.tenant_id AND bp.business_partner_id=${query.businessPartnerId}::uuid AND bp.operating_organization_id=link.operating_organization_id
              AND bp.status='active' AND bp.effective_from<=${current}::date AND (bp.effective_until IS NULL OR bp.effective_until>${current}::date))
        LIMIT 1`.execute(tx)
      ).rows.length > 0
    );
  };
  return {
    async read(
      query: BusinessPartnerJournalActivityQuery,
    ): Promise<BusinessPartnerJournalActivityResult> {
      if (
        query.actor.planeKey !== "neon" ||
        !query.businessPartnerId ||
        !query.operatingOrganizationId ||
        !query.companyCodeId ||
        !/^\d{4}-\d{2}-\d{2}$/.test(query.asOf)
      )
        return unavailable("FINANCE_ACTIVITY_CONTEXT_REQUIRED");
      if (
        !(await options.authorize(
          query,
          financePermissions.businessPartnerActivityRead,
        ))
      )
        return unavailable("FINANCE_ACTIVITY_FORBIDDEN");
      const result = await options.transactions.run(query.actor, async (tx) => {
        // Current authority is required even when the requested business date is historical.
        const compatible = await contextCompatible(query, tx);
        if (!compatible)
          return unavailable("FINANCE_ACTIVITY_CONTEXT_INCOMPATIBLE");
        // EXISTS counts journals once even when several lines reference the same BP.
        // Tenant, company, business date and BP filtering occur before aggregation.
        const row = (
          await sql<{ draft_count: string; posted_count: string }>`SELECT
        count(*) FILTER(WHERE journal.status='draft')::text draft_count,
        count(*) FILTER(WHERE journal.status='posted')::text posted_count
        FROM document.journal_entry journal
        WHERE journal.tenant_id=${query.actor.tenantId}::uuid AND journal.company_code_id=${query.companyCodeId}::uuid
          AND journal.document_date<=${query.asOf}::date
          AND (journal.status='draft' OR (journal.status='posted' AND journal.posting_date<=${query.asOf}::date))
          AND EXISTS(SELECT 1 FROM document.journal_line line WHERE line.tenant_id=journal.tenant_id AND line.journal_entry_id=journal.id AND line.business_partner_id=${query.businessPartnerId}::uuid)`.execute(
            tx,
          )
        ).rows[0];
        if (!row) throw Error("FINANCE_ACTIVITY_AGGREGATE_MISSING");
        const draft = Number(row.draft_count),
          posted = Number(row.posted_count);
        if (
          !Number.isSafeInteger(draft) ||
          !Number.isSafeInteger(posted) ||
          draft < 0 ||
          posted < 0
        )
          throw Error("FINANCE_ACTIVITY_COUNT_INVALID");
        return {
          state: draft + posted ? "ready" : "empty",
          metrics: [
            { code: "draft_journals", label: "Draft journals", value: draft },
            {
              code: "posted_journals",
              label: "Posted journals",
              value: posted,
            },
          ],
          observedAt: now().toISOString(),
        } as BusinessPartnerJournalActivityResult;
      });
      if (
        !(await options.authorize(
          query,
          financePermissions.businessPartnerActivityRead,
        ))
      )
        return unavailable("FINANCE_ACTIVITY_AUTHORIZATION_CHANGED");
      if (
        result.state !== "unavailable" &&
        !(await options.transactions.run(query.actor, (tx) =>
          contextCompatible(query, tx),
        ))
      )
        return unavailable("FINANCE_ACTIVITY_CONTEXT_CHANGED");
      return result;
    },
  };
}
