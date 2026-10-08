import { sql, type Transaction } from "kysely";
import { verifyActiveComponentSource } from "./active-component-source.js";
import {
  installNativeComponentCatalogue,
  type UiComponentInstallationPolicy,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  type VerifiedPublicationArtifactLoader,
  type KyselyLocalProjectionRepository,
} from "@athyper/server-service-publication";
import type { PublicationDeploymentBundle } from "@athyper/server-contract-publication";

type LoaderOptions = ConstructorParameters<
  typeof VerifiedPublicationArtifactLoader
>[0];
/** Reuse the deployed verifier and component qualifier. The SQL reader holds
 * active-head/review/artifact locks through installation, without broad grants. */
export function createComponentCatalogueInstaller(
  options: LoaderOptions,
): NonNullable<
  ConstructorParameters<typeof KyselyLocalProjectionRepository>[2]
> {
  if (!options.uiComponents)
    throw Error("COMPONENT_INSTALLATION_QUALIFIER_REQUIRED");
  const policy: UiComponentInstallationPolicy = {
    async withActiveSource(tx, id, use) {
      const result = await sql<{
        source_json: unknown;
        signed_document: unknown;
        artifact_hash: string;
        payload_hash: string;
        release_hash: string;
        reviewed_source: unknown;
        deployment_bundle: PublicationDeploymentBundle;
      }>`SELECT * FROM publication.read_active_ui_component(${id}::uuid)`.execute(
        tx,
      );
      if (result.rows.length !== 1)
        throw Error("COMPONENT_ACTIVE_SOURCE_REQUIRED");
      const row = result.rows[0]!;
      const source = await verifyActiveComponentSource(row, options);
      return use(source, {
        sourceHash: row.payload_hash,
        publicationReleaseHash: row.release_hash,
        implementationHash: source.implementation.sourceHash,
      });
    },
  };
  return {
    async install(database, id) {
      if (!database.isTransaction)
        throw Error("COMPONENT_INSTALLATION_TRANSACTION_REQUIRED");
      await installNativeComponentCatalogue(
        database as Transaction<Record<string, never>>,
        id,
        policy,
      );
    },
  };
}
