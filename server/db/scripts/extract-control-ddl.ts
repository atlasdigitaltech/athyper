import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import pg from "pg";

const { Client } = pg;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(scriptDir, "../..");
const valueArg = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const plane = valueArg("plane") ?? "neon";
const schema = valueArg("schema") ?? "control";
const folderName = valueArg("folder") ?? schema;
const sourceDir = path.resolve(
  process.cwd(),
  valueArg("source-dir") ?? path.join(serverDir, "db", "ddl", folderName),
);
const sourceLabel = plane === "mesh" ? "live Mesh database" : "live Neon database";
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const outputDir = path.resolve(
  process.cwd(),
  outputArg?.slice("--output=".length) ?? ".local-evidence/control-live-ddl",
);

loadEnv({ path: path.join(serverDir, ".env"), quiet: true });
loadEnv({
  path: path.resolve(serverDir, "../stack/env/.env"),
  override: false,
  quiet: true,
});

const connectionString = plane === "mesh"
  ? process.env.MESH_DATABASE_ADMIN_URL ?? process.env.MESH_DATABASE_URL
  : process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    plane === "mesh"
      ? "MESH_DATABASE_ADMIN_URL or MESH_DATABASE_URL is required"
      : "DATABASE_ADMIN_URL or DATABASE_URL is required",
  );
}

const qi = (value: string) => `"${value.replaceAll('"', '""')}"`;
const qn = (schemaName: string, objectName: string) =>
  `${qi(schemaName)}.${qi(objectName)}`;
const ql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const terminate = (definition: string) =>
  `${definition.trim().replace(/;$/, "")};`;
const header = (file: string, purpose: string) =>
  [
    "-- ============================================================================",
    `-- ${folderName}/${file}`,
    `-- ${purpose}`,
    `-- Generated from the ${sourceLabel} ${schema} schema. Do not hand-edit.`,
    "-- ============================================================================",
    "",
  ].join("\n");

