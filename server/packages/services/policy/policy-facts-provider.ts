/**
 * PolicyFactsProvider — Phase 2.2
 *
 * Injects runtime facts into policy evaluation (the existing PolicyEngine in
 * packages/services/policy/engine.ts).
 *
 * HARD CONSTRAINT (C5): Must be instantiated per-request with the active Kysely
 * connection. NEVER a singleton. Reason: entity state is resolved under RLS;
 * sharing a singleton connection would bypass row-level security.
 *
 *   // CORRECT — per-request, transaction-scoped
 *   await db.transaction().execute(async (tx) => {
 *     const facts = PolicyFactsProvider.forRequest({ db: tx, session: req.session });
 *     const result = await policyEngine.evaluate({ ...params, payload: await facts.enrich(payload) });
 *   });
 *
 *   // WRONG — singleton bypasses RLS
 *   const facts = new PolicyFactsProvider({ db: globalDb }); // Never
 *
 * Facts injected into the evaluation payload:
 *   _user          — principal record (roles, status, company_code_access)
 *   _entity        — current entity state (if entityId provided)
 *   _org           — company_code + legal_entity context
 *   _period        — active accounting period status
 *   _budget        — budget utilisation if applicable
 *   _workflow      — pending workflow stages for the entity
 */

import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolicySession {
  principalId:    string;
  tenantId:       string;
  companyCodeId?: string;
  legalEntityId?: string;
}

export interface PolicyFactsProviderDeps {
  /** Per-request Kysely connection (transaction-scoped to respect RLS) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:      Kysely<any>;
  session: PolicySession;
}

export interface UserFacts {
  principalId:   string;
  roles:         string[];
  status:        string;
  isLocked:      boolean;
  companyAccess: string[];
}

export interface EntityFacts {
  entityType: string;
  entityId:   string;
  status:     string | null;
  stage:      string | null;
  metadata:   Record<string, unknown>;
}

export interface OrgFacts {
  companyCodeId:  string | null;
  legalEntityId:  string | null;
  currencyCode:   string | null;
  fiscalYearCode: string | null;
}

export interface PeriodFacts {
  periodId:   string | null;
  status:     string | null;
  isOpen:     boolean;
}

export interface EnrichedPayload {
  _user:    UserFacts   | null;
  _entity:  EntityFacts | null;
  _org:     OrgFacts    | null;
  _period:  PeriodFacts | null;
  [key: string]: unknown;
}

// ── PolicyFactsProvider ───────────────────────────────────────────────────────

export class PolicyFactsProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly session: PolicySession;

  // Memoize within a single request (same provider instance)
  private _userFacts?: UserFacts | null;
  private _orgFacts?: OrgFacts;
  private _periodFacts?: PeriodFacts;

  constructor(deps: PolicyFactsProviderDeps) {
    this.db      = deps.db;
    this.session = deps.session;
  }

  /**
   * Enrich an evaluation payload with runtime facts.
   * Merges _user, _entity, _org, _period into the payload object.
   */
  async enrich(
    basePayload: Record<string, unknown>,
    opts?: { entityType?: string; entityId?: string },
  ): Promise<EnrichedPayload> {
    const [user, org, period, entity] = await Promise.all([
      this.getUserFacts(),
      this.getOrgFacts(),
      this.getPeriodFacts(),
      opts?.entityType && opts.entityId
        ? this.getEntityFacts(opts.entityType, opts.entityId)
        : Promise.resolve(null),
    ]);

    return {
      ...basePayload,
      _user:   user,
      _entity: entity,
      _org:    org,
      _period: period,
    };
  }

