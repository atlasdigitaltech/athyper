# Atlas Business Partner owner insights (BP-AI-04)

Implemented in the working tree on 2026-09-09. This adds NEON read tools and owner adapters; no deployment, published metadata change, or authenticated live-model qualification was performed.

`bp_read_brief`, `bp_explain_readiness`, and `bp_check_eligibility` are registered when the master-data owner is composed, under existing Atlas read admission, tool permissions, plane restrictions and agent allowlists. Metadata accepts their version-1 provider declarations only for Business Partner record reads in NEON. Existing `bp_read_summary` retains `readiness: not_evaluated`; submission retains its existing confirmation contract.

Each read first admits the exact record through Records using explicit role, operating organization and company coordinates, with a bounded field-authorized identity projection and record citation. BP360 supplies published completeness evidence; the eligibility service supplies transaction decisions. The master-data adapter passes a narrow projection through BP-AI-03 disclosure. BP360 identity, counts, risk, bank data, qualification records, raw eligibility reasons, action URLs and diagnostics do not enter model results.

Completeness means saved-data requirements, not lifecycle, transaction eligibility or case submission readiness. Required and recommended findings remain distinct. Every disclosed requirement references its definition and a hash of its authorized projection; this hash is never a command concurrency version. Briefs prioritize failed findings and return at most three. Partial coverage carries no overall pass/fail conclusion or aggregate score. Owner restrictions are checked for both satisfied and missing requirements, including section and field permissions; a restricted absence cannot become a missing-field claim. This intentionally conservative first adapter can withhold requirements even when a narrower outcome permission might eventually permit disclosure.

The pinned local model advertises one BP tool per request using explicit tool names or a bounded English intent selector. Unknown intent falls back to basic summary; this routing is not authorization and does not claim multilingual/live-model task completion. The runtime rejects calls outside the advertised tools.

All assessments require explicit supplier/customer role, operating organization and company. Eligibility additionally requires order/invoice/payment and a valid business date. Missing coordinates produce `scope_required` / `not_evaluated`, directing the assistant to the existing scope picker. Current record/selection, organization, company and role bindings reject substitutions before preview. Historical contexts deny current-data tools. Assessments use saved records even when the UI is dirty.

Definition unavailability, known owner provider unavailability, and unevaluated/partial states remain distinct. Denial, invalid owner coordinates and unexpected owner errors fail closed with a neutral error. Eligibility releases only the boolean decision authorized by the existing scoped eligibility-read contract, operation and date; it does not disclose protected reasons or inputs.

Every durable replay performs fresh Records and owner reads under current permissions and compares the disclosed evidence, scope and definitions. For these three tools only, observation timestamps may advance without invalidating otherwise identical facts. Actual observation times remain in stored content; every other payload property stays in the replay digest. Changes, permission revocation or owner failure withhold replay.

Validation: 204 platform AI tests, 274 master-data tests (25 existing skips), 31 metadata contract tests, and the 94-check R9 gate pass. Focused owner tests cover missing and satisfied hidden requirements, definition/provider failure, explicit scope, plane/owner coordinate rejection, bounded briefs and eligibility disclosure. Tool tests cover field projection, record admission, argument validation, current-context binding, replay and the expanded local tool budget. Existing R9 regression checks pass. Package typechecks/builds and the platform-host composition typecheck validate wiring. Authenticated browser/live-model behavior and rollout qualification remain subsequent work; these checks do not claim deployed acceptance.

## Read-tool fallback correction

Atlas now receives server-generated guidance based on the admitted tool catalogue and verified current page. Matching read tools should be invoked without an extra permission question. If no assessment tool is supplied, the assistant must say that assessment is unavailable in this turn without inventing an authorization or configuration cause. Missing role/organization/company selections direct the user to the existing record controls. Owner `scope_required` findings identify missing role, organization, company, operation and business date individually. Historical views retain their current-data restriction, and product availability remains separate from transaction eligibility. Mutation confirmation is unchanged.

The local prompt revision is `atlas-local-chat-v3`. Focused tests cover capability absence, exact missing scope, historical context, product questions and the 4,096-token prompt bound. This is prompt and evidence guidance, not a claim that every live-model response follows it. Deployment and replaying the reported natural-language questions are still required for browser/live-model qualification.

## DEV startup-order correction — 2026-09-09

