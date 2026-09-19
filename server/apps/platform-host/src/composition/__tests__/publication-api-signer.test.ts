import { generateKeyPairSync } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerAdapters } from "../register-adapters.js";
it("composes a working API signer without enabling compile or dispatch workers", async () => {
  const config = loadConfig(),
    container = createContainer();
  Object.assign(config.publication, {
    apiEnabled: true,
    authoringEnabled: true,
    compileEnabled: false,
    dispatchEnabled: false,
    applyEnabled: false,
    signingKeyId: "fixture",
    privateKeyReference: "private",
    publicKeyReference: "public",
  });
  Object.assign(config.infisical, {
    endpoint: "https://secretstore.test",
    token: "fixture",
    workspaceId: "fixture",
  });
  container.adapters.objectStorageArtifacts = {
    head: async () => ({}),
    putIfAbsent: async () => ({ created: true }),
  } as never;
  container.adapters.objectStorageArtifactsBucket = "fixture";
  const keys = generateKeyPairSync("ed25519");
  const resolve = vi.fn(async (reference: string) => ({
    bytes: Buffer.from(
      reference === "private"
        ? keys.privateKey.export({ format: "der", type: "pkcs8" })
        : keys.publicKey.export({ format: "der", type: "spki" }),
    ),
    version: "1",
  }));
  registerAdapters(container, config, createLifecycle(), {
    createSecretStore: () => ({ resolve }),
  });
  expect(container.adapters.publicationSigner).toBeDefined();
  const bytes = new TextEncoder().encode("publication fixture");
  const result = await container.adapters.publicationSigner!.sign({
    keyId: "fixture",
    algorithm: "Ed25519",
    bytes,
  });
  expect(
    await container.adapters.publicationVerifier!.verify({
      keyId: "fixture",
      algorithm: "Ed25519",
      bytes,
      signature: result.signature,
    }),
  ).toBe(true);
  expect(config.publication.compileEnabled).toBe(false);
  expect(config.publication.dispatchEnabled).toBe(false);
});
