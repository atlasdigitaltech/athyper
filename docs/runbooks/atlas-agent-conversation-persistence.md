# Atlas Agent conversation persistence operations

## Purpose and release boundary

This runbook covers the default-off server conversation persistence foundation
for Atlas. When enabled for an approved tenant, Athyper owns the thread,
transcript, bounded model history, run state, retention metadata, and purge
lifecycle. Provider thread or response identifiers never become conversation
authority.

The queue-level maintenance procedure is documented separately in
[Atlas conversation retention and purge](./atlas-conversation-retention.md).

The implementation supports private thread creation, cursor-paginated history,
resume, rename, archive, soft delete, tenant retention overrides, bounded
transcript export, deterministic purge, and a gated history rail. Customer
production rollout, support access, and sensitive-cohort application-level
content encryption remain unapproved. Support access stays absent; there is no
Admin RLS bypass.

## Schema and deployment prerequisite

Provision the Atlas additions before enabling either persistence gate:

- `master.atlas_thread`, one-to-one with `master.conversation`;
- append-only `master.atlas_message`;
- durable `event.atlas_run`;
- the `atlas_agent` conversation type;
- Atlas owner/participant RLS helpers and policies;
- `ai.agent.history.read`, `ai.agent.history.manage`,
  `ai.agent.history.delete`, and reserved `ai.agent.history.export`
  permissions.

For an environment upgraded from an earlier draft, run the read-only additive
schema check. A failure requires a reviewed additive migration; never drop or
rewrite retained transcripts or durable run records.

```text
pnpm --filter @athyper/db db:verify:atlas-upgrade
```

Run Prisma generation after DDL changes and validate both the static schema
contract and behavioral PostgreSQL RLS fixture before rollout.

## Activation controls

All controls are conjunctive. A missing control fails closed.

| Control | Scope | Required behavior |
|---|---|---|
| `ATLAS_AGENT_ENABLED=true` | Server environment | Enables the Atlas base runtime. |
| `atlas_agent_enabled` | Tenant feature flag | Allows that tenant to use Atlas. |
| `ai.agent.use` | Principal | Allows a verified principal to start a run. |
| `ATLAS_CONVERSATION_PERSISTENCE_ENABLED=true` | Server environment | Installs the durable coordinator and exposes guarded history routes. |
| `atlas_conversation_persistence_enabled` | Tenant feature flag | Selects durable history for that tenant. |
| `ai.agent.history.read` | Principal | Allows create/list/read of private history. |
| `ai.agent.history.manage` | Principal | Allows owner rename/archive. |
| `ai.agent.history.delete` | Principal | Allows owner soft delete. |
| `ai.agent.history.export` | Principal | Allows the bounded JSON transcript export route. |
| `ATLAS_CONVERSATION_HISTORY_ENABLED=true` | Neon server-rendered shell | Enables the explicit read/resume UI cohort; the rail remains hidden until the server confirms effective access. |

The Neon client history rail has an explicit server-rendered shell option and
capability check. It remains absent until the authenticated list request
succeeds, proving the tenant flag, plane policy, and `history.read` permission.
The first activation enables read/resume only. Archive/delete options remain
off until their permission and legal-hold gates are separately promoted.

## Server configuration

| Setting | Meaning |
|---|---|
| `ATLAS_CONVERSATION_RETENTION_DAYS` | Current fixed effective retention period. |
| `ATLAS_CONVERSATION_MIN_RETENTION_DAYS` | Platform lower bound for a future tenant resolver. |
| `ATLAS_CONVERSATION_MAX_RETENTION_DAYS` | Platform upper bound for a future tenant resolver. |
| `ATLAS_CONVERSATION_CONTEXT_MAX_MESSAGES` | Maximum recent completed messages loaded into a provider request. |
| `ATLAS_CONVERSATION_CONTEXT_MAX_CHARACTERS` | Independent character ceiling for loaded history. |
| `ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS` | Age after which an owner-scoped unfinished run is safely failed as interrupted; it must exceed the provider deadline. |
| `ATLAS_CONVERSATION_PURGE_BATCH_SIZE` | Maximum threads selected by one maintenance execution. |
| `ATLAS_CONVERSATION_MAINTENANCE_DATABASE_URL` | Separate connection whose login has the Atlas-only maintenance role and does not have the application role. |
| `ATLAS_CONVERSATION_CONTENT_PROTECTION_MODE` | `database_at_rest_non_sensitive_only` by default; `tenant_protected_store` requires an approved, server-injected store and complete readiness evidence. |

