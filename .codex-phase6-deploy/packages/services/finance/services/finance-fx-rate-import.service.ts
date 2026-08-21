import { sql, type Kysely } from "kysely";
import { FX_RATE_TYPES, FX_SOURCES, FinanceFxError, type FxRateType } from "./finance-fx-policy.service.js";
import { writeRequiredFinanceSetupAudit } from "./finance-setup-audit.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;
export interface FxRateImportRow { fromCurrency?: unknown; toCurrency?: unknown; rate?: unknown; rateType?: unknown; effectiveDate?: unknown; effectiveTime?: unknown; source?: unknown; sourceReference?: unknown; }
export type FxRateImportMode="create"|"replace_by_natural_key";
export interface ValidatedFxRateRow { rowNumber:number; valid:boolean; errors:string[]; warnings:string[]; action:"create"|"replace"|null; normalized:{ fromCurrency:string; toCurrency:string; rate:number; rateType:FxRateType; effectiveDate:string; effectiveTime:string|null; source:string; sourceReference:string|null }; }
type NormalizedFxRate = ValidatedFxRateRow["normalized"];
interface ReplacedFxRate { id:string; versionNo:number; supersedesId:string|null; }

const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME=/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const upper=(v:unknown)=>String(v??"").trim().toUpperCase();

export async function validateFxRateImport(
  db:AnyDb,
  tenantId:string,
  rows:FxRateImportRow[],
  options:{mode?:FxRateImportMode}={},
) {
  if(!Array.isArray(rows)||rows.length===0) throw new FinanceFxError("FX_RATE_IMPORT_EMPTY",400,"At least one rate row is required.");
  if(rows.length>5000) throw new FinanceFxError("FX_RATE_IMPORT_TOO_LARGE",413,"A single import is limited to 5,000 rows.");
  const mode=options.mode??"replace_by_natural_key";
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
    return {rowNumber:index+1,valid:errors.length===0,errors,warnings,action:null,normalized:{fromCurrency,toCurrency,rate,rateType,effectiveDate,effectiveTime,source,sourceReference}};
  });
  const validRows=validated.filter(row=>row.valid);
  if(validRows.length){
    const fromCurrencies=[...new Set(validRows.map(row=>row.normalized.fromCurrency))];
    const toCurrencies=[...new Set(validRows.map(row=>row.normalized.toCurrency))];
    const {rows:existing}=await sql<{from_currency:string;to_currency:string;rate_type:string;effective_date:string;effective_time:string|null;source:string}>`
      SELECT trim(from_currency) AS from_currency,trim(to_currency) AS to_currency,rate_type,
             effective_date::text,effective_time::text,source
        FROM master.fx_rate
       WHERE tenant_id=${tenantId}::uuid AND status='active'
         AND from_currency=ANY(${fromCurrencies}::character(3)[])
         AND to_currency=ANY(${toCurrencies}::character(3)[])
    `.execute(db);
    const existingKeys=new Set(existing.map(row=>[
      row.from_currency.trim(),row.to_currency.trim(),row.rate_type,row.effective_date,row.effective_time??"",row.source,
    ].join("|")));
    for(const row of validRows){
      const normalized=row.normalized;
      const key=[
        normalized.fromCurrency,normalized.toCurrency,normalized.rateType,normalized.effectiveDate,
        normalized.effectiveTime??"",normalized.source,
      ].join("|");
      const exists=existingKeys.has(key);
      if(exists&&mode==="create"){
        row.errors.push("An active rate already exists for this natural key.");
        row.valid=false;
        row.action=null;
      }else if(exists&&!normalized.sourceReference){
        row.errors.push("A replacement source reference or reason is required.");
        row.valid=false;
        row.action=null;
      }else{
        row.action=exists?"replace":"create";
        if(exists)row.warnings.push("The active natural-key match will be replaced with a successor version.");
      }
    }
  }
  return {
    mode,
    rows:validated,
    summary:{
      total:validated.length,
      valid:validated.filter(r=>r.valid).length,
      invalid:validated.filter(r=>!r.valid).length,
      warnings:validated.reduce((n,r)=>n+r.warnings.length,0),
      creates:validated.filter(r=>r.valid&&r.action==="create").length,
      replacements:validated.filter(r=>r.valid&&r.action==="replace").length,
    },
  };
}

