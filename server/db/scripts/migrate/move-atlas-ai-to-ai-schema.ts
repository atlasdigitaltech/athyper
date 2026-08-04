import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) {
  loadEnv({ path: resolve(process.cwd(), "server/.env"), quiet: true });
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const tableMoves = [
  ["control", "ai_action_policy"],
  ["control", "ai_confidence_threshold"],
  ["control", "ai_drift_baseline"],
  ["control", "atlas_conversation_retention_policy"],
  ["control", "atlas_tenant_provider_credential"],
  ["control", "atlas_tenant_provider_credential_epoch"],
  ["event", "ai_tool_invocation"],
  ["event", "atlas_run"],
  ["log", "ai_agent_call"],
  ["log", "ai_agent_run"],
  ["log", "ai_calibration_log"],
  ["log", "ai_call_transcript"],
  ["log", "ai_call_transcript_default"],
  ["log", "ai_feedback_log"],
  ["log", "ai_inference_log"],
  ["log", "ai_monitoring_log"],
  ["master", "atlas_knowledge_chunk"],
  ["master", "atlas_knowledge_revision"],
  ["master", "atlas_knowledge_source"],
  ["master", "atlas_message"],
  ["master", "atlas_support_session"],
  ["master", "atlas_thread"],
] as const;

const functionMoves = [
  ["event", "trg_guard_ai_tool_invocation_mutation", ""],
  ["event", "trg_guard_atlas_run_mutation", ""],
  ["event", "trg_validate_ai_tool_invocation_insert", ""],
  ["event", "trg_validate_atlas_run_messages", ""],
  ["master", "fn_atlas_conversation_access", "uuid, uuid, boolean"],
  ["master", "trg_allocate_atlas_message_sequence", ""],
  ["master", "trg_guard_atlas_message_mutation", ""],
  ["master", "trg_guard_atlas_thread_mutation", ""],
  ["master", "trg_validate_atlas_participant_cursor", ""],
  ["master", "trg_validate_atlas_thread_envelope", ""],
  ["master", "fn_is_atlas_conversation", "uuid, uuid"],
  ["master", "trg_guard_atlas_conversation_mutation", ""],
  ["master", "trg_guard_atlas_participant_insert", ""],
  ["master", "trg_guard_atlas_participant_mutation", ""],
] as const;

const client = new Client({ connectionString });

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function boundedName(table: string, name: string): string {
  const candidate = `${table}_${name}`;
  if (candidate.length <= 63) return candidate;
  let hash = 2166136261;
  for (const char of candidate) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${candidate.slice(0, 54)}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function relation(schema: string, table: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "select to_regclass($1) is not null present",
    [`${schema}.${table}`],
  );
  return result.rows[0]?.present === true;
}

async function moveTable(source: string, table: string): Promise<void> {
  const sourcePresent = await relation(source, table);
  const targetPresent = await relation("ai", table);
  if (sourcePresent && targetPresent) {
    throw new Error(`Both ${source}.${table} and ai.${table} exist.`);
  }
  if (sourcePresent) {
    await client.query(`ALTER TABLE ${source}.${table} SET SCHEMA ai`);
  } else if (!targetPresent) {
    throw new Error(`Neither ${source}.${table} nor ai.${table} exists.`);
  }
}

async function moveConversationTable(table: string): Promise<void> {
  const sourcePresent = await relation("master", table);
  const targetPresent = await relation("document", table);
  if (sourcePresent && targetPresent) {
    throw new Error(`Both master.${table} and document.${table} exist.`);
  }
  if (sourcePresent) {
    await client.query(`ALTER TABLE master.${table} SET SCHEMA document`);
  } else if (!targetPresent) {
    throw new Error(`Neither master.${table} nor document.${table} exists.`);
  }
}

async function moveFunction(schema: string, name: string, args: string): Promise<void> {
  const sourceIdentity = `${schema}.${name}(${args})`;
  const targetIdentity = `ai.${name}(${args})`;
  const result = await client.query<{ source: string | null; target: string | null }>(
    "select to_regprocedure($1)::text source, to_regprocedure($2)::text target",
    [sourceIdentity, targetIdentity],
  );
  const row = result.rows[0];
  if (row?.source && row.target) throw new Error(`Both ${sourceIdentity} and ${targetIdentity} exist.`);
  if (row?.source) await client.query(`ALTER FUNCTION ${sourceIdentity} SET SCHEMA ai`);
  else if (!row?.target) throw new Error(`Neither ${sourceIdentity} nor ${targetIdentity} exists.`);
}

async function normalizeRelationNames(): Promise<void> {
  const tables = tableMoves.map(([, table]) => table);
  const constraints = await client.query<{
    schema_name: string;
    table_name: string;
    constraint_name: string;
  }>(`
    select n.nspname schema_name, c.relname table_name, con.conname constraint_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('control', 'event', 'log', 'master')
      and c.relname = any($1::text[])
      and con.conislocal
      and con.conname not like c.relname || '\\_%' escape '\\'
    order by 1, 2, 3
  `, [tables]);
  for (const row of constraints.rows) {
    const nextName = boundedName(row.table_name, row.constraint_name);
    await client.query(
      `ALTER TABLE ${quoteIdentifier(row.schema_name)}.${quoteIdentifier(row.table_name)}
       RENAME CONSTRAINT ${quoteIdentifier(row.constraint_name)} TO ${quoteIdentifier(nextName)}`,
    );
  }

  const indexes = await client.query<{
    schema_name: string;
    table_name: string;
    index_name: string;
  }>(`
    select n.nspname schema_name, t.relname table_name, i.relname index_name
    from pg_index x
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class i on i.oid = x.indexrelid
    left join pg_constraint con on con.conindid = i.oid
    where n.nspname in ('control', 'event', 'log', 'master')
      and t.relname = any($1::text[])
      and con.oid is null
      and i.relname not like t.relname || '\\_%' escape '\\'
    order by 1, 2, 3
  `, [tables]);
  for (const row of indexes.rows) {
    const nextName = boundedName(row.table_name, row.index_name);
    await client.query(
      `ALTER INDEX ${quoteIdentifier(row.schema_name)}.${quoteIdentifier(row.index_name)}
       RENAME TO ${quoteIdentifier(nextName)}`,
    );
  }
}

async function main(): Promise<void> {
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("CREATE SCHEMA IF NOT EXISTS ai");

    const state = await client.query<{ legacy_count: string; target_count: string }>(`
      select
        count(*) filter (where n.nspname in ('control', 'event', 'log', 'master'))::text legacy_count,
        count(*) filter (where n.nspname = 'ai')::text target_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and c.relname = any($1::text[])
    `, [tableMoves.map(([, table]) => table)]);
    const alreadyMoved =
      state.rows[0]?.legacy_count === "0"
      && state.rows[0]?.target_count === String(tableMoves.length);

    if (!alreadyMoved) {
      await moveConversationTable("conversation");
      await moveConversationTable("conversation_participant");
      await normalizeRelationNames();
      for (const [source, table] of tableMoves) await moveTable(source, table);

      await client.query(`
      ALTER TABLE ai.atlas_knowledge_chunk
        DROP CONSTRAINT atlas_knowledge_chunk_revision_fk;
      ALTER TABLE ai.atlas_knowledge_revision
        DROP CONSTRAINT atlas_knowledge_revision_source_fk;
      ALTER TABLE ai.atlas_knowledge_source
        ADD CONSTRAINT atlas_knowledge_source_tenant_id_uq UNIQUE (tenant_id, id);
      ALTER TABLE ai.atlas_knowledge_revision
        ADD CONSTRAINT atlas_knowledge_revision_tenant_id_uq UNIQUE (tenant_id, id);
      ALTER TABLE ai.atlas_knowledge_chunk
        ADD CONSTRAINT atlas_knowledge_chunk_revision_fk
        FOREIGN KEY (tenant_id, revision_id)
        REFERENCES ai.atlas_knowledge_revision(tenant_id, id)
        ON DELETE CASCADE;
      ALTER TABLE ai.atlas_knowledge_revision
        ADD CONSTRAINT atlas_knowledge_revision_source_fk
        FOREIGN KEY (tenant_id, source_id)
        REFERENCES ai.atlas_knowledge_source(tenant_id, id)
        ON DELETE CASCADE;
      ALTER TABLE ai.ai_call_transcript_default ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ai.ai_call_transcript_default FORCE ROW LEVEL SECURITY;
      `);
    }

    for (const [schema, name, args] of functionMoves) await moveFunction(schema, name, args);
    const functionSql = await readFile(
      resolve(process.cwd(), "server/db/ddl/common/ai/07_functions.sql"),
      "utf8",
    );
    const triggerSql = await readFile(
      resolve(process.cwd(), "server/db/ddl/common/ai/08_triggers.sql"),
      "utf8",
    );
    await client.query(functionSql);
    const triggers = await client.query<{
      schema_name: string;
      table_name: string;
      trigger_name: string;
    }>(`
      select c.relname table_name, t.tgname trigger_name
           , n.nspname schema_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal
        and (
          (n.nspname = 'ai' and c.relname = any($1::text[]))
          or (
            n.nspname = 'document'
            and t.tgname = any($2::text[])
          )
        )
      order by 1, 2
    `, [
      tableMoves.map(([, table]) => table),
      [
        "trg_conversation_atlas_mutation_guard",
        "trg_conversation_participant_atlas_cursor_check",
        "trg_conversation_participant_atlas_insert_guard",
        "trg_conversation_participant_atlas_mutation_guard",
      ],
    ]);
    for (const row of triggers.rows) {
      await client.query(
        `DROP TRIGGER ${quoteIdentifier(row.trigger_name)}
         ON ${quoteIdentifier(row.schema_name)}.${quoteIdentifier(row.table_name)}`,
      );
    }
    await client.query(triggerSql);

    await client.query(`
      REVOKE ALL ON SCHEMA ai FROM PUBLIC;
      GRANT USAGE ON SCHEMA ai TO athyperapp, athyperadmin, athyperadmin_atlas_maintenance;
    `);

    const remaining = await client.query<{ object_name: string }>(`
      select format('%I.%I', n.nspname, c.relname) object_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname in ('control', 'event', 'log', 'master')
        and c.relname = any($1::text[])
      order by 1
    `, [tableMoves.map(([, table]) => table)]);
    if (remaining.rowCount) {
      throw new Error(`Legacy AI tables remain: ${remaining.rows.map((row) => row.object_name).join(", ")}`);
    }

    const target = await client.query<{ count: string }>(`
      select count(*)::text count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname = 'ai'
        and c.relname = any($1::text[])
    `, [tableMoves.map(([, table]) => table)]);
    if (target.rows[0]?.count !== String(tableMoves.length)) {
      throw new Error(`Expected ${tableMoves.length} AI relations, found ${target.rows[0]?.count}.`);
    }

    if (apply) {
      await client.query("COMMIT");
      console.log(`Applied Atlas AI schema migration (${tableMoves.length} relations).`);
    } else {
      await client.query("ROLLBACK");
      console.log(`Dry run passed for ${tableMoves.length} relations; transaction rolled back.`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
