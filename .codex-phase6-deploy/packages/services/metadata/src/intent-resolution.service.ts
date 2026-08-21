/**
 * IntentResolutionService — Phase 2.4
 *
 * Wraps the DB function resolve_business_intent() and resolve_accounting_profile()
 * with explanation rendering and user context.
 *
 * The DB functions contain 16+ conditions of business logic that determine
 * the canonical intent (purchase/sale/intercompany/etc.) for a document and
 * derive the matching accounting profile. Application code wraps these with
 * human-readable explanations.
 *
 * Architecture principle: DB functions ARE the engine. This service does NOT
 * reimplement the logic — it calls the DB functions and decorates the result.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntentResolutionInput {
  tenantId:          string;
  documentTypeCode:  string;
  supplierId?:         string;
  customerId?:       string;
  companyCodeId?:    string;
  legalEntityId?:    string;
  intercompanyFlag?: boolean;
  currencyCode?:     string;
  metadata?:         Record<string, unknown>;
}

export interface ResolvedIntent {
  intentCode:          string;
  intentLabel:         string;
  accountingProfileId: string | null;
  profileCode:         string | null;
  transactionFlowCode: string | null;
  explanation:         string;
  conditions:          ResolvedCondition[];
  resolvedAt:          string;
}

export interface ResolvedCondition {
  condition:   string;
  matched:     boolean;
  description: string;
}

export interface AccountingProfile {
  id:            string;
  code:          string;
  name:          string;
  entryTemplate: Record<string, unknown> | null;
  bookRules:     Record<string, unknown>[];
  dimensionRules: Record<string, unknown>[];
}

// ── IntentResolutionService ───────────────────────────────────────────────────

export class IntentResolutionService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Resolve business intent for a document context.
   * Calls resolve_business_intent() DB function — authoritative 16-condition engine.
   */
  async resolveIntent(input: IntentResolutionInput): Promise<ResolvedIntent | null> {
    try {
      // Call DB function via raw SQL (Kysely doesn't have typed function calls)
      const result = await sql`
        SELECT * FROM shared.resolve_business_intent(
          ${input.tenantId}::uuid,
          ${input.documentTypeCode}::text,
          ${input.supplierId ?? null}::uuid,
          ${input.customerId ?? null}::uuid,
          ${input.companyCodeId ?? null}::uuid,
          ${input.legalEntityId ?? null}::uuid,
          ${input.intercompanyFlag ?? false}::boolean,
          ${input.currencyCode ?? null}::text,
          ${JSON.stringify(input.metadata ?? {})}::jsonb
        )
      `.execute(this.db);

      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      return {
        intentCode:          String(row["intent_code"] ?? ""),
        intentLabel:         String(row["intent_label"] ?? ""),
        accountingProfileId: row["accounting_profile_id"] as string | null,
        profileCode:         row["profile_code"] as string | null,
        transactionFlowCode: row["transaction_flow_code"] as string | null,
        explanation:         this.buildExplanation(row),
        conditions:          this.parseConditions(row["conditions_matched"]),
        resolvedAt:          new Date().toISOString(),
      };
    } catch (err) {
      // DB function call failed — return null; caller handles graceful degradation
      return null;
    }
  }

  /**
   * Resolve accounting profile for a given intent + company code.
   * Returns the full profile with entry templates and book rules.
   */
  async resolveAccountingProfile(
    tenantId: string,
    intentCode: string,
    companyCodeId: string,
    documentTypeCode?: string,
  ): Promise<AccountingProfile | null> {
    try {
      const result = await sql`
        SELECT * FROM shared.resolve_accounting_profile(
          ${tenantId}::uuid,
          ${intentCode}::text,
          ${companyCodeId}::uuid,
          ${documentTypeCode ?? null}::text
        )
      `.execute(this.db);

      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      // Load full profile details
      const profileId = row["accounting_profile_id"] as string | null;
      if (!profileId) return null;

      return this.loadFullProfile(tenantId, profileId);
    } catch {
      return null;
    }
  }

  /**
   * Load the full accounting profile definition including entry templates and rules.
   */
  async loadFullProfile(tenantId: string, profileId: string): Promise<AccountingProfile | null> {
    const profile = await this.db
      .selectFrom("control.acct_profile_config as apc" as never)
      .select(["apc.id", "apc.code", "apc.name"] as never[])
      .where("apc.id" as never, "=", profileId as never)
      .where("apc.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { id: string; code: string; name: string } | undefined;

    if (!profile) return null;

    const entryTemplates = await this.db
      .selectFrom("control.acct_profile_entry_template as apet" as never)
      .selectAll("apet" as never)
      .where("apet.profile_id" as never, "=", profileId as never)
      .orderBy("apet.sequence" as never, "asc")
      .execute() as Record<string, unknown>[];

    const bookRules = await this.db
      .selectFrom("control.acct_profile_book_rule as apbr" as never)
      .selectAll("apbr" as never)
      .where("apbr.profile_id" as never, "=", profileId as never)
      .execute() as Record<string, unknown>[];

    const dimensionRules = await this.db
      .selectFrom("control.acct_profile_dimension_rule as apdr" as never)
      .selectAll("apdr" as never)
      .where("apdr.profile_id" as never, "=", profileId as never)
      .execute() as Record<string, unknown>[];

    return {
      id:             profile.id,
      code:           profile.code,
      name:           profile.name,
      entryTemplate:  entryTemplates.length > 0 ? entryTemplates[0] ?? null : null,
      bookRules,
      dimensionRules,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private buildExplanation(row: Record<string, unknown>): string {
    const intent = String(row["intent_code"] ?? "unknown");
    const profile = row["profile_code"] ? ` → profile ${String(row["profile_code"])}` : "";
    const flow = row["transaction_flow_code"] ? ` via ${String(row["transaction_flow_code"])}` : "";
    return `Intent resolved as '${intent}'${profile}${flow}.`;
  }

  private parseConditions(raw: unknown): ResolvedCondition[] {
    if (!raw || typeof raw !== "object") return [];
    try {
      const list = Array.isArray(raw) ? raw : [raw];
      return (list as Record<string, unknown>[]).map((c) => ({
        condition:   String(c["condition"] ?? ""),
        matched:     Boolean(c["matched"]),
        description: String(c["description"] ?? ""),
      }));
    } catch {
      return [];
    }
  }
}

export function createIntentResolutionService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>
): IntentResolutionService {
  return new IntentResolutionService(db);
}