export async function importFxRates(
  db:AnyDb,
  tenantId:string,
  actorId:string,
  rows:FxRateImportRow[],
  mode:FxRateImportMode="replace_by_natural_key",
) {
  const validation=await validateFxRateImport(db,tenantId,rows,{mode});
  if(validation.summary.invalid) throw new FinanceFxError("FX_RATE_IMPORT_VALIDATION_FAILED",422,"Rate import contains invalid rows.",{validation});
  const replacements=await db.transaction().execute(async trx=>{
    const posted:ReplacedFxRate[]=[];
    for(const {normalized:r} of validation.rows){
      posted.push(await replaceValidatedFxRate(trx,tenantId,actorId,r,null,{imported:true,mode},mode==="create"?"create":"upsert"));
    }
    const ids=posted.map(r=>r.id);
    await writeRequiredFinanceSetupAudit(trx,{tenantId,actorId,activityType:"finance_setup.fx_rates_imported",entityType:"fx_rate_import",entityId:null,detail:{imported:ids.length,rateIds:ids,replacements:posted}});
    return posted;
  });
  const ids=replacements.map(r=>r.id);
  return {
    imported:ids.length,
    created:replacements.filter(item=>item.supersedesId==null).length,
    replaced:replacements.filter(item=>item.supersedesId!=null).length,
    rateIds:ids,
    replacements,
    validation,
  };
}

export async function replaceFxRate(db:AnyDb,input:{
  tenantId:string; actorId:string; rateId:string; row:FxRateImportRow; expectedVersionNo?:number;
}) {
  const validation=await validateFxRateImport(db,input.tenantId,[input.row]);
  const validated=validation.rows[0]!;
  if(!validated.valid) throw new FinanceFxError("FX_RATE_VALIDATION_FAILED",422,"The replacement rate is invalid.",{validation});
  if(!validated.normalized.sourceReference)throw new FinanceFxError("FX_RATE_REPLACEMENT_REASON_REQUIRED",422,"A replacement source reference or reason is required.");
  if(!Number.isInteger(input.expectedVersionNo)||Number(input.expectedVersionNo)<1)throw new FinanceFxError("FX_EXPECTED_VERSION_REQUIRED",400,"expectedVersionNo is required for rate replacement.");
  const replacement=await db.transaction().execute(async trx=>{
    const {rows}=await sql<{version_no:number}>`
      SELECT version_no
        FROM master.fx_rate
       WHERE tenant_id=${input.tenantId}::uuid AND id=${input.rateId}::uuid AND status='active'
       FOR UPDATE
    `.execute(trx);
    const current=rows[0];
    if(!current) throw new FinanceFxError("FX_RATE_NOT_FOUND",404,"The active FX rate was not found.");
    if(input.expectedVersionNo!=null&&Number(current.version_no)!==input.expectedVersionNo)
      throw new FinanceFxError("FX_RATE_VERSION_CONFLICT",409,"The FX rate was replaced by another command.",{expectedVersionNo:input.expectedVersionNo,currentVersionNo:Number(current.version_no)});
    const replacement=await replaceValidatedFxRate(trx,input.tenantId,input.actorId,validated.normalized,input.rateId,{replacedByCommand:true},"replace");
    await writeRequiredFinanceSetupAudit(trx,{tenantId:input.tenantId,actorId:input.actorId,activityType:"finance_setup.fx_rate_replaced",entityType:"fx_rate",entityId:replacement.id,detail:{...replacement}});
    return replacement;
  });
  return replacement;
}

