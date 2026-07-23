import { sql, type Kysely } from "kysely";
import { FX_RATE_TYPES, FX_SOURCES, FinanceFxError, type FxRateType } from "./finance-fx-policy.service.js";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;
export interface FxRateImportRow { fromCurrency?: unknown; toCurrency?: unknown; rate?: unknown; rateType?: unknown; effectiveDate?: unknown; effectiveTime?: unknown; source?: unknown; sourceReference?: unknown; }
export interface ValidatedFxRateRow { rowNumber:number; valid:boolean; errors:string[]; warnings:string[]; normalized:{ fromCurrency:string; toCurrency:string; rate:number; rateType:FxRateType; effectiveDate:string; effectiveTime:string|null; source:string; sourceReference:string|null }; }

const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME=/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const upper=(v:unknown)=>String(v??"").trim().toUpperCase();

export async function validateFxRateImport(db:AnyDb,tenantId:string,rows:FxRateImportRow[]) {
  if(!Array.isArray(rows)||rows.length===0) throw new FinanceFxError("EMPTY_IMPORT",400,"At least one rate row is required.");
  if(rows.length>5000) throw new FinanceFxError("IMPORT_TOO_LARGE",413,"A single import is limited to 5,000 rows.");
  const currencyCodes=[...new Set(rows.flatMap(r=>[upper(r.fromCurrency),upper(r.toCurrency)]).filter(Boolean))];
  const {rows:currencyRows}=await sql<{code:string}>`SELECT code FROM shared.currency WHERE code=ANY(${currencyCodes}::character(3)[]) AND is_active=true`.execute(db);
  const known=new Set(currencyRows.map(r=>r.code.trim()));
  const seen=new Set<string>();
  const validated:ValidatedFxRateRow[]=rows.map((raw,index)=>{
    const fromCurrency=upper(raw.fromCurrency),toCurrency=upper(raw.toCurrency),rate=Number(raw.rate);
    const rateType=(upper(raw.rateType)||"SPOT") as FxRateType,effectiveDate=String(raw.effectiveDate??"").trim();
    const effectiveTime=String(raw.effectiveTime??"").trim()||null,source=upper(raw.source)||"MANUAL";
    const sourceReference=String(raw.sourceReference??"").trim()||null,errors:string[]=[],warnings:string[]=[];
    if(!known.has(fromCurrency)) errors.push(`Unknown from currency ${fromCurrency||"(blank)"}.`);
    if(!known.has(toCurrency)) errors.push(`Unknown to currency ${toCurrency||"(blank)"}.`);
    if(fromCurrency===toCurrency&&fromCurrency) errors.push("From and to currencies must differ.");
    if(!Number.isFinite(rate)||rate<=0) errors.push("Rate must be a positive number.");
    if(!FX_RATE_TYPES.includes(rateType)) errors.push(`Unsupported rate type ${rateType}.`);
    if(!ISO_DATE.test(effectiveDate)||Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`))) errors.push("Effective date must be YYYY-MM-DD.");
    if(effectiveTime&&!ISO_TIME.test(effectiveTime)) errors.push("Effective time must be HH:mm or HH:mm:ss.");
    if(!FX_SOURCES.includes(source as typeof FX_SOURCES[number])) errors.push(`Unsupported source ${source}.`);
    if(source==="MANUAL"&&!sourceReference) warnings.push("Manual rates should include a source reference.");
    const key=[fromCurrency,toCurrency,rateType,effectiveDate,effectiveTime??"",source].join("|");
    if(seen.has(key)) errors.push("Duplicate key within import payload."); else seen.add(key);
    return {rowNumber:index+1,valid:errors.length===0,errors,warnings,normalized:{fromCurrency,toCurrency,rate,rateType,effectiveDate,effectiveTime,source,sourceReference}};
  });
  return {rows:validated,summary:{total:validated.length,valid:validated.filter(r=>r.valid).length,invalid:validated.filter(r=>!r.valid).length,warnings:validated.reduce((n,r)=>n+r.warnings.length,0)}};
}

export async function importFxRates(db:AnyDb,tenantId:string,actorId:string,rows:FxRateImportRow[]) {
  const validation=await validateFxRateImport(db,tenantId,rows);
  if(validation.summary.invalid) throw new FinanceFxError("IMPORT_VALIDATION_FAILED",422,"Rate import contains invalid rows.",{validation});
  const ids:string[]=[];
  await db.transaction().execute(async trx=>{
    for(const {normalized:r} of validation.rows){
      await sql`UPDATE master.fx_rate SET status='superseded',status_changed_at=now(),status_changed_by=${actorId}::uuid,updated_at=now(),updated_by=${actorId}::uuid
        WHERE tenant_id=${tenantId}::uuid AND status='active' AND from_currency=${r.fromCurrency} AND to_currency=${r.toCurrency}
          AND rate_type=${r.rateType} AND effective_date=${r.effectiveDate}::date AND source=${r.source}
          AND effective_time IS NOT DISTINCT FROM ${r.effectiveTime}::time`.execute(trx);
      const {rows:inserted}=await sql<{id:string}>`INSERT INTO master.fx_rate(tenant_id,from_currency,to_currency,rate,rate_type,effective_date,effective_time,source,source_reference,metadata,status,created_by)
        VALUES(${tenantId}::uuid,${r.fromCurrency},${r.toCurrency},${r.rate},${r.rateType},${r.effectiveDate}::date,${r.effectiveTime}::time,${r.source},${r.sourceReference},${JSON.stringify({imported:true})}::jsonb,'active',${actorId}::uuid) RETURNING id`.execute(trx);
      if(inserted[0]) ids.push(inserted[0].id);
    }
  });
  await writeFinanceSetupAudit(db,{tenantId,actorId,activityType:"finance_setup.fx_rates_imported",entityType:"fx_rate_import",entityId:null,detail:{imported:ids.length,rateIds:ids}});
  return {imported:ids.length,rateIds:ids,validation};
}

export async function listFxRates(db:AnyDb,tenantId:string,input:{fromCurrency?:string;toCurrency?:string;rateType?:string;limit?:number}) {
  const limit=Math.min(Math.max(input.limit??100,1),500);
  const {rows}=await sql<Record<string,unknown>>`SELECT id,trim(from_currency) AS "fromCurrency",trim(to_currency) AS "toCurrency",rate::text AS rate,
    rate_type AS "rateType",effective_date::text AS "effectiveDate",effective_time::text AS "effectiveTime",source,source_reference AS "sourceReference",status,created_at AS "createdAt"
    FROM master.fx_rate WHERE tenant_id=${tenantId}::uuid
      AND (${input.fromCurrency??null}::text IS NULL OR from_currency=${input.fromCurrency?.toUpperCase()??null})
      AND (${input.toCurrency??null}::text IS NULL OR to_currency=${input.toCurrency?.toUpperCase()??null})
      AND (${input.rateType??null}::text IS NULL OR rate_type=${input.rateType?.toUpperCase()??null})
    ORDER BY effective_date DESC,effective_time DESC NULLS LAST,created_at DESC LIMIT ${limit}`.execute(db);
  return {rates:rows,limit};
}
