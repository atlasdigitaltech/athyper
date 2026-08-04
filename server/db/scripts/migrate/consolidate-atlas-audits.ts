import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) {
  loadEnv({
    path: fileURLToPath(new URL("../../../.env", import.meta.url)),
    quiet: true,
  });
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString });

function q(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function sourceTable(
  table: string,
  schemas: readonly string[],
): Promise<string | null> {
  const result = await client.query<{ schema_name: string }>(
    `select n.nspname schema_name
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and c.relname = $1
        and n.nspname = any($2::text[])
      order by array_position($2::text[], n.nspname)
      limit 1`,
    [table, schemas],
  );
  return result.rows[0]?.schema_name ?? null;
}

async function count(table: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `select count(*)::text count from ${table}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function migrateByok(schema: string): Promise<number> {
  const source = `${q(schema)}.${q("atlas_byok_audit")}`;
  const sourceCount = await count(source);
  await client.query(`
    insert into audit.audit_log (
      id, tenant_id, event_code, operation, entity_type, entity_id,
      actor_principal_id, actor_type, context, occurred_at, recorded_at
    )
    select
      id,
      tenant_id,
      'ai.byok.' || event,
      case event
        when 'created' then 'create'
        when 'rotated' then 'update'
        when 'revoked' then 'revoke'
        when 'reencrypted' then 'update'
        else 'execute'
      end::audit.operation_d,
      'ai.byok_provider_binding',
      tenant_id,
      actor_principal_id,
      case when actor_principal_id is null then 'system' else 'user' end::audit.actor_type_d,
      jsonb_strip_nulls(jsonb_build_object(
        'provider_id', provider_id,
        'rotation_epoch', rotation_epoch,
        'reference_fingerprint', reference_fingerprint,
        'legacy_correlation_id', correlation_id,
        'legacy_source', '${schema}.atlas_byok_audit'
      )),
      occurred_at,
      greatest(occurred_at, now())
    from ${source}
    on conflict (occurred_at, id) do nothing
  `);
  const missing = await client.query<{ count: string }>(`
    select count(*)::text count
      from ${source} old
     where not exists (
       select 1
         from audit.audit_log canonical
        where canonical.id = old.id
          and canonical.occurred_at = old.occurred_at
          and canonical.event_code = 'ai.byok.' || old.event
     )
  `);
  if (Number(missing.rows[0]?.count ?? 0) !== 0) {
    throw new Error("BYOK audit copy verification failed.");
  }
  await client.query(`drop table ${source}`);
  return sourceCount;
}

async function migrateSupport(schema: string): Promise<number> {
  const source = `${q(schema)}.${q("atlas_support_session_audit")}`;
  const sourceCount = await count(source);
  await client.query(`
    insert into audit.audit_log (
      id, tenant_id, event_code, operation, entity_type, entity_id,
      scope_type, scope_id, actor_principal_id, actor_type,
      context, occurred_at, recorded_at
    )
    select
      id,
      target_tenant_id,
      'ai.support.' || event,
      case event
        when 'exported' then 'export'
        when 'access_denied' then 'reject'
        else 'execute'
      end::audit.operation_d,
      'ai.support_session',
      session_id,
      'tenant',
      target_tenant_id,
      origin_principal_id,
      'support',
      jsonb_strip_nulls(jsonb_build_object(
        'shadow_principal_id', shadow_principal_id,
        'scope', scope,
        'resource_hash', resource_hash,
        'safe_reason_code', safe_reason_code,
        'legacy_source', '${schema}.atlas_support_session_audit'
      )),
      occurred_at,
      greatest(created_at, occurred_at)
    from ${source}
    on conflict (occurred_at, id) do nothing
  `);
  const missing = await client.query<{ count: string }>(`
    select count(*)::text count
      from ${source} old
     where not exists (
       select 1
         from audit.audit_log canonical
        where canonical.id = old.id
          and canonical.occurred_at = old.occurred_at
          and canonical.event_code = 'ai.support.' || old.event
     )
  `);
  if (Number(missing.rows[0]?.count ?? 0) !== 0) {
    throw new Error("Support-session audit copy verification failed.");
  }
  await client.query(`drop table ${source}`);
  return sourceCount;
}

async function installSupportPolicy(): Promise<void> {
  const sessionExists = await client.query<{ present: boolean }>(
    "select to_regclass('ai.atlas_support_session') is not null present",
  );
  if (!sessionExists.rows[0]?.present) return;
  await client.query("drop policy if exists atlas_support_origin_audit on audit.audit_log");
  await client.query(`
    create policy atlas_support_origin_audit on audit.audit_log
      as permissive
      for insert
      to athyperapp
      with check (
        exists (
          select 1
            from ai.atlas_support_session s
           where event_code like 'ai.support.%'
             and entity_type = 'ai.support_session'
             and s.id = entity_id
             and s.target_tenant_id = tenant_id
             and s.origin_principal_id = actor_principal_id
             and s.origin_tenant_id = shared.current_tenant_id()
             and s.origin_principal_id =
                 nullif(current_setting('app.current_principal_id', true), '')::uuid
             and nullif(current_setting('app.current_atlas_plane', true), '') = 'admin'
        )
      )
  `);
}

async function ensureCanonicalAudit(): Promise<boolean> {
  const auditExists = await client.query<{ present: boolean }>(
    "select to_regclass('audit.audit_log') is not null present",
  );
  if (auditExists.rows[0]?.present) return false;

  const partialState = await client.query<{ reason_present: boolean }>(
    "select to_regclass('master.audit_reason_code') is not null reason_present",
  );
  for (const file of ["00_schema.sql", "02_domains.sql"]) {
    const ddl = await readFile(
      fileURLToPath(new URL(`../../ddl/common/audit/${file}`, import.meta.url)),
      "utf8",
    );
    await client.query(ddl);
  }
  await client.query(`
    create table audit.audit_log (
      id uuid not null default shared.uuidv7(),
      tenant_id uuid not null,
      event_code text not null,
      operation audit.operation_d not null,
      entity_type text not null,
      entity_id uuid not null,
      scope_type text,
      scope_id uuid,
      actor_principal_id uuid,
      actor_type audit.actor_type_d not null,
      audit_reason_code_id uuid,
      audit_reason_code_snapshot text,
      reason_comment text,
      old_values jsonb,
      new_values jsonb,
      changed_fields text[],
      context jsonb not null default '{}'::jsonb,
      correlation_id uuid,
      request_id text,
      ip_address inet,
      user_agent text,
      occurred_at timestamptz not null default now(),
      recorded_at timestamptz not null default now(),
      constraint audit_log_pkey primary key (occurred_at, id),
      constraint audit_log_event_code_chk check (
        event_code ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){1,7}$'
      ),
      constraint audit_log_entity_type_chk check (
        entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
      ),
      constraint audit_log_scope_pair_chk check (
        (scope_type is null) = (scope_id is null)
      ),
      constraint audit_log_actor_chk check (
        (actor_type in ('system', 'anonymous') and actor_principal_id is null)
        or
        (actor_type not in ('system', 'anonymous') and actor_principal_id is not null)
      ),
      constraint audit_log_context_object_chk check (
        jsonb_typeof(context) = 'object'
      ),
      constraint audit_log_time_chk check (recorded_at >= occurred_at)
    ) partition by range (occurred_at);
    create table audit.audit_log_default
      partition of audit.audit_log default;
    alter table audit.audit_log
      add constraint audit_log_tenant_fk
      foreign key (tenant_id) references master.tenant(id) on delete restrict;
    alter table audit.audit_log
      add constraint audit_log_actor_fk
      foreign key (actor_principal_id) references master.principal(id) on delete restrict;
    create index audit_log_entity_idx
      on audit.audit_log (tenant_id, entity_type, entity_id, occurred_at desc);
    create index audit_log_event_idx
      on audit.audit_log (tenant_id, event_code, occurred_at desc);
    create index audit_log_actor_idx
      on audit.audit_log (tenant_id, actor_principal_id, occurred_at desc)
      where actor_principal_id is not null;
  `);
  const functionSql = await readFile(
    fileURLToPath(
      new URL("../../ddl/common/audit/07_functions.sql", import.meta.url),
    ),
    "utf8",
  );
  await client.query(functionSql);
  await client.query(`
    create trigger trg_audit_log_05_prepare
      before insert on audit.audit_log
      for each row execute function audit.trg_prepare_audit_log();
    create trigger trg_audit_log_immutable
      before update or delete on audit.audit_log
      for each row execute function audit.trg_guard_audit_log_immutable();
    alter table audit.audit_log enable row level security;
    alter table audit.audit_log force row level security;
    create policy tenant_read on audit.audit_log for select
      using (tenant_id = shared.current_tenant_id_soft());
    create policy tenant_insert on audit.audit_log for insert
      with check (tenant_id = shared.current_tenant_id());
    grant usage on schema audit to athyperapp, athyperadmin;
    grant select, insert on audit.audit_log to athyperapp, athyperadmin;
  `);
  if (partialState.rows[0]?.reason_present) {
    await client.query(`
      alter table audit.audit_log
        add constraint audit_log_reason_fk
        foreign key (tenant_id, audit_reason_code_id)
        references master.audit_reason_code(tenant_id, id)
        on delete restrict
    `);
  }
  return true;
}

async function main(): Promise<void> {
  await client.connect();
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '60s'");
    const installedAudit = await ensureCanonicalAudit();

    const auditFunctions = await readFile(
      fileURLToPath(
        new URL("../../ddl/common/audit/07_functions.sql", import.meta.url),
      ),
      "utf8",
    );
    await client.query(auditFunctions);

    const byokSchema = await sourceTable(
      "atlas_byok_audit",
      ["ai", "log"],
    );
    const supportSchema = await sourceTable(
      "atlas_support_session_audit",
      ["ai", "master"],
    );
    const byokRows = byokSchema ? await migrateByok(byokSchema) : 0;
    const supportRows = supportSchema ? await migrateSupport(supportSchema) : 0;
    await installSupportPolicy();

    if (apply) {
      await client.query("commit");
      console.log(
        `Applied Atlas audit consolidation: ${byokRows} BYOK rows, `
        + `${supportRows} support rows`
        + `${installedAudit ? "; installed canonical audit contract" : ""}.`,
      );
    } else {
      await client.query("rollback");
      console.log(
        `Dry run passed: ${byokRows} BYOK rows, ${supportRows} support rows; `
        + `${installedAudit ? "canonical audit installation checked; " : ""}`
        + "transaction rolled back.",
      );
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
