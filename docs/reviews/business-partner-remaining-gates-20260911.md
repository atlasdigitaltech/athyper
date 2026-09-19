# BP remaining gate findings — 11 September 2026

Status: **open; not an enforcement approval**. Shared DEV remains release 18. The previous bounded command/import/export/record-AI/revocation qualification remains valid only for its recorded image and scope.

## Provider admission correction

The BP business-policy gate did not recognize dedicated published target read permissions. `business-partner-target-read-policy.ts` now admits only the selected tenant, NEON BP entity, exact published operation/permission pair and read effect. Deferred operations, writes and reveals are excluded. IAM still evaluates grants, explicit denials, scope, MFA and separation of duties; the backend still requires source-domain and target authorization.

Two focused tests and platform-host TypeScript validation passed. Image `sha256:16ce029c4be21d0eba3afd59e2d83bb7a45741ea58eb4c1fc05ba9539df5e131` was built and started as the separate `athyper-bp-r19s-read-api` candidate. It is GET/HEAD-only, has no published ports, and shares only the isolated successor's storage. An authenticated POST returned 405 `READ_QUALIFICATION_ONLY`. It does not replace the qualified API/worker image and creates no grants.

Authenticated observations are in `governance/policy/reports/business-partner-successor-read-surfaces.candidate.dev.json`. Generic lists and records succeed for both accounts. Context-free 360 summaries return `BP_360_NOT_FOUND`. With organization/company selected, owner summary succeeds while admin summary returns `BP_PROVIDER_AUTHORIZATION_UNAVAILABLE`. Supplier company configuration is forbidden under the currently approved read assignment; customer selection is invalid for this supplier record. These different outcomes must not be relabeled as blanket qualification success.

The target read diagnostic reaches `allowed` after the correction. The backend separately retains the source permission check, and context selection changes the observed outcome. The exact source denial and admin provider exception still require diagnostic attribution. Do not remove the source check, restore resource-free retries, or widen grants merely to make the read succeed.

Completion: identify each source/provider failure, implement the reviewed canonical permission transition while retaining applicable denials and business constraints, and test nested field redaction, independently owned children, company selection and revocation. Recapture API/worker journeys against one final image before claiming exact-release qualification.

## Native rollback

The isolated native rollback from release 19 to 18 failed with `BASELINE_STALE_AT_ACTIVATION`. The baseline trigger compares the restored artifact's original imported baseline against the current head and requires a forward release number. An old artifact therefore cannot pass the forward-activation precondition.

The maintenance attempt was transactional; it rolled back without changing the head. Both `baseline_activation_precondition` and `bp_release19_activation_hold` remain enabled. Release 19 remains the isolated head. No grant snapshot was restored.

Evidence: `governance/policy/reports/business-partner-successor-release-boundary.dev.json`. Both fail-closed recovery and compatible functional rollback remain unqualified: rollback never reached the intended incompatible-runtime boundary.

Prepare a compatible recovery successor authored from the intended rollback payload against the current baseline, or implement a separately reviewed native rollback precondition that validates current head, verified historical target, artifact compatibility and current revocations transactionally. Do not disable the baseline guard or use an arbitrary request/session flag to bypass it. Qualify the runtime, metadata and bindings together, including reads and revoked operations after recovery.

## Broader ownership

The clone's active descriptor inventory does not provide a target-profiled company-owned transactional entity. BP company configuration alone does not establish that generic case. Global and legal-entity ownership resolver keys are not registered in the generic contract. Adding names or aliasing these to tenant/company ownership would not establish stored ownership or containment.

Completion requires versioned ownership contracts, real stored-owner resolvers, authored profiles with explicit propagation rules, compatible publication, and authenticated service journeys for a company-owned transaction and an independently owned child. Global ownership must never imply cross-tenant permission inheritance.

## Enforcement

No new enforcement proposal is ready. Keep compatibility retirement and shared activation blocked until the provider, ownership and compatible rollback evidence is complete. Bind the final approval to the exact signed release, API/worker image, rollout coordinates, current authority fingerprints and revocation-preserving recovery procedure. Existing approvals and revoked isolated transfer assignments remain unchanged.

