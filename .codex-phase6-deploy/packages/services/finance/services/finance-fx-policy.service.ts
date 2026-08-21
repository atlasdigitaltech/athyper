import { sql, type Kysely } from "kysely";
import { loadPostingRoleCoverage } from "./posting-role.service.js";
import { writeRequiredFinanceSetupAudit } from "./finance-setup-audit.service.js";
import type { FxPolicyScopeType } from "./finance-fx-contracts.js";

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
  supersedesId: string | null;
}

export interface FxPolicyTraceCandidate { policy: FxPolicyRecord; specificity: number; selected: boolean; reason: string; }
export interface FxPolicyResolution { selected: FxPolicyRecord | null; candidates: FxPolicyTraceCandidate[]; asOfDate: string; transactionContext: string; }

export class FinanceFxError extends Error {
  constructor(public code: string, public status: number, message: string, public details?: Record<string, unknown>) { super(message); }
}

const today = () => new Date().toISOString().slice(0, 10);
const asArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
export const policyFromRow = (r: Record<string, unknown>): FxPolicyRecord => ({
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
  supersedesId: r.supersedes_id ? String(r.supersedes_id) : null,
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
  request: { fromCurrency: string; toCurrency: string; rateType: FxRateType; asOfDate: string; transactionContext: string; ledgerBookId: string | null; purpose:"transaction"|"revaluation" };
  policyResolution: FxPolicyResolution; selected: null | { rate: number; path: string[]; source: string; rateIds: string[]; effectiveDate: string; method: "identity" | "direct" | "inverse" | "triangulated" };
  attempts: Array<{ method: string; pair: string; accepted: boolean; reasonCode:string; reason: string; rateId?: string }>;
  outcome: {
    code:"FX_RATE_RESOLVED"|"FX_RATE_IDENTITY"|"FX_POLICY_MISSING"|"FX_RATE_REQUIRED"|"FX_MANUAL_OVERRIDE_REQUIRED"|"FX_MANUAL_OVERRIDE_APPROVAL_REQUIRED"|"FX_FALLBACK_EXHAUSTED";
    blocksOperation:boolean;
    manualOverrideAllowed:boolean;
    manualOverrideApprovalRequired:boolean;
  };
  runtimeDirectives: null | {
    missingRateBehavior:FxPolicyRecord["missingRateBehavior"];
    manualOverrideAllowed:boolean;
    manualOverrideApprovalRequired:boolean;
    autoReverseRevaluation:boolean;
  };
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
    const isPreferred=policy.preferredSources.length===0||policy.preferredSources.includes(c.row.source);
    if(!isPreferred&&policy.missingRateBehavior!=="fallback"){
      attempts.push({method:c.method,pair:`${from}/${to}`,accepted:false,reasonCode:"FX_SOURCE_NOT_PREFERRED",reason:`Source ${c.row.source} is not permitted by the ordered source policy.`,rateId:c.row.id});
      continue;
    }
    if (maxDate != null && new Date(`${c.row.effective_date}T00:00:00Z`).getTime() < maxDate) {
      attempts.push({ method: c.method, pair: `${from}/${to}`, accepted: false, reasonCode:"FX_RATE_STALE",reason: `Rate is older than ${policy.maximumRateAgeDays} day policy limit.`, rateId: c.row.id });
      continue;
    }
    attempts.push({ method: c.method, pair: `${from}/${to}`, accepted: true, reasonCode:isPreferred?"FX_RATE_SELECTED":"FX_FALLBACK_RATE_SELECTED",reason: `Selected ${c.row.source} by source preference and recency.`, rateId: c.row.id });
    return c;
  }
  attempts.push({ method: "lookup", pair: `${from}/${to}`, accepted: false, reasonCode:"FX_RATE_NOT_FOUND",reason: policy.allowInverse ? "No eligible direct or inverse rate." : "No eligible direct rate; inverse is disabled." });
  return null;
}

