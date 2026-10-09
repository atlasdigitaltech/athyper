function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  requireNativeRecovery(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join() === [...keys].sort().join(),
    "SCHEMA_INVALID",
  );
  return value as Record<string, unknown>;
}
function requireUuid(value: unknown) {
  requireNativeRecovery(
    typeof value === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value,
      ),
    "UUID_INVALID",
  );
}
import type { HumanReviewedExecutionPolicy } from "./human-publication-policy.js";

/** Recovery changes execution authority only. Original approvals and release bytes remain immutable. */
export interface NativeCompilationRecoveryPolicy {
  schema: "athyper.dev-native-compilation-recovery/1";
  policyId: string;
  revision: number;
  environment: "local";
  instance: "dev";
  authorityTenantId: string;
  authorPrincipalId: string;
  publisherPrincipalId: string;
  compiler: HumanReviewedExecutionPolicy["compiler"];
  originalPolicy: {
    id: string;
    version: number;
    hash: string;
    compilerHash: string;
    coordinationHash: string;
  };
  expiresAt: string;
  releases: readonly {
    releaseId: string;
    releaseHash: string;
    changeSetId: string;
    failedJobId: string;
  }[];
}
export function requireNativeRecovery(
  value: unknown,
  code: string,
): asserts value {
  if (!value)
    throw Object.assign(Error(`NATIVE_COMPILATION_RECOVERY_${code}`), {
      retryable: false,
    });
}
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function parseNativeCompilationRecoveryPolicy(
  value: unknown,
): NativeCompilationRecoveryPolicy {
  const p = exactObject(value, [
    "schema",
    "policyId",
    "revision",
    "environment",
    "instance",
    "authorityTenantId",
    "authorPrincipalId",
    "publisherPrincipalId",
    "compiler",
    "originalPolicy",
    "expiresAt",
    "releases",
  ]);
  requireNativeRecovery(
    p.schema === "athyper.dev-native-compilation-recovery/1" &&
      p.environment === "local" &&
      p.instance === "dev",
    "DEV_ONLY",
  );
  requireNativeRecovery(
    typeof p.policyId === "string" &&
      /^[a-z][a-z0-9_.-]{1,126}$/.test(p.policyId) &&
      Number.isSafeInteger(p.revision) &&
      Number(p.revision) > 0,
    "COORDINATES_INVALID",
  );
  for (const k of [
    "authorityTenantId",
    "authorPrincipalId",
    "publisherPrincipalId",
  ])
    requireUuid(p[k]);
  requireNativeRecovery(
    p.authorPrincipalId !== p.publisherPrincipalId,
    "ACTOR_INVALID",
  );
  const c = exactObject(p.compiler, ["name", "version", "buildHash"]);
  requireNativeRecovery(
    c.name === "athyper.compiled-entity-artifact" &&
      c.version === "1.1.0" &&
      hash(c.buildHash),
    "COMPILER_INVALID",
  );
  const o = exactObject(p.originalPolicy, [
    "id",
    "version",
    "hash",
    "compilerHash",
    "coordinationHash",
  ]);
  requireUuid(o.id);
  requireNativeRecovery(
    Number.isSafeInteger(o.version) &&
      Number(o.version) > 0 &&
      [o.hash, o.compilerHash, o.coordinationHash].every(hash) &&
      o.compilerHash !== c.buildHash,
    "ORIGINAL_PIN_INVALID",
  );
  requireNativeRecovery(
    typeof p.expiresAt === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.expiresAt) &&
      Number.isFinite(Date.parse(p.expiresAt)),
    "EXPIRY_INVALID",
  );
  requireNativeRecovery(
    Array.isArray(p.releases) &&
      p.releases.length > 0 &&
      p.releases.length <= 128,
    "RELEASES_INVALID",
  );
  for (const r of p.releases) {
    const pin = exactObject(r, [
      "releaseId",
      "releaseHash",
      "changeSetId",
      "failedJobId",
    ]);
    for (const k of ["releaseId", "changeSetId", "failedJobId"])
      requireUuid(pin[k]);
    requireNativeRecovery(hash(pin.releaseHash), "RELEASE_PIN_INVALID");
  }
  for (const k of ["releaseId", "changeSetId", "failedJobId"])
    requireNativeRecovery(
      new Set(p.releases.map((r) => (r as Record<string, unknown>)[k])).size ===
        p.releases.length,
      "DUPLICATE",
    );
  return structuredClone(p) as unknown as NativeCompilationRecoveryPolicy;
}
export function assertNativeRecoveryWindow(
  policy: NativeCompilationRecoveryPolicy,
  now = Date.now(),
) {
  const remaining = Date.parse(policy.expiresAt) - now;
  requireNativeRecovery(
    remaining > 0 && remaining <= 86400000,
    "WINDOW_CLOSED",
  );
}

/** Exact retained authority for an independently reviewed compiler-only correction. */
export function nativeRecoveryScope(policy: NativeCompilationRecoveryPolicy) {
  return {
    schema: policy.schema,
    environment: policy.environment,
    instance: policy.instance,
    authorityTenantId: policy.authorityTenantId,
    authorPrincipalId: policy.authorPrincipalId,
    publisherPrincipalId: policy.publisherPrincipalId,
    originalPolicy: policy.originalPolicy,
    releases: [...policy.releases].sort((a, b) =>
      a.releaseId.localeCompare(b.releaseId),
    ),
    compiler: { name: policy.compiler.name, version: policy.compiler.version },
  };
}
