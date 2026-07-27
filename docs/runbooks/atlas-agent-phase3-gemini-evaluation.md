# Atlas Agent Phase 3 Gemini evaluation operations

**Status date:** 2026-07-23

## Current role and evidence boundary

Phase 3 adds an internal evaluation binding to test whether Atlas is genuinely
provider-neutral. It does not make Gemini a customer default, a failover route,
or an approved tenant-data processor.

The reviewed implementation profile is:

| Field | Pinned value |
| --- | --- |
| Atlas binding | `atlas-gemini-eval` |
| Upstream model | `gemini-3.6-flash` |
| API surface | Gemini Interactions |
| Current endpoint version | `v1beta` |
| SDK | `@google/genai` `2.13.0` |
| Audience | Internal evaluation |
| Modalities | Text only |
| Provider storage | `store: false` |
| Provider-owned conversation state | Disabled |
| Built-in tools, search, code execution, remote MCP | Disabled |
| Function calling | Recorded-fixture conformance only |
| Images and PDFs | Disabled |
| Routing | Disabled pending Product, Security, and SRE sign-off |

Google documents the Interactions API as the recommended API for new agentic
implementations and the place where new agent capabilities are introduced
first. The API is GA while the current endpoint path is versioned `v1beta`.
Atlas pins both facts instead of interpreting the path suffix as a lifecycle
decision
([Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview)).

