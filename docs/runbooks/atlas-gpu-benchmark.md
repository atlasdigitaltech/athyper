# Atlas independent GPU benchmark

Completed 2026-09-07. **The pinned configuration passes the proposed performance and recovery targets and is conditionally qualified for local integration development.** Shared application chat must remain gated on application queue admission and context budgeting: the native engine accepted excessive warm-model requests and silently truncated oversized input. No Atlas application generation or real tools were enabled by this benchmark.

## Measured acceptance

The primary run is `20260907T045941Z` (04:59:41–05:01:37 UTC). An earlier full run, `20260907T045708Z`, corroborates performance. There were **60 sequential warm short-chat requests across two runs**, with 30 in the primary run. Primary measurements below use that run only.

| Measure                        | Proposed target            | Measured                                                                                         | Result                 |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| Warm short-chat first token    | p95 ≤5 s                   | **0.068 s**, 30 requests                                                                         | Pass                   |
| Median output throughput       | ≥15 tokens/s               | **60.14 tokens/s**, 52 normal requests; short-chat median 60.24                                  | Pass                   |
| GPU operation                  | No CPU-only fallback       | **37/37 layers offloaded**, model allocation entirely in VRAM                                    | Pass                   |
| Memory failures                | Zero                       | **0 OOM events/kills**, no unexpected request failures                                           | Pass                   |
| Active cancellation            | Slot available within 5 s  | Successor first token **0.061–0.083 s** after dispatch immediately following abort, three trials | Pass                   |
| Existing application readiness | No reproducible regression | **432/432 HTTP 200** across eight DEV/QA endpoints; no other container restart or health change  | Pass in sampled window |

Peak total device VRAM was **7,642 MiB (7.46 GiB)** of 12,282 MiB, including Windows/other GPU use. Ollama reported **5,578,204,118 bytes (5.20 GiB)** allocated to the loaded model. Peak inference cgroup RAM was **2,778,419,200 bytes (2.59 GiB)** in the primary run. These are separate measurements; cgroup RAM includes charged cache and is not process RSS. The first run sampled up to 3.75 GiB RAM and 7,657 MiB total VRAM; its 4.78 GiB cgroup high-water reading included the pre-restart baseline. No memory failures occurred in either run. The minimum available WSL host memory in the primary run was approximately 16.03 GiB.

## Configuration and method

- GPU: NVIDIA GeForce RTX 4080 Laptop GPU, Windows driver 610.88, 12,282 MiB reported VRAM; WSL2 and the existing NVIDIA-enabled Docker daemon.
- Engine: Ollama 0.33.3, official image `ollama/ollama@sha256:32931b46719f673c05fdbaa81ccb26da18ea4a1c57590a754874ab28ba269eb2`.
- Model: Qwen3 8.2B, GGUF Q4_K_M, digest `sha256:500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`.
- Public identity remains Atlas RE 1.0 Local / `atlas-re-1.0-local`.
- Context 4,096; one generation slot; one loaded model; native queue setting eight; host RAM limit 10 GiB; four CPUs; cloud disabled; private network and no published ports.
- Synthetic requests explicitly used `think:false`, temperature zero, seed 42, and output caps no larger than 1,024. Short requests used 128 tokens, summaries 192, cancellation probes 16, and the long output test 1,024.
- Streaming client ran inside the DEV API container and called the private native Ollama endpoint. Timings start immediately before `fetch`, excluding `docker exec` startup. First token means the first nonempty content delta; for tool-call tests it means the first tool-call event. Metadata-only events do not count.
- Output throughput uses Ollama `eval_count / (eval_duration / 1e9)`. Client total latency includes loading, prefill, output generation, and stream completion. Percentiles use nearest rank; the 30-request p95 is the 29th sorted value. The median throughput gives each request equal weight.
- GPU/cgroup memory sampled approximately once per second. Readiness sampled approximately every two seconds, with 15-second baseline and post-run windows. DEV/QA API probes use internal `/readyz`; all six web probes use the existing local ingress `/readyz` routes. Self-signed development TLS verification is skipped for these availability probes. QA hostnames are explicitly resolved to localhost by the client; no host DNS configuration was changed.

