import { qualifyPublishedRelationships } from "./relationship-qualification.js";
import { sql, type Kysely } from "kysely";
import { assertCommonReferenceGraph } from "@athyper/server-contract-metadata";
import type { ReferenceFirstPublicationPorts } from "@athyper/server-plane-studio-meta-entity-authoring";

type Target = Parameters<ReferenceFirstPublicationPorts["qualify"]>[0];
type Database = Kysely<Record<string, never>>;
/** Reads actual target storage and the published IAM catalog. Never grants access,
 * inserts projections, or treats successful compilation as capability readiness. */
export async function qualifyReferencePublicationTarget(
  target: Target,
  dependencies: {
    mutationPolicies?: ReadonlySet<string>;
    databases: Readonly<Partial<Record<Target["targetPlane"], Database>>>;
    runtime: { qualify(profile: unknown, bindings: unknown): void };
    qualifyCapabilities: ReferenceFirstPublicationPorts["qualify"];
  },
): Promise<void> {
  const { graph, targetPlane, artifact } = target;
  const tableProduct = graph.surfaces?.some(
    (surface) => surface.layoutConfig?.tableEntityProduct !== undefined,
  );
  if (!tableProduct) assertCommonReferenceGraph(graph, targetPlane);
  else if (
    graph.entity.ownershipModel !== "system" ||
    !["business", "configuration"].includes(graph.entity.entityClass ?? "") ||
    !artifact.descriptor.ownerAccess
  )
    throw Error("PUBLICATION_TABLE_ENTITY_PROFILE_INVALID");
  const policy = artifact.descriptor.mutationPolicy as
    { handlerKey: string } | undefined;
  if (policy && !dependencies.mutationPolicies?.has(policy.handlerKey))
    throw Error("PUBLICATION_MUTATION_POLICY_UNAVAILABLE");
  const db = dependencies.databases[targetPlane];
  if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
  const profiles = graph.runtimeProfiles ?? [];
  if (profiles.length !== 1)
    throw Error("PUBLICATION_STORAGE_PROFILE_AMBIGUOUS");
  const profile = profiles[0]!;
  if (
    profile.storagePlane !== targetPlane ||
    !(tableProduct ? ["master"] : ["shared"]).includes(
      profile.storageSchema ?? "",
    ) ||
    !profile.storageObject ||
    !/^[a-z][a-z0-9_]*$/.test(profile.storageObject)
  )
    throw Error("PUBLICATION_STORAGE_BINDING_INVALID");
  const fields = graph.fields.filter((f) => f.status !== "deprecated");
  if (
    fields.some(
      (f) => !f.storagePath || !/^[a-z][a-z0-9_]*$/.test(f.storagePath),
    )
  )
    throw Error("PUBLICATION_STORAGE_FIELD_INVALID");
  await db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SET LOCAL statement_timeout='3000ms'`.execute(tx);
      const columns = (
        await sql<{
          column_name: string;
        }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema=${profile.storageSchema} AND table_name=${profile.storageObject}`.execute(
          tx,
        )
      ).rows;
      const names = new Set(columns.map((c) => c.column_name));
      if (!names.has("id") || fields.some((f) => !names.has(f.storagePath!)))
        throw Error("PUBLICATION_STORAGE_COLUMNS_MISSING");
      if (tableProduct) {
        if (!profile.tenantFieldKey || !names.has(profile.tenantFieldKey))
          throw Error("PUBLICATION_TENANT_STORAGE_REQUIRED");
        const access = artifact.descriptor.ownerAccess as {
          administerPermission: string;
        };
        const admin =
          await sql`SELECT p.id FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id
        WHERE p.canonical_code=${access.administerPermission} AND p.status='published' AND s.status='active' AND s.scope_kind='tenant'`.execute(
            tx,
          );
        if (!admin.rows.length)
          throw Error("PUBLICATION_OWNER_PERMISSION_UNAVAILABLE");
        const policies = await sql<{
          policyname: string;
        }>`SELECT policyname FROM pg_policies WHERE schemaname=${profile.storageSchema} AND tablename=${profile.storageObject}`.execute(
          tx,
        );
        const requiredPolicies = ["entity_owner_admin_read"];
        if (
          graph.operations.some(
            (operation) => operation.operationKey === "create",
          )
        )
          requiredPolicies.push("entity_owner_admin_insert");
        if (
          graph.operations.some(
            (operation) => operation.operationKey === "patch",
          )
        )
          requiredPolicies.push("entity_owner_admin_update");
        if (
          requiredPolicies.some(
            (name) =>
              !policies.rows.some((policy) => policy.policyname === name),
          )
        )
          throw Error("PUBLICATION_OWNER_STORAGE_POLICY_UNAVAILABLE");
        const writes = graph.operations.filter((operation) =>
          ["create", "patch"].includes(operation.operationKey),
        );
        for (const operation of writes) {
          const privilege =
            operation.operationKey === "create" ? "INSERT" : "UPDATE";
          const result = await sql<{
            allowed: boolean;
          }>`SELECT has_table_privilege(current_user,${`${profile.storageSchema}.${profile.storageObject}`},${privilege}) AS allowed`.execute(
            tx,
          );
          if (!result.rows[0]?.allowed)
            throw Error("PUBLICATION_STORAGE_WRITE_PRIVILEGE_REQUIRED");
        }
        if (writes.length) {
          const version = await sql`SELECT trigger.oid FROM pg_trigger trigger
          JOIN pg_class table_ ON table_.oid=trigger.tgrelid JOIN pg_namespace namespace ON namespace.oid=table_.relnamespace
          WHERE namespace.nspname=${profile.storageSchema} AND table_.relname=${profile.storageObject}
            AND trigger.tgname='trg_entity_record_version' AND trigger.tgenabled IN ('O','A')`.execute(
            tx,
          );
          if (!version.rows.length)
            throw Error("PUBLICATION_STORAGE_VERSION_TRIGGER_REQUIRED");
        }
      }
      if (tableProduct) await qualifyPublishedRelationships(graph, tx);
      // Compile the actual read against target credentials; catalog visibility alone
      // cannot establish SELECT privilege. No business rows are fetched.
      await sql`SELECT ${sql.join(fields.map((f) => sql.ref(f.storagePath!)))} FROM ${sql.table(`${profile.storageSchema}.${profile.storageObject}`)} LIMIT 0`.execute(
        tx,
      );
      const permissions = (graph.operationPermissions ?? []).filter(
        (p) => p.status !== "deprecated",
      );
      for (const binding of permissions) {
        const rows = (
          await sql<{
            scope_kind: string;
          }>`SELECT s.scope_kind::text AS scope_kind
        FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id
        WHERE p.canonical_code=${binding.permissionCode} AND p.permission_kind=${binding.permissionKind}
          AND p.status='published' AND s.status='active'`.execute(tx)
        ).rows;
        const scopes = (graph.operationScopeBindings ?? []).filter(
          (s) =>
            s.status !== "deprecated" &&
            s.entityOperationId === binding.entityOperationId &&
            s.targetPlane === targetPlane,
        );
        if (
          !rows.length ||
          !scopes.length ||
          scopes.some((s) => !rows.some((r) => r.scope_kind === s.scopeKind))
        )
          throw Error("PUBLICATION_PERMISSION_SCOPE_UNAVAILABLE");
      }
    });
  dependencies.runtime.qualify(
    artifact.descriptor.authorization,
    artifact.descriptor.authorizationRuntime,
  );
  // Mandatory for every target, including empty capabilities (the provider owns
  // its completeness decision). No fabricated success from an empty registry.
  await dependencies.qualifyCapabilities(target);
}
