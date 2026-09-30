import { sql } from "kysely";

/** One eligibility predicate for inbox, execution and related-document views. */
export function workItemEligibilitySql(principalId: string, alias = "work_item") {
 const field = (name: string) => sql.ref(`${alias}.${name}`);
 return sql`(${field('assignee_principal_id')} = ${principalId}::uuid OR ${field('claimant_principal_id')} = ${principalId}::uuid
  OR (${field('claimant_principal_id')} IS NULL AND (EXISTS (
   SELECT 1 FROM master.team_member membership
   WHERE membership.tenant_id = ${field('tenant_id')} AND membership.team_id = ${field('assignee_team_id')}
    AND membership.principal_id = ${principalId}::uuid AND membership.joined_at <= clock_timestamp()
    AND (membership.left_at IS NULL OR membership.left_at > clock_timestamp())) OR EXISTS (
   SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${field('payload')}->'eligibility_evidence'->'candidates') = 'array'
    THEN ${field('payload')}->'eligibility_evidence'->'candidates' ELSE '[]'::jsonb END) candidate
   WHERE candidate->>'principalId' = ${principalId}))))`;
}
export function workItemActionableSql(principalId: string, alias = "work_item") {
 const field = (name: string) => sql.ref(`${alias}.${name}`);
 return sql`(${workItemEligibilitySql(principalId,alias)} AND ${field('status')} IN ('open','claimed','in_progress')
   AND ${field('available_at')} <= clock_timestamp()
   AND (${field('claimant_principal_id')} IS NULL OR ${field('claimant_principal_id')} = ${principalId}::uuid))`;
}
