import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_ADMIN_URL,
});

await client.connect();

const cols = await client.query(
  `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'seed_pack_ledger_v2' ORDER BY ordinal_position`,
);
console.log("seed_pack_ledger_v2 columns:", cols.rows.map((r) => r.column_name));

const tbls = await client.query(
  "SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE tablename = $1 ORDER BY schemaname, tablename",
  ["seed_pack_ledger_v2"],
);
console.log("seed_pack_ledger tables:", tbls.rows);

const rows = await client.query(
  `SELECT * FROM public.seed_pack_ledger_v2 WHERE pack_key LIKE $1 ORDER BY pack_key`,
  ["neon/tenants/020_technostat%"],
);
console.log("000_tenant candidates:", rows.rows);

const rowsExact = await client.query(
  `SELECT * FROM public.seed_pack_ledger_v2 WHERE pack_key = $1`,
  ["neon/tenants/020_technostat/000_tenant"],
);
console.log("exact candidate:", rowsExact.rows);

const rowsByLegacy = await client.query(
  `SELECT * FROM public.seed_pack_ledger_v2 WHERE pack_key = $1 AND pack_version = $2`,
  ["neon/tenants/020_technostat/000_tenant", "legacy-v1"],
);
console.log("legacy-v1 candidate:", rowsByLegacy.rows);

const rowBySource = await client.query(
  `SELECT * FROM public.seed_pack_ledger_v2 WHERE source_path LIKE $1 ORDER BY pack_key`,
  ["%020_technostat/000_tenant%"],
);
console.log("source_path match:", rowBySource.rows);

if (process.argv.includes("--clear-000")) {
  try {
    await client.query("ALTER TABLE public.seed_pack_ledger_v2 DISABLE TRIGGER trg_seed_pack_ledger_v2_immutable");
    const clear = await client.query(
      `DELETE FROM public.seed_pack_ledger_v2 WHERE plane = $1 AND pack_key = $2 AND pack_version = $3`,
      ["neon", "tenants/020_technostat/000_tenant", "legacy-v1"],
    );
    console.log("cleared 000_tenant legacy-v1 ledger row:", clear.rowCount);
  } finally {
    await client.query("ALTER TABLE public.seed_pack_ledger_v2 ENABLE TRIGGER trg_seed_pack_ledger_v2_immutable");
  }
}

await client.end();
