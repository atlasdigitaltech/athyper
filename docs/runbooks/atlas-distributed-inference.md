# Atlas shared inference admission and retrieval cancellation

Generation and semantic embedding now use Redis admission across API and worker
processes. Retrieval disconnects reach the embedding AbortSignal through the Neon
relay, attachment-knowledge route and document-grounding selection path.

The deployment and machine-readable qualification receipts live in
`docs/examples/atlas-f6/distributed-inference-*.json`,
`distributed-admission-qualification.json`, `cross-process-inference-qualification.json`
and `retrieval-http-disconnect-qualification.json`. A failed or missing live HTTP
receipt must not be described as a completed authenticated disconnect qualification.

## Current evidence

- API and worker run the qualified image `sha256:aa9cff97b6a3cdda67dcc3481ae1b61cd8a343e84b57740758be331ada4b75db`.
- Four independent processes passed the shared Redis admission checks.
- Six live generation/embedding requests across API and worker containers completed with no overlapping admitted inference.
- 416 tests passed, one existing test remains skipped, and the three affected packages typechecked.
- The authenticated browser assessment passed with elevated DEV Cirrus `catl.admin`: disconnect cancelled queued embedding before dispatch and aborted an admitted cold embedding request. Both cancellations left no shared owner or waiter, and authorized retrieval succeeded afterward.

The [current status](../examples/atlas-f6/distributed-inference-status.json) checks
live image and compiled module hashes. The distributed inference reliability
qualification is **qualified**, with no remaining blockers; the authenticated
disconnect receipt and deployment bindings passed together.
Earlier worker DNS failure and cold-load queue timeout receipts are retained as
`cross-process-inference-qualification-first.json` and
`cross-process-inference-qualification-cold-queue-timeout.json` respectively.

## Resource ownership

`RedisInferenceAdmission` uses the deployment Redis client and one resource key,
`atlas:inference:shared:v1`. The deployment's Redis key prefix, if configured, must
be identical for every client of the same inference service. Tenant and plane do
not partition GPU capacity. Both API and worker must have the inference network
connection; rollout persists that connection in Compose.

One non-expiring Redis hash contains the initialization epoch, current owner,
heartbeat, sequence and waiter entries. Lua scripts atomically grant one owner
and at most eight FIFO waiters. Waiters have a five-second deadline. The owner
heartbeats every second; a heartbeat older than five seconds causes new admissions
to fail with `inference_admission_abandoned`. An owner exceeding the 130-second
safety bound is told to abort. Normal generation still has its 120-second bound.

There is no automatic takeover of an expired owner. This avoids granting capacity
while a paused or disconnected process may still be using the inference engine.
Redis unavailability, state eviction/deletion, and ownership mismatch fail closed.
A lost-owner callback aborts the generation or embedding fetch. Token-checked
release cannot delete another owner's lock. Queue release is awaited after stream
or embedding cleanup.

The existing in-memory queue remains a test implementation. Platform composition
configures the Redis queue before constructing local generation and semantic
services; missing Redis does not select an in-memory production fallback. New
inference integrations must use this configured admission service. Direct operator
calls to Ollama do not acquire it and belong in a quiescent assessment window.

## Cancellation

The retrieval route listens for request abortion and premature response closure,
then aborts its controller and removes its listeners. It passes that signal to
`createAtlasAttachmentKnowledge.execute`, semantic search/index and the native
embedding request. Closed responses are not written. Document-grounded chat passes
its existing run cancellation signal through document selection to the same path.

Queued cancellation removes the shared waiter; active cancellation aborts the
embedding request and releases admission after cleanup. A failed Redis cleanup
keeps the resource unavailable and emits a release failure rather than pretending
that ownership was cleared. Model artifact, parent-record and attachment-read
checks remain mandatory.

## Verified failure mechanism and historical attribution

The old adapter's controlled reproduction uses the exact retained pre-reliability
API image and live pinned models. It observes:

1. Generation warmup completes with `qwen3:8b` resident.
2. An independent embedding request loads `nomic-embed-text:v1.5` and evicts it.
3. The next generation readiness snapshot contains only the embedding model.
4. The old adapter returns `model_unavailable` / `gpu_offload_required`, with no
   chat dispatch.

