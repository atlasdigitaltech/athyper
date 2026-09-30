import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Run with all API/worker/scheduler/Infisical writers stopped. Copy-only: the
// original volume remains the rollback source. Never print credentials or keys.
if (process.env.ATHYPER_REDIS_WRITERS_STOPPED !== "1")
  throw new Error(
    "Stop all queue and secret-store writers before migration; set ATHYPER_REDIS_WRITERS_STOPPED=1 after verifying they are stopped",
  );
const require = createRequire(
  resolve("packages/platform/iam/session-store/package.json"),
);
const Redis = require("ioredis");
const password = readFileSync("/run/secrets/redis-password", "utf8");
const clients = ["memorycache", "jobqueue", "secretstore-cache"].map(
  (host) => new Redis({ host, password, maxRetriesPerRequest: 1 }),
);
const [source, jobs, secrets] = clients;
const applicationQueues = new Set(
  JSON.parse(readFileSync(process.argv[2], "utf8")),
);
if (!applicationQueues.size)
  throw new Error("An explicit application queue inventory is required");
const counts = { jobs: 0, secrets: 0, preserved: 0, expired: 0 };
try {
  let cursor = "0";
  do {
    const page = await source.scan(cursor, "COUNT", 200);
    cursor = page[0];
    for (const key of page[1]) {
      let destination;
      if (key.startsWith("bull:"))
        destination = applicationQueues.has(key.split(":")[1]) ? jobs : secrets;
      else if (key.startsWith("athyper:local:scheduling:")) destination = jobs;
      else if (!key.startsWith("athyper:") && !key.startsWith("invalidation:"))
        destination = secrets;
      if (!destination) {
        counts.preserved++;
        continue;
      }
      const started = Date.now();
      const result = await source.evalBuffer(
        "local d=redis.call('DUMP',KEYS[1]); if not d then return nil end; return {d,redis.call('PTTL',KEYS[1])}",
        1,
        key,
      );
      if (!result) {
        counts.expired++;
        continue;
      }
      const [dump, ttl] = result;
      const remaining =
        Number(ttl) < 0 ? 0 : Number(ttl) - (Date.now() - started);
      if (Number(ttl) >= 0 && remaining <= 0) {
        counts.expired++;
        continue;
      }
      // No REPLACE: an accidental rerun against an active destination fails closed.
      if (!(await destination.exists(key)))
        await destination.restore(key, remaining, dump);
      const restored = await destination.dumpBuffer(key);
      if (
        !restored?.equals(dump) &&
        (await fingerprint(source, key)) !==
          (await fingerprint(destination, key))
      )
        throw new Error("Redis migration verification failed");
      counts[destination === jobs ? "jobs" : "secrets"]++;
    }
  } while (cursor !== "0");
  console.log(
    JSON.stringify({ copiedAndVerified: counts, sourceDeleted: false }),
  );
} finally {
  await Promise.all(clients.map((client) => client.quit()));
}

async function fingerprint(client, key) {
  const type = await client.type(key);
  let value;
  switch (type) {
    case "string":
      value = await client.getBuffer(key);
      break;
    case "hash":
      value = Object.entries(await client.hgetallBuffer(key)).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      break;
    case "set":
      value = (await client.smembersBuffer(key)).sort(Buffer.compare);
      break;
    case "zset":
      value = await client.zrangeBuffer(key, 0, -1, "WITHSCORES");
      break;
    case "list":
      value = await client.lrangeBuffer(key, 0, -1);
      break;
    case "stream":
      value = await client.xrangeBuffer(key, "-", "+");
      break;
    default:
      throw new Error("Unsupported migration key type");
  }
  return JSON.stringify([type, value]);
}
