# BP qualification resumption — 12 September 2026

Status: **in progress. No enforcement approval, grant application, or phase closure.**

## Fresh execution and local workflow

`pnpm dev:workspace status` reports six healthy source-workspace services. `pnpm dev:preview status` reports active development preview revision `097f2b10-3004-4c3b-9f9c-e0cc10b49111`, artifact `e52d1d79b38a9aa8a49a7970016589fc77f4e8effae37b17e9f7638e415f4b15`. This is development evidence, separate from executable publication qualification. The implemented preview permits bounded presentation and workflow-stage/request-source changes; it does not permit arbitrary ownership, field, permission or binding changes.

The five stopped `athyper-bp-enter-*` containers were resumed on their existing dedicated network, without published host ports. API and worker execute image `671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47`, artifact `45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc`, release `c2cc6900-26c1-47ca-8dfc-1d488000950c`.

Fresh operator descriptor retrieval returned 200, job submission returned 202, the corresponding worker receipt matched, wrong artifact returned 409, and anonymous execution returned 401. Shared authorization/activation fingerprints matched before and after this run. These checks do not establish authenticated business access.

The execution checker now matches the hash of the **newly enqueued job ID**, preventing an old worker log receipt from satisfying a new qualification. It captures current before/after fingerprints instead of expecting yesterday's shared state. Recapture commands require new output paths; historical reports remain intact.

Evidence: [fresh execution](../../governance/policy/reports/business-partner-enter-isolated-execution-20260912.dev.json).

## Review & Approval candidate

The [native child candidate](../../governance/policy/reviews/business-partner-request-native-candidate-20260912.json) declares:

- Tenant-owned **metadata**, with independently authorized organization-owned **records**. These are distinct ownership concepts.
- Registered `document.entity_case` collection storage, restricted to subject `master.business_partner`, with organization resolved through the current stored snapshot.
- Existing `neon.relationship.entity_case.read` for discovery and read; no additional grants or direct write operations.
- Explicit policies for all six summary fields, no snapshot payload exposure, and no write permissions on those fields.
- The registered document relationship resolver, from which the server derives the versioned `operatingOrganizationId` requirement.

Native graph validation and deterministic compilation pass. [Compilation evidence](../../governance/policy/reports/business-partner-request-native-candidate-20260912.compilation.dev.json) is **unsigned and unpublished**. This is not an executable deployment artifact. Runtime ownership/operation registration, database materialization validation, independent native review, publication, and authenticated selector qualification remain required. The company-owned setup-request pilot is a separate entity and is not qualified by this candidate.

The compiler now validates collection declarations during review, rejects mismatched declared storage and read scope/resolver bindings, and ignores deprecated declarations consistently during compilation. Nine regression tests cover the valid candidate and seven invalid variants plus deprecated declarations.

## Concrete access proposals awaiting approval

Fresh read-only inventory found zero active assignment permissions for both named users in both NEON and Studio, shared and isolated. Expired assignments were not renewed.

Both proposals use **12 September 2026, 05:15–09:15 MYT** and apply only to the existing isolated tenant, signed artifact and image identified above:

| Proposal                                                                                                           | Exact new assignments                                                                                                                                                                  | Revision                                                           |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Business journeys](../../governance/policy/reviews/business-partner-enter-test-access-20260912.proposal.dev.json) | 17 tenant-exact BP reads for each account; admin tenant-exact import/export; admin six generic case capabilities and owner read/decide in the existing Operations organization subtree | `2b7f0041ec7fd67b8bdc59d7c06ea950bf4c50cef6f315a61337584e9945621c` |
| [Atlas admission](../../governance/policy/reviews/business-partner-enter-atlas-access-20260912.proposal.dev.json)  | Admin only: tenant-exact `neon.ai.agent.use`; owner remains the admission-negative persona                                                                                             | `e3fcb693492924eedee0d0b53053a2934aa9310df3a6bba6fbbc8cb6d29de16a` |

The first proposal contains 44 permission assignments in five new groups/roles. Case permissions cover generic governed cases throughout the selected organization subtree; they are not IAM-restricted to BP or individual test records. The test-record-only restriction is operator discipline. Atlas admission covers the isolated tenant, grants no record/field access by itself, and preserves catalog MFA and tool restrictions. Existing workflow MFA and independent approval remain mandatory. Admin creates/submits/applies; owner approves under existing domain checks.

Both proposals passed actual database insertion, constraint checking and revocation rehearsals followed by transaction rollback. Authorization and activation fingerprints remained unchanged. [Business dry run](../../governance/policy/reports/business-partner-enter-test-access-20260912.dry-run.dev.json), [Atlas dry run](../../governance/policy/reports/business-partner-enter-atlas-access-20260912.dry-run.dev.json).

Neither proposal is approved or applied. Shared grants, sensitive reveals, company-pilot permissions, external model calls, Studio authoring permissions, and policy-difference acceptance are excluded. An expired window requires another explicitly approved revision. No renewal or future execution is scheduled.

## Validation and remaining closure work

85 targeted tests passed: 27 native compiler tests, 14 browser/DTO/context tests, 17 NEON collection-scope tests, 17 Records authorization/SQL tests, and 10 Atlas record-tool tests. Native authoring source and test TypeScript checks passed. These are local source tests, not authenticated deployment journeys.

Still required:

1. Complete the child runtime binding/materialization path and independently publish it; qualify the required-coordinate selector against that exact child release.
2. Deploy a pinned isolated NEON UI with normal authentication and establish isolated issuer/session trust. The shared source UI is not evidence for this gate.
3. Obtain the specific access approvals above and apply only currently valid assignments; obtain fresh MFA/session input when the normal authentication flow requires it.
4. Create governed test records and run authenticated UI/API/Atlas, command/import/export, field/reveal and negative-context journeys.
5. Publish/qualify the company-owned pilot and independently owned child, proposing any further missing permissions separately.
6. Exercise live revocation and compatible artifact/image/binding recovery without restoring revoked access.
7. Recapture the 66 policy dispositions against the qualified release set, fix defects, request acceptance for intentional differences, and clean up temporary data/access.

Prior release-20 approvals and subsequent signed release evidence are preserved. No historical evidence is relabeled as qualification of the current source workspace or child candidate.
