import { sql, type Kysely } from "kysely";
import { loadPostingRoleCoverage } from "./posting-role.service.js";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export const FX_RATE_TYPES = ["SPOT", "PERIOD_AVG", "PERIOD_END", "BUDGET", "CONTRACTED", "HISTORICAL"] as const;
export const FX_SOURCES = ["ECB", "REUTERS", "BLOOMBERG", "CENTRAL_BANK", "MANUAL", "CUSTOM", "API"] as const;
export type FxRateType = (typeof FX_RATE_TYPES)[number];

export interface FxPolicyRecord {
  id: string; companyCodeId: string | null; ledgerBookId: string | null; transactionContext: string;
  effectiveFrom: string; effectiveTo: string | null; priority: number; defaultRateType: FxRateType;
  revaluationRateType: FxRateType; pivotCurrencyCode: string | null; allowInverse: boolean;
  allowTriangulation: boolean; preferredSources: string[]; maximumRateAgeDays: number | null;
  missingRateBehavior: "block" | "manual_with_approval" | "fallback"; manualOverrideAllowed: boolean;
  manualOverrideApprovalRequired: boolean; autoReverseRevaluation: boolean; status: string; versionNo: number;
}

export interface FxPolicyTraceCandidate { policy: FxPolicyRecord; specificity: number; selected: boolean; reason: string; }
export interface FxPolicyResolution { selected: FxPolicyRecord | null; candidates: FxPolicyTraceCandidate[]; asOfDate: string; transactionContext: string; }

export class FinanceFxError extends Error {
  constructor(public code: string, public status: number, message: string, public details?: Record<string, unknown>) { super(message); }
}

const today = () => new Date().toISOString().slice(0, 10);
const asArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const policyFromRow = (r: Record<string, unknown>): FxPolicyRecord => ({
  id: String(r.id), companyCodeId: r.company_code_id ? String(r.company_code_id) : null,
  ledgerBookId: r.ledger_book_id ? String(r.ledger_book_id) : null,
  transactionContext: String(r.transaction_context), effectiveFrom: String(r.effective_from),
  effectiveTo: r.effective_to ? String(r.effective_to) : null, priority: Number(r.priority),
  defaultRateType: String(r.default_rate_type) as FxRateType, revaluationRateType: String(r.revaluation_rate_type) as FxRateType,
  pivotCurrencyCode: r.pivot_currency_code ? String(r.pivot_currency_code).trim() : null,
  allowInverse: Boolean(r.allow_inverse), allowTriangulation: Boolean(r.allow_triangulation),
  preferredSources: asArray(r.preferred_sources), maximumRateAgeDays: r.maximum_rate_age_days == null ? null : Number(r.maximum_rate_age_days),
  missingRateBehavior: String(r.missing_rate_behavior) as FxPolicyRecord["missingRateBehavior"],
  manualOverrideAllowed: Boolean(r.manual_override_allowed), manualOverrideApprovalRequired: Boolean(r.manual_override_approval_required),
  autoReverseRevaluation: Boolean(r.auto_reverse_revaluation), status: String(r.status), versionNo: Number(r.version_no),
});

export async function resolveCompanyFxContext(db: AnyDb, tenantId: string, companyCode: string) {
  const { rows } = await sql<{ id: string; code: string; name: string; functional_currency: string; tenant_code:string }>`
    SELECT cc.id, cc.code, cc.name, cc.functional_currency, tenant.code AS tenant_code FROM master.company_code cc
      JOIN master.tenant tenant ON tenant.id=cc.tenant_id
     WHERE cc.tenant_id=${tenantId}::uuid AND cc.code=${companyCode} LIMIT 1
  `.execute(db);
  const company = rows[0];
  if (!company) throw new FinanceFxError("COMPANY_NOT_FOUND", 404, `No company with code=${companyCode} in tenant.`);
  return { ...company, functional_currency: company.functional_currency.trim() };
}

