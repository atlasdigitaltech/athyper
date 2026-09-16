# Internal supplier onboarding — P1 implementation

Date: 2026-09-14
Status: **P1 accepted in local DEV on 2026-09-14.** Source contracts, case schema, Studio field publication and authenticated NEON/owning-API qualification are verified.

The [implementation plan](internal-supplier-onboarding-implementation-plan.md) remains the scope authority. P1 adds fields and shared binding contracts; runtime selection/evidence evaluation is P1a, submission ownership is P2, and actual task/document catalogs are P3/P4. B/C are unchanged.

## Request fields and authority

[Field contract](../../../server/packages/contracts/master-data/src/supplier-onboarding-requirement.ts) defines `requestedComplianceLevel` (`basic | standard | enhanced`) and `complianceRequirementReason` (at most 2000 characters). The requirement is a requester assertion, not a verified compliance result. All three values share the existing published, scoped case-create/update permissions; case-read controls visibility. This introduces no reviewer authority or new role grant.

[Native authoring](../../../server/db/scripts/provisioning/business-partner-compliance-requirement.ts) adds a Request governance section to both Standard request and Full profile. No profile-mode visibility condition or default requirement is authored. Basic makes the reason required in the dynamic form; the service also requires an explicit reason in an edit changing a saved requirement. Inputs bind canonical **case snapshot payload** paths, with no supplier master columns or supplier-type changes. The normal [intake authoring pipeline](../../../server/db/scripts/provisioning/business-partner-intake-graph.ts) applies this additive, idempotent transformation.

[Request service](../../../server/packages/services/master-data/src/business-partner-request-service.ts) validates supplied enums/reasons on draft creation and updates, compares edits with the stored assertion, and requires a selection at explicit validation/submission even without an optional intake adapter. Existing operation authorization remains mandatory. Request create/update audit metadata records the assertion/reason with the existing actor and snapshot evidence. Unsupported caller-owned profile/minimum/manifest fields are rejected. There is no strongest-ever draft rule or routing branch.

[Requirement validation](../../../server/packages/services/master-data/src/supplier-onboarding-requirement.ts) applies only to manual new-supplier requests. Customer requests keep their existing field contract through [intake validation](../../../server/packages/services/master-data/src/business-partner-intake-profile.ts) and host composition. Unrelated case operations cannot carry these assertion fields.

The [canonical development case schema](../../../server/db/scripts/provisioning/provision-development-business-partner-runtime.ts) includes both properties, shares the enum/length constants, and advances its source version to `development-v5`. The requirement remains optional in the storage schema to permit incomplete drafts; command validation enforces submission requiredness and reason semantics. Existing pinned case contracts are not rewritten. Use fresh local synthetic requests after publication rather than migrating old snapshots.

## Shared selection, task and document contracts

[Control-admin contracts](../../../server/packages/contracts/control-admin/src/process-selection.ts) define exact scoped policy/profile/cycle/workflow/manifest revisions (ID, positive version, hash), registered profile results, declared fact schema, owner-supplied minimum controls, sequential task bindings, final-decision scope and three document-purpose bindings. Template version/binding, projection, recipient/reviewer policy and source snapshot purpose are explicit. Preparation, document generation, review and approval have distinct execution kinds.

[Governance contracts](../../../server/packages/contracts/governance/src/process-selection.ts) define accepted selection evidence, case/run/attempt/snapshot identities, workflow stage/work-item coordinates, trace states (including not evaluated), and the transactional document-intent/callback port for P2/P4. A ready callback requires pinned artifact/version/hash and clean scan evidence; failed callbacks retain their retry classification. A callback result can be accepted, replayed or stale. These are shared contracts; P1 does not claim to persist selection records or dispatch rendering.

[Publication compiler](../../../server/packages/platform/control-admin/src/cycle/process-selection-compiler.ts) uses the existing policy evaluator and definition hashing. It accepts one scoped first-match definition with the three exact requirement predicates and consistent typed `require_workflow` actions. It verifies unique rule IDs/priorities, exhaustive unambiguous mappings, exact registered references, matching definition/manifest content hashes, all three profile catalogs (2/3/10 business tasks), sequential task identities, maker-checker, one last final-approval task, three document purposes and mandatory minimum gates.

Preparation and review-pack generation may execute before the pack is ready. Every review/approval task requires the submitted pack. Review-pack generation cannot depend on its own output; decision and activation documents block materialization and completion respectively. Final authority cannot belong to a review task. Missing or unavailable revisions fail compilation.

The compiler's `isPublished` port must be supplied by the owning publication authority and verify exact scope-authorized revisions. Tests use controlled catalog doubles; no synthetic revision is installed in the runtime. The compiler does not implement policy evaluation at an accepted revision, minimum-floor application during submission, or actual reviewer resolution—those remain P1a/P2/P3.

## Verification and acceptance