export async function addFxRate(db:AnyDb,input:{tenantId:string;actorId:string;row:FxRateImportRow}) {
  const validation=await validateFxRateImport(db,input.tenantId,[input.row]);
  const validated=validation.rows[0]!;
  if(!validated.valid)throw new FinanceFxError("FX_RATE_VALIDATION_FAILED",422,"The FX rate is invalid.",{validation});
  const created=await db.transaction().execute(async trx=>{
    const result=await replaceValidatedFxRate(trx,input.tenantId,input.actorId,validated.normalized,null,{createdByCommand:true},"create");
    await writeRequiredFinanceSetupAudit(trx,{tenantId:input.tenantId,actorId:input.actorId,activityType:"finance_setup.fx_rate_created",entityType:"fx_rate",entityId:result.id,detail:{...result}});
    return result;
  });
  return created;
}

export async function listFxRates(db:AnyDb,tenantId:string,input:{fromCurrency?:string;toCurrency?:string;rateType?:string;limit?:number}) {
  const limit=Math.min(Math.max(input.limit??100,1),500);
  const {rows}=await sql<Record<string,unknown>>`SELECT id,trim(from_currency) AS "fromCurrency",trim(to_currency) AS "toCurrency",rate::text AS rate,
    rate_type AS "rateType",effective_date::text AS "effectiveDate",effective_time::text AS "effectiveTime",source,source_reference AS "sourceReference",
    version_no AS "versionNo",supersedes_id AS "supersedesId",status,created_at AS "createdAt"
    FROM master.fx_rate WHERE tenant_id=${tenantId}::uuid
      AND (${input.fromCurrency??null}::text IS NULL OR from_currency=${input.fromCurrency?.toUpperCase()??null})
      AND (${input.toCurrency??null}::text IS NULL OR to_currency=${input.toCurrency?.toUpperCase()??null})
      AND (${input.rateType??null}::text IS NULL OR rate_type=${input.rateType?.toUpperCase()??null})
    ORDER BY effective_date DESC,effective_time DESC NULLS LAST,created_at DESC LIMIT ${limit}`.execute(db);
  return {rates:rows,limit};
}

export async function getFxRate(db:AnyDb,tenantId:string,rateId:string) {
  const {rows}=await sql<Record<string,unknown>>`
    SELECT rate.id,trim(rate.from_currency) AS "fromCurrency",trim(rate.to_currency) AS "toCurrency",
           rate.rate::text AS rate,rate.inverse_rate::text AS "inverseRate",rate.rate_type AS "rateType",
           rate.effective_date::text AS "effectiveDate",rate.effective_time::text AS "effectiveTime",
           rate.source,rate.source_reference AS "sourceReference",rate.version_no AS "versionNo",
           rate.supersedes_id AS "supersedesId",rate.status,rate.status_changed_at AS "statusChangedAt",
           rate.created_at AS "createdAt",rate.created_by AS "createdBy",
           successor.id AS "successorId",successor.version_no AS "successorVersionNo"
      FROM master.fx_rate rate
      LEFT JOIN LATERAL (
        SELECT id,version_no FROM master.fx_rate successor
         WHERE successor.tenant_id=rate.tenant_id AND successor.supersedes_id=rate.id
         ORDER BY successor.version_no DESC LIMIT 1
      ) successor ON true
     WHERE rate.tenant_id=${tenantId}::uuid AND rate.id=${rateId}::uuid
     LIMIT 1
  `.execute(db);
  if(!rows[0])throw new FinanceFxError("FX_RATE_NOT_FOUND",404,"The FX rate was not found.");
  return {rate:rows[0]};
}

