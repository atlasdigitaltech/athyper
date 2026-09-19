// Runs in an isolated container. Only a unique qualification Redis key is modified.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRedisCacheAdapter } from "/app/server/node_modules/@athyper/server-adapter-cache-redis/dist/index.js";
import { RedisInferenceAdmission } from "/app/server/dist/composition/atlas-inference-admission.js";
const url =
  "redis://:" +
  encodeURIComponent(
    readFileSync("/run/secrets/redis-password", "utf8").trim(),
  ) +
  "@memorycache:6379";
const cache = createRedisCacheAdapter({ url });
await cache.connect();
const key = "atlas:inference:qualification:" + randomUUID(),
  q = new RedisInferenceAdmission(cache.client, key),
  checks = [];
const initialize = () => cache.client.hset(key, "epoch", randomUUID());
try {
  await assert.rejects(
    q.acquire(new AbortController().signal),
    /inference_admission_uninitialized/,
  );
  checks.push("missing coordination state fails closed");
  await initialize();
  const source = `import{readFileSync}from'node:fs';import{createRedisCacheAdapter}from'/app/server/node_modules/@athyper/server-adapter-cache-redis/dist/index.js';import{RedisInferenceAdmission}from'/app/server/dist/composition/atlas-inference-admission.js';const cache=createRedisCacheAdapter({url:'redis://:'+encodeURIComponent(readFileSync('/run/secrets/redis-password','utf8').trim())+'@memorycache:6379'});await cache.connect();const q=new RedisInferenceAdmission(cache.client,process.argv[1]);try{const release=await q.acquire(new AbortController().signal,e=>{throw e});process.send({kind:'acquired',at:Date.now(),pid:process.pid});await new Promise(r=>setTimeout(r,150));process.send({kind:'work-finished',at:Date.now(),pid:process.pid});await release();}finally{await cache.close();process.disconnect();}`;
  const intervals = [];
  await Promise.all(
    Array.from(
      { length: 4 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ["--input-type=module", "-e", source, key],
            { stdio: ["ignore", "ignore", "pipe", "ipc"] },
          );
          const row = {};
          child.on("message", (m) => {
            row.pid = m.pid;
            row[m.kind] = m.at;
          });
          child.on("exit", (code) => {
            if (code === 0) {
              intervals.push(row);
              resolve();
            } else reject(Error("Child qualification failed"));
          });
        }),
    ),
  );
  intervals.sort((a, b) => a.acquired - b.acquired);
  assert.equal(new Set(intervals.map((r) => r.pid)).size, 4);
  for (let i = 1; i < intervals.length; i++)
    assert.ok(intervals[i].acquired >= intervals[i - 1]["work-finished"]);
  checks.push("four independent processes share one inference slot");
  let release = await q.acquire(new AbortController().signal);
  const c = new AbortController();
  const pending = q.acquire(c.signal);
  await new Promise((r) => setTimeout(r, 75));
  c.abort();
  await assert.rejects(pending);
  await release();
  assert.ok(!(await cache.client.hkeys(key)).some((k) => k.startsWith("w:")));
  checks.push("cancelled waiter removed");
  release = await q.acquire(new AbortController().signal);
  const waiters = Array.from({ length: 8 }, () =>
    q.acquire(new AbortController().signal).then(
      () => {
        throw Error("Unexpected grant");
      },
      (e) => e.code,
    ),
  );
  await new Promise((r) => setTimeout(r, 100));
  await assert.rejects(
    q.acquire(new AbortController().signal),
    /local_queue_full/,
  );
  assert.ok(
    (await Promise.all(waiters)).every(
      (code) => code === "local_queue_timeout",
    ),
  );
  await release();
  checks.push("global eight-waiter limit and five-second deadline");
  release = await q.acquire(new AbortController().signal);
  await cache.client.hset(key, "heartbeat", "1");
  await assert.rejects(
    q.acquire(new AbortController().signal),
    /inference_admission_abandoned/,
  );
  assert.ok(await cache.client.hget(key, "owner"));
  await release();
  checks.push("stale owner is quarantined, never stolen");
  let lost;
  const lostSignal = new Promise((r) => (lost = r));
  release = await q.acquire(new AbortController().signal, (e) => lost(e.code));
  await cache.client.hset(key, "owner", "replacement");
  assert.equal(await lostSignal, "inference_admission_lost");
  await release();
  assert.equal(await cache.client.hget(key, "owner"), "replacement");
  await cache.client.hdel(key, "owner", "heartbeat", "started");
  checks.push(
    "lost ownership aborts holder and token release cannot delete successor",
  );
  const unavailable = new RedisInferenceAdmission({
    eval: async () => {
      throw Error("private connection detail");
    },
  });
  await assert.rejects(
    unavailable.acquire(new AbortController().signal),
    (e) =>
      e.code === "inference_admission_unavailable" &&
      !e.message.includes("private"),
  );
  checks.push(
    "Redis outage fails closed without credential/error-text disclosure",
  );
  release = await q.acquire(new AbortController().signal);
  await release();
  checks.push("queue recovers after cancellation and saturation");
  console.log(
    JSON.stringify({
      observedAt: new Date().toISOString(),
      passed: true,
      checks,
      processes: intervals.length,
    }),
  );
} finally {
  await cache.client.del(key);
  await cache.close();
}