## Follow-up: provider defects corrected and authenticated

Two additional defects were corrected after the initial inventory:

- Reviewed deferrals now return a stable internal denial (`entity_authorization_deferred`), distinct from authorization outages. Provider projection omits these fields; real outages still return 503.
- Provider field selection now uses `providerOperationKey`, separate from legacy IAM operation coordinates. The backend validates the exact source/target permission transition and native target operation; it rejects missing field paths, conflicting operation hints and mismatched permissions. Legacy grants, denials, scopes and business checks still run.

Image `sha256:b907d257c8f4910b322230ee30ed76ba8e167d9867162026cb32c25783c1410d` is deployed only to the isolated GET/HEAD candidate. Authenticated admin qualification verifies summary HTTP 200, retained contact ID/display name, omitted deferred email/phone and POST rejection (405). Authority fingerprints match and transfer grants remain revoked. Evidence: `governance/policy/reports/business-partner-deferred-provider-fields.dev.json`. Earlier failed candidate evidence is retained in the reports with image suffixes. This closes these two defects for the recorded read-only scope, not the full provider/ownership gate.

The diagnostic now confirms `read` is denied at `source_scope` while the target read permits it. A draft proposal enumerates the 17 exact canonical read transitions in `governance/policy/reviews/business-partner-canonical-read-transition.proposal.dev.json` (revision `b92129795f2e64c25d1f560acfa58eaa06c276a790e4c029d2d8fcdf1b3e1ca7`). It proposes explicit target allows with retained source constraints/denials, no allow union, and zero grant mutations. It is not executable or approved; changing the approved intersection semantics requires a versioned successor and explicit review.

The policy-difference checker currently blocks all 66 reviewed dispositions (29 historical rows plus 37 current groups), because its pinned records regression file changed. The original approval is retained; it must not be silently rebound to new evidence. Refresh and review the evidence revision before closing this gate.

The expanded capture against `b907d257…` contains 50 authenticated calls across both accounts and all 18 BP provider codes: 22 HTTP 200, 18 HTTP 403, six HTTP 404 and four HTTP 400, with no 5xx responses. These are observed outcomes, not 50 passing qualification assertions. The inventory deliberately remains `qualified:false`; forbidden sections, inapplicable roles and context-free source-scope denials still need explicit expected-outcome evidence. The clone contains 56 BP cases in one operating organization and no comments for the selected parent; these records alone cannot prove an independently owned child denied under a different organization or principal. No fixtures, grants or ownership records were manufactured to turn those missing journeys into passes.

## Follow-up: implementation-only approval and runtime v2

The user explicitly approved canonical transition proposal `b92129795f2e64c25d1f560acfa58eaa06c276a790e4c029d2d8fcdf1b3e1ca7` for implementation only. The acceptance is recorded separately in `governance/policy/reviews/business-partner-canonical-read-transition.acceptance.dev.json`. This supersedes the earlier pending-design status; it does not authorize publication, grants or enforcement.

Local runtime v2 carries a strict canonical admission contract pinned to the full profile and review revision. The backend verifies runtime and binding hashes before selecting it. Exact approved reads require target authority and source denials, current catalog entitlements, MFA, separation of duties and domain constraints on the stored target coordinates. V1 remains an intersection. Native runtime registration rejects v2 without a source-constraint verifier. Parent-dependent transitions require the canonical parent read in the same admission plan.

Focused validation: 49 metadata tests, 23 backend tests, eight IAM tests and 20 shadow tests passed; platform-host TypeScript passed. These are local regression results, not signed-release or authenticated v2 execution evidence. Release 19's immutable v1 artifact cannot be relabeled as v2.

The user selected a separate company-owned BP setup-request pilot. Its proposed profile and ownership/capability boundaries are documented in `docs/reviews/business-partner-company-setup-request-pilot-20260911.md`. No pilot grants or records are created by that decision.