The configured default retention must be within the configured minimum and
maximum. Scheduler and worker runtimes leave purge inactive when the
maintenance database URL is absent or invalid. The API runtime neither needs
nor receives this privileged secret. Keep it in the approved server secret
store and inject it only into scheduler/worker processes; never put it in
browser/app environment files.

The fallback policy identifier is
`atlas-default-<ATLAS_CONVERSATION_RETENTION_DAYS>d-v1`. An active
`control.atlas_conversation_retention_policy` row may shorten or otherwise
override retention within platform bounds. The list API resolves that policy
for the verified tenant and returns its policy ID, days, and approved display
copy from the same decision, including when the list is empty.

## Request and transcript lifecycle

For a persisted request, the runtime:

1. verifies tenant, principal, realm, plane, profile, auth epoch, Atlas
   permission, environment gates, and tenant flags;
2. resolves the exact public Atlas binding and provider credential;
3. creates or resolves the private thread and transactionally appends the user
   message, pending assistant message, and idempotent run before provider I/O;
4. ignores client-supplied history and loads only completed server-owned
   messages preceding this input, bounded by both history limits;
5. streams the provider result through the canonical Atlas protocol;
6. writes the append-only metering ledger;
7. terminalizes the durable assistant message and run, linking the metering run
   where available.

Message ordering is allocated under a thread row lock. Only the immutable owner
can append or terminalize messages and runs; a participant is read-only in this
foundation. Concurrent active runs on one thread are rejected.

The same tenant-scoped `client_request_id` replays the existing run and message
pair. It must not create another thread, message, provider invocation, or run,
including when the client retries an initial request before receiving its new
thread ID.

If an API process dies after this transaction, a `started` run can remain
without a terminal stream event. After the configured stale-run deadline, the
next owner-scoped run transaction marks that run and its pending assistant
message failed with safe class `process_interrupted` and empty content. An
exact retry replays the terminal failure and never calls the provider again; a
new client request can then continue the thread. Fresh active runs still reject
concurrency. Recovery is lazy on the next run attempt, and the recovered run
has no metering link because provider usage after a process crash is unknown.
Every recovery emits `atlas_agent_stale_run_recovered` and increments
`athyper_atlas_stale_run_recoveries_total{plane=...}`. Alert on sustained
non-zero recovery after excluding planned process termination windows.

## Partial output policy

Completed assistant text is stored exactly as streamed. For a failed or
cancelled run, this foundation discards partial assistant text, terminalizes the
pending assistant message with an empty body, and excludes it from future model
context. The run status and safe terminal error class remain durable.

Do not change this behavior only in the UI or provider adapter. Persisting
partial text requires one reviewed product/security/retention policy and common
conformance tests across every provider.

## Access-control invariants

- Every request transaction sets tenant, principal, and plane RLS context.
- Repository SQL repeats those boundaries explicitly as defense in depth.
- Thread tenant, plane, and owner are immutable.
- Tenant and conversation relationships use composite foreign keys.
- The owner is a participant; participant revocation removes read access.
- Same-tenant non-owners, wrong-plane callers, and other tenants fail closed.
- No support/admin bypass is exposed through customer routes.
- Operational logs and metrics contain identifiers and safe error classes, not
  prompts, responses, summaries, tool data, citations, or provider bodies.

Retained text for the initial non-sensitive cohort relies on the approved
database/storage encryption boundary. Sensitive mode is an explicit
fail-closed server setting. When selected, startup requires a server-injected
tenant-aware store whose readiness attests encryption, rotation, tenant
isolation, deletion/purge, backup recovery, and revoked-key behavior. The SQL
repository then writes empty `content_blocks` plus an opaque, versioned
`protected_content_ref`, and resolves that reference only with the verified
tenant/principal/plane scope. Inline content and a protected reference cannot
coexist. No production store is selected by this codebase; sensitive cohorts
remain blocked until Security approves and injects an adapter that passes the
same contract and its operational recovery tests.

