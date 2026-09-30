# server/db code review — 2026-09-09

**Follow-up:** fixes and development execution are recorded in [2026-09-10 results](server-db-fixes-20260910.md). The findings below preserve the original review.

Reviewed the current working tree on `stack-v2-foundation`. No implementation changes were made. Existing unrelated working-tree changes were preserved.

**Result: seven actionable findings, including two P1 issues.** The supplied audit correctly identifies the withdrawal failure and discovery key limit; its date observation has a reproducible idempotency consequence. The suggested supplier wildcard bug does not reproduce.

## Findings

### 1. P1 — Fresh provisioning fails in every plane

**Location:** `server/db/ddl/common/ai/05_constraints.sql:374`.

`ai_agent_call_aac_completed_usage_chk`, attached to `ai.ai_agent_call`, references `model_call_count` and `tool_call_count`. Those are columns of `ai.ai_agent_run`, not `ai.ai_agent_call`. PostgreSQL rejects the constraint with `column "model_call_count" does not exist`.

**Reproduction:** ran the repository foundation runner independently for Studio, Neon, and Mesh against an empty, isolated PostgreSQL 16.13 container. All three stopped at `common/ai/05_constraints.sql` with this error. The September 9 migration changes only the run constraint, so it does not expose this fresh-install failure on an existing database.

**Fix:** retain the provider-usage requirement on model-call records; apply the tool-only exception only to the run constraint at line 440. Add a fresh-manifest provisioning gate, in addition to migration tests.

### 2. P1 — Relationship suspension does not revoke protected bank-token retrieval

**Location:** `server/db/ddl/planes/mesh/mesh/11_grants.sql:2070–2074`.

`mesh.command_retrieve_bank_protected_token` checks the recipient tenant, disclosure state/version/expiry, purpose, and active payments capability. It never checks the parent relationship's status or effective dates. Relationship suspension/termination updates relationship scopes but does not end the capability or revoke the disclosure (`mesh/07_functions.sql:913`). Consequently, an existing disclosure and active capability still authorize token retrieval after the relationship is suspended or terminated.

**Reproduction:** created synthetic bank/disclosure fixtures in the isolated database, suspended the relationship through `command_network_relationship_lifecycle`, then invoked retrieval as a separate non-superuser login inheriting only `athyper_protected_value_retriever`. It returned the synthetic protected token successfully. Fixture construction used replication mode to bypass unrelated fixture triggers/FKs; normal triggers and role checks were enabled for suspension and retrieval. This is a focused command-boundary reproduction, not a complete onboarding test.

**Fix:** revalidate and appropriately lock the parent relationship at retrieval time, including its effective interval. Check participant account eligibility as required by the retrieval contract. Cover suspension, termination, date expiry, and concurrent revocation; replayed retrieval must also revalidate eligibility.

### 3. P2 — Expired registration invitations can still be accepted

**Location:** `server/db/ddl/planes/mesh/mesh/11_grants.sql:1728`; mirrored in `server/db/migrations/20260906_mesh_exchange_readiness.sql:272`.

The lifecycle guard checks time only for the explicit `expire` action. A counterparty can call `accept` whenever the persisted status is `issued`, even after `expires_at`. Expiration therefore depends on another actor first executing the expiry command.

**Reproduction:** issued a registration expiring in one second, waited 1.1 seconds, then accepted it as the counterparty. The command returned `accepted`, version 2.

**Fix:** reject acceptance when the invitation has expired, under the row lock already held. Add an expired-but-still-issued test. This records invalid acceptance; the registration function itself does not create a master record or directly grant relationship access.

### 4. P2 — A requested capability cannot be withdrawn using the permitted end transition

**Location:** `server/db/ddl/planes/mesh/mesh/11_grants.sql:1684–1687`, constraint at 1531–1534; migration lines 228–231.

Confirmed supplied finding #1. `end` explicitly allows `requested`, but leaves the approver NULL. The resulting `ended` row violates `network_relationship_capability_approval_chk`.

**Reproduction:** discovery creates a requested profile-exchange capability; invoking `end` as its requester fails on the named check constraint. The command and its evidence roll back.

**Fix:** define an explicit withdrawal state/transition, or permit unapproved ended episodes while retaining bilateral approval for activated episodes. Do not weaken rejection approval requirements without a corresponding domain decision.

### 5. P2 — Discovery retries change identity when the calendar date changes

**Location:** `server/db/ddl/planes/mesh/mesh/11_grants.sql:1698–1699`; migration lines 242–243.

With NULL `p_effective_from`, discovery passes NULL to the relationship command but `CURRENT_DATE` to the capability command. The latter includes the resulting date in its fingerprint. A retry with identical caller arguments on a different date replays the relationship, then raises `unique_violation` for the capability because its fingerprint changed.

**Reproduction:** submitted discovery with NULL start date, then retried identical inputs after changing the session timezone from UTC to Pacific/Kiritimati, crossing the calendar boundary. PostgreSQL returned `Mesh idempotency key was reused with a different command`. This simulates the same date dependency as a next-day retry. Also observed the relationship's NULL start and capability's concrete start date.

