# Server Atlas AI rebuild status

**Date:** 2026-08-10  
**Status:** Foundation increment built; not composed into a running plane

This rebuild uses `server-backup/packages/platform/ai` as behavioral reference
only. The active package boundary is now:

- `server/packages/contracts/ai` — provider-neutral Atlas contracts;
- `server/packages/platform/ai` — admission, exact binding, durable-run
  orchestration, thread policy, governed tools, Records gateway, invoice review,
  SSE, and content-free metering;
- `server/packages/adapters/ai-anthropic` — Anthropic Messages adapter;
- `server/packages/adapters/ai-openai` — OpenAI Responses adapter;
- `server/packages/adapters/ai-gemini` — Gemini Interactions adapter.

## Preserved decisions

- Athyper thread/message history is authoritative and bounded.
- A run records one exact binding, binding revision, policy revision, and prompt
  revision before provider invocation.
- Provider credentials are request-scoped server leases. Credential ownership
  must exactly match the binding.
- All bindings use `no-fallback-v1`; ambiguous public modes fail construction.
- Provider output is normalized before it reaches the Atlas SSE protocol.
- Prompts, responses, tool arguments/results, and record values have no place in
  the usage/cost ledger.
- Plane admission is server-resolved from verified context, strict feature
  checks, permission state, and a versioned plane profile.
- Only code-registered tools can be described. Read tools receive only the
  Records gateway. Mutations stop at a persisted preview until explicit user
  confirmation, fresh authorization, row-version verification, and an
  idempotent registered domain command.
- The Records gateway uses the canonical Records query service, a published
  descriptor projection, field-security projection, verified tenant/plane
  context, and hard row/byte limits.
- Invoice intelligence produces an evidence-bearing candidate for human review.
  Only a separately invoked registered intake command can create an intake
  record after approval.

## Deliberately not activated

This increment does not add host routes, plane composition, provider secrets,
tool registrations, or feature enablement. It also leaves the following
production adapters to the next increment:

1. PostgreSQL implementations of the Atlas thread/run, proposal, retention, and
   usage-ledger ports against the current `ai` and `document` DDL and RLS.
2. HTTP thread/run/export/SSE routes using the platform IAM context reader.
3. Jobs for retention purge and stale run/tool recovery.
4. Concrete malware/format, OCR/document-intelligence, review-store, and
   Finance invoice-intake composition.
5. Plane-specific admission profiles and default-off feature configuration in
   the platform host.
6. Provider conformance, failure-injection, metering reconciliation, privacy,
   and rollout evidence required by the Atlas roadmap.

No running plane should advertise Atlas from these packages until those
composition and promotion gates are complete.

## Current verification

- Typecheck: all five packages pass.
- Unit/contract tests: 12 focused checks pass.
- Build: all five packages pass TypeScript compilation.
- Server rebuild boundary check: the AI contract is registered. The repository
  still reports the pre-existing unregistered Collaboration contract, which is
  outside this increment.
