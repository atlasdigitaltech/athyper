import { sql } from "kysely";
import type { ContentGrant } from "@athyper/server-contract-content";
import type { ContentAclRepository } from "./ports.js";
import type { ContentTransaction } from "./kysely-content-repository.js";

type Row = Record<string, unknown>;
const RESOURCE_CODE = "document.content_item";
const rank = { read: 1, write: 2, publish: 3, admin: 4 } as const;

export function createKyselyContentAclRepository(): ContentAclRepository<ContentTransaction> {
  return {
    async authorize(input, transaction) {
      const subjects = JSON.stringify(input.subjects.filter(subject => subject.type === "principal" || subject.type === "group"));
      const result = await sql<{ created_by: string; has_acl: boolean; matched_rank: number }>`
        SELECT item.created_by,
               EXISTS (
                 SELECT 1 FROM authz.record_acl acl
                 WHERE acl.tenant_id=item.tenant_id AND acl.resource_code=${RESOURCE_CODE}
                   AND acl.record_id=item.id AND acl.status='active'
                   AND acl.effective_from<=clock_timestamp()
                   AND (acl.effective_until IS NULL OR acl.effective_until>clock_timestamp())
               ) AS has_acl,
               COALESCE((
                 SELECT max((permission.metadata->>'content_access_rank')::integer)
                 FROM authz.record_acl acl
                 JOIN authz.permission permission ON permission.id=acl.permission_id
                 WHERE acl.tenant_id=item.tenant_id AND acl.resource_code=${RESOURCE_CODE}
                   AND acl.record_id=item.id AND acl.status='active'
                   AND acl.effective_from<=clock_timestamp()
                   AND (acl.effective_until IS NULL OR acl.effective_until>clock_timestamp())
                   AND (acl.subject_kind='tenant' OR EXISTS (
                     SELECT 1 FROM jsonb_to_recordset(${subjects}::jsonb) AS subject(type text,id uuid)
                     WHERE (acl.subject_kind='principal' AND subject.type='principal' AND subject.id=acl.principal_id)
                        OR (acl.subject_kind='group' AND subject.type='group' AND subject.id=acl.group_id)
                   ))
               ),0)::integer AS matched_rank
        FROM document.content_item item
        WHERE item.tenant_id=${input.context.tenantId}::uuid AND item.id=${input.contentItemId}::uuid`.execute(transaction);
      const row = result.rows[0];
      if (!row) return false;
      if (row.created_by === input.context.principalId) return true;
      return !row.has_acl || Number(row.matched_rank) >= rank[input.required];
    },

    async list(context, itemId, transaction) {
      const result = await sql<Row>`SELECT acl.*,acl.record_id AS content_item_id,
          CASE WHEN acl.subject_kind='tenant' THEN 'public' ELSE acl.subject_kind::text END AS subject_type,
          COALESCE(acl.principal_id,acl.group_id) AS subject_id,
          permission.metadata->>'content_access_level' AS access_level,
          acl.effective_until AS expires_at
        FROM authz.record_acl acl JOIN authz.permission permission ON permission.id=acl.permission_id
        WHERE acl.tenant_id=${context.tenantId}::uuid AND acl.resource_code=${RESOURCE_CODE}
          AND acl.record_id=${itemId}::uuid AND acl.status='active'
        ORDER BY acl.created_at`.execute(transaction);
      return result.rows.map(grant);
    },

    async grant(input, transaction) {
      if (input.subjectType !== "public" && !input.subjectId) throw new TypeError("Content ACL subjectId is required");
      const subjectKind = input.subjectType === "public" ? "tenant" : input.subjectType;
      const result = await sql<Row>`INSERT INTO authz.record_acl
          (tenant_id,resource_code,record_id,permission_id,subject_kind,principal_id,group_id,reason,
           granted_by,effective_until,created_by,metadata)
        SELECT ${input.context.tenantId}::uuid,${RESOURCE_CODE},${input.itemId}::uuid,permission.id,
          ${subjectKind}::authz.subject_kind_d,
          ${input.subjectType === "principal" ? input.subjectId : null}::uuid,
          ${input.subjectType === "group" ? input.subjectId : null}::uuid,
          'Content item share',${input.context.principalId}::uuid,${input.expiresAt}::timestamptz,
          ${input.context.principalId}::uuid,'{"source":"content-service"}'::jsonb
        FROM authz.permission permission
        WHERE permission.canonical_code=${`document.content_item.${input.accessLevel}`}
          AND permission.status='published' AND permission.is_shareable
        ON CONFLICT (tenant_id,resource_code,record_id,permission_id,subject_kind,principal_id,group_id)
          WHERE status='active'
        DO UPDATE SET effective_until=EXCLUDED.effective_until,updated_by=EXCLUDED.granted_by
        RETURNING *,record_id AS content_item_id,
          CASE WHEN subject_kind='tenant' THEN 'public' ELSE subject_kind::text END AS subject_type,
          COALESCE(principal_id,group_id) AS subject_id,
          ${input.accessLevel}::text AS access_level,effective_until AS expires_at`.execute(transaction);
      if (!result.rows[0]) throw new Error(`Content ACL permission ${input.accessLevel} is not provisioned`);
      return grant(result.rows[0]);
    },

    async revoke(context, itemId, grantId, transaction) {
      const result = await sql`UPDATE authz.record_acl SET status='revoked',revoked_by=${context.principalId}::uuid,
          revoked_at=clock_timestamp(),revocation_reason='Content share revoked',
          status_changed_at=clock_timestamp(),status_changed_by=${context.principalId}::uuid,updated_by=${context.principalId}::uuid
        WHERE tenant_id=${context.tenantId}::uuid AND resource_code=${RESOURCE_CODE}
          AND record_id=${itemId}::uuid AND id=${grantId}::uuid AND status='active'`.execute(transaction);
      return Number(result.numAffectedRows) > 0;
    },
  };
}

function grant(row: Row): ContentGrant {
  return {
    id: String(row["id"]), contentItemId: String(row["content_item_id"]),
    subjectType: String(row["subject_type"]) as ContentGrant["subjectType"],
    subjectId: row["subject_id"] ? String(row["subject_id"]) : null,
    accessLevel: String(row["access_level"]) as ContentGrant["accessLevel"], effect: "allow",
    expiresAt: row["expires_at"] ? date(row["expires_at"]) : null,
    createdAt: date(row["created_at"]), createdBy: String(row["created_by"]),
  };
}
function date(value: unknown): string { return value instanceof Date ? value.toISOString() : String(value); }
