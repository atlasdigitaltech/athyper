import { Queue, RedisConnection } from "bullmq";
import { createBullMqConnectionOptions } from "./bullmq-connection.js";
import {
  COMPLETED_JOB_RETENTION,
  FAILED_JOB_RETENTION,
} from "./job-retention.js";

export function assertDedicatedJobStore(
  jobsUrl: string,
  cacheUrl?: string,
): void {
  if (!cacheUrl) return;
  const jobs = new URL(jobsUrl),
    cache = new URL(cacheUrl);
  const port = (url: URL) =>
    url.port || (url.protocol === "rediss:" ? "6380" : "6379");
  if (jobs.hostname === cache.hostname && port(jobs) === port(cache)) {
    throw new Error(
      "Scheduler maintenance requires a dedicated Redis server for jobs; a different database number is not isolation",
    );
  }
}

export interface QueueMaintenanceTarget {
  clean(
    grace: number,
    limit: number,
    type: "completed" | "failed",
  ): Promise<string[]>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
}
/** Bounded cleanup touches finalized jobs only; durable execution records live in PostgreSQL. */
export async function maintainQueue(queue: QueueMaintenanceTarget) {
  await queue.clean(COMPLETED_JOB_RETENTION.age * 1000, 1000, "completed");
  await queue.clean(FAILED_JOB_RETENTION.age * 1000, 1000, "failed");
  return queue.getJobCounts(
    "wait",
    "active",
    "delayed",
    "failed",
    "paused",
    "prioritized",
  );
}

/** Discover idle queues too. This connection must point to application jobs, never a shared secret store. */
export function createQueueMaintenance(
  redisUrl: string,
  observe: (counts: Readonly<Record<string, number>>) => void,
) {
  const options = {
    ...createBullMqConnectionOptions(redisUrl),
    maxRetriesPerRequest: 1,
    commandTimeout: 5000,
  };
  const connection = new RedisConnection(options, { blocking: false });
  // Poll failures drive the stale-progress alert; prevent connection events
  // from becoming unhandled process exceptions during an outage.
  connection.on("error", () => undefined);
  const queues = new Map<string, Queue>();
  let cursor = "0";
  return {
    async run() {
      const client = await connection.client;
      const names = new Set<string>();
      // Limit discovery work per sweep; subsequent sweeps continue from this cursor.
      for (let batch = 0; batch < 20; batch++) {
        const page = await client.scan(cursor, {
          MATCH: "bull:*:meta",
          COUNT: 100,
        });
        cursor = page[0];
        for (const key of page[1]) {
          const name = key.slice(5, -5);
          if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name)) names.add(name);
        }
        if (cursor === "0") break;
      }
      for (const name of names)
        if (!queues.has(name)) {
          const queue = new Queue(name, { connection: options });
          queue.on("error", () => undefined);
          queues.set(name, queue);
        }
      const totals: Record<string, number> = {};
      for (const queue of queues.values()) {
        const counts = await maintainQueue(queue);
        for (const [state, count] of Object.entries(counts))
          totals[state] = (totals[state] ?? 0) + count;
      }
      observe(totals);
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      await connection.close();
    },
  };
}
