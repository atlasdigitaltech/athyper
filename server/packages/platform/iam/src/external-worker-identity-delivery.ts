import type { JobHandler } from "@athyper/server-contract-jobs";
import { sql, type Transaction } from "kysely";
import type {
  ExternalWorkerIdentityIntentConsumer,
  ExternalWorkerIntentDisposition,
} from "./external-worker-identity-intent.js";

export const EXTERNAL_WORKER_IDENTITY_DELIVERY_QUEUE =
  "iam.external-worker.delivery";
export const DELIVER_EXTERNAL_WORKER_IDENTITY_INTENTS_JOB =
  "trustiam.external-worker.intent.deliver";
type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;

export interface ExternalWorkerIdentityDeliveryItem {
  readonly outboxId: string;
  readonly sourceTenantId: string;
  readonly eventType:
    | "workforce.external_worker.identity_projection.requested"
    | "workforce.employee.identity_projection.requested";
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface ExternalWorkerIdentityDeliveryRepository {
  claim(input: {
    workerId: string;
    limit: number;
    leaseSeconds: number;
  }): Promise<readonly ExternalWorkerIdentityDeliveryItem[]>;
  complete(
    item: ExternalWorkerIdentityDeliveryItem,
    disposition: ExternalWorkerIntentDisposition,
  ): Promise<void>;
  fail(
    item: ExternalWorkerIdentityDeliveryItem,
    input: {
      code: string;
      message: string;
      permanent: boolean;
      retryAt?: string;
    },
  ): Promise<void>;
}

export class KyselyExternalWorkerIdentityDeliveryRepository implements ExternalWorkerIdentityDeliveryRepository {
  constructor(
    private readonly run: <T>(work: (tx: Tx) => Promise<T>) => Promise<T>,
  ) {}
  claim(input: { workerId: string; limit: number; leaseSeconds: number }) {
    return this.run(async (tx) =>
      (
        await sql<Row>`WITH candidates AS (
      SELECT id FROM event.outbox WHERE topic='neon-workforce-iam' AND event_type IN('workforce.external_worker.identity_projection.requested','workforce.employee.identity_projection.requested') AND (status IN('pending','failed') OR (status='processing' AND locked_until<=clock_timestamp())) AND available_at<=clock_timestamp() AND attempts<max_attempts ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT ${bounded(input.limit)}
    ), claimed AS (
      UPDATE event.outbox value SET status='processing',attempts=value.attempts+1,locked_at=clock_timestamp(),locked_by=${input.workerId},locked_until=clock_timestamp()+(${input.leaseSeconds}*interval '1 second'),last_error=NULL FROM candidates WHERE value.id=candidates.id RETURNING value.*
    ) SELECT * FROM claimed ORDER BY created_at,id`.execute(tx)
      ).rows.map(mapItem),
    );
  }
  complete(
    item: ExternalWorkerIdentityDeliveryItem,
    disposition: ExternalWorkerIntentDisposition,
  ) {
    return this.run(async (tx) => {
      await sql`UPDATE event.outbox SET status='completed',processed_at=clock_timestamp(),published_at=COALESCE(published_at,clock_timestamp()),locked_at=NULL,locked_by=NULL,locked_until=NULL,last_error=${`studio:${disposition}`} WHERE id=${item.outboxId}::uuid AND status='processing'`.execute(
        tx,
      );
    });
  }
  fail(
    item: ExternalWorkerIdentityDeliveryItem,
    input: {
      code: string;
      message: string;
      permanent: boolean;
      retryAt?: string;
    },
  ) {
    return this.run(async (tx) => {
      await sql`UPDATE event.outbox SET status=${input.permanent ? "dead_letter" : "failed"}::event.outbox_status_d,available_at=${input.retryAt ?? new Date().toISOString()}::timestamptz,last_error=${`${input.code}:${input.message}`.slice(0, 4000)},locked_at=NULL,locked_by=NULL,locked_until=NULL WHERE id=${item.outboxId}::uuid AND status='processing'`.execute(
        tx,
      );
    });
  }
}

export class ExternalWorkerIdentityDeliveryWorker {
  constructor(
    private readonly options: {
      workerId: string;
      repository: ExternalWorkerIdentityDeliveryRepository;
      consumer(
        sourceTenantId: string,
      ): Promise<ExternalWorkerIdentityIntentConsumer>;
      now?: () => Date;
      capture?: (
        error: unknown,
        item: ExternalWorkerIdentityDeliveryItem,
      ) => void;
    },
  ) {}
  async deliver(limit = 100): Promise<Readonly<Record<string, number>>> {
    const summary: Record<string, number> = {};
    for (const item of await this.options.repository.claim({
      workerId: this.options.workerId,
      limit: bounded(limit),
      leaseSeconds: 90,
    })) {
      try {
        const consumer = await this.options.consumer(item.sourceTenantId);
        const result = await consumer.consume({
          eventId: item.outboxId,
          eventType: item.eventType,
          sourceTenantId: item.sourceTenantId,
          payload: item.payload,
        });
        if (result.disposition === "conflict")
          await this.options.repository.fail(item, {
            code: "EXTERNAL_WORKER_INTENT_PROJECTION_CONFLICT",
            message: "Studio rejected a conflicting desired projection",
            permanent: true,
          });
        else await this.options.repository.complete(item, result.disposition);
        increment(summary, result.disposition);
      } catch (error) {
        const failure = classify(error, item.attempt >= item.maxAttempts),
          retryAt = failure.permanent
            ? undefined
            : new Date(
                (this.options.now?.() ?? new Date()).valueOf() +
                  Math.min(
                    3_600_000,
                    5000 * 2 ** Math.max(0, item.attempt - 1),
                  ),
              ).toISOString();
        await this.options.repository.fail(item, {
          ...failure,
          ...(retryAt ? { retryAt } : {}),
        });
        increment(summary, failure.permanent ? "dead_letter" : "retry");
        this.options.capture?.(error, item);
      }
    }
    return summary;
  }
}
export function createExternalWorkerIdentityDeliveryHandler(
  worker: ExternalWorkerIdentityDeliveryWorker,
): JobHandler {
  return {
    async handle(job) {
      const limit = (job.data as Record<string, unknown>)["limit"];
      return {
        status: "completed",
        output: await worker.deliver(typeof limit === "number" ? limit : 100),
      };
    },
  };
}
function classify(error: unknown, exhausted: boolean) {
  const value = error as { code?: string; message?: string },
    code = String(
      value?.code ?? "EXTERNAL_WORKER_IDENTITY_DELIVERY_FAILED",
    ).slice(0, 120),
    message = String(value?.message ?? code).slice(0, 2000);
  const permanent =
    exhausted ||
    /(CONTRACT|TENANT_MISMATCH|HASH_INVALID|SCOPE_INVALID|APPLICATION_INVALID|STATE_INVALID|SOURCE_INVALID|VERSION_INVALID|EVENT_CONFLICT)/.test(
      code,
    );
  return { code, message, permanent };
}
function mapItem(row: Row): ExternalWorkerIdentityDeliveryItem {
  const payload = object(row["payload"]),
    sourceTenantId = String(row["tenant_id"]),
    eventType = String(row["event_type"]);
  if (
    eventType !== "workforce.external_worker.identity_projection.requested" &&
    eventType !== "workforce.employee.identity_projection.requested"
  )
    throw new Error("EXTERNAL_WORKER_IDENTITY_EVENT_TYPE_INVALID");
  return {
    outboxId: String(row["id"]),
    sourceTenantId,
    eventType,
    attempt: Number(row["attempts"]),
    maxAttempts: Number(row["max_attempts"]),
    payload,
  };
}
function object(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("EXTERNAL_WORKER_IDENTITY_PAYLOAD_INVALID");
  return value as Readonly<Record<string, unknown>>;
}
function bounded(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100)
    throw new Error("EXTERNAL_WORKER_IDENTITY_DELIVERY_LIMIT_INVALID");
  return value;
}
function increment(value: Record<string, number>, key: string) {
  value[key] = (value[key] ?? 0) + 1;
}
