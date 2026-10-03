import { sql, type Transaction } from "kysely";
import { canonicalJson } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { HumanReviewedExecutionPolicy } from "./human-publication-policy.js";

export interface PublicationPolicyPin { readonly id: string; readonly hash: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function parseReplacementPins(input: unknown, replacementId: string): readonly PublicationPolicyPin[] {
  if (!Array.isArray(input) || !input.length || input.length > 32 || input.some(p => !p || typeof p !== "object"
    || Object.keys(p).sort().join() !== "hash,id" || !uuid.test(p.id) || !/^[a-f0-9]{64}$/.test(p.hash)
    || p.id === replacementId) || new Set(input.map(p => p.id)).size !== input.length)
    throw Error("PUBLICATION_REPLACEMENT_INPUT_INVALID");
  return input.map(p => ({ id: p.id, hash: p.hash })).sort((a, b) => a.id.localeCompare(b.id));
}
export function replacementScope(policy: HumanReviewedExecutionPolicy): string {
  // Only the enrollment name/revision and compiler build may change. Preserve
  // source human receipts, workload identities and every predecessor target pin.
  const { policyId: _name, revision: _revision, compiler: _compiler, predecessors, ...scope } = policy;
  return canonicalJson({ ...scope, predecessors: predecessors.map(({ policyId: _id, revision: _rev, compiler: _build, ...p }) => p) });
}
export async function lockPublicationSources(tx: Transaction<Record<string, never>>, policy: HumanReviewedExecutionPolicy) {
  for (const member of [...policy.plan.members].sort((a, b) => a.entityId.localeCompare(b.entityId))) {
    const row = (await sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`reference-publication:${member.entityId}`},0)) locked`.execute(tx)).rows[0];
    if (!row?.locked) throw Error("PUBLICATION_REPLACEMENT_EXECUTION_IN_PROGRESS");
  }
  for (const member of [...policy.plan.members].sort((a, b) => a.entityId.localeCompare(b.entityId))) {
    const row = (await sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`system-entity-release:${member.entityId}`},0)) locked`.execute(tx)).rows[0];
    if (!row?.locked) throw Error("PUBLICATION_REPLACEMENT_EXECUTION_IN_PROGRESS");
  }
}
export async function overlappingPolicies(tx: Transaction<Record<string, never>>, tenantId: string, policy: HumanReviewedExecutionPolicy, id: string) {
  return (await sql<{ id: string }>`SELECT DISTINCT d.id FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
    WHERE d.tenant_id=${tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published') AND d.id<>${id}::uuid
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(${JSON.stringify(policy.plan.members)}::jsonb) m
        WHERE r.action_config#>>'{policy,changeSetId}'=m->>'changeSetId'
          OR r.action_config#>'{policy,plan,members}' @> jsonb_build_array(jsonb_build_object('changeSetId',m->>'changeSetId')))
    ORDER BY d.id`.execute(tx)).rows.map(r => r.id);
}
