import { sql, type Kysely } from "kysely";
import {
  compileEntityNotificationConfiguration,
  parseEntityNotificationConfiguration,
  parseNotificationPublicationDescriptor,
  sharedNotificationTemplates,
} from "@athyper/server-contract-publication";

/** Caller owns authorization and a tenant-scoped transaction. */
export async function readPublishedNotificationConfiguration(
  db: Kysely<Record<string, never>>,
  tenantId: string,
  entityCode: string,
) {
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(entityCode))
    throw new TypeError("Invalid entity code");
  const key = `metadata.notifications.${entityCode}.${tenantId.replaceAll("-", "")}`;
  const row = (
    await sql<
      Record<string, any>
    >`SELECT * FROM runtime_meta.fn_active_entity_descriptor(${key},'entity_notifications')`.execute(
      db,
    )
  ).rows[0];
  if (!row) return null;
  const descriptor = parseNotificationPublicationDescriptor(row.compiled_json);
  if (
    row.tenant_id !== tenantId ||
    row.entity_code !== descriptor.sourceEntityCode ||
    descriptor?.schema !== "athyper.entity-notifications/1" ||
    descriptor.entityCode !== entityCode
  )
    throw new TypeError("Notification projection coordinates do not match");
  const notifications: Record<string, unknown> = {};
  for (const kind of ["comments", "attachments"] as const)
    if (descriptor.notifications?.[kind]) {
      const configuration = parseEntityNotificationConfiguration(
        descriptor.notifications[kind],
        kind,
      );
      notifications[kind] = {
        configuration,
        projection: compileEntityNotificationConfiguration(configuration, kind),
      };
    }
  return {
    entityCode,
    sourceEntityCode: descriptor.sourceEntityCode,
    releaseId: row.release_id,
    releaseNo: Number(row.release_no),
    compiledHash: row.compiled_hash,
    notifications,
    sharedTemplates: sharedNotificationTemplates(),
  };
}
