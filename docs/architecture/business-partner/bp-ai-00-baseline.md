# BP-AI-00 — Business Partner Atlas baseline

Captured: 2026-09-08. Scope: inspected working tree and local DEV/QA deployment.

**Status: BP-AI-00 complete for the DEV baseline scope, closed 2026-09-09 (Asia/Kuala_Lumpur).** The refreshed session passed authenticated citation verification, one warm-up plus 20 measured reads, a visible Atlas response check, and the R9 regression gate. No metadata was republished, permissions changed, Business Partner records mutated, or containers restarted. Benchmark conversations were created through normal Atlas APIs. Earlier blocked attempts below remain as historical evidence; future feature/persona qualification is not implied.

Closure reviewed 2026-09-10: **confirmed closed for the recorded DEV baseline**.
The [authenticated closure receipt](evidence/bp-ai-00-authenticated-20260909.json)
records `status: passed`, 20 measured runs, browser UI success and the R9 gate.
The [subsequent F6 pilot closure](evidence/atlas-f6-phase-closure-distributed-20260910.json)
is separate evidence for its later deployment. Neither closure marks the entire
[BP AI implementation plan](atlas-ai-agent-implementation-plan.md) complete.
Inventory and benchmark values below remain historical observations.

## Deliverables and gate evidence

| Exit requirement | Evidence | Status |
| --- | --- | --- |
| Deployment inventory | Sanitized container, model, Redis and descriptor receipt | Captured |
| Source-version discrepancy | Active DEV/QA descriptors compared with database schema, seed and gateway behavior | Resolved as a configuration discrepancy; no deployment correction applied |
| Owner projection and disclosure matrix | Matrix below with actual permission codes and conservative initial model projection | Recorded |
| Route contexts | Manage, record, panel and Atlas transport inventory below | Baseline inventory complete; visible Atlas response verified in section 11. Broader route/context qualification belongs to BP-AI-02 |
| Model budget and benchmark | Three synthetic provider measurements, precise model configuration and scope limits | Provider baseline captured; authenticated single-record latency subsequently measured in section 11 |
| Baseline fixtures | Eight synthetic contract scenarios, plus existing R9 fixture suite | Recorded; new scenarios not yet implemented as agent tests |
| Existing regression gate | `pnpm qualify:business-partner-r9` | Passed: typecheck, 54 Atlas + 37 case + 3 publication tests |
| Authenticated user benchmark | Refreshed NEON session, warm-up + 20 measured cited reads and Atlas panel response | Passed; see closure evidence below |

Artifacts:

- [Sanitized deployment and timing receipt](evidence/bp-ai-00-baseline-20260908.json)
- [Synthetic baseline fixture catalogue](evidence/bp-ai-00-fixtures.json)
- [Repeatable capture script](../../../tooling/scripts/verification/capture-business-partner-ai-baseline.mjs)
- [Implementation plan](atlas-ai-agent-implementation-plan.md)

The collector uses operator access for metadata/configuration inspection and synthetic provider timing. It does not establish application-user permission or feed privileged business data to inference. HTTP probes retain status/timing only, never session headers or business response bodies.

## 1. Deployment and source-version conclusion

| Coordinate | DEV | QA |
| --- | --- | --- |
| Active BP descriptor release | 17 | 8 |
| Descriptor hash | `e619e5e98922f092e84b0d4e89e6f9e6981c25017fd3a4cb4ee09f200e54d183` | `7794e41558a6fa11606628fb6f30f94672830a927e5592d06f29eb060a661387` |
| Published `storage.versionField` | Absent | Absent |
| Physical `master.business_partner.record_version` | `bigint`, exists | See receipt's schema probe |
| Published directory contract | Tenant mode; organization/company controls and eligibility quick filter | No directoryScope in active descriptor |

Both environments' supporting data/search/document/cache containers report healthy. DEV API and NEON images have advanced since the initial plan: `athyper-runtime-server:bp360-panel-20260908` and `athyper-neon-web:bp360-width-20260908` at capture. Worker/scheduler images differ from API; future pipeline qualification must verify compatible contracts across those deployments, not assume the working tree is deployed everywhere.

**Resolution:** the physical version column and the seed declaration do not imply that the active published descriptor exposes that version. The seed declares `storage.versionField: record_version`; the active descriptor does not. The local gateway composition explicitly enables `allowProjectedContentRevision`, so its defined fallback is a SHA-256 hash of the authorized projected values. The R9 expectation and staged-tools runbook describe different configurations, not interchangeable source revisions.

