import { assertGraphPreviewAiBindings } from "./graph-preview-ai-bindings.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, type Kysely } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  createDurableGraphPreview,
  DurableGraphPreviewStore,
} from "@athyper/server-plane-studio";
import { compileNativeRuntimeProjection } from "@athyper/server-platform-metadata";
import {
  compileDocumentCollection,
  localPreviewRoot,
} from "@athyper/server-service-publication";

type Database = Kysely<Record<string, never>>;
type Plane = "studio" | "neon" | "mesh";
export function localGraphPreview(options: {
  repository: { get(id: string): Promise<any> };
  authorizer: Authorizer;
  refresh(context: VerifiedRequestContext): Promise<VerifiedRequestContext>;
  run<T>(
    plane: Plane,
    actor: { tenantId: string; principalId: string },
    work: (db: Database) => Promise<T>,
  ): Promise<T>;
  qualify(profile: unknown, bindings: unknown): void;
}) {
  const root = localPreviewRoot();
  if (!root) return undefined;
  const store = new DurableGraphPreviewStore(
    join(root, "meta-entity.sqlite"),
    readFileSync(join(root, "public.pem"), "utf8"),
  );
  return createDurableGraphPreview({
    store,
    privateKey: readFileSync(
      process.env.ATHYPER_LOCAL_PREVIEW_SIGNING_KEY_FILE ??
        join(root, "../preview-private.pem"),
      "utf8",
    ),
    async assertCurrent(input) {
      const context = input.context
        ? await options.refresh(input.context)
        : undefined;
      if (
        !context ||
        context.planeKey !== "studio" ||
        context.tenantId !== input.changeSet.tenantId ||
        context.principalId !== input.actorId ||
        !(
          await options.authorizer.authorize({
            context,
            permissionCode: "metadata.entity.author",
          })
        ).allowed
      )
        throw Error("GRAPH_PREVIEW_AUTHOR_DENIED");
      const current = await options.repository.get(input.changeSet.id);
      if (
        !current ||
        current.status !== "draft" ||
        current.revision !== input.changeSet.revision ||
        current.tenantId !== input.changeSet.tenantId ||
        current.entityCode !== input.graph.entity.entityCode
      )
        throw Error("GRAPH_PREVIEW_SAVED_REVISION_CHANGED");
    },
    async resolve(_input, dependencies) {
      // These branches need their native runtime materializers. Never accept
      // them just because their IDs exist in the authoring database.
      const unsupported = dependencies.find((reference) =>
        ["policy", "lifecycle", "numbering", "entity"].includes(reference.kind),
      );
      if (unsupported)
        throw Error(
          `GRAPH_PREVIEW_DEPENDENCY_ADAPTER_REQUIRED:${unsupported.kind}:${unsupported.key}`,
        );
    },
    async project(input, artifact) {
      const native = artifact.descriptor;
      const profile = native.authorization as { planeKey?: Plane } | undefined;
      const plane = profile?.planeKey;
      if (!plane || !["studio", "neon", "mesh"].includes(plane))
        throw Error("GRAPH_PREVIEW_RUNTIME_PROFILE_REQUIRED");
      const targetPlanes = new Set(
        input.graph.operationPermissions
          ?.filter((row) => row.status !== "deprecated")
          .map((row) => row.targetPlane),
      );
      if (
        targetPlanes.size !== 1 ||
        !targetPlanes.has(plane as "neon" | "mesh")
      )
        throw Error("GRAPH_PREVIEW_PLANE_SET_INCOMPATIBLE");
      return options.run(
        plane,
        { tenantId: input.changeSet.tenantId!, principalId: input.actorId },
        async (db) => {
          const permissions = (
            await sql<{
              id: string;
              code: string;
              kind: "entity_operation" | "capability";
              scopeKinds: string[];
            }>`SELECT p.id,p.canonical_code code,p.permission_kind kind,array_agg(DISTINCT s.scope_kind::text ORDER BY s.scope_kind::text) "scopeKinds"
          FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.status='active'
          WHERE p.status='published' GROUP BY p.id,p.canonical_code,p.permission_kind`.execute(
              db,
            )
          ).rows;
          if (native.collectionRelationship) {
            // Use the same registered collection compiler as native publication.
            // It fixes storage, subject, resolver and allowed summary fields.
            const descriptor = compileDocumentCollection(
              native,
              plane,
              permissions,
            );
            const subject = descriptor.collectionRelationship.subject.value;
            const contract = (
              await sql`SELECT d.id FROM runtime_meta.release_activation_head h
            JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
            JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' AND d.descriptor_kind='entity_case_runtime'
            JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published'
            WHERE c.entity_code=${subject} AND d.plane_code=${plane} AND (c.tenant_id IS NULL OR c.tenant_id=${input.changeSet.tenantId}::uuid) LIMIT 1`.execute(
                db,
              )
            ).rows;
            if (!contract.length)
              throw Error(`GRAPH_PREVIEW_CASE_CONTRACT_REQUIRED:${subject}`);
            const columns = (
              await sql<{
                column_name: string;
              }>`SELECT column_name FROM information_schema.columns WHERE table_schema=${descriptor.storage.schema} AND table_name=${descriptor.storage.object}`.execute(
                db,
              )
            ).rows.map((row) => row.column_name);
            if (
              descriptor.fields.some(
                (field) => !columns.includes(field.storagePath),
              )
            )
              throw Error("GRAPH_PREVIEW_COLLECTION_STORAGE_UNAVAILABLE");
            const operationBindings = Object.entries(descriptor.operations).map(
              ([key, operation]) => ({
                entityCode: input.graph.entity.entityCode,
                operationKey: key,
                permissionCode: operation.permissionCode,
                decisionMode: "collection",
                requiredScopeKinds: ["operating_organization"],
              }),
            );
            return { [plane]: { descriptor, operationBindings } };
          }
          let baseline = (
            await sql<{
              compiled_json: Record<string, any>;
            }>`SELECT d.compiled_json
          FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
          JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' AND d.descriptor_kind='entity_runtime'
          JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published'
          WHERE c.entity_code=${input.graph.entity.entityCode} AND d.plane_code=${plane} AND (c.tenant_id IS NULL OR c.tenant_id=${input.changeSet.tenantId}::uuid)
          ORDER BY (c.tenant_id IS NOT NULL) DESC,c.release_no DESC LIMIT 1`.execute(
              db,
            )
          ).rows[0]?.compiled_json;
          if (!baseline) {
            // A new personal runtime can use the already published native runtime
            // registration from Studio. This is an immutable server-side source,
            // not a storage coordinate accepted from the submitted graph.
            baseline = await options.run(
              "studio",
              {
                tenantId: input.changeSet.tenantId!,
                principalId: input.actorId,
              },
              async (source) =>
                (
                  await sql<{ compiled_json: Record<string, any> }>`
            SELECT a.compiled_json FROM snapshot.entity_release_artifact a
            JOIN metadata.entity_release r ON r.id=a.source_release_id AND r.tenant_id=a.tenant_id
            JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
            JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.tenant_id=r.tenant_id
            WHERE r.tenant_id=${input.changeSet.tenantId}::uuid AND e.entity_code=${input.graph.entity.entityCode}
              AND a.plane_key=${plane} AND cs.status='published' AND cs.approved_by IS NOT NULL
              AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
              AND r.signature_algorithm='Ed25519' AND r.contract_signature IS NOT NULL
              AND a.compiled_json->>'schema'='athyper.entity-runtime-descriptor/1.0'
              AND NOT EXISTS (SELECT 1 FROM publication.entity_baseline_release_link l JOIN metadata.entity_baseline_import_revocation v ON v.baseline_id=l.baseline_id WHERE l.entity_release_id=r.id)
            ORDER BY r.release_no DESC LIMIT 1`.execute(source)
                ).rows[0]?.compiled_json,
            );
          }
          // Existing storage registration is the authority for the initial live
          // adapter. New storage and ownership resolvers require native registration.
          if (!baseline?.storage)
            throw Error("GRAPH_PREVIEW_STORAGE_REGISTRATION_REQUIRED");
          assertGraphPreviewAiBindings(native, baseline);
          const storage = baseline.storage as {
            schema: string;
            object: string;
            idField: string;
            tenantField: string;
            versionField?: string;
            statusField?: string;
          };
          for (const runtime of input.graph.runtimeProfiles ?? [])
            if (
              runtime.storageObject &&
              (runtime.storageSchema !== storage.schema ||
                runtime.storageObject !== storage.object ||
                runtime.storagePlane !== plane)
            )
              throw Error("GRAPH_PREVIEW_STORAGE_REGISTRATION_MISMATCH");
          const columns = (
            await sql<{
              column_name: string;
            }>`SELECT column_name FROM information_schema.columns WHERE table_schema=${storage.schema} AND table_name=${storage.object}`.execute(
              db,
            )
          ).rows.map((row) => row.column_name);
          const descriptor = compileNativeRuntimeProjection({
            native,
            registration: {
              entityCode: input.graph.entity.entityCode,
              plane,
              storage,
              columns,
              presentationDefaults: baseline,
              fieldPresentationDefaults: Object.fromEntries(
                (baseline.fields ?? []).map((field: any) => [
                  field.key,
                  field.list ?? {},
                ]),
              ),
              ...(typeof baseline.detailRouteTemplate === "string"
                ? { detailRouteTemplate: baseline.detailRouteTemplate }
                : {}),
            },
            permissions,
          });
          if (!native.authorizationRuntime)
            throw Error("GRAPH_PREVIEW_RUNTIME_BINDINGS_REQUIRED");
          options.qualify(native.authorization, native.authorizationRuntime);
          const operationBindings = input.graph.operations
            .filter((operation) => operation.status !== "deprecated")
            .map((operation) => {
              const permission = input.graph.operationPermissions!.find(
                (binding) =>
                  binding.entityOperationId === operation.id &&
                  binding.targetPlane === plane &&
                  binding.status !== "deprecated",
              )!;
              const scopes = input.graph.operationScopeBindings!.filter(
                (binding) =>
                  binding.entityOperationId === operation.id &&
                  binding.targetPlane === plane &&
                  binding.status !== "deprecated",
              );
              if (new Set(scopes.map((scope) => scope.decisionMode)).size !== 1)
                throw Error("GRAPH_PREVIEW_DECISION_MODE_MISMATCH");
              return {
                entityCode: input.graph.entity.entityCode,
                operationKey: operation.operationKey,
                permissionCode: permission.permissionCode,
                decisionMode: scopes[0]!.decisionMode,
                requiredScopeKinds: [
                  ...new Set(scopes.map((scope) => scope.scopeKind)),
                ].sort(),
              };
            });
          return { [plane]: { descriptor, operationBindings } };
        },
      );
    },
  });
}
