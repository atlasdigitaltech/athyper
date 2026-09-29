import { readFileSync, statSync } from "node:fs";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import {
  CachedPublicationKeyResolver,
  TrustScopedPublicationKeyResolver,
  Ed25519PublicationSigner,
  Ed25519PublicationVerifier,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { createInfisicalSecretStore } from "@athyper/server-adapter-secretstore-infisical";
import { ImmutablePublicationArtifactStore } from "@athyper/server-service-publication";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type PublicationTrustRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createSecretStore"
>;

const DEFAULT_DEPENDENCIES: PublicationTrustRegistrationDependencies = {
  createSecretStore: createInfisicalSecretStore,
};

export function registerPublicationTrust(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<PublicationTrustRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const publicationEnabled =
    config.publication?.authoringEnabled ||
    config.publication?.compileEnabled ||
    config.publication?.dispatchEnabled ||
    config.publication?.applyEnabled;
  if (publicationEnabled) {
    if (
      !container.adapters.objectStorageArtifacts ||
      !container.adapters.objectStorageArtifactsBucket
    )
      throw new Error("Publication requires configured object storage");
    container.adapters.publicationArtifactStore =
      new ImmutablePublicationArtifactStore({
        storage: container.adapters.objectStorageArtifacts,
        bucket: container.adapters.objectStorageArtifactsBucket,
        canonicalizer: { sha256 },
      });
    container.runtimes.health.register(
      "publication.object-storage",
      async () => {
        const result = await (
          container.adapters
            .publicationArtifactStore as ImmutablePublicationArtifactStore
        ).health();
        return {
          status: result.healthy ? "healthy" : "unhealthy",
          ...(result.message ? { message: result.message } : {}),
        };
      },
    );
    if (
      !config.publication.secretStore &&
      (!config.infisical.endpoint ||
        !config.infisical.token ||
        !config.infisical.workspaceId)
    )
      throw new Error("Publication requires Infisical configuration");
    const dedicated = config.publication.secretStore;
    if (
      dedicated &&
      (!config.publication.trust ||
        !statSync(dedicated.tokenFile).isFile() ||
        (statSync(dedicated.tokenFile).mode & 0o077) !== 0)
    )
      throw Error("PUBLICATION_SECRET_FILE_INVALID");
    const secretStore = dedicated
      ? (dependencies.createSecretStore ?? createInfisicalSecretStore)({
          endpoint: dedicated.endpoint,
          workspaceId: dedicated.workspaceId,
          environment: dedicated.environment,
          token: readFileSync(dedicated.tokenFile, "utf8").trim(),
        })
      : container.adapters.secretStore!;
    if (dedicated) lifecycle.onShutdown(() => secretStore.close?.());
    if (
      !config.publication.signingKeyId ||
      !config.publication.publicKeyReference
    )
      throw new Error(
        "Publication requires signing key ID and public key reference",
      );
    const publicationKeys = [
      {
        keyId: config.publication.signingKeyId,
        ...(config.publication.privateKeyReference
          ? { privateKeyReference: config.publication.privateKeyReference }
          : {}),
        publicKeyReferences: [config.publication.publicKeyReference],
      },
    ];
    if (config.env !== "local" && !config.publication.trust)
      throw new Error("PUBLICATION_TRUST_CONFIGURATION_REQUIRED");
    if (
      config.publication.trust &&
      config.publication.trust.domain !==
        (config.env === "local" ? "dev" : "production")
    )
      throw new Error("PUBLICATION_TRUST_ENVIRONMENT_MISMATCH");
    const resolver = config.publication.trust
      ? new TrustScopedPublicationKeyResolver(secretStore, {
          ...config.publication.trust,
          access:
            config.publication.authoringEnabled ||
            config.publication.compileEnabled ||
            config.publication.dispatchEnabled
              ? "sign_and_verify"
              : "verify",
          keys: publicationKeys,
        })
      : new CachedPublicationKeyResolver(secretStore, publicationKeys);
    container.adapters.publicationVerifier = new Ed25519PublicationVerifier(
      resolver,
    );
    if (
      config.publication.authoringEnabled ||
      config.publication.compileEnabled ||
      config.publication.dispatchEnabled
    ) {
      if (!config.publication.privateKeyReference)
        throw new Error(
          "Publication authority requires private signing key reference",
        );
      container.adapters.publicationSigner = new Ed25519PublicationSigner(
        resolver,
      );
    }
    container.runtimes.health.register("publication.trust-keys", async () => {
      const result = await resolver.health(
        config.publication.signingKeyId!,
        !!config.publication.authoringEnabled ||
          config.publication.compileEnabled ||
          config.publication.dispatchEnabled,
      );
      return {
        status: result.healthy ? "healthy" : "unhealthy",
        ...(result.message ? { message: result.message } : {}),
      };
    });
  }
}
