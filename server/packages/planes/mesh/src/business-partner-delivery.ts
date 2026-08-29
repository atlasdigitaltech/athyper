import type { JobHandler } from "@athyper/server-contract-jobs";
import { sql, type Transaction } from "kysely";

export const BUSINESS_PARTNER_DELIVERY_QUEUE = "mesh.business-partner.delivery";
export const DELIVER_BUSINESS_PARTNER_EVENTS_JOB = "mesh.business-partner.deliver";
export const RECONCILE_BUSINESS_PARTNER_EVENTS_JOB = "mesh.business-partner.reconcile";

export type BusinessPartnerEventKind = "profile" | "bank";
export type DeliveryDisposition = "applied" | "duplicate" | "stale" | "quarantined";

export interface BusinessPartnerDeliveryItem {
  readonly outboxId: string;
  readonly sourceTenantId: string;
  readonly recipientTenantId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly kind: BusinessPartnerEventKind;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly envelope: Readonly<Record<string, unknown>>;
}

export interface BusinessPartnerDeliveryRepository {
  claim(input: { readonly workerId: string; readonly limit: number; readonly leaseSeconds: number }): Promise<readonly BusinessPartnerDeliveryItem[]>;
  complete(item: BusinessPartnerDeliveryItem, disposition: Exclude<DeliveryDisposition, "quarantined">): Promise<void>;
  fail(item: BusinessPartnerDeliveryItem, input: { readonly code: string; readonly message: string; readonly permanent: boolean; readonly retryAt?: string }): Promise<void>;
  reconciliationCandidates(limit: number): Promise<readonly BusinessPartnerDeliveryItem[]>;
  reopen(item: BusinessPartnerDeliveryItem, reason: string): Promise<void>;
  requestReplay(outboxId: string, reason: string): Promise<boolean>;
}

export interface BusinessPartnerRecipientTransport {
  deliver(item: BusinessPartnerDeliveryItem): Promise<{ readonly disposition: DeliveryDisposition; readonly reasonCode?: string }>;
  hasReceipt(item: BusinessPartnerDeliveryItem): Promise<boolean>;
}

export interface BusinessPartnerDeliveryTelemetry {
  record(labels: { readonly operation: "delivery" | "reconciliation"; readonly kind: BusinessPartnerEventKind; readonly outcome: string }): void;
  capture(error: unknown, item: BusinessPartnerDeliveryItem): void;
}

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;

export class KyselyBusinessPartnerDeliveryRepository implements BusinessPartnerDeliveryRepository {
  constructor(private readonly run: <T>(work: (transaction: Tx) => Promise<T>) => Promise<T>) {}

  claim(input: { workerId: string; limit: number; leaseSeconds: number }) {
    return this.run(async tx => (await sql<Row>`WITH candidates AS (
      SELECT id FROM event.outbox
      WHERE topic='mesh-business-partner'
        AND event_type IN ('business_partner.profile_publication.published','business_partner.profile_publication.withdrawn','mesh.bank_account.disclosed','mesh.bank_account.changed','mesh.bank_account.revoked')
        AND (status IN ('pending','failed') OR (status='processing' AND locked_until<=clock_timestamp()))
        AND available_at<=clock_timestamp() AND attempts<max_attempts
      ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT ${input.limit}
    ), claimed AS (
      UPDATE event.outbox value SET status='processing',attempts=value.attempts+1,locked_at=clock_timestamp(),locked_by=${input.workerId},locked_until=clock_timestamp()+(${input.leaseSeconds}*interval '1 second'),last_error=NULL
      FROM candidates WHERE value.id=candidates.id RETURNING value.*
    ) SELECT * FROM claimed ORDER BY created_at,id`.execute(tx)).rows.map(mapItem));
  }

  complete(item: BusinessPartnerDeliveryItem, disposition: Exclude<DeliveryDisposition, "quarantined">) {
    return this.run(async tx => { await sql`UPDATE event.outbox SET status='completed',processed_at=clock_timestamp(),published_at=COALESCE(published_at,clock_timestamp()),locked_at=NULL,locked_by=NULL,locked_until=NULL,last_error=${`recipient:${disposition}`} WHERE id=${item.outboxId}::uuid AND status='processing'`.execute(tx); });
  }

