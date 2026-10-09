import { sql, type Kysely, type Transaction } from "kysely";
import type {
  AuthoringPlane,
  ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  sha256,
  canonicalJson,
  nativeOperationFromStorage,
  readNativeStorageCatalogue,
  compileUiComponentProjection,
  type NativeCompiledOperation,
  type ProductReviewPorts,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { createNativeBootstrapComponents } from "./native-bootstrap-components.js";
import { assembleNativeBootstrapCompilation } from "./native-bootstrap-compilation.js";
import type { NativeBootstrapStartupConfiguration } from "./native-bootstrap-startup.js";
import {
  verifyActiveComponentSource,
  type ActiveComponentSourceRow,
  type ComponentLoaderOptions,
} from "../shared/publication/active-component-source.js";

/** Authenticated control transaction reader, not proposal-file authority.
 * Source, stored controls, identities, current DDL and signed component heads are
 * resolved independently before native compilation. No initialization or writes. */
export function createNativeReviewSource(options: {
  authority?: "human-review" | "publication-worker";
  configuration: NativeBootstrapStartupConfiguration;
  loader: ComponentLoaderOptions;
  targetDatabases?: Partial<
    Record<"neon" | "mesh", Kysely<Record<string, never>>>
  >;
}): (
  database: Kysely<Record<string, never>>,
  id: string,
) => ReturnType<ProductReviewPorts["nativeSource"]> {
  const c = structuredClone(options.configuration);
  // Function choice is trusted composition, never a request field. Worker reads
  // recheck independently enrolled publication authority in PostgreSQL.
  const sourceFunction = sql.raw(
    options.authority === "publication-worker"
      ? "publication.read_native_worker_source"
      : "publication.read_native_product_review_source",
  );
  const componentFunction = sql.raw(
    options.authority === "publication-worker"
      ? "publication.read_native_worker_component"
      : "publication.read_native_review_component",
  );
  const fail = (): never => {
    throw Error("NATIVE_REVIEW_SOURCE_INVALID");
  };
  if (
    c.schema !== "entity.local-native-startup/1" ||
    !/^[a-f0-9]{64}$/.test(c.commands.authoringSchemaHash) ||
    !/^[a-f0-9]{64}$/.test(c.hostReleaseHash) ||
    !Number.isSafeInteger(c.proposals.maximumBytes) ||
    c.proposals.maximumBytes < 1 ||
    c.proposals.maximumBytes > 4194304 ||
    !Number.isSafeInteger(c.commands.maxMembers) ||
    c.commands.maxMembers < 1 ||
    c.commands.maxMembers > 10000
  )
    fail();
  if (
    c.targetHostReleaseHashes &&
    Object.entries(c.targetHostReleaseHashes).some(
      ([plane, hash]) =>
        !["neon", "mesh"].includes(plane) || !/^[a-f0-9]{64}$/.test(hash),
    )
  )
    fail();
  const components = (scope: {
    tenantId: null;
    plane: AuthoringPlane;
    hostReleaseHash: string;
  }) =>
    createNativeBootstrapComponents({
      maximumComponents: 256,
      pins: c.componentPins,
      async admit(tx, input) {
        // This restricted reader authenticates the human and locks the exact root.
        const r =
          await sql`SELECT 1 FROM ${sourceFunction}(${input.changeSetId}::uuid,${c.proposals.maximumBytes})`.execute(
            tx,
          );
        if (r.rows.length !== 1) fail();
      },
      async read(tx, input) {
        const rows = (
          await sql<ActiveComponentSourceRow>`SELECT * FROM ${componentFunction}(${input.changeSetId}::uuid,${input.componentId}::uuid,${input.manifestHash},${input.publicationReleaseHash},${c.proposals.maximumBytes})`.execute(
            tx,
          )
        ).rows;
        if (rows.length !== 1) return fail();
        const row = rows[0]!,
          source = await verifyActiveComponentSource(row, options.loader);
        if (
          source.declaration.id !== input.componentId ||
          source.declaration.tenantId !== null ||
          !source.declaration.supportedPlanes.includes(scope.plane) ||
          row.payload_hash !== input.manifestHash ||
          row.release_hash !== input.publicationReleaseHash
        )
          fail();
        return {
          contract: await compileUiComponentProjection(source, async () => ({
            sourceHash: row.payload_hash,
            publicationReleaseHash: row.release_hash,
            implementationHash: source.implementation.sourceHash,
          })),
          plane: scope.plane,
          hostReleaseHash: scope.hostReleaseHash,
          runtimeKey: source.implementation.runtimeKey,
          evidenceHash: sha256({
            artifactHash: row.artifact_hash,
            payloadHash: row.payload_hash,
            releaseHash: row.release_hash,
            hostReleaseHash: scope.hostReleaseHash,
            plane: scope.plane,
          }),
        };
      },
    });
  return async (database, id) => {
    if (!database.isTransaction) return fail();
    const tx = database as Transaction<Record<string, never>>;
    const rows = (
      await sql<{
        root_json: {
          id: string;
          entity_id: string;
          tenant_id: null;
          source_kind: string;
          native_core_layout_version: number;
          authoring_schema_hash: string;
          lock_version: number | string;
          created_by: string;
        };
        graph: ExpandedNativeMetaEntityGraph;
        graph_hash: string;
        operation_rows: Record<string, unknown>[];
        identity_rows: Record<string, unknown>[];
      }>`SELECT * FROM ${sourceFunction}(${id}::uuid,${c.proposals.maximumBytes})`.execute(
        tx,
      )
    ).rows;
    if (rows.length !== 1) return fail();
    const row = rows[0]!,
      graph = row.graph,
      root = row.root_json;
    if (
      root.id !== id ||
      root.tenant_id !== null ||
      root.source_kind !== "product" ||
      root.native_core_layout_version !== 2 ||
      root.authoring_schema_hash !== c.commands.authoringSchemaHash ||
      sha256(graph) !== row.graph_hash ||
      graph.authoringSource.entityId !== root.entity_id ||
      graph.ownedLabels?.changeSetId !== id ||
      graph.authoringSource.authoringSchemaHash !==
        root.authoring_schema_hash ||
      graph.runtimeProfiles.length !== 1 ||
      row.operation_rows.length !== graph.operations.length ||
      row.operation_rows.length > c.commands.maxMembers
    )
      return fail();
    const controls: NativeCompiledOperation[] = graph.operations.map(
      (operation) => {
        const stored = row.operation_rows.filter((o) => o.id === operation.id);
        if (
          stored.length !== 1 ||
          typeof stored[0]!.requires_mfa !== "boolean" ||
          canonicalJson(nativeOperationFromStorage(stored[0]!)) !==
            canonicalJson(operation)
        )
          return fail();
        return {
          ...operation,
          requiresMfa: stored[0]!.requires_mfa as boolean,
        };
      },
    );
    const runtime = graph.runtimeProfiles[0]!;
    if (
      runtime.storagePlane !== "studio" ||
      !runtime.storageSchema ||
      !runtime.storageObject
    )
      return fail();
    for (const target of c.targets.filter((t) =>
      graph.relationTargets?.some(
        (r) => r.targetEntityId === t.entityId && r.targetKeyKey === t.keyKey,
      ),
    )) {
      const r =
        await sql`SELECT id FROM metadata.entity WHERE id=${target.entityId}::uuid AND entity_code=${target.entityCode} AND tenant_id IS NULL AND ownership_model='system'`.execute(
          tx,
        );
      if (r.rows.length !== 1) return fail();
    }
    const declared = graph.referenceMembers?.members.target.map(
      (target) => target.targetPlane,
    );
    if (
      !declared?.length ||
      new Set(declared).size !== declared.length ||
      !declared.includes("studio")
    )
      return fail();
    const compileTarget = async (
      plane: AuthoringPlane,
      catalogueTx: Transaction<Record<string, never>>,
    ) => {
      const hostReleaseHash =
        plane === "studio"
          ? c.hostReleaseHash
          : c.targetHostReleaseHashes?.[plane];
      if (!hostReleaseHash) throw Error("NATIVE_REVIEW_TARGET_HOST_REQUIRED");
      const catalogue = await readNativeStorageCatalogue(catalogueTx, plane, {
        plane,
        schema: runtime.storageSchema!,
        object: runtime.storageObject!,
      });
      if (plane === "studio" && catalogue.hash !== runtime.storageCatalogueHash)
        return fail();
      const scope = { tenantId: null, plane, hostReleaseHash } as const;
      const installed = await components(scope)(tx, graph, scope);
      for (const domain of c.domains) {
        if (
          !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(domain.code) ||
          domain.values.length > 256
        )
          return fail();
        for (const value of domain.values)
          await sql`SELECT ${value}::${sql.ref(domain.code)}`.execute(
            catalogueTx,
          );
      }
      const installedIdentities = row.identity_rows.map((identity) => {
        if (
          typeof identity.id !== "string" ||
          typeof identity.field_key !== "string" ||
          identity.entity_id !== root.entity_id ||
          identity.tenant_id !== null ||
          (identity.parent_identity_id !== null &&
            typeof identity.parent_identity_id !== "string")
        )
          return fail();
        return {
          id: identity.id,
          entityId: root.entity_id,
          tenantId: null,
          fieldKey: identity.field_key,
          parentIdentityId: identity.parent_identity_id as string | null,
        };
      });
      const identityOrder =
        graph.fieldIdentities?.map((identity) => identity.id) ??
        graph.fields.map((field) => field.fieldIdentityId);
      const orderedIdentities = identityOrder.map(
        (id) =>
          installedIdentities.find((identity) => identity.id === id) ?? fail(),
      );
      const compiler = assembleNativeBootstrapCompilation({
        installedIdentities: orderedIdentities,
        targetPlane: plane,
        command: {
          changeSetId: id,
          entityId: root.entity_id,
          tenantId: null,
          actorId: root.created_by,
          proposalHash: row.graph_hash,
          idempotencyKey: "native-review-read",
        },
        graph,
        catalogue,
        components: {
          core: installed.coreComponents,
          layout: installed.layoutComponents,
          components: installed.runtimeComponents,
          componentResourceEvidence: installed.evidence,
        },
        targets: c.targets,
        domains: c.domains,
        referenceContract: c.referenceContract,
        identityResource: c.identityResource,
        maximumMembers: c.commands.maxMembers,
      });
      return compiler;
    };
    const targetCompilers = [];
    for (const plane of declared) {
      if (plane === "studio")
        targetCompilers.push(await compileTarget(plane, tx));
      else {
        const database = options.targetDatabases?.[plane];
        if (!database) throw Error("NATIVE_REVIEW_TARGET_DATABASE_REQUIRED");
        targetCompilers.push(
          await database
            .transaction()
            .setIsolationLevel("repeatable read")
            .execute(async (targetTx) => {
              await sql`SET TRANSACTION READ ONLY`.execute(targetTx);
              const roles = (
                await sql<{
                  safe: boolean;
                }>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`.execute(
                  targetTx,
                )
              ).rows;
              if (roles.length !== 1 || !roles[0]!.safe)
                throw Error("NATIVE_REVIEW_TARGET_ROLE_UNSAFE");
              return compileTarget(plane, targetTx);
            }),
        );
      }
    }
    const compiler = targetCompilers.find(
      (context) => context.authorization.plane === "studio",
    )!;
    if (
      row.identity_rows.length !== compiler.core.identities.length ||
      compiler.core.identities.some(
        (i) =>
          !row.identity_rows.some(
            (s) =>
              s.id === i.id &&
              s.entity_id === i.entityId &&
              s.tenant_id === i.tenantId &&
              s.field_key === i.fieldKey &&
              s.parent_identity_id === i.parentIdentityId &&
              (s.identity_status === "active" ||
                (s.identity_status === "reserved" &&
                  (s.introduced_change_set_id === id ||
                    s.native_available === true))),
          ),
      )
    )
      return fail();
    return {
      graph,
      compiler,
      controls,
      ...(declared.length > 1 ? { targetCompilers } : {}),
    };
  };
}
