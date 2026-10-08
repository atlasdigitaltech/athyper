import { createNativeReviewSource } from "./native-review-source.js";
import { sql } from "kysely";
import {
  createDeclaredOperationBootstrap,
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
    Object.keys(c).sort().join() !==
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
      loader: options.loader,
    }),
    nativeBootstrapProposals: {
      readProposal,
      maximumBytes: c.proposals.maximumBytes,
      audit: options.audit,
      async resolveResources(tx, _context, command, proposal) {
        const graph = proposal.graph;
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
        const ids = compiler.core.identities;
        const idField = ids.find(
          (i) =>
            graph.fields.find((f) => f.id === runtime.idFieldId)
              ?.fieldIdentityId === i.id,
        );
        if (!idField) fail();
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
            identityMode: "fresh",
            identitySources: [],
            operations,
            compiler,
            reader: {
              storagePlane: "studio",
              registration: {
                entityCode: graph.entity.entityCode,
                plane: "studio",
                storage: {
                  schema: runtime.storageSchema!,
                  object: runtime.storageObject!,
                  idField: idField!.fieldKey,
                },
                columns: catalogue.columns.map((column) => column.path),
              },
              permissions: [
                ...new Set(
                  compiler.authorization.permissions.flatMap((p) =>
                    p.permissionCode ? [p.permissionCode] : [],
                  ),
                ),
              ].map((code) => ({ code, scopeKinds: ["tenant"] })),
            },
          },
        };
      },
    },
    nativeBootstrapResources: { components: componentReader, scope },
  };
}