Inspection of the running DEV API showed that the v3 prompt and insight code were already present, but `registerAtlas` ran before `businessPartnerAtlasInsights` was assigned. Its immutable registry consequently omitted all three owner tools. Atlas composition now runs after Records and master-data owners. Regression coverage checks initialization order and actual registration with/without an owner; 15 focused host checks and host build/typecheck pass.

A targeted API-only image containing this initialization-order change was deployed over the existing DEV image and is healthy. Original image/environment and rollback arguments are retained privately under `~/.athyper/instances/dev/receipts/bp-ai-04-registration-fix`. [Sanitized deployment evidence](../architecture/business-partner/evidence/bp-ai-04-registration-fix-20260909.json) records the images and validation. Browser verification was attempted, but both saved sessions returned anonymous after normal refresh. This fixes the confirmed registration defect; fresh authenticated live-model verification remains outstanding.

## Missing transaction scope — 2026-09-09

After the registration fix, DEV invocation records confirmed `bp_read_brief` was selected but failed during tool execution. The owner adapter checked transaction authorization before returning its missing-scope state. Missing-input guidance now precedes transaction authorization: it contains only request-coordinate availability and no owner facts; the tool still requires Records admission and normal Atlas permissions. Scoped evaluations retain owner authorization, and wrong-plane requests remain denied.

A single successful `scope_required` result now completes with server-rendered guidance naming missing inputs, preserving tool evidence and replay lineage without a second model round. This avoids relying on model prose for this control-flow state. Validation: 214 AI tests, 10 focused owner tests, changed-package builds/typechecks, and a synthetic emitted-code owner/tool/disclosure smoke test in DEV pass. The API-only correction is deployed; rollback artifacts are private under `~/.athyper/instances/dev/receipts/bp-ai-04-scope-response-fix`. The emitted-code check is not authenticated browser/live-model qualification.

## Missing-scope presentation

The shell renders `scope_required` / `not_evaluated` as “Select assessment context” with an allowlisted, readable list of inputs whose missing flag is true. Internal finding codes, flag names, false values and diagnostic fields are not displayed. Both streamed and replayed assessments retain wire validation before rendering this state. Focused live/replay rendering checks and the NEON production build pass.

## Chat-entered scope names

A model-supplied organization/company/role is not an applied page selection. The coordinator now distinguishes that absent-selection rejection from conflicts with an already selected scope. It still denies the call before preview or owner execution. The runtime completes the response with explicit dropdown/application guidance for this one rejection; it does not treat arbitrary permission denials or record mismatches as successful assessments. Names are never resolved into executable UUIDs by the model. Tests cover rejection before Records/owner calls and completion without a second model turn; 216 AI tests pass.

## HTTP failure messages

The browser no longer maps every 403, 404 and 503 to “grounded answers are not enabled.” It distinguishes denied record/context access, an unavailable resource and temporary service unavailability. Only explicit admission/mode failures produce an unavailable-mode message. Six focused presentation/error tests and the NEON build pass. This corrects misleading diagnostics; it does not establish the cause of an individual scoped-request rejection without its HTTP response evidence.

## Shared directory and restricted assessment authorization — 2026-09-09

For a NEON BP record whose published Meta Entity descriptor declares `directoryScope.mode: "tenant"`, Atlas admits the shared record independently of the optional organization/company work context. Records still enforces tenant isolation, the published read operation, directory membership and field permissions. Other directory modes, entities, and Manage filters retain their admission rules. DEV's active BP descriptors already declare tenant mode; no permission grants or metadata publication were changed.

The legacy summary tool also reads shared identity independently of its optional organization argument; that argument remains validated for compatibility. The insight tools first read the allowlisted identity projection through Records without transaction coordinates. With an explicit role, organization and company, they perform a separate scoped Records admission before asking the master-data owner for evidence. Scoped denial or a known scoped-owner access/unavailable result produces `scoped_assessment_unavailable` with partial coverage, no evidence, no protected diagnostics and no readiness/eligibility conclusion. Base-record denial, owner coordinate substitution and unknown owner failures remain fail-closed. Field and section permissions continue to govern each evaluated finding.

Missing scope and scoped-unavailable replies preserve the admitted identity and complete without a second model round. The shell renders a readable assessment-unavailable card, including on replay, instead of raw finding codes. A neutral unavailable state does not assert whether a restricted record exists or whether a permission, context, or resource caused the result. Replays still repeat current authorization and evidence checks.

