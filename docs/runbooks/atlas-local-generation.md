# Atlas local generation integration

This records the initial generation-only stage. For the subsequent deployed tool capabilities, current API image, qualification results, and history-preserving rollback controls, see [Atlas staged tools](atlas-staged-tools.md).

Implemented 2026-09-07 for the DEV API, using the existing governed Atlas backend and isolated Ollama deployment. QA configuration and business tools are unchanged.

## Configuration and scope

The host reads `ATLAS_LOCAL_INFERENCE_CONFIG_PATH=/athyper/config/atlas-local-inference.json`. The checked configuration is `deploy/config/atlas/local-inference.json`; the API mounts it read-only. The binding exposes **Atlas RE 1.0 Local** (`atlas-re-1.0-local`) and requires the pinned engine version and full model digest. Transport is explicitly `local_transport`, with null credential IDs and no API key. Only `http://atlas-inference:11434` is accepted; redirects and cloud fallback are disabled.

Basic generation composes conversation authorization, durable runs, metering, quota admission, model policy and a versioned system prompt. It does not require knowledge retrieval, credential administration, or published experience services. Each plane requires its own `<plane>.ai.agent.use` permission. Only the conversation owner can generate, matching database RLS; participants retain authorized read access. The local policy admits public, internal and synthetic data. Tools, vision and confidential/restricted data are not enabled.

The native adapter handles NDJSON streaming, UTF-8 boundaries, cancellation, bounded queueing, sanitized errors, usage and native tool-call normalization. A tool call cannot execute through this binding while tools are disabled. Model/version checks and full GPU placement checks precede generation. The adapter permits one active request and eight queued requests with a five-second queue timeout and 120-second request deadline. This admission queue is per API process: multiple API replicas require shared admission before deployment.

## Context and durability

The 4,096-token context includes system instructions, history, tools, current input and the output reservation (maximum 1,024 tokens). A conservative UTF-8 byte bound plus message/template overhead is used for the pinned byte-BPE model, not the former character ceiling or a characters-per-token guess. Complete oldest user turns are removed first; oversized mandatory content is rejected before starting a run. This deliberately accepts less text than an exact tokenizer would.

`clientRequestId` must be a UUID. Database transactions lock admission, enforce one active run per thread and bind a request key to a payload fingerprint. Completed or cancelled retries replay the existing terminal result; changed payloads and active duplicates are rejected. Run creation, the user message and pending assistant message are atomic. Completion/cancellation use a locked first terminal transition; only one assistant output and canonical metering record can win.

Provider-call receipts are staged durably and copied into the canonical run/call ledger at finalization. Local transport never invents credential metadata. Missing final counters remain unavailable; quota settlement separately marks a conservative reservation charge as `estimated`. Consumer disconnection closes the provider stream and persists cancellation. Abandoned runs expire after five minutes and are finalized when a subsequent run attempt checks that thread/key; there is no background recovery sweeper in this phase. An expired request key is not automatically regenerated.

## Database rollout

Local generation is consolidated into the canonical `server/db/ddl/common/ai/{03_tables,05_constraints,07_functions,08_triggers,10_rls,11_grants}.sql` files, loaded by all three plane manifests. These definitions include run generation metadata, immutable provider usage receipts with actor/plane RLS, finish reasons and quota usage-source metadata. The duplicate migration and `12_local_generation.sql` have been retired. Use the foundation runner for fresh databases as described in [SQL DDL consolidation](sql-ddl-consolidation.md); do not replay foundation DDL against populated databases. Local transport does not belong in secret-administration provider constraints; those remain limited to credential-bearing providers.

The migration was applied to DEV Neon, Mesh and Studio. Pre-change AI schema backups, the previous Compose overlay, deployment image IDs and service baselines are under `~/.athyper/instances/dev/receipts/atlas-generation/`. Rollback the API by restoring `local-atlas.compose.before-generation.json` to the DEV local Atlas overlay and recreating only the API with its recorded Compose file list. Leave the additive migration in place to preserve receipts and transcripts.

## Verification

Targeted suites passed: Ollama 9, AI contracts 4, platform AI 150, host AI vertical 4, and existing cloud adapters 6 (173 total). Adapter, platform AI, host and cloud adapter typechecks passed. The production image build includes dependency compilation and runtime graph verification.

Run `node --import tsx tooling/scripts/verification/verify-local-atlas-generation.mts` against the local DEV Docker stack. It uses the real GPU, each actual plane database and `athyper_runtime` database role with verified-context fixtures. It checks streamed answer, saved messages and canonical usage, same-key replay without another provider call, changed-key-payload rejection, oversized context rejection, denied permission, cancellation replay, provider failure and abandoned-run recovery. All three planes passed. All fixture writes in this script roll back.

Run `node --import tsx tooling/scripts/verification/verify-local-atlas-generation-races.mts` for independent committed transactions. This creates and archives a synthetic Neon thread. It verified active duplicate rejection, competing thread-run rejection, durable consumer-disconnect cancellation with a usage receipt, and competing completion/cancellation producing one output and metering record. The recorded thread is `b0f17ad9-a7e2-4620-b627-d664b29b3ba5`; the completion transition won the tested race. This script uses real provider usage, not invented counters.

Private model readiness: `node tooling/scripts/verification/local-atlas-inference.mjs readiness`.

These backend checks do not establish fresh authenticated browser flows across Neon, Mesh and Studio. The previous browser session expired; that product-level verification remains a separate step. Published experience/agent mappings are not silently rewritten to the local model. Business-tool authorization and execution verification must pass before enabling tools.

## Deployed result

DEV API image: `sha256:d0ab0a6d65d6f1b494bffea2084972b7930d9801085e5c8fa86820f17ddf74bb`. Only `athyper-dev-api-1` was replaced. All 48 running containers retained their recorded health state, and API/Neon/Mesh/Studio readiness returned HTTP 200 in both DEV and QA (8 checks). Private generation readiness required and verified the pinned model digest.

A smoke test inside the deployed API imported the packaged Ollama adapter and local composition, streamed `4` in response to `2+2`, and received final provider usage (26 input, 3 cache-read, 2 output tokens). It used the private hostname without a transport override and made no database changes. The deployed admission endpoint rejected an unauthenticated request with HTTP 401. Tools remained disabled.
