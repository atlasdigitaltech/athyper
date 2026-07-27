import { sql, type Kysely } from "kysely";
import { loadPostingRoleCoverage } from "./posting-role.service.js";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;
type Row = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);
const nullable = (value: unknown) => String(value ?? "").trim() || null;
function isValidTimeZone(value:unknown){if(!value)return true;try{new Intl.DateTimeFormat("en-US",{timeZone:String(value)}).format();return true;}catch{return false;}}

export class FinancePaymentsError extends Error {
  constructor(public code: string, public status: number, message: string, public details?: unknown) { super(message); }
}

async function companyContext(db: AnyDb, tenantId: string, companyCode: string) {
  const { rows } = await sql<{ id: string; code: string; name: string; functional_currency: string; tenant_code: string }>`
    SELECT cc.id,cc.code,cc.name,trim(cc.functional_currency) AS functional_currency,t.code AS tenant_code
      FROM master.company_code cc JOIN master.tenant t ON t.id=cc.tenant_id
     WHERE cc.tenant_id=${tenantId}::uuid AND cc.code=${companyCode} LIMIT 1
  `.execute(db);
  if (!rows[0]) throw new FinancePaymentsError("COMPANY_NOT_FOUND", 404, `No Company ${companyCode} in the active Tenant.`);
  return rows[0];
}

export async function loadPaymentTermDefinitions(db: AnyDb, tenantId: string) {
  const [terms, clauses, tiers, calendars] = await Promise.all([
    sql<Row>`SELECT id,code,name,description,applicable_to AS "applicableTo",base_event AS "baseEvent",
      due_rule_type AS "dueRuleType",due_days AS "dueDays",due_day_of_month AS "dueDayOfMonth",grace_days AS "graceDays",
      due_date_flexibility AS "dueDateFlexibility",business_day_convention AS "businessDayConvention",
      holiday_calendar_id AS "holidayCalendarId",month_offset AS "monthOffset",term_category AS "termCategory",
      installment_count AS "installmentCount",version,supersedes_payment_term_id AS "supersedesPaymentTermId",
      is_current_version AS "isCurrentVersion",effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",status
      FROM master.payment_term WHERE tenant_id=${tenantId}::uuid ORDER BY code,is_current_version DESC,version DESC`.execute(db).then(x => x.rows),
    sql<Row>`SELECT id,payment_term_id AS "paymentTermId",clause_code AS "clauseCode",clause_type AS "clauseType",
      sequence_no AS "sequenceNo",settles_clause_code AS "settlesClauseCode",application_scope AS "applicationScope",
      basis_amount_mode AS "basisAmountMode",calc_mode AS "calcMode",default_pct::text AS "defaultPct",
      default_amount::text AS "defaultAmount",trim(currency_code) AS "currencyCode",flexibility_mode AS "flexibilityMode",
      trigger_event AS "triggerEvent",release_event AS "releaseEvent",rounding_method AS "roundingMethod",rounding_scale AS "roundingScale",is_active AS "isActive"
      FROM master.payment_term_clause WHERE tenant_id=${tenantId}::uuid ORDER BY payment_term_id,sequence_no`.execute(db).then(x => x.rows),
    sql<Row>`SELECT id,payment_term_id AS "paymentTermId",tier_no AS "tierNo",qualify_within_days AS "qualifyWithinDays",
      discount_pct::text AS "discountPct",discount_fixed::text AS "discountFixed",trim(currency_code) AS "currencyCode",
      discount_basis_mode AS "discountBasisMode",min_invoice_amount::text AS "minInvoiceAmount",is_best_only AS "isBestOnly"
      FROM master.payment_term_discount_tier WHERE tenant_id=${tenantId}::uuid ORDER BY payment_term_id,tier_no`.execute(db).then(x => x.rows),
    sql<Row>`SELECT id,code,name FROM master.holiday_calendar WHERE tenant_id=${tenantId}::uuid AND status='active' ORDER BY code`.execute(db).then(x => x.rows),
  ]);
  return { terms: terms.map(term => ({ ...term, clauses: clauses.filter(c => c.paymentTermId === term.id), discountTiers: tiers.filter(t => t.paymentTermId === term.id) })), holidayCalendars: calendars };
}

