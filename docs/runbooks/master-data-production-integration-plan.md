# Master data production integration plan

Prepared: 2026-09-07. This is a delivery plan, not authorization to deploy, contact providers, or alter production configuration.

## Deployment work status

**Open — deferred by user.** QA, staging and production setup, qualification and rollout will be resumed later. Refer to the environment release records for retained findings and pending inputs.

## Current qualification status (2026-09-07)

The historical implementation findings below predate the completed local challenge, canonical authorization and maintenance work. Current QA/staging observations and remaining real-delivery work are tracked in [QA, staging and production closure](master-data-release/README.md). Local implementation is qualified only for development; the local-only challenge guards must remain enforced until a nonlocal ownership integration is implemented and qualified.

## Outcome and scope

Make the six `/api/master` routes operational in the selected production planes and tenants, with real provider ownership challenges, trusted signatures, registry-backed authorization, production persistence, and retained release evidence.

The repository, host registration, Ed25519 verifier, target binding, and transaction-based replay protection already exist. The last recorded local validation includes 11 PostgreSQL integration tests, 222 package tests, and host/configuration checks. The PostgreSQL suite installs a focused production-DDL subset in a disposable database; it does not certify a complete deployed environment. Re-run release checks against the exact release revision rather than treating these historical counts as a release certificate.

The protocol specification is [master-data-provider-verification.md](master-data-provider-verification.md).

## Findings that change the rollout work

1. `deploy/compose/instance/compose.parity.yaml` does not currently pass `MASTER_DATA_VERIFICATION_KEYS_JSON` to the API. Adding a variable to a Compose interpolation file alone will not inject it into a container. Add an explicit environment mapping or an equivalent supported configuration mount/loader.
2. The service uses six short permission strings. Searches did not establish production grants for these codes; `server/db/seed/contracts/authorization/AUTHORIZATION-REBUILD-PLAN.md` explicitly requires specialized services to migrate to the typed operation/capability registry without compatibility aliases. Establish the actual released registry mappings before enabling access.
3. No provider ownership-challenge workflow was implemented by the verifier work. A real provider integration must produce our signed attestation after successful verification; ordinary email/SMS delivery receipts do not prove ownership.
4. Key scope is tenant plus plane, not deployment environment. Reusing a key and tenant IDs across staging and production could make staging proofs valid in production. Use separate environment signing keys and disjoint trust configurations. If that separation is impossible, explicitly version the protocol to include deployment audience before rollout.
5. The replay policy requires strictly increasing issuance timestamps per contact and returns 409 for committed retries. Provider retries and client UX must accommodate that policy. It is not a globally unique evidence-ID ledger.

## Delivery decisions and owners

Assign named owners before execution. The roles below are responsibilities, not existing assignments.

| Decision/deliverable | Accountable role | Required output |
| --- | --- | --- |
| First plane/tenant cohort and supported channels | Product/domain owner | Explicit launch scope; verification support matrix |
| Provider and signing arrangement | Integration lead | Provider capability assessment and integration contract |
| Permission registry mapping and principal scopes | IAM owner | Reviewed permissions, roles, entitlements, and scope rules |
| Keys, expiry, rotation, revocation | Security/platform owner | Public-key fingerprints, trust scopes, lifecycle procedure |
| Database compatibility and migrations | Database/backend owner | Per-plane schema/grant compatibility report |
| Deployment configuration and operations | Release/SRE owner | Configuration overlay, probes, dashboards, rollback package |
| Acceptance tests and release evidence | QA/release owner | Passing scenario report tied to artifact digest |

Resolve these inputs in the first milestone:

- Which planes and tenants launch first? A single controlled cohort reduces the initial rollout surface; define scope explicitly rather than assuming Neon-only production.
- Is initial ownership verification email, SMS/phone, or both? Define behavior for fax, WhatsApp, website, and other channels. Never label an unsupported channel verified merely because its address/value is syntactically valid.
- Can the provider emit protocol-v1 Ed25519 attestations? If not, use a trusted attestation bridge that validates the provider result and signs only verified server-side challenge coordinates.
- Who may request verification, complete a challenge, and issue an unverify/revocation? Ownership verification and administrative correction need separate authority rules.
- What are the delivery, availability, latency, and observation-window acceptance thresholds? Agree measurable thresholds before the canary rather than inventing them during an incident.

## Milestone 1 — Establish release and authorization prerequisites