The primary fixture SHA-256 and complete configuration are in [machine-readable results](atlas-gpu-benchmark-results.json). All prompts and tool results are fictional. Repeated prefixes intentionally exercise normal prompt-cache behavior; these are single-user sequential warm timings, not guarantees for concurrent users, longer outputs, or arbitrary uncached prompts.

## Workloads

| Primary workload                 | Requests | First token p95 | Total latency p95 | Median output tokens/s |
| -------------------------------- | -------: | --------------: | ----------------: | ---------------------: |
| Warm short chat                  |       30 |         0.068 s |           0.971 s |                  60.24 |
| Business summaries               |        3 |         0.059 s |           1.233 s |                  60.61 |
| Multi-turn recall and correction |        3 |         0.056 s |           0.455 s |                  63.14 |
| Structured JSON extraction       |        3 |         0.061 s |           0.470 s |                  54.11 |
| Increasing input sizes           |        5 |         0.956 s |           1.380 s |                  58.49 |
| Output cap of 1,024              |        1 |         0.201 s |          17.363 s |                  59.67 |
| Initial tool calls               |        3 |         0.529 s |           0.572 s |                  58.66 |
| Synthetic tool-result follow-up  |        3 |         0.031 s |           0.330 s |                  60.79 |
| Tool not needed                  |        1 |         0.025 s |           0.229 s |                  63.56 |

The long output stopped at exactly **1,024 tokens**, with `done_reason=length`. All 52 normal primary requests completed without transport/model errors or thinking output. Summary checks preserved the three required order counts; multi-turn checks retained the revised owner and original budget; all three JSON results matched the expected fields, values, and types. Short-chat checks only verify a nonempty substantive response. These small fixture checks are not a broad factual-accuracy evaluation.

Cold-start measurements deliberately unload the model after restarting the inference engine. They retain host filesystem, Windows driver, and other machine caches. The primary cold request took **2.688 s to first token and 4.076 s total**; the first run took **2.982 s to first token and 11.444 s total**. This variation is why the report does not present one cold response as a boot-time guarantee. The earlier artifact-restore phase also observed longer initialization; an adapter should use readiness warm-up and an explicit cold-load timeout.

## Input boundary

| Ledger rows | Serialized message characters | Evaluated prompt tokens | First token | Observation                                                  |
| ----------- | ----------------------------: | ----------------------: | ----------: | ------------------------------------------------------------ |
| 8           |                           491 |                     156 |     0.052 s | Completed                                                    |
| 32          |                         1,593 |                     538 |     0.100 s | Completed                                                    |
| 96          |                         4,537 |                   1,562 |     0.276 s | Completed                                                    |
| 192         |                         9,045 |                   3,190 |     0.441 s | Completed with the test's 128-token cap                      |
| 384         |                        18,069 |  2,050 after truncation |     0.956 s | Original prompt was 6,454 tokens; native engine truncated it |

The server log explicitly records `truncating input prompt`, reducing 6,454 tokens to 2,050. The successful HTTP response is therefore **not** evidence that all input was retained. Before integration, budget the complete prompt plus reserved output within 4,096 tokens. Reserving the full 1,024-token output cap leaves at most 3,072 tokens for the complete prompt, including template, history, and tool schema overhead. Reject oversized current input or deliberately trim eligible history; do not delegate this decision to silent native truncation.

## Cancellation, overload, and interruption

Three active streams were aborted after their first output. A replacement request began output within 83 ms in the slowest primary trial. This measures observable slot availability including replacement prefill/network time; it is not an internal scheduler timestamp. A queued request was also canceled while another stream was active, and the following request completed normally after the blocker was canceled.

Warm saturation submitted one active long generation plus 14 more requests. **Zero overload responses arrived during the 1.5-second observation window**, despite `OLLAMA_MAX_QUEUE=8`; the queued requests were then canceled and the service recovered. The same behavior occurred in both runs. The pinned engine's [scheduler implementation](https://github.com/ollama/ollama/blob/v0.33.3/server/sched.go#L183) sends requests for an already loaded runner directly to it, bypassing the bounded pending-model queue. Native `OLLAMA_MAX_QUEUE` is consequently insufficient as Atlas's global admission limit.

