# Atlas governed tools — Phase 7C.1 operations

## Scope

The read-only phase enables the provider-neutral agent loop and two
Neon-certified tools: deterministic `atlas_catalog_help`, followed by the
exact-identifier `atlas_record_lookup` pilot for `company_code`. It does not enable action proposals,
confirmation tokens, step-up authentication, dual control, domain mutation,
arbitrary SQL, URL fetching, filesystem access, or shell execution.

The release is fail-closed. A normal text-only Atlas response remains available
when tools are disabled. If a request is explicitly tool-enabled but lacks the
durable thread, verified context, effective tool set, or audit authority needed
for safe execution, the run fails without invoking a handler.

## Authorization and execution boundary

The model can propose a call but cannot authorize it. The server applies these
controls in order and repeats the effective checks immediately before handler
execution:

1. Exact Atlas model binding and adapter support tool calling.
2. Durable Atlas conversation persistence prepared the authoritative run and
   thread.
3. `ATLAS_AGENT_TOOLS_ENABLED=true`.
4. Tenant flags `atlas_agent_enabled`,
   `atlas_conversation_persistence_enabled`, and
   `atlas_agent_tools_enabled` are effective.
5. The global agent, persistence, governed-tools, and code-owned
   per-tool feature flag (`atlas.tools.catalog_help` or
   `atlas.tools.record_lookup`) is re-read without the normal feature cache.
6. The exact verified permission `ai.agent.tools.read` is allowed and is not
   denied, plan-locked, or plane-excluded. Record lookup additionally requires
   the compiled entity `read` permission and its authorization scope.
7. The manifest permits the verified plane.
8. `atlas_tool_read` resolves through the strict autonomy and confidence
   policy path. Phase 7C.1 requires active `auto`, no confirmation requirement,
   and a zero automatic-confidence threshold because a model tool proposal has
   no trusted confidence score.
9. The manifest risk does not exceed the Phase 7C.1 platform ceiling of `low`.
10. Provider arguments pass the closed, bounded manifest JSON schema.
11. A canonical proposal is defined as a bounded
   `tool_call_complete` event with a call ID, tool name, and complete argument
   object. Its `proposed` row is durably inserted into
    `ai.ai_tool_invocation`.
12. Immediately before dispatch, Atlas rebuilds the plane IAM context, compares
    identity/profile/schema/fingerprint and authorization scopes, rechecks the
    exact permissions, rereads all feature gates, and resolves strict policy
    again. The handler is then marked `executing` with that guard.
13. The isolated handler runs with only an abort signal and an
    `AtlasDataGateway`-shaped read boundary. The catalog tool declares no data
    access. Record lookup permits one canonical record read; the gateway
    reauthorizes scope, calls `EntityQueryService.detail` directly, applies
    descriptor field masking and size bounds, and attaches a content-addressed
    source revision.
14. The result passes its output schema and byte ceiling, is hashed, and the
    invocation transitions to a terminal state before the result returns to
    the model as explicitly untrusted JSON.

Unknown, disabled, wrong-plane, unauthorized, malformed, over-budget, or
unrecordable calls never reach a handler.

An incomplete provider fragment that never reaches `tool_call_complete` is a
provider protocol failure, not an Atlas action proposal. It is captured on the
run/provider ledger and cannot execute.

Mesh is intentionally excluded from this first manifest. Mesh uses
`mesh.principal`, while the current durable conversation and invocation
contracts are anchored to `master.principal`. Do not add Mesh to a manifest
until a canonical actor mapping and cross-plane RLS/FK tests are approved.

## Durable ledger

`ai.ai_tool_invocation` stores identifiers, bounded policy/profile/
permission snapshots, lifecycle timestamps, auth epochs, hashes, and safe
evidence references. It intentionally has no columns for raw prompts,
arguments, results, provider secrets, confirmation tokens, or chain-of-thought.

The read-only lifecycle is:

```text
proposed -> executing -> completed
         \-> denied | failed | cancelled
```

Future states and fields for `confirmed` and `expired` are reserved, but no
mutation or confirmation execution path is registered in Phase 7C.1. Database
constraints and triggers reject illegal transitions, terminal-row mutation,
cross-run calls, principal mismatches, and execution without a resolved guard.

`SqlAtlasToolInvocationMaintenanceAuthority` provides the separately
authorized, read-only crash-recovery primitive for stale `proposed` or
`executing` rows. It cannot touch fresh, terminal, confirmed, mutation-shaped,
or business-transaction-linked rows. The no-payload
`atlas-tool-invocation-recovery` job runs only when persistence and tools are
both enabled and bootstrap has attested a separate `athyperadmin` connection.
Its admin service discovers tenant/plane scopes; queued data cannot select a
tenant, principal, plane, age, run, thread, or invocation.

