import { parseUiComponentResourceSource } from "@athyper/server-contract-meta-entity-authoring";
import { VerifiedPublicationArtifactLoader } from "@athyper/server-service-publication";
import type { PublicationDeploymentBundle } from "@athyper/server-contract-publication";
export type ComponentLoaderOptions = ConstructorParameters<
  typeof VerifiedPublicationArtifactLoader
>[0];
export interface ActiveComponentSourceRow {
  source_json: unknown;
  signed_document: unknown;
  artifact_hash: string;
  payload_hash: string;
  release_hash: string;
  reviewed_source: unknown;
  deployment_bundle: PublicationDeploymentBundle;
}
/** Shared cryptographic and deployment verification for installation and native
 * authoring reads. The caller must hold exact source/head/review locks. */
export async function verifyActiveComponentSource(
  row: ActiveComponentSourceRow,
  options: ComponentLoaderOptions,
) {
  if (!options.uiComponents)
    throw Error("COMPONENT_INSTALLATION_QUALIFIER_REQUIRED");
  const canonical = options.canonicalizer;
  const hash = (value: unknown) =>
    canonical.sha256(canonical.canonicalBytes(value));
  if (
    hash(row.reviewed_source) !== row.release_hash ||
    hash(row.source_json) !== row.payload_hash ||
    hash(row.signed_document) !== row.artifact_hash
  )
    throw Error("COMPONENT_ACTIVE_SOURCE_HASH_MISMATCH");
  const bytes = canonical.canonicalBytes(row.signed_document);
  const loader = new VerifiedPublicationArtifactLoader({
    ...options,
    store: {
      putImmutable: options.store.putImmutable.bind(options.store),
      get: async () => bytes,
    },
  });
  const loaded = await loader.load(row.deployment_bundle);
  if (
    loaded.document.envelope.artifactKind !== "entity_ui_component" ||
    hash(loaded.document.envelope.payload) !== row.payload_hash
  )
    throw Error("COMPONENT_ACTIVE_SOURCE_KIND_MISMATCH");
  const source = parseUiComponentResourceSource(row.source_json);
  return source;
}