A separate cold-load burst sent 18 requests: **nine completed and nine returned overload rejection**. This shows the cold scheduler queue behaving differently from the warm path. Intentional overload responses and aborted streams are recorded separately from unexpected failures. Before shared chat, the Atlas adapter/runtime needs one active generation, an explicitly bounded application queue, queue deadlines, cancellation removal, and clear overload errors.

For interruption, the host stopped only `atlas-inference` during an active stream, held it stopped for three seconds, and started it again. The client observed a terminated stream without a successful terminal event. Engine process availability returned **5.716 s** after the interruption signal; the fresh recovery request then completed in **2.893 s**—approximately **8.61 s** from the signal to a completed answer. The fixture was not automatically replayed. All other applications remained available. Future run persistence must mark an interrupted generation incomplete and avoid automatically replaying side effects.

## Initial tool behavior

Three requests selected the expected `lookup_order` function with the exact synthetic order ID. All three follow-up requests used the supplied canned status `awaiting_review`. The arithmetic control case made no tool call. No actual application tool was invoked: the harness only supplied synthetic results. This establishes basic native tool-call shape and follow-up behavior, not tenant authorization, approval, replay protection, or safe mutation execution. Governed tool enablement remains a separate gate.

## Existing applications and qualification

The primary monitor recorded **54 successful probes per endpoint** for DEV/QA API, Neon, Mesh, and Studio: 432 total, all HTTP 200. Other containers retained their pre-run status, health, OOM state, and start time. Active p95 API readiness was 91.5 ms in DEV and 68.8 ms in QA; web readiness p95 ranged from 16.9 to 23.3 ms. No reproducible readiness regression was observed. These are health checks, not authenticated business workflows or a sustained multi-user load test.

The first run had a monitoring defect: QA public hostnames were absent from the WSL resolver, so its three QA web probes returned no HTTP status from baseline onward. The QA API and container health remained available. The harness was corrected to target the configured localhost ingress explicitly, and the complete run was repeated. Both runs and the failed probe evidence are retained; the primary result does not treat those earlier DNS failures as successful checks.

**Decision:** retain the pinned model, image, context, concurrency, and memory settings for local integration development. The proposed measured targets passed. Before enabling shared chat, implement and test application admission/backpressure, context budgeting, model/GPU readiness enforcement, cancellation propagation, and interrupted-run persistence. Complete authenticated Neon/Mesh/Studio chat/history verification after provider/runtime integration. Keep real tools disabled until governed execution tests pass.

## Reproduction and evidence

```sh
python3 tooling/scripts/atlas/run-benchmark.py
python3 tooling/scripts/atlas/summarize-benchmark.py /absolute/path/to/printed/receipt-directory
python3 -m unittest discover -s tooling/scripts/atlas -p 'test_*.py'
```

The benchmark intentionally restarts only the isolated inference service for cold and interruption tests. It preserves the model volume and restores the service in cleanup. It requires the existing DEV API attachment and GPU access. The run never pulls images or models and never attaches a bootstrap network.

Primary raw receipts: `~/.athyper/instances/dev/receipts/atlas-benchmark/20260907T045941Z/`.
Corroborating receipts: `~/.athyper/instances/dev/receipts/atlas-benchmark/20260907T045708Z/`.
Each directory contains timestamped request/stream results, resource/readiness samples, sanitized container state snapshots, native inference logs, metadata, and a computed summary. [Checked results](atlas-gpu-benchmark-results.json) include the primary summary and corroborating performance. Five Python tests pass (two benchmark-statistics tests and three artifact-verification tests); the benchmark client passes Node syntax validation. Final pinned-model generation readiness passes. Scripts and report remain in the working tree; nothing was published to an external service.

API references: [native chat timing fields](https://docs.ollama.com/api/chat), [loaded-model GPU metadata](https://docs.ollama.com/api/ps).