type Queryable = {
  query: <T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

async function bootstrapSql(
  db: Queryable,
  includeSchemaCreation: boolean,
  bootstrapSource: string,
  bootstrapRoutineNames: Set<string>,
): Promise<{ sql: string; routines: string[]; sourceBodiesMatched: boolean }> {
  const enums = await db.query<{
    type_name: string;
    values: string[];
    comment: string | null;
  }>(
    `
      SELECT t.typname AS type_name,
             array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values,
             obj_description(t.oid, 'pg_type') AS comment
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = $1
       GROUP BY t.oid, t.typname
       ORDER BY t.typname
    `,
    [schema],
  );
  const domains = await db.query<{
    domain_name: string;
    base_type: string;
    not_null: boolean;
    default_expr: string | null;
    constraints: string[] | null;
    comment: string | null;
  }>(
    `
      SELECT t.typname AS domain_name,
             format_type(t.typbasetype, t.typtypmod) AS base_type,
             t.typnotnull AS not_null,
             t.typdefault AS default_expr,
             obj_description(t.oid, 'pg_type') AS comment,
             array_agg(pg_get_constraintdef(c.oid, true) ORDER BY c.conname)
               FILTER (WHERE c.oid IS NOT NULL) AS constraints
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        LEFT JOIN pg_constraint c ON c.contypid = t.oid
       WHERE n.nspname = $1 AND t.typtype = 'd'
       GROUP BY t.oid, t.typname, t.typbasetype, t.typtypmod,
                t.typnotnull, t.typdefault
       ORDER BY t.typname
    `,
    [schema],
  );
  const sequences = await db.query<{
    sequence_name: string;
    data_type: string;
    start_value: string;
    increment_by: string;
    min_value: string;
    max_value: string;
    cache_size: string;
    cycle: boolean;
    comment: string | null;
  }>(
    `
      SELECT c.relname AS sequence_name,
             format_type(s.seqtypid, NULL) AS data_type,
             s.seqstart::text AS start_value,
             s.seqincrement::text AS increment_by,
             s.seqmin::text AS min_value,
             s.seqmax::text AS max_value,
             s.seqcache::text AS cache_size,
             s.seqcycle AS cycle,
             obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_sequence s ON s.seqrelid = c.oid
       WHERE n.nspname = $1
         AND NOT EXISTS (
           SELECT 1
             FROM pg_depend d
             JOIN pg_attribute a
               ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
            WHERE d.classid = 'pg_class'::regclass
              AND d.objid = c.oid
              AND d.deptype = 'i'
         )
       ORDER BY c.relname
    `,
    [schema],
  );
  const routines = await db.query<{
    routine_name: string;
    body: string;
    signature: string;
    object_kind: string;
    definition: string;
    comment: string | null;
  }>(
    `
      SELECT p.proname AS routine_name, p.prosrc AS body,
             quote_ident(p.proname) || '(' ||
               pg_get_function_identity_arguments(p.oid) || ')' AS signature,
             CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END
               AS object_kind,
             pg_get_functiondef(p.oid) AS definition,
             obj_description(p.oid, 'pg_proc') AS comment
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1 AND p.proname = ANY($2::text[])
       ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    `,
    [schema, [...bootstrapRoutineNames]],
  );
  if (routines.rows.length !== bootstrapRoutineNames.size) {
    throw new Error(
      `Expected ${bootstrapRoutineNames.size} live bootstrap routines; found ${routines.rows.length}`,
    );
  }

  const parts = [header("00_bootstrap.sql", "Pre-table schema types and sequences.")];
  if (includeSchemaCreation) {
    parts.push(`CREATE SCHEMA IF NOT EXISTS ${qi(schema)};\n`);
  }
  for (const row of enums.rows) {
    parts.push(
      `CREATE TYPE ${qn(schema, row.type_name)} AS ENUM (\n  ${row.values
        .map(ql)
        .join(",\n  ")}\n);\n`,
    );
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON TYPE ${qn(schema, row.type_name)} IS ${ql(row.comment)};\n`,
      );
    }
  }
  for (const row of domains.rows) {
    const clauses = [
      `CREATE DOMAIN ${qn(schema, row.domain_name)} AS ${row.base_type}`,
      row.default_expr ? `DEFAULT ${row.default_expr}` : "",
      row.not_null ? "NOT NULL" : "",
      ...(row.constraints ?? []).map((constraint) => constraint),
    ].filter(Boolean);
    parts.push(`${clauses.join("\n  ")};\n`);
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON DOMAIN ${qn(schema, row.domain_name)} IS ${ql(row.comment)};\n`,
      );
    }
  }
  for (const row of sequences.rows) {
    parts.push(
      [
        `CREATE SEQUENCE ${qn(schema, row.sequence_name)}`,
        `  AS ${row.data_type}`,
        `  START WITH ${row.start_value}`,
        `  INCREMENT BY ${row.increment_by}`,
        `  MINVALUE ${row.min_value}`,
        `  MAXVALUE ${row.max_value}`,
        `  CACHE ${row.cache_size}`,
        `  ${row.cycle ? "CYCLE" : "NO CYCLE"};`,
        "",
      ].join("\n"),
    );
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON SEQUENCE ${qn(schema, row.sequence_name)} IS ${ql(
          row.comment,
        )};\n`,
      );
    }
  }
  let sourceBodiesMatched = true;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  for (const row of routines.rows) {
    if (
      !bootstrapSource.includes(
        `${row.object_kind} ${schema}.${row.routine_name}`,
      ) ||
      !normalize(bootstrapSource).includes(normalize(row.body))
    ) {
      sourceBodiesMatched = false;
    }
    parts.push(`${terminate(row.definition)}\n`);
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON ${row.object_kind} ${qi(schema)}.${row.signature} IS ${ql(
          row.comment,
        )};\n`,
      );
    }
  }
  return {
    sql: parts.join("\n"),
    routines: routines.rows.map((row) => row.routine_name),
    sourceBodiesMatched,
  };
}

