import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpClient } from "@athyper/platform-api-client";
import { requestThumbnail, forgetThumbnail } from "../../packages/platform/entity/runtime/form-detail/src/thumbnail-requests";
import { requestDetail } from "../../packages/platform/entity/runtime/form-detail/src/detail-requests";

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
test("ready thumbnails survive remounts only within their record/security scope and signed lifetime", async () => {
  let calls = 0;
  let now = Date.now();
  const clock = Date.now;
  Date.now = () => now;
  try {
    const client = {request: async () => { calls++; return {state:"ready",url:"https://objects.test/preview",expiresAt:new Date(now + 120000).toISOString()}; }} as unknown as HttpClient;
    const signal = new AbortController().signal;
    await requestThumbnail(client,"principal-a/record-a/revision-a","file-a",signal);
    await requestThumbnail(client,"principal-a/record-a/revision-a","file-a",signal);
    assert.equal(calls,1);
    for (const scope of ["principal-b/record-a/revision-a","principal-a/record-b/revision-a","principal-a/record-a/revision-b"]) await requestThumbnail(client,scope,"file-a",signal);
    assert.equal(calls,4);
    now += 116000;
    await requestThumbnail(client,"principal-a/record-a/revision-a","file-a",signal);
    assert.equal(calls,5);
    forgetThumbnail(client,"principal-a/record-a/revision-a","file-a");
    await requestThumbnail(client,"principal-a/record-a/revision-a","file-a",signal);
    assert.equal(calls,6);
  } finally { Date.now = clock; }
});
function fixture() {
  const calls: { signal: AbortSignal; resolve(value: unknown): void }[] = [];
  const client = { request: async (_operation: unknown, input: { signal: AbortSignal }) =>
    new Promise((resolve, reject) => {
      calls.push({ signal: input.signal, resolve });
      input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true });
    }) } as unknown as HttpClient;
  return { client, calls };
}

test("thumbnail requests share matching scope, preserve other consumers and bound concurrency", async () => {
  const f = fixture(), a = new AbortController(), b = new AbortController();
  const first = requestThumbnail(f.client, "scope", "a", a.signal);
  const rejected = assert.rejects(first);
  const shared = requestThumbnail(f.client, "scope", "a", b.signal);
  const rest = ["b", "c", "d"].map(id => requestThumbnail(f.client, "scope", id, b.signal));
  await tick();
  assert.equal(f.calls.length, 3);
  a.abort();
  await rejected;
  assert.equal(f.calls[0].signal.aborted, false);
  f.calls[0].resolve({ state: "ready" });
  await shared;
  await tick();
  assert.equal(f.calls.length, 4);
  for (const call of f.calls.slice(1)) call.resolve({ state: "ready" });
  await Promise.all(rest);
});

test("queued thumbnails are removed on cancellation; different identities never share", async () => {
  const f = fixture(), running = new AbortController(), queued = new AbortController();
  const jobs = ["a", "b", "c"].map(id => requestThumbnail(f.client, "scope", id, running.signal));
  const pending = requestThumbnail(f.client, "other", "a", queued.signal);
  const rejected = assert.rejects(pending);
  await tick();
  assert.equal(f.calls.length, 3);
  queued.abort();
  await rejected;
  await tick();
  f.calls.forEach(call => call.resolve({ state: "ready" }));
  await Promise.all(jobs);
  await tick();
  assert.equal(f.calls.length, 3);
});

test("detail consumers share only the same context and cancel abandoned transport", async () => {
  const f = fixture(), a = new AbortController(), b = new AbortController();
  const first = requestDetail(f.client, "scope-a", "country", "record", a.signal);
  const rejected = assert.rejects(first);
  const shared = requestDetail(f.client, "scope-a", "country", "record", b.signal);
  assert.equal(f.calls.length, 1);
  a.abort();
  await rejected;
  assert.equal(f.calls[0].signal.aborted, false);
  f.calls.forEach(call => call.resolve({}));
  await shared;
  const next = requestDetail(f.client, "scope-b", "country", "record", b.signal);
  const abandoned = assert.rejects(next);
  assert.equal(f.calls.length, 2);
  b.abort();
  await abandoned;
  await tick();
  assert.equal(f.calls[1].signal.aborted, true);
});
