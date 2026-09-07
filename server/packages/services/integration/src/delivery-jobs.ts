import type {
  ConnectorTransport,
  DeliveryFailure,
  IntegrationRepository,
  SecretResolver,
} from "@athyper/server-contract-integration";
import type {
  JobHandler,
  JobHandlerRegistry,
  JobPublisher,
} from "@athyper/server-contract-jobs";
import { canonicalJson, sha256 } from "./integration-service.js";
export const INTEGRATION_DELIVERY_QUEUE = "integration.delivery",
  DELIVER_INTEGRATION_JOB = "integration.deliver";
export interface IntegrationDeliveryPayload {
  readonly tenantId: string;
  readonly deliveryId: string;
}
/** Registers the Integration-owned delivery handler with a runtime-neutral job registry. */
export function registerIntegrationJobs(
  runtime: JobHandlerRegistry,
  deps: {
    readonly repository: IntegrationRepository;
    readonly transport: ConnectorTransport;
    readonly secrets: SecretResolver;
  },
): void {
  runtime.register(
    INTEGRATION_DELIVERY_QUEUE,
    DELIVER_INTEGRATION_JOB,
    createIntegrationDeliveryHandler(
      deps.repository,
      deps.transport,
      deps.secrets,
    ),
  );
}
export function createIntegrationDeliveryHandler(
  repository: IntegrationRepository,
  transport: ConnectorTransport,
  secrets: SecretResolver,
  clock: () => Date = () => new Date(),
): JobHandler<typeof DELIVER_INTEGRATION_JOB, IntegrationDeliveryPayload> {
  return {
    async handle(job, context) {
      const delivery = await repository.getDelivery(
        job.data.tenantId,
        job.data.deliveryId,
      );
      if (!delivery) throw permanent("INTEGRATION_DELIVERY_NOT_FOUND");
      if (delivery.status === "delivered")
        return {
          status: "completed",
          output: { deliveryId: delivery.id, replayed: true },
        };
      const claimed = await repository.beginAttempt(
          delivery.tenantId,
          delivery.id,
        ),
        started = clock(),
        raw = Buffer.from(canonicalJson(claimed.payload));
      let response:
          Awaited<ReturnType<ConnectorTransport["invoke"]>> | undefined,
        error: unknown;
      try {
        const credential = claimed.plan.credentialReference
          ? await secrets.resolve(claimed.plan.credentialReference)
          : undefined;
        response = await transport.invoke(
          {
            ...claimed.plan,
            headers: {
              ...claimed.plan.headers,
              "idempotency-key": claimed.idempotencyKey,
            },
          },
          raw,
          credential?.bytes,
          context.signal,
        );
        if (response.status < 200 || response.status >= 300)
          throw Object.assign(new Error(`HTTP_${response.status}`), {
            status: response.status,
          });
        await repository.markDelivered(claimed.tenantId, claimed.id);
      } catch (e) {
        error = e;
      }
      const completed = clock(),
        failure = error
          ? classifyDeliveryFailure(
              error,
              claimed.plan.retryPolicy.retryStatuses,
            )
          : undefined;
      await repository.appendAttempt({
        deliveryId: claimed.id,
        tenantId: claimed.tenantId,
        attempt: claimed.attemptCount,
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
        requestUrl: claimed.plan.url,
        requestMethod: claimed.plan.method,
        requestHeaders: redact(claimed.plan.headers),
        requestBodyHash: claimed.payloadHash,
        ...(response
          ? {
              responseStatus: response.status,
              responseHeaders: redact(response.headers),
              responseBodyHash: sha256(response.body),
            }
          : { responseHeaders: {} }),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        disposition: failure?.disposition ?? "permanent",
        ...(failure ? { errorCode: failure.code } : {}),
      });
      if (!failure)
        return { status: "completed", output: { deliveryId: claimed.id } };
      const exhausted = context.attempt >= claimed.plan.retryPolicy.maxAttempts;
      if (exhausted || failure.disposition === "permanent") {
        await repository.moveToDlq(claimed.tenantId, claimed.id, failure);
        return { status: "discarded", reason: failure.code };
      }
      const delay = Math.min(
        claimed.plan.retryPolicy.maxDelayMs,
        claimed.plan.retryPolicy.initialDelayMs *
          Math.pow(claimed.plan.retryPolicy.multiplier, context.attempt - 1),
      );
      await repository.scheduleRetry(
        claimed.tenantId,
        claimed.id,
        new Date(completed.getTime() + delay).toISOString(),
        failure,
      );
      throw Object.assign(new Error(failure.message), {
        code: failure.code,
        retryable: true,
      });
    },
  };
}
export async function enqueueIntegrationDelivery(
  jobs: JobPublisher,
  payload: IntegrationDeliveryPayload,
  maxAttempts: number,
  jobId = `integration-${payload.tenantId}-${payload.deliveryId}`,
): Promise<string> {
  return jobs.enqueue(
    INTEGRATION_DELIVERY_QUEUE,
    DELIVER_INTEGRATION_JOB,
    payload,
    {
      jobId,
      maxAttempts,
      backoff: { kind: "exponential", delayMs: 1000, jitter: 0.2 },
      removeOnComplete: 500,
      removeOnFail: false,
      execution: {
        planeKey: "studio",
        scope: "tenant",
        tenantId: payload.tenantId,
        principalId: "integration-worker",
      },
      payloadSchema: { name: DELIVER_INTEGRATION_JOB, version: 1 },
    },
  );
}
export function classifyDeliveryFailure(
  error: unknown,
  retryStatuses: readonly number[],
): DeliveryFailure {
  const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : undefined,
    code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : status
          ? `HTTP_${status}`
          : "INTEGRATION_TRANSPORT_FAILURE",
    transient =
      status !== undefined
        ? retryStatuses.includes(status) ||
          status === 408 ||
          status === 425 ||
          status === 429 ||
          status >= 500
        : !(
            typeof error === "object" &&
            error !== null &&
            "retryable" in error &&
            (error as { retryable: unknown }).retryable === false
          );
  return {
    disposition: transient ? "transient" : "permanent",
    code,
    message: error instanceof Error ? error.message : code,
    ...(status !== undefined ? { responseStatus: status } : {}),
  };
}
function redact(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      [/authorization/i, /api-key/i, /signature/i, /cookie/i].some((x) =>
        x.test(k),
      )
        ? [k, "[REDACTED]"]
        : [k, v],
    ),
  );
}
function permanent(code: string): Error {
  return Object.assign(new Error(code), { code, retryable: false });
}
