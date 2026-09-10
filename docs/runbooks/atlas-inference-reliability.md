# Atlas local inference reliability

**Historical first reliability build.** The subsequent [shared admission and
HTTP cancellation build](atlas-distributed-inference.md) supersedes the process-local
admission and disconnect limits below. Its receipts separately record current qualification.

The DEV reliability build coordinates generation and embeddings in the single
API process. It adds content-free readiness diagnostics, bounded loading recovery,
and authorization checks after queue admission and before prompt dispatch.

The original F6 failure remains historical evidence in
[model-neon-first-elevated-attempt.json](../examples/atlas-f6/model-neon-first-elevated-attempt.json).
Its exact readiness predicate cannot be recovered from the old broad
`model_unavailable` classification. Alternating generation and embedding model
loads were observed, but this does not prove the cause of that request. Do not
rewrite that receipt or present the later successful request as an automatic retry.

## Qualified DEV result (2026-09-10)

The [qualification status](../examples/atlas-f6/inference-reliability-status.json)
passes for API image
`sha256:b604218602a65433c330bf2c0fe2dc2197227d4625846281f5737372d8de361a`.
All three live receipts use that same healthy deployment binding.

| Evidence                  | Result                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and type checks      | 393 tests passed, one existing skip; all three affected packages typechecked.                                                                                                                                     |
| Proposed pilot workload   | 17 requests completed, zero failures, including eight simultaneous chat/embedding requests at two callers.                                                                                                        |
| Latency                   | Unloaded-model cold start: 3,063 ms. Six warm requests: p95 75 ms. Two-caller mixed workload: p95 5,083 ms.                                                                                                       |
| Overload characterization | Four callers: seven of eight requests completed; one embedding request reached the five-second queue deadline. Deliberate saturation recorded two immediate full-queue rejections and eight timeouts.             |
| Cancellation / recovery   | Two queued requests and one active generation cancelled. Subsequent requests after saturation and cancellation completed.                                                                                         |
| Model loading             | Seven generation requests needed a warmup; all completed. No live failed generation required or demonstrated an automatic retry; repeated missing-residency recovery is covered by injected adapter tests.        |
| Memory                    | Sampled device peak 7,599 MiB of 12,282 MiB. Model-resident VRAM peak 5,578,204,118 bytes.                                                                                                                        |
| Authenticated application | Elevated Neon `catl.admin`: four correct synthetic chat answers, three authorized retrievals, and four replays with one provider entry each. API diagnostics measured one admitted inference operation at a time. |
| Grounded browser          | Current synthetic document facts and citation rendered, and authorized history retained the answer and source.                                                                                                    |

The initial application harness's rejected retrieval request is retained in
[inference-reliability-application-first.json](../examples/atlas-f6/inference-reliability-application-first.json).
It supplied an idempotency header to a route that forbids it; this was a harness
error, not a model failure. The corrected assessment awaits every concurrent
request before saving its result. Earlier deployment measurements remain in the
`*-first.json` receipts and are not substituted for final-image evidence.

## Implemented bounds

| Control          | Behavior                                                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared admission | One active inference lease, eight waiters, five-second queue deadline. Generation holds the lease through readiness, chat and stream completion; embeddings hold it through pin verification and embedding response validation. Search storage does not hold the lease. |
| Readiness        | Thirty-second readiness deadline, 100 ms polling, at most two prompt-free warmups. The second warmup requires a fresh authorization callback and confirmed absence from `/api/ps`.                                                                                      |
| Full invocation  | Generation has a 120-second deadline; embedding inference has a 60-second deadline, including queue wait. Authorization checks are interruptible by the generation deadline/cancellation.                                                                               |
| Strict policy    | Engine version, registry digest, loaded digest, context length and full GPU residency remain mandatory. No CPU or cloud fallback.                                                                                                                                       |
| Retry            | Only prompt-free loading is repeated after a successful warmup still leaves the model absent. HTTP errors, uncertain warmup outcomes, chat, partial streams and business actions are not retried.                                                                       |
| Authorization    | Recheck live plane admission, its revision, model policy and prompt revision, active thread access, and durable input lineage. Fail closed on unavailable authorization. Existing owner/tool checks and final document disclosure checks remain in force.               |
| Overload         | `local_queue_full` rejects immediately; `local_queue_timeout` rejects after five seconds. Neither failure dispatches a prompt. Cancellation removes waiters and releases the active lease.                                                                              |

The shared queue is a module singleton, not a distributed lock. This is qualified
only for the current single API process. Additional API replicas, workers that
invoke inference, and external clients need a shared admission service or separate
inference capacity before they are included in a supported workload. The queue is
not a security boundary; model access must remain on the private service network.

The cancellation checks exercise the adapter's supplied AbortSignal, including
queued embedding cancellation and an active generation. The existing retrieval
HTTP route does not yet forward a client disconnect into the semantic index's
optional signal; such embedding work remains bounded by its 60-second deadline.
Do not claim end-to-end HTTP retrieval cancellation from these receipts.

## Diagnostics and response actions

`atlas.inference.diagnostic` structured logs contain workload, phase, model pin,
queue wait, load time, elapsed time and attempt number. Generation includes run and
provider-call IDs; embeddings have a generated operation ID. They do not include
prompts, responses, document text, credentials or authorization service messages.
Generation load time is measured wall-clock warmup time, including failed warmups.
Embedding load time is the backend-reported duration, or `null` when unavailable.
A readiness attempt counts a status check; `warmup_started` counts actual load calls.

