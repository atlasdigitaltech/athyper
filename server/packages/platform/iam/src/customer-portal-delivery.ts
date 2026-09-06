import { createHash, randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { JobHandler } from "@athyper/server-contract-jobs";

type Tx = Transaction<Record<string, never>>;
type Run = <T>(work: (tx: Tx) => Promise<T>) => Promise<T>;
export const CUSTOMER_PORTAL_QUEUE = "iam.customer-portal.delivery";
export const CUSTOMER_PORTAL_JOB = "trustiam.customer-portal.deliver";
const commandCode = "trustiam.customer_portal.lifecycle.consume";
export interface CustomerPortalIntent {
  tenantId: string;
  outboxId: string;
  customerId: string;
  lifecycleEventId: string;
  version: number;
  status: "active" | "suspended" | "inactive" | "archived";
  contacts: readonly { sourceRef: string; personId: string }[];
}
export interface CustomerPortalIdentity {
  id: string;
  version: number;
  hash: string;
  status: string;
  sourceRef: string;
  personId: string;
  applications: unknown;
  priorLifecycleHash?: string;
}
export interface CustomerPortalReceipt {
  receiptId: string;
  lifecycleEventId: string;
  disposition: "pending" | "consumed" | "superseded";
  attempts: readonly string[];
}
export function planCustomerPortalProjection(
  intent: CustomerPortalIntent,
  identity: CustomerPortalIdentity,
) {
  if (
    !Number.isSafeInteger(identity.version) ||
    identity.version < 1 ||
    !Number.isSafeInteger(intent.version) ||
    intent.version < 1
  )
    throw coded("CUSTOMER_PORTAL_VERSION_INVALID");
  if (
    !intent.contacts.some(
      (c) =>
        c.sourceRef === identity.sourceRef && c.personId === identity.personId,
    )
  )
    throw coded("CUSTOMER_PORTAL_CONTACT_MISMATCH");
  const desiredStatus =
    intent.status === "active"
      ? "active"
      : intent.status === "suspended"
        ? "suspended"
        : "deprovisioned";
  if (
    desiredStatus === "active" &&
    !["active", "invited"].includes(identity.status) &&
    identity.priorLifecycleHash !== identity.hash
  )
    throw coded("CUSTOMER_PORTAL_INDEPENDENT_HOLD");
  if (
    desiredStatus === "active" &&
    (!Array.isArray(identity.applications) ||
      identity.applications.length === 0)
  )
    throw coded("CUSTOMER_PORTAL_APPLICATIONS_MISSING");
  return {
    id: identity.id,
    desiredVersion: identity.version + 1,
    desiredStatus,
    desiredHash: digest({
      tenantId: intent.tenantId,
      customerId: intent.customerId,
      lifecycleEventId: intent.lifecycleEventId,
      lifecycleVersion: intent.version,
      identityId: identity.id,
      priorHash: identity.hash,
      desiredStatus,
      applications: identity.applications,
    }),
  };
}

/** Consumes only existing Studio-owned contact projections; cannot create people or grants. */
export class CustomerPortalIntentConsumer {
  constructor(
    private readonly run: Run,
    private readonly actorId: string,
  ) {}
  async consume(intent: CustomerPortalIntent): Promise<CustomerPortalReceipt> {
    return this.run(async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-portal:${intent.tenantId}:${intent.customerId}`},0))`.execute(
        tx,
      );
      const fingerprint = digest({
        tenantId: intent.tenantId,
        customerId: intent.customerId,
        lifecycleEventId: intent.lifecycleEventId,
        version: intent.version,
        status: intent.status,
      });
      const previous = (
        await sql<{
          id: string;
          request_fingerprint: string;
          result_payload: {
            identities: {
              id: string;
              desiredVersion: number;
              desiredHash: string;
            }[];
          };
        }>`SELECT id,request_fingerprint,result_payload FROM event.command_execution WHERE tenant_id=${intent.tenantId}::uuid AND command_code=${commandCode} AND idempotency_key=${intent.outboxId} AND status='succeeded'`.execute(
          tx,
        )
      ).rows[0];
      if (previous) {
        if (previous.request_fingerprint !== fingerprint)
          throw coded("CUSTOMER_PORTAL_EVENT_CONFLICT");
        return this.observe(
          tx,
          previous.id,
          intent.lifecycleEventId,
          previous.result_payload.identities,
        );
      }
      const last = (
        await sql<{
          result_payload: {
            version: number;
            identities: { id: string; desiredHash: string }[];
          };
        }>`SELECT result_payload FROM event.command_execution WHERE tenant_id=${intent.tenantId}::uuid AND command_code=${commandCode} AND status='succeeded' AND result_payload->>'customerId'=${intent.customerId} ORDER BY (result_payload->>'version')::bigint DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0]?.result_payload;
      if (last && last.version >= intent.version)
        throw coded("CUSTOMER_PORTAL_STALE_EVENT");
      if (!intent.contacts.length || intent.contacts.length > 100)
        throw coded("CUSTOMER_PORTAL_CONTACTS_MISSING");
      const rows = (
        await sql<{
          id: string;
          person_id: string;
          source_ref: string;
          desired_version: string;
          desired_hash: string;
          desired_status: string;
          desired_applications: unknown;
        }>`SELECT p.id,p.person_id,p.source_ref,p.desired_version,p.desired_hash,p.desired_status,p.desired_applications FROM trustiam.identity_projection p JOIN trustiam.organization o ON o.authority_tenant_id=p.authority_tenant_id AND o.id=p.organization_id WHERE p.authority_tenant_id=${intent.tenantId}::uuid AND p.source_plane='neon' AND p.source_tenant_id=${intent.tenantId}::uuid AND p.relationship_kind='contact' AND p.source_ref=ANY(${intent.contacts.map((c) => c.sourceRef)}::text[]) AND o.metadata->>'organizationPurpose'='customer_portal' AND o.status='active' ORDER BY p.id FOR UPDATE OF p`.execute(
          tx,
        )
      ).rows;
      if (!rows.length) throw coded("CUSTOMER_PORTAL_BINDING_MISSING");
      const identities = rows.map((row) =>
        planCustomerPortalProjection(intent, {
          id: row.id,
          version: Number(row.desired_version),
          hash: row.desired_hash,
          status: row.desired_status,
          sourceRef: row.source_ref,
          personId: row.person_id,
          applications: row.desired_applications,
          priorLifecycleHash: last?.identities.find((i) => i.id === row.id)
            ?.desiredHash,
        }),
      );
      for (const identity of identities)
        await sql`UPDATE trustiam.identity_projection SET desired_version=${identity.desiredVersion},desired_hash=${identity.desiredHash},desired_status=${identity.desiredStatus},reconciliation_status='pending',last_error_code=NULL,updated_by=${this.actorId}::uuid WHERE id=${identity.id}::uuid AND authority_tenant_id=${intent.tenantId}::uuid`.execute(
          tx,
        );
      const result = {
        customerId: intent.customerId,
        lifecycleEventId: intent.lifecycleEventId,
        version: intent.version,
        identities,
      };
      const receipt = (
        await sql<{
          id: string;
        }>`INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,started_at,completed_at,status_changed_at,status_changed_by,created_by,result_payload) VALUES(${intent.tenantId}::uuid,${commandCode},${intent.outboxId},${fingerprint},'succeeded',${this.actorId}::uuid,'studio.customer-portal',clock_timestamp(),clock_timestamp(),clock_timestamp(),${this.actorId}::uuid,${this.actorId}::uuid,${JSON.stringify(result)}::jsonb) RETURNING id`.execute(
          tx,
        )
      ).rows[0]!;
      return {
        receiptId: receipt.id,
        lifecycleEventId: intent.lifecycleEventId,
        disposition: "pending",
        attempts: [],
      };
    });
  }
  private async observe(
    tx: Tx,
    receiptId: string,
    lifecycleEventId: string,
    identities: readonly {
      id: string;
      desiredVersion: number;
      desiredHash: string;
    }[],
  ): Promise<CustomerPortalReceipt> {
    if (!Array.isArray(identities) || !identities.length)
      throw coded("CUSTOMER_PORTAL_RECEIPT_INVALID");
    const attempts: string[] = [];
    for (const identity of identities) {
      const attempt = (
        await sql<{
          id: string;
        }>`SELECT id FROM trustiam.identity_saga_attempt WHERE identity_projection_id=${identity.id}::uuid AND desired_version=${identity.desiredVersion} AND desired_hash=${identity.desiredHash} AND status='succeeded' ORDER BY terminal_at DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      if (!attempt) {
        const failed = (
          await sql<{
            status: string;
          }>`SELECT status FROM trustiam.identity_saga_attempt WHERE identity_projection_id=${identity.id}::uuid AND desired_version=${identity.desiredVersion} AND desired_hash=${identity.desiredHash} ORDER BY attempt_no DESC LIMIT 1`.execute(
            tx,
          )
        ).rows[0];
        if (failed?.status === "dead_letter")
          throw coded("CUSTOMER_PORTAL_SAGA_DEAD_LETTER");
        const current = (
          await sql<{
            desired_version: string;
            desired_hash: string;
          }>`SELECT desired_version,desired_hash FROM trustiam.identity_projection WHERE id=${identity.id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        if (
          !current ||
          Number(current.desired_version) !== identity.desiredVersion ||
          current.desired_hash !== identity.desiredHash
        )
          throw coded("CUSTOMER_PORTAL_PROJECTION_SUPERSEDED");
        return {
          receiptId,
          lifecycleEventId,
          disposition: "pending",
          attempts: [],
        };
      }
      attempts.push(attempt.id);
    }
    return { receiptId, lifecycleEventId, disposition: "consumed", attempts };
  }
}

export interface CustomerPortalDeliveryItem {
  outboxId: string;
  tenantId: string;
  attempt: number;
  maxAttempts: number;
  claimToken: string;
}
export interface CustomerPortalDeliveryPort {
  claim(
    limit: number,
    claimToken: string,
  ): Promise<readonly CustomerPortalDeliveryItem[]>;
  intent(
    item: CustomerPortalDeliveryItem,
  ): Promise<CustomerPortalIntent | undefined>;
  finish(
    item: CustomerPortalDeliveryItem,
    receipt: CustomerPortalReceipt | undefined,
  ): Promise<void>;
  retry(item: CustomerPortalDeliveryItem, code: string): Promise<void>;
}
export class KyselyCustomerPortalDeliveryRepository implements CustomerPortalDeliveryPort {
  constructor(private readonly run: Run) {}
  claim(limit: number, claimToken: string) {
    return this.run(async (tx) => {
      await sql`UPDATE event.outbox SET status='dead_letter',last_error='CUSTOMER_PORTAL_ATTEMPTS_EXHAUSTED',locked_by=NULL,locked_at=NULL,locked_until=NULL WHERE event_type='customer.portal_iam_projection.requested' AND status='processing' AND locked_until<=clock_timestamp() AND attempts>=max_attempts`.execute(
        tx,
      );
      return (
        await sql<{
          id: string;
          tenant_id: string;
          attempts: number;
          max_attempts: number;
        }>`WITH candidates AS(SELECT id FROM event.outbox WHERE topic='iam-projection' AND event_type='customer.portal_iam_projection.requested' AND (status IN('pending','failed') OR(status='processing' AND locked_until<=clock_timestamp())) AND available_at<=clock_timestamp() AND attempts<max_attempts ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT ${limit}) UPDATE event.outbox e SET status='processing',attempts=e.attempts+1,locked_by=${claimToken},locked_at=clock_timestamp(),locked_until=clock_timestamp()+interval '90 seconds' FROM candidates c WHERE e.id=c.id RETURNING e.id,e.tenant_id,e.attempts,e.max_attempts`.execute(
          tx,
        )
      ).rows.map((row) => ({
        outboxId: row.id,
        tenantId: row.tenant_id,
        attempt: row.attempts,
        maxAttempts: row.max_attempts,
        claimToken,
      }));
    });
  }
  intent(item: CustomerPortalDeliveryItem) {
    return this.run(async (tx) => {
      const event = (
        await sql<{
          customer_id: string;
          business_partner_id: string;
          id: string;
          resulting_version: string;
          to_status: CustomerPortalIntent["status"];
          current_version: string;
          desired_state: string;
        }>`SELECT l.customer_id,l.business_partner_id,l.id,l.resulting_version,l.to_status,c.record_version current_version,e.payload->>'desiredState' desired_state FROM event.outbox e JOIN control.customer_lifecycle_event l ON l.tenant_id=e.tenant_id AND l.id=(e.payload->>'sourceLifecycleEventId')::uuid AND l.customer_id=e.entity_id AND l.customer_id=(e.payload->>'customerId')::uuid JOIN master.customer c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id WHERE e.id=${item.outboxId}::uuid AND e.tenant_id=${item.tenantId}::uuid AND e.event_type='customer.portal_iam_projection.requested' AND e.payload->>'portalCapability'='customer'`.execute(
          tx,
        )
      ).rows[0];
      if (!event) throw coded("CUSTOMER_PORTAL_SOURCE_INVALID");
      if (
        event.desired_state !==
        (event.to_status === "active" ? "active" : "inactive")
      )
        throw coded("CUSTOMER_PORTAL_STATE_MISMATCH");
      if (Number(event.current_version) !== Number(event.resulting_version))
        return undefined;
      const contacts = (
        await sql<{
          id: string;
          person_id: string;
        }>`SELECT c.id,l.person_id FROM master.contact_person c JOIN control.owner_type o ON o.id=c.owner_type_id AND o.code='business_partner' JOIN master.contact_person_identity_link l ON l.tenant_id=c.tenant_id AND l.contact_person_id=c.id WHERE c.tenant_id=${item.tenantId}::uuid AND c.owner_id=${event.business_partner_id}::uuid AND (${event.to_status}<>'active' OR(c.status='active' AND l.effective_from<=CURRENT_DATE AND(l.effective_until IS NULL OR l.effective_until>CURRENT_DATE))) ORDER BY c.id LIMIT 101`.execute(
          tx,
        )
      ).rows;
      return {
        tenantId: item.tenantId,
        outboxId: item.outboxId,
        customerId: event.customer_id,
        lifecycleEventId: event.id,
        version: Number(event.resulting_version),
        status: event.to_status,
        contacts: contacts.map((c) => ({
          sourceRef: `business_partner_contact:${c.id}`,
          personId: c.person_id,
        })),
      };
    });
  }
  finish(
    item: CustomerPortalDeliveryItem,
    receipt: CustomerPortalReceipt | undefined,
  ) {
    if (
      receipt &&
      (receipt.disposition !== "consumed" || receipt.attempts.length === 0)
    )
      throw coded("CUSTOMER_PORTAL_RECEIPT_INVALID");
    return this.run(async (tx) => {
      const updated =
        await sql`UPDATE event.outbox SET status='completed',processed_at=clock_timestamp(),published_at=COALESCE(published_at,clock_timestamp()),last_error=${receipt ? `customer-portal:consumed:${receipt.receiptId}` : "customer-portal:superseded"},locked_by=NULL,locked_at=NULL,locked_until=NULL WHERE id=${item.outboxId}::uuid AND tenant_id=${item.tenantId}::uuid AND status='processing' AND attempts=${item.attempt} AND locked_by=${item.claimToken} AND locked_until>clock_timestamp()`.execute(
          tx,
        );
      if (Number(updated.numAffectedRows) !== 1)
        throw coded("CUSTOMER_PORTAL_LEASE_LOST");
      if (receipt)
        await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,actor_id,source,payload,created_by) SELECT tenant_id,'customer-portal-receipt','customer.portal_iam_projection.consumed',${`customer-portal-receipt:${item.outboxId}`},'customer',entity_id,actor_id,'customer-portal-delivery',${JSON.stringify({ sourceOutboxId: item.outboxId, ...receipt })}::jsonb,created_by FROM event.outbox WHERE id=${item.outboxId}::uuid`.execute(
          tx,
        );
    });
  }
  retry(item: CustomerPortalDeliveryItem, code: string) {
    return this.run(async (tx) => {
      // Waiting on saga observation is not a failed delivery attempt.
      const pending = code === "CUSTOMER_PORTAL_OBSERVATION_PENDING";
      await sql`UPDATE event.outbox SET status=${!pending && item.attempt >= item.maxAttempts ? "dead_letter" : "failed"}::event.outbox_status_d,attempts=attempts-${pending ? 1 : 0},available_at=clock_timestamp()+interval '15 seconds',last_error=${code.slice(0, 120)},locked_by=NULL,locked_at=NULL,locked_until=NULL WHERE id=${item.outboxId}::uuid AND tenant_id=${item.tenantId}::uuid AND status='processing' AND attempts=${item.attempt} AND locked_by=${item.claimToken} AND locked_until>clock_timestamp()`.execute(
        tx,
      );
    });
  }
}
export function createCustomerPortalDeliveryHandler(
  repository: CustomerPortalDeliveryPort,
  consumer: (
    tenantId: string,
  ) => Promise<Pick<CustomerPortalIntentConsumer, "consume">>,
): JobHandler {
  return {
    async handle(job) {
      const requested = (job.data as { limit?: number }).limit ?? 20;
      if (!Number.isSafeInteger(requested) || requested < 1 || requested > 100)
        throw coded("CUSTOMER_PORTAL_LIMIT_INVALID");
      const summary = { consumed: 0, pending: 0, superseded: 0, failed: 0 };
      for (const item of await repository.claim(
        requested,
        `customer-portal:${randomUUID()}`,
      )) {
        try {
          const intent = await repository.intent(item);
          if (!intent) {
            await repository.finish(item, undefined);
            summary.superseded++;
            continue;
          }
          const receipt = await (await consumer(item.tenantId)).consume(intent);
          if (receipt.disposition === "consumed") {
            await repository.finish(item, receipt);
            summary.consumed++;
          } else {
            await repository.retry(item, "CUSTOMER_PORTAL_OBSERVATION_PENDING");
            summary.pending++;
          }
        } catch (error) {
          await repository.retry(
            item,
            typeof (error as { code?: unknown })?.code === "string"
              ? (error as { code: string }).code
              : "CUSTOMER_PORTAL_DELIVERY_FAILED",
          );
          summary.failed++;
        }
      }
      return { status: "completed", output: summary };
    },
  };
}
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function coded(code: string) {
  return Object.assign(new Error(code), { code });
}
