import { existsSync,readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
import {
  summarizeCertificationDomains,
  type DomainReadiness,
} from "../services/finance-certification-readiness.service.js";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance FX Slice 7 certification, migration, and rollout",()=>{
  it("certifies deterministic setup while reporting rate health separately",()=>{
    const service=read("server/packages/services/finance/services/finance-certification-readiness.service.ts");
    const ui=read("packages/domain/finance/finance-workbench/src/views/company-hub/CertificationReadinessPanel.tsx");
    const invalidation=read("server/db/ddl/governance/09z_finance_phase2_domain_invalidation.sql");
    expect(service).toContain("loadCompanyFxSummary");
    expect(service).toContain("fx.setupStatus.complete");
    expect(service).toContain("fx.postingAccounts.ready");
    expect(service).toContain("affectsCertification:false");
    expect(service).not.toContain("requiredPairCoverage");
    expect(service).toContain("'finance_setup.fx_rate_created'");
    expect(service).toContain("'finance_setup.fx_rate_replaced'");
    expect(service).toContain("'finance_setup.fx_rates_imported'");
    expect(invalidation).toContain("Rates are operational health, not setup evidence");
    expect(invalidation).not.toContain("CREATE TRIGGER trg_fin_ready_fx_rate");
    expect(ui).toContain("Operational health is displayed separately");
    expect(ui).toContain("does not block certification");

    const ready:DomainReadiness={
      domain:"currency_fx",label:"Currency & FX",state:"ready",
      passed:3,total:3,blockerCount:0,warningCount:4,
      checks:[],operationalHealth:{state:"attention",attentionCount:4,affectsCertification:false},
      primaryAction:{label:"Open",href:"/"},
    };
    expect(summarizeCertificationDomains([
      ready,
      {...ready,domain:"tax"},
      {...ready,domain:"payments_settlement"},
      {...ready,domain:"banking_treasury"},
    ])).toMatchObject({readyForCertification:true,warningCount:16});
  });

  it("ships a read-only missing-default migration report with history counts",()=>{
    const report=read("server/db/scripts/reports/report-finance-fx-tenant-defaults.ts");
    const scripts=JSON.parse(read("server/db/package.json")) as {scripts:Record<string,string>};
    expect(scripts.scripts["db:report:finance-fx-tenant-defaults"]).toContain("report-finance-fx-tenant-defaults.ts");
    expect(report).toContain('"missing_default"');
    expect(report).toContain("exposed_company_count");
    expect(report).toContain("policy_history_count");
    expect(report).toContain("rate_history_count");
    expect(report).toContain("readOnly:true");
    expect(report).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO\s+|FROM\s+)?(?:control|master)\./);
  });

  it("resolves the navigation flag on the server and supports data-neutral rollback",()=>{
    const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
    const seed=read("server/db/seed/platform/003_control/111_finance_fx_navigation_rollout.sql");
    const tenantUi=read("packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxSummaryPanels.tsx");
    expect(route).toContain('"finance.fx_entity_navigation"');
    expect(route).toContain("featureFlags?.isEnabled");
    expect(route).toContain("rollbackRequiresDataChange:false");
    expect(route).toContain("finance_fx_navigation_resolved");
    expect(seed).toContain("ON CONFLICT (code) DO UPDATE");
    expect(seed).not.toMatch(/ON CONFLICT[\s\S]*is_enabled\s*=\s*EXCLUDED\.is_enabled/);
    expect(tenantUi).toContain("summary.navigation.rateListHref");
    expect(tenantUi).toContain("summary.navigation.rateImportHref");
  });

  it("posts from the certification service snapshot and retires the old custom workbench",()=>{
    const governance=read("server/packages/services/finance/services/finance-governance.service.ts");
    const journal=read("server/packages/services/finance/routes/journal.route.ts");
    const runbook=read("docs/runbooks/finance-fx-certification-rollout.md");
    expect(governance).toContain('"certification_service_snapshot"');
    expect(governance).toContain("fourDomainReadiness");
    expect(journal).toContain("finance_posting_readiness_gate_evaluated");
    expect(journal).toContain("source:readiness.source");
    expect(runbook).toContain("Production posting never consumes browser state");
    expect(runbook).toContain("Navigation rollback");
    expect(runbook).toContain("Do not roll back policy or rate migrations");
    expect(existsSync(resolve(root,"packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateWorkbench.tsx"))).toBe(false);
    expect(read("packages/domain/finance/finance-workbench/src/index.ts")).not.toContain("FxRateWorkbench");
  });
});