async function tablesSql(db: Queryable): Promise<string> {
  const tables = await db.query<{
    oid: number;
    table_name: string;
    relkind: string;
    persistence: string;
    is_partition: boolean;
    parent_name: string | null;
    partition_bound: string | null;
    partition_key: string | null;
    reloptions: string[] | null;
    comment: string | null;
  }>(
    `
      SELECT c.oid, c.relname AS table_name, c.relkind,
             c.relpersistence AS persistence,
             c.relispartition AS is_partition,
             parent.relname AS parent_name,
             CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid) END
               AS partition_bound,
             CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END
               AS partition_key,
             c.reloptions,
             obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_inherits i ON i.inhrelid = c.oid
        LEFT JOIN pg_class parent ON parent.oid = i.inhparent
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
       ORDER BY c.relispartition, c.relname
    `,
    [schema],
  );
  const columns = await db.query<{
    table_oid: number;
    column_name: string;
    data_type: string;
    not_null: boolean;
    identity_kind: string;
    generated_kind: string;
    default_expr: string | null;
    collation_schema: string | null;
    collation_name: string | null;
    comment: string | null;
  }>(
    `
      SELECT a.attrelid AS table_oid, a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             a.attnotnull AS not_null,
             a.attidentity AS identity_kind,
             a.attgenerated AS generated_kind,
             pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
             CASE WHEN a.attcollation <> t.typcollation THEN cn.nspname END
               AS collation_schema,
             CASE WHEN a.attcollation <> t.typcollation THEN coll.collname END
               AS collation_name,
             col_description(a.attrelid, a.attnum) AS comment
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef ad
          ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        LEFT JOIN pg_collation coll ON coll.oid = a.attcollation
        LEFT JOIN pg_namespace cn ON cn.oid = coll.collnamespace
       WHERE n.nspname = $1
         AND c.relkind IN ('r', 'p')
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY a.attrelid, a.attnum
    `,
    [schema],
  );
  const sequenceOwners = await db.query<{
    sequence_name: string;
    table_name: string;
    column_name: string;
  }>(
    `
      SELECT seq.relname AS sequence_name, tbl.relname AS table_name,
             a.attname AS column_name
        FROM pg_class seq
        JOIN pg_namespace sn ON sn.oid = seq.relnamespace
        JOIN pg_depend d
          ON d.classid = 'pg_class'::regclass AND d.objid = seq.oid
         AND d.deptype = 'a'
        JOIN pg_class tbl ON tbl.oid = d.refobjid
        JOIN pg_attribute a
          ON a.attrelid = tbl.oid AND a.attnum = d.refobjsubid
       WHERE sn.nspname = $1 AND seq.relkind = 'S'
       ORDER BY seq.relname
    `,
    [schema],
  );

  const columnsByTable = new Map<number, typeof columns.rows>();
  for (const column of columns.rows) {
    const list = columnsByTable.get(column.table_oid) ?? [];
    list.push(column);
    columnsByTable.set(column.table_oid, list);
  }

  const parts = [header("01_tables.sql", "Tables reconstructed from the live catalog.")];
  for (const table of tables.rows) {
    const name = qn(schema, table.table_name);
    if (table.is_partition && table.parent_name) {
      parts.push(
        `CREATE TABLE ${name}\n  PARTITION OF ${qn(schema, table.parent_name)}\n  ${table.partition_bound};\n`,
      );
    } else {
      const persistence =
        table.persistence === "u"
          ? "UNLOGGED "
          : table.persistence === "t"
            ? "TEMPORARY "
            : "";
      const definitions = (columnsByTable.get(table.oid) ?? []).map((column) => {
        const fragments = [qi(column.column_name), column.data_type];
        if (column.collation_schema && column.collation_name) {
          fragments.push(
            `COLLATE ${qn(column.collation_schema, column.collation_name)}`,
          );
        }
        if (column.generated_kind === "s") {
          fragments.push(`GENERATED ALWAYS AS (${column.default_expr}) STORED`);
        } else if (column.identity_kind) {
          fragments.push(
            `GENERATED ${
              column.identity_kind === "a" ? "ALWAYS" : "BY DEFAULT"
            } AS IDENTITY`,
          );
        } else if (column.default_expr) {
          fragments.push(`DEFAULT ${column.default_expr}`);
        }
        if (column.not_null) fragments.push("NOT NULL");
        return `  ${fragments.join(" ")}`;
      });
      const options = table.reloptions?.length
        ? `\nWITH (${table.reloptions.join(", ")})`
        : "";
      const partition = table.partition_key
        ? `\nPARTITION BY ${table.partition_key}`
        : "";
      parts.push(
        `CREATE ${persistence}TABLE ${name} (\n${definitions.join(
          ",\n",
        )}\n)${options}${partition};\n`,
      );
    }
    if (table.comment !== null) {
      parts.push(`COMMENT ON TABLE ${name} IS ${ql(table.comment)};\n`);
    }
    for (const column of columnsByTable.get(table.oid) ?? []) {
      if (column.comment !== null) {
        parts.push(
          `COMMENT ON COLUMN ${name}.${qi(column.column_name)} IS ${ql(
            column.comment,
          )};\n`,
        );
      }
    }
  }
  for (const owner of sequenceOwners.rows) {
    parts.push(
      `ALTER SEQUENCE ${qn(schema, owner.sequence_name)} OWNED BY ${qn(
        schema,
        owner.table_name,
      )}.${qi(owner.column_name)};\n`,
    );
  }
  return parts.join("\n");
}

