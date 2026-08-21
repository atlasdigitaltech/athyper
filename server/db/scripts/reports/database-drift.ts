import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

type CatalogRow = { object_key: string; definition: string };
type Drift = {
  missing_in_live: string[];
  extra_in_live: string[];
  changed: Array<{ object_key: string; target: string; live: string }>;
};

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split("=");
    return [key, rest.join("=") || "true"];
  }),
);

if (args.has("--help")) {
  console.log([
    "Usage: tsx scripts/reports/database-drift.ts \\",
    "  --target-url=<clean desired-state database> \\",
    "  --live-url=<current live database> [--plane=neon|mesh|athyper] \\",
    "  [--schemas=document,audit,event,ledger,control,master] [--strict] [--json=<path>]",
    "",
    "Environment fallbacks: TARGET_DATABASE_URL and LIVE_DATABASE_URL.",
    "The command is read-only against both databases.",
  ].join("\n"));
  process.exit(0);
}

const targetUrl = args.get("--target-url") ?? process.env.TARGET_DATABASE_URL;
const liveUrl = args.get("--live-url") ?? process.env.LIVE_DATABASE_URL;
if (!targetUrl || !liveUrl) {
  throw new Error("--target-url and --live-url (or their environment fallbacks) are required");
}

const plane = args.get("--plane") ?? "unspecified";
const schemas = (args.get("--schemas") ?? "document,audit,event,ledger,control,master")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const strict = args.has("--strict");

const target = postgres(targetUrl, { max: 1, prepare: false });
const live = postgres(liveUrl, { max: 1, prepare: false });

const catalogQueries: Record<string, string> = {
  columns: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, a.attname) AS object_key,
           concat_ws('|',
             format_type(a.atttypid, a.atttypmod),
             CASE WHEN a.attnotnull THEN 'not_null' ELSE 'nullable' END,
             coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
             a.attidentity, a.attgenerated,
             coalesce(coll.collname, '')
           ) AS definition
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      LEFT JOIN pg_collation coll ON coll.oid = a.attcollation AND a.attcollation <> 0
     WHERE n.nspname = ANY($1::text[])
       AND c.relkind IN ('r','p','v','m')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  domains: `
    SELECT format('%I.%I', n.nspname, t.typname) AS object_key,
           concat_ws('|', format_type(t.typbasetype, t.typtypmod),
             t.typnotnull::text, coalesce(pg_get_expr(t.typdefaultbin, 0), ''),
             coalesce(string_agg(pg_get_constraintdef(con.oid, true), ';' ORDER BY con.conname), '')
           ) AS definition
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      LEFT JOIN pg_constraint con ON con.contypid = t.oid
     WHERE n.nspname = ANY($1::text[]) AND t.typtype = 'd'
     GROUP BY n.nspname, t.typname, t.typbasetype, t.typtypmod,
              t.typnotnull, t.typdefaultbin
     ORDER BY 1`,
  constraints: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, con.conname) AS object_key,
           concat_ws('|', con.contype, con.convalidated::text,
             con.condeferrable::text, con.condeferred::text,
             pg_get_constraintdef(con.oid, true)) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  indexes: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, i.relname) AS object_key,
           pg_get_indexdef(i.oid) AS definition
      FROM pg_index x
      JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  rls: `
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           concat_ws('|', c.relrowsecurity::text, c.relforcerowsecurity::text) AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p')
     ORDER BY 1`,
  policies: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, p.polname) AS object_key,
           concat_ws('|', p.polcmd, p.polpermissive::text,
             array_to_string(ARRAY(
               SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles) ORDER BY rolname
             ), ','),
             coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
             coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
           ) AS definition
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  functions: `
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
             pg_get_function_identity_arguments(p.oid)) AS object_key,
           concat_ws('|', pg_get_function_result(p.oid), l.lanname,
             p.prosecdef::text, p.provolatile, p.proparallel,
             coalesce(array_to_string(p.proconfig, ','), ''),
             pg_get_functiondef(p.oid)) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = ANY($1::text[])
     ORDER BY 1`,
  triggers: `
    SELECT format('%I.%I.%I', n.nspname, c.relname, t.tgname) AS object_key,
           concat_ws('|', t.tgenabled, pg_get_triggerdef(t.oid, true)) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND NOT t.tgisinternal
     ORDER BY 1`,
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function capture(
  sql: postgres.Sql,
  query: string,
): Promise<Map<string, string>> {
  const rows = await sql.unsafe<CatalogRow[]>(query, [schemas]);
  return new Map(rows.map((row) => [row.object_key, normalize(row.definition)]));
}