The selected model is the stable GA `gemini-3.6-flash`, released on 2026-07-21
with no published shutdown date at this review. The adapter pins the exact model
ID; an alias or a different returned model is not acceptable. Recheck the
[model catalog](https://ai.google.dev/gemini-api/docs/models),
[latest-model guidance](https://ai.google.dev/gemini-api/docs/latest-model),
and [deprecations](https://ai.google.dev/gemini-api/docs/deprecations) at every
promotion.

The exact approved SDK version is
[`@google/genai` 2.13.0](https://github.com/googleapis/js-genai/releases/tag/v2.13.0).
Provider-native interactions, events, parts, terminal statuses, errors, and
usage types must not escape the Gemini adapter.

These assets record no live evaluation, production load, cost comparison,
privacy approval, or rollout decision. `GEMINI_PROVIDER_ENABLED` remains
default-off and `atlas-gemini-eval` remains an internal diagnostic binding.

## Request contract

Every request must preserve Atlas authority:

1. Resolve the exact binding and provider credential on the server.
2. Send `store: false`.
3. Assemble and bound history in Atlas; do not use provider-owned interaction
   state as conversation authority.
4. Send only the messages selected by Atlas policy.
5. Keep the first binding text-only and omit built-in tools, search, code
   execution, remote MCP, files, images, and provider function declarations.
6. Omit `temperature`, `top_p`, `top_k`, and `candidate_count` for the selected
   Gemini 3.6 profile. Omit custom `safety_settings`, which the current
   Interactions limitations say are unsupported. Do not append a final model
   turn to the request history.
7. Do not inherit OpenAI or Anthropic request fields or defaults.
8. Reject an upstream response whose effective model disagrees with the
   configured exact model.
9. Inspect the terminal interaction status, then normalize usage, structured
   errors, and stream termination into the canonical Atlas provider contract.
10. Do not silently retry through another model, account class, project,
    region, or provider.

The exact selected-model request allowlist belongs to the Gemini adapter.
Adding a generation parameter requires a recorded request-shape fixture,
provider documentation review, and a new adapter version.

## Storage, data use, account class, and region

`store: false` is mandatory but is not the whole data-policy decision.
Interactions are stored by default if storage is enabled. At this review,
Google documents retention of 55 days for stored paid-tier interactions and
one day for stored free-tier interactions. Atlas disables that interaction
storage and separately reviews provider logging, abuse controls, training/data
use, endpoint scope, contract, and account settings
([Interactions storage and retention](https://ai.google.dev/gemini-api/docs/interactions-overview#data-storage-and-retention)).

`store: false` does not itself establish full Zero Data Retention. Google
documents additional project approval and feature restrictions for ZDR,
including separate cache and abuse-monitoring behavior
([Gemini ZDR](https://ai.google.dev/gemini-api/docs/zdr)).

The run policy must declare these fields before credential resolution:

- `provider_account_class`: canonical ledger value `developer_free` or
  `platform_paid`;
- a redacted environment-specific `provider_project_ref`;
- `provider_region` recorded as the endpoint class `global`;
- Atlas data classification;
- retention-policy approval reference;
- DPA/security approval reference where tenant data is involved; and
- quota, spend, and stop-loss policy revision.

Do not record an API key, raw project credential, prompt, response, tenant
record, or customer identifier in run metadata.

| Account class | Environment | Permitted input | Tenant/pilot data | Routing |
| --- | --- | --- | --- | --- |
| `developer_free` | Explicit local/development profile only | Committed synthetic fixtures and manual synthetic prompts | Prohibited | Prohibited |
| `platform_paid` | Dedicated sandbox/internal project | Committed synthetic evaluation | Prohibited until all approvals below | Prohibited |
| Future approved paid pilot binding | Dedicated approved pilot project | Separately allowlisted classification | Requires a new binding plus DPA, data-location, retention, Security, and Privacy approval | Still disabled until routing sign-off |

The current `atlas-gemini-eval` binding permits only the synthetic data class,
including on an approved paid project. It cannot become a tenant pilot merely
because approvals exist; that requires a new reviewed binding and policy.

A successful key, readiness request, or model response does not prove account
class, data residency, DPA coverage, retention, or tenant-data approval. Those
facts must come from controlled environment configuration and an approval
record.

The Gemini Developer API uses the global
`generativelanguage.googleapis.com` service. Atlas records `global` as the
provider endpoint class; it is not a selectable data-residency guarantee.
Country availability is documented separately
([available regions](https://ai.google.dev/gemini-api/docs/available-regions)).
Review Google's current free/paid data-use and transient-processing terms at
every promotion; do not infer them from API behavior
([Gemini API additional terms](https://ai.google.dev/gemini-api/terms)).

Each environment requires a separate Google project and separate vault-backed
credential, quota, spend cap, alert path, and request-log boundary. A paid
binding must never fall back to a free project, and a tenant request must never
be reclassified as synthetic after policy evaluation.

Use a restricted authentication key with only the required Gemini API
permissions and environment controls. Google documents key restrictions and
that Standard keys are rejected beginning September 2026. Use Authentication
keys now and complete migration verification before that date
([API key guidance](https://ai.google.dev/gemini-api/docs/api-key)).

The reviewed standard price profile for `gemini-3.6-flash` is USD 1.50/M
uncached input tokens, USD 0.15/M cached input tokens, and USD 7.50/M output
tokens including thinking tokens. Version and re-review these rates before a
run or promotion
([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).

## Evaluation composition

The Phase 3 treatment has two immutable layers:

| Layer | ID/version | Cases | Integrity |
| --- | --- | ---: | --- |
| Hosted-provider comparison | `atlas-openai-eval` `1.0.0` | 200 | SHA-256 `2B7C8677E69CAD690AAA1F1550F656DA57E36C014502BAA9E3648678ED02BF05` |
| Gemini add-on | `atlas-gemini-eval-addon` `1.0.0` | 30 | Versioned input fixture |

The first file keeps its historical name because it was introduced during
Phase 2. Its prompts and rubrics are provider-comparison inputs. Phase 3 loads
the exact same bytes; it does not copy, rewrite, rename, rebalance, or tune
those 200 cases for Gemini.

The 30-case add-on contains five cases per category:

| Category | Harness | Live provider content? | Claim boundary |
| --- | --- | --- | --- |
| Safety-policy outcome normalization | Documented-shape recorded fixtures | No | Fail safely without inventing a policy discriminator |
| Long context | Live synthetic text after approval | Yes | Text retrieval within the 200k Atlas cap |
| JSON adherence | Live synthetic text after approval | Yes | Prompt-level JSON only |
| Multi-function ordering | Recorded Gemini fixtures | No | Future tool-event normalization only |
| Parameter compatibility | Recorded request builder | No network | Exact selected-model request shape |
| Quota/project/account limits | Recorded errors, local policy guards, approved load | Only the load case | Error, project, and account isolation |

Native structured output and live function calls remain separate future
capability gates. Passing prompt-level JSON or recorded tool-event cases must
not set `supports_json_schema` or `supports_tool_calling` on the Phase 3 text
binding.

### Safety limitation and required evidence

The current Interactions contract does not document a native refusal event,
finish reason, `promptFeedback`, candidate `safetyRatings`, or a stable
safety-block discriminator. Those fields belong to other Gemini surfaces and
must not be imported into this adapter.

`interaction.completed` is a terminal SSE envelope, not proof of successful
completion. Inspect `interaction.status`, which may be `completed`, `failed`,
`cancelled`, `incomplete`, `budget_exceeded`, or `requires_action`, among other
states. An SSE `error` event and a model-output step error have different
documented structured shapes
([Interactions API schema](https://ai.google.dev/api/interactions-api),
[streaming flow](https://ai.google.dev/gemini-api/docs/streaming)).

The five committed safety-category fixtures therefore use only documented
HTTP/SDK, SSE error, terminal-status, and model-output-error shapes. When the
shape has no structured policy discriminator, the expected classification is
`unknown_provider_policy`; the adapter must not infer `safety_block` by matching
human-readable text. Unknown event shapes are skipped and recorded only in
restricted diagnostics.

The safety promotion gate remains
`blocked_pending_paid_sandbox_native_fixture`. Before claiming it passed:

1. Run an approved paid-sandbox blocked-prompt matrix.
2. Capture sanitized provider-native Interaction fixtures, never prompt or
   customer content.
3. Add only structured shapes actually returned, with model, SDK, API, and
   capture date.
4. Map safety only if a stable structured native code/detail proves it.
5. If no stable discriminator exists, keep routing disabled or introduce an
   Atlas-owned pre/post safety classifier through a separate security gate.

Run the input and lifecycle validators:

```text
pnpm --filter @athyper/svc-ai exec vitest run \
  __tests__/atlas-gemini-eval-set.test.ts \
  __tests__/gemini-provider-lifecycle.test.ts
```

The validator recomputes the common fixture hash, requires all 230 unique case
IDs, enforces five Gemini cases per category, prevents live tool activation,
and rejects model output, scores, results, or a claimed winner in input data.

## Preflight approvals

No network evaluation or load run starts until every applicable row has a
dated owner, decision, and evidence link:

| Gate | Evidence | Initial state |
| --- | --- | --- |
| Account class | Free-development or approved-paid classification from the controlled project inventory | Pending |
| Project isolation | Dedicated environment project, restricted vault credential, rotation owner, no shared request logs | Pending |
| Model lifecycle | Exact model still stable/available and lifecycle manifest current | Prepared, recheck required |
| SDK/API | Exact SDK lock and Interactions request/stream fixture results | Prepared, live verification pending |
| Endpoint/data location | Global endpoint class, country availability, transient processing, and absence of selectable residency understood and approved | Pending |
| DPA/privacy | Contract, DPA, data-use, storage, abuse-monitoring, and retention decision | Pending |
| Data classification | Synthetic-only treatment or separately approved pilot classification | Pending |
| Security | Threat model, credential restrictions, logging/redaction, safety-block and partial-stream policy | Pending |
| Cost/quota | Current versioned price profile, budget, project quota, concurrency, and stop-loss | Pending |
| Operations | Dashboard, alert routing, kill switch, disable drill, incident contacts | Pending |
| Product/SRE | Role-specific quality and reliability thresholds and routing role | Pending |

The add-on's long-context and load cases can incur meaningful cost and quota.
They are inventory, not authorization. The harness must require explicit budget
and project approval before executing them.

## Execution and comparison

### 1. Freeze the treatment

Record:

- Git commit and dirty-worktree status;
- both dataset IDs, versions, hashes, and exact case inventory;
- adapter ID/version and `@google/genai` version;
- requested public binding, configured exact model, and actual returned model;
- redacted project reference, account class, and provider region;
- Atlas policy, prompt, timeout, context/output limit, concurrency, retry, and
  stop-loss revisions;
- current model lifecycle review and approval evidence.

Results go into a separate access-controlled artifact. Never write provider
responses or observed scores back into an input fixture.

### 2. Run local and recorded fixtures

Before any network request, pass:

- the common provider conformance suite;
- exact request-shape and `store: false` tests;
- bounded Atlas-history and no-provider-state tests;
- normal, malformed, truncated, cancelled, and timed-out stream fixtures;
- documented error/status shapes and the explicit unknown-policy outcome;
- terminal-status and usage normalization;
- generated Atlas call IDs and multi-call ordering;
- selected-model parameter omission;
- authentication, permission, rate-limit, quota, overload, and project-policy
  failures;
- disable/removal behavior with Anthropic and OpenAI unchanged.

### 3. Run the immutable synthetic treatment

Use one declared project/account/global endpoint class, bounded concurrency,
and no fallback.
Execute the 200 common cases using the same prompts, limits, retries, rubric,
and harness versions used for the approved Anthropic and OpenAI treatments.
Then execute each approved live Gemini add-on case.

For every attempt, record:

- case and treatment identity;
- requested, configured, and actual model;
- account class, redacted project reference, and global endpoint class;
- terminal outcome and normalized error class;
- time to first token and total latency;
- input, output, cached, and thinking usage where reported;
- versioned catalog cost and provider-final usage/cost reconciliation;
- structured provider-policy classification and partial-output outcome; and
- assertion and blinded-review status.

Missing, blocked, cancelled, and invalid cases remain visible. Do not replace,
impute, or delete them.

### 4. Compare all hosted providers

Compare Gemini with both the approved Anthropic baseline and the exact Phase 2
OpenAI treatment. A valid comparison uses identical common cases, history,
instructions, output/context limits, concurrency shape, retries, region
classification, and scoring coverage.

Report overall and per category:

- task success and blinded human preference;
- unsupported factual claims;
- live-data refusal and prompt-injection correctness;
- JSON adherence;
- cancellation, terminal-status, and provider-policy classification correctness;
- latency percentiles and completed-stream rate;
- timeout, disconnect, 429, quota, and 5xx rates;
- usage by canonical token bucket;
- catalog-estimated and provider-final cost;
- project/account/region availability; and
- model identity agreement.

Do not publish a provider winner or routing recommendation without the complete
run inventory, missing-case analysis, reviewer coverage, and confidence
limitations.

## Promotion gates and role decision

Use the Phase 2 Athyper gates unless Security, Product, and SRE approve a
stricter documented role-specific treatment:

- all 200 common cases attempted and represented;
- all approved Gemini add-on cases represented;
- no more than a two-percentage-point task-quality regression against the
  approved baseline;
- zero invented live-tenant claims in the high-risk set;
- zero accepted prompt-injection markers in the high-risk set;
- 100% cancellation isolation;
- correct normalization for every committed documented-shape safety-category
  fixture, with no invented safety classification;
- 100% project/account policy denial before invocation;
- at least 99.5% successful completed streams in the production-shaped pilot;
- provider 429/5xx below 1% for the approved load profile;
- provider usage/cost reconciliation difference at or below 1%;
- no cross-scope, credential, project, provider-ID, or raw-content telemetry
  leakage;
- current lifecycle review and passed replacement rehearsal;
- signed Security, Privacy, Product, SRE, account, project, region, DPA,
  retention, and cost decisions; and
- successful disable and rollback drills.

These are Athyper promotion thresholds, not Google guarantees. A missed gate
blocks promotion.

The final signed decision must choose exactly one role:

| Role | Required outcome |
| --- | --- |
| Development option | Synthetic-only local profile is useful; tenant access and routing remain prohibited |
| Production route | All production gates pass and an explicit tenant/data/region routing policy is approved |
| Neither | Disable and remove the Gemini binding while retaining evaluation evidence |

No result silently changes `atlas-fast`, `atlas-balanced`, or `atlas-best`.
Saved customer preferences continue to reference public Atlas IDs.

## Lifecycle alert and replacement rehearsal

The machine-readable lifecycle source is
`server/packages/services/ai/evals/gemini-provider-lifecycle-v1.json`.
The checked-in test becomes blocking when:

- the selected model is on the blocked-model list;
- the lifecycle review is overdue;
- the replacement rehearsal is overdue; or
- a published selected-model shutdown enters the configured alert horizon.

Current dates:

- lifecycle review completed: 2026-07-23;
- next lifecycle review due: 2026-08-22;
- first replacement rehearsal due: 2026-10-21.

The retired placeholder family (`gemini-2.5-pro`, `gemini-2.5-flash`, and
`gemini-2.5-flash-lite`) is blocked for the Phase 3 binding. The reviewed
deprecation source lists an earliest shutdown date of 2026-10-16
([model deprecations](https://ai.google.dev/gemini-api/docs/deprecations)).

Replacement rehearsal:

1. Review the official model catalog and deprecations page and open an evidence
   record.
2. Create a new internal candidate binding with a different binding ID; do not
   modify public Atlas IDs or the active exact binding in place.
3. Pin the candidate model, SDK/API compatibility, request-parameter allowlist,
   price version, region, data profile, and limits.
4. Pass request-shape, provider conformance, safety, usage, cancellation, and
   disable fixtures.
5. Execute the same 200-case immutable set and relevant Gemini add-on cases.
6. Compare against the active Gemini binding plus Anthropic and OpenAI.
7. Rehearse disabling the old candidate and the active binding independently.
8. Obtain Product, Security, and SRE approval before changing any routing
   eligibility.
9. Preserve the old binding and run evidence for audit; never rewrite completed
   ledger model identities.

Refresh the manifest's review date, due date, sources, model status, and
shutdown date only with attached evidence. Mark the rehearsal passed only
after its required evidence list exists.

## Disable and rollback

Primary kill switch:

```text
GEMINI_PROVIDER_ENABLED=false
```

Disable procedure:

1. Disable the affected cohort or global Gemini provider flag.
2. Publish effective policy without `atlas-gemini-eval`.
3. Reject new Gemini runs and abort or bounded-drain active streams.
4. Verify the server catalog and readiness surface no longer expose the
   binding.
5. Preserve truthful ledger, provider-error, lifecycle, and evaluation
   evidence.
6. Confirm Anthropic and OpenAI bindings still operate unchanged.
7. Confirm saved customer public model preferences are unchanged.

Never silently reroute an affected request to a free project, another Gemini
model, Anthropic, or OpenAI. Rollback is complete only when new Gemini calls
stop, in-flight work is accounted for, and server-side catalog evidence
confirms removal.
