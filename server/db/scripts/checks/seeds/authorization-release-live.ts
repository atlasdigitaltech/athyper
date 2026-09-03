import { createHash } from "node:crypto";
import type { Client } from "pg";

type Plane = "studio" | "neon" | "mesh";
type Gate = { status: "pass" | "fail" | "not_run"; summary: string; evidence?: unknown };
type Pack = {
  tenantAuthorityProjection: {
    definitions: {
      rolePermissions: Array<{ roleId: string; permissionId: string }>;
    };
    assignments: {
      groupMembers: Array<{ tenantId: string; groupId: string; keycloakSubject: string }>;
      groupRoles: Array<{ tenantId: string; groupId: string; roleId: string; scopeTargetId: string; propagationMode: string }>;
    };
  };
};

const planes: readonly Plane[] = ["studio", "neon", "mesh"];
const AUTHORITY_SNAPSHOT_RELATIONS = [
  "authz.permission", "authz.permission_scope_kind", "authz.role", "authz.role_permission",
  "authz.principal_group", "authz.plane_membership", "authz.scope_target", "authz.group_member", "authz.group_role",
] as const;
const AUTHORITY_SNAPSHOT_EXCLUSIONS = ["public.seed_pack_ledger_v2", "public.seed_pack_execution_v2"] as const;

export type RoleProbe = { violations: number; checks: Array<{ name: string; pass: boolean; sqlState?: string; detail?: string }> };

export async function verifyProjectionRoleBehavior(client: Client): Promise<RoleProbe> {
  const checks: RoleProbe["checks"] = [];
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE athyper_projection_applier");
    await expectSqlState(client,
      "UPDATE authz.application_projection SET organization_name=organization_name WHERE false",
      ["42501"], "applier_direct_dml_denied", checks);
    await expectSqlState(client,
      "SELECT authz.fn_stage_application_projection(NULL,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,NULL)",
      ["23514"], "applier_can_execute_mutation_api", checks);

    await client.query("RESET ROLE");
    await client.query("SET LOCAL ROLE athyperadmin");
    await expectSqlState(client, `INSERT INTO authz.application_projection(
        id,tenant_id,realm_key,external_organization_id,organization_name,
        source_projection_id,source_version,source_hash,status,metadata,created_by
      ) VALUES (
        'ffffffff-ffff-4fff-8fff-fffffffffff1','ffffffff-ffff-4fff-8fff-fffffffffff2',
        'rls-probe','rls-probe','RLS probe','ffffffff-ffff-4fff-8fff-fffffffffff3',
        1,repeat('a',64),'pending','{}'::jsonb,'ffffffff-ffff-4fff-8fff-fffffffffff4'
      )`, ["42501"], "admin_direct_dml_denied", checks);
    await expectSqlState(client,
      "SELECT authz.fn_stage_application_projection(NULL,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,NULL)",
      ["42501"], "admin_mutation_api_denied", checks);
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    checks.push({ name: "role_switch_and_probe", pass: false, sqlState: failure.code, detail: failure.message });
  } finally {
    await client.query("ROLLBACK");
  }
  return { violations: checks.filter((check) => !check.pass).length, checks };
}

