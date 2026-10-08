import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import {
  entityLiveResourceHash,
  type EntityLockedReadEvidence,
} from "@athyper/server-service-records";
const { lock } = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock("@athyper/server-service-publication", () => ({
  withLockedLocalLiveReadResources: lock,
}));
import { createLocalEntityLiveReadEvidence } from "./entity-live-read-evidence.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Tx = Transaction<Record<string, never>>;
function fixture() {
  const transaction = { isTransaction: true } as Tx;
  const context = {
    tenantId: id(1),
    principalId: id(2),
    planeKey: "studio",
    authEpoch: 1,
    permissions: {
      principalFingerprint: "actor",
      profileHash: "profile",
      schemaHash: "schema",
    },
  } as VerifiedRequestContext;
  const source = {
    entityId: id(3),
    releaseId: id(4),
    contractHash: "a".repeat(64),
    tenantId: null,
  };
  const security = {
    schema: "entity.effective-security-manifest/1",
    entityCode: "reference_fixture",
    source,
    plane: "studio",
    scope: { contract: "tenant.record.v1", tenantId: context.tenantId },
    operations: [],
    fields: [],
    unsupportedControls: [],
  };
  const pin = (key: string, content: unknown) => ({
    owner: "platform",
    namespace: "fixture",
    key,
    version: 1,
    hash: entityLiveResourceHash(content),
  });
  const securityPin = pin("security", security),
    storagePin = pin("storage", {});
  const descriptor = {
    planeKey: "studio",
    liveReadContract: {
      schema: "entity.live-read/1",
      source,
      security: securityPin,
      storageAuthority: storagePin,
    },
  } as EntityRuntimeDescriptor;
  const bindings = [securityPin, storagePin].map((pin, i) => ({
    publicationKey: pin.key,
    releaseId: id(10 + i),
    artifactHash: "b".repeat(64),
    pin,
  }));
  const installation = {
    bindings,
    currentSecurity: [{ entityId: source.entityId, pin: securityPin }],
  };
  let locked = false;
  lock.mockImplementation(async (_options, work) => {
    locked = true;
    try {
      return await work({
        generation: "generation",
        read: (p: typeof securityPin) => {
          if (!locked) throw Error("LOCK_CLOSED");
          return { pin: p, content: p.key === "security" ? security : {} };
        },
      });
    } finally {
      locked = false;
    }
  });
  const options = {
    publication: {
      maximumBytes: 100000,
      maximumResources: 8,
      runtimeVersion: "1.0.0",
      canonical: {
        canonicalBytes: (v: unknown) => Buffer.from(JSON.stringify(v)),
        sha256: () => "a".repeat(64),
      },
      verifier: { verify: vi.fn(async () => true) },
    },
    resolve: vi.fn(async () => installation),
    installedCapability: vi.fn(async () => null as unknown),
    securityDescriptor: vi.fn(async () => descriptor),
    providerSupported: vi.fn(async () => true),
    permissionSupported: vi.fn(async () => true),
  };
  const port = createLocalEntityLiveReadEvidence(options);
  return {
    transaction,
    context,
    descriptor,
    source,
    securityPin,
    storagePin,
    installation,
    options,
    port,
    locked: () => locked,
  };
}
beforeEach(() => vi.resetAllMocks());
it("holds the publication scope through the record callback and resolves explicit current security", async () => {
  const f = fixture();
  let captured: EntityLockedReadEvidence<Tx>;
  const result = await f.port.withLockedEvidence(f, async (e) => {
    captured = e;
    expect(f.locked()).toBe(true);
    expect(e.caller.principalId).toBe(f.context.principalId);
    expect(
      await e.currentSecurity(f.source.entityId, f.transaction),
    ).toMatchObject({ pin: f.securityPin });
    expect(await e.currentSecurity(id(99), f.transaction)).toBeNull();
    expect(await e.installed(f.securityPin, f.transaction)).toMatchObject({
      source: f.source,
    });
    expect(await e.maskSupported(f.securityPin, f.transaction)).toBe(false);
    return "record-result";
  });
  expect(result).toBe("record-result");
  expect(f.locked()).toBe(false);
  await expect(
    captured!.installed(f.securityPin, f.transaction),
  ).rejects.toThrow("INSTALLATION_UNAVAILABLE");
  expect(f.options.installedCapability).not.toHaveBeenCalled();
});
it("rejects a different transaction and changed authenticated caller", async () => {
  const f = fixture();
  await f.port.withLockedEvidence(f, async (e) => {
    await expect(
      e.installed(f.securityPin, { isTransaction: true } as Tx),
    ).rejects.toThrow();
    Object.assign(f.context, { authEpoch: 2 });
    await expect(
      e.currentSecurity(f.source.entityId, f.transaction),
    ).rejects.toThrow();
  });
});
it("closes evidence after a failed repository read", async () => {
  const f = fixture();
  let captured: EntityLockedReadEvidence<Tx>;
  await expect(
    f.port.withLockedEvidence(f, async (e) => {
      captured = e;
      throw Error("READ_FAILED");
    }),
  ).rejects.toThrow("READ_FAILED");
  await expect(
    captured!.providerSupported(f.securityPin, f.descriptor, f.transaction),
  ).rejects.toThrow();
  expect(f.locked()).toBe(false);
});
it.each(["missing-current", "duplicate-current", "missing-storage"])(
  "rejects incomplete installation closure: %s",
  async (mode) => {
    const f = fixture();
    if (mode === "missing-current") f.installation.currentSecurity = [];
    if (mode === "duplicate-current")
      f.installation.currentSecurity.push(f.installation.currentSecurity[0]!);
    if (mode === "missing-storage") f.installation.bindings.pop();
    await expect(f.port.withLockedEvidence(f, async () => {})).rejects.toThrow(
      "INSTALLATION_UNAVAILABLE",
    );
    expect(lock).not.toHaveBeenCalled();
  },
);
it("does not resolve a source descriptor for an unlocked manifest", async () => {
  const f = fixture();
  await f.port.withLockedEvidence(f, async (e) => {
    await expect(
      e.securityDescriptor({ source: f.source } as never, f.transaction),
    ).rejects.toThrow();
    expect(f.options.securityDescriptor).not.toHaveBeenCalled();
  });
});
it("checks installed capability content and propagates owner qualification failure", async () => {
  const f = fixture(),
    content = { schema: "fixture.provider/1" },
    p = {
      ...f.securityPin,
      key: "provider",
      hash: entityLiveResourceHash(content),
    };
  await f.port.withLockedEvidence(f, async (e) => {
    f.options.installedCapability.mockResolvedValueOnce(content);
    expect(await e.installed(p, f.transaction)).toEqual(content);
    f.options.installedCapability.mockResolvedValueOnce({ schema: "changed" });
    await expect(e.installed(p, f.transaction)).rejects.toThrow();
    f.options.providerSupported.mockRejectedValueOnce(
      Error("PROVIDER_REVOKED"),
    );
    await expect(
      e.providerSupported(p, f.descriptor, f.transaction),
    ).rejects.toThrow("PROVIDER_REVOKED");
  });
});
it("rejects wrong plane and nontransactional use before discovery", async () => {
  const f = fixture();
  await expect(
    f.port.withLockedEvidence({ ...f, transaction: {} as Tx }, async () => {}),
  ).rejects.toThrow();
  await expect(
    f.port.withLockedEvidence(
      { ...f, descriptor: { ...f.descriptor, planeKey: "mesh" } },
      async () => {},
    ),
  ).rejects.toThrow();
  expect(f.options.resolve).not.toHaveBeenCalled();
});
