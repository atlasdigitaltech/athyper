/**
 * Finance Setup — Tenant / Legal Entity rollup builder (Phase 1.6).
 *
 * Loads every company under the parent scope, evaluates each via the existing
 * per-company Hub payload, and aggregates:
 *   • Company matrix (5 journey steps per company)
 *   • Aggregate KPIs (complete companies / total companies / total conflicts)
 *   • Scoped inbox — conflicts whose visibleAtScopes includes THIS scope
 *
 * F8 audit fix: every conflict is emitted with visibleAtScopes so a
 * company-scoped conflict rolls up into LE and tenant views.
 */

import { sql, type Kysely } from "kysely";
import {
  buildCompanyHubPayload,
  type CompanyHubPayload,
  type FinanceSetupConflict,
  type JourneyStep,
} from "./finance-readiness.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type RollupScopeType = "tenant" | "legal_entity";

interface ScopeRef {
  type:  "tenant" | "legal_entity" | "company";
  code:  string;
  label?: string;
}

export interface RollupCompanyRow {
  companyCode:     string;
  companyName:     string;
  legalEntityCode: string | null;
  legalEntityName: string | null;
  journey:         JourneyStep[];
  conflictCount:   number;
  isReady:         boolean;
  overallCoveragePct: number;
}

export interface RollupPayload {
  scope: ScopeRef;
  scopeName: string;
  companies: RollupCompanyRow[];
  aggregate: {
    completeCompanies: number;
    totalCompanies:    number;
    conflictCount:     number;
    /** Category → count of conflicts across the scope. */
    conflictsByCategory: Record<string, number>;
    /** Average coverage of the gl_controls step across all companies. */
    avgCoveragePct:    number;
  };
  inbox: FinanceSetupConflict[];
  computedAt: string;
}


// ─── Header resolvers ───────────────────────────────────────────────────────

interface ParentHeader {
  scopeUuid:  string;
  scopeCode:  string;
  scopeName:  string;
  tenantId:   string;
  tenantCode: string;
  tenantName: string;
}

async function loadTenantHeader(
  db: AnyDb,
  tenantId: string,
  tenantCode: string,
): Promise<ParentHeader | null> {
  const { rows } = await sql<{ id: string; code: string; name: string; display_name: string }>`
    SELECT id, code, name, display_name
      FROM master.tenant
     WHERE id = ${tenantId}::uuid
       AND code = ${tenantCode}
     LIMIT 1
  `.execute(db);
  const r = rows[0];
  if (!r) return null;
  return {
    scopeUuid:  r.id,
    scopeCode:  r.code,
    scopeName:  r.display_name || r.name,
    tenantId:   r.id,
    tenantCode: r.code,
    tenantName: r.display_name || r.name,
  };
}

async function loadLegalEntityHeader(
  db: AnyDb,
  tenantId: string,
  leCode: string,
): Promise<ParentHeader | null> {
  const { rows } = await sql<{
    id:                string;
    code:              string;
    name:              string;
    display_name:      string | null;
    tenant_id:         string;
    tenant_code:       string;
    tenant_name:       string;
  }>`
    SELECT le.id, le.code, le.name, le.display_name,
           t.id AS tenant_id, t.code AS tenant_code, t.name AS tenant_name
      FROM master.legal_entity le
      JOIN master.tenant t ON t.id = le.tenant_id
     WHERE le.tenant_id = ${tenantId}::uuid
       AND le.code = ${leCode}
     LIMIT 1
  `.execute(db);
  const r = rows[0];
  if (!r) return null;
  return {
    scopeUuid:  r.id,
    scopeCode:  r.code,
    scopeName:  r.display_name || r.name,
    tenantId:   r.tenant_id,
    tenantCode: r.tenant_code,
    tenantName: r.tenant_name,
  };
}


// ─── Company list under scope ───────────────────────────────────────────────

interface CompanyInfo {
  companyCode:     string;
  companyName:     string;
  legalEntityCode: string;
  legalEntityName: string;
}

async function loadCompaniesUnderScope(
  db: AnyDb,
  scope: { type: RollupScopeType; tenantId: string; scopeUuid: string },
): Promise<CompanyInfo[]> {
  const filterExpr = scope.type === "tenant"
    ? sql`cc.tenant_id = ${scope.tenantId}::uuid`
    : sql`cc.tenant_id = ${scope.tenantId}::uuid AND cc.legal_entity_id = ${scope.scopeUuid}::uuid`;

  const { rows } = await sql<{
    company_code:      string;
    company_name:      string;
    legal_entity_code: string;
    legal_entity_name: string;
  }>`
    SELECT cc.code AS company_code,
           cc.name AS company_name,
           le.code AS legal_entity_code,
           le.name AS legal_entity_name
      FROM master.company_code cc
      JOIN master.legal_entity le ON le.id = cc.legal_entity_id
     WHERE ${filterExpr}
       AND cc.is_active = true
     ORDER BY le.code, cc.code
  `.execute(db);
  return rows.map((r) => ({
    companyCode:     r.company_code,
    companyName:     r.company_name,
    legalEntityCode: r.legal_entity_code,
    legalEntityName: r.legal_entity_name,
  }));
}