The corrected reproduction starts embedding at the same point. Redis holds it
outside admission until generation completes. Generation remains resident at its
readiness check and completes successfully; embedding then runs.

See `inference-eviction-historical.json` and `inference-eviction-corrected.json`.
These are controlled causal experiments, not a replay of the original production
request. The original run `56bbdd06-5036-4410-a3c2-789138f55167` persisted neither a
precise error code nor a readiness snapshot. Its exact historical cause is
therefore **indeterminate from retained telemetry**. The investigation is complete
at that evidence limit; the reproducible eviction defect is confirmed and fixed.
No historical approval, diagnostic or causal attribution has been fabricated.

## Qualification

```sh
pnpm --filter @athyper/server-adapter-ai-ollama test
pnpm --filter @athyper/server-platform-ai test
pnpm --filter @athyper/server-platform-host exec vitest run \
  src/composition/__tests__/atlas-retrieval-disconnect.test.ts \
  src/composition/__tests__/atlas-attachment-knowledge.test.ts \
  src/composition/__tests__/atlas-document-grounding.test.ts \
  src/composition/__tests__/atlas-semantic-index.test.ts
node tooling/scripts/verification/deploy-atlas-inference-reliability.cjs # build only
node tooling/scripts/verification/qualify-atlas-distributed-admission.mjs
node tooling/scripts/verification/rollout-atlas-distributed-inference.mjs
node tooling/scripts/verification/qualify-atlas-cross-process-inference.mjs
node tooling/scripts/verification/qualify-atlas-http-disconnect.mjs
node tooling/scripts/verification/verify-atlas-distributed-inference.mjs
```

The Redis assessment uses an isolated key and four independent Node processes. It
covers missing state, FIFO exclusion, global waiter saturation, queue timeout,
cancellation, stale-owner quarantine, lost ownership and Redis failure. It deletes
only its own qualification key. The live model assessment uses separate processes
in API and worker containers, real generation and embeddings, and stubbed search
storage. It qualifies mutual exclusion and bounded overload, not zero-failure
availability. Cold loading can exceed the five-second waiter deadline; such
rejections remain in the receipts.

The HTTP assessment requires elevated DEV Cirrus `catl.admin`. It waits until a
real request enters the Redis waiter set before disconnecting the browser, then
repeats with a cold embedding already admitted. It verifies cancellation logs,
empty ownership/waiter state and successful authorized retrieval afterward.

## Rollout and recovery

The build transplants the changed modules onto the current API image. The deployed
`register-services.js` receives a narrow admission import/configuration patch;
unrelated, undeployed repository composition changes are not pulled into the
image. API and worker use the same qualified image. The coordinated rollout merges
their actual deployment configurations, preserves private rollback files, stops
both clients, quiesces inference, runs the old/new reproduction and initializes
the resource epoch before starting the new clients. A failure restores the prior
API/worker images.

If a process crashes while holding admission:

1. Treat `inference_admission_abandoned` as a quarantined resource. Do not delete
   a lock while other callers remain active.
2. Stop **every** API, worker and other admitted client using this inference
   resource, including replicas on other hosts. Confirm their shutdown.
3. Restart the inference service to terminate any remaining backend work.
4. With clients still stopped, inspect the Redis resource state using the approved
   operator connection. Record the old epoch and ownership fingerprint in the
   incident evidence. Clear the abandoned owner/heartbeat/start fields and stale
   waiter fields; preserve or deliberately reinitialize the epoch. A missing hash
   must be explicitly initialized after the same quiescence procedure.
5. Restart the configured clients; verify healthy bindings, one admitted operation,
   and a successful pinned-model request before admitting normal traffic.

State cleanup is an operator recovery action, not an automatic TTL expiry or an
application retry. If all clients cannot be proven stopped, keep admission closed.
Redis persistence and access must be operated as coordination infrastructure, not
an expendable performance cache. Initialization must not be put into ordinary
application startup, because doing so would defeat fail-closed state-loss handling.

F6 was subsequently requalified on this deployment: all ten gates passed. See
[the current F6 closure](../architecture/business-partner/evidence/atlas-f6-phase-closure-distributed-20260910.json).
The prior closure remains preserved against its historical image; the new record
binds refreshed pilot evidence and retains the documented failure receipts.
