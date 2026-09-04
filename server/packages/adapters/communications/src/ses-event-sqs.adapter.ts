import { createHash } from "node:crypto";
import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SQSClient,
  type DeleteMessageCommandOutput,
  type GetQueueAttributesCommandOutput,
  type Message,
  type ReceiveMessageCommandOutput,
} from "@aws-sdk/client-sqs";
import type { Logger } from "@athyper/server-foundation/observability";

type SqsCommand =
  ReceiveMessageCommand | DeleteMessageCommand | GetQueueAttributesCommand;
type SqsOutput =
  | ReceiveMessageCommandOutput
  | DeleteMessageCommandOutput
  | GetQueueAttributesCommandOutput;

export interface SesEventSqsClient {
  send(
    command: SqsCommand,
    options?: { readonly abortSignal?: AbortSignal },
  ): Promise<SqsOutput>;
  destroy?(): void;
}

export type SesEventMessageDisposition =
  | { readonly outcome: "acknowledge" }
  | { readonly outcome: "retry"; readonly reasonCode: string }
  | { readonly outcome: "permanent_failure"; readonly reasonCode: string };

/** Application boundary. Bodies must be treated as untrusted provider input. */
export interface SesEventMessageHandler {
  process(body: string): Promise<SesEventMessageDisposition>;
}

export interface SesEventSqsAdapterConfig {
  readonly region: string;
  readonly queueUrl: string;
  readonly waitTimeSeconds?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly maxMessages?: number;
  readonly failureBackoffMs?: number;
  readonly logger?: Pick<Logger, "info" | "warn" | "error">;
}

export interface SesEventSqsAdapterDependencies {
  createClient(config: { readonly region: string }): SesEventSqsClient;
}

export interface SesEventSqsPollResult {
  readonly received: number;
  readonly acknowledged: number;
  readonly retrying: number;
  readonly permanentFailures: number;
}

export interface SesEventSqsAdapter {
  pollOnce(signal?: AbortSignal): Promise<SesEventSqsPollResult>;
  run(signal?: AbortSignal): Promise<void>;
  health(signal?: AbortSignal): Promise<{
    readonly status: "healthy" | "unhealthy";
    readonly latencyMs: number;
    readonly message?: string;
  }>;
  close(): void;
}

const DEFAULT_DEPENDENCIES: SesEventSqsAdapterDependencies = {
  createClient: ({ region }) => new SQSClient({ region }) as SesEventSqsClient,
};

/**
 * Long-polling SES event consumer. Messages are deleted only after the handler
 * acknowledges them. Retryable and permanent poison messages remain visible to
 * the queue redrive policy and eventually reach the configured DLQ.
 */
