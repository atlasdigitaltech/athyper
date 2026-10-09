import { nativePublicationTargets } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  qualifyPublishedRelationships,
  qualifyCoordinatedProductRelationships,
} from "./relationship-qualification.js";
import { sql, type Kysely } from "kysely";
import { assertCommonReferenceGraph } from "@athyper/server-contract-metadata";
import type { ReferenceFirstPublicationPorts } from "@athyper/server-plane-studio-meta-entity-authoring";

type Target = Parameters<ReferenceFirstPublicationPorts["qualify"]>[0];
type Database = Kysely<Record<string, never>>;
/** Tenant-wide reads require explicit published tenant authorization. This does
 * not admit self-service writes or substitute for owner resolution. */
function tenantReadOnly(target: Target): boolean {
  const profile = target.graph.runtimeProfiles?.[0];
  const authorization = target.artifact.descriptor.authorization as
    | {
        planeKey?: string;
        ownership?: string;
        directory?: { population?: string };
        operations?: { key?: string; effect?: string; scope?: string }[];
      }
    | undefined;
  return (
    profile?.writeMode === "none" &&
    target.graph.fields.every((field) => field.writeMode === "read_only") &&
    target.graph.operations.length > 0 &&
    target.graph.operations.every(
      (operation) =>
        ["list", "read"].includes(operation.operationKey) &&
        operation.operationKind === "read",
    ) &&
    authorization?.planeKey === target.targetPlane &&
    authorization.ownership === "tenant.record.v1" &&
    authorization.directory?.population === "tenant" &&
    Array.isArray(authorization.operations) &&
    authorization.operations.length === target.graph.operations.length &&
    authorization.operations.every(
      (operation) =>
        operation.effect === "read" &&
        operation.scope === "tenant.record.v1" &&
        target.graph.operations.some(
          (binding) => binding.operationKey === operation.key,
        ),
    ) &&
    (target.graph.operationScopeBindings?.length ?? 0) > 0 &&
    target.graph.operationScopeBindings!.every(
      (binding) =>
        binding.scopeKind === "tenant" &&
        binding.missingValueBehavior === "deny",
    )
  );
}
/** Reads actual target storage and the published IAM catalog. Never grants access,
 * inserts projections, or treats successful compilation as capability readiness. */