async function constraintsSql(db: Queryable): Promise<string> {
  const result = await db.query<{
    table_name: string;
    constraint_name: string;
    definition: string;
  }>(
    `
      SELECT c.relname AS table_name, con.conname AS constraint_name,
             pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND con.contype IN ('p', 'u', 'c', 'x', 'f')
       ORDER BY CASE con.contype
                  WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3
                  WHEN 'x' THEN 4 WHEN 'f' THEN 5 ELSE 6
                END,
                c.relname, con.conname
    `,
    [schema],
  );
  return [
    header("03_constraints.sql", "Table constraints reconstructed from the live catalog."),
    ...result.rows.map(
      (row) =>
        `ALTER TABLE ONLY ${qn(schema, row.table_name)}\n  ADD CONSTRAINT ${qi(
          row.constraint_name,
        )} ${terminate(row.definition)}\n`,
    ),
  ].join("\n");
}

async function indexesSql(db: Queryable): Promise<string> {
  const result = await db.query<{
    index_name: string;
    definition: string;
    comment: string | null;
  }>(
    `
      SELECT idx.relname AS index_name,
             pg_get_indexdef(i.indexrelid, 0, true) AS definition,
             obj_description(idx.oid, 'pg_class') AS comment
        FROM pg_index i
        JOIN pg_class tbl ON tbl.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = tbl.relnamespace
        JOIN pg_class idx ON idx.oid = i.indexrelid
        LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid
       WHERE n.nspname = $1
         AND con.oid IS NULL
       ORDER BY tbl.relname, idx.relname
    `,
    [schema],
  );
  const parts = [
    header("04_indexes.sql", "Non-constraint indexes reconstructed from the live catalog."),
  ];
  for (const row of result.rows) {
    parts.push(`${terminate(row.definition)}\n`);
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON INDEX ${qn(schema, row.index_name)} IS ${ql(row.comment)};\n`,
      );
    }
  }
  return parts.join("\n");
}

function preConstraintRoutineNames(source: string): Set<string> {
  const escapedSchema = schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:FUNCTION|PROCEDURE)\\s+` +
      `"?${escapedSchema}"?\\."?([A-Za-z_][A-Za-z0-9_$]*)"?\\s*\\(`,
    "gi",
  );
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

async function preConstraintSql(
  db: Queryable,
  source: string,
  expectedNames: Set<string>,
): Promise<{ sql: string; routines: string[]; sourceBodiesMatched: boolean }> {
  if (expectedNames.size === 0) {
    return {
      sql: header(
        "02_pre_constraint.sql",
        "No pre-constraint routines are required by the live schema.",
      ),
      routines: [],
      sourceBodiesMatched: true,
    };
  }
  const result = await db.query<{
    routine_name: string;
    body: string;
    signature: string;
    object_kind: string;
    definition: string;
    comment: string | null;
  }>(
    `
      SELECT p.proname AS routine_name, p.prosrc AS body,
             quote_ident(p.proname) || '(' ||
               pg_get_function_identity_arguments(p.oid) || ')' AS signature,
             CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END
               AS object_kind,
             pg_get_functiondef(p.oid) AS definition,
             obj_description(p.oid, 'pg_proc') AS comment
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1 AND p.proname = ANY($2::text[])
       ORDER BY p.proname
    `,
    [schema, [...expectedNames]],
  );
  if (result.rows.length !== expectedNames.size) {
    throw new Error(
      `Expected ${expectedNames.size} live pre-constraint routines; found ${result.rows.length}`,
    );
  }
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  let sourceBodiesMatched = true;
  for (const row of result.rows) {
    if (
      !source.includes(`FUNCTION control.${row.routine_name}`) ||
      !normalize(source).includes(normalize(row.body))
    ) {
      const schemaQualifiedNeedle = `${row.object_kind} ${schema}.${row.routine_name}`;
      if (
        !source.includes(schemaQualifiedNeedle) ||
        !normalize(source).includes(normalize(row.body))
      ) {
        sourceBodiesMatched = false;
      }
    }
  }
  const parts = [
    header(
      "02_pre_constraint.sql",
      "Order-sensitive routines reconstructed from the live catalog.",
    ),
  ];
  for (const row of result.rows) {
    parts.push(`${terminate(row.definition)}\n`);
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON ${row.object_kind} ${qi(schema)}.${row.signature} IS ${ql(
          row.comment,
        )};\n`,
      );
    }
  }
  return {
    sql: parts.join("\n"),
    routines: result.rows.map((row) => row.routine_name),
    sourceBodiesMatched,
  };
}

async function functionsSql(
  db: Queryable,
  excludedRoutineNames: Set<string>,
): Promise<string> {
  const result = await db.query<{
    routine_name: string;
    identity: string;
    signature: string;
    definition: string;
    comment: string | null;
  }>(
    `
      SELECT p.proname AS routine_name,
             p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
               AS identity,
             quote_ident(p.proname) || '(' ||
               pg_get_function_identity_arguments(p.oid) || ')' AS signature,
             pg_get_functiondef(p.oid) AS definition,
             obj_description(p.oid, 'pg_proc') AS comment
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1
       ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    `,
    [schema],
  );
  const rows = result.rows.filter(
    (row) => !excludedRoutineNames.has(row.routine_name),
  );
  const parts = [
    header(
      "05_functions.sql",
      "Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.",
    ),
  ];
  for (const row of rows) {
    parts.push(`${terminate(row.definition)}\n`);
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON FUNCTION ${qi(schema)}.${row.signature} IS ${ql(row.comment)};\n`,
      );
    }
  }
  return parts.join("\n");
}

