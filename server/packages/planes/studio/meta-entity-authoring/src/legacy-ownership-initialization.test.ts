import { expect, it, vi } from "vitest";
import type { Kysely, Transaction } from "kysely";
import {
  applyLegacyOwnershipInitialization,
  type LegacyOwnershipPolicy,
} from "./legacy-ownership-initialization.js";
import {
  applyLegacyIdentityInstallation,
  type LegacyIdentityInstallationPolicy,
} from "./legacy-identity-installation.js";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  entityId: id,
  changeSetId: id,
  actorId: id,
  tenantId: null,
  expectedRevision: 0,
  expectedSourceHash: "a".repeat(64),
  idempotencyKey: "ownership-command-00001",
};
it("requires independently installed command policies before acquiring database access", async () => {
  const repo = new KyselyMetaEntityAuthoringRepository(
    {} as Kysely<Record<string, never>>,
  );
  await expect(
    repo.executeLegacyOwnershipInitialization(input),
  ).rejects.toMatchObject({ code: "LEGACY_OWNERSHIP_HOST_NOT_CONFIGURED" });
  await expect(
    repo.executeLegacyIdentityInstallation(input),
  ).rejects.toMatchObject({ code: "LEGACY_IDENTITY_HOST_NOT_CONFIGURED" });
});
it("rejects scope, revision and injected authority before either command is admitted", async () => {
  const admit = vi.fn(),
    load = vi.fn();
  const tx = { isTransaction: true } as Transaction<Record<string, never>>;
  for (const patch of [
    { tenantId: id },
    { reviewerId: id },
    { sourceKind: "product" },
    { authoringSchemaHash: "b".repeat(64) },
    { expectedRevision: Number.MAX_SAFE_INTEGER },
    { expectedRevision: -1 },
    { expectedSourceHash: "unknown" },
    { idempotencyKey: "short" },
  ]) {
    await expect(
      applyLegacyOwnershipInitialization(
        tx,
        { ...input, ...patch },
        { admit } as unknown as LegacyOwnershipPolicy,
        load,
      ),
    ).rejects.toThrow();
    await expect(
      applyLegacyIdentityInstallation(
        tx,
        { ...input, ...patch },
        { admit } as unknown as LegacyIdentityInstallationPolicy,
        load,
      ),
    ).rejects.toThrow();
  }
  expect(admit).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
});
it("requires a caller-owned transaction and audit-capable policy", async () => {
  const load = vi.fn();
  await expect(
    applyLegacyOwnershipInitialization(
      {} as Transaction<Record<string, never>>,
      input,
      {} as LegacyOwnershipPolicy,
      load,
    ),
  ).rejects.toMatchObject({ code: "NORMALIZED_SAVE_TRANSACTION_REQUIRED" });
  await expect(
    applyLegacyIdentityInstallation(
      {} as Transaction<Record<string, never>>,
      input,
      {} as LegacyIdentityInstallationPolicy,
      load,
    ),
  ).rejects.toMatchObject({ code: "NORMALIZED_SAVE_TRANSACTION_REQUIRED" });
  for (const policy of [
    {},
    { schemaVersion: 1, authoringSchemaHash: "a".repeat(64), admit: vi.fn() },
  ])
    await expect(
      applyLegacyOwnershipInitialization(
        { isTransaction: true } as Transaction<Record<string, never>>,
        input,
        policy as LegacyOwnershipPolicy,
        load,
      ),
    ).rejects.toMatchObject({ code: "LEGACY_OWNERSHIP_POLICY_REQUIRED" });
  expect(load).not.toHaveBeenCalled();
});
