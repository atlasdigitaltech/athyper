import { sql, type Kysely } from "kysely";
import { loadCurrencyFxSetup } from "./finance-fx-policy.service.js";
import { loadCompanyTaxSetup } from "./finance-tax-setup.service.js";
import { loadCompanyPaymentsSetup } from "./finance-payments-setup.service.js";
import { loadCompanyBankingSetup } from "./finance-banking-setup.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;
export type FinanceCertificationDomain = "currency_fx" | "tax" | "payments_settlement" | "banking_treasury";
export type DomainReadinessState = "not_started" | "in_progress" | "ready" | "blocked";

export interface DomainReadiness {
  domain: FinanceCertificationDomain;
  label: string;
  state: DomainReadinessState;
  passed: number;
  total: number;
  blockerCount: number;
  warningCount: number;
  checks: Array<{ code: string; label: string; passed: boolean }>;
  primaryAction: { label: string; href: string };
}

export interface CompanyCertificationReadiness {
  company: { id: string; code: string; name: string; legalEntityCode: string | null };
  asOfDate: string;
  domains: DomainReadiness[];
  summary: { passed: number; total: number; blockerCount: number; warningCount: number; readyForCertification: boolean };
  certification: { id: string | null; status: string | null; certifiedAt: string | null; fresh: boolean; materialChangeAt: string | null };
  rollout: { capabilityEnabled: boolean; mode: "observe" | "enforce"; effectiveFrom: string | null; postingGateActive: boolean };
  status: "not_started" | "in_progress" | "blocked" | "ready_for_certification" | "certified" | "stale";
  computedAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function domain(
  key: FinanceCertificationDomain,
  label: string,
  companyCode: string,
  checks: Array<{ code: string; label: string; passed: boolean }>,
  href: string,
  warnings = 0,
): DomainReadiness {
  const passed = checks.filter((check) => check.passed).length;
  const blockerCount = checks.length - passed;
  const state: DomainReadinessState = passed === checks.length
    ? "ready"
    : passed === 0
      ? "not_started"
      : blockerCount > 0
        ? "blocked"
        : "in_progress";
  return { domain: key, label, state, passed, total: checks.length, blockerCount, warningCount: warnings, checks,
    primaryAction: { label: `Open ${label}`, href: href.replace(":company", encodeURIComponent(companyCode)) } };
}

export function summarizeCertificationDomains(domains:DomainReadiness[]){
  const passed=domains.reduce((sum,item)=>sum+item.passed,0);
  const total=domains.reduce((sum,item)=>sum+item.total,0);
  const blockerCount=domains.reduce((sum,item)=>sum+item.blockerCount,0);
  const warningCount=domains.reduce((sum,item)=>sum+item.warningCount,0);
  return {passed,total,blockerCount,warningCount,readyForCertification:domains.length===4&&domains.every((item)=>item.state==="ready")};
}

export async function loadCompanyCertificationReadiness(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  asOfDate = today(),
): Promise<CompanyCertificationReadiness | null> {
  const { rows: companies } = await sql<{ id: string; code: string; name: string; legal_entity_code: string | null }>`
    SELECT company.id,company.code,company.name,legal_entity.code AS legal_entity_code
      FROM master.company_code company
      LEFT JOIN master.legal_entity legal_entity ON legal_entity.tenant_id=company.tenant_id AND legal_entity.id=company.legal_entity_id
     WHERE company.tenant_id=${tenantId}::uuid AND company.code=${companyCode} AND company.status='active' LIMIT 1
  `.execute(db);
  const company = companies[0];
  if (!company) return null;

  const [fx,tax,payments,banking,{ rows: evidenceRows }] = await Promise.all([
    loadCurrencyFxSetup(db,tenantId,companyCode,asOfDate),
    loadCompanyTaxSetup(db,tenantId,companyCode,asOfDate),
    loadCompanyPaymentsSetup(db,tenantId,companyCode,asOfDate),
    loadCompanyBankingSetup(db,tenantId,companyCode,asOfDate),
    sql<{
      certification_id:string|null; certification_status:string|null; certified_at:string|null;
      material_change_at:string|null; capability_enabled:boolean; rollout_mode:"observe"|"enforce"|null; rollout_effective_from:string|null;
    }>`
      WITH latest_run AS (
        SELECT run.id FROM governance.cycle_run run
        JOIN governance.cycle_type type ON type.tenant_id=run.tenant_id AND type.id=run.cycle_type_id
        WHERE run.tenant_id=${tenantId}::uuid AND run.entity_code=${companyCode}
          AND type.type_code='FIN_SETUP_READINESS' AND run.status<>'CANCELLED'
        ORDER BY run.run_number DESC,run.created_at DESC LIMIT 1
      ), latest_cert AS (
        SELECT cert.id,cert.status,COALESCE(cert.attested_at,cert.certified_at,cert.updated_at,cert.created_at) AS certified_at
        FROM governance.cycle_certification cert JOIN latest_run run ON run.id=cert.cycle_run_id
        WHERE cert.tenant_id=${tenantId}::uuid AND cert.cert_code='FINANCE_POSTING_READY'
        ORDER BY cert.cert_version DESC,cert.created_at DESC LIMIT 1
      ), rollout AS (
        SELECT policy.rollout_mode,policy.effective_from
        FROM control.finance_posting_rollout_policy policy
        WHERE policy.tenant_id=${tenantId}::uuid AND policy.status='active' AND policy.effective_from<=${asOfDate}::date
          AND (policy.company_code_id IS NULL OR policy.company_code_id=${company.id}::uuid)
        ORDER BY (policy.company_code_id IS NOT NULL) DESC,policy.effective_from DESC LIMIT 1
      ), material AS (
        SELECT max(activity.created_at) AS changed_at FROM log.activity_log activity
        WHERE activity.tenant_id=${tenantId}::uuid AND activity.domain='finance_setup'
          AND (activity.company_code_id IS NULL OR activity.company_code_id=${company.id}::uuid)
      )
      SELECT cert.id AS certification_id,cert.status AS certification_status,cert.certified_at::text,
             material.changed_at::text AS material_change_at,
             COALESCE(CASE WHEN flag.tenant_overrides ? ${tenantId}
               THEN (flag.tenant_overrides->>${tenantId})::boolean ELSE flag.is_enabled END,false) AS capability_enabled,
             COALESCE(rollout.rollout_mode,'observe') AS rollout_mode,rollout.effective_from::text AS rollout_effective_from
      FROM (SELECT 1) seed LEFT JOIN latest_cert cert ON true LEFT JOIN material ON true LEFT JOIN rollout ON true
      LEFT JOIN control.feature_flag flag ON flag.code='finance.posting_readiness_gate'
    `.execute(db),
  ]);

  const domains: DomainReadiness[] = [
    domain("currency_fx","Currency & FX",companyCode,[
      { code:"fx_policy_approved",label:"Approved effective FX policy",passed:fx.readiness.policyApproved },
      { code:"fx_pair_coverage",label:"All required currency pairs resolve",passed:fx.readiness.requiredPairCoverage },
      { code:"fx_posting_roles",label:"FX and revaluation posting roles resolve",passed:fx.readiness.postingRolesReady },
    ],"/finance/setup/company/:company/currency-fx"),
    domain("tax","Tax",companyCode,[
      { code:"tax_registration",label:"Effective tax registration",passed:tax.readiness.registrationReady },
      { code:"tax_groups",label:"Effective versioned Tax Groups",passed:tax.readiness.groupsReady },
      { code:"tax_resolution",label:"Deterministic Tax Resolution rules",passed:tax.readiness.rulesReady },
      { code:"tax_posting_roles",label:"Tax posting roles resolve",passed:tax.readiness.postingRolesReady },
    ],"/finance/setup/company/:company/tax"),
    domain("payments_settlement","Payments & Settlement",companyCode,[
      { code:"payment_methods",label:"Eligible payment methods",passed:payments.readiness.eligibleMethods },
      { code:"payment_house_banks",label:"Payment House Banks eligible",passed:payments.readiness.houseBanksReady },
      { code:"payment_interfaces",label:"Interface routing deterministic",passed:payments.readiness.interfacesReady },
      { code:"settlement_rules",label:"Settlement rules cover assigned Books",passed:payments.readiness.settlementReady },
      { code:"payment_posting_roles",label:"Settlement posting roles resolve",passed:payments.readiness.postingRolesReady },
    ],"/finance/setup/company/:company/payments",payments.diagnostics.filter((item)=>item.severity!=="error").length),
    domain("banking_treasury","Banking & Treasury",companyCode,[
      { code:"house_bank_configured",label:"At least one effective House Bank",passed:banking.readiness.houseBankCount>0 },
      { code:"house_bank_ready",label:"All effective House Banks pass setup checks",passed:banking.readiness.ready },
      { code:"bank_reconciliation",label:"No open statement or reconciliation setup blockers",passed:banking.readiness.openStatementCount===0&&banking.readiness.unreconciledCount===0 },
    ],"/finance/setup/company/:company/banking"),
  ];
  const {passed,total,blockerCount,warningCount,readyForCertification}=summarizeCertificationDomains(domains);
  const evidence=evidenceRows[0];
  const certifiedAt=evidence?.certified_at??null,materialChangeAt=evidence?.material_change_at??null;
  const activeCertification=["CERTIFIED","ATTESTED"].includes(evidence?.certification_status??"");
  const fresh=activeCertification&&(!materialChangeAt||Boolean(certifiedAt&&certifiedAt>=materialChangeAt));
  const mode=evidence?.rollout_mode??"observe",capabilityEnabled=evidence?.capability_enabled??false;
  const status:CompanyCertificationReadiness["status"]=fresh&&readyForCertification?"certified"
    :activeCertification&&!fresh?"stale":readyForCertification?"ready_for_certification"
      :passed===0?"not_started":blockerCount>0?"blocked":"in_progress";
  return {company:{id:company.id,code:company.code,name:company.name,legalEntityCode:company.legal_entity_code},asOfDate,domains,
    summary:{passed,total,blockerCount,warningCount,readyForCertification},
    certification:{id:evidence?.certification_id??null,status:evidence?.certification_status??null,certifiedAt,fresh,materialChangeAt},
    rollout:{capabilityEnabled,mode,effectiveFrom:evidence?.rollout_effective_from??null,postingGateActive:capabilityEnabled&&mode==="enforce"},status,computedAt:new Date().toISOString()};
}

export async function loadCertificationReadinessRollup(
  db:AnyDb,tenantId:string,scopeType:"tenant"|"legal_entity",scopeCode:string,asOfDate=today(),
) {
  const {rows}=await sql<{code:string}>`
    SELECT company.code FROM master.company_code company
    LEFT JOIN master.legal_entity legal_entity ON legal_entity.tenant_id=company.tenant_id AND legal_entity.id=company.legal_entity_id
    JOIN master.tenant tenant ON tenant.id=company.tenant_id
    WHERE company.tenant_id=${tenantId}::uuid AND company.status='active'
      AND (${scopeType}='tenant' AND tenant.code=${scopeCode} OR ${scopeType}='legal_entity' AND legal_entity.code=${scopeCode})
    ORDER BY company.code
  `.execute(db);
  const companies=(await Promise.all(rows.map((row)=>loadCompanyCertificationReadiness(db,tenantId,row.code,asOfDate)))).filter((row):row is CompanyCertificationReadiness=>Boolean(row));
  return {scope:{type:scopeType,code:scopeCode},companies,summary:{companyCount:companies.length,certifiedCount:companies.filter((row)=>row.status==="certified").length,readyCount:companies.filter((row)=>row.summary.readyForCertification).length,blockedCount:companies.filter((row)=>row.summary.blockerCount>0).length},computedAt:new Date().toISOString()};
}