function validateTermAggregate(body: Row) {
  const code = String(body.code ?? "").trim().toUpperCase(), name = String(body.name ?? "").trim();
  if (!code || !name) throw new FinancePaymentsError("INVALID_PAYMENT_TERM", 400, "Payment Term code and name are required.");
  const dueRule = String(body.dueRuleType ?? "NET_DAYS");
  if (dueRule === "NET_DAYS" && body.dueDays == null) throw new FinancePaymentsError("DUE_DAYS_REQUIRED", 400, "Net-days terms require due days.");
  if (dueRule === "FIXED_DAY" && body.dueDayOfMonth == null) throw new FinancePaymentsError("DUE_DAY_REQUIRED", 400, "Fixed-day terms require a day of month.");
  const clauses = Array.isArray(body.clauses) ? body.clauses as Row[] : [], tiers = Array.isArray(body.discountTiers) ? body.discountTiers as Row[] : [];
  const clauseCodes = clauses.map(c => String(c.clauseCode ?? "").trim().toUpperCase());
  if (clauseCodes.some((code, index) => !code || clauseCodes.indexOf(code) !== index)) throw new FinancePaymentsError("DUPLICATE_CLAUSE", 400, "Clause codes must be populated and unique.");
  for (const [index, clause] of clauses.entries()) {
    const settles = nullable(clause.settlesClauseCode)?.toUpperCase();
    if (settles && !clauseCodes.slice(0, index).includes(settles)) throw new FinancePaymentsError("INVALID_CLAUSE_ORDER", 400, "Recovery/release clauses must settle an earlier clause.");
  }
  const tierDays = tiers.map(t => Number(t.qualifyWithinDays));
  if (tierDays.some((days, index) => !Number.isFinite(days) || days <= 0 || tierDays.indexOf(days) !== index)) throw new FinancePaymentsError("INVALID_DISCOUNT_TIERS", 400, "Discount qualification days must be positive and unique.");
  return { code, name, dueRule, clauses, tiers };
}

