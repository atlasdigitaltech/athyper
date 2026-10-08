import { sql, type Transaction } from "kysely";
import {
  FoundationContractError,
  parseUiComponentContract,
  uiComponentColumns,
  referenceUuid,
  validateFoundationNode,
  type UiComponentContract,
  type NormalizedCoreContext,
  type NormalizedLayoutContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";
export interface NativeComponentScope {
  readonly tenantId: string | null;
  readonly plane: "studio" | "neon" | "mesh";
  readonly hostReleaseHash: string;
}
export interface InstalledComponentEvidence {
  readonly contract: UiComponentContract;
  readonly plane: NativeComponentScope["plane"];
  readonly hostReleaseHash: string;
  readonly evidenceHash: string;
  readonly runtimeKey: string;
}
export interface NativeComponentResourcePolicy {
  readonly maximumComponents: number;
  /** Existing host admission; not a grant inferred from catalogue presence. */
  admit(
    tx: Transaction<Record<string, never>>,
    scope: NativeComponentScope,
  ): Promise<void>;
  /** Resolve independently installed, reviewed and unrevoked resource evidence.
   * No default echo implementation or request-supplied evidence is accepted. */
  installed(
    tx: Transaction<Record<string, never>>,
    scope: NativeComponentScope,
    reference: Pick<
      UiComponentContract,
      | "resourceOwner"
      | "resourceNamespace"
      | "publicationResourceKey"
      | "componentVersion"
      | "manifestHash"
      | "publicationReleaseHash"
    >,
  ): Promise<InstalledComponentEvidence>;
}
/** Existing shared validators/compiler consume these rosters. Catalogue reads do
 * not provide field exposure, storage authority or product-write permission. */
export async function resolveNativeComponentResources(
  tx: Transaction<Record<string, never>>,
  scope: NativeComponentScope,
  ids: readonly string[],
  policy: NativeComponentResourcePolicy,
): Promise<{
  coreComponents: NormalizedCoreContext["components"];
  layoutComponents: NormalizedLayoutContext["components"];
  runtimeComponents: readonly { id: string; runtimeKey: string }[];
  evidence: readonly InstalledComponentEvidence[];
}> {
  const fail = (code: string): never => {
    throw new FoundationContractError(code, "/components");
  };
  if (!tx.isTransaction) fail("COMPONENT_RESOURCE_TRANSACTION_REQUIRED");
  if (
    !Number.isSafeInteger(policy.maximumComponents) ||
    policy.maximumComponents < 1 ||
    ids.length > policy.maximumComponents ||
    new Set(ids).size !== ids.length
  )
    fail("COMPONENT_RESOURCE_BUDGET_INVALID");
  if (
    !/^[a-f0-9]{64}$/.test(scope.hostReleaseHash) ||
    !["studio", "neon", "mesh"].includes(scope.plane)
  )
    fail("COMPONENT_RESOURCE_SCOPE_INVALID");
  if (scope.tenantId !== null)
    validateFoundationNode(referenceUuid, scope.tenantId, "/tenantId");
  for (const id of ids)
    validateFoundationNode(referenceUuid, id, "/components/id");
  await policy.admit(tx, scope);
  if (!ids.length)
    return {
      coreComponents: [],
      layoutComponents: [],
      runtimeComponents: [],
      evidence: [],
    };
  // Immutable catalogue rows require SELECT only. Mutable installation/revocation
  // evidence is independently resolved by policy.installed in this transaction.
  const result = await sql<{
    row: Record<string, unknown>;
  }>`SELECT to_jsonb(c) AS row FROM metadata.ui_component_contract c WHERE c.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))}) AND (c.tenant_id IS NULL OR c.tenant_id=${scope.tenantId}::uuid) ORDER BY c.id`.execute(
    tx,
  );
  if (result.rows.length !== ids.length) fail("COMPONENT_RESOURCE_NOT_FOUND");
  const contracts = result.rows.map(({ row }) =>
    parseUiComponentContract(
      Object.fromEntries(
        Object.entries(uiComponentColumns).map(([key, col]) => [
          key,
          row[col.name],
        ]),
      ),
    ),
  );
  const evidence: InstalledComponentEvidence[] = [];
  for (const id of ids) {
    const row = contracts.find((c) => c.id === id);
    if (
      !row ||
      row.status !== "active" ||
      !row.supportedPlanes.includes(scope.plane)
    )
      fail("COMPONENT_RESOURCE_UNAVAILABLE");
    const c = row!;
    const installed = await policy.installed(tx, scope, {
      resourceOwner: c.resourceOwner,
      resourceNamespace: c.resourceNamespace,
      publicationResourceKey: c.publicationResourceKey,
      componentVersion: c.componentVersion,
      manifestHash: c.manifestHash,
      publicationReleaseHash: c.publicationReleaseHash,
    });
    const admitted = parseUiComponentContract(installed.contract);
    if (
      installed.plane !== scope.plane ||
      installed.hostReleaseHash !== scope.hostReleaseHash ||
      !/^[a-f0-9]{64}$/.test(installed.evidenceHash) ||
      !installed.runtimeKey ||
      installed.runtimeKey.length > 127 ||
      canonicalJson(admitted) !== canonicalJson(c)
    )
      fail("COMPONENT_INSTALLATION_EVIDENCE_MISMATCH");
    evidence.push(structuredClone(installed));
  }
  return projectNativeComponentEvidence(scope, evidence);
}
/** One capability projection for saved graphs and fresh bootstrap proposals.
 * Callers must first obtain installed evidence; this is not a qualifier. */
export function projectNativeComponentEvidence(
  scope: NativeComponentScope,
  evidence: readonly InstalledComponentEvidence[],
) {
  const fail = (): never => {
    throw new FoundationContractError(
      "COMPONENT_INSTALLATION_EVIDENCE_MISMATCH",
      "/components",
    );
  };
  if (
    !/^[a-f0-9]{64}$/.test(scope.hostReleaseHash) ||
    !["studio", "neon", "mesh"].includes(scope.plane)
  )
    fail();
  const contracts = evidence.map((item) => {
    const contract = parseUiComponentContract(item.contract);
    if (
      item.plane !== scope.plane ||
      item.hostReleaseHash !== scope.hostReleaseHash ||
      !/^[a-f0-9]{64}$/.test(item.evidenceHash) ||
      !item.runtimeKey ||
      item.runtimeKey.length > 127 ||
      contract.status !== "active" ||
      !contract.supportedPlanes.includes(scope.plane) ||
      (contract.tenantId !== null && contract.tenantId !== scope.tenantId)
    )
      fail();
    return contract;
  });
  if (new Set(contracts.map((c) => c.id)).size !== contracts.length) fail();
  const options = {
    text_wrap: "textWrap",
    fraction_digits: "fractionDigits",
    date_style: "dateStyle",
    empty_text_label_id: "emptyTextLabelId",
  } as const;
  return {
    coreComponents: contracts
      .filter((c) => c.componentLevel === "surface")
      .map((c) => ({
        id: c.id,
        level: "surface" as const,
        surfaceKinds: c.supportedSurfaceKinds,
        modes: c.supportedModes,
      })),
    layoutComponents: contracts
      .filter((c) => c.componentLevel !== "surface")
      .map((c) => ({
        id: c.id,
        level:
          c.componentLevel as NormalizedLayoutContext["components"][number]["level"],
        surfaceKinds: c.supportedSurfaceKinds,
        dataTypes: c.supportedDataTypes,
        cardinalities: c.cardinalities,
        options: c.optionKeys.map((k) => options[k]),
        filterOperators: c.filterOperators,
        compatibleDisplayIds: c.compatibleDisplayIds,
        maskedRepresentationSafe: c.maskedRepresentationSafe,
      })),
    runtimeComponents: evidence.map((e) => ({
      id: e.contract.id,
      runtimeKey: e.runtimeKey,
    })),
    evidence,
  };
}