Additional rollback inspection found that the existing binding restore clears expiry and republishes retired bindings without distinguishing publication retirement from other retirement. Do not bypass the failed baseline check to invoke this restore. Prefer a recovery successor compiled against the actual current baseline, preserving current authority and explicitly retaining revoked/expired bindings. Alternatively, native historical rollback needs trustworthy retirement provenance and regression evidence before use. Neither recovery path is qualified yet.

Candidate image `sha256:6ce0171efcfd075cfc0c2a563399e0e22f534891581978f91a685d66710166c2` built successfully and is deployed only to the isolated GET/HEAD and shadow API instances. Both still load the signed release-19 v1 artifact; canonical v2 is not activated. Authenticated recapture stopped at `AUTHENTICATED_SESSION_REQUIRED` for `catl.admin`, before new comparison evidence was recorded. The unchanged-authority check passes and isolated transfer grants remain revoked. Evidence: `governance/policy/reports/business-partner-canonical-read-candidate.dev.json`. Refresh the normal test sessions before retrying; do not treat public-key trust refresh as user authentication.

## Follow-up: native v2 preparation and process recovery

The native v2 proposal is revision `0e44f59861fa5c2d7290909d2b41d366f39e3a856e7336fd0e9cf9b5ba4149f8`. It preserves 42 included operations and nine deferrals, and carries the 17 approved canonical read transitions. Its graph compiles in image `sha256:3fbbbaa376286770d3d8f0563cc72015f67aabfcc4fe4223531fd8005317143c`; native contract hash is `3e860539e3892846d5fca4d24db1334a234ccd4820d6707f188a97423bebdd3a`. The inert materialization payload is installed, but no native changeset has been submitted, independently approved or signed. See `business-partner-v2-native-image-compilation.dev.json` and `business-partner-v2-inert-payload.dev.json` in the policy reports directory.

The user separately approved temporary Studio authoring grants under proposal `61c413253e61dc99006e96da6ab4e8332f4e91dd23ad50b2947ed3e1e730c628`. They were applied for 11 September, 13:15–17:15 MYT: five native authoring permissions for `catl.admin`, and native review for `catl.owner`, tenant-exact in Studio. These cover native metadata throughout that Studio tenant, as disclosed in the proposal. BP grants and enforcement remain unchanged. Revoke the temporary assignments after use; do not extend the window or reinstate revoked test assignments automatically. The applied and revocation-rehearsal receipts are recorded separately.

NEON sessions were refreshed. Authenticated read-shadow capture on image `3fbbbaa37628…` recorded 599 admin comparisons and 397 owner comparisons with zero mapping gaps across 26 HTTP calls. These are release-19 **v1** observations, not canonical-v2 qualification. They do not establish acceptance of intentional differences or complete coverage of all historical operation groups. The reports are `business-partner-read-shadow-catl.admin.3fbbbaa37628.dev.json` and the corresponding owner report.

The shared API/worker process recovery rehearsal passed: the previous saved configuration served an authenticated BP summary, and the candidate configuration was restored successfully. All 14 authority-table fingerprints in both Studio and NEON remained unchanged during the rehearsal. Shared DEV stays on active release 18 with the signed release-19 shadow artifact. `business-partner-v2-process-recovery.dev.json` explicitly limits this evidence to process recovery; signed-v2 execution recovery remains unqualified.

Studio authoring step-up subsequently succeeded through normal MFA. Authenticated native staging, validation, tests and submission completed for change set `f533b3ec-934b-4bc0-8448-ee933847ddf2`, revision 2, now `in_review`. The persisted snapshot matches the proposed canonical graph, runtime and Atlas configuration; see `business-partner-canonical-v2-persisted-review.dev.json`. This supersedes the earlier not-submitted status above. No MFA values or credentials are retained in this report. The exact review packet is [canonical v2 native review](business-partner-canonical-v2-native-review-20260911.md). Independent approval, signing, broader ownership service journeys, signed-v2 recovery and renewed policy-evidence acceptance remain open.

## Remaining-gate implementation follow-up — 11 September, 15:00 MYT

