import { sql, type Transaction } from "kysely";
import {
  compileUiComponentProjection,
  type InstalledComponentEvidence,
  type NativeComponentScope,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  verifyActiveComponentSource,
  type ActiveComponentSourceRow,
  type ComponentLoaderOptions,
} from "../shared/publication/active-component-source.js";

/** Application-role reader over the exact admitted command. It cannot install
 * components, infer host admission, or replace the deployment qualifier. */
export function createNativeComponentEvidenceReader(options: {
  loader: ComponentLoaderOptions;
  maximumBytes: number;
}) {
  if (
    !options.loader.uiComponents ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1 ||
    options.maximumBytes > 4194304
  )
    throw Error("NATIVE_COMPONENT_READER_CONFIGURATION_INVALID");
  return async (
    tx: Transaction<Record<string, never>>,
    input: {
      changeSetId: string;
      componentId: string;
      manifestHash: string;
      publicationReleaseHash: string;
      scope: NativeComponentScope;
    },
  ): Promise<InstalledComponentEvidence> => {
    const uuid =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    const hash = /^[a-f0-9]{64}$/;
    if (
      !tx.isTransaction ||
      !uuid.test(input.changeSetId) ||
      !uuid.test(input.componentId) ||
      !hash.test(input.manifestHash) ||
      !hash.test(input.publicationReleaseHash) ||
      !hash.test(input.scope.hostReleaseHash) ||
      input.scope.tenantId !== null ||
      !["studio", "neon", "mesh"].includes(input.scope.plane)
    )
      throw Error("NATIVE_COMPONENT_READER_SCOPE_INVALID");
    const rows = (
      await sql<ActiveComponentSourceRow>`SELECT * FROM entity_command_private.read_component_resource(${input.changeSetId}::uuid,${input.componentId}::uuid,${input.manifestHash},${input.publicationReleaseHash},${options.maximumBytes})`.execute(
        tx,
      )
    ).rows;
    if (rows.length !== 1) throw Error("NATIVE_COMPONENT_RESOURCE_UNAVAILABLE");
    const row = rows[0]!;
    const source = await verifyActiveComponentSource(row, options.loader);
    if (
      source.declaration.id !== input.componentId ||
      source.declaration.tenantId !== null ||
      !source.declaration.supportedPlanes.includes(input.scope.plane) ||
      row.payload_hash !== input.manifestHash ||
      row.release_hash !== input.publicationReleaseHash
    )
      throw Error("NATIVE_COMPONENT_RESOURCE_MISMATCH");
    const contract = await compileUiComponentProjection(source, async () => ({
      sourceHash: row.payload_hash,
      publicationReleaseHash: row.release_hash,
      implementationHash: source.implementation.sourceHash,
    }));
    return {
      contract,
      plane: input.scope.plane,
      hostReleaseHash: input.scope.hostReleaseHash,
      runtimeKey: source.implementation.runtimeKey,
      evidenceHash: options.loader.canonicalizer.sha256(
        options.loader.canonicalizer.canonicalBytes({
          artifactHash: row.artifact_hash,
          payloadHash: row.payload_hash,
          releaseHash: row.release_hash,
          hostReleaseHash: input.scope.hostReleaseHash,
          plane: input.scope.plane,
        }),
      ),
    };
  };
}
