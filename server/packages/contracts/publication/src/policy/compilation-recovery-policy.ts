import { exactObject, requireUuid } from "./dev-publication-policy.js";
import { parseDevEntitySuccessorPolicy, type DevEntitySuccessorPolicy } from "./entity-successor-policy.js";

/** An independent, expiring authority to compile an unchanged published source
 * with a new compiler. Never a replacement for the original source approval. */
export interface CompilationRecoveryPolicy extends Omit<DevEntitySuccessorPolicy, "schema"> {
  readonly schema: "athyper.dev-compilation-recovery-policy/1";
  readonly failedReleaseId: string;
  readonly failedReleaseHash: string;
  readonly failedJobId: string;
  readonly originalCompilerHash: string;
  readonly expiresAt: string;
}
export function parseCompilationRecoveryPolicy(value: unknown): CompilationRecoveryPolicy {
  const p = exactObject(value, ["schema", "environment", "instance", "authorityTenantId", "policyId", "revision", "entityId", "changeSetId", "contractHash", "descriptorHash", "authorPrincipalId", "publisherPrincipalId", "predecessor", "compiler", "targets", "failedReleaseId", "failedReleaseHash", "failedJobId", "originalCompilerHash", "expiresAt"]);
  if (p.schema !== "athyper.dev-compilation-recovery-policy/1") throw Error("COMPILATION_RECOVERY_SCHEMA_INVALID");
  const { failedReleaseId, failedReleaseHash, failedJobId, originalCompilerHash, expiresAt, ...base } = p;
  const source = parseDevEntitySuccessorPolicy({ ...base, schema: "athyper.dev-entity-successor-policy/1" });
  if (![failedReleaseHash, originalCompilerHash].every(h => typeof h === "string" && /^[a-f0-9]{64}$/.test(h))
    || source.compiler.buildHash === originalCompilerHash || typeof expiresAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt)
    || !Number.isFinite(Date.parse(expiresAt))) throw Error("COMPILATION_RECOVERY_PIN_INVALID");
  return Object.freeze({ ...source, schema: "athyper.dev-compilation-recovery-policy/1", failedReleaseId: requireUuid(failedReleaseId),
    failedReleaseHash: failedReleaseHash as string, failedJobId: requireUuid(failedJobId), originalCompilerHash: originalCompilerHash as string, expiresAt });
}

export function assertCompilationRecoveryWindow(policy: CompilationRecoveryPolicy, now = Date.now(), enrollment = false): void {
  const remaining = Date.parse(policy.expiresAt) - now;
  if (remaining <= 0 || (enrollment && remaining > 24 * 60 * 60 * 1000)) throw Error("COMPILATION_RECOVERY_EXPIRED_OR_UNBOUNDED");
}