**Tasks**

1. Freeze the candidate source revision and inventory all existing working-tree changes. Keep this release's patches identifiable.
2. Map each route to the intended typed operation/capability and required resource scope:
   - Contact create/deactivate currently requests `master.contact.pii.write`.
   - Address create/deactivate currently requests `master.address.pii.write`.
   - Verification currently requests `master.contact.verify`.
   - Profile requires `master.profile.read`, `master.contact.pii.read`, and `master.address.pii.read`.
3. Resolve whether the canonical registry already contains suitable operations. Implement missing definitions, mappings, and service calls through the existing registry process. Do not add broad aliases solely to make tests pass.
4. Verify that contact-ID mutations receive the resource coordinates required by production scope evaluation. Tenant isolation alone does not demonstrate authorization between owners or organizations within one tenant. Add same-tenant, out-of-scope negative tests using real IAM decisions.
5. Create separate challenge-request and attestation-service principals as needed. A caller proving contact ownership must not obtain unrestricted master-data mutation permissions.
6. Inventory schema differences between the candidate DDL and each target plane. Prepare forward migrations only where necessary; do not run clean-install DDL against an established environment.

**Artifacts:** route-to-permission matrix, reviewed registry changes, launch scope, migration inventory, candidate revision.

**Exit gate:** the candidate authorization model is enforceable with real tokens and least-privilege principals; unsupported mappings are resolved, not bypassed with token-only test permissions.

## Milestone 2 — Connect ownership verification and attestation

**Proposed workflow**

1. An authenticated, authorized caller requests verification for a contact.
2. The server reads the normalized stored contact value and creates a durable challenge bound to plane, tenant, contact, channel, value, requested result, and expiry.
3. The provider delivers a one-time code or link through the selected channel.
4. The completion handler verifies the challenge using the provider's authoritative verification result. Authenticate callbacks and validate their correlation; do not trust browser-submitted `verified=true` or a delivery-success event.
5. The trusted provider or bridge creates the protocol-v1 attestation for that exact challenge target.
6. An authorized server-side integration submits the proof to the existing verification operation using tenant/plane context derived from the challenge record.
7. The master-data service locks the current contact, checks signature and target, applies the state, and commits evidence, audit, and outbox together.

New challenge start/complete endpoints, storage, and callback handlers are proposed work; they do not currently exist as part of these six routes. Finalize their exact contracts after provider selection.

**Implementation tasks**

- Define challenge states such as pending, succeeded, expired, and cancelled, with durable correlation and single-use completion.
- Set challenge TTL, resend limits, attempt limits, and per-contact/principal abuse controls. Keep codes/tokens out of logs; store only an appropriate verifier or hash when the system itself validates a secret.
- Invalidate or reject a challenge if the current contact value changes. Re-read trusted state before issuing proof; the master verifier independently checks the locked value again.
- Handle provider timeout, duplicate callback, retry, delayed callback, and expired proof. Never generate a fresh success attestation merely to bypass a replay rejection without authoritative challenge state.
- Specify unverify/revocation evidence separately; an old positive proof cannot authorize `verified=false`.
- Coordinate monotonically increasing issuance per contact across retries, replicas, provider changes, and key rotation. Keep clocks synchronized. Do not generate future timestamps to force ordering; if two events share a millisecond, serialize issuance until wall time advances.
- Define outcome reconciliation for a timed-out PATCH that may already have committed. If exact outcome cannot be recovered from authoritative state/evidence, surface a conflict instead of claiming success from a 409 alone.
- Add deterministic contract tests for canonical bytes, signed envelopes, callback authentication, challenge-to-contact binding, and failure handling.

**Exit gate:** a real staging email/SMS challenge produces a signed proof accepted by the verifier; incorrect, expired, cancelled, or mismatched challenges cannot produce an accepted state change.

## Milestone 3 — Provision keys and deployable configuration

**Tasks**

