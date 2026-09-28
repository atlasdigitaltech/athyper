import { sql, type Kysely } from "kysely";
import { assertCommonReferenceGraph } from "@athyper/server-contract-metadata";
import type { ReferenceFirstPublicationPorts } from "@athyper/server-plane-studio-meta-entity-authoring";

type Target = Parameters<ReferenceFirstPublicationPorts["qualify"]>[0];
type Database = Kysely<Record<string, never>>;
/** Reads actual target storage and the published IAM catalog. Never grants access,
 * inserts projections, or treats successful compilation as capability readiness. */
export async function qualifyReferencePublicationTarget(target: Target, dependencies: {
  databases: Readonly<Partial<Record<Target["targetPlane"], Database>>>;
  runtime: { qualify(profile: unknown, bindings: unknown): void };
  qualifyCapabilities: ReferenceFirstPublicationPorts["qualify"];
}): Promise<void> {
  const { graph, targetPlane, artifact } = target;
  assertCommonReferenceGraph(graph, targetPlane);
  const db = dependencies.databases[targetPlane];
  if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
  const profiles = graph.runtimeProfiles ?? [];
  if (profiles.length !== 1) throw Error("PUBLICATION_STORAGE_PROFILE_AMBIGUOUS");
  const profile = profiles[0]!;
  if (profile.storagePlane !== targetPlane || profile.storageSchema !== "shared" || !profile.storageObject
    || !/^[a-z][a-z0-9_]*$/.test(profile.storageObject)) throw Error("PUBLICATION_STORAGE_BINDING_INVALID");
  const fields = graph.fields.filter(f => f.status !== "deprecated");
  if (fields.some(f => !f.storagePath || !/^[a-z][a-z0-9_]*$/.test(f.storagePath))) throw Error("PUBLICATION_STORAGE_FIELD_INVALID");
  await db.transaction().setIsolationLevel("repeatable read").execute(async tx => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SET LOCAL statement_timeout='3000ms'`.execute(tx);
    const columns = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema=${profile.storageSchema} AND table_name=${profile.storageObject}`.execute(tx)).rows;
    const names = new Set(columns.map(c => c.column_name));
    if (!names.has("id") || fields.some(f => !names.has(f.storagePath!))) throw Error("PUBLICATION_STORAGE_COLUMNS_MISSING");
    // Compile the actual read against target credentials; catalog visibility alone
    // cannot establish SELECT privilege. No business rows are fetched.
    await sql`SELECT ${sql.join(fields.map(f => sql.ref(f.storagePath!)))} FROM ${sql.table(`${profile.storageSchema}.${profile.storageObject}`)} LIMIT 0`.execute(tx);
    const permissions = (graph.operationPermissions ?? []).filter(p => p.status !== "deprecated");
    for (const binding of permissions) {
      const rows = (await sql<{ scope_kind: string }>`SELECT s.scope_kind::text AS scope_kind
        FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id
        WHERE p.canonical_code=${binding.permissionCode} AND p.permission_kind=${binding.permissionKind}
          AND p.status='published' AND s.status='active'`.execute(tx)).rows;
      const scopes = (graph.operationScopeBindings ?? []).filter(s => s.status !== "deprecated" && s.entityOperationId === binding.entityOperationId && s.targetPlane === targetPlane);
      if (!rows.length || !scopes.length || scopes.some(s => !rows.some(r => r.scope_kind === s.scopeKind))) throw Error("PUBLICATION_PERMISSION_SCOPE_UNAVAILABLE");
    }
  });
  dependencies.runtime.qualify(artifact.descriptor.authorization, artifact.descriptor.authorizationRuntime);
  // Mandatory for every target, including empty capabilities (the provider owns
  // its completeness decision). No fabricated success from an empty registry.
  await dependencies.qualifyCapabilities(target);
}