export async function savePaymentTerm(db: AnyDb, input: { tenantId: string; actorId: string; body: Row }) {
  const b = input.body, validated = validateTermAggregate(b), requestedStatus = String(b.status ?? "draft");
  if (validated.dueRule !== "NET_DAYS") b.dueDays = null;
  if (validated.dueRule !== "FIXED_DAY") b.dueDayOfMonth = null;
  if (!['draft','active'].includes(requestedStatus)) throw new FinancePaymentsError("INVALID_TERM_STATUS", 400, "Payment Term status must be draft or active.");
  const effectiveFrom = String(b.effectiveFrom ?? today()), effectiveTo = nullable(b.effectiveTo);
  let saved!: { id: string; version: number };
  await db.transaction().execute(async trx => {
    const termId = nullable(b.termId);
    const existing = termId ? (await sql<{ id: string; code: string; version: number; status: string; effective_from: string }>`
      SELECT id,code,version,status,effective_from::text FROM master.payment_term
       WHERE tenant_id=${input.tenantId}::uuid AND id=${termId}::uuid FOR UPDATE`.execute(trx)).rows[0] : undefined;
    if (termId && !existing) throw new FinancePaymentsError("PAYMENT_TERM_NOT_FOUND", 404, "Payment Term version not found.");
    if (existing && existing.code !== validated.code) throw new FinancePaymentsError("TERM_CODE_IMMUTABLE", 409, "Payment Term code cannot change across versions.");
    let targetId = existing?.status === 'draft' ? existing.id : null;
    let version = existing ? existing.version : Number((await sql<{ version: number }>`SELECT COALESCE(max(version),0)::int+1 AS version FROM master.payment_term WHERE tenant_id=${input.tenantId}::uuid AND code=${validated.code}`.execute(trx)).rows[0]!.version);
    if (existing && existing.status !== 'draft') {
      if (effectiveFrom <= existing.effective_from) throw new FinancePaymentsError("TERM_EFFECTIVITY_CONFLICT", 409, "A successor must start after the current version.");
      version = existing.version + 1;
      await sql`UPDATE master.payment_term SET is_current_version=false,status='superseded',effective_to=${effectiveFrom}::date-1,
        status_changed_at=now(),status_changed_by=${input.actorId}::uuid,updated_at=now(),updated_by=${input.actorId}::uuid WHERE id=${existing.id}::uuid`.execute(trx);
    }
    if (targetId) {
      await sql`UPDATE master.payment_term SET name=${validated.name},description=${nullable(b.description)},applicable_to=${String(b.applicableTo ?? 'BOTH')},
        base_event=${String(b.baseEvent ?? 'INVOICE_DATE')},due_rule_type=${validated.dueRule},due_days=${b.dueDays == null ? null : Number(b.dueDays)},
        due_day_of_month=${b.dueDayOfMonth == null ? null : Number(b.dueDayOfMonth)},grace_days=${Number(b.graceDays ?? 0)},
        due_date_flexibility=${String(b.dueDateFlexibility ?? 'FIXED')},business_day_convention=${nullable(b.businessDayConvention)},
        holiday_calendar_id=${nullable(b.holidayCalendarId)}::uuid,month_offset=${Number(b.monthOffset ?? 0)},term_category=${String(b.termCategory ?? 'standard')},
        installment_count=${b.installmentCount == null ? null : Number(b.installmentCount)},effective_from=${effectiveFrom}::date,effective_to=${effectiveTo}::date,
        status=${requestedStatus},status_changed_at=now(),status_changed_by=${input.actorId}::uuid,updated_at=now(),updated_by=${input.actorId}::uuid WHERE id=${targetId}::uuid`.execute(trx);
      await sql`DELETE FROM master.payment_term_clause WHERE tenant_id=${input.tenantId}::uuid AND payment_term_id=${targetId}::uuid`.execute(trx);
      await sql`DELETE FROM master.payment_term_discount_tier WHERE tenant_id=${input.tenantId}::uuid AND payment_term_id=${targetId}::uuid`.execute(trx);
    } else {
      const created = await sql<{ id: string }>`INSERT INTO master.payment_term(tenant_id,code,name,description,applicable_to,base_event,due_rule_type,due_days,due_day_of_month,grace_days,due_date_flexibility,business_day_convention,holiday_calendar_id,month_offset,term_category,installment_count,version,supersedes_payment_term_id,is_current_version,effective_from,effective_to,status,created_by)
        VALUES(${input.tenantId}::uuid,${validated.code},${validated.name},${nullable(b.description)},${String(b.applicableTo ?? 'BOTH')},${String(b.baseEvent ?? 'INVOICE_DATE')},${validated.dueRule},${b.dueDays == null ? null : Number(b.dueDays)},${b.dueDayOfMonth == null ? null : Number(b.dueDayOfMonth)},${Number(b.graceDays ?? 0)},${String(b.dueDateFlexibility ?? 'FIXED')},${nullable(b.businessDayConvention)},${nullable(b.holidayCalendarId)}::uuid,${Number(b.monthOffset ?? 0)},${String(b.termCategory ?? 'standard')},${b.installmentCount == null ? null : Number(b.installmentCount)},${version},${existing?.id ?? null}::uuid,true,${effectiveFrom}::date,${effectiveTo}::date,${requestedStatus},${input.actorId}::uuid) RETURNING id`.execute(trx);
      targetId = created.rows[0]!.id;
    }
    for (const [index, c] of validated.clauses.entries()) await sql`INSERT INTO master.payment_term_clause(tenant_id,payment_term_id,clause_code,clause_type,sequence_no,settles_clause_code,application_scope,basis_amount_mode,calc_mode,default_pct,default_amount,currency_code,flexibility_mode,trigger_event,release_event,rounding_method,rounding_scale,is_active,created_by)
      VALUES(${input.tenantId}::uuid,${targetId}::uuid,${String(c.clauseCode).trim().toUpperCase()},${String(c.clauseType)},${index + 1},${nullable(c.settlesClauseCode)?.toUpperCase() ?? null},${String(c.applicationScope ?? 'HEADER')},${String(c.basisAmountMode ?? 'GROSS')},${String(c.calcMode ?? 'PERCENT')},${c.defaultPct == null || c.defaultPct === '' ? null : Number(c.defaultPct)},${c.defaultAmount == null || c.defaultAmount === '' ? null : Number(c.defaultAmount)},${nullable(c.currencyCode)},${String(c.flexibilityMode ?? 'FIXED')},${nullable(c.triggerEvent)},${nullable(c.releaseEvent)},${String(c.roundingMethod ?? 'ROUND_HALF_UP')},${c.roundingScale == null ? null : Number(c.roundingScale)},${c.isActive !== false},${input.actorId}::uuid)`.execute(trx);
    for (const [index, t] of validated.tiers.entries()) await sql`INSERT INTO master.payment_term_discount_tier(tenant_id,payment_term_id,tier_no,qualify_within_days,discount_pct,discount_fixed,currency_code,discount_basis_mode,min_invoice_amount,is_best_only,created_by)
      VALUES(${input.tenantId}::uuid,${targetId}::uuid,${index + 1},${Number(t.qualifyWithinDays)},${t.discountPct == null || t.discountPct === '' ? null : Number(t.discountPct)},${t.discountFixed == null || t.discountFixed === '' ? null : Number(t.discountFixed)},${nullable(t.currencyCode)},${String(t.discountBasisMode ?? 'GROSS')},${t.minInvoiceAmount == null || t.minInvoiceAmount === '' ? null : Number(t.minInvoiceAmount)},${t.isBestOnly !== false},${input.actorId}::uuid)`.execute(trx);
    saved = { id: targetId, version };
  });
  await writeFinanceSetupAudit(db, { tenantId: input.tenantId, actorId: input.actorId, activityType: 'finance_setup.payment_term_saved', entityType: 'payment_term', entityId: saved.id, detail: { code: validated.code, version: saved.version, status: requestedStatus } });
  return saved;
}

