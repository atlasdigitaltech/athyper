import { beforeEach, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import type { Transaction } from "kysely";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { compileEntityAuthoringResource } from "@athyper/server-service-publication";
import {
  uiComponentColumns,
  type UiComponentResourceSource,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityAuthoringResourceSource } from "@athyper/server-contract-publication";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("kysely", () => ({ sql: () => ({ execute: query }) }));
import { createComponentCatalogueInstaller } from "./component-installation.js";
const id = "00000000-0000-4000-8000-000000000001";
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const hash = (value: unknown) => sha256(canonicalBytes(value));
beforeEach(() => vi.resetAllMocks());
async function fixture() {
  const payload: UiComponentResourceSource = {
    schema: "entity.ui-component-resource/1",
    declaration: {
      id,
      tenantId: null,
      componentKey: "fixture.text",
      componentVersion: 1,
      componentLevel: "field_display",
      componentTier: "standard",
      resourceOwner: "platform",
      resourceNamespace: "entity.ui",
      publicationResourceKey: "fixture.text",
      supportedDataTypes: ["string"],
      supportedPlanes: ["studio"],
      supportedSurfaceKinds: ["list"],
      supportedModes: [],
      cardinalities: ["one"],
      optionKeys: [],
      filterOperators: [],
      compatibleDisplayIds: [],
      maskedRepresentationSafe: false,
    },
    implementation: {
      packageName: "fixture",
      exportName: "Text",
      runtimeKey: "text",
      sourceHash: "a".repeat(64),
    },
  };
  const source: EntityAuthoringResourceSource = {
    kind: "entity_ui_component",
    releaseId: id,
    publicationKey: "fixture.text",
    releaseNo: 1,
    generatedAt: "2026-10-08T00:00:00Z",
    payload,
  };
  const unsigned = await compileEntityAuthoringResource(
    source,
    { load: async () => source, qualify: async () => {} },
    { canonicalBytes, sha256 },
    "fixture-key",
  );
  const keys = generateKeyPairSync("ed25519");
  const signature = sign(
    null,
    canonicalBytes(unsigned),
    keys.privateKey,
  ).toString("base64");
  const document = { ...unsigned, signature };
  const row = {
    source_json: payload,
    signed_document: document,
    artifact_hash: hash(document),
    payload_hash: hash(payload),
    release_hash: hash(source),
    reviewed_source: source,
    deployment_bundle: {
      deploymentId: id,
      deploymentStatus: "verified",
      targetPlane: "studio",
      targetEnvironment: "local",
      targetInstance: "fixture",
      publicationKey: source.publicationKey,
      sourceReleaseId: id,
      sourceReleaseNo: 1,
      artifactUri: "fixture://component",
      artifactHash: hash(document),
      signatureAlgorithm: "Ed25519",
      signingKeyId: "fixture-key",
      signature,
    },
  };
  const projection = {
    ...payload.declaration,
    manifestHash: row.payload_hash,
    publicationReleaseHash: row.release_hash,
    status: "active",
  };
  const stored = Object.fromEntries(
    Object.entries(uiComponentColumns).map(([key, col]) => [
      col.name,
      Reflect.get(projection, key),
    ]),
  );
  query
    .mockResolvedValueOnce({ rows: [row] })
    .mockResolvedValueOnce({ rows: [{ row: stored }] });
  const qualify = vi.fn(async () => {});
  const verifier = vi.fn(
    async (input: { bytes: Uint8Array; signature: string }) =>
      verify(
        null,
        input.bytes,
        keys.publicKey,
        Buffer.from(input.signature, "base64"),
      ),
  );
  const options = {
    canonicalizer: { canonicalBytes, sha256 },
    runtimeVersion: "1.0.0",
    verifier: { verify: verifier },
    store: {
      get: vi.fn(async () => {
        throw Error("MUST_USE_LOCKED_BYTES");
      }),
      putImmutable: async () => {},
    },
    uiComponents: { qualify },
  };
  return { options, row, qualify, verifier };
}
it("re-verifies the signed locked source and qualifies it before the restricted install", async () => {
  const f = await fixture();
  await createComponentCatalogueInstaller(f.options).install(tx, id);
  expect(f.verifier).toHaveBeenCalledOnce();
  expect(f.qualify).toHaveBeenCalledOnce();
  expect(f.options.store.get).not.toHaveBeenCalled();
  expect(query).toHaveBeenCalledTimes(2);
});
it.each(["reviewed_source", "source_json", "signed_document"] as const)(
  "rejects changed %s before writing",
  async (key) => {
    const f = await fixture();
    f.row[key] = { changed: true } as never;
    await expect(
      createComponentCatalogueInstaller(f.options).install(tx, id),
    ).rejects.toThrow("COMPONENT_ACTIVE_SOURCE_HASH_MISMATCH");
    expect(query).toHaveBeenCalledOnce();
  },
);
it("rejects revoked signing trust and component qualification failure without installation", async () => {
  let f = await fixture();
  f.verifier.mockResolvedValueOnce(false);
  await expect(
    createComponentCatalogueInstaller(f.options).install(tx, id),
  ).rejects.toThrow();
  expect(query).toHaveBeenCalledOnce();
  query.mockReset();
  f = await fixture();
  f.qualify.mockRejectedValueOnce(Error("IMPLEMENTATION_CHANGED"));
  await expect(
    createComponentCatalogueInstaller(f.options).install(tx, id),
  ).rejects.toThrow("IMPLEMENTATION_CHANGED");
  expect(query).toHaveBeenCalledOnce();
});
it("requires a transaction and a configured qualifier", async () => {
  const f = await fixture();
  expect(() =>
    createComponentCatalogueInstaller({
      ...f.options,
      uiComponents: undefined,
    }),
  ).toThrow("COMPONENT_INSTALLATION_QUALIFIER_REQUIRED");
  await expect(
    createComponentCatalogueInstaller(f.options).install(
      { isTransaction: false } as typeof tx,
      id,
    ),
  ).rejects.toThrow("COMPONENT_INSTALLATION_TRANSACTION_REQUIRED");
  expect(query).not.toHaveBeenCalled();
});