export async function resolveFxPolicy(db: AnyDb, input: {
  tenantId: string; companyCodeId?: string | null; ledgerBookId?: string | null;
  transactionContext?: string; asOfDate?: string;
}): Promise<FxPolicyResolution> {
  const asOfDate = input.asOfDate ?? today();
  const context = input.transactionContext?.trim() || "general";
  const { rows } = await sql<Record<string, unknown>>`
    SELECT *, CASE WHEN company_code_id IS NULL THEN 1 WHEN ledger_book_id IS NULL THEN 2 ELSE 3 END AS specificity
      FROM control.fx_policy
     WHERE tenant_id=${input.tenantId}::uuid AND status='active'
       AND transaction_context IN (${context}, 'general')
       AND effective_from <= ${asOfDate}::date AND (effective_to IS NULL OR effective_to >= ${asOfDate}::date)
       AND (company_code_id IS NULL OR company_code_id=${input.companyCodeId ?? null}::uuid)
       AND (ledger_book_id IS NULL OR ledger_book_id=${input.ledgerBookId ?? null}::uuid)
     ORDER BY (transaction_context=${context}) DESC,
              CASE WHEN company_code_id IS NULL THEN 1 WHEN ledger_book_id IS NULL THEN 2 ELSE 3 END DESC,
              priority DESC, effective_from DESC, version_no DESC, id
  `.execute(db);
  const candidates = rows.map((row, index) => ({
    policy: policyFromRow(row), specificity: Number(row.specificity), selected: index === 0,
    reason: index === 0 ? "Highest context, scope specificity, priority and version." : "Lower-ranked applicable policy.",
  }));
  return { selected: candidates[0]?.policy ?? null, candidates, asOfDate, transactionContext: context };
}

interface RateRow { id: string; from_currency: string; to_currency: string; rate: string; inverse_rate: string; rate_type: string; effective_date: string; effective_time: string | null; source: string; }
export interface FxRateTrace {
  request: { fromCurrency: string; toCurrency: string; rateType: FxRateType; asOfDate: string; transactionContext: string; ledgerBookId: string | null };
  policyResolution: FxPolicyResolution; selected: null | { rate: number; path: string[]; source: string; rateIds: string[]; effectiveDate: string; method: "identity" | "direct" | "inverse" | "triangulated" };
  attempts: Array<{ method: string; pair: string; accepted: boolean; reason: string; rateId?: string }>;
}

function chooseRate(rows: RateRow[], from: string, to: string, policy: FxPolicyRecord, asOfDate: string, attempts: FxRateTrace["attempts"]) {
  const sourceRank = (source: string) => { const n = policy.preferredSources.indexOf(source); return n < 0 ? policy.preferredSources.length + 1 : n; };
  const maxDate = policy.maximumRateAgeDays == null ? null : new Date(`${asOfDate}T00:00:00Z`).getTime() - policy.maximumRateAgeDays * 86400000;
  const candidates: Array<{ row:RateRow; value:number; method:"direct"|"inverse" }> = [];
  for (const r of rows) {
    const rf = r.from_currency.trim(), rt = r.to_currency.trim();
    if (rf === from && rt === to) candidates.push({ row: r, value: Number(r.rate), method: "direct" });
    else if (policy.allowInverse && rf === to && rt === from) candidates.push({ row: r, value: Number(r.inverse_rate), method: "inverse" });
  }
  candidates.sort((a, b) => sourceRank(a.row.source) - sourceRank(b.row.source) || b.row.effective_date.localeCompare(a.row.effective_date));
  for (const c of candidates) {
    if (maxDate != null && new Date(`${c.row.effective_date}T00:00:00Z`).getTime() < maxDate) {
      attempts.push({ method: c.method, pair: `${from}/${to}`, accepted: false, reason: `Rate is older than ${policy.maximumRateAgeDays} day policy limit.`, rateId: c.row.id });
      continue;
    }
    attempts.push({ method: c.method, pair: `${from}/${to}`, accepted: true, reason: `Selected ${c.row.source} by source preference and recency.`, rateId: c.row.id });
    return c;
  }
  attempts.push({ method: "lookup", pair: `${from}/${to}`, accepted: false, reason: policy.allowInverse ? "No eligible direct or inverse rate." : "No eligible direct rate; inverse is disabled." });
  return null;
}

