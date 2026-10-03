import {parseDeploymentRecoveryCompilerPolicy,type DeploymentRecoveryCompilerPolicy} from "./deployment-recovery-compiler.js";
import { parseCompilationRecoveryPolicy, type CompilationRecoveryPolicy, parseDevEntitySuccessorPolicy, type DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { assertReferenceOnboardingPolicy, type ReferenceOnboardingPolicy } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseHumanReviewedExecutionPolicy, type HumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { parseDeploymentRecoveryPolicy, type DeploymentRecoveryPolicy } from "./deployment-recovery-policy.js";

export type EnrollablePublicationPolicy = ReferenceOnboardingPolicy | DevEntitySuccessorPolicy | CompilationRecoveryPolicy;

/** Batch human-review policies have separate execution semantics. Never send
 * them through the legacy workflow that submits and approves as workloads. */
export function parsePublicationPolicyProposal(value: unknown): EnrollablePublicationPolicy | HumanReviewedExecutionPolicy | DeploymentRecoveryPolicy | DeploymentRecoveryCompilerPolicy {
  if (value && typeof value === "object" && (value as {schema?: unknown}).schema === "athyper.dev-deployment-recovery-compiler/1")
    return parseDeploymentRecoveryCompilerPolicy(value);
  if (value && typeof value === "object" && (value as { schema?: unknown }).schema === "athyper.dev-coordinated-deployment-recovery/1")
    return parseDeploymentRecoveryPolicy(value);
  return value && typeof value === "object" && (value as { schema?: unknown }).schema === "athyper.dev-human-reviewed-publication/1"
    ? parseHumanReviewedExecutionPolicy(value) : parseEnrollablePublicationPolicy(value);
}

/** Explicit version dispatch. Never reinterpret an existing first-release
 * enrollment as successor authority, even when a caller adds predecessor pins. */
export function parseEnrollablePublicationPolicy(value: unknown): EnrollablePublicationPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("PUBLICATION_POLICY_SCHEMA_INVALID");
  if ((value as { schema?: unknown }).schema === "athyper.dev-compilation-recovery-policy/1") return parseCompilationRecoveryPolicy(value);
  if ((value as { schema?: unknown }).schema === "athyper.dev-entity-successor-policy/1")
    return parseDevEntitySuccessorPolicy(value);
  const policy = structuredClone(value) as ReferenceOnboardingPolicy;
  assertReferenceOnboardingPolicy(policy);
  const keys = ["schema", "policyId", "revision", "environment", "instance", "preset", "changeSetId", "entityId", "productHash", "contractHash", "descriptorHash", "targetPlanes", "authorPrincipalId", "publisherPrincipalId"];
  if (Object.keys(policy).length !== keys.length || Object.keys(policy).some(key => !keys.includes(key)))
    throw Error("PUBLICATION_POLICY_SCHEMA_INVALID");
  return policy;
}