1. Generate/manage the signing key in the provider or attestation boundary. Keep private key material out of the application verifier, source control, container images, and logs.
2. Exchange and verify the provider's public-key fingerprint through an authenticated administrative channel. Record provider, key ID, environment, owners, and revocation contact.
3. Build a separate `MASTER_DATA_VERIFICATION_KEYS_JSON` trust bundle for each environment. Each entry specifies Ed25519 SPKI public PEM, explicit tenant IDs, plane keys, and UTC key validity dates.
4. Add API environment plumbing to the deployment overlay. Use a default empty array when unconfigured. Public keys are not secrets, but trust-bundle integrity and restricted write access are essential.
5. If file-based injection is selected, implement and test its loader explicitly; the new setting currently consumes a JSON environment variable and does not automatically support a `_FILE` variant.
6. Validate composed configuration without dumping unrelated credentials. Confirm the running API has the expected key IDs/fingerprints and scopes using a redacted inspection procedure.
7. Restart/redeploy all API replicas to apply key changes. The verifier snapshots keys at startup and has no remote fetch or dynamic reload.
8. Add expiry monitoring and rehearse rotation with overlapping old/new key IDs, followed by retirement and rejection of the old key. Never reuse a key ID for different key material.
9. Rehearse emergency removal. Scope applies per configured provider/key entry; other still-trusted keys remain valid.

**Exit gate:** a valid bundle enables only intended scopes; malformed bundles fail startup; absent/empty bundles produce verification 503 while other operations remain available. Staging keys are rejected by production configuration in an offline configuration test.

## Milestone 4 — Qualify the complete staging stack

Deploy the candidate artifact and prepared forward migrations into staging. Exercise the normal gateway, IAM, API runtime, database pooler, physical plane databases, audit storage, and outbox consumers. Use the application's runtime database role, not a superuser.

**Infrastructure checks**

- Confirm registry/table/function/index/constraint versions on every launch plane, including owner registry purposes, tenant and country references, verification triggers, primary exclusion constraints, and RLS.
- Verify SELECT/INSERT/UPDATE and required function privileges, tenant/principal transaction settings, and transaction-pooler behavior under concurrent requests.
- Verify stored owner types resolve the intended metadata entity and physical owner table. Test absent owners, inaccessible owner types, and invalid purposes.
- Verify exact physical plane routing with independently identifiable fixtures in different databases. Existing cryptographic plane-binding tests do not prove this deployed routing.
- Verify actual audit/outbox records commit with the mutation, and that failed persistence leaves none of them committed. Test downstream event delivery separately: transactional enqueue does not guarantee consumer completion.
- Confirm address UTC date granularity and the end-after-start rule are acceptable to callers. Same-day address closure currently fails; any change to that product behavior requires an explicit schema/API decision.
- Confirm the default deactivation behavior and historical profile reads with data created on suitable dates.
- Add capability-level readiness/diagnostics where missing. The API Compose health check currently uses `/livez`; process liveness alone is not evidence that provider trust or master-data dependencies work.
- Define bounded metrics for verification outcome, provider latency/failure, replay conflicts, key expiry, database lock wait, and outbox backlog. Do not label metrics with contact values, raw tenant IDs, proof IDs, or signatures.

**Staging acceptance matrix**

| Scenario | Required result |
| --- | --- |
| Create contact/address and read profile | Correct normalized data, owner, dates, and tenant; expected audit/outbox evidence |
| Deactivate both record types | 204; excluded at/after end boundary; retained before boundary |
| Complete genuine provider challenge | Verification succeeds only for the bound target |
| Missing authentication / permission | 401 / 403; no mutation effects |
| Same tenant but unauthorized owner/organization | Denial under real scope rules; no PII disclosure |
| Foreign-tenant record ID | No foreign data or mutation; 404 when absent from tenant-scoped lookup |
| Proof for another reachable contact/value/state | 422; no evidence or state change |
| Wrong physical plane / signed plane | No fallback to another database; signed-context mismatch rejected |
| Unknown, retired, expired, or untrusted key | Proof rejected; no automatic key discovery |
| Concurrent duplicate or primary creation | At most one conflicting record committed; expected conflict response |
| Concurrent signed-proof reuse | One success; other request gets replay 409 |
| Previously committed exact retry | Replay 409 according to current policy; client reconciles outcome |
| Audit/outbox persistence failure | Mutation and evidence roll back; valid retry can succeed |
| Contact change racing verification | Row locking prevents in-transaction stale-value use; subsequent stale proof fails |
| Provider outage / absent configuration | Explicit recoverable failure; no fabricated successful verification |
| Key rotation and retirement | Both keys work during approved overlap; retired key fails after reload |

Also review how any separate contact-value editing path clears or invalidates existing verification. The verification lock protects the current transaction; it does not itself define behavior for a later edit by another service.

