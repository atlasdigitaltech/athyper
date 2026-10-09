import type { Transaction } from "kysely";
import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  projectNativeComponentEvidence,
  type NativeComponentScope,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import type { createNativeComponentEvidenceReader } from "./native-component-evidence.js";
type Tx = Transaction<Record<string, never>>;
/** Resolves only explicit proposal selections. Unlike saved-graph validation it
 * does not SELECT catalogue rows through policies requiring child rows to exist.
 * The exact publication reader still enforces transaction-bound command admission. */
export function createNativeBootstrapComponents(options: {
  maximumComponents: number;
  pins: readonly {
    componentId: string;
    manifestHash: string;
    publicationReleaseHash: string;
  }[];
  read: ReturnType<typeof createNativeComponentEvidenceReader>;
  admit(
    tx: Tx,
    input: { changeSetId: string; scope: NativeComponentScope },
  ): Promise<void>;
}) {
  const pins = structuredClone(options.pins);
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const hash = /^[a-f0-9]{64}$/;
  if (
    !options.read ||
    !options.admit ||
    !Number.isSafeInteger(options.maximumComponents) ||
    options.maximumComponents < 1 ||
    options.maximumComponents > 256 ||
    pins.length > options.maximumComponents ||
    new Set(pins.map((pin) => pin.componentId)).size !== pins.length ||
    pins.some(
      (pin) =>
        !uuid.test(pin.componentId) ||
        !hash.test(pin.manifestHash) ||
        !hash.test(pin.publicationReleaseHash),
    )
  )
    throw Error("NATIVE_BOOTSTRAP_COMPONENT_CONFIGURATION_INVALID");
  return async (
    tx: Tx,
    graph: ExpandedNativeMetaEntityGraph,
    scope: NativeComponentScope,
  ) => {
    const changeSetId = graph.ownedLabels?.changeSetId;
    if (
      !tx.isTransaction ||
      !changeSetId ||
      !uuid.test(changeSetId) ||
      graph.authoringSource.tenantId !== null ||
      scope.tenantId !== null ||
      !["studio", "neon", "mesh"].includes(scope.plane) ||
      graph.referenceMembers?.members.target.filter(
        (target) => target.targetPlane === scope.plane,
      ).length !== 1
    )
      throw Error("NATIVE_BOOTSTRAP_COMPONENT_SCOPE_INVALID");
    await options.admit(tx, { changeSetId, scope });
    const selections: unknown[] = [
      ...graph.surfaces.map((surface) => surface.componentContractId),
      ...graph.surfaceSections.map((section) => section.componentContractId),
      ...graph.surfaceFieldBindings.flatMap((binding) => [
        binding.componentDisplayId,
        binding.componentInputId,
        binding.componentFilterId,
        binding.componentFormatId,
      ]),
    ];
    if (
      selections.some(
        (id) => id !== null && (typeof id !== "string" || !uuid.test(id)),
      )
    )
      throw Error("NATIVE_BOOTSTRAP_COMPONENT_SELECTION_INVALID");
    const ids = [
      ...new Set(
        selections.filter((id): id is string => typeof id === "string"),
      ),
    ].sort();
    if (
      ids.length > options.maximumComponents ||
      ids.some((id) => !pins.some((pin) => pin.componentId === id))
    )
      throw Error("NATIVE_BOOTSTRAP_COMPONENT_PIN_REQUIRED");
    const evidence = [];
    for (const id of ids) {
      const pin = pins.find((pin) => pin.componentId === id)!;
      const item = await options.read(tx, { ...pin, changeSetId, scope });
      if (
        item.contract.id !== id ||
        item.contract.manifestHash !== pin.manifestHash ||
        item.contract.publicationReleaseHash !== pin.publicationReleaseHash
      )
        throw Error("NATIVE_BOOTSTRAP_COMPONENT_EVIDENCE_MISMATCH");
      evidence.push(item);
    }
    return projectNativeComponentEvidence(scope, evidence);
  };
}