export async function traceFxResolution(db: AnyDb, input: {
  tenantId: string; companyCode: string; fromCurrency: string; toCurrency: string; rateType?: FxRateType;
  asOfDate?: string; transactionContext?: string; ledgerBookId?: string | null;
}): Promise<FxRateTrace> {
  const company = await resolveCompanyFxContext(db, input.tenantId, input.companyCode);
  const from = input.fromCurrency.trim().toUpperCase(), to = input.toCurrency.trim().toUpperCase();
  const asOfDate = input.asOfDate ?? today(), transactionContext = input.transactionContext?.trim() || "general";
  const policyResolution = await resolveFxPolicy(db, { tenantId: input.tenantId, companyCodeId: company.id, ledgerBookId: input.ledgerBookId, transactionContext, asOfDate });
  const policy = policyResolution.selected;
  const rateType = input.rateType ?? policy?.defaultRateType ?? "SPOT";
  const request = { fromCurrency: from, toCurrency: to, rateType, asOfDate, transactionContext, ledgerBookId: input.ledgerBookId ?? null };
  const attempts: FxRateTrace["attempts"] = [];
  if (from === to) return { request, policyResolution, attempts, selected: { rate: 1, path: [from], source: "IDENTITY", rateIds: [], effectiveDate: asOfDate, method: "identity" } };
  if (!policy) { attempts.push({ method: "policy", pair: `${from}/${to}`, accepted: false, reason: "No approved effective policy." }); return { request, policyResolution, attempts, selected: null }; }
  const currencies = [from, to, ...(policy.pivotCurrencyCode ? [policy.pivotCurrencyCode] : [])];
  const { rows } = await sql<RateRow>`
    SELECT id, from_currency, to_currency, rate::text, inverse_rate::text, rate_type,
           effective_date::text, effective_time::text, source
      FROM master.fx_rate WHERE tenant_id=${input.tenantId}::uuid AND status='active'
       AND rate_type=${rateType} AND effective_date <= ${asOfDate}::date
       AND from_currency = ANY(${currencies}::character(3)[]) AND to_currency = ANY(${currencies}::character(3)[])
     ORDER BY effective_date DESC, effective_time DESC NULLS LAST, created_at DESC
  `.execute(db);
  const direct = chooseRate(rows, from, to, policy, asOfDate, attempts);
  if (direct) return { request, policyResolution, attempts, selected: { rate: direct.value, path: [from, to], source: direct.row.source, rateIds: [direct.row.id], effectiveDate: direct.row.effective_date, method: direct.method } };
  const pivot = policy.allowTriangulation ? policy.pivotCurrencyCode : null;
  if (!pivot || pivot === from || pivot === to) {
    attempts.push({ method: "triangulated", pair: `${from}/${to}`, accepted: false, reason: pivot ? "Pivot cannot equal either requested currency." : "Triangulation is disabled or no explicit pivot is configured." });
    return { request, policyResolution, attempts, selected: null };
  }
  const first = chooseRate(rows, from, pivot, policy, asOfDate, attempts);
  const second = chooseRate(rows, pivot, to, policy, asOfDate, attempts);
  if (!first || !second) return { request, policyResolution, attempts, selected: null };
  attempts.push({ method: "triangulated", pair: `${from}/${to}`, accepted: true, reason: `Resolved through explicit ${pivot} pivot.` });
  return { request, policyResolution, attempts, selected: { rate: first.value * second.value, path: [from, pivot, to], source: `${first.row.source}+${second.row.source}`, rateIds: [first.row.id, second.row.id], effectiveDate: [first.row.effective_date, second.row.effective_date].sort()[0]!, method: "triangulated" } };
}