**Evidence:** artifact digest, source revision, migration versions, environment/plane, test identity roles, fixture IDs with restricted access, timestamps, expected/actual statuses, redacted audit/outbox references, key fingerprints, and unresolved defects. Never retain OTPs, private keys, or raw personal contact details in the general release report.

**Exit gate:** all mandatory cases pass on every launch plane with real IAM and runtime roles. No target-binding, tenant-isolation, atomicity, or provider-authentication defect is open.

## Milestone 5 — Production canary and promotion

1. Prepare a reviewable release package: artifact digest, migrations, scoped trust bundle/fingerprints, permission changes, staging report, operations runbook, and tested rollback actions.
2. Perform the normal release review/approval on that concrete package. Do not treat this plan as deployment approval.
3. Apply backward-compatible migrations and grants, deploy the candidate, and confirm ordinary master-data reads/writes before enabling provider keys.
4. Enable a controlled tenant/plane cohort using trust scope and the approved IAM grants. Key scoping limits verification only; it does not disable the other five routes. If non-verification operations need a separate rollout gate, implement one before this stage.
5. Perform a genuine challenge using designated production test contacts and verify actual audit/outbox processing.
6. Observe for the pre-agreed window and volume, covering scheduled provider behavior, key reload, pooler traffic, and event consumers. Compare to agreed latency, failure-rate, and backlog thresholds.
7. Expand scopes in small reviewed batches, validating each plane independently. Record the config revision and API replica rollout completion for each expansion.
8. Close the release only when the planned production scope is live, monitored, and owned by an operational team.

## Rollback and incident actions

| Failure | Action | Verification |
| --- | --- | --- |
| Suspected compromised provider key | Remove affected trust entries and reload/redeploy every API replica; suspend provider issuance | Proof signed by removed key rejected on all replicas |
| Verification integration malfunction | Set affected trust scope empty or disable verification access through approved IAM controls | Verification returns 503/denial; unrelated operations remain healthy |
| Defective API release | Roll back to the last qualified artifact compatible with migrated schema | Core endpoints, IAM, and audit/outbox checks pass |
| Database contention or constraint defect | Stop further writes for affected scope through the established operational control; investigate | No additional inconsistent writes; lock/backlog metrics recover |
| Provider delivery outage | Pause new challenges or show an explicit retryable outcome | No false verification and bounded retries |
| Incorrect state already committed | Identify affected evidence and execute audited compensating corrections | Correction evidence retained; original history remains intact |

Removing a key does not undo existing verification results. A rollback must not restore an older unbound verifier, remove replay checks, or drop evidence as a shortcut. Avoid destructive down migrations; use compatible artifacts or forward corrective migrations.

## Suggested delivery sequence and effort

These are planning ranges in engineering days, not commitments. They assume the existing implementation remains compatible, staging is available, and one initial channel/provider is selected. Provider procurement and security review can dominate elapsed time.

| Work package | Indicative effort | Depends on |
| --- | --- | --- |
| Baseline, scope, registry/authorization audit | 1–3 days | Named owners and launch cohort |
| Provider challenge workflow and attestation integration | 4–8 days | Provider contract; additional time if a bridge or substantial UI is needed |
| IAM mapping and scope remediation | 2–5 days | Registry audit; complexity still to be established |
| Key/configuration plumbing and rotation procedure | 1–2 days | Signing arrangement and environment scopes |
| Full staging compatibility and acceptance | 2–4 days | Above implementation packages complete |
| Canary, observation, promotion | Agreed observation window plus 1–2 days execution | Staging gate and concrete release approval |

Provider work, IAM remediation, and deployment preparation can proceed as separate workstreams once their interfaces are agreed. Staging qualification waits for all three. If provider selection is unresolved, proceed with local test keys and contract tests without representing that as real-provider qualification.

## Definition of complete

- The six routes operate in every approved production plane/tenant.
- Real ownership challenges produce authentic target-bound evidence.
- Real IAM enforces least privilege and required within-tenant resource scopes.
- Keys are scoped, environment-separated, monitored, and rotatable/revocable.
- Cross-tenant, cross-plane, stale-value, wrong-state, replay, concurrency, historical-read, and rollback cases have retained staging evidence.
- Production audit/outbox persistence and downstream processing are observed working.
- Canary thresholds pass, rollout records are retained, and operations ownership is assigned.
- External provider configuration and production qualification are explicitly complete; unit tests alone are not used to claim either.
