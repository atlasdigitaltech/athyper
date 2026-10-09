import { resolveLocalPublicationAuthority } from "../local-publication-policy.js";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ReferenceOnboardingPolicy } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  createPublicationPolicyEnrollment,
  PUBLICATION_POLICY_PERMISSIONS,
} from "../policy-enrollment.js";
import * as authoring from "@athyper/server-plane-studio-meta-entity-authoring";
import type { DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { parseEnrollablePublicationPolicy } from "../enrollment-contract.js";
import * as compilerBuild from "../compiler-build.js";
import * as recoverySource from "../compilation-recovery-source.js";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const policy: ReferenceOnboardingPolicy = {
  schema: "athyper.dev-reference-onboarding/1",
  policyId: "test.enrollment",
  revision: 1,
  environment: "local",
  instance: "dev",
  preset: "devfull",
  entityId: id(1),
  changeSetId: id(2),
  authorPrincipalId: id(3),
  publisherPrincipalId: id(4),
  productHash: "a".repeat(64),
  contractHash: "b".repeat(64),
  descriptorHash: "c".repeat(64),
  targetPlanes: ["studio", "neon", "mesh"],
};
function fixture() {
  let definition: Record<string, any> | undefined;
  let rules: Record<string, any>[] = [],
    tests: Record<string, any>[] = [];
  let currentActor = id(7),
    revoked = false;
  const query = vi.fn(async (text: string, values: any[] = []) => {
    let rows: unknown[] = [];
    if (text.includes("pg_try_advisory_xact_lock")) rows = [{ locked: true }];
    if (text.includes("set_config")) currentActor = values[1];
    if (text.includes("FROM master.principal"))
      rows = revoked ? [] : [{ id: currentActor }];
    if (text.includes("SELECT id,principal_type FROM master.principal"))
      rows = revoked
        ? []
        : values[1].map((idValue: string) => ({
            id: idValue,
            principal_type: [id(3), id(4)].includes(idValue)
              ? "service_account"
              : "user",
          }));
    if (text.includes("FROM metadata.entity_change_set"))
      rows = [{ id: id(2) }];
    if (text.includes("INSERT INTO control.policy_definition"))
      definition = {
        id: values[0],
        tenant_id: values[1],
        entity_type: values[2],
        name: values[3],
        priority: values[4],
        evaluation_mode: values[5],
        start_date: values[6],
        version_no: values[8],
        status: "draft",
        created_by: values[10],
      };
    if (text.includes("INSERT INTO control.policy_rule"))
      rules.push({
        id: values[0],
        priority: values[2],
        condition_expr: JSON.parse(values[3]),
        action_code: values[4],
        action_config: JSON.parse(values[5]),
        metadata: JSON.parse(values[6]),
      });
    if (text.includes("INSERT INTO control.policy_test_case"))
      tests.push({
        id: values[0],
        policy_definition_id: values[1],
        code: values[2],
        name: values[3],
        input_payload: JSON.parse(values[4]),
        expected_outcome: JSON.parse(values[5]),
      });
    if (text.includes("SELECT d.created_by<>d.updated_by"))
      rows = [{ valid: !revoked }];
    if (text.includes("SELECT *,effective_from"))
      rows = definition ? [definition] : [];
    if (text.includes("SELECT * FROM control.policy_rule")) rows = rules;
    if (text.includes("SELECT id,policy_definition_id,code,name,input_payload"))
      rows = tests;
    if (text.includes("SELECT t.policy_definition_id"))
      rows = definition ? [{ policy_definition_id: definition.id }] : [];
    if (text.includes("SET status='pending_approval'"))
      Object.assign(definition!, {
        status: "pending_approval",
        definition_hash: values[0],
      });
    if (text.includes("SET status='active'"))
      Object.assign(definition!, { status: "active", updated_by: values[0] });
    if (text.includes("SELECT id FROM control.policy_definition"))
      rows = definition ? [{ id: definition.id }] : [];
    return { rows };
  });
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const authorize = vi.fn(async () => ({
    allowed: true as boolean,
    reason: "test",
  }));
  const record = vi.fn(async (event: any) => ({
    ...event,
    id: id(9),
    occurredAt: new Date().toISOString(),
  }));
  const signer = { sign: vi.fn(), verify: vi.fn() };
  const options = {
    database,
    authorizer: { authorize },
    audit: { record },
    signer,
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
    authority: {
      tenantId: id(6),
      realmKey: "platform-control",
      issuer: "https://iam.dev.athyper.test/realms/platform-control",
      audience: "athyper-platform-control-api",
    },
  };
  const context = {
    planeKey: "studio",
    realmKey: "platform-control",
    assurance: "elevated",
    tenantId: id(6),
    principalId: id(7),
    authEpoch: 0,
    requestId: id(10),
  } as VerifiedRequestContext;
  return {
    options,
    context,
    query,
    record,
    authorize,
    signer,
    database,
    revoke: () => {
      revoked = true;
    },
    changeTest: () => {
      tests[0]!.expected_outcome = { action: "none" };
    },
  };
}
it("persists tested pending enrollment, then independently activates with transactional audit", async () => {
  const f = fixture();
  try {
    const service = createPublicationPolicyEnrollment(f.options);
    const pending = await service.propose(f.context, policy);
    expect(pending.status).toBe("pending_approval");
    expect(
      f.query.mock.calls.filter(([q]) =>
        q.includes("INSERT INTO control.policy_test_result"),
      ),
    ).toHaveLength(6);
    const active = await service.activate(
      { ...f.context, principalId: id(8) },
      pending.id,
      pending.hash,
    );
    expect(active.status).toBe("active");
    expect(
      f.query.mock.calls.filter(([q]) =>
        q.includes("INSERT INTO control.policy_test_result"),
      ),
    ).toHaveLength(12);
    expect(f.authorize.mock.calls).toHaveLength(2);
    expect(
      f.record.mock.calls.map(([event]) => event.actor.principalId),
    ).toEqual([id(7), id(8)]);
    expect(f.signer.sign).not.toHaveBeenCalled(); // Enrollment is not artifact signing.
  } finally {
    await f.database.destroy();
  }
});
it.each(["qa", "staging", "production"])(
  "rejects %s without storage access",
  async (instance) => {
    const f = fixture();
    try {
      expect(() =>
        createPublicationPolicyEnrollment({ ...f.options, instance }),
      ).toThrow("DEV_ONLY");
      expect(f.query).not.toHaveBeenCalled();
    } finally {
      await f.database.destroy();
    }
  },
);
it("denies absent IAM grants before opening a transaction", async () => {
  const f = fixture();
  f.authorize.mockResolvedValue({
    allowed: false,
    reason: "missing permission",
  });
  try {
    await expect(
      createPublicationPolicyEnrollment(f.options).propose(f.context, policy),
    ).rejects.toThrow("FORBIDDEN");
    expect(f.query).not.toHaveBeenCalled();
  } finally {
    await f.database.destroy();
  }
});
it("rejects revoked identities, self-approval, workload approval, pin drift and weakened test evidence", async () => {
  const f = fixture();
  try {
    const service = createPublicationPolicyEnrollment(f.options);
    const pending = await service.propose(f.context, policy);
    await expect(
      service.activate(f.context, pending.id, pending.hash),
    ).rejects.toThrow("MAKER_CHECKER");
    await expect(
      service.activate(
        { ...f.context, principalId: id(4) },
        pending.id,
        pending.hash,
      ),
    ).rejects.toThrow("INDEPENDENT_ACTOR");
    await expect(
      service.activate(
        { ...f.context, principalId: id(8) },
        pending.id,
        "f".repeat(64),
      ),
    ).rejects.toThrow("PIN_MISMATCH");
    f.changeTest();
    await expect(
      service.activate(
        { ...f.context, principalId: id(8) },
        pending.id,
        pending.hash,
      ),
    ).rejects.toThrow("TEST_CHANGED");
    f.revoke();
    await expect(
      service.activate(
        { ...f.context, principalId: id(8) },
        pending.id,
        pending.hash,
      ),
    ).rejects.toThrow("ACTOR_REVOKED");
  } finally {
    await f.database.destroy();
  }
});
it("rolls back rather than accepting enrollment without audit evidence", async () => {
  const f = fixture();
  f.record.mockRejectedValue(Error("audit unavailable"));
  try {
    await expect(
      createPublicationPolicyEnrollment(f.options).propose(f.context, policy),
    ).rejects.toThrow("audit unavailable");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("rollback");
  } finally {
    await f.database.destroy();
  }
});
it("keeps enrollment permissions distinct and enforces explicit import ownership", () => {
  expect(Object.values(PUBLICATION_POLICY_PERMISSIONS)).not.toContain(
    "studio.metadata.contract.publish",
  );
  const source = ts.createSourceFile(
    "policy-enrollment.ts",
    readFileSync(new URL("../policy-enrollment.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const allowed = new Set([
    "./local-publication-policy.js",
    "./native-compilation-recovery-policy.js",
    "./native-compilation-recovery-source.js",
    "./deployment-recovery-compiler.js",
    "./deployment-recovery-source.js",
    "./policy-replacement.js",
    "./human-publication-admission.js",
    "node:crypto",
    "kysely",
    "@athyper/server-contract-auth",
    "@athyper/server-contract-audit",
    "@athyper/server-contract-policy",
    "@athyper/server-platform-policy",
    "@athyper/server-plane-studio-meta-entity-authoring",
    "./machine-policy.js",
    "./enrollment-contract.js",
    "./compiler-build.js",
    "../identity/platform-authority.js",
    "@athyper/server-contract-publication",
    "./compilation-recovery-source.js",
  ]);
  for (const statement of source.statements)
    if (ts.isImportDeclaration(statement))
      expect(
        allowed.has((statement.moduleSpecifier as ts.StringLiteral).text),
      ).toBe(true);
});

function successor(): DevEntitySuccessorPolicy {
  return {
    schema: "athyper.dev-entity-successor-policy/1",
    environment: "local",
    instance: "dev",
    authorityTenantId: id(6),
    policyId: "example.successor",
    revision: 1,
    entityId: id(1),
    changeSetId: id(2),
    contractHash: "b".repeat(64),
    descriptorHash: "c".repeat(64),
    authorPrincipalId: id(3),
    publisherPrincipalId: id(4),
    predecessor: {
      authoringReleaseId: id(11),
      authoringReleaseNo: 1,
      authoringReleaseHash: "a".repeat(64),
      publicationReleaseId: id(12),
      publicationReleaseNo: 1,
      publicationReleaseHash: "d".repeat(64),
      revisionId: id(13),
      contractHash: "e".repeat(64),
    },
    compiler: {
      name: "example.compiler",
      version: "1.1.0",
      buildHash: "f".repeat(64),
    },
    targets: [
      {
        plane: "studio",
        environment: "local",
        instance: "dev",
        publicationKey: "metadata.entity.example",
        appliedReleaseId: id(14),
        sourceReleaseId: id(12),
        sourceReleaseNo: 1,
        artifactHash: "f".repeat(64),
        headVersion: 1,
      },
    ],
  };
}
it("rechecks persisted successor pins on proposal and independent activation, retaining MFA and maker/checker", async () => {
  const f = fixture(),
    check = vi
      .spyOn(authoring, "assertEntitySuccessorSource")
      .mockResolvedValue();
  const build = vi
    .spyOn(compilerBuild, "assertPublicationCompilerIdentity")
    .mockImplementation(() => {});
  try {
    const service = createPublicationPolicyEnrollment(f.options),
      input = successor();
    const pending = await service.propose(f.context, input);
    expect(check).toHaveBeenCalledWith(
      expect.anything(),
      input,
      f.context.tenantId,
    );
    await expect(
      service.activate(f.context, pending.id, pending.hash),
    ).rejects.toThrow("MAKER_CHECKER");
    check.mockRejectedValueOnce(Error("ENTITY_SUCCESSOR_SOURCE_PIN_CHANGED"));
    await expect(
      service.activate(
        { ...f.context, principalId: id(8) },
        pending.id,
        pending.hash,
      ),
    ).rejects.toThrow("SOURCE_PIN_CHANGED");
    expect(
      f.query.mock.calls.filter(([q]) => q.includes("SET status='active'")),
    ).toHaveLength(0);
    const active = await service.activate(
      { ...f.context, principalId: id(8) },
      pending.id,
      pending.hash,
    );
    expect(active.status).toBe("active");
    expect(check).toHaveBeenCalledTimes(4);
    expect(f.signer.sign).not.toHaveBeenCalled();
  } finally {
    check.mockRestore();
    build.mockRestore();
    await f.database.destroy();
  }
});
it("does not expand first-release authority by accepting successor fields or unknown policy versions", () => {
  expect(parseEnrollablePublicationPolicy(policy)).toEqual(policy);
  expect(() =>
    parseEnrollablePublicationPolicy({
      ...policy,
      predecessor: successor().predecessor,
    }),
  ).toThrow("SCHEMA_INVALID");
  expect(() =>
    parseEnrollablePublicationPolicy({
      ...successor(),
      schema: "athyper.dev-entity-successor-policy/2",
    }),
  ).toThrow();
});
it("recovery independently approves a published source, rechecking empty artifacts and rejecting maker activation", async () => {
  const f = fixture();
  const check = vi
    .spyOn(recoverySource, "assertCompilationRecoverySource")
    .mockResolvedValue({} as never);
  const input = {
    ...successor(),
    schema: "athyper.dev-compilation-recovery-policy/1",
    failedReleaseId: id(20),
    failedReleaseHash: "e".repeat(64),
    failedJobId: id(21),
    originalCompilerHash: "a".repeat(64),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  try {
    const service = createPublicationPolicyEnrollment(f.options);
    const pending = await service.propose(f.context, input);
    expect(check).toHaveBeenCalledWith(expect.anything(), input, true);
    expect(
      f.query.mock.calls.some(([q]) =>
        q.includes("FROM metadata.entity_change_set"),
      ),
    ).toBe(false);
    await expect(
      service.activate(f.context, pending.id, pending.hash),
    ).rejects.toThrow("MAKER_CHECKER");
    check.mockRejectedValueOnce(
      Error("COMPILATION_RECOVERY_SOURCE_UNAVAILABLE"),
    );
    await expect(
      service.activate(
        { ...f.context, principalId: id(8) },
        pending.id,
        pending.hash,
      ),
    ).rejects.toThrow("SOURCE_UNAVAILABLE");
    expect(
      (
        await service.activate(
          { ...f.context, principalId: id(8) },
          pending.id,
          pending.hash,
        )
      ).status,
    ).toBe("active");
    expect(f.signer.sign).not.toHaveBeenCalled();
  } finally {
    check.mockRestore();
    await f.database.destroy();
  }
});
it.each([
  { tenantId: id(99) },
  { realmKey: "athyper" },
  { planeKey: "neon" },
  { assurance: "baseline" },
])(
  "denies non-platform or non-MFA context before authorization and storage: %j",
  async (override) => {
    const f = fixture();
    try {
      await expect(
        createPublicationPolicyEnrollment(f.options).propose(
          { ...f.context, ...override } as VerifiedRequestContext,
          policy,
        ),
      ).rejects.toThrow();
      expect(f.authorize).not.toHaveBeenCalled();
      expect(f.query).not.toHaveBeenCalled();
    } finally {
      await f.database.destroy();
    }
  },
);

it("requires independent activation and rechecks human source admission for coordinated policies", async () => {
  const admission = await import("../human-publication-admission.js");
  const f = fixture(),
    check = vi
      .spyOn(admission, "assertHumanReviewedEnrollmentSource")
      .mockResolvedValue();
  const p = {
    schema: "athyper.dev-human-reviewed-publication/1",
    environment: "local",
    instance: "dev",
    authorityTenantId: id(6),
    policyId: "test.coordinated",
    revision: 1,
    authorPrincipalId: id(3),
    publisherPrincipalId: id(4),
    compiler: { name: "test", version: "1", buildHash: "a".repeat(64) },
    predecessors: [],
    plan: {
      schema: "athyper.human-reviewed-publication-plan/1",
      publisherId: id(4),
      members: [
        {
          changeSetId: id(2),
          entityId: id(1),
          revision: 3,
          contractHash: "b".repeat(64),
          descriptorHash: "c".repeat(64),
          sourceReleaseId: null,
          authorId: id(7),
          reviewerId: id(8),
          targets: [
            {
              plane: "neon",
              contractHash: "b".repeat(64),
              descriptorHash: "c".repeat(64),
            },
          ],
        },
      ],
    },
  };
  try {
    const service = createPublicationPolicyEnrollment(f.options),
      pending = await service.propose(f.context, p);
    await expect(
      service.activate(f.context, pending.id, pending.hash),
    ).rejects.toThrow("MAKER_CHECKER");
    check.mockRejectedValueOnce(
      Error("HUMAN_PUBLICATION_POLICY_SOURCE_HEAD_CHANGED"),
    );
    await expect(
      service.activate(
        { ...f.context, principalId: id(8) },
        pending.id,
        pending.hash,
      ),
    ).rejects.toThrow("SOURCE_HEAD_CHANGED");
    expect(
      f.query.mock.calls.filter(([q]) => q.includes("SET status='active'")),
    ).toHaveLength(0);
    expect(
      (
        await service.activate(
          { ...f.context, principalId: id(8) },
          pending.id,
          pending.hash,
        )
      ).status,
    ).toBe("active");
    expect(check).toHaveBeenCalledTimes(4);
    expect(f.signer.sign).not.toHaveBeenCalled();
  } finally {
    check.mockRestore();
    await f.database.destroy();
  }
});

it("enrolls standing authority through the same maker/checker service without draft enrollment", async () => {
  const f = fixture();
  const local = {
    schema: "athyper.local-publication-policy/1",
    policyId: "local.test",
    revision: 1,
    authorPrincipalId: id(3),
    publisherPrincipalId: id(4),
    authority: {
      host: {
        environment: "local",
        instance: "dev",
        domainSuffix: "dev.athyper.test",
      },
      scope: { kind: "product" },
      validFrom: "2026-01-01T00:00:00Z",
      expiresAt: "2099-01-01T00:00:00Z",
      developerPrincipalIds: [id(7)],
      actions: ["publish", "retry", "recover", "rollback"],
      destinations: [{ plane: "studio", instance: "dev" }],
    },
  };
  try {
    const service = createPublicationPolicyEnrollment(f.options);
    const pending = await service.propose(f.context, local);
    await expect(
      service.activate(f.context, pending.id, pending.hash),
    ).rejects.toThrow();
    const active = await service.activate(
      { ...f.context, principalId: id(8) },
      pending.id,
      pending.hash,
    );
    expect(active.status).toBe("active");
    const resolved = await f.database.transaction().execute((tx) =>
      resolveLocalPublicationAuthority({
        transaction: tx,
        context: f.context,
        pin: active,
      }),
    );
    expect(resolved.id).toBe(active.id);
    expect(resolved.enrollmentReceiptId).toBe(active.id);
    expect(resolved.developerPrincipalIds).toEqual([id(7)]);
    f.revoke();
    await expect(
      f.database.transaction().execute((tx) =>
        resolveLocalPublicationAuthority({
          transaction: tx,
          context: f.context,
          pin: active,
        }),
      ),
    ).rejects.toThrow("REVOKED");
    expect(
      f.query.mock.calls.some(([q]) =>
        q.includes("FROM metadata.entity_change_set"),
      ),
    ).toBe(false);
    expect(f.record.mock.calls.map(([e]) => e.actor.principalId)).toEqual([
      id(7),
      id(8),
    ]);
  } finally {
    await f.database.destroy();
  }
});
