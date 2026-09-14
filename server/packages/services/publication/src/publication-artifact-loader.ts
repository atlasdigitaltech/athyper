import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata";
import { authoredAuthorization } from "./entity-authorization-compiler.js";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "@athyper/server-contract-metadata";
import {
  parsePublicationArtifactEnvelope,
  PublicationContractError,
  type LoadedPublicationArtifact,
  type PublicationArtifactDocumentV1,
  type PublicationArtifactLoader,
  type PublicationArtifactStore,
  type PublicationCanonicalizer,
  type PublicationDeploymentBundle,
  type PublicationVerifier,
  type PublicationErrorCode,
} from "@athyper/server-contract-publication";
import { parseBusinessPartnerDefinitionBundle } from "./business-partner-definition-service.js";

export interface PublicationArtifactLoaderOptions {
  readonly store: PublicationArtifactStore;
  readonly verifier: PublicationVerifier;
  readonly canonicalizer: PublicationCanonicalizer;
  readonly runtimeVersion: string;
  readonly authorizationRuntime?: {
    qualify(profile: unknown, bindings: unknown): void;
  };
}

export class VerifiedPublicationArtifactLoader implements PublicationArtifactLoader {
  constructor(private readonly options: PublicationArtifactLoaderOptions) {}

  async load(
    deployment: PublicationDeploymentBundle,
  ): Promise<LoadedPublicationArtifact> {
    const bytes = await this.options.store.get({
      uri: deployment.artifactUri,
      expectedSha256: deployment.artifactHash,
    });
    const computedArtifactHash = this.options.canonicalizer.sha256(bytes);
    if (computedArtifactHash !== deployment.artifactHash)
      throw failure("ARTIFACT_HASH_MISMATCH");
    const document = parseDocument(bytes);
    const envelope = parsePublicationArtifactEnvelope(document.envelope);
    const manifest = document.manifest;
    if (envelope.targetPlane !== deployment.targetPlane)
      throw failure("TARGET_PLANE_MISMATCH");
    if (
      envelope.publicationKey !== deployment.publicationKey ||
      envelope.releaseId !== deployment.sourceReleaseId ||
      envelope.releaseNo !== deployment.sourceReleaseNo
    )
      throw failure("ARTIFACT_COORDINATES_INVALID");
    if (
      manifest.targetPlane !== deployment.targetPlane ||
      manifest.publicationKey !== deployment.publicationKey ||
      manifest.releaseId !== deployment.sourceReleaseId ||
      manifest.releaseNo !== deployment.sourceReleaseNo ||
      manifest.artifactKind !== envelope.artifactKind
    )
      throw failure("ARTIFACT_MANIFEST_INVALID");
    if (
      manifest.signatureAlgorithm !== deployment.signatureAlgorithm ||
      manifest.signingKeyId !== deployment.signingKeyId ||
      document.signature !== deployment.signature
    )
      throw failure("ARTIFACT_SIGNATURE_INVALID");
    const payloadSha256 = this.options.canonicalizer.sha256(
      this.options.canonicalizer.canonicalBytes(envelope.payload),
    );
    if (payloadSha256 !== manifest.payloadSha256)
      throw failure("ARTIFACT_HASH_MISMATCH");
    const signatureVerified = await this.options.verifier.verify({
      keyId: manifest.signingKeyId,
      algorithm: manifest.signatureAlgorithm,
      bytes: this.options.canonicalizer.canonicalBytes({ envelope, manifest }),
      signature: document.signature,
    });
    if (!signatureVerified) throw failure("ARTIFACT_SIGNATURE_INVALID");
    const runtimeCompatible = compatible(
      this.options.runtimeVersion,
      envelope.minimumRuntimeVersion,
    );
    if (!runtimeCompatible) throw failure("RUNTIME_INCOMPATIBLE");
    if (envelope.artifactKind === "business_partner_definition_bundle") {
      const payload = envelope.payload;
      if (payload.bundleSchemaVersion !== "1.0.0")
        throw failure("PROJECTION_SCHEMA_VERSION_MISMATCH");
      try {
        parseBusinessPartnerDefinitionBundle(payload.bundle);
      } catch {
        throw failure("ARTIFACT_PAYLOAD_INVALID");
      }
      if (
        this.options.canonicalizer.sha256(
          this.options.canonicalizer.canonicalBytes(payload.bundle),
        ) !== payload.bundleHash
      )
        throw failure("PROJECTION_HASH_MISMATCH");
      const report = payload.compileReport;
      if (
        !report ||
        report["schema"] !==
          "athyper.business-partner-definition-compile-report.v1" ||
        report["plane"] !== payload.plane ||
        report["compiledBundleHash"] !== payload.bundleHash ||
        report["sourceBundleHash"] !== payload.sourceBundleHash ||
        report["deterministic"] !== true ||
        report["compatible"] !== true
      )
        throw failure("ARTIFACT_MANIFEST_INVALID");
      const compileReportHash = this.options.canonicalizer.sha256(
        this.options.canonicalizer.canonicalBytes(report),
      );
      if (
        manifest.evidence?.["compiledBundleHash"] !== payload.bundleHash ||
        manifest.evidence?.["sourceBundleHash"] !== payload.sourceBundleHash ||
        manifest.evidence?.["compileReportHash"] !== compileReportHash
      )
        throw failure("ARTIFACT_MANIFEST_INVALID");
    }
    const hasLearning =
      envelope.artifactKind === "entity_runtime" &&
      Boolean(
        (
          envelope.payload.entityDescriptor.descriptor["ai"] as
            { vocabulary?: unknown } | undefined
        )?.vocabulary,
      );
    if (
      envelope.artifactKind === "entity_runtime" &&
      (manifest.evidence?.["importedBaseline"] !== undefined ||
        hasLearning ||
        envelope.payload.entityDescriptor.descriptorKind ===
          "entity_case_runtime" ||
        envelope.payload.entityDescriptor.descriptor["authorizationRuntime"] !==
          undefined)
    ) {
      const c = envelope.payload.entityContract,
        d = envelope.payload.entityDescriptor;
      const contractBytes = this.options.canonicalizer.canonicalBytes(
        c.contract,
      );
      if (
        c.contractHash !== this.options.canonicalizer.sha256(contractBytes) ||
        d.sourceContractHash !== c.contractHash ||
        d.compiledHash !==
          this.options.canonicalizer.sha256(
            this.options.canonicalizer.canonicalBytes(d.descriptor),
          )
      )
        throw failure("ARTIFACT_HASH_MISMATCH");
      if (
        c.signature.algorithm !== "Ed25519" ||
        c.signature.keyId !== manifest.signingKeyId ||
        !(await this.options.verifier.verify({
          keyId: c.signature.keyId,
          algorithm: c.signature.algorithm,
          bytes: contractBytes,
          signature: c.signature.signature,
        }))
      )
        throw failure("ARTIFACT_SIGNATURE_INVALID");
    }
    if (
      envelope.artifactKind === "entity_runtime" &&
      manifest.evidence?.["importedBaseline"] !== undefined
    ) {
      const c = envelope.payload.entityContract,
        d = envelope.payload.entityDescriptor;
      try {
        parseEntityRuntimeDescriptor({
          entity_code: c.entityCode,
          release_id: c.releaseId,
          release_no: c.releaseNo,
          entity_contract_hash: c.contractHash,
          plane_code: d.plane,
          compiled_hash: d.compiledHash,
          compiled_json: d.descriptor,
        });
      } catch {
        throw failure("ARTIFACT_PAYLOAD_INVALID");
      }
    }
    if (
      envelope.artifactKind === "entity_runtime" &&
      hasLearning &&
      manifest.evidence?.["importedBaseline"] === undefined
    ) {
      const c = envelope.payload.entityContract,
        d = envelope.payload.entityDescriptor;
      try {
        parseEntityRuntimeDescriptor({
          entity_code: c.entityCode,
          release_id: c.releaseId,
          release_no: c.releaseNo,
          entity_contract_hash: c.contractHash,
          plane_code: d.plane,
          compiled_hash: d.compiledHash,
          compiled_json: d.descriptor,
        });
        const surfaces = c.contract["surfaces"];
        const authored = Array.isArray(surfaces)
          ? surfaces.filter(
              (surface) =>
                surface.status !== "deprecated" &&
                surface.layoutConfig?.ai !== undefined,
            )
          : [];
        const hash = (value: unknown) =>
          this.options.canonicalizer.sha256(
            this.options.canonicalizer.canonicalBytes(value),
          );
        if (
          authored.length !== 1 ||
          hash(authored[0].layoutConfig.ai) !== hash(d.descriptor["ai"])
        )
          throw failure("ARTIFACT_PAYLOAD_INVALID");
      } catch (error) {
        if (error instanceof PublicationContractError) throw error;
        throw failure("ARTIFACT_PAYLOAD_INVALID");
      }
    }
    if (
      envelope.artifactKind === "entity_runtime" &&
      envelope.payload.entityDescriptor.descriptor["authorizationRuntime"] !==
        undefined
    ) {
      const c = envelope.payload.entityContract,
        d = envelope.payload.entityDescriptor;
      try {
        parseEntityRuntimeDescriptor({
          entity_code: c.entityCode,
          release_id: c.releaseId,
          release_no: c.releaseNo,
          entity_contract_hash: c.contractHash,
          plane_code: d.plane,
          compiled_hash: d.compiledHash,
          compiled_json: d.descriptor,
        });
        const profile = parseEntityAuthorizationProfile(
          d.descriptor["authorization"],
        );
        const runtime = parseEntityAuthorizationRuntime(
          d.descriptor["authorizationRuntime"],
          profile,
        );
        const hash = (value: unknown) =>
          this.options.canonicalizer.sha256(
            this.options.canonicalizer.canonicalBytes(value),
          );
        if (
          profile.entityCode !== c.entityCode ||
          profile.planeKey !== envelope.targetPlane ||
          d.plane !== envelope.targetPlane ||
          c.publicationKey !== envelope.publicationKey ||
          c.releaseId !== envelope.releaseId ||
          c.releaseNo !== envelope.releaseNo ||
          hash(authoredAuthorization(c.contract)["authorization"]) !==
            hash(profile) ||
          hash(
            parseEntityAuthorizationRuntime(
              authoredAuthorization(c.contract)["authorizationRuntime"],
              profile,
            ),
          ) !== hash(runtime) ||
          manifest.evidence?.["authorizationProfileHash"] !== hash(profile) ||
          manifest.evidence?.["authorizationRuntimeVersion"] !==
            runtime.runtimeVersion
        )
          throw failure("ARTIFACT_PAYLOAD_INVALID");
        if (!this.options.authorizationRuntime)
          throw failure("RUNTIME_INCOMPATIBLE");
        this.options.authorizationRuntime.qualify(profile, runtime);
      } catch (error) {
        if (error instanceof PublicationContractError) throw error;
        throw failure("RUNTIME_INCOMPATIBLE");
      }
    }
    const projectionEvidence =
      envelope.artifactKind === "entity_runtime"
        ? {
            contractHash: envelope.payload.entityContract.contractHash,
            descriptorSourceHash:
              envelope.payload.entityDescriptor.sourceContractHash,
            contractSchemaVersion:
              envelope.payload.entityContract.contractSchemaVersion,
            descriptorSchemaVersion:
              envelope.payload.entityDescriptor.descriptorSchemaVersion,
          }
        : envelope.artifactKind === "bank_directory"
          ? {
              payloadHash: envelope.payload.contentHash,
              payloadSchemaVersion: "1.0.0",
            }
          : {
              definitionBundleHash: envelope.payload.bundleHash,
              definitionBundleSchemaVersion:
                envelope.payload.bundleSchemaVersion,
            };
    return {
      document,
      computedArtifactHash,
      verification: {
        signatureVerified,
        manifestValid: true,
        runtimeCompatible,
        targetPlane: envelope.targetPlane,
        ...projectionEvidence,
        signatureAlgorithm: manifest.signatureAlgorithm,
        signingKeyId: manifest.signingKeyId,
      },
    };
  }
}

function parseDocument(bytes: Uint8Array): PublicationArtifactDocumentV1 {
  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw failure("ARTIFACT_INVALID");
    const document = value as PublicationArtifactDocumentV1;
    if (
      !document.envelope ||
      !document.manifest ||
      typeof document.signature !== "string"
    )
      throw failure("ARTIFACT_INVALID");
    return document;
  } catch (error) {
    if (error instanceof PublicationContractError) throw error;
    throw failure("ARTIFACT_INVALID");
  }
}

function compatible(current: string, minimum?: string): boolean {
  if (!minimum) return true;
  const left = version(current);
  const right = version(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! > right[index]!) return left[index]! > right[index]!;
  }
  return true;
}
function version(value: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) throw failure("RUNTIME_INCOMPATIBLE");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function failure(code: PublicationErrorCode) {
  return new PublicationContractError(code, code);
}