export interface RoutingContext { paymentMethodId: string; direction: string; companyCodeId?: string | null; bankAccountLinkId?: string | null; currencyCode?: string | null; counterpartyCountryCode?: string | null; paymentNetwork?: string | null; asOfDate: string; }
function matchBinding(row: Row, ctx: RoutingContext) {
  const reasons: string[] = [];
  const checks: Array<[string, unknown, unknown]> = [['company', row.companyCodeId, ctx.companyCodeId], ['house_bank', row.bankAccountLinkId, ctx.bankAccountLinkId], ['currency', row.currencyCode, ctx.currencyCode], ['country', row.counterpartyCountryCode, ctx.counterpartyCountryCode], ['network', row.paymentNetwork, ctx.paymentNetwork]];
  if (row.direction !== ctx.direction && row.direction !== 'BOTH') reasons.push('direction_mismatch');
  for (const [label, expected, actual] of checks) if (expected != null && expected !== actual) reasons.push(`${label}_mismatch`);
  const specificity = [row.companyCodeId, row.bankAccountLinkId, row.currencyCode, row.counterpartyCountryCode, row.paymentNetwork].map(Boolean).concat(row.direction === ctx.direction).map(Number);
  return { matched: reasons.length === 0, reasons, specificity };
}
const compareSpecificity = (a: number[], b: number[]) => { for (let i=0;i<a.length;i++) if (a[i] !== b[i]) return b[i]! - a[i]!; return 0; };
export function rankPaymentInterfaceCandidates(rows:Array<Record<string,unknown>>,context:RoutingContext){
  const candidates:Array<Row&{matched:boolean;reasons:string[];specificity:number[]}>=rows.map(row=>({...row,...matchBinding(row,context)}));
  candidates.sort((a,b)=>compareSpecificity(a.specificity,b.specificity)||Number(b.priority)-Number(a.priority)||String(a.bindingId).localeCompare(String(b.bindingId)));
  const matched=candidates.filter(c=>c.matched),first=matched[0],top=first?matched.filter(c=>compareSpecificity(c.specificity,first.specificity)===0&&Number(c.priority)===Number(first.priority)):[];
  return {candidates,found:top.length===1,ambiguous:top.length>1,winner:top.length===1?top[0]:null};
}

export async function tracePaymentInterfaceRouting(db: AnyDb, tenantId: string, context: RoutingContext) {
  const rows = (await sql<Row>`SELECT b.id AS "bindingId",b.company_code_id AS "companyCodeId",b.payment_method_id AS "paymentMethodId",
    b.bank_account_link_id AS "bankAccountLinkId",trim(b.currency_code) AS "currencyCode",b.direction,
    b.counterparty_country_code AS "counterpartyCountryCode",b.payment_network AS "paymentNetwork",b.priority,
    b.bank_interface_profile_id AS "profileId",p.code AS "profileCode",p.name AS "profileName",p.interface_type AS "interfaceType",
    p.file_format_code AS "fileFormatCode",p.provider_code AS "providerCode"
    FROM control.payment_method_interface_binding b JOIN control.bank_interface_profile p ON p.tenant_id=b.tenant_id AND p.id=b.bank_interface_profile_id AND p.status='active'
    WHERE b.tenant_id=${tenantId}::uuid AND b.payment_method_id=${context.paymentMethodId}::uuid AND b.status='active'
      AND b.effective_from<=${context.asOfDate}::date AND (b.effective_until IS NULL OR b.effective_until>${context.asOfDate}::date)`.execute(db)).rows;
  const ranked=rankPaymentInterfaceCandidates(rows,context);
  return {request:context,...ranked,explanation:ranked.ambiguous?'Equal-specificity and equal-priority bindings matched.':!ranked.found?'No active binding matched.':'Resolved by specificity, then priority.'};
}

async function houseBanks(db: AnyDb, tenantId: string, companyId: string, asOfDate: string) {
  return (await sql<Row>`SELECT l.id AS "bankAccountLinkId",a.name AS "accountName",a.account_last4 AS "accountLast4",trim(a.currency_code) AS "currencyCode",a.is_verified AS "isVerified",a.status AS "accountStatus",
    h.account_nickname AS "nickname",h.usage_type AS "usageType",h.is_disbursement_enabled AS "isDisbursementEnabled",h.is_collection_enabled AS "isCollectionEnabled",
    h.is_manual_payment_allowed AS "isManualAllowed",h.is_payment_file_allowed AS "isFileAllowed",h.status,h.gl_account_id AS "glAccountId"
    FROM master.bank_account_link l JOIN master.bank_account a ON a.tenant_id=l.tenant_id AND a.id=l.bank_account_id
    JOIN master.bank_account_house_config h ON h.tenant_id=l.tenant_id AND h.bank_account_link_id=l.id
    WHERE l.tenant_id=${tenantId}::uuid AND l.owner_type='company_code' AND l.owner_id=${companyId}::uuid
      AND l.effective_from<=${asOfDate}::date AND (l.effective_until IS NULL OR l.effective_until>${asOfDate}::date) ORDER BY h.priority DESC,l.id`.execute(db)).rows;
}