  fail(item: BusinessPartnerDeliveryItem, input: { code: string; message: string; permanent: boolean; retryAt?: string }) {
    return this.run(async tx => { await sql`UPDATE event.outbox SET status=${input.permanent ? "dead_letter" : "failed"}::event.outbox_status_d,available_at=${input.retryAt ?? new Date().toISOString()}::timestamptz,last_error=${`${input.code}:${input.message}`.slice(0, 4000)},locked_at=NULL,locked_by=NULL,locked_until=NULL WHERE id=${item.outboxId}::uuid AND status='processing'`.execute(tx); });
  }

  reconciliationCandidates(limit: number) {
    return this.run(async tx => (await sql<Row>`SELECT * FROM event.outbox WHERE topic='mesh-business-partner' AND event_type IN ('business_partner.profile_publication.published','business_partner.profile_publication.withdrawn','mesh.bank_account.disclosed','mesh.bank_account.changed','mesh.bank_account.revoked') AND status='completed' ORDER BY processed_at DESC NULLS LAST,id LIMIT ${limit}`.execute(tx)).rows.map(mapItem));
  }

  reopen(item: BusinessPartnerDeliveryItem, reason: string) {
    return this.run(async tx => { await sql`UPDATE event.outbox SET status='failed',available_at=clock_timestamp(),processed_at=NULL,published_at=NULL,last_error=${reason},attempts=CASE WHEN attempts>=max_attempts THEN greatest(max_attempts-1,0) ELSE attempts END WHERE id=${item.outboxId}::uuid AND status='completed'`.execute(tx); });
  }
  requestReplay(outboxId: string, reason: string) {
    return this.run(async tx => Number((await sql`UPDATE event.outbox SET status='failed',attempts=0,available_at=clock_timestamp(),processed_at=NULL,published_at=NULL,locked_at=NULL,locked_by=NULL,locked_until=NULL,last_error=${`REPLAY_REQUESTED:${reason}`.slice(0,4000)} WHERE id=${outboxId}::uuid AND topic='mesh-business-partner' AND status='dead_letter'`.execute(tx)).numAffectedRows??0)===1);
  }
}

export class BusinessPartnerDeliveryWorker {
  constructor(private readonly options: {
    readonly workerId: string;
    readonly repository: BusinessPartnerDeliveryRepository;
    readonly recipient: BusinessPartnerRecipientTransport;
    readonly telemetry?: BusinessPartnerDeliveryTelemetry;
    readonly now?: () => Date;
  }) {}

  async deliver(limit = 100): Promise<Readonly<Record<string, number>>> {
    const summary: Record<string, number> = {};
    const items = await this.options.repository.claim({ workerId: this.options.workerId, limit: bounded(limit), leaseSeconds: 90 });
    for (const item of items) {
      try {
        const result = await this.options.recipient.deliver(item);
        if (result.disposition === "quarantined") {
          await this.options.repository.fail(item, { code: result.reasonCode ?? "RECIPIENT_QUARANTINED", message: "Recipient quarantined the immutable envelope", permanent: true });
        } else {
          await this.options.repository.complete(item, result.disposition);
        }
        increment(summary, result.disposition);
        this.options.telemetry?.record({ operation: "delivery", kind: item.kind, outcome: result.disposition });
      } catch (error) {
        const failure = classify(error, item.attempt >= item.maxAttempts);
        await this.options.repository.fail(item, { ...failure, ...(failure.permanent ? {} : { retryAt: retryAt(this.options.now?.() ?? new Date(), item.attempt) }) });
        increment(summary, failure.permanent ? "dead_letter" : "retry");
        this.options.telemetry?.record({ operation: "delivery", kind: item.kind, outcome: failure.permanent ? "dead_letter" : "retry" });
        this.options.telemetry?.capture(error, item);
      }
    }
    return summary;
  }