Every enabled tenant must provision one active, unlocked service principal
whose exact code is `atlas.maintenance`. Recovery never borrows an unrelated
service or human principal. Scopes without that exact actor are skipped
fail-closed, reported separately, and do not consume the actor-backed recovery
batch limit.

## Server configuration

All values are server-only:

```dotenv
ATLAS_AGENT_TOOLS_ENABLED=false
ATLAS_AGENT_TOOL_MAX_ROUNDS=3
ATLAS_AGENT_TOOL_MAX_CALLS=4
ATLAS_AGENT_TOOL_MAX_ELAPSED_MS=120000
ATLAS_AGENT_TOOL_MAX_TOTAL_TOKENS=32768
ATLAS_AGENT_TOOL_TIMEOUT_MS=10000
ATLAS_AGENT_TOOL_MAX_INPUT_BYTES=32768
ATLAS_AGENT_TOOL_MAX_RESULT_BYTES=32768
```

`ATLAS_AGENT_TOOLS_ENABLED=true` is rejected at startup unless
`ATLAS_CONVERSATION_PERSISTENCE_ENABLED=true`. Per-tool manifest time and
result limits can only reduce the loop-level ceilings. The configured stale-run
timeout must also exceed the maximum tool-loop elapsed time by the required
safety margin, so recovery cannot terminalize a valid live loop.

## Controlled enablement

Enable in this order for a supervised tenant:

1. Apply and verify the conversation and tool-invocation DDL, RLS, triggers,
   indexes, and Prisma contract.
2. Provision and verify the exact `atlas.maintenance` service principal for
   every pilot tenant. It must remain active, unlocked, and marked
   `is_service_account=true`.
3. Confirm the separate maintenance URL authenticates as `athyperadmin`, then
   confirm Atlas conversation purge, stale tool-invocation recovery, and the
   tool ledger are operational.
4. Grant `ai.agent.use`, the required history permissions, and
   `ai.agent.tools.read` only to the pilot principals.
5. Set tenant policy for `atlas_tool_read` only if it should differ from the
   platform low-risk read default.
6. Enable the conversation-persistence environment and tenant gates.
7. Enable the governed-tools environment gate and
   `atlas_agent_tools_enabled` for the tenant.
8. Enable `atlas.tools.catalog_help` for the tenant.
9. Validate catalog help, then enable `atlas.tools.record_lookup` only for the
   certified `company_code` pilot.
10. Run the cross-tenant, denied-permission, company-scope, field-mask,
   stale-profile/scope,
   policy/feature-revocation, malformed-schema, duplicate-call,
   timeout, cancellation, and provider conformance checks before traffic.

Do not enable any proposal or mutation manifest under the 7C.1 executor.

## Monitoring and incident response

Investigate:

- invocations left in `executing`, which indicate interrupted execution or a
  terminal-recording failure;
- repeated `denied` rows, grouped only by bounded error class and tool code;
- tool-loop round, call, elapsed-time, input, result, or token-budget failures;
- provider tool protocol mismatches;
- ledger/RLS write failures, which fail the run closed;
- any mismatch between a run's tool-call count and its invocation rows;
- `athyper_atlas_tool_invocation_recovery_runs_total{outcome="failed"}`;
- any non-zero increase in
  `athyper_atlas_tool_invocation_recovery_rows_total{result="skipped_missing_authority"}`,
  which means at least one stale tenant/plane scope lacks a valid exact
  `atlas.maintenance` actor.

Do not log raw arguments or results while diagnosing. Use the input/result
hashes, run ID, thread ID, tool-call ID, revisions, and timestamps.

## Rollback

Rollback is non-destructive:

1. Disable `atlas.tools.record_lookup`, then disable
   `atlas.tools.catalog_help`.
2. Disable tenant `atlas_agent_tools_enabled`.
3. Set `ATLAS_AGENT_TOOLS_ENABLED=false` on the next service deployment.

The same public Atlas model IDs and conversation history remain valid. Provider
bindings return to text-only behavior, and existing invocation rows remain
governed by their retention and RLS rules.

## Promotion boundary

Further entities require separate manifest certification and gateway tests;
`atlas_record_lookup` must not be widened through a model argument or feature
flag. Bounded record search, server-loaded documents, form proposals,
confirmation tokens, and mutations require separate promotion gates and are
not unlocked by this runbook.
