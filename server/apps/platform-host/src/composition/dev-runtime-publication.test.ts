import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely, PostgresDialect } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevRuntimeQualification,
  createDevRuntimePublication,
  type DevRuntimeQualification,
} from "./dev-runtime-publication.js";
import type { DevPublicationConfiguration } from "./dev-publication.js";
const id = "11111111-1111-4111-8111-111111111111",
  author = "22222222-2222-4222-8222-222222222222",
  publisher = "33333333-3333-4333-8333-333333333333";
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const coordinate = {
  releaseId: id,
  releaseNo: 1,
  tenantId: id,
  plane: "neon",
  entityCode: "business_partner",
  contractHash: "a".repeat(64),
  profileHash: "b".repeat(64),
  runtimeHash: "c".repeat(64),
  catalogHash: "d".repeat(64),
  operationKeys: ["read"],
};
const config: DevPublicationConfiguration = {
  schemaVersion: 1,
  instance: "dev",
  tenantId: id,
  tenantCode: "catl",
  entityCode: "business_partner",
  targets: ["neon"],
  author: {
    principalId: author,
    code: "dev.metadata.author",
    authEpoch: 1,
    digest: "a".repeat(64),
  },
  publisher: {
    principalId: publisher,
    code: "dev.metadata.publisher",
    authEpoch: 1,
    digest: "b".repeat(64),
  },
  runtimeApproval: {
    releaseId: id,
    path: "/trusted/evidence.json",
    sha256: "e".repeat(64),
  },
};
const qualification = (): DevRuntimeQualification => ({
  schemaVersion: 1,
  kind: "devfull_runtime_qualification",
  coordinate,
  signingKeyId: "dev-key",
  qualifiedAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  checks: ["build", "tests", "source"].map((kind) => ({
    kind: kind as any,
    path: "/trusted/test",
    sha256: "a".repeat(64),
  })),
});
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "dev-runtime-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const evidence = join(dir, "test.log");
  writeFileSync(evidence, "passed", { mode: 0o600 });
  const q = qualification();
  q.checks = q.checks.map((c) => ({
    ...c,
    path: evidence,
    sha256: digest("passed"),
  }));
  const bytes = JSON.stringify(q);
  const path = join(dir, "qualification.json");
  writeFileSync(path, bytes, { mode: 0o600 });
  const settings = {
    ...config,
    runtimeApproval: { releaseId: id, path, sha256: digest(bytes) },
  };
  const configPath = join(dir, "server.json");
  writeFileSync(configPath, JSON.stringify(settings), { mode: 0o600 });
  const state = { revoked: false, wrongAuthor: false };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("FROM master.principal")
      ? state.revoked
        ? []
        : [{ id }]
      : sql.includes("FROM metadata.entity_release")
        ? [
            {
              created_by: state.wrongAuthor ? publisher : author,
              submitted_by: author,
              approved_by: publisher,
              published_by: publisher,
              branch_code: `dev-publication-${"a".repeat(24)}`,
              contract_json: {},
              approval: { id: "approval", savedHash: digest("{}") },
              dispatch_id: "dispatch",
            },
          ]
        : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const human = vi.fn(async () => ({ receiptSha256: "f".repeat(64) }));
  const record = vi.fn(async () => ({}));
  const service = createDevRuntimePublication({
    environment: "local",
    database: db,
    signingKeyId: "dev-key",
    audit: { record } as never,
    compilation: {
      review: { qualify: human },
      runtime: { qualify() {} },
      catalog: async () => [],
    },
    env: {
      ATHYPER_ENV: "local",
      ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
      ATHYPER_DEV_PRESET: "devfull",
      ATHYPER_DEV_PUBLICATION_CONFIG: configPath,
    },
  });
  return { service, state, record, human, evidence, configPath };
}
describe("DEVFULL runtime workload approval", () => {
  it("uses durable machine provenance and explicit automation audit, without a human receipt", async () => {
    const f = fixture();
    const receipt = await f.service.review.qualify(coordinate);
    expect(receipt).toMatchObject({
      mode: "development_auto_approval",
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(f.human).not.toHaveBeenCalled();
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "metadata.development_runtime.qualified",
        actor: { kind: "service", principalId: publisher },
      }),
      expect.anything(),
    );
  });
  it.each(["revoked", "wrongAuthor"] as const)(
    "rejects %s workload provenance without falling back to human approval",
    async (flag) => {
      const f = fixture();
      f.state[flag] = true;
      await expect(f.service.review.qualify(coordinate)).rejects.toThrow();
      expect(f.human).not.toHaveBeenCalled();
      expect(f.record).not.toHaveBeenCalled();
    },
  );
  it("rechecks evidence files on every use", async () => {
    const f = fixture();
    await f.service.review.qualify(coordinate);
    writeFileSync(f.evidence, "changed");
    await expect(f.service.review.qualify(coordinate)).rejects.toThrow(
      "DEV_RUNTIME_EVIDENCE_CHANGED",
    );
  });
  it("retains the existing human review port for unrelated releases", async () => {
    const f = fixture();
    await f.service.review.qualify({ ...coordinate, releaseId: publisher });
    expect(f.human).toHaveBeenCalledOnce();
    expect(f.record).not.toHaveBeenCalled();
    await expect(f.service.authorizeActivation(publisher)).rejects.toThrow(
      "ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED",
    );
  });
  it.each([
    { plane: "mesh" },
    { tenantId: author },
    { entityCode: "other" },
    { catalogHash: "e".repeat(64) },
    { operationKeys: ["write"] },
    { releaseNo: 2 },
  ])("rejects coordinate substitution %j", (patch) => {
    expect(() =>
      assertDevRuntimeQualification(
        config,
        qualification(),
        { ...coordinate, ...patch },
        "dev-key",
      ),
    ).toThrow();
  });
  it("rejects changed signing keys, expired qualification, unbounded validity and missing tests", () => {
    expect(() =>
      assertDevRuntimeQualification(
        config,
        qualification(),
        coordinate,
        "prod-key",
      ),
    ).toThrow("DEV_RUNTIME_SIGNING_KEY_CHANGED");
    for (const q of [
      { ...qualification(), expiresAt: new Date(0).toISOString() },
      {
        ...qualification(),
        expiresAt: new Date(Date.now() + 86400001).toISOString(),
      },
      { ...qualification(), checks: [] },
    ])
      expect(() =>
        assertDevRuntimeQualification(config, q, coordinate, "dev-key"),
      ).toThrow();
  });
});