export async function exportFxRates(db:AnyDb,tenantId:string) {
  const {rows}=await sql<Record<string,unknown>>`
    SELECT trim(from_currency) AS "fromCurrency",trim(to_currency) AS "toCurrency",rate::text AS rate,
           rate_type AS "rateType",effective_date::text AS "effectiveDate",
           COALESCE(effective_time::text,'') AS "effectiveTime",source,
           COALESCE(source_reference,'') AS "sourceReference",version_no AS "versionNo",
           COALESCE(supersedes_id::text,'') AS "supersedesId",status
      FROM master.fx_rate
     WHERE tenant_id=${tenantId}::uuid
     ORDER BY effective_date DESC,effective_time DESC NULLS LAST,created_at DESC
  `.execute(db);
  const columns=["fromCurrency","toCurrency","rate","rateType","effectiveDate","effectiveTime","source","sourceReference","versionNo","supersedesId","status"];
  const csv=[
    columns.join(","),
    ...rows.map(row=>columns.map(column=>csvCell(row[column])).join(",")),
  ].join("\r\n");
  return {
    fileName:`fx-rates-${new Date().toISOString().slice(0,10)}.csv`,
    contentType:"text/csv;charset=utf-8",
    rowCount:rows.length,
    content:csv,
  };
}

function csvCell(value:unknown):string {
  const text=String(value??"");
  return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}

async function replaceValidatedFxRate(
  db:AnyDb,tenantId:string,actorId:string,r:NormalizedFxRate,expectedRateId:string|null,metadata:Record<string,unknown>,
  mode:"create"|"replace"|"upsert",
):Promise<ReplacedFxRate> {
  const naturalKey=[tenantId,r.fromCurrency,r.toCurrency,r.rateType,r.effectiveDate,r.effectiveTime??"",r.source].join("|");
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${naturalKey},0))`.execute(db);
  const {rows:currentRows}=await sql<{id:string;version_no:number}>`
    SELECT id,version_no
      FROM master.fx_rate
     WHERE tenant_id=${tenantId}::uuid AND status='active'
       AND from_currency=${r.fromCurrency} AND to_currency=${r.toCurrency}
       AND rate_type=${r.rateType} AND effective_date=${r.effectiveDate}::date
       AND effective_time IS NOT DISTINCT FROM ${r.effectiveTime}::time
       AND source=${r.source}
     FOR UPDATE
  `.execute(db);
  const current=currentRows[0]??null;
  if(mode==="create"&&current)
    throw new FinanceFxError("FX_RATE_ALREADY_EXISTS",409,"An active FX rate already exists for this pair, type, effective instant, and source.",{rateId:current.id,currentVersionNo:Number(current.version_no)});
  if(expectedRateId&&current?.id!==expectedRateId)
    throw new FinanceFxError("FX_RATE_KEY_MISMATCH",409,"Replacement values must retain the active rate's pair, type, effective instant and source.");

  if(current){
    await sql`
      UPDATE master.fx_rate
         SET status='superseded',status_changed_at=now(),status_changed_by=${actorId}::uuid,
             updated_at=now(),updated_by=${actorId}::uuid
       WHERE tenant_id=${tenantId}::uuid AND id=${current.id}::uuid
    `.execute(db);
  } else if(expectedRateId||mode==="replace") {
    throw new FinanceFxError("FX_RATE_NOT_FOUND",404,"The active FX rate was not found.");
  }

  const versionNo=current?Number(current.version_no)+1:1;
  const {rows:inserted}=await sql<{id:string}>`
    INSERT INTO master.fx_rate(
      tenant_id,from_currency,to_currency,rate,rate_type,effective_date,effective_time,
      source,source_reference,version_no,supersedes_id,metadata,status,created_by
    ) VALUES (
      ${tenantId}::uuid,${r.fromCurrency},${r.toCurrency},${r.rate},${r.rateType},${r.effectiveDate}::date,${r.effectiveTime}::time,
      ${r.source},${r.sourceReference},${versionNo},${current?.id??null}::uuid,${JSON.stringify(metadata)}::jsonb,'active',${actorId}::uuid
    )
    RETURNING id
  `.execute(db);
  return {id:inserted[0]!.id,versionNo,supersedesId:current?.id??null};
}