Decision for subsequent phases:

- Existing reads may continue with explicitly typed content-hash citations.
- Read-source hashes must not be used for case concurrency or claims that all related evidence is unchanged.
- Case mutation uses the owner case's real expected row version and existing confirmation binding.
- BP-AI-01 should preserve/publish a validated version field through a new immutable release if the intended generic read contract requires row-version citations. Do not edit release 17 in place or run an older seeder over newer metadata.
- BP-AI-02/04 adapters must keep `content_hash`, `record_version` and `case_row_version` distinct.
- An authenticated source-citation receipt is still needed to verify the deployed runtime's observed result, beyond the descriptor/configuration evidence.

Live DEV descriptor also maps import/export to the BP read permission. This inventory is not approval to register Atlas import/export tools: owner operation authorization needs a separate audit before exposing either capability.

## 2. Evidence and disclosure matrix

The prefix `neon.relationship.` below is written in full in the permission contracts. These are actual declared permissions and owner boundaries, not proof of current grants for a particular logged-in user.

| Evidence | Owner / permission | Initial Atlas projection decision | Additional gate |
| --- | --- | --- | --- |
| Identity summary | Records gateway; `neon.relationship.business_partner.read` plus published field permission | Only code, display name, category and status currently supported | Source revision and row admission on every read |
| Identity details | BP360; `neon.relationship.business_partner_identity.read` | Narrow approved identity fields | Do not serialize whole BP360 |
| Contact / address | BP360; `neon.relationship.business_partner_contact.read`, `neon.relationship.business_partner_address.read` | Authorized values or verified required-field findings | Omitted/denied field cannot become missing |
| Identifier / tax | `neon.relationship.business_partner_identifier.read_masked`, `neon.relationship.business_partner_tax.read_masked` | Masked projection only when authorized and relevant | `neon.relationship.business_partner_tax.reveal` stays outside initial agent tools |
| Banking | `neon.relationship.business_partner_bank.read_masked` | No raw bank data in first release; narrowly approved outcome if its disclosure is authorized | `neon.relationship.business_partner_bank.reveal` has separate purpose/audit behavior; not an AI read shortcut |
| Completeness | BP360 definition resolver and completeness evaluator; underlying evidence permissions | Required/recommended findings after disclosure projection | `restricted_verified`, restricted counts, fingerprints and percentages need review before model exposure |
| Transaction eligibility | Eligibility `resolve`; `businessPartnerQualificationPermissions.read` = `neon.relationship.business_partner.read` with scope | Order/invoice/payment outcome for explicit role, organization/company | Current owner decision; directory visibility is insufficient |
| Qualifications / certificates | `neon.relationship.business_partner_qualification.read`, `neon.relationship.business_partner_certificate.read` | Only individually authorized facts and requirements | Combined section filters qualification/certificate data separately |
| Customer credit | BP360 `neon.relationship.business_partner_credit.read`; credit owner also declares `neon.customer.credit.read` | Exclude values until adapter maps the appropriate owner's permissions | Do not treat these permissions as aliases; no AI risk score |
| Cases and changes | `neon.relationship.entity_case.read` and case validation/diff owner | Authorized case status, current validation and permitted before/after values | Both sides of a diff require authorization |
| Submission | `neon.relationship.entity_case.submit` | Existing exact-target proposal and receipt | Confirmation, current authorization, expected version, idempotency and independent review |
| Documents | BP360 `document.attachment.read`; search `documents.search` and per-hit `documents.read` | Preserve owner-specific checks; do not collapse permission namespaces | Parent relation, current revision, scan/extraction/data-class checks |
| Comments/activity | `collaboration.comment.read`, `neon.relationship.business_partner_activity.read` | Deferred or narrow relevant authorized projection | Free text is untrusted; actors and existence can be sensitive |
| Person/workforce | Person, person-sensitive and workforce permissions exist | Excluded from initial agent capability set | Separate qualified disclosure contract required |
| Network | `neon.relationship.business_partner_network.read` | Deferred for initial tools | Existing presence-only bank governance metadata is not automatic permission to disclose |

Completeness review finding: the evaluator can return `definition_unavailable` with zero-valued counters/percent. Atlas must render unavailable, never “0% complete” or “no blockers.” Its definition parser requires risk to be excluded. Completeness fallback evidence uses visible fragments, so the adapter must prove absence is authorized before turning a field into a missing-data recommendation.