export async function loadCompanyPaymentsSetup(db: AnyDb, tenantId: string, companyCode: string, asOfDate=today()) {
  const company = await companyContext(db,tenantId,companyCode);
  const [methods,policies,bindings,interfaces,settlements,banks,books,posting] = await Promise.all([
    sql<Row>`SELECT id,code,name,direction,instrument_mode AS "instrumentMode",requires_bank_account AS "requiresBankAccount",requires_bank_interface AS "requiresBankInterface",supports_file_generation AS "supportsFile",supports_real_time_api AS "supportsApi",status FROM master.payment_method WHERE tenant_id=${tenantId}::uuid AND status='active' ORDER BY sort_order,code`.execute(db).then(x=>x.rows),
    sql<Row>`SELECT id,payment_method_id AS "paymentMethodId",direction,trim(currency_code) AS "currencyCode",bank_account_link_id AS "bankAccountLinkId",min_amount::text AS "minAmount",max_amount::text AS "maxAmount",is_default AS "isDefault",is_manual_allowed AS "isManualAllowed",is_file_allowed AS "isFileAllowed",is_api_allowed AS "isApiAllowed",requires_dual_approval AS "requiresDualApproval",cutoff_time_local::text AS "cutoffTimeLocal",timezone_code AS "timezoneCode",priority,effective_from::text AS "effectiveFrom",effective_until::text AS "effectiveUntil",status FROM control.payment_method_company_policy WHERE tenant_id=${tenantId}::uuid AND company_code_id=${company.id}::uuid ORDER BY direction,currency_code NULLS FIRST,priority DESC`.execute(db).then(x=>x.rows),
    sql<Row>`SELECT id AS "bindingId",company_code_id AS "companyCodeId",payment_method_id AS "paymentMethodId",bank_account_link_id AS "bankAccountLinkId",trim(currency_code) AS "currencyCode",direction,counterparty_country_code AS "counterpartyCountryCode",payment_network AS "paymentNetwork",bank_interface_profile_id AS "profileId",priority,effective_from::text AS "effectiveFrom",effective_until::text AS "effectiveUntil",status FROM control.payment_method_interface_binding WHERE tenant_id=${tenantId}::uuid AND (company_code_id IS NULL OR company_code_id=${company.id}::uuid) ORDER BY priority DESC`.execute(db).then(x=>x.rows),
    sql<Row>`SELECT id,code,name,interface_type AS "interfaceType",payment_network AS "paymentNetwork",file_format_code AS "fileFormatCode",provider_code AS "providerCode",status FROM control.bank_interface_profile WHERE tenant_id=${tenantId}::uuid AND status='active' ORDER BY code`.execute(db).then(x=>x.rows),
    sql<Row>`SELECT id,payment_method_id AS "paymentMethodId",direction,book_code AS "bookCode",clearing_posting_role_code AS "clearingRole",settlement_posting_role_code AS "settlementRole",bank_fee_posting_role_code AS "bankFeeRole",discount_posting_role_code AS "discountRole",fx_gain_posting_role_code AS "fxGainRole",fx_loss_posting_role_code AS "fxLossRole",chargeback_posting_role_code AS "chargebackRole",suspense_posting_role_code AS "suspenseRole",effective_from::text AS "effectiveFrom",effective_until::text AS "effectiveUntil",status FROM control.payment_settlement_rule WHERE tenant_id=${tenantId}::uuid AND company_code_id=${company.id}::uuid ORDER BY payment_method_id,direction,book_code`.execute(db).then(x=>x.rows),
    houseBanks(db,tenantId,company.id,asOfDate),
    sql<Row>`SELECT b.id,b.code,b.name,b.is_primary AS "isPrimary" FROM master.company_code_book_assignment a JOIN master.ledger_book b ON b.tenant_id=a.tenant_id AND b.id=a.book_id WHERE a.tenant_id=${tenantId}::uuid AND a.company_code_id=${company.id}::uuid AND a.status='active' AND b.status='active' ORDER BY b.is_primary DESC,b.code`.execute(db).then(x=>x.rows),
    loadPostingRoleCoverage(db,tenantId,companyCode,asOfDate),
  ]);
  const activePolicies = policies.filter(p => p.status==='active' && String(p.effectiveFrom)<=asOfDate && (!p.effectiveUntil || String(p.effectiveUntil)>asOfDate));
  const diagnostics: Array<{code:string;severity:string;message:string;policyId?:unknown}> = [];
  for (const policy of activePolicies) {
    const method=methods.find(m=>m.id===policy.paymentMethodId), bank=banks.find(b=>b.bankAccountLinkId===policy.bankAccountLinkId);
    if (method?.requiresBankAccount && !policy.bankAccountLinkId) diagnostics.push({code:'HOUSE_BANK_REQUIRED',severity:'error',message:'Payment method requires a preferred House Bank.',policyId:policy.id});
    if (policy.bankAccountLinkId && (!bank || !bank.isVerified || bank.accountStatus!=='active' || bank.status!=='active' || (policy.currencyCode && bank.currencyCode!==policy.currencyCode) || (policy.direction==='OUTBOUND' && !bank.isDisbursementEnabled) || (policy.direction==='INBOUND' && !bank.isCollectionEnabled))) diagnostics.push({code:'HOUSE_BANK_INELIGIBLE',severity:'error',message:'Preferred House Bank is not eligible for this currency/direction.',policyId:policy.id});
    if (bank && ((policy.isManualAllowed && !bank.isManualAllowed) || (policy.isFileAllowed && !bank.isFileAllowed))) diagnostics.push({code:'HOUSE_BANK_CHANNEL_UNSUPPORTED',severity:'error',message:'Preferred House Bank does not support every enabled execution channel.',policyId:policy.id});
    if (!isValidTimeZone(policy.timezoneCode)) diagnostics.push({code:'INVALID_CUTOFF_TIMEZONE',severity:'error',message:'Cutoff timezone is not a valid IANA timezone.',policyId:policy.id});
    if (method?.requiresBankInterface && !bindings.some(b=>b.paymentMethodId===policy.paymentMethodId && (b.companyCodeId==null || b.companyCodeId===company.id) && (b.direction===policy.direction || b.direction==='BOTH') && (b.currencyCode==null || b.currencyCode===policy.currencyCode) && (b.bankAccountLinkId==null || b.bankAccountLinkId===policy.bankAccountLinkId) && b.status==='active' && String(b.effectiveFrom)<=asOfDate && (!b.effectiveUntil || String(b.effectiveUntil)>asOfDate) && interfaces.some(i=>i.id===b.profileId))) diagnostics.push({code:'INTERFACE_MISSING',severity:'error',message:'No effective active interface binding covers this method, currency, direction and House Bank.',policyId:policy.id});
    if (!settlements.some(s=>s.paymentMethodId===policy.paymentMethodId && (s.direction===policy.direction || s.direction==='BOTH') && s.status==='active' && String(s.effectiveFrom)<=asOfDate && (!s.effectiveUntil || String(s.effectiveUntil)>asOfDate) && books.some(b=>b.code===s.bookCode))) diagnostics.push({code:'SETTLEMENT_RULE_MISSING',severity:'error',message:'No effective settlement rule covers this method, direction and an assigned Book.',policyId:policy.id});
  }
  for (const direction of ['OUTBOUND','INBOUND']) if (!activePolicies.some(p=>p.direction===direction || p.direction==='BOTH')) diagnostics.push({code:'DIRECTION_UNCONFIGURED',severity:'warning',message:`No active ${direction.toLowerCase()} payment policy exists.`});
  const paymentRoleCells=posting.rows.flatMap(r=>r.cells.filter(c=>c.requiredBy.includes('payment_policy')).map(c=>({roleCode:r.roleCode,...c})));
  if (paymentRoleCells.some(c=>c.status!=='resolved')) diagnostics.push({code:'POSTING_ROLE_COVERAGE_INCOMPLETE',severity:'error',message:'One or more settlement posting roles do not resolve to a postable GL account.'});
  return { company:{id:company.id,code:company.code,name:company.name,tenantCode:company.tenant_code,functionalCurrency:company.functional_currency},asOfDate,methods,policies,bindings,interfaces,settlements,houseBanks:banks,books,postingRoleCoverage:paymentRoleCells,diagnostics,readiness:{eligibleMethods:activePolicies.length>0,houseBanksReady:!diagnostics.some(d=>d.code.startsWith('HOUSE_BANK')),interfacesReady:!diagnostics.some(d=>d.code==='INTERFACE_MISSING'),settlementReady:!diagnostics.some(d=>d.code==='SETTLEMENT_RULE_MISSING'),postingRolesReady:!diagnostics.some(d=>d.code==='POSTING_ROLE_COVERAGE_INCOMPLETE'),ready:!diagnostics.some(d=>d.severity==='error')} };
}