[Evidence](internal-supplier-onboarding-p1-evidence.json) records validation of the **actual** Studio revision-58 graph after applying the field transformation read-only: no graph issues, all three authored contract tests passed, proposed graph hash `6f9ef41b774fb2af6fcd7d44a50504c766a20e7e850c65609a47e4719c0a7ae8`. The graph is now published through authenticated Studio local-preview authoring as revision 59, active hash `2f0558362fece2887203672f578553409629b7beb188cbef3d5477273ac59989`. Repository defaults for classification, sections and bindings are explicit in the field transformation; replay verifies the same graph and active revision without another save. The case schema **is published** for Cirrus Atlantic as release 2, ID `c88b7626-e990-5cdf-a47a-4840bd386dd3`, hash `53225592221abb4f1fcfdbabfba8d4d4a79140b9eb14e745dba8b9d5764009af`. The original entity ID and release-1 snapshot contract are preserved. Replaying scoped provisioning left all contract coordinates unchanged; the Studio publication ledger was recorded.

Checks performed:

- Control-admin suite: 792 passed, 180 skipped (including 24 compiler cases at that run). Compiler checks also passed after the preparation/document gate correction.
- Request service/intake/HTTP route tests: 77 passed, including real owning HTTP routes with the real service and an in-memory repository; no mocked service success is used for those HTTP assertions.
- Full-profile foundation: 7 passed, including all three values in both views, missing/invalid values, Basic reason and API metadata validation.
- PostgreSQL: eight read-only checks against `document.fn_validate_entity_case_payload` using both the new authored schema and the published release 2. Incomplete drafts and all three enum values passed; invalid/null enum, overlong reason and trusted-profile injection were rejected. These validate storage constraints; no business case was created by these SQL checks.
- Control-admin, master-data, governance contracts and platform-host typechecks passed during implementation; all four final checks also passed.

The broader DB TypeScript check reports existing cross-root imports and fixture errors (including missing `legalName`); new authoring errors found during that check were fixed. The existing runtime provisioning test has two stale expectations (`display_name` instead of `name`, and allowing `person` instead of organization-only). These are not changed by P1 and are not reported as passing.

Fresh Studio and NEON sessions resolved the authentication blocker. The [activation script](../../../tooling/scripts/verification/activate-business-partner-full-profile.mts) saved revision 59 and verified the active local preview. The [local runtime deployment](../../../tooling/scripts/verification/deploy-supplier-onboarding-p1.mjs) installed seven compiled P1 files on the existing DEV source API image after an import smoke check, preserving its base image and a compose rollback. The contract, service and platform-host builds passed.

The [live qualification script](../../../tooling/scripts/verification/qualify-supplier-onboarding-p1.mts) verifies both rendered form views have all three values, no default, and conditional Basic reason requiredness. A real browser save and reopen preserves the assertion/reason. Owning APIs accepted Basic, Standard and Enhanced; rejected invalid/null enums, missing/blank Basic reasons, overlong reasons, trusted-profile injection and unexplained edits; accepted an explained edit; and denied an unauthenticated update with 401. Incomplete drafts remain allowed, while explicit validation and submission reject a missing requirement with 422. No API response is mocked.

The final run created five synthetic drafts. Read-only PostgreSQL checks confirm all five pin case contract release 2, remain drafts, and have no submitted snapshot or materialized target. Earlier exploratory runs also left synthetic DEV drafts; none was submitted. The seven foundation tests passed again after the explicit repository-default adjustment. Full qualification receipts and deployment hashes are embedded in the checked-in evidence JSON. The native activation is local development publication, not a production release.

An extra identical-draft replay probe returned `409 BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT`. Successful replay is not claimed. This is recorded for P2 submission/replay ownership and does not change P1's field/shared-contract acceptance.

Reproduce the authenticated field/API checks with:

```sh
pnpm exec tsx tooling/scripts/verification/activate-business-partner-full-profile.mts --compliance-requirement
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p1.mts
```

The scripts use the existing `catl.admin` DEV saved states; `STUDIO_AUTH_STATE` and `NEON_AUTH_STATE` can override their paths. Qualification creates synthetic drafts and performs rejected validation/submission probes; it does not submit a valid request.

The normal development case provisioner now supports `--case-contract-only --tenant-id=44444444-4444-4444-8444-444444444444`, resolves the existing entity identity by canonical entity code, and skips a successor when the schema hash is unchanged. This scoped path was used for release 2; no other tenant was published. Release 2 also includes pre-existing canonical source properties absent from the old active schema (`meshChangeResolutionId`, `meshChangeFingerprint`, `meshChangeDecisions`, `meshChangePreview`, `activation`); no existing field definition or requiredness changed. These are existing source contracts, not Increment B/C process routing.

No new migrations, policy runtime, supplier-type split, replacement run or classification rules are part of this change. P1 acceptance is closed; P1a–P9 remain their separately defined implementation scopes.
