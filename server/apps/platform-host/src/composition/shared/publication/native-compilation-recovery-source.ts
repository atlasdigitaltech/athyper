import { sql, type Kysely } from "kysely";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { assertPublicationCompilerIdentity } from "./compiler-build.js";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import {
  assertNativeRecoveryWindow,
  requireNativeRecovery as check,
  type NativeCompilationRecoveryPolicy,
} from "./native-compilation-recovery-policy.js";

export interface NativeRecoverySource {
  policy: unknown;
  version: number;
  releases: {
    releaseId: string;
    releaseHash: string;
    changeSetId: string;
    failedJobId: string;
    graph: unknown;
    empty: boolean;
  }[];
}
export function validateNativeRecoverySource(
  policy: NativeCompilationRecoveryPolicy,
  source: NativeRecoverySource,
  empty: boolean,
) {
  const original = parseHumanReviewedExecutionPolicy(source.policy);
  check(
    source.version === policy.originalPolicy.version &&
      original.authorityTenantId === policy.authorityTenantId &&
      original.authorPrincipalId === policy.authorPrincipalId &&
      original.publisherPrincipalId === policy.publisherPrincipalId &&
      original.environment === policy.environment &&
      original.instance === policy.instance &&
      original.compiler.buildHash === policy.originalPolicy.compilerHash &&
      sha256(original.plan) === policy.originalPolicy.coordinationHash,
    "ORIGINAL_CHANGED",
  );
  check(
    source.releases.length === policy.releases.length &&
      source.releases.length === original.plan.members.length,
    "GROUP_CHANGED",
  );
  for (const pin of policy.releases) {
    const rows = source.releases.filter((r) => r.releaseId === pin.releaseId);
    check(rows.length === 1, "RELEASE_CHANGED");
    const r = rows[0]!;
    check(
      r.releaseHash === pin.releaseHash &&
        r.changeSetId === pin.changeSetId &&
        r.failedJobId === pin.failedJobId &&
        (!empty || r.empty),
      "RELEASE_CHANGED",
    );
    const member = original.plan.members.find(
      (m) => m.changeSetId === pin.changeSetId,
    );
    check(
      member &&
        sha256(r.graph) === member.contractHash &&
        (r.graph as { contractSchema?: unknown })?.contractSchema ===
          "athyper.meta-entity-contract/2.5",
      "SOURCE_CHANGED",
    );
  }
  return original;
}
export async function assertNativeRecoverySource(
  database: Kysely<Record<string, never>>,
  policy: NativeCompilationRecoveryPolicy,
  empty: boolean,
) {
  check(database.isTransaction, "TRANSACTION_REQUIRED");
  assertNativeRecoveryWindow(policy);
  assertPublicationCompilerIdentity(policy.compiler);
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`native-compilation-recovery:${policy.authorityTenantId}:${policy.originalPolicy.id}`},0))`.execute(
    database,
  );
  const source = (
    await sql<{
      value: NativeRecoverySource;
    }>`SELECT publication.fn_native_compilation_recovery_source(${JSON.stringify(policy)}::jsonb,${empty}) value`.execute(
      database,
    )
  ).rows[0]?.value;
  check(source, "SOURCE_UNAVAILABLE");
  return validateNativeRecoverySource(policy, source, empty);
}
