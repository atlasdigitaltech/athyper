import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  parsePublicationPolicyProposal,
  parseEnrollablePublicationPolicy,
} from "./enrollment-contract.js";
import {
  assertNativeRecoveryWindow,
  nativeRecoveryScope,
  parseNativeCompilationRecoveryPolicy,
  type NativeCompilationRecoveryPolicy,
} from "./native-compilation-recovery-policy.js";
import { validateNativeRecoverySource } from "./native-compilation-recovery-source.js";
function fixture() {
  const graph = {
      contractSchema: "athyper.meta-entity-contract/2.5",
      entity: { entityCode: "reference" },
    },
    publisher = randomUUID();
  const members = Array.from({ length: 2 }, () => ({
    changeSetId: randomUUID(),
    entityId: randomUUID(),
    revision: 3,
    sourceReleaseId: null,
    contractHash: sha256(graph),
    descriptorHash: "a".repeat(64),
    authorId: randomUUID(),
    reviewerId: randomUUID(),
    targets: [
      {
        plane: "studio",
        contractHash: sha256(graph),
        descriptorHash: "a".repeat(64),
      },
    ],
  }));
  const original = {
    schema: "athyper.dev-human-reviewed-publication/1",
    environment: "local",
    instance: "dev",
    authorityTenantId: randomUUID(),
    policyId: "test.original",
    revision: 1,
    authorPrincipalId: randomUUID(),
    publisherPrincipalId: publisher,
    compiler: {
      name: "athyper.compiled-entity-artifact",
      version: "1.1.0",
      buildHash: "b".repeat(64),
    },
    predecessors: [],
    plan: {
      schema: "athyper.human-reviewed-publication-plan/1",
      publisherId: publisher,
      members,
    },
  };
  const policy: NativeCompilationRecoveryPolicy = {
    schema: "athyper.dev-native-compilation-recovery/1",
    environment: "local",
    instance: "dev",
    policyId: "test.recovery",
    revision: 1,
    authorityTenantId: original.authorityTenantId,
    authorPrincipalId: original.authorPrincipalId,
    publisherPrincipalId: publisher,
    compiler: { ...original.compiler, buildHash: "c".repeat(64) },
    originalPolicy: {
      id: randomUUID(),
      version: 1,
      hash: "d".repeat(64),
      compilerHash: original.compiler.buildHash,
      coordinationHash: sha256(original.plan),
    },
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    releases: members.map((m) => ({
      releaseId: randomUUID(),
      releaseHash: "e".repeat(64),
      changeSetId: m.changeSetId,
      failedJobId: randomUUID(),
    })),
  };
  const source = {
    policy: original,
    version: 1,
    releases: policy.releases.map((r) => ({ ...r, graph, empty: true })),
  };
  return { policy, source };
}
it("enrolls native first releases without inventing predecessors or accepting legacy execution", () => {
  const { policy, source } = fixture();
  expect(parsePublicationPolicyProposal(policy)).toEqual(policy);
  expect(() => parseEnrollablePublicationPolicy(policy)).toThrow();
  expect(validateNativeRecoverySource(policy, source, true)).toEqual(
    source.policy,
  );
});
it("rejects scope expansion, unbounded authority, duplicate releases and unchanged compiler", () => {
  const { policy } = fixture();
  for (const p of [
    { ...policy, bypass: true },
    { ...policy, environment: "production" },
    { ...policy, releases: [policy.releases[0], policy.releases[0]] },
    {
      ...policy,
      compiler: {
        ...policy.compiler,
        buildHash: policy.originalPolicy.compilerHash,
      },
    },
    { ...policy, originalPolicy: { ...policy.originalPolicy, version: 0 } },
  ])
    expect(() => parseNativeCompilationRecoveryPolicy(p)).toThrow();
  for (const hours of [-1, 25])
    expect(() =>
      assertNativeRecoveryWindow({
        ...policy,
        expiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
      }),
    ).toThrow();
});
it("rejects missing siblings and altered failed jobs, source, compiler, coordination or original version", () => {
  const { policy, source } = fixture();
  const variants = [
    { ...source, releases: source.releases.slice(1) },
    { ...source, version: 2 },
    {
      ...source,
      policy: {
        ...source.policy,
        compiler: { ...source.policy.compiler, buildHash: "f".repeat(64) },
      },
    },
    ...["releaseHash", "failedJobId", "changeSetId", "graph"].map((key) => ({
      ...source,
      releases: [
        {
          ...source.releases[0],
          [key]: key === "graph" ? { contractSchema: "2.3" } : randomUUID(),
        },
        source.releases[1],
      ],
    })),
  ];
  for (const changed of variants)
    expect(() =>
      validateNativeRecoverySource(policy, changed as typeof source, true),
    ).toThrow();
  expect(() =>
    validateNativeRecoverySource(
      {
        ...policy,
        originalPolicy: {
          ...policy.originalPolicy,
          coordinationHash: "f".repeat(64),
        },
      },
      source,
      true,
    ),
  ).toThrow();
});
it("requires empty artifacts at enrollment but supports replay after one member compiles", () => {
  const { policy, source } = fixture();
  source.releases[0]!.empty = false;
  expect(() => validateNativeRecoverySource(policy, source, true)).toThrow();
  expect(validateNativeRecoverySource(policy, source, false)).toEqual(
    source.policy,
  );
});

it("replacement changes compiler enrollment only, never original authority or release/job scope", () => {
  const { policy } = fixture();
  expect(
    nativeRecoveryScope({
      ...policy,
      policyId: "test.corrected",
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
      compiler: { ...policy.compiler, buildHash: "f".repeat(64) },
    }),
  ).toEqual(nativeRecoveryScope(policy));
  for (const changed of [
    { ...policy, authorityTenantId: randomUUID() },
    {
      ...policy,
      originalPolicy: { ...policy.originalPolicy, hash: "f".repeat(64) },
    },
    { ...policy, releases: policy.releases.slice(1) },
    {
      ...policy,
      releases: policy.releases.map((r) => ({
        ...r,
        failedJobId: randomUUID(),
      })),
    },
  ])
    expect(nativeRecoveryScope(changed)).not.toEqual(
      nativeRecoveryScope(policy),
    );
});
