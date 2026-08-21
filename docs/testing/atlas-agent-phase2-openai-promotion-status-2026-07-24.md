# OpenAI promotion status

**Status:** technically prepared, promotion not approved  
**Provider:** OpenAI  
**Binding:** `atlas-openai-eval`  
**Upstream model:** `gpt-5.6-sol`  
**Audience:** internal evaluation only  
**Routing:** default-off, no fallback

## Completed in the repository

- Responses streaming adapter with typed event normalization.
- `store: false` request assertion.
- Atlas-owned bounded conversation history; no provider conversation state.
- Hashed safety identifier; no raw tenant/principal identity sent upstream.
- Exact requested/configured/actual model identity fields.
- Refusal, incomplete, timeout, overload, rate-limit, authentication, and
  cancellation normalization.
- Provider conformance and request-shape fixtures.
- Immutable `atlas-openai-eval` version `1.0.0` with 200 synthetic cases.
- Pilot harness with completion, error, model identity, usage, reconciliation,
  and assertion gates.
- Provider credential resolution and rotation tests.

Local validation:

```text
pnpm --filter @athyper/svc-ai run eval:openai:validate
1 file, 3 tests passed

pnpm --filter @athyper/svc-ai typecheck
passed
```

## Previous pilot artifact

The checked-in pilot result is not a promotion result:

- 200 cases attempted;
- 0 completed;
- 200 failed;
- 40% assertion pass rate;
- model identity gate failed;
- ledger reconciliation was skipped because no ledger was configured.

It must not be reused as OpenAI production evidence. A new run is required
against the approved OpenAI project and the normal Atlas relay endpoint.

## External approval required before live traffic

No network evaluation may begin until a restricted, non-committed evidence
record has an owner, date, decision, and reference for:

- approved OpenAI business account and contract/DPA owner;
- dedicated project and server-only vault credential;
- exact `gpt-5.6-sol` access and readiness result;
- approved processing region and residency posture;
- Responses storage, ZDR, abuse-monitoring, and prompt-cache controls;
- synthetic/public-only data classification;
- Security threat-model and prompt-injection review;
- Privacy/legal approval;
- budget, quota, concurrency, and stop-loss limits;
- Operations dashboard, alerting, disable drill, rollback owner, and key rotation;
- Product/SRE approval for the internal allowlist.

The local `server/.env` and `stack/env/.env` contain no OpenAI credential. No
tenant or customer data may be used for this evaluation.

## Required execution after approval

1. Inject `OPENAI_API_KEY` through the approved server-only secret manager.
2. Set `OPENAI_PROJECT_ID` and the approved environment/region metadata.
3. Run the exact-model readiness probe and record the returned model ID.
4. Run all 200 immutable cases through the normal Atlas relay with a dedicated
   synthetic tenant, bounded concurrency, and read-only ledger access.
5. Capture only safe evidence: case ID, status, model IDs, provider request ID,
   usage, latency, error class, assertion results, and ledger correlations.
6. Reconcile provider usage and cost with Atlas run/provider-call ledgers.
7. Run credential rotation and revocation while proving no secret value enters
   logs, traces, browser payloads, or reports.
8. Verify the hard gates:
   - at least 99.5% completed streams;
   - below 1% provider 429/5xx;
   - at most 1% usage/cost reconciliation difference;
   - no more than 2 percentage-point quality regression versus Anthropic;
   - exact model identity for every completed stream;
   - cancellation/truncation and no-retry-after-visible-delta behavior.
9. Allowlist internal staff/tenants and complete the two-week soak.
10. Record the signed promotion decision. Keep the binding disabled if any gate
    fails.

Until this evidence exists, OpenAI remains an internal diagnostic binding and
cannot be selected by customer-facing Atlas modes.