Shared DEV activation and BP grants remain unchanged. Release-20 transfer test memberships/assignments were already revoked. The two temporary Studio authoring memberships/assignments have now also been revoked; their six permission links remain inert. The disposable Redis used for context-race tests was removed. Isolated business-journey data is retained for the remaining qualification rather than restoring any grant/data snapshot.

New authenticated release-20 evidence contains 14 passing provider/field checks across both accounts: readable contact identity retained, deferred email/phone omitted, no protected storage tokens/hashes in tested providers, and unknown organization/company selections rejected. This is bounded projection evidence; positive reveals, populated masking semantics, SQL row/count filtering and independent children are still not fully qualified.

The exact child-descriptor request `/api/entity-runtime/entity_case/list-descriptor` returned HTTP 404 `ENTITY_DESCRIPTOR_NOT_FOUND` on signed artifact `81d8d973…`. Therefore the isolated instance cannot qualify Review & Approval's generic selector flow yet. Local shared UI/Atlas tests and all three Redis context-refresh races pass, but they do not replace an authenticated browser journey.

The company-owner storage migration and stored resolver are implemented locally, as detailed in the company setup-request pilot review. No pilot publication, request or grant is created by those changes.

The historical binding restore defect is corrected locally: `fn_restore_entity_operation_projection` fails with `BINDING_RECOVERY_SUCCESSOR_REQUIRED` when projected bindings exist; it no longer republishes retired rows or clears expiry. Retirement preserves an earlier expiry instead of extending it. Six rollback-only SQL checks passed against the production function bodies. The migration is not deployed. Functional compatible recovery still requires a reviewed successor from the current head; this rejection is not a successful rollback journey.

Canonical backend diagnostics now attach an evaluation reference, record source-constraint outcomes, and emit the final backend decision after field checks. Diagnostic sink failures cannot change authorization. The new execution-evidence parser rejects uncorrelated/profile-preview logs and incomplete or conflicting traces. Twenty-seven backend tests and five parser tests passed locally. Deployment and authenticated recapture remain required before these changes can support policy acceptance.

The fresh prior-evidence audit still blocks 66 dispositions (29 historical plus 37 later groups): two pinned regression references changed, and the prior review targets release 19 rather than the release-20 canonical runtime. Original approvals are preserved. No renewed acceptance is recorded.

Current consolidated state: `governance/policy/reports/business-partner-release-20-phase-closure.dev.json`. Phase remains open; the new code and SQL changes are local and need a compatible deployment/publication bundle.

## Correction and isolated context follow-up — 11 September, 15:47 MYT

The earlier `entity_case/list-descriptor` 404 was a lookup of the storage identity, not the published UI entity. The correct UI entity is `business_partner_request`; its descriptor already exists. Preserve the failed lookup as historical diagnostic evidence, but do not use it to justify creating a duplicate descriptor.

Two actual defects were found: child selector discovery attempted scoped row authorization before a context could be selected; parent navigation also hid Review & Approval before that selector could load. Discovery now checks concrete candidate scopes from the current permission snapshot through the normal backend and catalog resolver. It does not set a selected context, grant row access, or admit commands. The child row endpoint remains closed without a validated organization.

The isolated candidate also corrects BP navigation/proposal intent mapping that was intercepted by the case-command prefix. Actual case commands retain stored case identity checks. Legacy section amendment checks now resolve to `section_propose_change`, preserving its explicit deferral. No deferred mutation has been enabled.

The pre-navigation-fix candidate produced 1,011 correlated canonical comparisons for each of catl.admin and catl.owner with zero mapping gaps. Those reports retain their image pins. They are diagnostic evidence, not blanket acceptance: 37 observed persona/operation/state groups include four unavailable groups. The historical 66 dispositions remain separate and unaccepted against the new evidence.

The unavailable groups expose two missing source-catalog dependencies: `collaboration.comment.read` and `document.attachment.read`. The clone has neither published definition; `neon.collaboration.attachment.read` exists but has not been substituted automatically. Canonical reads must preserve source denials and conditions even without a source allow. The native compiler now rejects v2 admission whose source permission definitions are absent or ambiguous in its reviewed catalog. This guard is local and does not modify release 20 or its signatures. A reviewed successor must resolve the source identities/conditions or explicitly defer the affected operations; treating the missing definitions as satisfied is not acceptable.