Initial policy decision: ordinary user-scoped reads only. Broader internal evaluation and independent derived-outcome disclosure are not approved merely because a backend can inspect the inputs. Such providers remain unavailable until their owner defines the exact output permission and projection tests.

## 3. Permission personas and what is verified

Existing provisioning defines a scoped BP reader and reserves request-creation grants for configured primary tenant admins. Existing R9 tests cover denied reads, redacted fields, invalid source coordinates, cross-principal behavior, revocation and confirmed-submit replay. None proves that a saved browser state still has those grants today.

The saved states `neon`, `neon-owner` and `neon-athyper` each returned 401 for admission, list descriptor and one-row list. No credentials were changed and no role was elevated to make the checks pass.

Required follow-up matrix after authentication is refreshed:

| Persona | Required live observation |
| --- | --- |
| Reader | Authorized record summary; no submission capability without its separate permission |
| Scoped onboarding user | Valid selected organization/company; invalid coordinate rejected |
| Submitter and independent reviewer | Appropriate distinct case actions, no implicit self-approval |
| Sensitive-field restricted user | No raw values, hidden counts or missing-data inference from denial |
| Other tenant / explicitly denied record | No accessible record/citation/result leak |
| Revoked user | No cached evidence/history reuse under stale authorization |

These are pending live checks, not newly provisioned account assignments.

## 4. Route and context inventory

| Surface | Existing source/context | BP-AI-02 integration requirement |
| --- | --- | --- |
| Manage | `apps/neon/app/(shell)/mdg/business-partner/manage/`; shared list runtime exposes search, standard view, filters, sort, page/cursor and directory arrays | Publish applied state, explicit selection and analysis target; never infer full-population counts from visible rows |
| Individual record | `[recordId]/page.tsx`; BP360 context carries summary, section and role lens | Publish record ID, authoritative revision, open section, role and scope |
| Record panel | Shared form-detail `record-360-panel.tsx` and BP360 panel integration | Same context contract as full-page record; generation bound to active panel target |
| Historical/dirty record | Owner supports as-of; shared form runtime owns edit state | Historical/read-only and saved-versus-unsaved assessment flags |
| Atlas dock | `atlas-workspace.tsx` maps route to a display label | Add context generation ID and capture context on each request |
| Atlas fullscreen | `from` query parameter used for display context | Transfer semantic context explicitly; a return path is not record authorization |
| Controller/client/API | `ask(question, agent, attachments)` and existing thread transport | Extend versioned request schema, preserve context through streaming/history |

List directory arrays and the shell's work organization/company are separate. A multi-company directory filter cannot select a single transaction company on behalf of the user. Record changes must cancel/discard obsolete read output; existing command receipts retain their original target.

## 5. Model budget and benchmark

Deployed local config: `qwen3:8b`, digest `sha256:500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`, public ID `atlas-re-1.0-local`, `num_ctx=4096`, `num_predict=1024`, `think=false`, cloud disabled.

Source limits: local composition uses two tool rounds and 12,000 input characters; the full-provider composition has a separate three-round setting. The local gateway allows one row and 2,048 response bytes. Runtime prompt fitting can reduce output reservation to 128 tokens. Character bounds are not a substitute for fitting the model's token budget.

Synthetic provider benchmark: same 64-token prompt three times, draft organization with readiness not evaluated, output cap 128, temperature 0, sequential streaming requests from the DEV API container to its configured inference endpoint. No business records, credentials, Atlas tools, conversation persistence or authorization were included. Each response emitted 25 tokens and stopped normally.

| Sample | First text | Total response | Model load | Generation tokens/sec |
| --- | --- | --- | --- | --- |
| 1 | 12,754 ms | 13,402 ms | 12,529 ms | 38.32 |
| 2 | 24 ms | 452 ms | 1 ms | 58.50 |
| 3 | 24 ms | 440 ms | 1 ms | 60.05 |

Interpretation: initial model loading dominates the first sample; warm tiny-prompt inference is fast. Repeated prompts may benefit from provider caching. These three samples do not establish p95, concurrency, realistic history/tool cost, UI first-text latency or recommendation accuracy. Do not use them to claim the proposed 5-second Atlas response target is met.

Authenticated benchmark protocol after session refresh: one warm-up plus at least 20 measured runs per representative authorized summary/list task, record first text/total/tool durations, input/output usage, coverage and success. Include both a record opened from Manage and full-page entry, bounded history, and a context switch. New list/readiness tools cannot be benchmarked end-to-end before they exist; retain the current one-record tool as comparison.

