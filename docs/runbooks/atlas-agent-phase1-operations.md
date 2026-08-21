# Atlas Agent Phase 1 operations

## Purpose and scope

This runbook covers the Phase 1 Atlas conversational service in Neon. The
supported path is text-only, uses public Atlas model modes, and makes one exact
Anthropic model call per run. Tools, live tenant-data access, RAG, conversation
persistence, customer BYOK, provider failover, and automatic retries after
visible output are outside this release.

Promotion boundary: keep the service default-off and use it only for supervised
internal smoke. It is not approved for tenant pilot, customer billing,
sensitive tenant data, or production traffic yet.

Atlas fails closed. A missing or unhealthy dependency must make the effective
catalog unavailable; it must never silently select another provider, model, or
credential.

## Schema prerequisite

Phase 1 introduces `ai.ai_agent_run` and `ai.ai_agent_call` as new tables and
currently supports clean provisioning only. Before applying the DDL, confirm
that neither table exists in the target database. If an earlier draft was
provisioned, reset only a disposable developer database or stop and create a
reviewed additive migration; never drop or rewrite an append-only ledger in a
shared environment. Customer-pilot promotion requires clean-schema and
upgrade-schema PostgreSQL smoke tests.

## Runtime controls

| Control | Scope | Expected effect |
|---|---|---|
| `ATLAS_AGENT_ENABLED=false` | Global runtime | Agent model and run routes return unavailable/not found before provider access. |
| `control.feature_flag.code = 'atlas_agent_enabled'` | Tenant/release | Disabled tenants cannot load a catalog or start a run. |
| `control.feature_flag.code = 'atlas_agent_neon_enabled'` | Tenant/plane | Required in addition to the global tenant flag for the Phase 0 Neon allowlist. |
| `control.feature_flag.code = 'atlas_agent_mesh_enabled'` | Tenant/plane | Default-off and ineffective while the Phase 0 Mesh policy ceiling denies chat. |
| `control.feature_flag.code = 'atlas_agent_admin_enabled'` | Tenant/plane | Default-off and ineffective while the Phase 0 Admin policy ceiling denies chat. |
| `ai.agent.use` | Principal | A denied principal cannot load a catalog or start a run. |
| `ai.agent.feedback.submit` | Principal | Allows thumbs-up/down on an owned Atlas run/message. Grant it with `ai.agent.use` for the supervised internal cohort. |
| `ATLAS_AGENT_DEFAULT_PUBLIC_MODEL` | Global default | Chooses `atlas-fast`, `atlas-balanced`, or `atlas-best`; it does not name a provider model. |
| `ATLAS_AGENT_ANTHROPIC_*_MODEL` | Exact server binding | Pins each public Atlas mode to one upstream model ID. |
| `ATLAS_AGENT_PROVIDER_TIMEOUT_MS` | Provider call | Bounds total provider-call time. |
| `ATLAS_AGENT_STREAM_IDLE_TIMEOUT_MS` | Streaming call | Cancels a stream that stops making progress. |
| `ATLAS_AGENT_MAX_OUTPUT_TOKENS` | Provider request | Bounds requested provider output tokens. |
| `ATLAS_AGENT_MAX_OUTPUT_BYTES` | Runtime stream | Hard local ceiling on emitted response bytes, independent of provider behavior. |
| `ATLAS_AGENT_USER_RUNS_PER_MINUTE` | Principal | Rejects excess runs before provider invocation. |
| `ATLAS_AGENT_TENANT_RUNS_PER_MINUTE` | Tenant | Rejects excess tenant runs before provider invocation. |

Changing a binding or default requires a normal configuration deployment. Do
not place provider keys in application, browser, or public environment files.

The Neon shared shell revalidates the effective Atlas catalog every 60 seconds.
Disabling the global runtime, tenant, Neon-plane, permission, or eligible-model
gate therefore hides new Atlas entry points within 60 seconds plus one catalog
request. A tenant/principal/plane/auth-epoch change invalidates the client scope
immediately, cancels active work, closes Atlas, and clears in-memory messages.

## Readiness checks

Before enabling a tenant, confirm:

1. The server configuration parses and the idle timeout does not exceed the
   total provider timeout.
2. The platform Anthropic credential resolves as a request-scoped lease through
   the provider credential resolver, reaches only the selected adapter, and is
   never returned to the client or written to logs/the ledger.
3. At least one exact Atlas binding reports implemented, configured, and
   eligible. `/readyz` intentionally reports Atlas as degraded while the
   credential is configured but not live-verified.
4. `GET /api/ai/agent/models`, through the normal relay and authenticated
   Neon session, returns only public Atlas modes and a policy revision. The
   same request through Mesh or Admin must return no eligible models.
5. The requested public model resolves to the same binding in the catalog and
   run paths.
6. A test run records separate requested public model, binding, provider, and
   actual upstream model values in `ai.ai_agent_run` and
   `ai.ai_agent_call`.
7. A denied principal and a disabled tenant produce no provider-call ledger
   row.
