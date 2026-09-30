import { describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import {
  createKyselyProvisioningRepository,
  type ProvisioningTransaction,
} from "../kysely-provisioning-repository.js";

const input = {
  id: "10000000-0000-4000-8000-000000000003",
  tenantId: "10000000-0000-4000-8000-000000000001",
  idempotencyKey: "iam-provision-0001",
  requestFingerprint: "a".repeat(64),
  subjectKey: "b".repeat(64),
  realmKey: "athyper",
  normalizedIdentifier: "user@example.com",
  displayIdentifier: "user@example.com",
  planes: ["neon"] as const,
  state: "requested" as const,
  version: 1,
};
const stored = {
  id: input.id,
  authority_tenant_id: input.tenantId,
  idempotency_key: input.idempotencyKey,
  request_fingerprint: input.requestFingerprint,
  realm_key: input.realmKey,
  normalized_identifier: input.normalizedIdentifier,
  display_identifier: input.displayIdentifier,
  target_planes: input.planes,
  status: input.state,
  row_version: 1,
  provider_subject: null,
  failure_reason: null,
};
async function conflict(existing: typeof stored, command = input) {
  const results = [[], [existing]];
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [
      {
        transformQuery: (args) => args.node,
        transformResult: async (args) => ({
          ...args.result,
          rows: results.shift() ?? [],
        }),
      },
    ],
  });
  try {
    return await createKyselyProvisioningRepository().createOrReplay(
      command,
      db as unknown as ProvisioningTransaction,
    );
  } finally {
    await db.destroy();
  }
}
describe("provisioning repository idempotency", () => {
  it("replays only the stored key with the same fingerprint", async () => {
    await expect(conflict(stored)).resolves.toMatchObject({
      kind: "replay",
      request: { idempotencyKey: input.idempotencyKey },
    });
  });
  it("rejects a subject collision under a new key instead of acknowledging an unreserved key", async () => {
    await expect(
      conflict(stored, { ...input, idempotencyKey: "iam-provision-0002" }),
    ).resolves.toEqual({ kind: "conflict" });
  });
  it("rejects the stored key with changed semantic input", async () => {
    await expect(
      conflict(stored, { ...input, requestFingerprint: "c".repeat(64) }),
    ).resolves.toEqual({ kind: "conflict" });
  });
});