export async function loadCurrencyFxSetup(db: AnyDb, tenantId: string, companyCode: string, asOfDate = today()) {
  const company = await resolveCompanyFxContext(db, tenantId, companyCode);
  const [{ rows: bookRows }, { rows: bankRows }, posting] = await Promise.all([
    sql<{ id: string; code: string; name: string; currency_code: string }>`SELECT lb.id, lb.code, lb.name, COALESCE(ba.override_currency_code,lb.base_currency_code)::text AS currency_code
      FROM master.company_code_book_assignment ba JOIN master.ledger_book lb ON lb.tenant_id=ba.tenant_id AND lb.id=ba.book_id
     WHERE ba.tenant_id=${tenantId}::uuid AND ba.company_code_id=${company.id}::uuid AND ba.status='active' AND lb.status='active'
       AND ba.effective_from<=${asOfDate}::date AND (ba.effective_to IS NULL OR ba.effective_to>=${asOfDate}::date) ORDER BY lb.is_primary DESC,lb.code`.execute(db),
    sql<{ currency_code: string; count: number }>`SELECT ba.currency_code::text, count(*)::int AS count FROM master.bank_account_link l
      JOIN master.bank_account ba ON ba.tenant_id=l.tenant_id AND ba.id=l.bank_account_id
     WHERE l.tenant_id=${tenantId}::uuid AND (l.owner_type='company_code' AND l.owner_id=${company.id}::uuid OR l.company_code_id=${company.id}::uuid)
       AND l.effective_from<=${asOfDate}::date AND (l.effective_until IS NULL OR l.effective_until>${asOfDate}::date)
     GROUP BY ba.currency_code`.execute(db),
    loadPostingRoleCoverage(db, tenantId, companyCode, asOfDate),
  ]);
  const policyResolution = await resolveFxPolicy(db, { tenantId, companyCodeId: company.id, asOfDate });
  const currencyReasons = new Map<string, string[]>();
  for (const b of bookRows) { const c=b.currency_code.trim(); if(c!==company.functional_currency) currencyReasons.set(c,[...(currencyReasons.get(c)??[]),`Ledger book ${b.code}`]); }
  for (const b of bankRows) { const c=b.currency_code.trim(); if(c!==company.functional_currency) currencyReasons.set(c,[...(currencyReasons.get(c)??[]),`${b.count} linked bank account(s)`]); }
  const rateType = policyResolution.selected?.revaluationRateType ?? "PERIOD_END";
  const coverage = await Promise.all([...currencyReasons.entries()].map(async ([currency, reasons]) => {
    const trace = await traceFxResolution(db,{ tenantId,companyCode,fromCurrency:currency,toCurrency:company.functional_currency,rateType,asOfDate,transactionContext:"revaluation" });
    return { fromCurrency:currency,toCurrency:company.functional_currency,rateType,reasons,covered:Boolean(trace.selected),selectedRate:trace.selected,trace };
  }));
  const fxRoles = posting.rows.filter(r=>["fx_gain","fx_loss","unrealized_fx_gain","unrealized_fx_loss"].includes(r.roleCode));
  const postingRolesReady = fxRoles.length>=2 && fxRoles.every(r=>r.cells.length>0 && r.cells.every(c=>c.status==="resolved"));
  const readiness = {
    policyApproved:Boolean(policyResolution.selected), requiredPairCoverage:coverage.length===0 || coverage.every(x=>x.covered), postingRolesReady,
    revaluationReady:Boolean(policyResolution.selected) && (coverage.length===0 || coverage.every(x=>x.covered)) && postingRolesReady,
  };
  return { company:{ id:company.id,code:company.code,name:company.name,functionalCurrency:company.functional_currency,tenantCode:company.tenant_code }, asOfDate, books:bookRows.map(b=>({...b,currency_code:b.currency_code.trim()})), policyResolution, requiredPairs:coverage, postingRoleCoverage:{ rows:fxRoles,summary:posting.summary }, readiness };
}