8. The Neon panel retains the financial-information verification warning and
   does not advertise tools, vision, history, or server persistence.
9. The internal-evaluation principal has both `ai.agent.use` and
   `ai.agent.feedback.submit`; a thumbs response succeeds only for the exact
   server-generated run/message pair.

## Signals and triage

Use structured Atlas logs and the append-only ledgers to distinguish:

- catalog denials from upstream failures;
- user and tenant rate limiting;
- credential missing versus credential rejected;
- provider 4xx, 429, 5xx, timeout, stream-idle timeout, cancellation, and
  truncation;
- requested public model, resolved binding, and provider-returned actual model;
- time to first token, total duration, usage, and feedback outcome.

Never add prompts, responses, tool arguments/results, retrieved evidence, raw
provider error bodies, API keys, or unkeyed secret identifiers to logs or
metrics.

Initial incident questions:

1. Is the failure global, tenant-specific, principal-specific, or limited to one
   public model?
2. Did policy deny the run before an upstream call?
3. Was the exact binding eligible at request time?
4. Does the call ledger show a provider request ID and actual model?
5. Did output begin before the failure? If yes, do not retry automatically.
6. Is usage final, partial, estimated, or unavailable?

## Emergency global shutdown

1. Set `ATLAS_AGENT_ENABLED=false` in the server runtime configuration.
2. Deploy/restart the API service through the standard environment process.
3. Verify both model and run endpoints fail closed.
4. Verify no new `ai.ai_agent_call` records appear after the cutoff.
5. Keep existing append-only run/call records for reconciliation.
6. Record the incident window, configuration revision, and last accepted run.

Use the tenant feature flag instead when the incident is isolated to one tenant.
Do not remove ledger rows or rewrite terminal outcomes during containment.

## Provider credential compromise or revocation

1. Disable Atlas globally before revoking a credential if calls may still be in
   flight.
2. Revoke the affected key in the provider console or approved secret store.
3. Rotate the server-side secret reference; never paste the key into a ticket,
   chat, log query, or environment example.
4. Restart/redeploy the runtime so credential readiness is recomputed.
5. Confirm the credential fingerprint changes while the raw credential remains
   absent from logs and ledgers.
6. Run readiness and one non-sensitive smoke request.
7. Re-enable only after the exact binding is healthy and eligible.

If the provider reports unauthorized credentials, the runtime removes that
adapter from catalog eligibility for the life of the process. Before the first
provider call, a non-empty key is only configured—not live-verified—so a
supervised smoke request remains mandatory. Atlas must not fall back to another
credential owner.

## Provider outage, throttling, or degraded streaming

1. Confirm the affected provider, exact binding, region, and error class using
   call-ledger metadata and provider status information.
2. If failures are sustained, remove the affected supervised internal
   evaluation cohort or disable Atlas globally. Phase 1 has no cross-provider
   failover.
3. Honour provider retry-after information for requests that have emitted no
   user-visible delta.
4. Never automatically retry a run after text has reached the user.
5. Treat incomplete, cancelled, and truncated streams as terminal observable
   outcomes; retain any provider-reported usage for reconciliation.
6. Restore service only after a smoke run proves canonical event ordering, one
   terminal event, and a matching actual model.

## Upstream model retirement or binding mismatch

1. Disable the affected public mode or Atlas globally before changing its
   binding.
2. Add and review a code-owned model profile first: exact ID, supported
   capabilities/parameters, context/output limits, inference geo, all token
   and cache price rates, and a price version.
3. Only then pin that reviewed ID in the relevant
   `ATLAS_AGENT_ANTHROPIC_*_MODEL` server setting.
4. Deploy the configuration and verify the effective catalog has a new policy
   revision.
5. Run exact-binding regression tests for all public modes, including two modes
   on the same provider.
6. Confirm the provider-returned actual model matches the resolved binding.
7. Re-enable gradually. A mismatch is a hard failure unless the binding
   explicitly permits a documented provider alias.

Never reuse an old binding identifier for a different upstream model.

## Rollback

Rollback is configuration-first:

1. Disable the supervised internal evaluation cohort or global runtime gate.
2. Restore the last known-good public-model bindings and timeout/rate settings.
3. Deploy the last known-good application version if configuration rollback is
   insufficient.
4. Validate schema compatibility before rolling application code behind a
   database migration. The run and call ledgers are append-only and must remain
   readable.
5. Run focused provider, route-denial, relay-stream, UI scope-reset, and Neon
   smoke tests.
6. Re-enable one internal evaluation tenant, observe, then continue the
   supervised smoke rollout.

## Required incident evidence

Capture only non-content metadata:

- incident and deployment timestamps;
- tenant ID and run/call IDs where policy permits;
- public model, binding, provider, actual model, adapter version, and policy
  revision;
- status/error class, provider request ID, timing, retry count, and usage
  semantics;
- credential owner, versioned credential fingerprint, and versioned reference
  hash, never a secret or raw secret reference;
- the control used to contain and restore service.

The operational owner must reconcile any run whose ledger write failed before
using usage or provider cost data. Phase 1 records no customer-billable amount.