export async function savePaymentPolicy(db: AnyDb,input:{tenantId:string;companyCode:string;actorId:string;body:Row}) {
  const company=await companyContext(db,input.tenantId,input.companyCode),b=input.body,id=nullable(b.id);
  if(!b.paymentMethodId)throw new FinancePaymentsError('PAYMENT_METHOD_REQUIRED',400,'Payment method is required.');
  if(Boolean(b.cutoffTimeLocal)!==Boolean(b.timezoneCode))throw new FinancePaymentsError('CUTOFF_TIMEZONE_PAIR_REQUIRED',400,'Cutoff time and timezone must be supplied together.');
  if(!isValidTimeZone(b.timezoneCode))throw new FinancePaymentsError('INVALID_CUTOFF_TIMEZONE',400,'Cutoff timezone must be a valid IANA timezone.');
  const common={direction:String(b.direction??'OUTBOUND'),currency:nullable(b.currencyCode)?.toUpperCase(),bank:nullable(b.bankAccountLinkId),from:String(b.effectiveFrom??today()),until:nullable(b.effectiveUntil),status:String(b.status??'active')};
  const conflict=await sql<{id:string}>`SELECT id FROM control.payment_method_company_policy WHERE tenant_id=${input.tenantId}::uuid AND company_code_id=${company.id}::uuid AND payment_method_id=${String(b.paymentMethodId)}::uuid AND direction=${common.direction} AND COALESCE(currency_code,'***'::character(3))=COALESCE(${common.currency},'***'::character(3)) AND status='active' AND (${id}::uuid IS NULL OR id<>${id}::uuid) AND daterange(effective_from,COALESCE(effective_until,'9999-12-31'::date),'[)')&&daterange(${common.from}::date,COALESCE(${common.until}::date,'9999-12-31'::date),'[)') LIMIT 1`.execute(db);
  if(conflict.rows[0])throw new FinancePaymentsError('PAYMENT_POLICY_CONFLICT',409,'An active policy already covers this method, direction, currency, and effective period.');
  if(Boolean(b.isDefault)){const defaultConflict=await sql<{id:string}>`SELECT id FROM control.payment_method_company_policy WHERE tenant_id=${input.tenantId}::uuid AND company_code_id=${company.id}::uuid AND direction=${common.direction} AND COALESCE(currency_code,'***'::character(3))=COALESCE(${common.currency},'***'::character(3)) AND is_default=true AND status='active' AND (${id}::uuid IS NULL OR id<>${id}::uuid) AND daterange(effective_from,COALESCE(effective_until,'9999-12-31'::date),'[)')&&daterange(${common.from}::date,COALESCE(${common.until}::date,'9999-12-31'::date),'[)') LIMIT 1`.execute(db);if(defaultConflict.rows[0])throw new FinancePaymentsError('PAYMENT_DEFAULT_CONFLICT',409,'Another active default covers this direction, currency, and effective period.');}
  const {rows}=id?await sql<{id:string}>`UPDATE control.payment_method_company_policy SET payment_method_id=${String(b.paymentMethodId)}::uuid,direction=${common.direction},currency_code=${common.currency},bank_account_link_id=${common.bank}::uuid,min_amount=${b.minAmount==null||b.minAmount===''?null:Number(b.minAmount)},max_amount=${b.maxAmount==null||b.maxAmount===''?null:Number(b.maxAmount)},is_default=${Boolean(b.isDefault)},is_manual_allowed=${b.isManualAllowed!==false},is_file_allowed=${b.isFileAllowed!==false},is_api_allowed=${Boolean(b.isApiAllowed)},requires_dual_approval=${Boolean(b.requiresDualApproval)},cutoff_time_local=${nullable(b.cutoffTimeLocal)}::time,timezone_code=${nullable(b.timezoneCode)},priority=${Number(b.priority??0)},effective_from=${common.from}::date,effective_until=${common.until}::date,status=${common.status},updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND company_code_id=${company.id}::uuid AND id=${id}::uuid RETURNING id`.execute(db):await sql<{id:string}>`INSERT INTO control.payment_method_company_policy(tenant_id,company_code_id,payment_method_id,direction,currency_code,bank_account_link_id,min_amount,max_amount,is_default,is_manual_allowed,is_file_allowed,is_api_allowed,requires_dual_approval,cutoff_time_local,timezone_code,priority,effective_from,effective_until,status,created_by) VALUES(${input.tenantId}::uuid,${company.id}::uuid,${String(b.paymentMethodId)}::uuid,${common.direction},${common.currency},${common.bank}::uuid,${b.minAmount==null||b.minAmount===''?null:Number(b.minAmount)},${b.maxAmount==null||b.maxAmount===''?null:Number(b.maxAmount)},${Boolean(b.isDefault)},${b.isManualAllowed!==false},${b.isFileAllowed!==false},${Boolean(b.isApiAllowed)},${Boolean(b.requiresDualApproval)},${nullable(b.cutoffTimeLocal)}::time,${nullable(b.timezoneCode)},${Number(b.priority??0)},${common.from}::date,${common.until}::date,${common.status},${input.actorId}::uuid) RETURNING id`.execute(db);
  if(!rows[0])throw new FinancePaymentsError('PAYMENT_POLICY_NOT_FOUND',404,'Payment policy not found.');await writeFinanceSetupAudit(db,{tenantId:input.tenantId,companyCodeId:company.id,actorId:input.actorId,activityType:'finance_setup.payment_policy_saved',entityType:'payment_method_company_policy',entityId:rows[0].id,detail:{paymentMethodId:b.paymentMethodId,direction:common.direction,currency:common.currency}});return rows[0];
}

