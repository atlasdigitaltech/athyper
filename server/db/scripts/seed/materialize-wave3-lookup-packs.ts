import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

type Plane = "common" | "athyper" | "neon" | "mesh";
type LedgerEntry = { sourceFile: string; domains: string[]; plane: Plane; disposition: string; targetPack: string };
type DomainRow = { code: string; name: string; description: string | null; source_schema: string; is_extensible: boolean; metadata: unknown; status: string };
type ValueRow = { code: string; name: string; domain_code: string; description: string | null; category: string | null; sort_order: number; is_system: boolean; metadata: unknown; status: string };

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const ledger = JSON.parse(await readFile(resolve(db, "seed-migration/wave3-lookup-ledger.v1.json"), "utf8")) as { entries: LedgerEntry[] };
const connectionString = process.env.WAVE3_LOOKUP_DATABASE_URL;
if (!connectionString) throw new Error("WAVE3_LOOKUP_DATABASE_URL is required");

const targetRoots: Record<Plane, string> = {
  common: resolve(db, "ddl/common/control/lookup-packs"),
  athyper: resolve(db, "ddl/planes/athyper/control/lookup-packs"),
  neon: resolve(db, "ddl/planes/neon/control/lookup-packs"),
  mesh: resolve(db, "ddl/planes/mesh/control/lookup-packs"),
};
const systemActor = "00000000-0000-0000-0000-000000000000";
const q = (value: string | null) => value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const slug = (value: string) => value.replace(/^(?:common|athyper|neon|mesh)\//, "").replace(/^standalone\//, "catalog_").replace(/[^a-z0-9]+/g, "_");

const ownership = new Map<string, { plane: Plane; pack: string; sources: string[] }>();
for (const entry of ledger.entries) {
  if (["retire", "rewrite"].includes(entry.disposition)) continue;
  for (const domain of entry.domains) {
    const current = ownership.get(domain);
    if (current && current.plane !== entry.plane) {
      throw new Error(`${domain} has conflicting planes: ${current.plane} and ${entry.plane}`);
    }
    if (current) {
      current.sources.push(entry.sourceFile);
      if (entry.targetPack.includes("/standalone/")) current.pack = entry.targetPack;
    }
    else ownership.set(domain, { plane: entry.plane, pack: entry.targetPack, sources: [entry.sourceFile] });
  }
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const domainCodes = [...ownership.keys()].sort();
  const domains = (await client.query<DomainRow>(`
    SELECT code, name, description, source_schema, is_extensible, metadata, status
      FROM control.lookup_domain WHERE code = ANY($1::text[]) ORDER BY code`, [domainCodes])).rows;
  const values = (await client.query<ValueRow>(`
    SELECT code, name, domain_code, description, category, sort_order, is_system, metadata, status
      FROM control.lookup_value
     WHERE tenant_id IS NULL AND domain_code = ANY($1::text[])
     ORDER BY domain_code, sort_order, code`, [domainCodes])).rows;
  const found = new Set(domains.map((row) => row.code));
  const missing = domainCodes.filter((code) => !found.has(code));
  if (missing.length) throw new Error(`classified domains missing from materialized registry: ${missing.join(", ")}`);

  const groups = new Map<string, { plane: Plane; pack: string; domains: DomainRow[]; values: ValueRow[]; sources: Set<string> }>();
  for (const row of domains) {
    const owner = ownership.get(row.code)!;
    const key = `${owner.plane}/${owner.pack}`;
    const group = groups.get(key) ?? { plane: owner.plane, pack: owner.pack, domains: [], values: [], sources: new Set<string>() };
    group.domains.push(row);
    owner.sources.forEach((source) => group.sources.add(source));
    groups.set(key, group);
  }
  for (const row of values) {
    const owner = ownership.get(row.domain_code)!;
    groups.get(`${owner.plane}/${owner.pack}`)!.values.push(row);
  }

  const includes: Record<Plane, string[]> = { common: [], athyper: [], neon: [], mesh: [] };
  for (const group of [...groups.values()].sort((a, b) => `${a.plane}/${a.pack}`.localeCompare(`${b.plane}/${b.pack}`))) {
    await mkdir(targetRoots[group.plane], { recursive: true });
    const fileName = `12_${slug(group.pack)}_seed.sql`;
    const dataset = `${group.plane}.control.lookup.${slug(group.pack)}`;
    const planeGuard = group.plane === "common"
      ? "NOT IN ('athyper', 'neon', 'mesh')"
      : `<> '${group.plane}'`;
    const domainTuples = group.domains.map((row) => `  (${q(row.code)}, ${q(row.name)}, ${q(row.description)}, ${q(row.source_schema)}, ${row.is_extensible}, ${json(row.metadata)}, ${q(row.status)}, '${systemActor}'::uuid)`).join(",\n");
    const valueTuples = group.values.map((row) => `  (${q(row.code)}, ${q(row.name)}, ${q(row.domain_code)}, ${q(row.description)}, ${q(row.category)}, ${row.sort_order}, ${row.is_system}, ${json(row.metadata)}, ${q(row.status)}, '${systemActor}'::uuid)`).join(",\n");
    const sql = `-- seed-contract-version: 1
-- seed-pack: ${dataset}
-- seed-pack-version: 1.0.0
-- seed-dataset: ${dataset}
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: ${group.plane}
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:${group.values.length}
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: ${[...group.sources].sort().join(",")}

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) ${planeGuard} THEN
    RAISE EXCEPTION '${dataset}: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
${domainTuples}
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

${group.values.length ? `INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
${valueTuples}
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);` : ""}

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY[${group.domains.map((row) => q(row.code)).join(", ")}])) <> ${group.values.length} THEN
    RAISE EXCEPTION '${dataset}: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY[${group.domains.map((row) => q(row.code)).join(", ")}]) AND d.id IS NULL) THEN
    RAISE EXCEPTION '${dataset}: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY[${group.domains.map((row) => q(row.code)).join(", ")}]) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION '${dataset}: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY[${group.domains.map((row) => q(row.code)).join(", ")}]) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION '${dataset}: semantic assertion failed';
  END IF;
END $assertions$;
`;
    await writeFile(resolve(targetRoots[group.plane], fileName), sql);
    includes[group.plane].push(fileName);
  }

  for (const plane of Object.keys(includes) as Plane[]) {
    const entry = `-- Wave 3 consumer-owned lookup pack entrypoint.\n${includes[plane].sort().map((file) => `\\ir lookup-packs/${file}`).join("\n")}\n`;
    const base = plane === "common" ? resolve(db, "ddl/common/control") : resolve(db, `ddl/planes/${plane}/control`);
    await writeFile(resolve(base, "12_lookup_reference_entrypoint.sql"), entry);
  }
  console.log(JSON.stringify({ domains: domains.length, values: values.length, packs: groups.size, byPlane: Object.fromEntries((Object.keys(includes) as Plane[]).map((plane) => [plane, includes[plane].length])) }, null, 2));
} finally {
  await client.end();
}