## Retention, deletion, legal hold, and purge

User delete is an optimistic, owner-authorized soft delete and requires the
current quoted `If-Match` row version. Legal hold rejects user deletion.

The scheduled purge path:

1. uses only a login that has `athyperadmin_atlas_maintenance` and does not
   have `athyperapp`;
2. accepts no tenant or principal selector in its job payload;
3. marks expired, non-held threads for purge in bounded batches;
4. hard-deletes only rows already eligible for purge;
5. relies on database cascades for inline Atlas messages/runs and the
   conversation envelope; protected-store adapters must additionally attest
   their durable external-object purge workflow before sensitive mode starts;
6. records counts and timing only, never transcript content.

Never reuse the normal application database connection for cross-tenant
maintenance. If the privileged credential is unavailable, leave the job
disabled/degraded and alert; do not broaden application-role permissions.

Before production promotion, prove legal-hold exclusion, expiry selection,
soft-delete-to-purge timing, bounded batching, worker retry behavior, and
physical removal through a disposable PostgreSQL integration fixture.

## Readiness and rollout

Use this order:

1. Apply and validate the clean schema in a disposable environment.
2. Run static contract, Prisma, and behavioral RLS checks.
3. Start API, worker, and scheduler with persistence still disabled.
4. Confirm memory-only Atlas behavior and current clients are unchanged.
5. Enable the environment switch in a non-production environment.
6. Grant history permissions only to an internal test principal.
7. Enable the tenant persistence flag for one synthetic-data tenant.
8. Test create, resume, retry, pagination, rename, archive, delete, legal hold,
   purge, cancellation, failure, and provider switching.
9. Enable the UI history capability only after API and retention-copy checks
   pass.
10. Observe a supervised soak before any non-sensitive tenant pilot.

Minimum promotion evidence:

- identical bounded history after reload/resume;
- no duplicate thread/message/run/provider call for an idempotent retry;
- client history tampering has no effect;
- owner/non-owner, participant/revocation, tenant, and plane isolation pass;
- completed text and metering linkage reconcile;
- failed/cancelled partial content follows the documented policy;
- exact configured retention appears in an empty and non-empty history rail;
- legal hold and deterministic purge pass end to end.

Transcript export exists behind `ai.agent.history.export`, bounded message
counts, private/no-store response headers, and explicit audit logging. Product
UX remains disabled until separately approved. Support access remains
unavailable rather than simulated; do not add an Admin RLS bypass.

## Incident handling

For privacy or authorization incidents, disable
`atlas_conversation_persistence_enabled` for the affected tenant first; use
`ATLAS_CONVERSATION_PERSISTENCE_ENABLED=false` for a global incident. This
stops new durable runs and hides history routes without changing provider
bindings or deleting evidence.

For purge incidents, stop the scheduler/worker or remove only the maintenance
credential. Do not disable RLS, run ad hoc cross-tenant deletes with the
application role, or shorten retention configuration as an incident shortcut.

Investigate with non-content metadata:

- tenant, principal, plane, thread, message, run, and client-request IDs where
  policy permits;
- feature-flag and permission decisions;
- row version, sequence, status, safe error class, timestamps, and metering ID;
- maintenance job ID, selected/marked/purged counts, and database role.

## Rollback

1. Disable the tenant persistence flag or the global persistence environment
   switch.
2. Leave retained rows and schema in place; existing Atlas requests return to
   memory-only behavior.
3. Disable the history UI capability for the same cohort.
4. Stop the purge worker if retention behavior is under investigation.
5. Roll application code back only to a version that tolerates the additive
   schema.
6. Do not drop Atlas tables, rewrite terminal messages, or delete the metering
   ledger during rollback.

Re-enablement requires the original isolation, idempotency, retention, and
purge evidence to pass again.
