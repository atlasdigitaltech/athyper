#!/usr/bin/env tsx
/**
 * Read-only Neon report for Finance FX tenant defaults.
 *
 * Default output contains only active tenants without an effective tenant
 * default. Pass --all to include configured tenants and --csv for CSV output.
 * No policy or rate rows are changed.
 */
import postgres from "postgres";

interface FxTenantMigrationRow {
  tenant_id:string;
  tenant_code:string;
  tenant_name:string;
  migration_state:"configured"|"scheduled_only"|"missing_default";
  active_company_count:number;
  exposed_company_count:number;
  effective_tenant_default_count:number;
  scheduled_tenant_default_count:number;
  policy_history_count:number;
  rate_history_count:number;
  active_rate_count:number;
  recommended_action:string;
}

const databaseUrl=process.env["DATABASE_URL"];
if(!databaseUrl){
  console.error("ERROR: DATABASE_URL is required");
  process.exit(2);
}

const includeAll=process.argv.includes("--all");
const csv=process.argv.includes("--csv");

async function main():Promise<void> {
  const db=postgres(databaseUrl!,{max:1,onnotice:()=>undefined});
  try{
    const rows=await db<FxTenantMigrationRow[]>`
      WITH company_counts AS (
        SELECT company.tenant_id,
               count(*) FILTER (WHERE company.status='active')::int AS active_company_count,
               count(*) FILTER (
                 WHERE company.status='active' AND (
                   EXISTS (
                     SELECT 1
                       FROM master.company_code_book_assignment assignment
                       JOIN master.ledger_book book
                         ON book.tenant_id=assignment.tenant_id AND book.id=assignment.book_id
                      WHERE assignment.tenant_id=company.tenant_id
                        AND assignment.company_code_id=company.id
                        AND assignment.status='active' AND book.status='active'
                        AND trim(COALESCE(assignment.override_currency_code,book.base_currency_code))
                            <> trim(company.functional_currency)
                        AND assignment.effective_from<=CURRENT_DATE
                        AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
                   )
                   OR EXISTS (
                     SELECT 1
                       FROM master.bank_account_link link
                       JOIN master.bank_account account
                         ON account.tenant_id=link.tenant_id AND account.id=link.bank_account_id
                      WHERE link.tenant_id=company.tenant_id
                        AND ((link.owner_type='company_code' AND link.owner_id=company.id)
                          OR link.company_code_id=company.id)
                        AND account.status='active'
                        AND trim(account.currency_code)<>trim(company.functional_currency)
                        AND link.effective_from<=CURRENT_DATE
                        AND (link.effective_until IS NULL OR link.effective_until>CURRENT_DATE)
                   )
                   OR EXISTS (
                     SELECT 1
                       FROM control.payment_method_company_policy policy
                      WHERE policy.tenant_id=company.tenant_id
                        AND policy.company_code_id=company.id
                        AND policy.status='active'
                        AND policy.currency_code IS NOT NULL
                        AND trim(policy.currency_code)<>trim(company.functional_currency)
                        AND policy.effective_from<=CURRENT_DATE
                        AND (policy.effective_until IS NULL OR policy.effective_until>CURRENT_DATE)
                   )
                 )
               )::int AS exposed_company_count
          FROM master.company_code company
         GROUP BY company.tenant_id
      ), policy_counts AS (
        SELECT policy.tenant_id,
               count(*) FILTER (
                 WHERE policy.company_code_id IS NULL AND policy.ledger_book_id IS NULL
                   AND policy.status='active' AND policy.effective_from<=CURRENT_DATE
                   AND (policy.effective_to IS NULL OR policy.effective_to>=CURRENT_DATE)
               )::int AS effective_tenant_default_count,
               count(*) FILTER (
                 WHERE policy.company_code_id IS NULL AND policy.ledger_book_id IS NULL
                   AND policy.status='active' AND policy.effective_from>CURRENT_DATE
               )::int AS scheduled_tenant_default_count,
               count(*)::int AS policy_history_count
          FROM control.fx_policy policy
         GROUP BY policy.tenant_id
      ), rate_counts AS (
        SELECT rate.tenant_id,
               count(*)::int AS rate_history_count,
               count(*) FILTER (WHERE rate.status='active')::int AS active_rate_count
          FROM master.fx_rate rate
         GROUP BY rate.tenant_id
      )
      SELECT tenant.id::text AS tenant_id,tenant.code AS tenant_code,tenant.name AS tenant_name,
             CASE
               WHEN COALESCE(policy.effective_tenant_default_count,0)>0 THEN 'configured'
               WHEN COALESCE(policy.scheduled_tenant_default_count,0)>0 THEN 'scheduled_only'
               ELSE 'missing_default'
             END AS migration_state,
             COALESCE(company.active_company_count,0) AS active_company_count,
             COALESCE(company.exposed_company_count,0) AS exposed_company_count,
             COALESCE(policy.effective_tenant_default_count,0) AS effective_tenant_default_count,
             COALESCE(policy.scheduled_tenant_default_count,0) AS scheduled_tenant_default_count,
             COALESCE(policy.policy_history_count,0) AS policy_history_count,
             COALESCE(rate.rate_history_count,0) AS rate_history_count,
             COALESCE(rate.active_rate_count,0) AS active_rate_count,
             CASE
               WHEN COALESCE(policy.effective_tenant_default_count,0)>0 THEN 'none'
               WHEN COALESCE(policy.scheduled_tenant_default_count,0)>0 THEN 'review scheduled effective date'
               WHEN COALESCE(company.exposed_company_count,0)>0 THEN 'configure tenant FX default before certification'
               ELSE 'configure before first foreign-currency exposure'
             END AS recommended_action
        FROM master.tenant tenant
        LEFT JOIN company_counts company ON company.tenant_id=tenant.id
        LEFT JOIN policy_counts policy ON policy.tenant_id=tenant.id
        LEFT JOIN rate_counts rate ON rate.tenant_id=tenant.id
       WHERE tenant.status='active'
         AND tenant.id<>'00000000-0000-0000-0000-000000000000'::uuid
       ORDER BY
         (COALESCE(policy.effective_tenant_default_count,0)=0) DESC,
         COALESCE(company.exposed_company_count,0) DESC,
         tenant.code
    `;
    const report=includeAll?rows:rows.filter(row=>row.migration_state!=="configured");
    if(csv)process.stdout.write(toCsv(report));
    else process.stdout.write(`${JSON.stringify({generatedAt:new Date().toISOString(),readOnly:true,rows:report},null,2)}\n`);
    console.error(`Finance FX migration report: ${report.length} row(s); ${rows.filter(row=>row.migration_state!=="configured").length} tenant(s) require review.`);
  }finally{
    await db.end({timeout:5});
  }
}

function toCsv(rows:FxTenantMigrationRow[]):string {
  const columns:Array<keyof FxTenantMigrationRow>=[
    "tenant_id","tenant_code","tenant_name","migration_state","active_company_count",
    "exposed_company_count","effective_tenant_default_count","scheduled_tenant_default_count",
    "policy_history_count","rate_history_count","active_rate_count","recommended_action",
  ];
  return `${columns.join(",")}\n${rows.map(row=>columns.map(column=>cell(row[column])).join(",")).join("\n")}\n`;
}
function cell(value:unknown):string {
  const text=String(value??"");
  return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}

main().catch(error=>{
  console.error("Finance FX migration report failed:",error);
  process.exit(1);
});
