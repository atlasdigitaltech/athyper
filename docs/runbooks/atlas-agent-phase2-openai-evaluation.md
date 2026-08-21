# Atlas Agent Phase 2 OpenAI evaluation operations

**Status date:** 2026-07-23

## Current status

The current worktree contains an OpenAI Responses adapter, readiness probe,
server-only configuration, and an internal diagnostic binding. The evaluation
input set and validator are prepared:

- dataset: `server/packages/services/ai/evals/atlas-openai-eval-v1.json`;
- validator: `server/packages/services/ai/evals/validate-atlas-openai-eval.ts`;
- regression: `server/packages/services/ai/__tests__/atlas-openai-eval-set.test.ts`;
- normalized size: 200 synthetic cases, 25 in each required category.

The current evaluation profile is the exact model ID `gpt-5.6-sol`, exposed only
through the internal `atlas-openai-eval` binding. OpenAI describes GPT-5.6 Sol
as the frontier GPT-5.6 model and documents Responses, streaming, structured
outputs, and function-calling support on its
[model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

This is not a completion statement. No live evaluation result, comparative
score, staff rollout, customer pilot, production soak, or privacy approval is
recorded by these assets. `OPENAI_PROVIDER_ENABLED` remains default-off.
`gpt-5.6-sol` is an internal evaluation target, not a customer default or an
approved routing destination.

The reviewed catalog snapshot is
`openai-public-pricing-2026-07-23`: USD 5.00/M uncached input tokens,
USD 0.50/M cache-read tokens, USD 6.25/M cache-write tokens, and
USD 30.00/M output or reasoning tokens. Atlas caps this candidate at a
200,000-token context and 8,192 output tokens; the lower context cap also keeps
the profile below the model page's higher-priced input tier above 272,000
tokens. Re-review and version these rates before any later promotion rather
than editing an old ledger price version
([GPT-5.6 Sol model and pricing](https://developers.openai.com/api/docs/models/gpt-5.6-sol)).

## Non-negotiable request profile

Every Phase 2 evaluation request must preserve the existing Atlas contract:

1. Use the Responses API with `stream: true`.
2. Send `store: false`.
3. Keep conversation state in Atlas and send its bounded message history.
4. Do not use the Conversations API or `previous_response_id`.
5. Send the exact server-selected upstream model and reject a different
   terminal model identity.
6. Send a 64-character hashed `safety_identifier` derived from the canonical
   tenant/principal scope; never send a username, email address, or raw
   principal ID.
7. Keep provider credentials, project identifiers, and provider response IDs
   server-side.
8. Keep tools, tenant retrieval, images, and business mutations disabled for
   this evaluation profile.
9. Do not silently fall back to another provider, credential, region, or model.

The provider-diagnostics permission identifies an approved evaluator; it does
not classify, inspect, redact, or sanitize what that evaluator types. Until a
separate content-classification gate exists, the evaluation binding permits
only the committed synthetic/public dataset, and operators must not paste
tenant or other non-public content into it.

OpenAI documents manual conversation replay as a supported state strategy and
separately documents `previous_response_id` as a provider-managed chaining
option. Atlas deliberately uses the manual, Atlas-owned strategy and does not
make a provider response ID authoritative
([conversation state](https://developers.openai.com/api/docs/guides/conversation-state)).

OpenAI recommends a stable, privacy-preserving safety identifier and explicitly
recommends hashing a username or email instead of transmitting identifying
information. Atlas hashes its canonical internal tenant/principal tuple and
sends only the digest
([safety identifiers](https://developers.openai.com/api/docs/guides/safety-best-practices#implement-safety-identifiers)).

## `store: false` is not ZDR

Treat the following as separate controls:

- `store: false` is a request-level choice that prevents the generated Response
  from being retained as retrievable Responses application state.
- Zero Data Retention is an organization/project control governed by OpenAI
  account eligibility and configuration.
- Region/data-residency selection, abuse-monitoring retention, prompt caching,
  background mode, hosted tools, and third-party tools have their own
  eligibility or retention behavior.

OpenAI documents a default Responses application-state retention period and
states that ZDR forces `store` to false. That does not make the converse true:
setting `store: false` does not establish that the organization has ZDR
([Responses data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses)).

Therefore, code assertions for `store: false` are necessary but insufficient
for privacy approval. The account/project/region review below must be completed
before any non-synthetic pilot.

## Evaluation dataset contract

Version `1.0.0` contains exactly 200 explicit case IDs:

| Category | Risk | Cases |
| --- | --- | ---: |
| Product help | Low | 25 |
| Finance terminology and calculations | Medium | 25 |
| Refusal to invent live tenant data | High | 25 |
| Prompt-injection resistance | High | 25 |
| Multi-turn retention | Medium | 25 |
| Concise answers | Low | 25 |
| Future structured JSON fixtures | Medium | 25 |
| Cancellation and long responses | Medium | 25 |

All prompts, identifiers, amounts, records, and narratives are synthetic. The
set contains no customer data, copied product manuals, third-party articles, or
model outputs.

Common metadata is inherited from a family and expanded by the validator.
Every normalized case has:

- a unique ID and dataset version;
- category and risk;
- rendered developer/user/assistant messages;
- machine assertions;
- a weighted human or protocol rubric; and
- stream cancellation metadata where applicable.

The future JSON cases must retain their strict schema. During the text-only
evaluation they may measure prompt-level JSON adherence. Native Structured
Outputs evaluation remains a separate compatibility gate if that capability is
later enabled; do not weaken the schema or mark the capability complete from
prompt-only output.

The cancellation cases are protocol tests. They pass only when cancellation
reaches the upstream request, no post-cancel delta becomes client-visible, the
run has a truthful cancelled/disconnected ledger outcome, and cancellation
finishes within the fixture deadline.

## Validator gate

Run before uploading or executing any dataset:

```text
pnpm --filter @athyper/svc-ai eval:openai:validate
pnpm --filter @athyper/svc-ai typecheck
```

The validator enforces:

- at least 200 globally unique case IDs;
- at least 25 cases in every required category;
- matching family and dataset versions;
- complete message, assertion, and rubric metadata;
- resolvable templates and assertion variables;
- rubric weights totaling 1; and
- absence of observed model output, scores, winners, or evaluation results.

Do not edit a dataset version after it is used in an evaluation. Create a new
version, retain the old input artifact, and report results against the exact
version and content hash.

## Preflight approvals

No network evaluation may begin until every row has an owner, dated decision,
and evidence link:

| Gate | Required evidence | Initial status |
| --- | --- | --- |
| OpenAI account | Approved business account, contract/DPA owner, support and incident contacts | Pending |
| Project isolation | Dedicated project, server-side key/vault reference, spend/rate limits, rotation owner | Pending |
| Model access | `gpt-5.6-sol` available to the approved project and exact model readiness probe succeeds | Pending |
| Region/residency | Approved processing region and documented endpoint/model eligibility | Pending |
| Retention | Verified ZDR status, Responses storage policy, abuse-monitoring controls, and prompt-cache behavior | Pending |
| Data classification | Synthetic/public-only evaluation classification; no tenant retrieval or content | Pending |
| Security | Threat model, prompt-injection policy, credential path, logging/redaction, and disable owner | Pending |
| Privacy/legal | Signed decision covering account, project, region, retention, identifiers, and evaluator access | Pending |
| Cost | Budget, alert thresholds, maximum concurrency, and stop-loss owner | Pending |
| Operations | Dashboard, alert routing, incident runbook, disable drill, and rollback approver | Pending |

Never infer ZDR, residency, or contractual coverage from an API key, model
availability, `store: false`, or a successful readiness probe.

## Execution procedure

### 1. Freeze evidence inputs

Record:

- Git commit and dirty-worktree status;
- dataset ID, version, case count, and SHA-256;
- adapter ID/version and policy revision;
- requested public binding and exact configured upstream model;
- prompt/instruction version;
- account, project, and region identifiers in redacted operational form;
- reasoning, output-token, timeout, and concurrency settings; and
- the approval record from the preflight table.

Never record the API key, raw safety identifier inputs, prompts from outside the
synthetic dataset, or provider response content in the operational ledger.

### 2. Run local and recorded-fixture gates

Run provider conformance, request-shape, SSE parser, malformed-stream,
disconnect, timeout, rate-limit, authentication, exact-model, usage, ledger, and
route-denial tests. Confirm tests assert:

- `store` is exactly false;
- `previous_response_id`, provider conversation IDs, and deprecated `user` are
  absent;
- the hashed `safety_identifier` is present;
- no provider call occurs on a failed Atlas policy gate; and
- an internal binding disappears when OpenAI is disabled.

### 3. Execute the synthetic set

Use bounded concurrency and a dedicated sandbox/internal project. For each case:

1. Send the normalized messages through the normal Atlas server path.
2. Record only the approved evaluation artifact fields.
3. Capture requested model, actual returned model, provider request ID,
   terminal status, usage, time to first token, total latency, and error class.
4. Apply machine assertions.
5. Queue rubric-scored cases for blinded human review.
6. For cancellation cases, cancel at the declared event and validate both the
   client and ledger outcome.
7. Stop immediately on cross-tenant/scope leakage, credential exposure,
   unexpected model identity, unbounded spend, or inability to disable.

OpenAI Responses streaming uses typed SSE lifecycle and delta events
([streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)).
The evaluation harness must consume typed events and require a terminal
completed, failed, incomplete, error, or locally cancelled outcome; end-of-file
alone is not success.

### 4. Compare with the baseline

Run the same immutable normalized cases against the approved Anthropic baseline.
Do not compare different prompts, history, limits, regions, retry policies, or
rubrics under one provider score.

Report, by category and overall:

- task success and blinded human preference;
- unsupported factual claims;
- live-data refusal and prompt-injection correctness;
- JSON/schema adherence;
- cancellation correctness;
- time to first token and total latency percentiles;
- completed-stream, timeout, disconnect, 429, and 5xx rates;
- input, output, and reasoning usage;
- catalog-estimated versus provider-final usage/cost reconciliation; and
- actual returned model and provider availability by approved region.

Missing, aborted, or invalid runs remain missing/failed evidence. Do not impute a
score and do not publish a winner without the raw run inventory and review
coverage.

## Promotion gates

These are Athyper release gates, not OpenAI guarantees:

- all 200 versioned cases executed under the approved profile;
- 25/25 attempted cases represented in every category;
- no more than a two-percentage-point task-quality regression against the
  approved Anthropic baseline;
- zero invented live-tenant claims in the high-risk live-data set;
- zero accepted prompt-injection markers in the high-risk injection set;
- 100% cancellation isolation in the cancellation set;
- at least 99.5% successful completed streams in the production-shaped pilot;
- provider 429/5xx below 1% for the approved load profile;
- provider-final usage/cost reconciliation difference at or below 1%;
- no cross-scope content, credential, provider-ID, or raw-content telemetry
  leakage;
- signed security, privacy, legal, account, project, region, and retention
  approval; and
- a successful disable and rollback drill.

A threshold miss blocks promotion. Changing the threshold, rubric, prompt, or
dataset requires a new recorded evaluation treatment; it does not retroactively
convert a failed run into a pass.

## Streaming and moderation policy

Streaming improves time to first token but exposes partial output before the
full response is available. OpenAI warns that partial completions are harder to
moderate, and generation-time moderation scores arrive only after the full
output is available
([streaming moderation risk](https://developers.openai.com/api/docs/guides/streaming-responses#moderation-risk)).

For the internal synthetic evaluation:

- keep the audience to approved staff;
- use only the committed synthetic dataset;
- preserve client cancellation and scope-change suppression;
- record moderation or policy incidents separately from quality scores; and
- never treat a clean terminal moderation result as proof that every displayed
  partial delta was safe.

Before a higher-risk or customer surface, approve one of:

- bounded buffering until a safety decision is available;
- input checks plus incremental local policy controls and a final output check;
- a non-streamed response path; or
- a restricted use case whose reviewed risk accepts partial display.

Do not claim that ordinary end-of-response moderation retroactively protects
already displayed deltas.

## Rollout stages

Advance one stage only with attached evidence and an explicit approver:

0. **Disabled foundation:** provider default-off; validator and recorded
   fixtures only.
1. **Sandbox synthetic run:** dedicated project, synthetic dataset, no tenant
   content.
2. **Internal evaluator flag:** named staff principals with the diagnostic
   permission; no public Atlas routing.
3. **Allowlisted non-sensitive pilot:** selected tenants only after all privacy
   and region gates; tools/RAG/actions remain disabled.
4. **Two-week soak:** production-shaped load with daily quality, reliability,
   cost, and incident review.
5. **Optional routing decision:** only after promotion signoff; customer-facing
   Atlas modes remain provider-neutral.

No ChatGPT consumer login or end-user OpenAI account is part of this flow.
Athyper uses its approved server-side provider project. Enterprise customer
credentials remain a later BYOK track.

## Disable and rollback

The primary kill switch is:

```text
OPENAI_PROVIDER_ENABLED=false
```

Operational disable order:

1. Disable the affected tenant cohort or the global OpenAI provider flag.
2. Publish a new effective policy revision that removes
   `atlas-openai-eval`.
3. Stop accepting new OpenAI runs.
4. Abort or bounded-drain active evaluation streams.
5. Verify the effective catalog no longer exposes the binding.
6. Preserve truthful run/call ledger records and evaluation artifacts.
7. Confirm Anthropic customer bindings still operate unchanged.
8. Investigate before re-enabling one internal evaluator.

Do not:

- route an affected run silently to Anthropic or a different OpenAI model;
- rewrite completed ledger records to name another provider/model;
- delete failed evidence to improve aggregate results; or
- re-enable by changing only the UI.

Rollback is complete only when the binding is absent server-side, new provider
calls stop, in-flight work is accounted for, and monitoring confirms no
credential or scope leak.

## Required evaluation report

Each treatment report must contain:

- dataset ID/version/hash and exact case inventory;
- Git/config/policy/adapter/prompt versions;
- requested and actual upstream model;
- account/project/region approval reference;
- completed, failed, incomplete, cancelled, and missing counts;
- assertion and rubric results by category;
- reviewer coverage and disagreement handling;
- latency, error, usage, and cost distributions;
- baseline comparison with confidence/coverage caveats;
- incidents and exclusions without silent deletion;
- threshold decision and named approvers; and
- rollout, disable-drill, and rollback evidence.

Until that report exists, roadmap status remains **evaluation assets prepared,
live evaluation and pilot not complete**.
