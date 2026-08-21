import pg from "pg";
const { Client } = pg;
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}
const client = new Client({ connectionString });
await client.connect();

const res = await client.query(`
  SELECT domain_code, level_no, count(*)::int as cnt,
         count(*) filter (where is_leaf)::int as leaf_cnt
  FROM ref.commodity_code
  GROUP BY domain_code, level_no
  ORDER BY domain_code, level_no
`);
console.log("=== Commodity Code Counts ===");
for (const r of res.rows) {
  console.log(
    `  ${r.domain_code} level ${r.level_no}: ${r.cnt} codes (${r.leaf_cnt} leaf)`,
  );
}

const tot = await client.query(`
  SELECT domain_code, count(*)::int as total
  FROM ref.commodity_code
  GROUP BY domain_code
`);
console.log("--- Totals ---");
for (const r of tot.rows) {
  console.log(`  ${r.domain_code}: ${r.total} total`);
}

const orphans = await client.query(`
  SELECT count(*)::int as cnt
  FROM ref.commodity_code
  WHERE domain_code = 'unspsc' AND length(code) = 2
`);
console.log(`Old 2-digit UNSPSC orphans: ${orphans.rows[0].cnt}`);

const sample = await client.query(`
  SELECT c.code, c.name, c.level_no, p.code as parent_code, p.name as parent_name
  FROM ref.commodity_code c
  LEFT JOIN ref.commodity_code p ON p.domain_code = c.domain_code AND p.code = c.parent_code
  WHERE c.domain_code = 'unspsc' AND c.level_no = 4
  LIMIT 3
`);
console.log("--- Sample UNSPSC parent-child (commodity -> class) ---");
for (const r of sample.rows) {
  console.log(
    `  ${r.code} (${r.name}) -> parent: ${r.parent_code} (${r.parent_name})`,
  );
}

const sampleHs = await client.query(`
  SELECT c.code, c.name, c.level_no, p.code as parent_code, p.name as parent_name
  FROM ref.commodity_code c
  LEFT JOIN ref.commodity_code p ON p.domain_code = c.domain_code AND p.code = c.parent_code
  WHERE c.domain_code = 'hs' AND c.level_no = 3
  LIMIT 3
`);
console.log("--- Sample HS parent-child (subheading -> heading) ---");
for (const r of sampleHs.rows) {
  console.log(
    `  ${r.code} (${r.name}) -> parent: ${r.parent_code} (${r.parent_name})`,
  );
}

await client.end();