export async function saveInterfaceBinding(db:AnyDb,input:{tenantId:string;companyCode:string;actorId:string;body:Row}){
  const company=await companyContext(db,input.tenantId,input.companyCode),b=input.body,id=nullable(b.id);if(!b.paymentMethodId||!b.profileId)throw new FinancePaymentsError('INVALID_INTERFACE_BINDING',400,'Payment method and interface profile are required.');
  const scope=b.tenantDefault?null:company.id,from=String(b.effectiveFrom??today()),until=nullable(b.effectiveUntil);
  const {rows}=id?await sql<{id:string}>`UPDATE control.payment_method_interface_binding SET company_code_id=${scope}::uuid,payment_method_id=${String(b.paymentMethodId)}::uuid,bank_account_link_id=${nullable(b.bankAccountLinkId)}::uuid,currency_code=${nullable(b.currencyCode)?.toUpperCase()??null},direction=${String(b.direction??'OUTBOUND')},counterparty_country_code=${nullable(b.counterpartyCountryCode)?.toUpperCase()??null},payment_network=${nullable(b.paymentNetwork)},bank_interface_profile_id=${String(b.profileId)}::uuid,priority=${Number(b.priority??0)},effective_from=${from}::date,effective_until=${until}::date,status=${String(b.status??'active')},updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${id}::uuid AND (company_code_id IS NULL OR company_code_id=${company.id}::uuid) RETURNING id`.execute(db):await sql<{id:string}>`INSERT INTO control.payment_method_interface_binding(tenant_id,company_code_id,payment_method_id,bank_account_link_id,currency_code,direction,counterparty_country_code,payment_network,bank_interface_profile_id,priority,effective_from,effective_until,status,created_by)VALUES(${input.tenantId}::uuid,${scope}::uuid,${String(b.paymentMethodId)}::uuid,${nullable(b.bankAccountLinkId)}::uuid,${nullable(b.currencyCode)?.toUpperCase()??null},${String(b.direction??'OUTBOUND')},${nullable(b.counterpartyCountryCode)?.toUpperCase()??null},${nullable(b.paymentNetwork)},${String(b.profileId)}::uuid,${Number(b.priority??0)},${from}::date,${until}::date,${String(b.status??'active')},${input.actorId}::uuid)RETURNING id`.execute(db);
  if(!rows[0])throw new FinancePaymentsError('INTERFACE_BINDING_NOT_FOUND',404,'Interface binding not found.');await writeFinanceSetupAudit(db,{tenantId:input.tenantId,companyCodeId:company.id,actorId:input.actorId,activityType:'finance_setup.interface_binding_saved',entityType:'payment_method_interface_binding',entityId:rows[0].id,detail:{paymentMethodId:b.paymentMethodId,profileId:b.profileId}});return rows[0];
}