export async function saveFxPolicy(db:AnyDb,input:{tenantId:string;companyCode:string;actorId:string;body:Record<string,unknown>}) {
  const company=await resolveCompanyFxContext(db,input.tenantId,input.companyCode),b=input.body;
  const id=typeof b.id==="string"?b.id:null,status=String(b.status??"draft");
  const defaultRateType=upperRateType(b.defaultRateType??"SPOT"),revaluationRateType=upperRateType(b.revaluationRateType??"PERIOD_END");
  const effectiveFrom=String(b.effectiveFrom??today()),effectiveTo=b.effectiveTo?String(b.effectiveTo):null;
  const ledgerBookId=b.ledgerBookId?String(b.ledgerBookId):null,pivot=b.pivotCurrencyCode?String(b.pivotCurrencyCode).trim().toUpperCase():null;
  const sources=Array.isArray(b.preferredSources)?b.preferredSources.map(x=>String(x).toUpperCase()):[];
  if(!["draft","active","inactive"].includes(status)) throw new FinanceFxError("INVALID_POLICY_STATUS",400,"Policy status must be draft, active or inactive.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new FinanceFxError("INVALID_EFFECTIVE_DATE",400,"effectiveFrom must be YYYY-MM-DD.");
  if(Boolean(b.allowTriangulation)&&!pivot) throw new FinanceFxError("PIVOT_REQUIRED",400,"An explicit pivot currency is required when triangulation is enabled.");
  if(Boolean(b.manualOverrideApprovalRequired)&&!Boolean(b.manualOverrideAllowed)) throw new FinanceFxError("INVALID_OVERRIDE_POLICY",400,"Approval cannot be required when manual override is disabled.");
  if(ledgerBookId){ const {rows}=await sql<{id:string}>`SELECT ba.id FROM master.company_code_book_assignment ba WHERE ba.tenant_id=${input.tenantId}::uuid AND ba.company_code_id=${company.id}::uuid AND ba.book_id=${ledgerBookId}::uuid LIMIT 1`.execute(db); if(!rows[0]) throw new FinanceFxError("BOOK_NOT_ASSIGNED",400,"Ledger book is not assigned to this company."); }
  const values={context:String(b.transactionContext??"general").trim(),priority:Number(b.priority??100),defaultRateType,revaluationRateType,pivot,
    allowInverse:b.allowInverse!==false,allowTriangulation:Boolean(b.allowTriangulation),sources,maxAge:b.maximumRateAgeDays==null||b.maximumRateAgeDays===""?null:Number(b.maximumRateAgeDays),
    missing:String(b.missingRateBehavior??"block"),manual:Boolean(b.manualOverrideAllowed),approval:Boolean(b.manualOverrideApprovalRequired),autoReverse:b.autoReverseRevaluation!==false};
  if(id){
    const {rows}=await sql<{id:string}>`UPDATE control.fx_policy SET ledger_book_id=${ledgerBookId}::uuid,transaction_context=${values.context},effective_from=${effectiveFrom}::date,effective_to=${effectiveTo}::date,
      priority=${values.priority},default_rate_type=${values.defaultRateType},revaluation_rate_type=${values.revaluationRateType},pivot_currency_code=${values.pivot},allow_inverse=${values.allowInverse},allow_triangulation=${values.allowTriangulation},preferred_sources=${JSON.stringify(values.sources)}::jsonb,
      maximum_rate_age_days=${values.maxAge},missing_rate_behavior=${values.missing},manual_override_allowed=${values.manual},manual_override_approval_required=${values.approval},auto_reverse_revaluation=${values.autoReverse},status=${status},status_changed_at=now(),status_changed_by=${input.actorId}::uuid,updated_at=now(),updated_by=${input.actorId}::uuid
      WHERE id=${id}::uuid AND tenant_id=${input.tenantId}::uuid AND company_code_id=${company.id}::uuid RETURNING id`.execute(db);
    if(!rows[0]) throw new FinanceFxError("POLICY_NOT_FOUND",404,"FX policy was not found in this company.");
    await writeFinanceSetupAudit(db,{tenantId:input.tenantId,actorId:input.actorId,companyCodeId:company.id,activityType:"finance_setup.fx_policy_saved",entityType:"fx_policy",entityId:rows[0].id,detail:{status,transactionContext:values.context,rateTypes:[values.defaultRateType,values.revaluationRateType]}});
    return {id:rows[0].id,status};
  }
  const {rows}=await sql<{id:string}>`INSERT INTO control.fx_policy(tenant_id,company_code_id,ledger_book_id,transaction_context,effective_from,effective_to,priority,default_rate_type,revaluation_rate_type,pivot_currency_code,allow_inverse,allow_triangulation,preferred_sources,maximum_rate_age_days,missing_rate_behavior,manual_override_allowed,manual_override_approval_required,auto_reverse_revaluation,status,created_by)
    VALUES(${input.tenantId}::uuid,${company.id}::uuid,${ledgerBookId}::uuid,${values.context},${effectiveFrom}::date,${effectiveTo}::date,${values.priority},${values.defaultRateType},${values.revaluationRateType},${values.pivot},${values.allowInverse},${values.allowTriangulation},${JSON.stringify(values.sources)}::jsonb,${values.maxAge},${values.missing},${values.manual},${values.approval},${values.autoReverse},${status},${input.actorId}::uuid) RETURNING id`.execute(db);
  await writeFinanceSetupAudit(db,{tenantId:input.tenantId,actorId:input.actorId,companyCodeId:company.id,activityType:"finance_setup.fx_policy_saved",entityType:"fx_policy",entityId:rows[0]!.id,detail:{status,transactionContext:values.context,rateTypes:[values.defaultRateType,values.revaluationRateType]}});
  return {id:rows[0]!.id,status};
}

function upperRateType(value:unknown):FxRateType { const v=String(value).toUpperCase() as FxRateType; if(!FX_RATE_TYPES.includes(v)) throw new FinanceFxError("INVALID_RATE_TYPE",400,`Unsupported FX rate type ${v}.`); return v; }