function unresolvedOutcome(policy:FxPolicyRecord|null):FxRateTrace["outcome"] {
  if(!policy)return {code:"FX_POLICY_MISSING",blocksOperation:true,manualOverrideAllowed:false,manualOverrideApprovalRequired:false};
  if(policy.missingRateBehavior==="manual_with_approval"&&policy.manualOverrideAllowed){
    return {
      code:policy.manualOverrideApprovalRequired?"FX_MANUAL_OVERRIDE_APPROVAL_REQUIRED":"FX_MANUAL_OVERRIDE_REQUIRED",
      blocksOperation:policy.manualOverrideApprovalRequired,
      manualOverrideAllowed:true,
      manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired,
    };
  }
  if(policy.missingRateBehavior==="fallback")
    return {code:"FX_FALLBACK_EXHAUSTED",blocksOperation:true,manualOverrideAllowed:policy.manualOverrideAllowed,manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired};
  return {code:"FX_RATE_REQUIRED",blocksOperation:true,manualOverrideAllowed:policy.manualOverrideAllowed,manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired};
}

const directives=(policy:FxPolicyRecord|null):FxRateTrace["runtimeDirectives"]=>policy?({
  missingRateBehavior:policy.missingRateBehavior,
  manualOverrideAllowed:policy.manualOverrideAllowed,
  manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired,
  autoReverseRevaluation:policy.autoReverseRevaluation,
}):null;

