import { sql, type Kysely } from "kysely";
import { parseDevEntitySuccessorPolicy, type DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph } from "../deterministic.js";
import { compileSystemEntityTarget } from "../compilation/entity-target-compiler.js";

/** Enrollment-time source check, not release authority or target qualification.
 * The scoped reader checks current source/predecessor correspondence and returns
 * the persisted saved graph. No broad snapshot or publication SELECT grant is
 * needed by the control API. Allocation repeats the checks under its own lock. */
export async function assertEntitySuccessorSource(
  tx: Kysely<Record<string, never>>, input: DevEntitySuccessorPolicy, authorityTenantId: string,
): Promise<void> {
  const policy = parseDevEntitySuccessorPolicy(input);
  if (policy.authorityTenantId !== authorityTenantId) throw Error("ENTITY_SUCCESSOR_AUTHORITY_MISMATCH");
  if (!tx.isTransaction) throw Error("ENTITY_SUCCESSOR_TRANSACTION_REQUIRED");
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-entity-release:${policy.entityId}`},0))`.execute(tx);
  const sources = (await sql<{ graph: MetaEntityGraph | null }>`SELECT publication.fn_entity_successor_enrollment_source(${JSON.stringify(policy)}::jsonb) graph`.execute(tx)).rows;
  const graph = sources.length === 1 ? sources[0]!.graph : null;
  if (!graph) throw Error("ENTITY_SUCCESSOR_SOURCE_OR_PREDECESSOR_CHANGED");
  const artifact = compileGraph(graph);
  if (artifact.contractHash !== policy.contractHash || artifact.descriptorHash !== policy.descriptorHash)
    throw Error("ENTITY_SUCCESSOR_SOURCE_PIN_CHANGED");
  // Metadata target admission is not storage/IAM/capability/head qualification.
  for (const target of policy.targets) compileSystemEntityTarget(graph, target.plane);
}
