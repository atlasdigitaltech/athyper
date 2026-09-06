import { randomUUID } from "node:crypto";
import { RedisConnection } from "bullmq";
import { createBullMqConnectionOptions } from "./bullmq-connection.js";

export type CancellationHandler = (queue: string, jobId: string, attempt: number) => Promise<boolean>;
export interface JobCancellationTransport {
  listen(handler: CancellationHandler): Promise<void>;
  request(queue: string, jobId: string, attempt: number): Promise<boolean>;
  close(): Promise<void>;
}

export interface CancellationRedisClient {
  subscribe(channel: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
  off(event: "message", listener: (channel: string, message: string) => void): unknown;
}
interface CancellationConnection {
  readonly client: Promise<unknown>;
  close(): Promise<void>;
}

/** Acknowledgements mean the owning worker has recorded cancellation, not just received it. */
export function createRedisJobCancellationTransport(redisUrl: string, options: {
  readonly timeoutMs?: number;
  readonly createConnection?: () => CancellationConnection;
} = {}): JobCancellationTransport {
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("Cancellation timeout must be a positive integer");
  const connection = createBullMqConnectionOptions(redisUrl);
  // Redis Pub/Sub spans databases, so isolate the channel by the BullMQ database.
  const channel = `athyper:jobs:${connection.db ?? 0}:cancel`;
  const replies = `${channel}:reply:${randomUUID()}`;
  const createConnection = options.createConnection ?? (() => new RedisConnection(connection, { shared: false }));
  let publisher: CancellationConnection | undefined;
  let subscriber: CancellationConnection | undefined;
  let ready: Promise<void> | undefined;
  let handler: CancellationHandler | undefined;
  let closed = false;
  const pending = new Map<string, (accepted: boolean) => void>();
  const onMessage = (incoming: string, raw: string) => {
    let value: Record<string, unknown>;
    try { value = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    if (!value || typeof value !== "object") return;
    if (incoming === replies && typeof value["id"] === "string" && value["accepted"] === true) {
      pending.get(value["id"])?.(true);
    } else if (incoming === channel && handler && typeof value["id"] === "string"
      && typeof value["queue"] === "string" && typeof value["jobId"] === "string"
      && typeof value["attempt"] === "number" && Number.isInteger(value["attempt"])
      && typeof value["deadline"] === "number" && value["deadline"] > Date.now()
      && typeof value["reply"] === "string" && value["reply"].startsWith(`${channel}:reply:`)) {
      const { id, reply } = value;
      // Non-owning workers remain silent. Only a confirmed cancellation can acknowledge.
      void handler(value["queue"], value["jobId"], value["attempt"]).then(async (accepted) => {
        if (accepted && !closed) await (await publisher!.client as CancellationRedisClient).publish(reply as string, JSON.stringify({ id, accepted }));
      }).catch(() => { /* No acknowledgement: the API returns a conflict on timeout. */ });
    }
  };
  const initialize = () => {
    if (closed) return Promise.reject(new Error("Cancellation transport is closed"));
    if (!ready) {
      publisher = createConnection();
      subscriber = createConnection();
      ready = (async () => {
        const client = await subscriber!.client as CancellationRedisClient;
        client.on("message", onMessage);
        await client.subscribe(replies);
      })();
    }
    return ready;
  };
  return {
    async listen(value) {
      await initialize();
      handler = value;
      await (await subscriber!.client as CancellationRedisClient).subscribe(channel);
    },
    async request(queue, jobId, attempt) {
      await initialize();
      const id = randomUUID();
      const deadline = Date.now() + timeoutMs;
      return new Promise<boolean>((resolve, reject) => {
        const finish = (accepted: boolean) => { clearTimeout(timer); pending.delete(id); resolve(accepted); };
        const timer = setTimeout(() => finish(false), timeoutMs);
        pending.set(id, finish);
        void publisher!.client.then((client) => {
          if (!pending.has(id) || closed || Date.now() >= deadline) return;
          return (client as CancellationRedisClient).publish(channel,
            JSON.stringify({ id, queue, jobId, attempt, reply: replies, deadline }),
          );
        }).catch((error: unknown) => { clearTimeout(timer); pending.delete(id); reject(error); });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const finish of pending.values()) finish(false);
      if (subscriber) {
        const client = await subscriber.client as CancellationRedisClient;
        client.off("message", onMessage);
      }
      await Promise.all([subscriber?.close(), publisher?.close()]);
    },
  };
}
