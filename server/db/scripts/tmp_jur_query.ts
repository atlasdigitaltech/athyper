import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });

async function main() {
  await client.connect();
  const tenantRes = await client.query(
    `SELECT id, code FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat'`
  );
  const tenantId = tenantRes.rows[0]?.id;
  const res = await client.query(
    `SELECT id, code, name, country_code FROM master.tax_jurisdiction WHERE tenant_id=$1 ORDER BY code`,
    [tenantId]
  );
  console.log(res.rows);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
