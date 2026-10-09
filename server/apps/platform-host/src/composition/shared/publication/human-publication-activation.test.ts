import * as nativeRecoveryAuthority from "./native-compilation-recovery-authority.js";
import { nativeReleaseFixture } from "../../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { afterEach, expect, it, vi } from "vitest";
import {
  KyselyLocalProjectionRepository,
  KyselyPublicationAuthorityRepository,
} from "@athyper/server-service-publication";
import {
  compileNativePublication,
  nativePublicationTargets,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { deployHumanPublicationGroup } from "./human-publication-activation.js";
import { publicationCompilerIdentity } from "./compiler-build.js";
import * as recoveryAuthority from "./deployment-recovery-authority.js";
import { deploymentRecoveryCommand } from "./deployment-recovery-policy.js";
import * as relationships from "./relationship-qualification.js";

afterEach(() => vi.restoreAllMocks());
function fixture(recovery = false, native = false, envelope = false) {
  const publisher = randomUUID(),
    tenant = randomUUID();
  const configuration = {
    environment: "local" as const,
    instance: "dev",
    domainSuffix: "dev.athyper.test",
    tenantId: tenant,
    realmKey: "athyper",
    author: {
      principalId: randomUUID(),
      code: "dev.metadata.author",
      authEpoch: 0,
      credentialSha256: "a".repeat(64),
    },
    publisher: {
      principalId: publisher,
      code: "dev.metadata.publisher",
      authEpoch: 0,
      credentialSha256: "b".repeat(64),
    },
  };
  const sources = ["dictionary_alpha", "dictionary_beta"].map((code) => {
    const fixture = nativeReleaseFixture();
    const ids = new Map<string, string>();
    const replaced = JSON.stringify({
      graph: fixture.graph,
      compiler: fixture.c,
      controls: fixture.controls,
    }).replace(
      /[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/g,
      (id) => {
        if (!ids.has(id)) ids.set(id, randomUUID());
        return ids.get(id)!;
      },
    );
    const source = JSON.parse(
      replaced.replaceAll(
        JSON.stringify(fixture.graph.entity.entityCode),
        JSON.stringify(code),
      ),
    ) as {
      graph: typeof fixture.graph;
      compiler: typeof fixture.c;
      controls: typeof fixture.controls;
    };
    source.graph.entity.entityCode = code;
    source.graph.entity.ownershipModel = "system";
    source.graph.entity.entityClass = "reference";
    source.compiler.graphHash = sha256(source.graph);
    return {
      ...source,
      ...(envelope ? { targetCompilers: [source.compiler] } : {}),
      changeSetId: source.graph.ownedLabels!.changeSetId,
    };
  });
  const members = sources.map((s) => {
    const c = compileNativePublication(s);
    return {
      changeSetId: s.changeSetId,
      entityId: s.graph.authoringSource.entityId,
      revision: 3,
      contractHash: c.contractHash,
      descriptorHash: c.descriptorHash,
      sourceReleaseId: null,
      authorId: randomUUID(),
      reviewerId: randomUUID(),
      targets: nativePublicationTargets(s.graph, c).map((t) => ({
        plane: t.targetPlane,
        contractHash: t.artifact.contractHash,
        descriptorHash: t.artifact.descriptorHash,
      })),
    };
  });
  const policy = {
    schema: "athyper.dev-human-reviewed-publication/1",
    environment: "local",
    instance: "dev",
    authorityTenantId: tenant,
    policyId: "test.group",
    revision: 1,
    authorPrincipalId: configuration.author.principalId,
    publisherPrincipalId: publisher,
    compiler: publicationCompilerIdentity(),
    predecessors: [],
    plan: {
      schema: "athyper.human-reviewed-publication-plan/1",
      publisherId: publisher,
      members,
    },
  };
  const context = { policy, coordinationHash: sha256(policy.plan), sources };
  const deliveries = sources.map((s, i) => ({
    deploymentId: randomUUID(),
    deploymentStatus: "dispatched",
    targetPlane: "studio",
    targetEnvironment: "local",
    targetInstance: "dev",
    publicationKey: `metadata.entity.${s.graph.entity.entityCode}`,
    sourceReleaseId: randomUUID(),
    sourceReleaseNo: 1,
    artifactHash: String(i + 1).repeat(64),
    artifactUri: "test",
    signature: "test",
    signingKeyId: "test",
    signatureAlgorithm: "Ed25519",
  }));
  const recoveryPin = { id: randomUUID(), hash: "e".repeat(64), version: 1 };
  const recoveryDeliveries = deliveries.map((d) => ({
    deploymentId: randomUUID(),
    artifactId: randomUUID(),
    artifactHash: d.artifactHash,
    releaseId: d.sourceReleaseId,
    plane: d.targetPlane,
    attempt: 1,
  }));
  const commands = deliveries.map((d, i) =>
    deploymentRecoveryCommand(
      recoveryPin.hash,
      recoveryDeliveries[i]!.deploymentId,
    ),
  );
  if (recovery)
    policy.compiler = { ...policy.compiler, buildHash: "0".repeat(64) };
  const recoveryCheck = recovery
    ? vi.spyOn(recoveryAuthority, "findDeploymentRecovery").mockResolvedValue({
        pin: recoveryPin,
        policy: { deliveries: recoveryDeliveries },
        original: policy,
      } as any)
    : undefined;
  const nativeReleases = deliveries.map((d) => ({
    releaseId: d.sourceReleaseId,
  }));
  const nativeCheck = native
    ? vi
        .spyOn(nativeRecoveryAuthority, "findNativeCompilationRecovery")
        .mockResolvedValue({
          pin: recoveryPin,
          policy: { releases: nativeReleases },
          original: policy,
        } as never)
    : undefined;
  let ready = true,
    revoked = false,
    legacy = false;
  const query = vi.fn(async (text: string, values: unknown[] = []) => ({
    rows: text.includes("athyper.dev-native-compilation-recovery/1")
      ? []
      : text.includes("SELECT r.id AS release_id")
        ? legacy
          ? []
          : [
              {
                release_id: deliveries[0]!.sourceReleaseId,
                policy_id: recoveryPin.id,
                command_id: commands[0],
              },
            ]
        : text.includes("FROM master.principal")
          ? revoked
            ? []
            : [{ id: publisher }]
          : text.includes("fn_human_execution_context")
            ? [{ value: context }]
            : text.includes("SELECT command_id")
              ? [
                  {
                    command_id:
                      commands[
                        deliveries.findIndex((d) =>
                          values.includes(d.deploymentId),
                        )
                      ],
                  },
                ]
              : text.includes("SELECT d.id")
                ? ready
                  ? [
                      {
                        id: deliveries[
                          members.findIndex((m) =>
                            values.includes(m.changeSetId),
                          )
                        ]!.deploymentId,
                      },
                    ]
                  : []
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
  vi.spyOn(
    KyselyPublicationAuthorityRepository.prototype,
    "getDeployment",
  ).mockImplementation(
    async (id) => deliveries.find((d) => d.deploymentId === id) as any,
  );
  const heads: Record<string, any> = {};
  vi.spyOn(
    KyselyLocalProjectionRepository.prototype,
    "findActive",
  ).mockImplementation(async (key) => heads[key] ?? null);
  const stage = vi
    .spyOn(KyselyLocalProjectionRepository.prototype, "stage")
    .mockImplementation(
      async ({ deployment }) => ({ id: deployment.deploymentId }) as any,
    );
  vi.spyOn(
    KyselyLocalProjectionRepository.prototype,
    "verify",
  ).mockImplementation(
    async ({ appliedReleaseId }) =>
      ({ id: appliedReleaseId, status: "verified" }) as any,
  );
  const activate = vi
    .spyOn(KyselyLocalProjectionRepository.prototype, "activate")
    .mockImplementation(async ({ appliedReleaseId }) => {
      const d = deliveries.find((d) => d.deploymentId === appliedReleaseId)!;
      return (heads[d.publicationKey] = {
        id: appliedReleaseId,
        artifactHash: d.artifactHash,
        sourceReleaseId: d.sourceReleaseId,
        sourceReleaseNo: 1,
      });
    });
  vi.spyOn(
    KyselyPublicationAuthorityRepository.prototype,
    "transitionDeployment",
  ).mockResolvedValue(undefined as any);
  const acknowledge = vi
    .spyOn(KyselyPublicationAuthorityRepository.prototype, "acknowledge")
    .mockResolvedValue(undefined as any);
  const qualify = vi
    .spyOn(relationships, "qualifyCoordinatedProductRelationships")
    .mockResolvedValue();
  const guard = vi.fn(async () => {});
  const load = vi.fn(async (d: any) => {
    const i = deliveries.findIndex((x) => x.deploymentId === d.deploymentId),
      m = members[i]!;
    return {
      computedArtifactHash: d.artifactHash,
      verification: {
        signatureVerified: true,
        manifestValid: true,
        runtimeCompatible: true,
        targetPlane: "studio",
      },
      document: {
        envelope: {
          artifactKind: "compiled_entity_runtime",
          publicationKey: d.publicationKey,
          releaseId: d.sourceReleaseId,
          releaseNo: 1,
          targetPlane: "studio",
          payload: { entityCode: sources[i]!.graph.entity.entityCode },
        },
        manifest: {
          evidence: {
            coordinationHash: context.coordinationHash,
            sourceEntityId: m.entityId,
            sourceContractHash: m.contractHash,
            sourceDescriptorHash: m.targets.find((t) => t.plane === "studio")!
              .descriptorHash,
          },
        },
      },
    } as any;
  });
  const run = () =>
    deployHumanPublicationGroup({
      nativeSource: async (_tx, id) =>
        sources.find((s) => s.changeSetId === id)!,
      deploymentId: deliveries[0]!.deploymentId,
      authority: db,
      local: db,
      loader: { load },
      workload: configuration,
      activationGuard: guard,
    });
  return {
    db,
    run,
    stage,
    activate,
    recoveryCheck,
    nativeCheck,
    nativeReleases,
    recoveryDeliveries,
    commands,
    acknowledge,
    qualify,
    guard,
    query,
    load,
    heads,
    notReady: () => {
      ready = false;
    },
    revoke: () => {
      revoked = true;
    },
    legacy: () => {
      legacy = true;
    },
  };
}
it("waits for every dispatched peer without staging or acknowledging a partial group", async () => {
  const f = fixture();
  try {
    f.notReady();
    await expect(f.run()).rejects.toMatchObject({
      code: "PUBLICATION_GROUP_NOT_READY",
      retryable: true,
    });
    expect(f.stage).not.toHaveBeenCalled();
    expect(f.acknowledge).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([q]) => q.includes("d.attempt_no"))).toBe(
      true,
    );
  } finally {
    await f.db.destroy();
  }
});
it("activates through native guards and acknowledges every member; replay avoids duplicate activation", async () => {
  const f = fixture();
  try {
    await f.run();
    expect(f.activate).toHaveBeenCalledTimes(2);
    expect(f.guard).toHaveBeenCalledTimes(2);
    expect(f.qualify).toHaveBeenCalledOnce();
    expect(f.acknowledge).toHaveBeenCalledTimes(2);
    await f.run();
    expect(f.activate).toHaveBeenCalledTimes(2);
    expect(f.guard).toHaveBeenCalledTimes(4);
    f.revoke();
    await expect(f.run()).rejects.toThrow("WORKLOAD_REVOKED");
    expect(f.acknowledge).toHaveBeenCalledTimes(4);
  } finally {
    await f.db.destroy();
  }
});
it("rejects failed runtime qualification before activation and retains legacy routing", async () => {
  const f = fixture();
  try {
    f.guard.mockRejectedValueOnce(Error("runtime unavailable"));
    await expect(f.run()).rejects.toThrow("runtime unavailable");
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.acknowledge).not.toHaveBeenCalled();
    f.legacy();
    expect(await f.run()).toBeNull();
  } finally {
    await f.db.destroy();
  }
});

it("accepts a separately reviewed recovery without changing original signed source checks", async () => {
  const f = fixture(true);
  try {
    await f.run();
    expect(f.recoveryCheck).toHaveBeenCalled();
    expect(f.activate).toHaveBeenCalledTimes(2);
    expect(f.guard).toHaveBeenCalledTimes(2);
    expect(f.qualify).toHaveBeenCalledOnce();
    expect(f.acknowledge).toHaveBeenCalledTimes(2);
  } finally {
    await f.db.destroy();
  }
});
it.each(["authority", "requested-command", "sibling-command", "sibling-hash"])(
  "rejects recovery %s drift before activation",
  async (kind) => {
    const f = fixture(true);
    try {
      if (kind === "authority")
        f.recoveryCheck!.mockRejectedValue(
          Error("DEPLOYMENT_RECOVERY_EXACT_AUTHORITY_REQUIRED"),
        );
      if (kind === "requested-command") f.commands[0] = randomUUID();
      if (kind === "sibling-command") f.commands[1] = randomUUID();
      if (kind === "sibling-hash")
        f.recoveryDeliveries[1]!.artifactHash = "d".repeat(64);
      await expect(f.run()).rejects.toThrow(/RECOVERY_/);
      expect(f.activate).not.toHaveBeenCalled();
      expect(f.acknowledge).not.toHaveBeenCalled();
    } finally {
      await f.db.destroy();
    }
  },
);

it("activates a native pre-artifact recovery group under its current authority", async () => {
  const f = fixture(true, true);
  try {
    await f.run();
    expect(f.nativeCheck).toHaveBeenCalled();
    expect(f.recoveryCheck).not.toHaveBeenCalled();
    expect(f.activate).toHaveBeenCalled();
  } finally {
    await f.db.destroy();
  }
});
it.each(["revoked", "missing-sibling"])(
  "rejects native recovery %s before activation",
  async (kind) => {
    const f = fixture(true, true);
    try {
      if (kind === "revoked")
        f.nativeCheck!.mockRejectedValue(
          Error("NATIVE_COMPILATION_RECOVERY_REVOKED"),
        );
      else f.nativeReleases.pop();
      await expect(f.run()).rejects.toThrow(/RECOVERY_/);
      expect(f.activate).not.toHaveBeenCalled();
    } finally {
      await f.db.destroy();
    }
  },
);

it("activates the target-set envelope used by review instead of recompiling a single-target descriptor", async () => {
  const f = fixture(false, false, true);
  try {
    await f.run();
    expect(f.activate).toHaveBeenCalledTimes(2);
  } finally {
    await f.db.destroy();
  }
});