export async function saveSettlementRule(db:AnyDb,input:{tenantId:string;companyCode:string;actorId:string;body:Row}){
  const company=await companyContext(db,input.tenantId,input.companyCode),b=input.body,id=nullable(b.id);if(!b.paymentMethodId||!b.bookCode||!b.clearingRole||!b.settlementRole)throw new FinancePaymentsError('INVALID_SETTLEMENT_RULE',400,'Method, Book, clearing role and settlement role are required.');
  const roles=['clearingRole','settlementRole','bankFeeRole','discountRole','fxGainRole','fxLossRole','chargebackRole','suspenseRole'] as const,from=String(b.effectiveFrom??today()),until=nullable(b.effectiveUntil),values=roles.map(k=>nullable(b[k])?.toLowerCase()??null);
  const {rows}=id?await sql<{id:string}>`UPDATE control.payment_settlement_rule SET payment_method_id=${String(b.paymentMethodId)}::uuid,direction=${String(b.direction??'OUTBOUND')},book_code=${String(b.bookCode)},clearing_posting_role_code=${values[0]},settlement_posting_role_code=${values[1]},bank_fee_posting_role_code=${values[2]},discount_posting_role_code=${values[3]},fx_gain_posting_role_code=${values[4]},fx_loss_posting_role_code=${values[5]},chargeback_posting_role_code=${values[6]},suspense_posting_role_code=${values[7]},effective_from=${from}::date,effective_until=${until}::date,status=${String(b.status??'active')},updated_at=now(),updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND company_code_id=${company.id}::uuid AND id=${id}::uuid RETURNING id`.execute(db):await sql<{id:string}>`INSERT INTO control.payment_settlement_rule(tenant_id,company_code_id,payment_method_id,direction,book_code,clearing_posting_role_code,settlement_posting_role_code,bank_fee_posting_role_code,discount_posting_role_code,fx_gain_posting_role_code,fx_loss_posting_role_code,chargeback_posting_role_code,suspense_posting_role_code,effective_from,effective_until,status,created_by)VALUES(${input.tenantId}::uuid,${company.id}::uuid,${String(b.paymentMethodId)}::uuid,${String(b.direction??'OUTBOUND')},${String(b.bookCode)},${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${from}::date,${until}::date,${String(b.status??'active')},${input.actorId}::uuid)RETURNING id`.execute(db);
  if(!rows[0])throw new FinancePaymentsError('SETTLEMENT_RULE_NOT_FOUND',404,'Settlement rule not found.');await writeFinanceSetupAudit(db,{tenantId:input.tenantId,companyCodeId:company.id,actorId:input.actorId,activityType:'finance_setup.settlement_rule_saved',entityType:'payment_settlement_rule',entityId:rows[0].id,detail:{paymentMethodId:b.paymentMethodId,bookCode:b.bookCode,direction:b.direction}});return rows[0];
}
