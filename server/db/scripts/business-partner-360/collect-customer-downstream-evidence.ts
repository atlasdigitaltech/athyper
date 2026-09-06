#!/usr/bin/env tsx
import { Client } from "pg";
import { pathToFileURL } from "node:url";

export interface CustomerDeliveryEvidence {
  lifecycleEventId: string;
  action: string;
  version: number;
  desiredState: string;
  projectionReceiptId: string | null;
  notificationReceiptId: string | null;
  projectionStatus: string;
  notificationStatus: string;
  sagaAttemptIds: string[];
}
export function customerDownstreamComplete(
  rows: readonly CustomerDeliveryEvidence[],
) {
  const actions = [
    "activate",
    "suspend",
    "reactivate",
    "deactivate",
    "archive",
  ];
  return (
    rows.length === 5 &&
    new Set(rows.map((row) => row.lifecycleEventId)).size === 5 &&
    rows.every(
      (row, index) =>
        row.action === actions[index] &&
        (index === 0 || row.version === rows[index - 1]!.version + 1) &&
        row.desiredState ===
          (["activate", "reactivate"].includes(row.action)
            ? "active"
            : "inactive") &&
        row.projectionStatus === "consumed" &&
        row.notificationStatus === "delivered" &&
        Boolean(row.projectionReceiptId) &&
        Boolean(row.notificationReceiptId) &&
        row.sagaAttemptIds.length > 0,
    )
  );
}
export async function collectCustomerDownstreamEvidence(options: {
  neonUrl: string;
  studioUrl: string;
  tenantId: string;
  customerId: string;
}) {
  for (const value of [options.tenantId, options.customerId])
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        value,
      )
    )
      throw new Error("Tenant and Customer must be UUIDs");
  const neon = new Client({ connectionString: options.neonUrl }),
    studio = new Client({ connectionString: options.studioUrl });
  try {
    await neon.connect();
    await studio.connect();
    await neon.query("BEGIN READ ONLY");
    await studio.query("BEGIN READ ONLY");
    const events = (
      await neon.query(
        `SELECT e.id,e.action_code,e.resulting_version,e.to_status,
      r.payload receipt_payload,
      (SELECT d.id FROM event.outbox source JOIN event.notification_message m ON m.tenant_id=source.tenant_id AND m.event_id=source.id JOIN event.notification_delivery d ON d.tenant_id=m.tenant_id AND d.message_id=m.id WHERE source.tenant_id=e.tenant_id AND source.entity_id=e.customer_id AND source.topic='customer-lifecycle' AND source.payload->>'lifecycleEventId'=e.id::text AND d.channel='in_app' AND d.recipient_id=source.actor_id AND d.status='delivered' AND d.delivered_at IS NOT NULL ORDER BY d.delivered_at LIMIT 1) notification_receipt_id
      FROM control.customer_lifecycle_event e LEFT JOIN LATERAL(SELECT payload FROM event.outbox WHERE tenant_id=e.tenant_id AND event_type='customer.portal_iam_projection.consumed' AND entity_id=e.customer_id AND payload->>'lifecycleEventId'=e.id::text ORDER BY created_at DESC LIMIT 1) r ON true
      WHERE e.tenant_id=$1 AND e.customer_id=$2 ORDER BY e.resulting_version`,
        [options.tenantId, options.customerId],
      )
    ).rows;
    const deliveries: CustomerDeliveryEvidence[] = [];
    for (const event of events) {
      const r = event.receipt_payload as {
        receiptId?: string;
        attempts?: string[];
      } | null;
      let confirmed = false;
      if (r?.receiptId && Array.isArray(r.attempts) && r.attempts.length) {
        const command = (
          await studio.query(
            `SELECT result_payload FROM event.command_execution WHERE tenant_id=$1 AND id=$2 AND command_code='trustiam.customer_portal.lifecycle.consume' AND status='succeeded'`,
            [options.tenantId, r.receiptId],
          )
        ).rows[0]?.result_payload;
        if (
          command?.customerId === options.customerId &&
          command.lifecycleEventId === event.id &&
          Number(command.version) === Number(event.resulting_version) &&
          Array.isArray(command.identities) &&
          command.identities.length === r.attempts.length
        ) {
          const attempts = (
            await studio.query(
              `SELECT id,identity_projection_id,desired_version,desired_hash FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=$1 AND id=ANY($2::uuid[]) AND status='succeeded'`,
              [options.tenantId, r.attempts],
            )
          ).rows;
          confirmed =
            new Set(r.attempts).size === r.attempts.length &&
            attempts.length === command.identities.length &&
            command.identities.every(
              (identity: {
                id: string;
                desiredVersion: number;
                desiredHash: string;
                desiredStatus: string;
              }) =>
                identity.desiredStatus ===
                  (event.to_status === "active"
                    ? "active"
                    : event.to_status === "suspended"
                      ? "suspended"
                      : "deprovisioned") &&
                attempts.some(
                  (a) =>
                    a.identity_projection_id === identity.id &&
                    Number(a.desired_version) === identity.desiredVersion &&
                    a.desired_hash === identity.desiredHash,
                ),
            );
        }
      }
      deliveries.push({
        lifecycleEventId: event.id,
        action: event.action_code,
        version: Number(event.resulting_version),
        desiredState: event.to_status === "active" ? "active" : "inactive",
        projectionReceiptId: r?.receiptId ?? null,
        notificationReceiptId: event.notification_receipt_id ?? null,
        projectionStatus: confirmed ? "consumed" : "pending",
        notificationStatus: event.notification_receipt_id
          ? "delivered"
          : "pending",
        sagaAttemptIds: confirmed ? r!.attempts! : [],
      });
    }
    return {
      schema: "athyper.customer-downstream-observation/1",
      recordedAt: new Date().toISOString(),
      tenantId: options.tenantId,
      customerId: options.customerId,
      sanitized: true,
      complete: customerDownstreamComplete(deliveries),
      deliveries,
    };
  } finally {
    await Promise.allSettled([neon.end(), studio.end()]);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const option = (name: string) =>
    process.argv
      .find((arg) => arg.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const neonUrl = process.env.ATHYPER_NEON_DATABASE_ADMIN_URL,
    studioUrl = process.env.ATHYPER_PLATFORM_DATABASE_ADMIN_URL,
    tenantId = option("--tenant-id"),
    customerId = option("--customer-id");
  if (!neonUrl || !studioUrl || !tenantId || !customerId)
    throw new Error(
      "Set both plane database URLs through the secret environment; pass --tenant-id and --customer-id",
    );
  const result = await collectCustomerDownstreamEvidence({
    neonUrl,
    studioUrl,
    tenantId,
    customerId,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.complete) process.exitCode = 2;
}