  async getUserFacts(): Promise<UserFacts | null> {
    if (this._userFacts !== undefined) return this._userFacts;

    const row = await this.db
      .selectFrom("master.principal as p" as never)
      .select(["p.id", "p.status", "p.is_locked"] as never[])
      .where("p.id" as never, "=", this.session.principalId as never)
      .where("p.tenant_id" as never, "=", this.session.tenantId as never)
      .executeTakeFirst() as { id: string; status: string; is_locked: boolean } | undefined;

    if (!row) { this._userFacts = null; return null; }

    // Load role assignments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleRows = await (this.db as any)
      .selectFrom("master.principal_role as pr")
      .innerJoin("master.role as r", "r.id", "pr.role_id")
      .select("r.code")
      .where("pr.principal_id", "=", this.session.principalId)
      .where("pr.tenant_id", "=", this.session.tenantId)
      .execute() as Array<{ code: string }>;

    // Load company code access
    const ccRows = await this.db
      .selectFrom("master.company_code_access as cca" as never)
      .select("cca.company_code_id" as never)
      .where("cca.principal_id" as never, "=", this.session.principalId as never)
      .where("cca.tenant_id" as never, "=", this.session.tenantId as never)
      .execute() as Array<{ company_code_id: string }>;

    this._userFacts = {
      principalId:   row.id,
      roles:         roleRows.map((r) => r.code),
      status:        row.status,
      isLocked:      row.is_locked,
      companyAccess: ccRows.map((r) => r.company_code_id),
    };
    return this._userFacts;
  }

  async getEntityFacts(entityType: string, entityId: string): Promise<EntityFacts | null> {
    // Resolve entity state from lifecycle_instance if lifecycle-enabled
    const liRow = await (this.db as any)
      .selectFrom("master.lifecycle_instance as li")
      .innerJoin("control.lifecycle_state as ls", "ls.id", "li.state_id")
      .select(["ls.code as current_state", "li.metadata"])
      .where("li.entity_name", "=", entityType)
      .where("li.entity_id", "=", entityId)
      .where("li.tenant_id", "=", this.session.tenantId)
      .executeTakeFirst() as { current_state: string; metadata: string | null } | undefined;

    return {
      entityType,
      entityId,
      status:   liRow?.current_state ?? null,
      stage:    null,
      metadata: liRow?.metadata ? JSON.parse(liRow.metadata) as Record<string, unknown> : {},
    };
  }

  async getOrgFacts(): Promise<OrgFacts> {
    if (this._orgFacts) return this._orgFacts;

    let currencyCode:   string | null = null;
    let fiscalYearCode: string | null = null;

    if (this.session.companyCodeId) {
      const ccRow = await this.db
        .selectFrom("master.company_code as cc" as never)
        .select(["cc.currency_code", "cc.fiscal_year_code"] as never[])
        .where("cc.id" as never, "=", this.session.companyCodeId as never)
        .where("cc.tenant_id" as never, "=", this.session.tenantId as never)
        .executeTakeFirst() as { currency_code: string; fiscal_year_code: string } | undefined;

      if (ccRow) {
        currencyCode   = ccRow.currency_code;
        fiscalYearCode = ccRow.fiscal_year_code;
      }
    }

    this._orgFacts = {
      companyCodeId:  this.session.companyCodeId ?? null,
      legalEntityId:  this.session.legalEntityId ?? null,
      currencyCode,
      fiscalYearCode,
    };
    return this._orgFacts;
  }

  async getPeriodFacts(): Promise<PeriodFacts> {
    if (this._periodFacts) return this._periodFacts;

    if (!this.session.companyCodeId) {
      this._periodFacts = { periodId: null, status: null, isOpen: false };
      return this._periodFacts;
    }

    const today = new Date().toISOString().slice(0, 10);
    const periodRow = await this.db
      .selectFrom("ledger.accounting_period as ap" as never)
      .select(["ap.id", "ap.status"] as never[])
      .where("ap.tenant_id" as never, "=", this.session.tenantId as never)
      .where("ap.company_code_id" as never, "=", this.session.companyCodeId as never)
      .where("ap.start_date" as never, "<=", today as never)
      .where("ap.end_date" as never, ">=", today as never)
      .executeTakeFirst() as { id: string; status: string } | undefined;

    this._periodFacts = {
      periodId: periodRow?.id ?? null,
      status:   periodRow?.status ?? null,
      isOpen:   periodRow?.status === "open",
    };
    return this._periodFacts;
  }

  /**
   * Factory — creates a fresh per-request provider.
   * Call inside a Kysely transaction for RLS correctness.
   */
  static forRequest(deps: PolicyFactsProviderDeps): PolicyFactsProvider {
    return new PolicyFactsProvider(deps);
  }
}