function compare(targetMap: Map<string, string>, liveMap: Map<string, string>): Drift {
  const missing_in_live = [...targetMap.keys()].filter((key) => !liveMap.has(key)).sort();
  const extra_in_live = [...liveMap.keys()].filter((key) => !targetMap.has(key)).sort();
  const changed = [...targetMap.entries()]
    .filter(([key, value]) => liveMap.has(key) && liveMap.get(key) !== value)
    .map(([object_key, targetDefinition]) => ({
      object_key,
      target: targetDefinition,
      live: liveMap.get(object_key)!,
    }))
    .sort((a, b) => a.object_key.localeCompare(b.object_key));
  return { missing_in_live, extra_in_live, changed };
}

const skippedDirectories = new Set([
  ".git", "node_modules", "dist", "build", "coverage", ".next", "generated",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"]);

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (sourceExtensions.has(extname(entry.name))) files.push(path);
    }
  }
  await visit(root);
  return files;
}

async function runtimeReferences(targetRelations: Set<string>) {
  const roots = ["server/packages", "packages", "apps"]
    .map((path) => resolve(repoRoot, path));
  const references = new Map<string, Set<string>>();
  const deprecated = new Set([
    "log.audit_log",
    "document.command_log",
    "document.doc_attachment",
    "document.invoice_tax_snapshot",
    "document.party_advance_balance",
    "document.render_job",
  ]);
  const sqlReference = /\b(?:from|join|insert\s+into|update|delete\s+from)\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;

  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const source = (await readFile(file, "utf8")).replaceAll('"', "");
      for (const match of source.matchAll(sqlReference)) {
        const relation = match[1]!.toLowerCase();
        const locations = references.get(relation) ?? new Set<string>();
        locations.add(relative(repoRoot, file).replaceAll("\\", "/"));
        references.set(relation, locations);
      }
    }
  }

  return [...references.entries()]
    .map(([relation, locations]) => ({
      relation,
      locations: [...locations].sort(),
      exists_in_target: targetRelations.has(relation),
      deprecated: deprecated.has(relation),
    }))
    .filter((item) => item.deprecated || !item.exists_in_target)
    .sort((a, b) => a.relation.localeCompare(b.relation));
}

try {
  const drift: Record<string, Drift> = {};
  for (const [category, query] of Object.entries(catalogQueries)) {
    const [targetState, liveState] = await Promise.all([
      capture(target, query),
      capture(live, query),
    ]);
    drift[category] = compare(targetState, liveState);
  }

  const relationRows = await target<CatalogRow[]>`
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           c.relkind::text AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY(${schemas}::text[])
       AND c.relkind IN ('r','p','v','m')
  `;
  const runtime_sql_references = await runtimeReferences(
    new Set(relationRows.map((row) => row.object_key)),
  );

  const report = {
    generated_at: new Date().toISOString(),
    plane,
    schemas,
    direction: "target desired state compared with live current state",
    drift,
    runtime_sql_references,
  };

  for (const [category, result] of Object.entries(drift)) {
    console.log(
      `${category}: missing=${result.missing_in_live.length} `
      + `extra=${result.extra_in_live.length} changed=${result.changed.length}`,
    );
  }
  console.log(`runtime_sql_references: findings=${runtime_sql_references.length}`);

  const output = args.get("--json");
  if (output && output !== "true") {
    await writeFile(resolve(repoRoot, output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`report=${output}`);
  }

  const driftCount = Object.values(drift).reduce(
    (sum, item) => sum + item.missing_in_live.length + item.extra_in_live.length + item.changed.length,
    0,
  ) + runtime_sql_references.length;
  if (strict && driftCount > 0) process.exitCode = 1;
} finally {
  await Promise.all([target.end(), live.end()]);
}
