import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_ADMIN_URL,
});

await client.connect();

const r = await client.query<{
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  column_name: string;
}>(
  `
  SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_catalog = kcu.constraint_catalog
   AND tc.constraint_schema = kcu.constraint_schema
   AND tc.constraint_name = kcu.constraint_name
  WHERE tc.table_schema = 'master'
    AND tc.table_name IN ('tenant', 'principal', 'legal_entity', 'company_code')
    AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
  ORDER BY tc.table_name, tc.constraint_name, kcu.column_name
  `
);

console.log(r.rows);

const tables = await client.query<{ table_name: string }>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'master'
    AND table_name IN ('tenant', 'principal', 'legal_entity', 'company_code')
  ORDER BY table_name
`);

console.log("tables_present:", tables.rows);

const constraints = await client.query(`
  SELECT c.contype, c.conname, t.relname AS table_name, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'master'
    AND t.relname IN ('tenant','principal','legal_entity','company_code')
  ORDER BY t.relname, c.conname
`);

console.log("pg_constraint_defs:", constraints.rows);

await client.end();