Generation failures also persist `errorCode` and `readinessDiagnostics` in the
existing `ai.atlas_provider_usage.entry` JSON. No schema migration is required.
Provider call count still means generation invocation count; warmup attempts are
separate structured log events and never count as repeated business actions.

| Error / condition                                                                                      | Action                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model_not_resident`                                                                                   | Temporary readiness observation. Allow bounded prompt-free loading; inspect subsequent `ready` or terminal failure.                                                                     |
| `readiness_deadline_exceeded`                                                                          | Loading/status checks did not establish readiness within 30 seconds. Inspect load duration and inference/GPU health. Do not extend the deadline or change pins merely to obtain a pass. |
| `engine_version_mismatch`, `model_not_installed`, `registry_digest_mismatch`, `loaded_digest_mismatch` | Reconcile the deployment with the approved artifact. No automatic recovery or fallback.                                                                                                 |
| `context_length_mismatch`, `model_size_invalid`, `gpu_residency_insufficient`                          | Resolve actual runner context or memory/capacity mismatch. Full GPU residency remains required.                                                                                         |
| `warmup_http_*`, `ollama_http_*`                                                                       | Preserve exact HTTP status; investigate service overload or availability. The adapter does not retry an uncertain request.                                                              |
| `local_queue_full`, `local_queue_timeout`                                                              | Reduce offered load or allocate capacity. Preserve the rejection in failure-rate reporting. A later deliberate request needs a new request ID and current authorization.                |
| `authorization_changed`                                                                                | Obtain current permitted access through the normal workflow. Never retry using the old admission or bypass MFA.                                                                         |
| `stream_incomplete`, `ollama_stream_error`, `ollama_timeout`                                           | Keep the failed attempt and any usage evidence. Never replay a partial generation automatically.                                                                                        |

Use run/provider-call IDs to join API diagnostic logs and usage entries. Keep the
logs with the assessment retention policy; the aggregate ledger is not a complete
per-warmup event archive. The repository assessment receipts contain only synthetic
workload identifiers and the safe diagnostic fields above.

## Assessment and evidence

[Inference assessment](../examples/atlas-f6/inference-reliability-assessment.json)
executes deployed modules against the live pinned inference service in an
independent Node process inside the API container. It unloads only the two pinned
models for the cold-start scenario, then tests warm requests, mixed traffic,
queued/active cancellation, saturation and recovery. Meilisearch responses are
stubbed; no documents, permissions or business records are written. It is not an
authenticated application test, and its singleton does not coordinate with the
separate HTTP API process. Run it during a quiet DEV assessment window.

The proposed pilot load is two simultaneous callers, one generation and one
embedding request, with a short synthetic prompt and at most 32 generated tokens.
Four callers characterize overload; they are not a supported capacity claim.
All expected and unexpected failures remain in the receipt. Cold-load success is
reported separately from failed-request recovery; a successful first warmup is not
an automatically recovered failed chat request. A small sample does not establish
production availability or a latency SLO.

The harness samples model residency every 250 ms and whole-device GPU memory every
second. Whole-device usage includes other clients. HTTP inference concurrency is
measured through response completion, not inferred from queue configuration alone.
Image bindings and health must remain unchanged during collection.

[Application assessment](../examples/atlas-f6/inference-reliability-application.json)
uses elevated DEV Cirrus `catl.admin` through the actual Neon relay: synthetic
chat plus simultaneous authorized retrieval of the existing synthetic BP document.
Each generated run is replayed and checked for exactly one durable provider usage
entry. This requires a current elevated session; it never uses a service identity
in place of the persona.

```sh
pnpm --filter @athyper/server-adapter-ai-ollama test
pnpm --filter @athyper/server-platform-ai test
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/atlas-semantic-index.test.ts
node tooling/scripts/verification/deploy-atlas-inference-reliability.cjs # build + import preflight
node tooling/scripts/verification/deploy-atlas-inference-reliability.cjs --apply
node tooling/scripts/verification/assess-atlas-inference-reliability.mjs
node tooling/scripts/verification/qualify-atlas-inference-application.mjs
node tooling/scripts/verification/qualify-atlas-inference-grounded.mjs
node tooling/scripts/verification/verify-atlas-inference-reliability.mjs
```

The deployment helper preserves the current Compose configuration and creates a
private, dated rollback configuration, replacing only the API image. Its public
receipt records source hashes, base image and new digest. To roll back, use the
`rollback.json` in that receipt's `deploymentDirectory`:

```sh
docker compose -f "$atlasDeploymentDirectory/rollback.json" up -d --no-deps --pull never api
```

Set `atlasDeploymentDirectory` to the receipt's exact directory and verify the
current deployment binding before rollback. Never print or commit that private
configuration. After either rollout or rollback, wait for healthy status and
collect evidence against the resulting image; an old pass does not qualify a new
image. The historical [F6 closure](../architecture/business-partner/evidence/atlas-f6-phase-closure-20260910.json)
remains intact. [Current F6 status](../examples/atlas-f6/pilot-status.json) separately
reports any image-binding requalification required by this reliability deployment.
