import { createNativeReviewSource } from "./native-review-source.js";
import { sql, type Kysely } from "kysely";
import {
  createDeclaredOperationBootstrap,
  resolveNativeSuccessorSource,
  resolveNativeBootstrapIdentities,
  readNativeStorageCatalogue,
  sha256,
  type NativeBootstrapPolicy,
  type InstalledNativeSchemaEvidence,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { createNativeBootstrapProposalReader } from "./native-bootstrap-proposals.js";
import { createNativeBootstrapComponents } from "./native-bootstrap-components.js";
import { createNativeComponentEvidenceReader } from "./native-component-evidence.js";
import { assembleNativeBootstrapCompilation } from "./native-bootstrap-compilation.js";
import type { ComponentLoaderOptions } from "../shared/publication/active-component-source.js";
import type { createControlProductCommandRuntime } from "./product-command-runtime.js";

type RuntimeOptions = Parameters<typeof createControlProductCommandRuntime>[0];
type Compilation = Parameters<typeof assembleNativeBootstrapCompilation>[0];
export interface NativeBootstrapStartupConfiguration {
  schema: "entity.local-native-startup/1";
  proposals: Parameters<typeof createNativeBootstrapProposalReader>[0];
  database: InstalledNativeSchemaEvidence;
  commands: NativeBootstrapPolicy["host"]["commands"];
  hostReleaseHash: string;
  targetHostReleaseHashes?: Partial<Record<"neon" | "mesh", string>>;
  componentPins: Parameters<typeof createNativeBootstrapComponents>[0]["pins"];
  initialization: Parameters<typeof createDeclaredOperationBootstrap>[0];
  targets: Compilation["targets"];
  domains: Compilation["domains"];
  referenceContract: Compilation["referenceContract"];
  identityResource: Compilation["identityResource"];
}
/** Production composition used by control-api. No callbacks or authority from
 * proposal JSON. Admission is transaction-bound and schema, storage, component
 * signatures/deployment and current descriptor checks remain on the real path. */
export function createNativeBootstrapStartup(options: {
  configuration: NativeBootstrapStartupConfiguration;
  authorityTenantId: string;
  targetDatabases?: Partial<
    Record<"neon" | "mesh", Kysely<Record<string, never>>>
  >;
  loader: ComponentLoaderOptions;
  audit: NativeBootstrapPolicy["audit"];
}): Pick<
  RuntimeOptions,
  "nativeBootstrapProposals" | "nativeBootstrapResources"
> & { nativeSource: ReturnType<typeof createNativeReviewSource> } {
  const c = structuredClone(options.configuration);
  const fail = (): never => {
    throw Error("CONTROL_NATIVE_BOOTSTRAP_CONFIGURATION_INVALID");
  };
  if (
    !c ||
    c.schema !== "entity.local-native-startup/1" ||
    Object.keys(c)
      .filter((key) => key !== "targetHostReleaseHashes")
      .sort()
      .join() !==
      "commands,componentPins,database,domains,hostReleaseHash,identityResource,initialization,proposals,referenceContract,schema,targets" ||
    !/^[a-f0-9]{64}$/.test(c.hostReleaseHash) ||
    !Array.isArray(c.targets) ||
    c.targets.length > 256 ||
    !Array.isArray(c.domains) ||
    c.domains.length > 256 ||
    !Number.isSafeInteger(c.commands?.maxMembers) ||
    c.commands.maxMembers < 1 ||
    c.commands.maxMembers > 10000 ||
    c.commands.maxBatchBytes !== c.proposals.maximumBytes
  )
    fail();
  const readProposal = createNativeBootstrapProposalReader(c.proposals);
  const operations = createDeclaredOperationBootstrap(c.initialization);
  const admit: NativeBootstrapPolicy["host"]["admit"] = async (
    tx,
    input,
    intent,
  ) => {
    if (!tx.isTransaction || input.tenantId !== null || intent !== "write")
      fail();
    const result = await sql<{
      admitted: boolean;
    }>`SELECT entity_command_private.admitted_creation(${input.changeSetId}::uuid,${input.entityId}::uuid)
     AND current_setting('app.current_principal_id',true)=${input.actorId}
     AND current_setting('app.current_tenant_id',true)=${options.authorityTenantId} AS admitted`.execute(
      tx,
    );
    if (result.rows.length !== 1 || result.rows[0]!.admitted !== true)
      throw Error("CONTROL_NATIVE_BOOTSTRAP_ADMISSION_REQUIRED");
  };
  const componentReader = createNativeBootstrapComponents({
    maximumComponents: 256,
    pins: c.componentPins,
    read: createNativeComponentEvidenceReader({
      loader: options.loader,
      maximumBytes: c.proposals.maximumBytes,
    }),
    admit: async (tx, input) => {
      const row = await sql<{
        admitted: boolean;
      }>`SELECT entity_command_private.admitted(${input.changeSetId}::uuid) AS admitted`.execute(
        tx,
      );
      if (row.rows[0]?.admitted !== true)
        throw Error("CONTROL_NATIVE_COMPONENT_ADMISSION_REQUIRED");
    },
  });
  const scope = async () => ({
    tenantId: null,
    plane: "studio" as const,
    hostReleaseHash: c.hostReleaseHash,
  });
  const unsupported = async (): Promise<never> => {
    throw Error("PRODUCT_NATIVE_BOOTSTRAP_HOST_ONLY");
  };
  return {
    nativeSource: createNativeReviewSource({
      configuration: c,
      targetDatabases: options.targetDatabases,
      loader: options.loader,
    }),
    nativeBootstrapProposals: {
      readProposal,
      maximumBytes: c.proposals.maximumBytes,
      audit: options.audit,
      async resolveResources(tx, _context, command, proposal) {
        const graph = proposal.graph;
        const successor =
          proposal.baseReleaseId === null
            ? undefined
            : await resolveNativeSuccessorSource(
                tx,
                command,
                proposal.baseReleaseId,
                graph,
                c.proposals.maximumBytes,
              );
        const installedIdentities = successor
          ? await resolveNativeBootstrapIdentities(tx, command, graph)
          : undefined;
        if (
          graph.authoringSource.authoringSchemaHash !==
            c.commands.authoringSchemaHash ||
          graph.runtimeProfiles.length !== 1
        )
          fail();
        const runtime = graph.runtimeProfiles[0]!;
        if (
          !runtime.storageSchema ||
          !runtime.storageObject ||
          runtime.storagePlane !== "studio"
        )
          fail();
        const catalogue = await readNativeStorageCatalogue(tx, "studio", {
          plane: "studio",
          schema: runtime.storageSchema!,
          object: runtime.storageObject!,
        });
        if (catalogue.hash !== runtime.storageCatalogueHash)
          throw Error("PRODUCT_NATIVE_STORAGE_CATALOGUE_CHANGED");
        const components = await componentReader(tx, graph, await scope());
        // Reference target identities are real product roots, not author-created
        // tenant IDs. Missing visibility is a grant defect, never inferred access.
        for (const target of c.targets.filter((target) =>
          graph.relationTargets?.some(
            (t) =>
              t.targetEntityId === target.entityId &&
              t.targetKeyKey === target.keyKey,
          ),
        )) {
          const found = await sql<{
            present: boolean;
          }>`SELECT entity_command_private.native_reference_target_exists(${command.changeSetId}::uuid,${target.entityId}::uuid,${target.entityCode}) AS present`.execute(
            tx,
          );
          if (found.rows.length !== 1 || found.rows[0]!.present !== true)
            throw Error("CONTROL_NATIVE_TARGET_UNAVAILABLE");
        }
        // Database domains must actually accept each declared choice. Quoted type
        // identifiers come only from bounded startup config; values remain bound.
        for (const domain of c.domains) {
          if (
            !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(domain.code) ||
            !Array.isArray(domain.values) ||
            domain.values.length > 256
          )
            fail();
          for (const value of domain.values)
            await sql`SELECT ${value}::${sql.ref(domain.code)}`.execute(tx);
        }
        const compiler = assembleNativeBootstrapCompilation({
          targetPlane: "studio",
          ...(installedIdentities ? { installedIdentities } : {}),
          command,
          graph,
          catalogue,
          components: {
            core: components.coreComponents,
            layout: components.layoutComponents,
            components: components.runtimeComponents,
            componentResourceEvidence: components.evidence,
          },
          targets: c.targets,
          domains: c.domains,
          referenceContract: c.referenceContract,
          identityResource: c.identityResource,
          maximumMembers: c.commands.maxMembers,
        });
        const readerFor = (
          context: typeof compiler,
          storage: typeof catalogue,
        ) => {
          const identity = context.core.identities.find(
            (i) =>
              graph.fields.find((f) => f.id === runtime.idFieldId)
                ?.fieldIdentityId === i.id,
          );
          if (!identity)
            throw Error("CONTROL_NATIVE_BOOTSTRAP_IDENTITY_REQUIRED");
          return {
            storagePlane: context.authorization.plane,
            registration: {
              entityCode: graph.entity.entityCode,
              plane: context.authorization.plane,
              storage: {
                schema: runtime.storageSchema!,
                object: runtime.storageObject!,
                idField: identity.fieldKey,
              },
              columns: storage.columns.map((column) => column.path),
            },
            permissions: [
              ...new Set(
                context.authorization.permissions.flatMap((p) =>
                  p.permissionCode ? [p.permissionCode] : [],
                ),
              ),
            ].map((code) => ({ code, scopeKinds: ["tenant"] })),
          };
        };
        const declared = graph.referenceMembers?.members.target.map(
          (t) => t.targetPlane,
        );
        if (
          !declared?.includes("studio") ||
          new Set(declared).size !== declared.length
        )
          fail();
        const targetCompilers = [compiler];
        const targetReaders = [readerFor(compiler, catalogue)];
        for (const plane of declared!) {
          if (plane === "studio") continue;
          const database = options.targetDatabases?.[plane];
          const hostReleaseHash = c.targetHostReleaseHashes?.[plane];
          if (!database || !hostReleaseHash)
            throw Error("CONTROL_NATIVE_BOOTSTRAP_TARGET_BINDING_REQUIRED");
          const target = await database
            .transaction()
            .setIsolationLevel("repeatable read")
            .execute(async (targetTx) => {
              await sql`SET TRANSACTION READ ONLY`.execute(targetTx);
              const role = await sql<{
                safe: boolean;
              }>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`.execute(
                targetTx,
              );
              if (role.rows.length !== 1 || role.rows[0]?.safe !== true)
                throw Error("CONTROL_NATIVE_BOOTSTRAP_TARGET_ROLE_INVALID");
              const storage = await readNativeStorageCatalogue(
                targetTx,
                plane,
                {
                  plane,
                  schema: runtime.storageSchema!,
                  object: runtime.storageObject!,
                },
              );
              for (const domain of c.domains)
                for (const value of domain.values)
                  await sql`SELECT ${value}::${sql.ref(domain.code)}`.execute(
                    targetTx,
                  );
              const installed = await componentReader(tx, graph, {
                tenantId: null,
                plane,
                hostReleaseHash,
              });
              const context = assembleNativeBootstrapCompilation({
                installedIdentities: compiler.core.identities,
                targetPlane: plane,
                command,
                graph,
                catalogue: storage,
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
              return { context, reader: readerFor(context, storage) };
            });
          targetCompilers.push(target.context);
          targetReaders.push(target.reader);
        }
        return {
          schema: c.database,
          host: {
            commands: c.commands,
            snapshotVersions: [2],
            admit,
            resolveContext: unsupported,
            resolveInitializer: unsupported,
          },
          qualify: async (transaction, input) => {
            if (transaction !== tx || sha256(input) !== sha256(command)) fail();
            await admit(
              transaction,
              {
                ...input,
                batch: { contract: "entity.authoring-native-bootstrap/1" },
              },
              "write",
            );
          },
          preparation: {
            identityMode: successor ? "installed" : "fresh",
            identitySources: successor?.identitySources ?? [],
            operations: successor?.operations ?? operations,
            compiler,
            reader: targetReaders[0]!,
            ...(targetCompilers.length > 1
              ? { targetCompilers, targetReaders }
              : {}),
          },
        };
      },
    },
    nativeBootstrapResources: { components: componentReader, scope },
  };
}