**Fix:** resolve the default once and persist it as part of the outer command result, or recover the original resolved date on replay. Simply applying `COALESCE(...,CURRENT_DATE)` to both nested commands does not fix next-day retries. Date divergence alone needs a domain-contract decision; retry failure is independently reproducible.

### 6. P2 — CirrusAtlantic authorization provisioning always aborts

**Location:** `server/db/scripts/provisioning/cirrusatlantic-demo-authorization-model.ts:139–141`.

`CIRRUSATLANTIC_OWNER_REVIEWER.permissions` contains four permissions, but the validator requires exactly three. `provision-cirrusatlantic-demo-authorization.ts:31` invokes this validator before provisioning, so the command always raises `CirrusAtlantic owner reviewer permissions are incomplete`.

**Reproduction:** the existing authorization-model test fails on this exact exception.

**Fix:** validate the required permission set or update the expected contract. Retain the fourth permission if it is required for workflow work-item reads.

### 7. P3 — Discovery has an undocumented 187-character idempotency-key ceiling

**Location:** `server/db/ddl/planes/mesh/mesh/11_grants.sql:1698`; migration line 242.

Confirmed supplied finding #2, with an exact boundary: `.relationship` is 13 characters, so an outer key of 188–200 characters exceeds the nested command's 200-character maximum. The wrapper does not validate its own key contract.

**Reproduction:** a 188-character key fails in `command_request_network_relationship` with `Invalid relationship request`.

**Fix:** derive bounded, collision-resistant child keys, or explicitly validate/document a 187-character outer limit. Test the boundary and retain consistent validation of caller keys.

## Verdict on the supplied audit

| Audit point | Verdict |
|---|---|
| #1 Requested capability end | Confirmed; finding 4. |
| #2 Discovery key length | Confirmed; exact maximum is 187 characters, finding 7. |
| #3 Discovery date divergence | Confirmed observation; strengthened to a reproducible retry bug, finding 5. |
| #4 Hand-copied migration / no drift guard | Maintenance concern, not independently a runtime bug. Historical migrations are intentionally snapshots: do not mechanically keep them identical to evolving canonical DDL. Fix the canonical definition and provide an upgrade migration for deployed databases; test that upgrade and fresh-install outcomes agree. |
| #5 Malformed principal GUC cast | Confirmed raw cast at migration line 50, and another at line 84. A malformed UUID raises `22P02`. It fails closed; severity depends on whether the caller violates the context contract and whether error mapping requires a different SQLSTATE. Treat as error-contract hardening, not an authorization bypass. |
| Identity replay composite FK | Target `(authority_tenant_id,id)` uniqueness exists. No missing-target-key issue found. |
| Deferred replay consumption pairing | No defect identified in the examined one-shot replay transition and deferred consumption pairing. This is not an exhaustive concurrency proof. |
| Lookup-domain change predicate | Examined deactivation and de-extensibility logic is coherent. |
| Supplier all-NULL wildcard target | Not a bug under the table constraint: only `scope_kind='global'` allows all target columns NULL; finite kinds require their target. The overlap function excludes global from finite-kind matching and handles global exclusions separately. Isolated probes returned true for global/global and global/country, false for excluded-global. |

## Coverage and verification

- Inventory: 444 DDL-tree files; 287,263 SQL lines; eight dated migrations totaling 757 lines.
- Read all eight dated migrations, the corresponding canonical definitions, and adjacent relationship, bank-disclosure, replay, lookup, scope, saved-view, provisioning, and test code relevant to the findings.
- Ran `pnpm --dir server/db test`: **143 tests, 139 passed, 4 failed**. One failure is finding 6. The other three are BS360 source-contract tests: an old inline route regex, a missing `section-navigation.tsx` source path, and a formatting-sensitive descriptor regex. These were not promoted to runtime database bugs.
- Ran `scripts/checks/ddl/three-plane-model.ts`: passed.
- Attempted all three unmodified foundation manifests: each reproduced finding 1.
- Copied DDL to `/tmp/athyper-db-review/ddl`, corrected only the erroneous call constraint in that temporary copy, and resumed each failed build without receipt recording. All remaining entries completed: manifests contain 237 Studio, 217 Neon, and 213 Mesh entries. These successful continuations do not mean the original manifests pass.
- On the resulting isolated catalogs, all **999** tenant/authority-tenant table parents had ENABLE/FORCE RLS and at least one policy (Studio 266, Neon 512, Mesh 221). Scanned application SECURITY DEFINER functions, excluding public/extension and system schemas, had explicit search paths and no PUBLIC EXECUTE grants. This does not prove policy semantics, role ownership, or every function's authorization logic.
- Executed focused PostgreSQL probes for capability withdrawal, date divergence, key length, date-dependent replay, expired registration acceptance, bank retrieval after suspension, and supplier global overlap.
- Live application databases were not modified. The disposable container was removed after testing. Temporary SQL probes and logs remain under `/tmp/athyper-db-review`; unit/foundation logs also use the `/tmp/athyper-db-review-*.log` prefix.

This is a broad risk-based review with executable foundation coverage, **not a claim that every one of the 287k DDL lines or all seed, backup, generated Prisma, and operations code received manual semantic review**. Full migration upgrades from every historical baseline, end-to-end service authorization, and exhaustive concurrency tests remain outside the evidence gathered here.
