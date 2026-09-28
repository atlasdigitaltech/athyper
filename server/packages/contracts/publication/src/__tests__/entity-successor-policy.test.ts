import { expect, it } from "vitest";
import { assertEntitySuccessorTargetHead, parseDevEntitySuccessorPolicy, type DevEntitySuccessorPolicy } from "../policy/entity-successor-policy.js";
import { parseCompilationRecoveryPolicy, assertCompilationRecoveryWindow } from "../policy/compilation-recovery-policy.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function policy(): DevEntitySuccessorPolicy {
  return { schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: id(1), policyId: "example.successor", revision: 1,
    entityId: id(2), changeSetId: id(3), contractHash: "a".repeat(64), descriptorHash: "b".repeat(64), authorPrincipalId: id(4), publisherPrincipalId: id(5),
    predecessor: { authoringReleaseId: id(6), authoringReleaseNo: 1, authoringReleaseHash: "c".repeat(64), publicationReleaseId: id(7), publicationReleaseNo: 1, publicationReleaseHash: "d".repeat(64), revisionId: id(8), contractHash: "e".repeat(64) },
    compiler: { name: "example.compiler", version: "1.1.0", buildHash: "f".repeat(64) },
    targets: ["studio", "neon", "mesh"].map((plane, i) => ({ plane: plane as "studio" | "neon" | "mesh", environment: "local", instance: "dev", publicationKey: "metadata.entity.example", appliedReleaseId: id(10 + i), sourceReleaseId: id(7), sourceReleaseNo: 1, artifactHash: "f".repeat(64), headVersion: 1 })) };
}
it("keeps authoring, publication and target identities distinct and returns a detached immutable contract", () => {
  const input = policy(), parsed = parseDevEntitySuccessorPolicy(input);
  expect(parsed.predecessor.authoringReleaseId).not.toBe(parsed.predecessor.publicationReleaseId);
  expect(Object.isFrozen(parsed.targets[0])).toBe(true);
  Object.assign(input.predecessor, { publicationReleaseHash: "0".repeat(64) });
  expect(parsed.predecessor.publicationReleaseHash).toBe("d".repeat(64));
});
it.each(["qa", "staging", "production", "onboarding", "missing", "extra", "actor", "duplicate", "head", "compiler", "wildcard"])("rejects %s enrollment shape", failure => {
  const input = policy();
  if (["qa", "staging", "production"].includes(failure)) Object.assign(input, { environment: failure });
  if (failure === "onboarding") Object.assign(input, { schema: "athyper.dev-reference-onboarding/1" });
  if (failure === "missing") Reflect.deleteProperty(input, "predecessor");
  if (failure === "extra") Object.assign(input, { approval: true });
  if (failure === "actor") Object.assign(input, { publisherPrincipalId: input.authorPrincipalId });
  if (failure === "duplicate") Object.assign(input, { targets: [input.targets[0], input.targets[0]] });
  if (failure === "head") Object.assign(input.targets[0]!, { sourceReleaseId: id(99) });
  if (failure === "compiler") Object.assign(input.compiler, { buildHash: "" });
  if (failure === "wildcard") Object.assign(input.targets[0]!, { instance: "*" });
  expect(() => parseDevEntitySuccessorPolicy(input)).toThrow();
});
it.each(["appliedReleaseId", "sourceReleaseId", "sourceReleaseNo", "artifactHash", "headVersion", "publicationKey", "plane"] as const)("rejects moved target %s", key => {
  const expected = policy().targets[0]!, actual = { ...expected };
  Object.assign(actual, { [key]: key.endsWith("Id") ? id(99) : key === "artifactHash" ? "0".repeat(64) : key === "plane" ? "mesh" : key === "publicationKey" ? "other.key" : 2 });
  expect(() => assertEntitySuccessorTargetHead(expected, actual)).toThrow("TARGET_HEAD_CHANGED");
});
it("requires an existing exact predecessor head", () => {
  const pin = policy().targets[0]!;
  expect(() => assertEntitySuccessorTargetHead(pin, null)).toThrow("HEAD_MISSING");
  expect(() => assertEntitySuccessorTargetHead(pin, { ...pin })).not.toThrow();
});
const recovery = () => ({ ...policy(), schema: "athyper.dev-compilation-recovery-policy/1", failedReleaseId: id(30), failedReleaseHash: "a".repeat(64),
  failedJobId: id(31), originalCompilerHash: "0".repeat(64), expiresAt: new Date(Date.now() + 3600000).toISOString() });
it("recovery is a separate bounded policy, never extra fields on a successor", () => {
  const input = recovery(), parsed = parseCompilationRecoveryPolicy(input);
  expect(() => assertCompilationRecoveryWindow(parsed, Date.now(), true)).not.toThrow();
  expect(() => parseDevEntitySuccessorPolicy({ ...input, schema: "athyper.dev-entity-successor-policy/1" })).toThrow();
  expect(() => parseCompilationRecoveryPolicy({ ...input, bypass: true })).toThrow();
  expect(() => parseCompilationRecoveryPolicy({ ...input, originalCompilerHash: input.compiler.buildHash })).toThrow();
  expect(() => parseCompilationRecoveryPolicy({ ...input, failedJobId: "missing" })).toThrow();
  expect(() => parseCompilationRecoveryPolicy({ ...input, expiresAt: "tomorrow" })).toThrow();
});
it("recovery expiry and maximum enrollment duration fail closed", () => {
  const input = recovery();
  const now = Date.now();
  expect(() => assertCompilationRecoveryWindow(parseCompilationRecoveryPolicy({ ...input, expiresAt: new Date(now).toISOString() }), now)).toThrow();
  expect(() => assertCompilationRecoveryWindow(parseCompilationRecoveryPolicy({ ...input, expiresAt: new Date(now + 86400001).toISOString() }), now, true)).toThrow();
});