export async function traceFxResolution(db: AnyDb, input: {
  tenantId: string; companyCode: string; fromCurrency: string; toCurrency: string; rateType?: FxRateType;
  asOfDate?: string; transactionContext?: string; ledgerBookId?: string | null; purpose?:"transaction"|"revaluation";
}): Promise<FxRateTrace> {
  const company = await resolveCompanyFxContext(db, input.tenantId, input.companyCode);
  const from = input.fromCurrency.trim().toUpperCase(), to = input.toCurrency.trim().toUpperCase();
  const asOfDate = input.asOfDate ?? today(), transactionContext = input.transactionContext?.trim() || "general";
  const policyResolution = await resolveFxPolicy(db, { tenantId: input.tenantId, companyCodeId: company.id, ledgerBookId: input.ledgerBookId, transactionContext, asOfDate });
  const policy = policyResolution.selected;
  const rateType = input.rateType ?? policy?.defaultRateType ?? "SPOT";
  const purpose=input.purpose??(transactionContext==="revaluation"?"revaluation":"transaction");
  const request = { fromCurrency: from, toCurrency: to, rateType, asOfDate, transactionContext, ledgerBookId: input.ledgerBookId ?? null,purpose };
  const attempts: FxRateTrace["attempts"] = [];
  if (from === to) return { request, policyResolution, attempts, outcome:{code:"FX_RATE_IDENTITY",blocksOperation:false,manualOverrideAllowed:false,manualOverrideApprovalRequired:false},runtimeDirectives:directives(policy),selected: { rate: 1, path: [from], source: "IDENTITY", rateIds: [], effectiveDate: asOfDate, method: "identity" } };
  if (!policy) { attempts.push({ method: "policy", pair: `${from}/${to}`, accepted: false,reasonCode:"FX_POLICY_MISSING", reason: "No approved effective policy." }); return { request, policyResolution, attempts,outcome:unresolvedOutcome(null),runtimeDirectives:null, selected: null }; }
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
  if (direct) return { request, policyResolution, attempts,outcome:{code:"FX_RATE_RESOLVED",blocksOperation:false,manualOverrideAllowed:policy.manualOverrideAllowed,manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired},runtimeDirectives:directives(policy), selected: { rate: direct.value, path: [from, to], source: direct.row.source, rateIds: [direct.row.id], effectiveDate: direct.row.effective_date, method: direct.method } };
  const pivot = policy.allowTriangulation ? policy.pivotCurrencyCode : null;
  if (!pivot || pivot === from || pivot === to) {
    attempts.push({ method: "triangulated", pair: `${from}/${to}`, accepted: false,reasonCode:pivot?"FX_PIVOT_INVALID":"FX_TRIANGULATION_DISABLED", reason: pivot ? "Pivot cannot equal either requested currency." : "Triangulation is disabled or no explicit pivot is configured." });
    return { request, policyResolution, attempts,outcome:unresolvedOutcome(policy),runtimeDirectives:directives(policy), selected: null };
  }
  const first = chooseRate(rows, from, pivot, policy, asOfDate, attempts);
  const second = chooseRate(rows, pivot, to, policy, asOfDate, attempts);
  if (!first || !second) return { request, policyResolution, attempts,outcome:unresolvedOutcome(policy),runtimeDirectives:directives(policy), selected: null };
  attempts.push({ method: "triangulated", pair: `${from}/${to}`, accepted: true,reasonCode:"FX_TRIANGULATED_RATE_SELECTED", reason: `Resolved through explicit ${pivot} pivot.` });
  return { request, policyResolution, attempts,outcome:{code:"FX_RATE_RESOLVED",blocksOperation:false,manualOverrideAllowed:policy.manualOverrideAllowed,manualOverrideApprovalRequired:policy.manualOverrideApprovalRequired},runtimeDirectives:directives(policy), selected: { rate: first.value * second.value, path: [from, pivot, to], source: `${first.row.source}+${second.row.source}`, rateIds: [first.row.id, second.row.id], effectiveDate: [first.row.effective_date, second.row.effective_date].sort()[0]!, method: "triangulated" } };
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

interface FxPolicyValues {
  status:string;effectiveFrom:string;effectiveTo:string|null;context:string;priority:number;
  defaultRateType:FxRateType;revaluationRateType:FxRateType;pivot:string|null;
  allowInverse:boolean;allowTriangulation:boolean;sources:string[];maxAge:number|null;
  missing:string;manual:boolean;approval:boolean;autoReverse:boolean;
}

function parsePolicyBody(b:Record<string,unknown>):FxPolicyValues {
  const status=String(b.status??"draft");
  const defaultRateType=upperRateType(b.defaultRateType??"SPOT"),revaluationRateType=upperRateType(b.revaluationRateType??"PERIOD_END");
  const effectiveFrom=String(b.effectiveFrom??today()),effectiveTo=b.effectiveTo?String(b.effectiveTo):null;
  const pivot=b.pivotCurrencyCode?String(b.pivotCurrencyCode).trim().toUpperCase():null;
  const sources=Array.isArray(b.preferredSources)?b.preferredSources.map(x=>String(x).toUpperCase()):[];
  const values={context:String(b.transactionContext??"general").trim(),priority:Number(b.priority??100),defaultRateType,revaluationRateType,pivot,
    allowInverse:b.allowInverse!==false,allowTriangulation:Boolean(b.allowTriangulation),sources,maxAge:b.maximumRateAgeDays==null||b.maximumRateAgeDays===""?null:Number(b.maximumRateAgeDays),
    missing:String(b.missingRateBehavior??"block"),manual:Boolean(b.manualOverrideAllowed),approval:Boolean(b.manualOverrideApprovalRequired),autoReverse:true,
    status,effectiveFrom,effectiveTo};
  if(!["draft","active","inactive"].includes(status)) throw new FinanceFxError("FX_POLICY_STATUS_INVALID",400,"Policy status must be draft, active or inactive.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new FinanceFxError("FX_POLICY_EFFECTIVE_DATE_INVALID",400,"effectiveFrom must be YYYY-MM-DD.");
  if(effectiveTo&&(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)||effectiveTo<effectiveFrom)) throw new FinanceFxError("FX_POLICY_EFFECTIVE_DATE_INVALID",400,"effectiveTo must be on or after effectiveFrom.");
  if(sources.some(source=>!FX_SOURCES.includes(source as typeof FX_SOURCES[number]))||new Set(sources).size!==sources.length) throw new FinanceFxError("FX_POLICY_SOURCE_INVALID",400,"preferredSources must contain unique supported sources.");
  if(values.allowTriangulation&&!pivot) throw new FinanceFxError("FX_POLICY_PIVOT_REQUIRED",400,"An explicit pivot currency is required when triangulation is enabled.");
  if(values.approval&&!values.manual) throw new FinanceFxError("FX_POLICY_OVERRIDE_INVALID",400,"Approval cannot be required when manual override is disabled.");
  if(values.missing==="manual_with_approval"&&!values.manual) throw new FinanceFxError("FX_POLICY_OVERRIDE_INVALID",400,"manual_with_approval requires manual overrides to be enabled.");
  if(Object.prototype.hasOwnProperty.call(b,"autoReverseRevaluation")&&b.autoReverseRevaluation===false)
    throw new FinanceFxError("FX_POLICY_FIELD_NOT_RUNTIME_ENABLED",422,"Automatic revaluation reversal cannot be disabled until a governed revaluation executor is registered.",{field:"autoReverseRevaluation"});
  if(!values.context) throw new FinanceFxError("FX_POLICY_CONTEXT_INVALID",400,"transactionContext is required.");
  if(!Number.isInteger(values.priority)||values.priority<0||values.priority>1000) throw new FinanceFxError("FX_POLICY_PRIORITY_INVALID",400,"priority must be an integer from 0 to 1000.");
  if(values.maxAge!=null&&(!Number.isInteger(values.maxAge)||values.maxAge<0)) throw new FinanceFxError("FX_POLICY_RATE_AGE_INVALID",400,"maximumRateAgeDays must be a non-negative integer.");
  if(!["block","manual_with_approval","fallback"].includes(values.missing)) throw new FinanceFxError("FX_POLICY_MISSING_BEHAVIOR_INVALID",400,"Unsupported missing rate behavior.");
  return values;
}

async function resolvePolicyScope(db:AnyDb,input:{
  tenantId:string;scopeType:FxPolicyScopeType;companyCode?:string;ledgerBookId?:string|null;effectiveFrom:string;
}) {
  if(input.scopeType==="tenant")return {companyCodeId:null,ledgerBookId:null,companyCode:null};
  if(!input.companyCode)throw new FinanceFxError("FX_COMPANY_REQUIRED",400,"companyCode is required for Company and Book policies.");
  const company=await resolveCompanyFxContext(db,input.tenantId,input.companyCode);
  if(input.scopeType==="company")return {companyCodeId:company.id,ledgerBookId:null,companyCode:company.code};
  const ledgerBookId=input.ledgerBookId??null;
  if(!ledgerBookId)throw new FinanceFxError("FX_BOOK_REQUIRED",400,"ledgerBookId is required for a Book policy.");
  const {rows}=await sql<{id:string}>`
    SELECT assignment.id
      FROM master.company_code_book_assignment assignment
     WHERE assignment.tenant_id=${input.tenantId}::uuid
       AND assignment.company_code_id=${company.id}::uuid
       AND assignment.book_id=${ledgerBookId}::uuid
       AND assignment.status='active'
       AND assignment.effective_from<=${input.effectiveFrom}::date
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=${input.effectiveFrom}::date)
     LIMIT 1
  `.execute(db);
  if(!rows[0])throw new FinanceFxError("FX_BOOK_SCOPE_DENIED",404,"Ledger Book is not actively assigned to this Company on the policy effective date.");
  return {companyCodeId:company.id,ledgerBookId,companyCode:company.code};
}

export async function saveFxPolicyCommand(db:AnyDb,input:{
  tenantId:string;actorId:string;scopeType:FxPolicyScopeType;companyCode?:string;ledgerBookId?:string|null;
  policyId?:string|null;expectedVersionNo?:number|null;body:Record<string,unknown>;
}) {
  const values=parsePolicyBody(input.body);
  const scope=await resolvePolicyScope(db,{...input,effectiveFrom:values.effectiveFrom});
  if(input.scopeType!=="tenant"){
    const {rows}=await sql<{id:string}>`
      SELECT id FROM control.fx_policy
       WHERE tenant_id=${input.tenantId}::uuid AND company_code_id IS NULL AND ledger_book_id IS NULL
         AND transaction_context IN (${values.context},'general')
         AND status='active' AND effective_from<=${values.effectiveFrom}::date
         AND (effective_to IS NULL OR effective_to>=${values.effectiveFrom}::date)
       ORDER BY (transaction_context=${values.context}) DESC,priority DESC,effective_from DESC
       LIMIT 1
    `.execute(db);
    if(!rows[0])throw new FinanceFxError("FX_TENANT_DEFAULT_REQUIRED",422,"An effective Tenant FX default is required before creating Company or Book overrides.");
  }
  if(input.policyId&&(!Number.isInteger(input.expectedVersionNo)||Number(input.expectedVersionNo)<1))
    throw new FinanceFxError("FX_EXPECTED_VERSION_REQUIRED",400,"expectedVersionNo is required for policy replacement.");

  try{
    const saved=await db.transaction().execute(async trx=>{
      let versionNo=1,supersedesId:string|null=null;
      if(input.policyId){
        const {rows}=await sql<{id:string;version_no:number;status:string;effective_from:string;effective_to:string|null}>`
          SELECT id,version_no,status,effective_from::text,effective_to::text
            FROM control.fx_policy
           WHERE id=${input.policyId}::uuid AND tenant_id=${input.tenantId}::uuid
             AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid
             AND ledger_book_id IS NOT DISTINCT FROM ${scope.ledgerBookId}::uuid
           FOR UPDATE
        `.execute(trx);
        const current=rows[0];
        if(!current)throw new FinanceFxError("FX_POLICY_SCOPE_DENIED",404,"FX policy is not available in the requested Tenant, Company, and Book scope.");
        if(current.status==="superseded")throw new FinanceFxError("FX_POLICY_ALREADY_REPLACED",409,"The FX policy has already been replaced.");
        if(Number(current.version_no)!==input.expectedVersionNo)
          throw new FinanceFxError("FX_POLICY_VERSION_CONFLICT",409,"The FX policy was replaced by another command.",{expectedVersionNo:input.expectedVersionNo,currentVersionNo:Number(current.version_no)});
        versionNo=Number(current.version_no)+1;supersedesId=current.id;
        if(current.status==="active"&&values.status==="active"&&values.effectiveFrom>current.effective_from){
          if(!current.effective_to||current.effective_to>=values.effectiveFrom){
            await sql`UPDATE control.fx_policy SET effective_to=(${values.effectiveFrom}::date-1),updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${current.id}::uuid`.execute(trx);
          }
        }else{
          await sql`UPDATE control.fx_policy SET status='superseded',status_changed_at=now(),status_changed_by=${input.actorId}::uuid,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${current.id}::uuid`.execute(trx);
        }
      }
      const {rows}=await sql<{id:string}>`
        INSERT INTO control.fx_policy(
          tenant_id,company_code_id,ledger_book_id,transaction_context,effective_from,effective_to,priority,
          default_rate_type,revaluation_rate_type,pivot_currency_code,allow_inverse,allow_triangulation,
          preferred_sources,maximum_rate_age_days,missing_rate_behavior,manual_override_allowed,
          manual_override_approval_required,auto_reverse_revaluation,status,version_no,supersedes_id,created_by
        ) VALUES (
          ${input.tenantId}::uuid,${scope.companyCodeId}::uuid,${scope.ledgerBookId}::uuid,${values.context},${values.effectiveFrom}::date,${values.effectiveTo}::date,${values.priority},
          ${values.defaultRateType},${values.revaluationRateType},${values.pivot},${values.allowInverse},${values.allowTriangulation},
          ${JSON.stringify(values.sources)}::jsonb,${values.maxAge},${values.missing},${values.manual},
          ${values.approval},${values.autoReverse},${values.status},${versionNo},${supersedesId}::uuid,${input.actorId}::uuid
        ) RETURNING id
      `.execute(trx);
      const saved={id:rows[0]!.id,status:values.status,scopeType:input.scopeType,companyCodeId:scope.companyCodeId,ledgerBookId:scope.ledgerBookId,versionNo,supersedesId};
      const activityType=input.policyId?"finance_setup.fx_policy_replaced":input.scopeType==="tenant"?"finance_setup.fx_tenant_policy_created":"finance_setup.fx_policy_saved";
      await writeRequiredFinanceSetupAudit(trx,{
        tenantId:input.tenantId,actorId:input.actorId,companyCodeId:scope.companyCodeId,
        activityType,entityType:"fx_policy",entityId:saved.id,
        detail:{scopeType:input.scopeType,versionNo:saved.versionNo,supersedesId:saved.supersedesId},
      });
      return saved;
    });
    return saved;
  }catch(error){
    if((error as {code?:string}).code==="23P01")throw new FinanceFxError("FX_POLICY_EFFECTIVITY_CONFLICT",409,"Another active FX policy overlaps this scope, context, priority, and effective period.");
    throw error;
  }
}

export async function endFxPolicyCommand(db:AnyDb,input:{
  tenantId:string;actorId:string;scopeType:Exclude<FxPolicyScopeType,"tenant">;companyCode:string;
  ledgerBookId?:string|null;policyId:string;expectedVersionNo:number;endDate?:string;
}) {
  const endDate=input.endDate??today();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate))throw new FinanceFxError("FX_POLICY_END_DATE_INVALID",400,"endDate must be YYYY-MM-DD.");
  if(!Number.isInteger(input.expectedVersionNo)||input.expectedVersionNo<1)throw new FinanceFxError("FX_EXPECTED_VERSION_REQUIRED",400,"expectedVersionNo is required for policy end.");
  const scope=await resolvePolicyScope(db,{...input,effectiveFrom:endDate});
  const result=await db.transaction().execute(async trx=>{
    const {rows}=await sql<{id:string;version_no:number;status:string;effective_from:string;effective_to:string|null}>`
      SELECT id,version_no,status,effective_from::text,effective_to::text FROM control.fx_policy
       WHERE tenant_id=${input.tenantId}::uuid AND id=${input.policyId}::uuid
         AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid
         AND ledger_book_id IS NOT DISTINCT FROM ${scope.ledgerBookId}::uuid
       FOR UPDATE
    `.execute(trx);
    const current=rows[0];
    if(!current)throw new FinanceFxError("FX_POLICY_SCOPE_DENIED",404,"FX policy is not available in the requested Company and Book scope.");
    if(Number(current.version_no)!==input.expectedVersionNo)throw new FinanceFxError("FX_POLICY_VERSION_CONFLICT",409,"The FX policy changed before it could be ended.",{expectedVersionNo:input.expectedVersionNo,currentVersionNo:Number(current.version_no)});
    if(current.status!=="active")throw new FinanceFxError("FX_POLICY_NOT_ACTIVE",409,"Only an active FX policy can be ended.");
    if(endDate>current.effective_from&&(!current.effective_to||endDate<=current.effective_to)){
      await sql`UPDATE control.fx_policy SET effective_to=${endDate}::date,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${current.id}::uuid`.execute(trx);
      const result={id:current.id,status:"active",effectiveTo:endDate};
      await writeRequiredFinanceSetupAudit(trx,{
        tenantId:input.tenantId,actorId:input.actorId,companyCodeId:scope.companyCodeId,
        activityType:"finance_setup.fx_policy_ended",entityType:"fx_policy",entityId:result.id,
        detail:{scopeType:input.scopeType,effectiveTo:result.effectiveTo},
      });
      return result;
    }
    await sql`UPDATE control.fx_policy SET status='superseded',status_changed_at=now(),status_changed_by=${input.actorId}::uuid,updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${current.id}::uuid`.execute(trx);
    const result={id:current.id,status:"superseded",effectiveTo:current.effective_to};
    await writeRequiredFinanceSetupAudit(trx,{
      tenantId:input.tenantId,actorId:input.actorId,companyCodeId:scope.companyCodeId,
      activityType:"finance_setup.fx_policy_ended",entityType:"fx_policy",entityId:result.id,
      detail:{scopeType:input.scopeType,effectiveTo:result.effectiveTo},
    });
    return result;
  });
  return result;
}

export async function saveFxPolicy(db:AnyDb,input:{tenantId:string;companyCode:string;actorId:string;body:Record<string,unknown>}) {
  const policyId=typeof input.body.id==="string"?input.body.id:null;
  return saveFxPolicyCommand(db,{
    tenantId:input.tenantId,companyCode:input.companyCode,actorId:input.actorId,scopeType:input.body.ledgerBookId?"book":"company",
    ledgerBookId:input.body.ledgerBookId?String(input.body.ledgerBookId):null,policyId,
    expectedVersionNo:input.body.expectedVersionNo==null?null:Number(input.body.expectedVersionNo),body:input.body,
  });
}

function upperRateType(value:unknown):FxRateType { const v=String(value).toUpperCase() as FxRateType; if(!FX_RATE_TYPES.includes(v)) throw new FinanceFxError("INVALID_RATE_TYPE",400,`Unsupported FX rate type ${v}.`); return v; }