// ─── Public: build the rollup payload ───────────────────────────────────────

export interface BuildRollupOptions {
  scopeType: RollupScopeType;
  scopeCode: string;
  tenantId:  string;
}

export async function buildRollupPayload(
  db: AnyDb,
  opts: BuildRollupOptions,
): Promise<RollupPayload | null> {
  const parent = opts.scopeType === "tenant"
    ? await loadTenantHeader(db, opts.tenantId, opts.scopeCode)
    : await loadLegalEntityHeader(db, opts.tenantId, opts.scopeCode);
  if (!parent) return null;

  const companies = await loadCompaniesUnderScope(db, {
    type:      opts.scopeType,
    tenantId:  parent.tenantId,
    scopeUuid: parent.scopeUuid,
  });

  const scopeRef: ScopeRef = {
    type:  opts.scopeType,
    code:  parent.scopeCode,
    label: parent.scopeName,
  };

  if (companies.length === 0) {
    return {
      scope:     scopeRef,
      scopeName: parent.scopeName,
      companies: [],
      aggregate: {
        completeCompanies:   0,
        totalCompanies:      0,
        conflictCount:       0,
        conflictsByCategory: {},
        avgCoveragePct:      100,
      },
      inbox:      [],
      computedAt: new Date().toISOString(),
    };
  }

  // Evaluate each company in parallel. Concurrency is bounded by the DB pool;
  // for very large tenants we can add a p-limit here later.
  const hubs = await Promise.all(
    companies.map((c) =>
      buildCompanyHubPayload(db, {
        tenantId:    parent.tenantId,
        companyCode: c.companyCode,
        inboxLimit:  50,   // wider so aggregate inbox has enough material
      }).catch(() => null),
    ),
  );

  const rows: RollupCompanyRow[] = companies.map((c, i) => {
    const hub: CompanyHubPayload | null = hubs[i] ?? null;
    const journey = hub?.journey ?? [];
    const conflictCount = journey.reduce((s, step) => s + step.conflictCount, 0);
    const glStep = journey.find((s) => s.key === "gl_controls");
    const overallCoveragePct = glStep?.coveragePct ?? 0;
    const isReady = journey.length > 0 && journey.every((s) => s.state === "complete");
    return {
      companyCode:        c.companyCode,
      companyName:        c.companyName,
      legalEntityCode:    c.legalEntityCode,
      legalEntityName:    c.legalEntityName,
      journey,
      conflictCount,
      isReady,
      overallCoveragePct,
    };
  });

  // Aggregate the inbox: every conflict is emitted with visibleAtScopes that
  // includes this rollup scope. F8 audit compliance.
  const allInboxConflicts: FinanceSetupConflict[] = [];
  for (const [i, hub] of hubs.entries()) {
    if (!hub) continue;
    for (const c of hub.inbox) {
      allInboxConflicts.push({
        ...c,
        visibleAtScopes: [
          ...c.visibleAtScopes,
          scopeRef,
          ...(opts.scopeType === "legal_entity"
            ? [{ type: "tenant" as const, code: parent.tenantCode, label: parent.tenantName }]
            : []),
        ],
      });
      void i;
    }
  }

  const conflictsByCategory: Record<string, number> = {};
  for (const c of allInboxConflicts) {
    conflictsByCategory[c.category] = (conflictsByCategory[c.category] ?? 0) + 1;
  }
  const avgCoveragePct = rows.length === 0
    ? 100
    : Math.round(rows.reduce((s, r) => s + r.overallCoveragePct, 0) / rows.length);

  const sortedInbox = allInboxConflicts
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 20);

  return {
    scope:     scopeRef,
    scopeName: parent.scopeName,
    companies: rows,
    aggregate: {
      completeCompanies:   rows.filter((r) => r.isReady).length,
      totalCompanies:      rows.length,
      conflictCount:       allInboxConflicts.length,
      conflictsByCategory,
      avgCoveragePct,
    },
    inbox:      sortedInbox,
    computedAt: new Date().toISOString(),
  };
}


// ─── helpers ────────────────────────────────────────────────────────────────

function severityRank(s: FinanceSetupConflict["severity"]): number {
  switch (s) {
    case "blocker": return 4;
    case "error":   return 3;
    case "warning": return 2;
    case "info":    return 1;
  }
}
