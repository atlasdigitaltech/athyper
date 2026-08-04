import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();

const targets = [
  'master.tenant',
  'master.principal',
  'master.legal_entity',
  'master.company_code',
  'master.chart_of_account',
  'master.gl_account',
  'master.site',
  'master.warehouse',
  'master.fiscal_period',
  'master.ledger_book',
  'master.company_code_book_assignment',
  'master.tax_jurisdiction',
  'master.tax_type',
  'master.payment_term_discount_tier',
  'master.asset_class',
  'master.principal_profile',
  'master.principal_identity_binding',
  'master.auth_group',
  'master.auth_group_role',
  'master.auth_group_member',
  'control.lookup_value',
  'master.tax_rate_schedule',
  'master.payment_term',
  'master.company_code_book_assignment',
  'master.company_code_chart_assignment',
  'master.cost_center',
  'master.profit_center',
  'master.tax_jurisdiction',
  'control.tax_rate_schedule',
  'master.payment_method',
  'master.auth_role',
];

for (const target of targets) {
  const [schema, table] = target.split('.');
  const rows = (
    await client.query(
      `
      SELECT i.indexrelid::regclass AS index_name,
             i.indisunique,
             pg_get_indexdef(i.indexrelid) AS index_def
      FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = $1
        AND cl.relname = $2
    `,
      [schema, table],
    )
  ).rows;
  console.log(`\n${target}`);
  for (const r of rows) {
    console.log(`  ${r.indisunique ? '[U]' : '[N]'} ${r.index_name} -> ${r.index_def}`);
  }
}

await client.end();
