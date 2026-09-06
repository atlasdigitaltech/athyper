import type { PlaneKey } from "@athyper/server-foundation/context";

export type JobPayload = object;

export type JobScope = "tenant" | "plane";

export interface JobExecutionCoordinate {
  readonly planeKey: PlaneKey;
  readonly scope: JobScope;
  readonly tenantId?: string;
  readonly principalId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface JobSubject {
  readonly entityCode: string;
  readonly recordId?: string;
  readonly operationCode?: string;
  readonly entityContractReleaseId?: string;
}

export interface JobPayloadSchema {
  readonly name: string;
  readonly version: number;
}

export type JobBackoffPolicy =
  | { readonly kind: "fixed"; readonly delayMs: number }
  | { readonly kind: "exponential"; readonly delayMs: number; readonly jitter?: number };

export interface JobEnvelope<
  Name extends string = string,
  Payload extends JobPayload = JobPayload,
> {
  readonly id: string;
  readonly name: Name;
  readonly queue: string;
  readonly data: Payload;
  readonly attempt: number;
  /** Total permitted attempts for this execution, including admitted manual retries. */
  readonly maxAttempts: number;
  readonly enqueuedAt: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
  /** Durable execution identity, qualified by queue independently of handler idempotency. */
  readonly executionKey?: string;
  readonly execution?: JobExecutionCoordinate;
  readonly subject?: JobSubject;
  readonly payloadSchema?: JobPayloadSchema;
}

export interface EnqueueOptions {
  readonly jobId?: string;
  /** Stable semantic key used to derive a BullMQ-safe job id. Mutually exclusive with jobId. */
  readonly enqueueKey?: string;
  readonly delayMs?: number;
  readonly maxAttempts?: number;
  readonly priority?: number;
  readonly backoff?: JobBackoffPolicy;
  readonly timeoutMs?: number;
  readonly execution?: JobExecutionCoordinate;
  readonly subject?: JobSubject;
  readonly payloadSchema?: JobPayloadSchema;
  readonly removeOnComplete?: boolean | number;
  readonly removeOnFail?: boolean | number;
}

export interface JobExecutionContext {
  readonly signal: AbortSignal;
  readonly attempt: number;
  readonly reportProgress: (progress: number | Readonly<Record<string, unknown>>) => Promise<void>;
}

export type JobExecutionResult =
  | { readonly status: "completed"; readonly output?: Readonly<Record<string, unknown>> }
  | { readonly status: "discarded"; readonly reason: string };

export type JobFailureDisposition = "retryable" | "permanent" | "timed_out" | "cancelled";

export interface JobExecutionFailure {
  readonly disposition: JobFailureDisposition;
  readonly code: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}
