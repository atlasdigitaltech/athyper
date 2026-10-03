/** Existing DEV only, temporary fixtures rolled back; no migration/publication. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const container = process.argv[2];
if (!container || process.argv.length !== 3)
  throw Error("Specify existing DEV container");
const info = JSON.parse(
  execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
)[0];
if (info.Config.Labels["com.docker.compose.project"] !== "athyper-dev")
  throw Error("Existing DEV required");
const ddl = readFileSync(
  fileURLToPath(
    new URL(
      "../../../ddl/planes/neon/master/38_partner_identity_read_models.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const queries = ddl
  .split("CREATE OR REPLACE VIEW ")
  .slice(1)
  .map((part) => part.split(" AS\n")[1].split(";")[0]);
const tables = [
  "master.business_partner",
  "master.business_partner_organization_identity",
  "master.person",
  "control.lookup_value",
  "master.business_partner_identifier",
  "master.business_partner_tax_registration",
];
const aliases = ["bp", "org", "person", "lookup", "identifier", "tax"];
const rewrite = (query) =>
  tables
    .map((table, index) => [table, "pg_temp." + aliases[index]])
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((q, [from, to]) => q.replaceAll(from, to), query);
const sql = `BEGIN;
SET LOCAL statement_timeout='10s';
${tables.map((table, i) => `CREATE TEMP TABLE ${aliases[i]} AS SELECT * FROM ${table} WITH NO DATA;`).join("\n")}
INSERT INTO bp(id,tenant_id,code,name,partner_category,person_id,supplier_enabled,customer_enabled) VALUES
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','BP-1','Partner','person','00000000-0000-4000-8000-000000000003',true,false);
INSERT INTO person(id,tenant_id,code,first_name,last_name) VALUES
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','PERSON-1','Permitted','Person'),
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000009','CROSS_TENANT','SECRET','SECRET');
INSERT INTO org(tenant_id,business_partner_id,legal_name,legal_form_value_id,business_type_value_id) VALUES
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Organization','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005');
INSERT INTO lookup(id,tenant_id,domain_code,name) VALUES
('00000000-0000-4000-8000-000000000004',null,'master.legal_form','Readable legal form'),
('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000009','master.business_type','CROSS_TENANT_SECRET');
INSERT INTO identifier(identifier_value) VALUES ('RAW_IDENTIFIER_SECRET'),(null);
INSERT INTO tax(registration_number) VALUES ('RAW_TAX_SECRET'),(null);
CREATE TEMP VIEW identity_read AS ${rewrite(queries[0])};
CREATE TEMP VIEW identifier_read AS ${rewrite(queries[1])};
CREATE TEMP VIEW tax_read AS ${rewrite(queries[2])};
DO $$ BEGIN
 IF (SELECT count(*) FROM identity_read)<>1 THEN RAISE EXCEPTION 'Identity join multiplied rows'; END IF;
 IF NOT EXISTS(SELECT 1 FROM identity_read WHERE person_code='PERSON-1' AND code='BP-1' AND supplier_enabled=true AND customer_enabled=false AND legal_name IS NULL) THEN RAISE EXCEPTION 'Identity aliases or category isolation failed'; END IF;
 UPDATE bp SET partner_category='organization',person_id=null;
 IF NOT EXISTS(SELECT 1 FROM identity_read WHERE legal_name='Organization' AND person_code IS NULL AND legal_form_label='Readable legal form' AND business_type_label IS NULL) THEN RAISE EXCEPTION 'Organization label isolation failed'; END IF;
 IF EXISTS(SELECT 1 FROM identity_read r WHERE to_jsonb(r)::text LIKE '%SECRET%') THEN RAISE EXCEPTION 'Cross tenant identity leaked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM identifier_read WHERE identifier_value='••••') OR NOT EXISTS(SELECT 1 FROM identifier_read WHERE identifier_value IS NULL) THEN RAISE EXCEPTION 'Identifier masking failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tax_read WHERE registration_number='••••') OR NOT EXISTS(SELECT 1 FROM tax_read WHERE registration_number IS NULL) THEN RAISE EXCEPTION 'Tax masking failed'; END IF;
 IF EXISTS(SELECT 1 FROM identifier_read r WHERE to_jsonb(r)::text LIKE '%SECRET%') OR EXISTS(SELECT 1 FROM tax_read r WHERE to_jsonb(r)::text LIKE '%SECRET%') THEN RAISE EXCEPTION 'Raw value leaked'; END IF;
END $$;
ROLLBACK;`;
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-X",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
console.log(
  "Identity aliases, tenant/category isolation and SQL masking passed. Temporary work rolled back; RLS admission/publication not exercised.",
);
