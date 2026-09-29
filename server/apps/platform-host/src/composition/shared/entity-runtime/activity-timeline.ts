import { sql, type Transaction } from "kysely";
import type { ActivityTimelineItem } from "@athyper/contract-platform-entity-runtime";
import type {
  ActivitySubject,
  ActivityAdmission,
  ActivityWindow,
} from "@athyper/server-platform-experience";

/** Source identities and microsecond ordering survive pagination. No timestamp-only correlation. */
export async function queryActivityTimeline(
  tx: Transaction<Record<string, never>>,
  subject: ActivitySubject,
  admission: ActivityAdmission,
  page: ActivityWindow,
  entityType: string,
  visible: ReadonlySet<string>,
): Promise<readonly ActivityTimelineItem[]> {
  const { context, entityCode, recordId } = subject;
  const sources = [
    sql`SELECT 'audit:'||id::text AS id,occurred_at AS at,event_code AS event,operation,outcome,actor_principal_id::text AS actor,changed_fields AS fields,'audit'::text AS source,correlation_id::text AS correlation
    FROM audit.audit_log WHERE tenant_id=${context.tenantId}::uuid AND plane_code=${context.planeKey} AND entity_type=${entityCode} AND entity_id=${recordId}::uuid`,
  ];
  const allowed = new Set(
    admission.projection.actions.map((action) => action.key),
  );
  if (allowed.has("snapshots_read"))
    sources.push(sql`SELECT 'snapshot:'||id::text,captured_at,'snapshot.saved','capture','success',captured_by::text,ARRAY[]::text[],'snapshot',NULL::text
    FROM snapshot.entity_snapshot_identity WHERE tenant_id=${context.tenantId}::uuid AND entity_type=${entityType} AND entity_code=${entityCode} AND entity_id=${recordId}::uuid`);
  if (allowed.has("versions_read") && admission.binding.recording)
    sources.push(sql`SELECT 'version:'||id::text,occurred_at,'version.committed',operation,'success',actor_principal_id::text,changed_fields,'version',NULL::text
    FROM snapshot.record_version WHERE tenant_id=${context.tenantId}::uuid AND plane_code=${context.planeKey} AND entity_type=${entityType} AND entity_code=${entityCode} AND entity_id=${recordId}::uuid`);
  const filters = page.filters;
  const rows = (
    await sql<ActivityTimelineItem>`SELECT id,to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",event,operation,outcome,actor,fields AS "changedFields",source,correlation FROM (${sql.join(sources, sql` UNION ALL `)}) AS events
    WHERE at>=${page.from}::timestamptz AND at<=${page.until}::timestamptz
    ${page.after ? sql`AND (at,id)<(${page.after.at}::timestamptz,${page.after.id})` : sql``}
    ${filters?.event ? sql`AND event=${filters.event}` : sql``}
    ${filters?.actor ? sql`AND actor=${filters.actor}` : sql``}
    ${filters?.outcome ? sql`AND outcome=${filters.outcome}` : sql``}
    ORDER BY at DESC,id DESC LIMIT ${page.limit}`.execute(tx)
  ).rows;
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    event: row.event,
    operation: row.operation,
    outcome: row.outcome,
    actor: row.actor,
    source: row.source,
    ...(row.correlation ? { correlation: row.correlation } : {}),
    changedFields: (row.changedFields ?? []).filter((key) => visible.has(key)),
  }));
}
