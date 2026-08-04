import pkg from 'pg';
const { Client } = pkg;

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();

  const tenantRes = await client.query(
    "SELECT id FROM master.tenant WHERE realm_key='athyper' AND code='technostat'"
  );
  if (!tenantRes.rows.length) {
    console.log('tenant missing');
    await client.end();
    return;
  }
  const tid = tenantRes.rows[0].id;

  const sys = await client.query(
    "SELECT code, term_type FROM master.condition_type WHERE tenant_id='00000000-0000-0000-0000-000000000000'::uuid ORDER BY code"
  );
  console.log(`system cond types: ${sys.rowCount}`);
  console.log(sys.rows.map((r) => `${r.code}:${r.term_type}`).join(', '));

  const missing = await client.query(
    "SELECT code FROM master.tax_type WHERE tenant_id=$1 AND status='active' AND condition_type_id IS NULL ORDER BY code",
    [tid]
  );
  console.log(`missing: ${missing.rowCount}`);
  for (const row of missing.rows) {
    console.log(row.code);
  }

  const links = await client.query(
    `SELECT tt.code, COALESCE(ct.code,'<null>') AS ct_code, tt.status
     FROM master.tax_type tt
     LEFT JOIN master.condition_type ct ON ct.id = tt.condition_type_id
     WHERE tt.tenant_id=$1
       AND tt.status='active'
       AND ct.code IS NULL
     ORDER BY tt.code`,
    [tid]
  );
  console.log(`orphaned active tax types (no catalog row): ${links.rowCount}`);
  for (const row of links.rows) {
    console.log(`  ${row.code} -> condition_type_id=${row.condition_type_id ?? '<null>'}`);
  }

  const ledger = await client.query(
    `SELECT plane, pack_key, pack_version, content_sha256, manifest_sha256, source_path
       FROM public.seed_pack_ledger_v2
      WHERE plane='neon' AND pack_key LIKE '%321_tax_types%' 
      ORDER BY pack_key, pack_version`
  );
  console.log('ledger rows for 321_tax_types:', ledger.rows.length);
  for (const row of ledger.rows) {
    console.log(
      `${row.plane}/${row.pack_key}@${row.pack_version} content=${row.content_sha256} manifest=${row.manifest_sha256} source=${row.source_path}`,
    );
  }

  await client.end();
})();
