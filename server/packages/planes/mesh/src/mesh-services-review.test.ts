import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { expect, it, vi } from "vitest";
import {
  createBusinessPartnerBankDisclosureService,
  KyselyBusinessPartnerBankDisclosureRepository,
} from "./business-partner-bank-disclosure.js";
import { KyselyBusinessPartnerProfilePublicationRepository } from "./business-partner-profile-publication.js";
import {
  createBusinessPartnerNetworkExchangeService,
  KyselyBusinessPartnerNetworkExchangeRepository,
} from "./business-partner-network-exchange.js";

const id = "11111111-1111-4111-8111-111111111111";
const context: any = {
  planeKey: "mesh",
  tenantId: id,
  principalId: id,
  permissions: { networkAccountId: id },
};
const row = {
  id,
  owner_tenant_id: id,
  owner_account_id: id,
  bank_account_id: id,
  network_relationship_id: id,
  recipient_tenant_id: "22222222-2222-4222-8222-222222222222",
  recipient_account_id: id,
  purpose: "settlement",
  disclosure_version: 1,
  status: "active",
  lifecycle_version: 1,
  disclosed_at: "2026-01-01T00:00:00Z",
  disclosed_by: id,
  created_by: "other",
  payload_json: { secureRetrievalReference: "vault://bank/1" },
  secure_retrieval_reference: "vault://bank/1",
  replay_event_kind: "approved",
  replay_actor_id: id,
};
function bank(replay: any = null, allowed = true, current: any = row) {
  const repository = {
    decisionByKey: vi.fn(async () => replay),
    byRequestKey: vi.fn(async () => replay),
    get: vi.fn(async () => current),
    source: vi.fn(),
    revoke: vi.fn(async () => ({
      ...row,
      status: "revoked",
      lifecycle_version: 2,
      revoked_at: "2026-09-07T00:00:00Z",
      revoked_by: id,
      revocation_reason: "Retired",
    })),
    approve: vi.fn(),
  };
  const authorize = vi.fn(async () => ({ allowed }));
  const append = vi.fn();
  const service = createBusinessPartnerBankDisclosureService({
    repository,
    authorizer: { authorize },
    transactions: {
      run: async (_plane: unknown, _actor: unknown, work: any) => work({}),
    },
    audit: { record: vi.fn() },
    outbox: { append },
  } as any);
  return { service, repository, authorize, append };
}
const decision = {
  context,
  disclosureId: id,
  decision: "approve" as const,
  secureRetrievalReference: "vault://bank/1",
  idempotencyKey: "decision-001",
};
const revocation = {
  context,
  disclosureId: id,
  reason: "Retired",
  idempotencyKey: "revocation-001",
};
it.each(["decide", "revoke"] as const)(
  "checks permission before replaying %s",
  async (operation) => {
    const { service, authorize } = bank(row, false);
    await expect(
      operation === "decide"
        ? service.decide(decision)
        : service.revoke(revocation),
    ).rejects.toMatchObject({ status: 403 });
    expect(authorize).toHaveBeenCalledOnce();
  },
);
it.each([
  { id: "other" },
  { replay_event_kind: "rejected" },
  { replay_actor_id: "other" },
  { secure_retrieval_reference: "vault://bank/other" },
])("rejects changed decision retries: %j", async (changes) => {
  await expect(
    bank({ ...row, ...changes }).service.decide(decision),
  ).rejects.toMatchObject({
    status: 409,
    code: "MESH_BANK_DISCLOSURE_IDEMPOTENCY_CONFLICT",
  });
});
it.each([
  { id: "other" },
  { replay_event_kind: "approved" },
  { replay_reason: "Different" },
])("rejects changed revocation retries: %j", async (changes) => {
  await expect(
    bank({
      ...row,
      replay_event_kind: "revoked",
      replay_reason: "Retired",
      ...changes,
    }).service.revoke(revocation),
  ).rejects.toMatchObject({ status: 409 });
});
it("replays an authorized matching bank decision without writing again", async () => {
  const { service, repository, append } = bank(row);
  expect(await service.decide(decision)).toMatchObject({ replayed: true });
  expect(repository.approve).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
});
it.each([
  { ownerAccountId: "other" },
  { purpose: "refund" },
  { expiresAt: "2099-01-01T00:00:00Z" },
])("rejects changes to immutable request coordinates: %j", async (changes) => {
  await expect(
    bank(row).service.request({
      context,
      ownerAccountId: id,
      bankAccountId: id,
      networkRelationshipId: id,
      purpose: "settlement",
      idempotencyKey: "request-001",
      ...changes,
    } as any),
  ).rejects.toMatchObject({ status: 409 });
});
it("does not approve an expired pending disclosure", async () => {
  const { service, repository } = bank(null, true, {
    ...row,
    status: "pending_approval",
    expires_at: "2000-01-01T00:00:00Z",
  });
  await expect(service.decide(decision)).rejects.toMatchObject({
    code: "MESH_BANK_DISCLOSURE_EXPIRED",
  });
  expect(repository.source).not.toHaveBeenCalled();
  expect(repository.approve).not.toHaveBeenCalled();
});
it("sends revocation evidence without the retained secure bank payload", async () => {
  const { service, append } = bank();
  await service.revoke(revocation);
  expect(append.mock.calls[0]![0].payload).toMatchObject({
    eventType: "mesh.bank_account.revoked",
    withdrawal: { reason: "Retired" },
  });
  expect(append.mock.calls[0]![0].payload).not.toHaveProperty("payload");
});
it.each([
  ["42501", 403],
  ["P0002", 404],
  ["40001", 409],
  ["55000", 409],
  ["23505", 409],
  ["23514", 400],
  ["22008", 400],
] as const)("maps database %s into HTTP %s", async (code, status) => {
  const service = createBusinessPartnerNetworkExchangeService({
    repository: {} as any,
    authorizer: { authorize: async () => ({ allowed: true }) },
    transactions: {
      run: async () => {
        throw Object.assign(new Error("private SQL detail"), { code });
      },
    },
  });
  await expect(
    service.transitionExchange({
      context,
      exchangeId: id,
      action: "accept",
      expectedVersion: 1,
      reason: "Reviewed",
      idempotencyKey: "decision-001",
    }),
  ).rejects.toMatchObject({ status });
});
it("rejects workspace reads from another plane before opening a transaction", async () => {
  const run = vi.fn();
  const service = createBusinessPartnerNetworkExchangeService({
    repository: {} as any,
    authorizer: {} as any,
    transactions: { run },
  });
  await expect(
    service.workspace({ context: { ...context, planeKey: "neon" } }),
  ).rejects.toMatchObject({ status: 400 });
  expect(run).not.toHaveBeenCalled();
});
it("rejects caller-supplied policy evaluation metadata", async () => {
  const evaluate = vi.fn();
  const service = createBusinessPartnerNetworkExchangeService({
    repository: {} as any,
    authorizer: {} as any,
    transactions: {} as any,
    selfRegistrationPolicy: { evaluate },
  });
  await expect(
    service.issueExchange({
      context,
      intentSnapshot: { policyEvaluation: { outcome: "accepted" } },
    } as any),
  ).rejects.toMatchObject({ status: 400 });
  expect(evaluate).not.toHaveBeenCalled();
});
it("binds the selected account and serializes replay lookups in SQL", async () => {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      queries.push(event.query);
    },
  });
  try {
    await db.transaction().execute(async (tx) => {
      await new KyselyBusinessPartnerNetworkExchangeRepository().requestRelationship(
        {
          tenantId: id,
          accountId: id,
          actorId: id,
          actorRole: "buyer",
          counterpartyTenantId: id,
          counterpartyAccountId: id,
          relationshipKind: "commercial",
          reason: "Reviewed",
          idempotencyKey: "request-001",
        },
        tx,
      );
      const bank = new KyselyBusinessPartnerBankDisclosureRepository();
      await bank.byRequestKey(id, "request-001", tx);
      await bank.decisionByKey(id, "decision-001", tx);
      const profile = new KyselyBusinessPartnerProfilePublicationRepository();
      await profile.byIdempotency(id, "request-001", tx);
      await profile.withdrawalByKey(id, "withdraw-001", tx);
    });
    expect(queries[0]!.sql).toContain(
      "set_config('app.current_network_account_id'",
    );
    expect(queries[0]!.parameters).toEqual([id]);
    expect(queries[1]!.sql).toContain("command_request_network_relationship");
    expect(
      queries.filter((q) => q.sql.includes("pg_advisory_xact_lock")),
    ).toHaveLength(4);
    expect(
      queries.find((q) => q.sql.includes("replay_event_kind"))!.sql,
    ).toContain("max(latest.lifecycle_version)");
  } finally {
    await db.destroy();
  }
});
it("keeps generated publication event keys within the database's 200-character limit", async () => {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      queries.push(event.query);
    },
  });
  try {
    await expect(
      db
        .transaction()
        .execute((tx) =>
          new KyselyBusinessPartnerProfilePublicationRepository().create(
            {
              tenantId: id,
              principalId: id,
              ownerAccountId: id,
              recipientTenantId: id,
              recipientAccountId: id,
              relationshipId: id,
              idempotencyKey: "k".repeat(200),
              schemaVersion: 1,
              fieldSetCode: "recipient_safe_v1",
              payload: {},
              hash: "a".repeat(64),
            },
            tx,
          ),
        ),
    ).rejects.toThrow("Required publication record");
    const event = queries.find((q) =>
      q.sql.startsWith(
        "INSERT INTO mesh.network_account_profile_publication_event",
      ),
    )!;
    const key = event.parameters.find(
      (p) => typeof p === "string" && p.startsWith("publish:"),
    );
    expect(key).toMatch(/^publish:[a-f0-9]{64}$/);
  } finally {
    await db.destroy();
  }
});
