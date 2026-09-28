import { sql, type Kysely } from "kysely";
import { assertCompilationRecoveryWindow, parseDevEntitySuccessorPolicy, type CompilationRecoveryPolicy } from "@athyper/server-contract-publication";
import { compileGraph, sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { assertPublicationCompilerIdentity } from "./compiler-build.js";

export function validateCompilationRecoverySource(policy: CompilationRecoveryPolicy, evidence: { graph: MetaEntityGraph; originalPolicy: unknown; releaseId: string; releaseHash: string } | null) {
  assertCompilationRecoveryWindow(policy);
  if (!evidence || evidence.releaseId !== policy.failedReleaseId || evidence.releaseHash !== policy.failedReleaseHash) throw Error("COMPILATION_RECOVERY_SOURCE_UNAVAILABLE");
  const original = parseDevEntitySuccessorPolicy(evidence.originalPolicy);
  for (const key of ["authorityTenantId", "entityId", "changeSetId", "contractHash", "descriptorHash", "authorPrincipalId", "publisherPrincipalId", "predecessor", "targets"] as const)
    if (sha256(original[key]) !== sha256(policy[key])) throw Error("COMPILATION_RECOVERY_SOURCE_CHANGED");
  if (original.compiler.buildHash !== policy.originalCompilerHash) throw Error("COMPILATION_RECOVERY_COMPILER_CHANGED");
  const artifact = compileGraph(evidence.graph);
  if (artifact.contractHash !== policy.contractHash || artifact.descriptorHash !== policy.descriptorHash) throw Error("COMPILATION_RECOVERY_GRAPH_CHANGED");
  return evidence.graph;
}

export async function assertCompilationRecoverySource(tx: Kysely<Record<string, never>>, policy: CompilationRecoveryPolicy, empty: boolean) {
  if (!tx.isTransaction) throw Error("COMPILATION_RECOVERY_TRANSACTION_REQUIRED");
  assertPublicationCompilerIdentity(policy.compiler);
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-entity-release:${policy.entityId}`},0))`.execute(tx);
  const rows = (await sql<{ evidence: Parameters<typeof validateCompilationRecoverySource>[1] }>`SELECT publication.fn_compilation_recovery_source(${JSON.stringify(policy)}::jsonb,${empty}) evidence`.execute(tx)).rows;
  return validateCompilationRecoverySource(policy, rows.length === 1 ? rows[0]!.evidence : null);
}