async function triggersSql(db: Queryable): Promise<string> {
  const result = await db.query<{
    table_name: string;
    trigger_name: string;
    definition: string;
    enabled_mode: string;
    comment: string | null;
  }>(
    `
      SELECT c.relname AS table_name, t.tgname AS trigger_name,
             pg_get_triggerdef(t.oid, true) AS definition,
             t.tgenabled AS enabled_mode,
             obj_description(t.oid, 'pg_trigger') AS comment
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND NOT t.tgisinternal
       ORDER BY c.relname, t.tgname
    `,
    [schema],
  );
  const parts = [
    header("06_triggers.sql", "Non-internal triggers reconstructed from the live catalog."),
  ];
  for (const row of result.rows) {
    parts.push(`${terminate(row.definition)}\n`);
    if (row.enabled_mode !== "O") {
      const mode =
        row.enabled_mode === "D"
          ? "DISABLE"
          : row.enabled_mode === "R"
            ? "ENABLE REPLICA"
            : "ENABLE ALWAYS";
      parts.push(
        `ALTER TABLE ${qn(schema, row.table_name)} ${mode} TRIGGER ${qi(
          row.trigger_name,
        )};\n`,
      );
    }
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON TRIGGER ${qi(row.trigger_name)} ON ${qn(
          schema,
          row.table_name,
        )} IS ${ql(row.comment)};\n`,
      );
    }
  }
  return parts.join("\n");
}

async function viewsSql(db: Queryable): Promise<string> {
  const result = await db.query<{
    oid: number;
    view_name: string;
    relkind: string;
    definition: string;
    reloptions: string[] | null;
    populated: boolean;
    comment: string | null;
    dependencies: string[] | null;
  }>(
    `
      SELECT c.oid, c.relname AS view_name, c.relkind,
             pg_get_viewdef(c.oid, true) AS definition,
             c.reloptions, c.relispopulated AS populated,
             obj_description(c.oid, 'pg_class') AS comment,
             array_agg(DISTINCT dep.relname::text)
               FILTER (WHERE dep.oid IS NOT NULL) AS dependencies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_rewrite rw ON rw.ev_class = c.oid
        LEFT JOIN pg_depend d
          ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
        LEFT JOIN pg_class dep
          ON dep.oid = d.refobjid AND dep.relkind IN ('v', 'm')
         AND dep.relnamespace = c.relnamespace AND dep.oid <> c.oid
       WHERE n.nspname = $1 AND c.relkind IN ('v', 'm')
       GROUP BY c.oid, c.relname, c.relkind, c.reloptions,
                c.relispopulated
       ORDER BY c.relname
    `,
    [schema],
  );

  const pending = new Map(result.rows.map((row) => [row.view_name, row]));
  const ordered: typeof result.rows = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((row) =>
      (row.dependencies ?? []).every((dependency) => !pending.has(dependency)),
    );
    if (!ready.length) {
      ordered.push(...[...pending.values()].sort((a, b) => a.view_name.localeCompare(b.view_name)));
      break;
    }
    for (const row of ready.sort((a, b) => a.view_name.localeCompare(b.view_name))) {
      ordered.push(row);
      pending.delete(row.view_name);
    }
  }

  const parts = [
    header("07_views.sql", "Views and materialized views reconstructed from the live catalog."),
  ];
  for (const row of ordered) {
    const options = row.reloptions?.length
      ? ` WITH (${row.reloptions.join(", ")})`
      : "";
    if (row.relkind === "m") {
      const definition = row.definition.trim().replace(/;$/, "");
      parts.push(
        `CREATE MATERIALIZED VIEW ${qn(schema, row.view_name)}${options} AS\n${definition}\n${
          row.populated ? "WITH DATA" : "WITH NO DATA"
        };\n`,
      );
    } else {
      parts.push(
        `CREATE OR REPLACE VIEW ${qn(schema, row.view_name)}${options} AS\n${terminate(
          row.definition,
        )}\n`,
      );
    }
    if (row.comment !== null) {
      parts.push(
        `COMMENT ON ${row.relkind === "m" ? "MATERIALIZED VIEW" : "VIEW"} ${qn(
          schema,
          row.view_name,
        )} IS ${ql(row.comment)};\n`,
      );
    }
  }
  return parts.join("\n");
}

async function rlsSql(db: Queryable): Promise<string> {
  const tables = await db.query<{
    table_name: string;
    enabled: boolean;
    forced: boolean;
  }>(
    `
      SELECT c.relname AS table_name, c.relrowsecurity AS enabled,
             c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
         AND (c.relrowsecurity OR c.relforcerowsecurity)
       ORDER BY c.relname
    `,
    [schema],
  );
  const policies = await db.query<{
    table_name: string;
    policy_name: string;
    permissive: boolean;
    command: string;
    roles: string[];
    using_expr: string | null;
    check_expr: string | null;
  }>(
    `
      SELECT c.relname AS table_name, p.polname AS policy_name,
             p.polpermissive AS permissive,
             CASE p.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT'
               WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
               WHEN 'd' THEN 'DELETE' END AS command,
             ARRAY(
               SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC'
                           ELSE quote_ident(r.rolname) END
                 FROM unnest(p.polroles) role_oid
                 LEFT JOIN pg_roles r ON r.oid = role_oid
             )::text[] AS roles,
             pg_get_expr(p.polqual, p.polrelid, true) AS using_expr,
             pg_get_expr(p.polwithcheck, p.polrelid, true) AS check_expr
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
       ORDER BY c.relname, p.polname
    `,
    [schema],
  );
  const grants = await db.query<{
    object_kind: string;
    object_name: string;
    grantee: string;
    privilege_type: string;
    grantable: boolean;
  }>(
    `
      SELECT CASE c.relkind
               WHEN 'S' THEN 'SEQUENCE'
               WHEN 'v' THEN 'TABLE'
               WHEN 'm' THEN 'TABLE'
               ELSE 'TABLE'
             END AS object_kind,
             c.relname::text AS object_name,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                  ELSE quote_ident(grantee.rolname) END AS grantee,
             acl.privilege_type,
             acl.is_grantable AS grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = $1
         AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
       UNION ALL
      SELECT CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
             (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                  ELSE quote_ident(grantee.rolname) END,
             acl.privilege_type,
             acl.is_grantable
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(p.proacl) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
       WHERE n.nspname = $1
       ORDER BY 1, 2, 3, 4
    `,
    [schema],
  );

  const parts = [
    header("08_rls.sql", "Row-level security policies and explicit object grants."),
  ];
  for (const table of tables.rows) {
    if (table.enabled) {
      parts.push(
        `ALTER TABLE ${qn(schema, table.table_name)} ENABLE ROW LEVEL SECURITY;\n`,
      );
    }
    if (table.forced) {
      parts.push(
        `ALTER TABLE ${qn(schema, table.table_name)} FORCE ROW LEVEL SECURITY;\n`,
      );
    }
  }
  for (const policy of policies.rows) {
    const clauses = [
      `CREATE POLICY ${qi(policy.policy_name)} ON ${qn(schema, policy.table_name)}`,
      `  AS ${policy.permissive ? "PERMISSIVE" : "RESTRICTIVE"}`,
      `  FOR ${policy.command}`,
      `  TO ${policy.roles.join(", ")}`,
      policy.using_expr ? `  USING (${policy.using_expr})` : "",
      policy.check_expr ? `  WITH CHECK (${policy.check_expr})` : "",
    ].filter(Boolean);
    parts.push(`${clauses.join("\n")};\n`);
  }
  for (const grant of grants.rows) {
    const object =
      grant.object_kind === "FUNCTION" || grant.object_kind === "PROCEDURE"
        ? `${qi(schema)}.${grant.object_name}`
        : qn(schema, grant.object_name);
    parts.push(
      `GRANT ${grant.privilege_type} ON ${grant.object_kind} ${object} TO ${
        grant.grantee
      }${grant.grantable ? " WITH GRANT OPTION" : ""};\n`,
    );
  }
  return parts.join("\n");
}

async function counts(db: Queryable) {
  const result = await db.query<{
    tables: string;
    views: string;
    routines: string;
    triggers: string;
    constraints: string;
    indexes: string;
    policies: string;
  }>(
    `
      SELECT
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND c.relkind IN ('r','p'))::text AS tables,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND c.relkind IN ('v','m'))::text AS views,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname=$1)::text AS routines,
        (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND NOT t.tgisinternal)::text AS triggers,
        (SELECT count(*) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND con.contype IN ('p','u','c','x','f'))::text AS constraints,
        (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          LEFT JOIN pg_constraint con ON con.conindid=i.indexrelid
          WHERE n.nspname=$1 AND con.oid IS NULL)::text AS indexes,
        (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1)::text AS policies
    `,
    [schema],
  );
  return result.rows[0];
}

async function main() {
  const clientOptions = (url: string) => ({
    connectionString: url,
    ...(plane === "mesh" ? {} : { ssl: { rejectUnauthorized: false } }),
    application_name: `extract-${folderName}-ddl`,
  });
  let db = new Client(clientOptions(connectionString));
  try {
    await db.connect();
  } catch (error) {
    const fallbackUrl = new URL(connectionString);
    const canRetry =
      plane === "mesh" &&
      String(error).includes("getaddrinfo ENOTFOUND") &&
      ["dbpool-apps", "db", "athyper-db-1"].includes(fallbackUrl.hostname);
    if (!canRetry) throw error;
    fallbackUrl.hostname = "localhost";
    db = new Client(clientOptions(fallbackUrl.toString()));
    await db.connect();
  }
  try {
    await db.query("SET search_path = pg_catalog");
    await db.query("SET default_transaction_read_only = on");
    const bootstrapSource = await readFile(
      path.join(sourceDir, "00_bootstrap.sql"),
      "utf8",
    );
    let preConstraint: string;
    try {
      preConstraint = await readFile(
        path.join(sourceDir, "02_pre_constraint.sql"),
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      preConstraint = header(
        "02_pre_constraint.sql",
        "No pre-constraint routines are required by the live schema.",
      );
    }
    const expectedPreConstraintRoutines =
      preConstraintRoutineNames(preConstraint);
    const expectedBootstrapRoutines =
      preConstraintRoutineNames(bootstrapSource);
    const generatedBootstrap = await bootstrapSql(
      db,
      /^\s*CREATE\s+SCHEMA\b/im.test(bootstrapSource),
      bootstrapSource,
      expectedBootstrapRoutines,
    );
    const generatedPreConstraint = await preConstraintSql(
      db,
      preConstraint,
      expectedPreConstraintRoutines,
    );
    const excludedRoutines = new Set([
      ...expectedBootstrapRoutines,
      ...expectedPreConstraintRoutines,
    ]);
    const files = new Map<string, string>([
      ["00_bootstrap.sql", generatedBootstrap.sql],
      ["01_tables.sql", await tablesSql(db)],
      ["02_pre_constraint.sql", generatedPreConstraint.sql],
      ["03_constraints.sql", await constraintsSql(db)],
      ["04_indexes.sql", await indexesSql(db)],
      [
        "05_functions.sql",
        await functionsSql(db, excludedRoutines),
      ],
      ["06_triggers.sql", await triggersSql(db)],
      ["07_views.sql", await viewsSql(db)],
      ["08_rls.sql", await rlsSql(db)],
    ]);
    await mkdir(outputDir, { recursive: true });
    for (const [name, contents] of files) {
      await writeFile(path.join(outputDir, name), contents.replaceAll("\r\n", "\n"), "utf8");
    }
    const manifest = {
      source_database: (await db.query<{ name: string }>("SELECT current_database() AS name")).rows[0].name,
      source_schema: schema,
      source_plane: plane,
      target_folder: folderName,
      output_directory: outputDir,
      files: [...files.keys()],
      live_counts: await counts(db),
      bootstrap_routines: generatedBootstrap.routines,
      bootstrap_source_matches_live_bodies:
        generatedBootstrap.sourceBodiesMatched,
      pre_constraint_routines: generatedPreConstraint.routines,
      pre_constraint_source_matches_live_bodies:
        generatedPreConstraint.sourceBodiesMatched,
    };
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await db.end();
  }
}

await main();
