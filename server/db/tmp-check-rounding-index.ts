import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon',
});

await client.connect();

const sql = `
SELECT
  'rounding_rule' AS table_name,
  i.relname,
  idx.indisunique,
  array_agg(a.attname ORDER BY k.ord) AS cols
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class c ON c.oid = idx.indrelid
LEFT JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE c.relname = 'rounding_rule'
  AND c.relnamespace = 'control'::regnamespace
  AND c.relname = 'rounding_rule'
GROUP BY i.relname, idx.indisunique;
`;

const sql2 = `
SELECT
  c.relname AS table_name,
  i.relname,
  idx.indisunique,
  array_agg(a.attname ORDER BY k.ord) AS cols
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class c ON c.oid = idx.indrelid
LEFT JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE c.relname IN ('bank_account', 'bank_account_link')
  AND c.relnamespace = 'master'::regnamespace
GROUP BY c.relname, i.relname, idx.indisunique
ORDER BY c.relname, i.relname;
`;

const sql3 = `
SELECT
  c.relname AS table_name,
  i.relname,
  idx.indisunique,
  array_agg(a.attname ORDER BY k.ord) AS cols
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class c ON c.oid = idx.indrelid
LEFT JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE c.relname IN ('intercompany_agreement')
  AND c.relnamespace = 'document'::regnamespace
GROUP BY c.relname, i.relname, idx.indisunique
ORDER BY c.relname, i.relname;
`;

const sql4 = `
SELECT
  c.relname AS table_name,
  i.relname,
  idx.indisunique,
  array_agg(a.attname ORDER BY k.ord) AS cols
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class c ON c.oid = idx.indrelid
LEFT JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE c.relname IN ('tax_group', 'commodity_category', 'payment_method', 'commodity_group', 'rounding_rule', 'accounting_profile')
  AND c.relnamespace = 'control'::regnamespace
GROUP BY c.relname, i.relname, idx.indisunique
ORDER BY c.relname, i.relname;
`;

const sql5 = `
SELECT
  c.relname AS table_name,
  i.relname,
  idx.indisunique,
  array_agg(a.attname ORDER BY k.ord) AS cols
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class c ON c.oid = idx.indrelid
LEFT JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE c.relname IN ('accounting_profile', 'intercompany_agreement')
  AND c.relnamespace = 'master'::regnamespace
GROUP BY c.relname, i.relname, idx.indisunique
ORDER BY c.relname, i.relname;
`;

const rounding = await client.query(sql);
const idxMaster = await client.query(sql2);
const idxDocument = await client.query(sql3);
const idxControl2 = await client.query(sql4);
const idxMaster2 = await client.query(sql5);

console.log('control.rounding_rule:', rounding.rows);
console.log('master bank tables:');
console.log(idxMaster.rows);
console.log('document tables:');
console.log(idxDocument.rows);
console.log('control tables subset:');
console.log(idxControl2.rows);
console.log('master accounting/intercompany tables:');
console.log(idxMaster2.rows);

await client.end();
