import { sql, type Transaction } from "kysely";
import {
  FoundationContractError,
  uiComponentColumns,
  referenceUuid,
  validateFoundationNode,
  type UiComponentResourceSource,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileUiComponentProjection,
  type UiComponentProjectionEvidence,
} from "./native-component-publication.js";
import { canonicalJson } from "./deterministic.js";
export interface UiComponentInstallationPolicy {
  /** Trusted publication adapter holds the exact active head and verifies current
   * signature/review/implementation evidence throughout the callback. Not a DTO. */
  withActiveSource<T>(
    tx: Transaction<Record<string, never>>,
    appliedReleaseId: string,
    use: (
      source: UiComponentResourceSource,
      evidence: UiComponentProjectionEvidence,
    ) => Promise<T>,
  ): Promise<T>;
}
/** Used by the existing publication activation transaction. Restricted database
 * installation privileges must be supplied by that host; authoring roles cannot
 * acquire them by invoking this helper. Immutable exact replay only, no updates. */
export async function installNativeComponentCatalogue(
  tx: Transaction<Record<string, never>>,
  appliedReleaseId: string,
  policy: UiComponentInstallationPolicy,
): Promise<void> {
  if (!tx.isTransaction)
    throw new FoundationContractError(
      "UI_COMPONENT_INSTALLATION_TRANSACTION_REQUIRED",
      "/componentResource",
    );
  validateFoundationNode(referenceUuid, appliedReleaseId, "/appliedReleaseId");
  await policy.withActiveSource(
    tx,
    appliedReleaseId,
    async (source, evidence) => {
      const row = await compileUiComponentProjection(
        source,
        async () => evidence,
      );
      if (row.tenantId !== null || !row.supportedPlanes.includes("studio"))
        throw new FoundationContractError(
          "UI_COMPONENT_INSTALLATION_SCOPE_INVALID",
          "/componentResource",
        );
      const entries = Object.entries(uiComponentColumns).map(
        ([key, column]) => [column.name, row[key as keyof typeof row]] as const,
      );
      const stored = await sql<{
        row: Record<string, unknown>;
      }>`SELECT publication.install_active_ui_component(${appliedReleaseId}::uuid) AS row`.execute(
        tx,
      );
      const expected = Object.fromEntries(entries);
      if (
        stored.rows.length !== 1 ||
        canonicalJson(stored.rows[0]!.row) !== canonicalJson(expected)
      )
        throw new FoundationContractError(
          "UI_COMPONENT_INSTALLATION_CONFLICT",
          "/componentResource",
        );
    },
  );
}
