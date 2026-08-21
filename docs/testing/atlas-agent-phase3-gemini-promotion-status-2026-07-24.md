# Gemini promotion status

**Status:** technically prepared, evaluation-only, promotion not approved  
**Binding:** `atlas-gemini-eval`  
**Upstream model:** `gemini-3.6-flash`  
**API:** Gemini Interactions `v1beta`  
**SDK:** `@google/genai` `2.13.0`  
**Routing:** disabled

## Completed in the repository

- Native Gemini Interactions adapter isolated from provider-native types.
- Exact model binding and lifecycle manifest.
- `store: false` and Atlas-owned bounded history contract.
- Text-only request profile with unsupported generation parameters omitted.
- Provider conformance and recorded SSE/error fixtures.
- 200-case common comparison set plus 30-case Gemini add-on.
- Lifecycle, blocked-model, dataset-integrity, parameter, quota, and safety
  normalization validators.
- Paid/free account-class policy metadata and default-off provider gate.

Local validation:

```text
pnpm --filter @athyper/svc-ai run eval:gemini:validate
2 files, 8 tests passed

pnpm --filter @athyper/svc-ai typecheck
passed
```

The local `server/.env` and `stack/env/.env` contain no Gemini credential.

## Explicit safety boundary

The Gemini add-on currently records:

```text
safety_gate_status=blocked_pending_paid_sandbox_native_fixture
```

The recorded fixtures do not prove a native Gemini safety discriminator. A
paid-sandbox blocked-prompt matrix must capture sanitized provider-native
Interactions fixtures before safety normalization can be promoted. If Gemini
does not provide a stable structured discriminator, routing remains disabled or
requires a separately approved Atlas safety classifier.

## External approval required

Before any network evaluation or load test, obtain dated evidence for:

- paid-tier account classification and commercial owner;
- dedicated Google project, restricted Authentication key, vault owner, and
  separate quota/spend policy;
- exact model lifecycle review and replacement rehearsal owner;
- SDK/API and endpoint review;
- global endpoint/data-location and residency decision;
- DPA, data-use, storage, abuse-monitoring, and retention decision;
- synthetic-only data classification;
- Security review of credentials, logging, prompt injection, safety blocks, and
  partial streaming;
- budget, quota, concurrency, and stop-loss controls;
- Operations dashboards, alerts, disable drill, and incident contacts;
- Product/SRE decision: developer-only, production route, or neither.

Free-tier Gemini is permitted only for synthetic local development. No tenant or
pilot data may be sent through a free-tier project, and a paid binding must not
silently fall back to a free project.

## Required evaluation after approval

1. Inject a dedicated paid-project Gemini credential through the server-only
   secret manager.
2. Recheck the exact model lifecycle and SDK/API versions.
3. Run the paid-sandbox blocked-prompt matrix and capture sanitized native
   fixtures.
4. Run the common 200-case suite plus the 30-case Gemini add-on.
5. Evaluate long context, prompt-level JSON, parameter compatibility, quota and
   project limits, latency, cost, reliability, and cancellation.
6. Verify requested/configured/actual model identity and usage reconciliation.
7. Compare quality against the approved Anthropic/OpenAI baselines.
8. Obtain Product, Security, and SRE routing decision.
9. Keep `GEMINI_PROVIDER_ENABLED=false` and routing disabled unless every gate
   is approved and the intended role is explicitly recorded.

No live Gemini call or promotion approval is claimed by this report.