export function createSesEventSqsAdapter(
  config: SesEventSqsAdapterConfig,
  handler: SesEventMessageHandler,
  dependencies: SesEventSqsAdapterDependencies = DEFAULT_DEPENDENCIES,
): SesEventSqsAdapter {
  const region = required(config.region, "SQS region");
  const queueUrl = queue(config.queueUrl);
  const waitTimeSeconds = integer(
    config.waitTimeSeconds ?? 20,
    "SQS wait time",
    0,
    20,
  );
  const visibilityTimeoutSeconds = integer(
    config.visibilityTimeoutSeconds ?? 60,
    "SQS visibility timeout",
    1,
    43_200,
  );
  const maxMessages = integer(
    config.maxMessages ?? 10,
    "SQS maximum messages",
    1,
    10,
  );
  const failureBackoffMs = integer(
    config.failureBackoffMs ?? 1_000,
    "SQS failure backoff",
    1,
    60_000,
  );
  const client = dependencies.createClient({ region });
  const shutdown = new AbortController();
  let closed = false;
  let running = false;

  async function pollOnce(
    signal?: AbortSignal,
  ): Promise<SesEventSqsPollResult> {
    if (closed) throw new Error("SES event SQS adapter is closed");
    const operationSignal = combinedSignal(signal, shutdown.signal);
    const response = (await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: visibilityTimeoutSeconds,
        MaxNumberOfMessages: maxMessages,
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      }),
      { abortSignal: operationSignal },
    )) as ReceiveMessageCommandOutput;
    const totals = {
      received: 0,
      acknowledged: 0,
      retrying: 0,
      permanentFailures: 0,
    };
    const messages = response.Messages ?? [];
    totals.received = messages.length;
    // Start every item in the bounded SQS batch immediately so later messages do
    // not consume their visibility window while waiting behind earlier work.
    await Promise.all(
      messages.map(async (message) => {
        if (operationSignal.aborted) return;
        const disposition = await processMessage(message);
        if (disposition.outcome === "acknowledge") {
          await deleteMessage(message, operationSignal);
          totals.acknowledged += 1;
        } else if (disposition.outcome === "retry") {
          totals.retrying += 1;
        } else {
          totals.permanentFailures += 1;
        }
      }),
    );
    return totals;
  }

  async function processMessage(
    message: Message,
  ): Promise<SesEventMessageDisposition> {
    const fields = messageFields(message);
    if (!message.Body?.trim() || !message.ReceiptHandle?.trim()) {
      config.logger?.warn("communications.ses_sqs.permanent_failure", {
        ...fields,
        reasonCode: "invalid_sqs_message",
      });
      return {
        outcome: "permanent_failure",
        reasonCode: "invalid_sqs_message",
      };
    }
    try {
      const disposition = await handler.process(message.Body);
      if (disposition.outcome !== "acknowledge") {
        config.logger?.warn(`communications.ses_sqs.${disposition.outcome}`, {
          ...fields,
          reasonCode: safeReason(disposition.reasonCode),
        });
      }
      return disposition;
    } catch {
      // Repository/network failures are transient. Error details and message bodies
      // are deliberately excluded from logs because provider payloads contain PII.
      config.logger?.warn("communications.ses_sqs.retry", {
        ...fields,
        reasonCode: "handler_failure",
      });
      return { outcome: "retry", reasonCode: "handler_failure" };
    }
  }

  async function deleteMessage(
    message: Message,
    signal: AbortSignal,
  ): Promise<void> {
    const receiptHandle = message.ReceiptHandle?.trim();
    if (!receiptHandle) return;
    await client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
      { abortSignal: signal },
    );
  }

  return {
    pollOnce,
    async run(signal) {
      if (closed) throw new Error("SES event SQS adapter is closed");
      if (running) throw new Error("SES event SQS adapter is already running");
      running = true;
      const runSignal = combinedSignal(signal, shutdown.signal);
      config.logger?.info("communications.ses_sqs.started");
      try {
        while (!runSignal.aborted) {
          try {
            await pollOnce(runSignal);
          } catch {
            if (runSignal.aborted) break;
            config.logger?.error("communications.ses_sqs.poll_failed", {
              reasonCode: "sqs_operation_failure",
            });
            await abortableDelay(failureBackoffMs, runSignal);
          }
        }
      } finally {
        running = false;
        config.logger?.info("communications.ses_sqs.stopped");
      }
    },
    async health(signal) {
      const startedAt = Date.now();
      if (closed)
        return {
          status: "unhealthy",
          latencyMs: 0,
          message: "SES event SQS adapter is closed",
        };
      try {
        await client.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: ["QueueArn"],
          }),
          {
            abortSignal: combinedSignal(signal, shutdown.signal),
          },
        );
        return { status: "healthy", latencyMs: Date.now() - startedAt };
      } catch {
        return {
          status: "unhealthy",
          latencyMs: Date.now() - startedAt,
          message: "Amazon SQS queue verification failed",
        };
      }
    },
    close() {
      if (closed) return;
      closed = true;
      shutdown.abort(new Error("SES event SQS adapter closed"));
      client.destroy?.();
    },
  };
}

function messageFields(message: Message): Readonly<Record<string, unknown>> {
  const id = message.MessageId?.trim();
  const receiveCount = message.Attributes?.["ApproximateReceiveCount"];
  return {
    ...(id
      ? {
          messageRef: createHash("sha256")
            .update(id)
            .digest("hex")
            .slice(0, 16),
        }
      : {}),
    ...(receiveCount ? { receiveCount } : {}),
  };
}
function combinedSignal(
  first?: AbortSignal,
  second?: AbortSignal,
): AbortSignal {
  const signals = [first, second].filter(
    (value): value is AbortSignal => value !== undefined,
  );
  return signals.length === 1 ? signals[0]! : AbortSignal.any(signals);
}
function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
function required(value: string, name: string) {
  const result = value.trim();
  if (!result) throw new TypeError(`${name} is required`);
  return result;
}
function queue(value: string) {
  const result = required(value, "SQS queue URL");
  try {
    const url = new URL(result);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    throw new TypeError("SQS queue URL must be HTTPS");
  }
  return result;
}
function integer(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new TypeError(
      `${name} must be an integer from ${minimum} to ${maximum}`,
    );
  return value;
}
function safeReason(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "_")
      .slice(0, 80) || "unspecified"
  );
}