Validation so far: 18 mapper regressions, 24 discovery/navigation regressions, and 27 publication/compiler regressions pass; records and platform-host compile. The publication package's full typecheck is blocked by existing integration-helper imports in `src/__tests__/integration/business-partner-case-contract-publication.ts` (incorrect relative service imports and an adapter source outside rootDir). No clean full-package typecheck is claimed.

Shared DEV remains on release 18; shared grants and activation are unchanged. Baseline isolated API/worker, signed release-20 artifact and historical approvals remain intact. Read-only candidate images are separate qualification units. Native pilot lifecycle/publication, complete field/ownership journeys, functional compatible recovery, and renewed policy acceptance remain open.

### Authenticated browser result — 11 September, 15:51 MYT

Both named accounts passed Review & Approval on candidate image `sha256:dd47ea088e46c4eeb16ff201e52d11932d4795af65ba929befa0443c8a2207c8`, loading signed artifact `81d8d9737fd50aecdcbb164ec958cd3a41b6e6d7515f79531340a04a8ea1be50`:

- One required organization selector is rendered.
- No child-list request occurs before selection.
- Selecting the authorized organization is reflected in the list request.
- Authenticated scoped rows return successfully.

Browser evidence uses the current NEON shell with all relay reads routed through the isolated authenticated client; it does not establish a separately deployed UI bundle or full Atlas conversation qualification. Reports: `business-partner-release-20-context-browser.catl.admin.dev.json` and `.catl.owner.dev.json`. API negative checks also pass for both accounts (12 checks): absent context stays closed, unknown organizations are rejected, and candidate writes return `READ_QUALIFICATION_ONLY`.

The final compiler suite now has 28 passing tests, including a native compiler test proving an absent source dependency is rejected before either review or signing. A local run lock with two tests prevents future overlapping browser/API/canonical captures from mixing persona evidence. Four obsolete stopped candidate containers were removed; their images and reports were retained. Current candidate, baseline API/worker and shared DEV remain intact.

## Source-definition proposal and external DEV reset — 11 September, 16:09 MYT

The two exact legacy source definitions are prepared in `governance/policy/reviews/business-partner-source-constraints.proposal.dev.json`, revision `35fe66a6512c0feab21ce488c4bd9f38e8999088da17a825d4df97a484aebaf8`: capability, `fnd` module, exact resource compatibility, low risk, no MFA/SoD requirement, no sharing/delegation/override. No grants or aliases are included. A rollback-only dry run installed both definitions transactionally and verified unchanged authorization fingerprints afterward. Explicit review remains necessary: existing target-granted reads may become allowed when the missing source constraints become evaluable. Existing attachment permissions are not substituted automatically. A successor must bind the changed catalog to fresh authenticated release review.

The company pilot's native draft owner persistence is now implemented and passes six rollback-only native SQL checks. See the pilot review document for its unsigned local fixture boundary. Service lifecycle/profile publication, authenticated ownership/field journeys and functional compatible recovery still require work.

**Current environment changed outside this task.** Shared DEV's `authz.role`, `authz.permission` and `authz.role_permission` were absent during an authority check. They later reappeared, but the shared/clone authority fingerprint changed from `279a1e263e9b08078087b21d59cd94a6d2795de07078c5948cde9345e2cfa16d` to `04f48c397ef009f5acccb0b71baf55228044a1714abc8b204fe0c476c8eb93cf`, and shared BP activation-head rows are absent. The prior statement that shared DEV remains release 18 is therefore no longer current. No shared database changes were performed by this task. Historical qualification evidence remains intact; it cannot qualify the new baseline. Live qualification, compatible recovery and renewed acceptance of all 66 dispositions remain paused until the new DEV state is confirmed and recaptured. Evidence: `business-partner-shared-authority-schema-blocker.dev.json`.