async function expectSqlState(
  client: Client,
  sql: string,
  expected: string[],
  name: string,
  checks: RoleProbe["checks"],
): Promise<void> {
  const savepoint = `probe_${checks.length}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(sql);
    checks.push({ name, pass: false, detail: `statement succeeded; expected SQLSTATE ${expected.join(" or ")}` });
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    checks.push({ name, pass: failure.code !== undefined && expected.includes(failure.code), sqlState: failure.code, detail: failure.message });
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  }
}

export function expectedMappedUserEdges(pack: Pack): string[] {
  const rolesByGroup = new Map<string, Pack["tenantAuthorityProjection"]["assignments"]["groupRoles"]>();
  for (const groupRole of pack.tenantAuthorityProjection.assignments.groupRoles) {
    const key = `${groupRole.tenantId}:${groupRole.groupId}`;
    rolesByGroup.set(key, [...(rolesByGroup.get(key) ?? []), groupRole]);
  }
  const permissionsByRole = new Map<string, Pack["tenantAuthorityProjection"]["definitions"]["rolePermissions"]>();
  for (const grant of pack.tenantAuthorityProjection.definitions.rolePermissions) {
    permissionsByRole.set(grant.roleId, [...(permissionsByRole.get(grant.roleId) ?? []), grant]);
  }
  const edges = new Set<string>();
  for (const member of pack.tenantAuthorityProjection.assignments.groupMembers) {
    for (const groupRole of rolesByGroup.get(`${member.tenantId}:${member.groupId}`) ?? []) {
      for (const grant of permissionsByRole.get(groupRole.roleId) ?? []) {
        edges.add(edgeKey({
          tenantId: member.tenantId,
          subject: member.keycloakSubject,
          permissionId: grant.permissionId,
          scopeTargetId: groupRole.scopeTargetId,
          propagationMode: groupRole.propagationMode,
        }));
      }
    }
  }
  return [...edges].sort();
}

export function edgeKey(edge: { tenantId: string; subject: string; permissionId: string; scopeTargetId: string; propagationMode: string }): string {
  return `${edge.tenantId}:${edge.subject}:${edge.permissionId}:${edge.scopeTargetId}:${edge.propagationMode}`;
}

export async function verifyDoubleApply(urls: Record<Plane, string>): Promise<Gate> {
  if (!process.argv.includes("--confirm=APPLY_AUTHORIZATION_PACKS_TWICE")) {
    throw new Error("--apply-twice writes seed packs; add --confirm=APPLY_AUTHORIZATION_PACKS_TWICE");
  }
  const { Client } = await import("pg");
  const { applyAuthorizationSeedPack } = await import("../../provisioning/apply-authorization-seed-pack.js");
  const topology = await assertDistinctPlaneDatabases(Client, urls);
  const evidence: Record<string, unknown> = { topology };
  let changed = 0;
  for (const plane of planes) {
    await applyAuthorizationSeedPack({ plane, databaseUrl: urls[plane] });
    const first = await authoritySnapshot(Client, urls[plane]);
    await applyAuthorizationSeedPack({ plane, databaseUrl: urls[plane] });
    const second = await authoritySnapshot(Client, urls[plane]);
    if (first.sha256 !== second.sha256) changed++;
    evidence[plane] = {
      firstSnapshotSha256: first.sha256,
      secondSnapshotSha256: second.sha256,
      equal: first.sha256 === second.sha256,
      relationSnapshots: Object.fromEntries(first.relations.map((relation) => [relation, {
        firstSha256: first.relationSha256[relation],
        secondSha256: second.relationSha256[relation],
        equal: first.relationSha256[relation] === second.relationSha256[relation],
      }])),
      relations: first.relations,
      excludedOperationalEvidence: first.excludedOperationalEvidence,
    };
  }
  return result(changed === 0,
    changed === 0
      ? "Complete seed-owned authority snapshots are byte-equivalent after the second application in three distinct plane databases."
      : `${changed} plane authority snapshot(s) changed on their second pack application.`,
    evidence);
}

async function assertDistinctPlaneDatabases(
  Client: typeof import("pg").Client,
  urls: Record<Plane, string>,
): Promise<Record<Plane, { database: string; plane: string }>> {
  const identities = {} as Record<Plane, { database: string; plane: string }>;
  for (const expectedPlane of planes) {
    const client = new Client({ connectionString: urls[expectedPlane] });
    await client.connect();
    try {
      const identity = (await client.query<{ database: string; plane: string | null }>(
        "SELECT current_database() AS database,current_setting('app.database_plane',true) AS plane",
      )).rows[0];
      if (!identity || identity.plane !== expectedPlane) {
        throw new Error(`${expectedPlane} idempotency URL resolved to database plane ${identity?.plane ?? "unset"}`);
      }
      identities[expectedPlane] = { database: identity.database, plane: identity.plane };
    } finally {
      await client.end();
    }
  }
  const databaseNames = new Set(planes.map((plane) => identities[plane].database));
  if (databaseNames.size !== planes.length) {
    throw new Error("authorization idempotency requires three separate Studio, Neon, and Mesh databases");
  }
  return identities;
}

async function authoritySnapshot(Client: typeof import("pg").Client, databaseUrl: string): Promise<{
  sha256: string;
  relationSha256: Record<string, string>;
  relations: readonly string[];
  excludedOperationalEvidence: readonly string[];
}> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const snapshot: Record<string, unknown[]> = {};
    const relationSha256: Record<string, string> = {};
    for (const relation of AUTHORITY_SNAPSHOT_RELATIONS) {
      const result = await client.query(`SELECT to_jsonb(row) AS value FROM ${relation} AS row ORDER BY id`);
      snapshot[relation] = result.rows.map((row: { value: unknown }) => row.value);
      relationSha256[relation] = sha256(canonical(snapshot[relation]));
    }
    return {
      sha256: sha256(canonical(snapshot)),
      relationSha256,
      relations: AUTHORITY_SNAPSHOT_RELATIONS,
      excludedOperationalEvidence: AUTHORITY_SNAPSHOT_EXCLUSIONS,
    };
  } finally {
    await client.end();
  }
}


function result(pass: boolean, summary: string, evidence?: unknown): Gate {
  return { status: pass ? "pass" : "fail", summary, ...(evidence === undefined ? {} : { evidence }) };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