## 6. Dataset and fixture baseline

Operator-only aggregate SQL snapshot of DEV `master.business_partner`: 168 records, 90 draft and 78 active; 42 codes use the `ACC-BP-` acceptance prefix. These counts span the inspected database and are not an authorized user's Manage counts. No record payloads or tenant/principal identifiers are included in the committed receipt or fixtures. A code prefix alone does not prove a record is safe to mutate; this phase performs no mutations.

The fixture catalogue includes draft summary, active-but-unevaluated eligibility, hidden-versus-missing fields, overlapping selected-list counts, unavailable definition/dirty state, record-switch races, revoked history and ambiguous submission. They are synthetic scenario inputs for future implementation, not claims that these agent capabilities already exist.

Existing executable R9 fixtures remain the baseline for current tool authority. Passed gate: AI typecheck; 54 tests across BP evaluations, ledger lifecycle and governance; 37 case-service tests; 3 deterministic publication tests. No extra implementation-mirroring tests were added for this inventory.

## 7. Infrastructure implications

Reuse current MinIO/Tika/Meilisearch document pipeline and Redis adapter when future phases require them. The inspected search service already reauthorizes each attachment and computes authorized retrievable-hit counts. Atlas still needs a bounded evidence adapter and current parent/field checks. Generic search totals are not authoritative BP worklist aggregates.

DEV Redis reports no modules, `maxmemory=0`, `noeviction`, with a 512 MiB container allowance. Establish cache admission/memory bounds before AI caching shares session capacity. Initial entity tools do not need Redis vector capabilities or a new vector database.

## 8. Historical pending work and reproduction

1. Refresh the existing authenticated test state through the normal login flow. Re-run admission and read probes; do not create replacement broad grants.
2. Browser execution is now verified using the existing local dependency bundle: prefix Playwright commands with `LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu`. No system packages were installed. This temporary-directory bundle must remain available or be restored by the environment setup.
3. Capture an authenticated `bp_read_summary` receipt proving the observed citation kind, and the current-user record/list timing sample. Keep raw response/auth evidence private; publish only sanitized timing/coverage results.
4. Update this report's gate status after those checks. BP-AI-01 contract design can proceed using the resolved version semantics and conservative disclosure decisions; this does not waive live qualification.

Repeat the sanitized inventory from repository root:

```bash
node tooling/scripts/verification/capture-business-partner-ai-baseline.mjs /tmp/bp-ai-00-baseline.json
pnpm qualify:business-partner-r9
```

The collector performs three bounded synthetic inference requests and GET/metadata reads; it writes only the selected output file. It never prints arbitrary container environment variables, database rows, response bodies or session credentials. A `captured` check means its observations were recorded, not that authentication or capability qualification passed: inspect HTTP statuses and `authenticatedBenchmarkAvailable`.

## 9. Authentication closure attempt

The [sanitized follow-up receipt](evidence/bp-ai-00-authentication-followup.json) records the execution attempt authorized after BP-AI-01. Chromium now launches and renders the actual NEON/IAM login flow using the existing shared-library bundle. The previous browser dependency blocker is resolved for this environment.

Both checked saved sessions are anonymous. Normal login with the existing private `catl.admin` test credential is rejected by IAM with “Invalid username or password.” Login attempts were stopped; credentials, permissions and authentication policy were not changed. Restoring a fresh session now requires a current test credential or a fresh authorized Playwright state, requested from the user. No authenticated timing/citation measurements were fabricated or substituted with unauthenticated/provider timings. At that attempt, BP-AI-00 remained pending only the authenticated evidence described above. Section 11 subsequently closed this blocker.

## 10. Automated completion runner

[The completion runner](../../../tooling/scripts/verification/complete-business-partner-ai-baseline.mjs) now automates browser library setup, session checks, normal password login when explicitly configured, unique authorized tenant selection, read admission, one warm-up plus 20 measured isolated-thread reads, citation validation and the existing R9 regression gate. It exits nonzero and records the stopping stage if any prerequisite/check fails. It never resets passwords, changes grants, confirms mutations or works around MFA.

Use an existing authenticated state:

```bash
ATLAS_TEST_STORAGE_STATE=/private/path/neon-state.json \
ATLAS_TEST_RECORD_ID='<authorized partner UUID>' \
ATLAS_TEST_ORGANIZATION_ID='<authorized organization UUID>' \
node tooling/scripts/verification/complete-business-partner-ai-baseline.mjs
```

Or supply normal test-login credentials through a private file:

```bash
PLAYWRIGHT_NEON_USER=catl.admin \
PLAYWRIGHT_NEON_PASSWORD_FILE=/private/path/current-test-password \
PLAYWRIGHT_NEON_TENANT_NAME='CirrusAtlantic UK' \
ATLAS_TEST_RECORD_ID='<authorized partner UUID>' \
ATLAS_TEST_ORGANIZATION_ID='<authorized organization UUID>' \
node tooling/scripts/verification/complete-business-partner-ai-baseline.mjs
```

The tenant name must exactly match the authorized context catalogue; omit it only when there is exactly one choice. MFA requires a normally completed fresh session. Do not paste passwords into shell commands or checked-in configuration.

Default evidence output is a private, timestamped directory under `~/.athyper/instances/dev/receipts/bp-ai-00/`. `ATLAS_TOOL_RECEIPT_DIR` may select another directory outside the repository. Raw runs and refreshed state are mode 0600, directory mode 0700. Only copy reviewed sanitized summary data into this report. Each sample creates an ordinary Atlas conversation; no Business Partner data is changed. The timing includes authenticated browser fetch/BFF/tool execution but excludes composer/render timing and does not replace persona qualification.

Expected revision kind defaults to `content_hash`, matching the captured publication; set `ATLAS_TEST_REVISION_KIND=record_version` only after the published contract actually changes. The runner parses actual SSE envelopes, binds citations to completed read calls, verifies target/entity/revision shape, and rejects failed/cancelled runs or mutation proposals. It does not accept event names merely appearing in model prose. Seven standalone tests cover these evidence checks and percentile calculation, including the valid read-only preview event observed during live execution.

Execution on 2026-09-08 stopped with `CURRENT_SESSION_OR_CREDENTIAL_REQUIRED` at authentication; existing states are not current and no replacement credential was supplied. That execution was a historical blocked result. The subsequent successful execution and reviewed sanitized measurements in section 11 closed the phase.

## 11. Closure evidence — 2026-09-09

[Sanitized authenticated results](evidence/bp-ai-00-authenticated-20260909.json) close the authentication/timing/citation blocker. Raw runs, refreshed state and regression logs remain private under `~/.athyper/instances/dev/receipts/bp-ai-00/2026-09-08T16-38-31-428Z/` (directory timestamp is UTC).

| Measurement | Median | Observed p95 |
| --- | --- | --- |
| First nonempty generated text | 1,784 ms | 1,901 ms |
| Complete authenticated read response | 4,584 ms | 4,889 ms |

All 20 sequential measured runs plus the excluded warm-up returned successful `bp_read_summary` events, the expected record, valid content-hash citations and completed responses. The same prompt/fixture was used in isolated threads, so these results represent a warm, repeated single-record workload and not concurrency, broader data sizes or future tools. Browser-fetch timing includes BFF authentication and Atlas tool execution, but not composer/render time. A separate real composer/send check returned HTTP 200, a valid matching citation and a visible completed assistant response.

The R9 gate passed again: AI typechecks, 54 Atlas tests, 37 case-service tests and 3 publication tests. Seven evidence-validator tests passed. The first live attempt found a validator defect: the runtime emits `tool.previewed` even for authorized reads. The validator now accepts only `bp_read_summary` previews with `access=read` and `confirmationRequired=false`; mutating or confirmation-requiring previews remain rejected. The corrected validator was used for all 20 measured runs.

**Metadata correction:** the original inventory queried the shared publication key and found release 17. The authenticated CirrusAtlantic principal resolves a separate tenant-specific release 9, hash `e6bbd051a61c06f5536e25a884429230006ae9a77ad45388ef3f2ffe1e846c41`. The repository prefers tenant-specific descriptors before comparing release numbers. An operator read of active publications confirms this descriptor is active, so the citation is not a stale release-17 hash. Both descriptors omit `storage.versionField`; content-hash citation semantics remain correct. Future baseline collectors should record effective tenant-specific resolution in addition to the shared publication.

The initial single-record baseline meets the proposed latency objectives for this measured workload. BP-AI-02 onward still require their own deployed context-switch, permission-persona, insight-tool, and UI qualification; closing BP-AI-00 does not certify those later capabilities.