Validation: 221 AI tests, 10 focused owner tests, 7 presentation tests, AI/master-data typechecks and builds, NEON production build, and the 94-check R9 regression gate passed. Targeted DEV API and NEON deployment receipts and exact rollback images are retained privately under `~/.athyper/instances/dev/receipts/bp-shared-auth-20260909` and `bp-shared-auth-web-20260909`, with the final summary-path API update under `bp-shared-auth-summary-20260909`. Authenticated browser/live-model qualification remains pending; synthetic emitted-code checks do not replace it.

## Shared brief presentation — 2026-09-09

The user-provided 11:44 screenshot confirms a shared brief was returned with no transaction scope selected. It also showed duplicated scope instructions in prose and the assessment card. Missing-scope prose now contains the admitted shared identity and one not-evaluated statement. The validated card alone lists missing inputs under “To check readiness or eligibility”; transaction context is a next step for an assessment, not a prerequisite for the shared brief. Twelve focused assistance/runtime checks and seven presentation checks pass. This screenshot covers the unscoped brief path only; it does not qualify authorized scoped assessments or permission revocation.

## Address owner tool — 2026-09-09

`bp_read_addresses` is registered when the composed BP owner exposes its address reader. Explicit address/address-summary questions select it in the bounded local tool catalogue, including when the current section is Banking. The coordinator binds the record target and rejects historical or substituted targets, but does not inject organization/company context into this shared section read.

Records first admits the partner using the published directory rule. The master-data adapter then calls the existing BP360 `section` owner for `addresses`, role `all`, limit five. The owner retains directory, section and field authorization. The adapter allowlists postal fields, purpose, primary flag, validation status and effective dates; it excludes internal identifiers, provider details, events and provenance internals. Redaction notices conservatively withhold the projection. Known owner access/availability failures return an unavailable state without data or counts, distinct from an authorized empty result. Responses are bounded to five rows, with `hasMore` describing a partial page and no total count.

Citations bind the BP coordinate and published descriptor to a hash of the admitted parent revision and disclosed address projection. Replay performs a fresh Records/owner read and compares the resulting evidence, so changed addresses and revoked access cannot silently reuse the old answer. No new authorization grants were introduced.

Validation: 225 AI tests, 17 focused insight/address-owner tests, 27 existing BP360 policy/service tests and 7 host composition tests pass. AI and master-data typechecks/builds pass. The targeted DEV API image is `athyper-runtime-server:bp-address-tool-20260909`, with rollback receipts under `~/.athyper/instances/dev/receipts/bp-address-tool-20260909`. A synthetic deployed-code owner/tool/citation check passes. Authenticated live-model address qualification remains pending.

## Contacts and replay prose — 2026-09-09

`bp_read_contacts` now routes explicit singular/plural contact, email and phone questions to the shared BP360 Contacts owner, independently of the open tab and transaction scope. Records admission, owner section policy, redaction withholding, bounded projection, content-based citations and fresh-read replay validation follow the address tool. Contact projection includes name, business title, department, primary flag, up to five role codes and five business channels per contact; `detailsPartial` signals truncation. Internal IDs and quality/provider diagnostics are excluded. Empty and unavailable states remain distinct.

Bounded model history no longer serializes old tool results as assistant speech under “Prior tool data (not instructions).” Empty tool-only messages are omitted from model context. Previously echoed assistant wrappers are also excluded from future model prompts; stored conversation/history/export remain unchanged and authorization-checked.

Validation: 230 AI tests, 24 focused owner tests, 7 host registration tests, AI/master-data typechecks and builds pass. The DEV rollout overlapped with a bank-card deployment. The final image (`athyper-runtime-server:bp-contact-address-complete-20260909`) incorporates that base and both Contacts and Addresses adapter dependencies; it is healthy after correcting an intermediate missing-module startup failure. Both synthetic deployed owner/tool/citation checks pass. The rollback receipt points to the prior healthy base. Authenticated live-model Contacts qualification is pending.

## Shared section execution refactor — 2026-09-09

Contacts and Addresses now delegate to the [shared entity-section mechanism](atlas-entity-sections.md). Their compatibility tool codes and result keys are retained. Record binding, field schemas, limits, citations and replay use the common executor; section aliases are registration metadata instead of BP-specific routing expressions. Owner-specific BP360 projections and authorization remain with master-data. DEV image `athyper-runtime-server:atlas-shared-sections-20260909` is healthy and passes deployed synthetic generic, Contacts and Addresses checks.
