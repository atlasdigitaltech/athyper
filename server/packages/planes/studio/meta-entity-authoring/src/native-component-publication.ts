import {
  FoundationContractError,
  parseUiComponentResourceSource,
  parseUiComponentContract,
  type UiComponentResourceSource,
  type UiComponentContract,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";

export interface UiComponentProjectionEvidence {
  readonly sourceHash: string;
  readonly publicationReleaseHash: string;
  readonly implementationHash: string;
}
/** Produces the immutable catalogue row only after the publication owner verifies
 * the exact reviewed/activated source and registered implementation. This helper
 * neither issues evidence nor writes the catalogue or publication ledger. */
export async function compileUiComponentProjection(
  input: unknown,
  qualify: (
    source: UiComponentResourceSource,
    sourceHash: string,
  ) => Promise<UiComponentProjectionEvidence>,
): Promise<UiComponentContract> {
  const source = parseUiComponentResourceSource(input);
  const sourceHash = sha256(source);
  const evidence = await qualify(structuredClone(source), sourceHash);
  if (
    evidence.sourceHash !== sourceHash ||
    evidence.implementationHash !== source.implementation.sourceHash ||
    !/^[a-f0-9]{64}$/.test(evidence.publicationReleaseHash)
  )
    throw new FoundationContractError(
      "UI_COMPONENT_PUBLICATION_EVIDENCE_MISMATCH",
      "/componentResource",
    );
  return parseUiComponentContract({
    ...source.declaration,
    manifestHash: sourceHash,
    publicationReleaseHash: evidence.publicationReleaseHash,
    status: "active",
  });
}