  async reconcile(limit = 250): Promise<Readonly<Record<string, number>>> {
    const summary: Record<string, number> = {};
    for (const item of await this.options.repository.reconciliationCandidates(bounded(limit, 250))) {
      try {
        const received = await this.options.recipient.hasReceipt(item);
        if (received) increment(summary, "in_sync");
        else { await this.options.repository.reopen(item, "RECIPIENT_RECEIPT_MISSING"); increment(summary, "reopened"); }
        this.options.telemetry?.record({ operation: "reconciliation", kind: item.kind, outcome: received ? "in_sync" : "reopened" });
      } catch (error) {
        increment(summary, "check_failed");
        this.options.telemetry?.record({ operation: "reconciliation", kind: item.kind, outcome: "check_failed" });
        this.options.telemetry?.capture(error, item);
      }
    }
    return summary;
  }
}

export function createBusinessPartnerDeliveryHandler(worker: BusinessPartnerDeliveryWorker, repository?: BusinessPartnerDeliveryRepository): JobHandler {
  return { async handle(job) { const data=job.data as Record<string,unknown>,replayOutboxId=data["replayOutboxId"],reason=data["reason"];if(replayOutboxId!==undefined){if(!repository||typeof replayOutboxId!=="string"||!uuid(replayOutboxId)||typeof reason!=="string"||reason.trim().length<8||reason.length>1000)throw new Error("BUSINESS_PARTNER_REPLAY_REQUEST_INVALID");if(!await repository.requestReplay(replayOutboxId,reason.trim()))return{status:"discarded",reason:"BUSINESS_PARTNER_DEAD_LETTER_NOT_FOUND"};}const limit = numeric(data["limit"], 100); return { status: "completed", output: await worker.deliver(limit) }; } };
}
export function createBusinessPartnerReconciliationHandler(worker: BusinessPartnerDeliveryWorker): JobHandler {
  return { async handle(job) { const limit = numeric((job.data as Record<string, unknown>)["limit"], 250); return { status: "completed", output: await worker.reconcile(limit) }; } };
}

function classify(error: unknown, exhausted: boolean) {
  const value = error as { status?: number; code?: string; message?: string };
  const status = Number(value?.status ?? 0);
  const code = String(value?.code ?? "BUSINESS_PARTNER_DELIVERY_FAILED").slice(0, 120);
  const message = String(value?.message ?? "Business Partner event delivery failed").slice(0, 2000);
  const permanent = exhausted || (status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status));
  return { code, message, permanent };
}
function retryAt(now: Date, attempt: number) { return new Date(now.valueOf() + Math.min(3_600_000, 5_000 * 2 ** Math.max(0, attempt - 1))).toISOString(); }
function increment(summary: Record<string, number>, key: string) { summary[key] = (summary[key] ?? 0) + 1; }
function numeric(value: unknown, fallback: number) { return typeof value === "number" ? bounded(value, fallback) : fallback; }
function bounded(value: number, max = 100) { if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`BUSINESS_PARTNER_DELIVERY_LIMIT_INVALID:${max}`); return value; }
function mapItem(row: Row): BusinessPartnerDeliveryItem {
  const envelope = object(row["payload"]), eventType = String(row["event_type"]), recipientTenantId = String(envelope["recipientTenantId"] ?? row["partition_key"] ?? ""), eventId = String(envelope["eventId"] ?? "");
  if (!uuid(recipientTenantId) || !uuid(eventId)) throw new Error("BUSINESS_PARTNER_DELIVERY_ENVELOPE_COORDINATE_INVALID");
  return { outboxId: String(row["id"]), sourceTenantId: String(row["tenant_id"]), recipientTenantId, eventId, eventType, kind: eventType.startsWith("mesh.bank_account.") ? "bank" : "profile", attempt: Number(row["attempts"]), maxAttempts: Number(row["max_attempts"]), envelope };
}
function object(value: unknown): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("BUSINESS_PARTNER_DELIVERY_ENVELOPE_INVALID"); return value as Readonly<Record<string, unknown>>; }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
