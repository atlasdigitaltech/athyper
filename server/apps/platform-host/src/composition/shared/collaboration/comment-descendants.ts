import { sql, type RawBuilder } from "kysely";
import { collaborationEntityTypes, type CollaborationEntityCoordinates } from "@athyper/server-platform-collaboration";
import { MAX_COMMENT_THREAD_DEPTH } from "@athyper/contract-platform-rich-text";

/** Traverse only visible ancestors. Inline the visibility predicate so parent lookups
 * can use the tenant/parent index rather than materializing the whole record. */
export function commentDescendants(input: {
  tenantId: string; principalId: string; entityType: string; entityId: string;
  root: RawBuilder<unknown>;
  entityCoordinates?: CollaborationEntityCoordinates;
}) {
  return sql`WITH RECURSIVE visible AS NOT MATERIALIZED (
    SELECT id,parent_comment_id FROM document.comment
    WHERE tenant_id=${input.tenantId}::uuid AND context_type='entity'
      AND entity_type=ANY(${(input.entityCoordinates?.entityTypes ?? collaborationEntityTypes)(input.entityType)}::text[]) AND entity_id=${input.entityId}
      AND (visibility IN ('public','internal') OR commenter_id=${input.principalId}::uuid)
  ), descendants AS (
    SELECT child.id,1 depth FROM visible child
    JOIN visible parent ON parent.id=child.parent_comment_id
    WHERE parent.id=${input.root}
    UNION ALL
    SELECT child.id,parent.depth+1 FROM visible child
    JOIN descendants parent ON child.parent_comment_id=parent.id WHERE parent.depth<${MAX_COMMENT_THREAD_DEPTH}
  ) SELECT id FROM descendants`;
}
