import { createHash } from "node:crypto";
import type { PublicationPlane } from "@athyper/server-contract-publication";
import type { HumanReviewedExecutionPolicy } from "./human-publication-policy.js";

export interface DeploymentRecoveryPolicy {
  schema: "athyper.dev-coordinated-deployment-recovery/1";
  policyId: string; revision: number; environment: "local"; instance: "dev";
  authorityTenantId: string; authorPrincipalId: string; publisherPrincipalId: string;
  compiler: HumanReviewedExecutionPolicy["compiler"];
  originalPolicy: { id: string; version: number; hash: string; compilerHash: string; coordinationHash: string };
  expiresAt: string;
  deliveries: readonly { deploymentId: string; artifactId: string; artifactHash: string; releaseId: string; plane: PublicationPlane; attempt: number }[];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
export function requireRecovery(value: unknown, code: string): asserts value {
  if (!value) {
    const reason = `DEPLOYMENT_RECOVERY_${code}`;
    throw Object.assign(Error(reason), { code: reason, retryable: false });
  }
}
function exact(value: unknown, keys: string): asserts value is Record<string, unknown> {
  requireRecovery(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join() === keys.split(",").sort().join(), "SCHEMA_INVALID");
}
export function parseDeploymentRecoveryPolicy(input: unknown): DeploymentRecoveryPolicy {
  exact(input, "schema,policyId,revision,environment,instance,authorityTenantId,authorPrincipalId,publisherPrincipalId,compiler,originalPolicy,expiresAt,deliveries");
  const p = structuredClone(input) as unknown as DeploymentRecoveryPolicy;
  requireRecovery(p.schema === "athyper.dev-coordinated-deployment-recovery/1" && p.environment === "local" && p.instance === "dev"
    && typeof p.policyId === "string" && /^[a-z][a-z0-9_.-]{1,126}$/.test(p.policyId)
    && Number.isSafeInteger(p.revision) && p.revision > 0, "COORDINATES_INVALID");
  requireRecovery([p.authorityTenantId, p.authorPrincipalId, p.publisherPrincipalId].every(v => typeof v === "string" && uuid.test(v))
    && p.authorPrincipalId !== p.publisherPrincipalId, "ACTOR_INVALID");
  exact(p.compiler, "name,version,buildHash");
  requireRecovery(p.compiler.name === "athyper.compiled-entity-artifact" && p.compiler.version === "1.1.0" && hash.test(p.compiler.buildHash), "COMPILER_INVALID");
  exact(p.originalPolicy, "id,version,hash,compilerHash,coordinationHash");
  requireRecovery(uuid.test(p.originalPolicy.id) && Number.isSafeInteger(p.originalPolicy.version) && p.originalPolicy.version > 0
    && [p.originalPolicy.hash, p.originalPolicy.compilerHash, p.originalPolicy.coordinationHash].every(v => hash.test(v)), "ORIGINAL_PIN_INVALID");
  requireRecovery(typeof p.expiresAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.expiresAt)
    && Number.isFinite(Date.parse(p.expiresAt)), "EXPIRY_INVALID");
  requireRecovery(Array.isArray(p.deliveries) && p.deliveries.length > 0 && p.deliveries.length <= 128, "DELIVERIES_INVALID");
  for (const d of p.deliveries) {
    exact(d, "deploymentId,artifactId,artifactHash,releaseId,plane,attempt");
    requireRecovery([d.deploymentId, d.artifactId, d.releaseId].every(v => typeof v === "string" && uuid.test(v))
      && typeof d.artifactHash === "string" && hash.test(d.artifactHash)
      && typeof d.plane === "string" && ["neon", "mesh", "studio"].includes(d.plane)
      && typeof d.attempt === "number" && Number.isSafeInteger(d.attempt) && d.attempt > 0, "DELIVERY_PIN_INVALID");
  }
  for (const values of [p.deliveries.map(d => d.deploymentId), p.deliveries.map(d => d.artifactId), p.deliveries.map(d => `${d.releaseId}:${d.plane}`)])
    requireRecovery(new Set(values).size === values.length, "DELIVERY_DUPLICATE");
  return p;
}
export function assertDeploymentRecoveryWindow(policy: DeploymentRecoveryPolicy, now = Date.now()) {
  const remaining = Date.parse(policy.expiresAt) - now;
  requireRecovery(remaining > 0 && remaining <= 7 * 86400000, "WINDOW_CLOSED");
}
export function deploymentRecoveryCommand(policyHash: string, deploymentId: string): string {
  const h = createHash("sha256").update(`publication:coordinated-recovery:${policyHash}:${deploymentId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
