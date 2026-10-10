import { runtimeVersionCompatible } from "./runtime-version.js";
import {
  collectionPublicationFromGraph,
  parseCollectionPublicationDescriptor,
  collectionPublicationKey,
} from "@athyper/server-contract-publication";
import {
  parseEntityRuntimeDescriptor,
  parseCompiledRuntimeContract,
  assertCompleteRuntimeOperations,
  validateCompiledRuntimeContracts,
} from "@athyper/server-platform-metadata";
import { authoredAuthorization } from "./entity-authorization-compiler.js";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "@athyper/server-contract-metadata";
import {
  parsePublicationArtifactEnvelope,
  parseNotificationPublicationDescriptor,
  assertCompiledEntityRuntimePublication,
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

export interface PublicationArtifactLoaderOptions {
  readonly store: PublicationArtifactStore;
  readonly verifier: PublicationVerifier;
  readonly canonicalizer: PublicationCanonicalizer;
  readonly runtimeVersion: string;
  /** Exact local dependency/coverage qualification, not signature-only admission. */
  readonly liveReadResources?: {
    qualify(
      envelope: Extract<
        import("@athyper/server-contract-publication").PublicationArtifactEnvelopeV1,
        {
          artifactKind: "entity_security_manifest" | "entity_storage_authority";
        }
      >,
    ): Promise<void>;
  };
  readonly uiComponents?: {
    qualify(
      envelope: Extract<
        import("@athyper/server-contract-publication").PublicationArtifactEnvelopeV1,
        { artifactKind: "entity_ui_component" }
      >,
    ): Promise<void>;
  };
  readonly authoringResources?: {
    qualify(
      kind: "entity_authoring_descriptor" | "entity_identity_review",
      payload: unknown,
    ): Promise<void>;
  };
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
    const runtimeCompatible = runtimeVersionCompatible(
      this.options.runtimeVersion,
      envelope.minimumRuntimeVersion,
    );
    if (!runtimeCompatible) throw failure("RUNTIME_INCOMPATIBLE");
    if (
      envelope.artifactKind === "entity_authoring_descriptor" ||
      envelope.artifactKind === "entity_identity_review"
    ) {
      if (!this.options.authoringResources)
        throw failure("RUNTIME_INCOMPATIBLE");
      if (
        envelope.artifactKind === "entity_authoring_descriptor" &&
        this.options.canonicalizer.sha256(
          this.options.canonicalizer.canonicalBytes(
            envelope.payload.descriptor,
          ),
        ) !== envelope.payload.descriptorHash
      )
        throw failure("PROJECTION_HASH_MISMATCH");
      await this.options.authoringResources.qualify(
        envelope.artifactKind,
        envelope.payload,
      );
    }
    if (
      envelope.artifactKind === "entity_security_manifest" ||
      envelope.artifactKind === "entity_storage_authority"
    ) {
      if (!this.options.liveReadResources)
        throw failure("RUNTIME_INCOMPATIBLE");
      if (
        this.options.canonicalizer.sha256(
          this.options.canonicalizer.canonicalBytes(envelope.payload.content),
        ) !== envelope.payload.pin.hash
      )
        throw failure("PROJECTION_HASH_MISMATCH");
      await this.options.liveReadResources.qualify(structuredClone(envelope));
    }
    if (envelope.artifactKind === "entity_ui_component") {
      if (!this.options.uiComponents) throw failure("RUNTIME_INCOMPATIBLE");
      await this.options.uiComponents.qualify(structuredClone(envelope));
    }
    if (envelope.artifactKind === "compiled_entity_runtime") {
      try {
        assertCompiledEntityRuntimePublication(envelope.payload);
      } catch {
        throw failure("ARTIFACT_PAYLOAD_INVALID");
      }
      try {
        const publication = {
          releaseId: envelope.releaseId,
          releaseNo: envelope.releaseNo,
          contractHash:
            typeof manifest.evidence?.sourceContractHash === "string"
              ? manifest.evidence.sourceContractHash.replace(/^sha256:/, "")
              : undefined,
          entityId:
            typeof manifest.evidence?.sourceEntityId === "string"
              ? manifest.evidence.sourceEntityId
              : undefined,
          tenantId: envelope.payload.tenantId ?? null,
        };
        validateCompiledRuntimeContracts(
          envelope.payload.artifacts,
          publication,
        );
        assertCompleteRuntimeOperations(envelope.payload.artifacts);
        for (const artifact of envelope.payload.artifacts.filter(
          (item) => item.artifactType === "runtime_contract",
        )) {
          // Source release identity is not the compiled package hash. Recheck
          // the compiler's provenance assertion against the signed manifest.
          const source = (
            artifact.content.descriptor as Record<string, unknown>
          )?.source;
          if (
            source !== undefined &&
            (!source ||
              typeof source !== "object" ||
              Array.isArray(source) ||
              typeof (source as Record<string, unknown>).entity_id !==
                "string" ||
              typeof (source as Record<string, unknown>).release_hash !==
                "string" ||
              (source as Record<string, unknown>).entity_id !==
                manifest.evidence?.sourceEntityId ||
              (source as Record<string, unknown>).release_hash !==
                manifest.evidence?.sourceReleaseHash)
          )
            throw failure("ARTIFACT_MANIFEST_INVALID");
          const descriptor = parseCompiledRuntimeContract(
            artifact,
            publication,
          );
          // Wire/source validation is not installed F6/F8/F9 qualification. The
          // current loader has no governed live-read registry adapter; do not
          // let its legacy authorization qualifier attest this new capability.
          if (descriptor.liveReadContract)
            throw new Error(
              "ENTITY_LIVE_READ_DEPLOYMENT_QUALIFICATION_UNAVAILABLE",
            );
          if (descriptor.authorizationRuntime) {
            if (!this.options.authorizationRuntime)
              throw failure("RUNTIME_INCOMPATIBLE");
            this.options.authorizationRuntime.qualify(
              descriptor.authorization!,
              descriptor.authorizationRuntime,
            );
          } else if (!descriptor.collectionRelationship) {
            throw failure("RUNTIME_INCOMPATIBLE");
          }
        }
      } catch (error) {
        if (error instanceof PublicationContractError) throw error;
        const invalid = failure("RUNTIME_INCOMPATIBLE");
        invalid.cause = error;
        throw invalid;
      }
    }
    if (
      envelope.artifactKind === "entity_runtime" &&
      envelope.payload.entityDescriptor.descriptorKind ===
        "collection_configuration"
    ) {
      try {
        const c = envelope.payload.entityContract,
          d = envelope.payload.entityDescriptor,
          descriptor = parseCollectionPublicationDescriptor(d.descriptor),
          source = collectionPublicationFromGraph(c.contract);
        const hash = (value: unknown) =>
          this.options.canonicalizer.sha256(
            this.options.canonicalizer.canonicalBytes(value),
          );
        if (
          !source ||
          hash(source) !== hash(descriptor) ||
          !c.tenantId ||
          descriptor.sourceEntityCode !== c.entityCode ||
          d.plane !== envelope.targetPlane ||
          !descriptor.configuration.targetPlanes.includes(
            envelope.targetPlane,
          ) ||
          c.releaseId !== envelope.releaseId ||
          c.releaseNo !== envelope.releaseNo ||
          c.publicationKey !== envelope.publicationKey ||
          envelope.publicationKey !==
            collectionPublicationKey(
              c.tenantId,
              descriptor.configuration.collectionKey,
            )
        )
          throw new TypeError("Collection source or coordinates mismatch");
      } catch {
        throw failure("ARTIFACT_PAYLOAD_INVALID");
      }
    }
    if (
      envelope.artifactKind === "entity_runtime" &&
      envelope.payload.entityDescriptor.descriptorKind ===
        "entity_notifications"
    ) {
      try {
        const descriptor = parseNotificationPublicationDescriptor(
          envelope.payload.entityDescriptor.descriptor,
        );
        const c = envelope.payload.entityContract,
          d = envelope.payload.entityDescriptor;
        const members = c.contract["capabilities"];
        if (!Array.isArray(members))
          throw new TypeError("Missing notification source");
        const notifications = Object.fromEntries(
          members
            .filter(
              (m) =>
                m?.declaration?.enabled === true &&
                m.binding?.notifications !== undefined,
            )
            .map((m) => [m.capabilityKey, m.binding.notifications]),
        );
        const target = members.find((m) => m.binding?.notifications)?.binding
          .notifications.targetEntityCode;
        const source = parseNotificationPublicationDescriptor({
          schema: descriptor.schema,
          sourceEntityCode: c.entityCode,
          entityCode: target,
          notifications,
        });
        const hash = (v: unknown) =>
          this.options.canonicalizer.sha256(
            this.options.canonicalizer.canonicalBytes(v),
          );
        if (
          hash(source) !== hash(descriptor) ||
          !c.tenantId ||
          descriptor.sourceEntityCode !== c.entityCode ||
          d.plane !== envelope.targetPlane ||
          c.releaseId !== envelope.releaseId ||
          c.releaseNo !== envelope.releaseNo ||
          c.publicationKey !== envelope.publicationKey ||
          envelope.publicationKey !==
            `metadata.notifications.${descriptor.entityCode}.${c.tenantId.replaceAll("-", "")}`
        )
          throw new TypeError("Notification source or coordinates mismatch");
      } catch {
        throw failure("ARTIFACT_PAYLOAD_INVALID");
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(
        manifest.evidence ?? {},
        "importedBaseline",
      )
    )
      throw failure("ARTIFACT_PAYLOAD_INVALID"); // Retired baseline activation format.
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
      (hasLearning ||
        envelope.payload.entityDescriptor.descriptorKind ===
          "collection_configuration" ||
        envelope.payload.entityDescriptor.descriptorKind ===
          "entity_notifications" ||
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
    if (envelope.artifactKind === "entity_runtime" && hasLearning) {
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
        const incompatible = failure("RUNTIME_INCOMPATIBLE");
        incompatible.cause = error;
        throw incompatible;
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
        : envelope.artifactKind === "compiled_entity_runtime" ||
            envelope.artifactKind === "entity_authoring_descriptor" ||
            envelope.artifactKind === "entity_identity_review" ||
            envelope.artifactKind === "entity_ui_component" ||
            envelope.artifactKind === "entity_security_manifest" ||
            envelope.artifactKind === "entity_storage_authority"
          ? {
              payloadHash: manifest.payloadSha256,
              payloadSchemaVersion:
                envelope.artifactKind === "compiled_entity_runtime"
                  ? "2.0"
                  : "1.0",
            }
          : (() => {
              throw failure("BUSINESS_PARTNER_STUDIO_PUBLICATION_RETIRED");
            })();
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

function failure(code: PublicationErrorCode) {
  return new PublicationContractError(code, code);
}
