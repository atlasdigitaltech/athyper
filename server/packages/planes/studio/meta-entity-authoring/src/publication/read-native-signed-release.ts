import type {
  ExpandedNativeMetaEntityGraph,
  SignedMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "../deterministic.js";
import { nativePublicationTargets } from "./native-publication-targets.js";

/** Reconstruct original immutable signed bytes, never recompile with current
 * resources or pair a stored signature with a SQL ledger digest. Verification
 * and current publication authorization remain the dispatcher's responsibility. */
export function readNativeSignedRelease(row: {
  contract_json: unknown;
  source_contract_hash: string;
  source_descriptor_hash: string;
  target_planes: string[];
  contract_signature: string;
  signature_algorithm: string;
  signing_key_id: string;
  artifacts: {
    plane: string;
    descriptor: Record<string, unknown>;
    compliance: Record<string, unknown>;
  }[];
}): SignedMetaEntityArtifact {
  const reject = () => {
    throw Error("NATIVE_SIGNED_RELEASE_INTEGRITY_MISMATCH");
  };
  if (
    !Array.isArray(row.artifacts) ||
    !row.artifacts.length ||
    !Array.isArray(row.target_planes) ||
    row.signature_algorithm !== "Ed25519" ||
    !row.signing_key_id ||
    !row.contract_signature ||
    sha256(row.contract_json) !== row.source_contract_hash
  )
    return reject();
  const sourceArtifact = row.artifacts[0]!.compliance.sourceArtifact as
    | import("@athyper/server-contract-meta-entity-authoring").CompiledMetaEntityArtifact
    | undefined;
  if (
    sourceArtifact &&
    (Object.keys(sourceArtifact).sort().join() !==
      "compiler,contractHash,descriptor,descriptorHash,schema" ||
      sourceArtifact.compiler?.name !== "@athyper/meta-entity-compiler" ||
      sourceArtifact.compiler.version !== "native-reference/2" ||
      sourceArtifact.contractHash !== row.source_contract_hash ||
      sourceArtifact.descriptorHash !== row.source_descriptor_hash ||
      sourceArtifact.schema !== "athyper.entity-runtime-descriptor/1.0")
  )
    return reject();
  const descriptor = sourceArtifact?.descriptor ?? row.artifacts[0]!.descriptor;
  const artifact: SignedMetaEntityArtifact = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    compiler: {
      name: "@athyper/meta-entity-compiler",
      version: sourceArtifact ? "native-reference/2" : "native-reference/1",
    },
    contractHash: row.source_contract_hash,
    descriptorHash: row.source_descriptor_hash,
    descriptor,
    signature: row.contract_signature,
    signatureAlgorithm: row.signature_algorithm,
    signingKeyId: row.signing_key_id,
  };
  const compiledTargets = nativePublicationTargets(
    row.contract_json as ExpandedNativeMetaEntityGraph,
    artifact,
  );
  const targets = compiledTargets.map((t) => t.targetPlane).sort();
  if (
    targets.join() !== [...row.target_planes].sort().join() ||
    targets.join() !==
      row.artifacts
        .map((a) => a.plane)
        .sort()
        .join() ||
    row.artifacts.some(
      (a) =>
        sha256(a.descriptor) !==
          compiledTargets.find((t) => t.targetPlane === a.plane)?.artifact
            .descriptorHash ||
        (sourceArtifact
          ? sha256(a.compliance.sourceArtifact) !== sha256(sourceArtifact)
          : a.compliance.sourceArtifact !== undefined) ||
        a.compliance.schema !== "athyper.native-entity-compilation-source/1" ||
        a.compliance.sourceContractHash !== row.source_contract_hash ||
        a.compliance.sourceDescriptorHash !== row.source_descriptor_hash ||
        a.compliance.targetDescriptorHash !== sha256(a.descriptor),
    )
  )
    return reject();
  return artifact;
}