export async function qualifyReferencePublicationTarget(
  target: Target,
  dependencies: {
    mutationPolicies?: ReadonlySet<string>;
    databases: Readonly<Partial<Record<Target["targetPlane"], Database>>>;
    runtime: { qualify(profile: unknown, bindings: unknown): void };
    qualifyCapabilities: ReturnType<
      typeof import("./capability-qualification.js").createCapabilityQualification
    >;
  },
  coordinatedTargets?: readonly Target[],
): Promise<void> {
  const { graph, targetPlane, artifact } = target;
  const tableProduct = graph.surfaces?.some(
    (surface) => surface.layoutConfig?.tableEntityProduct !== undefined,
  );
  if (!tableProduct) assertCommonReferenceGraph(graph, targetPlane);
  else if (
    graph.entity.ownershipModel !== "system" ||
    !["business", "configuration"].includes(graph.entity.entityClass ?? "") ||
    (!artifact.descriptor.ownerAccess && !tenantReadOnly(target))
  )
    throw Error("PUBLICATION_TABLE_ENTITY_PROFILE_INVALID");
  const policy = artifact.descriptor.mutationPolicy as
    { handlerKey: string } | undefined;
  if (policy && !dependencies.mutationPolicies?.has(policy.handlerKey))
    throw Error("PUBLICATION_MUTATION_POLICY_UNAVAILABLE");
  const sourceAuthority = (
    artifact.descriptor.ownerAccess as { sourceAuthority?: string } | undefined
  )?.sourceAuthority;
  if (sourceAuthority !== undefined)
    throw Error("PUBLICATION_SOURCE_AUTHORITY_UNSUPPORTED");
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
        if (artifact.descriptor.ownerAccess) {
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
      }
      if (coordinatedTargets) {
        if (
          !coordinatedTargets.length ||
          coordinatedTargets.some((t) => t.targetPlane !== targetPlane) ||
          coordinatedTargets.filter(
            (t) =>
              t.graph.entity.entityCode === graph.entity.entityCode &&
              t.artifact.contractHash === artifact.contractHash &&
              t.artifact.descriptorHash === artifact.descriptorHash,
          ).length !== 1
        )
          throw Error("PUBLICATION_COORDINATED_TARGET_MISMATCH");
        await qualifyCoordinatedProductRelationships(
          coordinatedTargets.map((t) => t.graph),
          tx,
        );
      } else await qualifyPublishedRelationships(graph, tx);
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

/** Native reference qualification consumes canonical source and compiled
 * relationship semantics directly; it does not synthesize legacy layout markers. */
export async function qualifyNativeReferencePublicationTarget(
  target: Parameters<
    import("@athyper/server-plane-studio-meta-entity-authoring").HumanReviewedPublicationPorts["qualify"]
  >[0][number],
  dependencies: Omit<
    Parameters<typeof qualifyReferencePublicationTarget>[1],
    "qualifyCapabilities"
  > & {
    qualifyCapabilities: ReturnType<
      typeof import("./capability-qualification.js").createCapabilityQualification
    >;
  },
  coordinatedTargets: readonly (typeof target)[],
): Promise<void> {
  const { readNativeStorageCatalogue } =
    await import("@athyper/server-plane-studio-meta-entity-authoring");
  const source = nativeRelationshipQualificationSource;
  const graph = target.graph,
    descriptor = target.artifact.descriptor;
  source(target);
  const profile = graph.runtimeProfiles[0];
  if (
    graph.entity.ownershipModel !== "system" ||
    graph.entity.entityClass !== "reference" ||
    graph.runtimeProfiles.length !== 1 ||
    !profile ||
    profile.storagePlane !== target.targetPlane ||
    profile.storageSchema !== "shared" ||
    !profile.storageObject ||
    !/^[a-z][a-z0-9_]*$/.test(profile.storageObject) ||
    profile.writeMode !== "none" ||
    !graph.fields.length ||
    graph.fields.some(
      (f) =>
        f.writeMode !== "read_only" ||
        f.storageKind !== "column" ||
        !f.storagePath ||
        !/^[a-z][a-z0-9_]*$/.test(f.storagePath),
    ) ||
    graph.operations.some(
      (o) =>
        o.operationKind !== "read" ||
        !["list", "read"].includes(o.operationKey),
    ) ||
    descriptor.ownerAccess !== undefined ||
    descriptor.mutationPolicy !== undefined
  )
    throw Error("NATIVE_PUBLICATION_REFERENCE_PROFILE_REQUIRED");
  if (
    !coordinatedTargets.length ||
    coordinatedTargets.some((t) => t.targetPlane !== target.targetPlane) ||
    coordinatedTargets.filter(
      (t) =>
        t.graph.authoringSource.entityId === graph.authoringSource.entityId &&
        t.artifact.contractHash === target.artifact.contractHash &&
        t.artifact.descriptorHash === target.artifact.descriptorHash,
    ).length !== 1
  )
    throw Error("PUBLICATION_COORDINATED_TARGET_MISMATCH");
  const db = dependencies.databases[target.targetPlane];
  if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
  await db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SET LOCAL statement_timeout='3000ms'`.execute(tx);
      const catalogue = await readNativeStorageCatalogue(
        tx,
        target.targetPlane,
        {
          plane: target.targetPlane,
          schema: profile.storageSchema!,
          object: profile.storageObject!,
        },
      );
      if (catalogue.hash !== profile.storageCatalogueHash)
        throw Error("NATIVE_PUBLICATION_STORAGE_CATALOGUE_CHANGED");
      await qualifyCoordinatedProductRelationships(
        coordinatedTargets.map(source),
        tx,
      );
      await sql`SELECT ${sql.join(graph.fields.map((f) => sql.ref(f.storagePath!)))} FROM ${sql.table(`${profile.storageSchema}.${profile.storageObject}`)} LIMIT 0`.execute(
        tx,
      );
      for (const permission of (graph.operationPermissions ?? []).filter(
        (p) => p.status !== "deprecated",
      )) {
        const rows = (
          await sql<{
            scope_kind: string;
          }>`SELECT s.scope_kind::text AS scope_kind FROM authz.permission p
        JOIN authz.permission_scope_kind s ON s.permission_id=p.id
        WHERE p.canonical_code=${permission.permissionCode} AND p.permission_kind=${permission.permissionKind}
        AND p.status='published' AND s.status='active'`.execute(tx)
        ).rows;
        const scopes = (graph.operationScopeBindings ?? []).filter(
          (s) =>
            s.status !== "deprecated" &&
            s.entityOperationId === permission.entityOperationId &&
            s.targetPlane === target.targetPlane,
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
    descriptor.authorization,
    descriptor.authorizationRuntime,
  );
  await dependencies.qualifyCapabilities(target);
}

export function nativeRelationshipQualificationSource(
  candidate: Parameters<
    import("@athyper/server-plane-studio-meta-entity-authoring").HumanReviewedPublicationPorts["qualify"]
  >[0][number],
): import("./relationship-qualification.js").RelationshipQualificationSource {
  nativePublicationTargets(candidate.graph, candidate.artifact);
  const d = candidate.artifact.descriptor;
  if (
    !Array.isArray(d.fields) ||
    !Array.isArray(d.runtimeProfiles) ||
    !Array.isArray(d.operations) ||
    !d.recordPresentation ||
    typeof d.recordPresentation !== "object"
  )
    throw Error("NATIVE_PUBLICATION_COMPILED_STORAGE_REQUIRED");
  // These are the existing compiler's derived storage/key/reference contracts.
  return {
    entity: candidate.graph.entity,
    fields:
      d.fields as import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph["fields"],
    runtimeProfiles:
      d.runtimeProfiles as import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph["runtimeProfiles"],
    operations:
      d.operations as import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph["operations"],
    recordPresentation: d.recordPresentation,
  };
}
