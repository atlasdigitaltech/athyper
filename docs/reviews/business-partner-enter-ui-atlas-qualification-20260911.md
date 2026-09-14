# Entity UI and Atlas context qualification

Status: **in progress; authenticated end-to-end qualification is not complete**.

Exact runtime: release `c2cc6900-26c1-47ca-8dfc-1d488000950c`, artifact `45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc`, image `671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47`.

## Completed checks

Thirty-five existing targeted tests passed:

- Fourteen foundation/contract tests: work-context DTO parsing, context-control dismissal, Atlas page/context ownership, navigation cancellation, stale completion rejection, history binding, automatic brief deduplication and unsaved/historical context handling.
- Eleven Records tests: list/navigation context discovery and canonical read admission with target grants and source constraints.
- Ten Atlas record-tool tests: argument/descriptor validation and retrieval behavior through the shared records gateway.

These tests execute local sources. They do not establish that the deployed NEON UI bundle matches this runtime release. An initial invocation referenced a nonexistent test configuration; the corrected invocation used `tooling/config/tsconfig-react.json` and passed.

Seven live anonymous requests against the exact isolated API returned 401 with the correct execution release/artifact headers: list descriptor, list, Review & Approval child descriptor, record, 360 summary, contacts section and Atlas retrieval. These demonstrate authentication boundaries only. They do not demonstrate authorization parity for authenticated users or that a requested child descriptor exists behind the authentication gate.

Receipt: `governance/policy/reports/business-partner-enter-ui-atlas-boundaries.dev.json`.

## Current release-bound blockers

| Journey                    | Finding                                                                                     | Required next work                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized list and record | Both named users have zero NEON grants; clone has zero BP records                           | Approve/apply the exact temporary access proposal, prepare isolated IAM trust, and create a governed test record                                          |
| Review & Approval selector | Only `business_partner` is deployed; `business_partner_request` is absent                   | Publish/qualify the child descriptor with exact required-coordinate metadata, then test one actionable selector and selected/unselected/wrong coordinates |
| Tabs, sections and fields  | No positive authenticated record journey has run                                            | Exercise allowed, denied, context-required and masked paths against the same record and release                                                           |
| Atlas parity               | Shared records-gateway tests pass, but live route additionally requires `neon.ai.agent.use` | Propose and approve explicit isolated AI admission access; compare the same record/fields/context through UI API and Atlas, retaining tool restrictions   |
| Browser journey            | Isolated deployment contains API and worker, not a NEON UI bundle                           | Pin and deploy a compatible isolated UI, or explicitly label routed shared-shell testing as partial evidence                                              |

The pending access proposal `f24babe9afad16fb34680bee4da2e407a5353e446b7b4bcaa450bc77ae860d3a` was not approved by the user's instruction to start this next workstream. It remains unapplied and does not include AI admission, reveals, or company scopes. Its validity window must be rechecked before any future application; do not extend it automatically.

## Acceptance matrix still to execute

1. List-discovered IDs and record visibility agree; denied records cannot leak through direct API or Atlas.
2. Review & Approval returns the child entity's versioned required coordinates and renders exactly the needed selector. No rows load before an accepted selection; unknown or unauthorized selections fail.
3. Record transaction context persists consistently across tabs/actions. Overview filters affect only the summary. Context selection never rewrites ownership or creates permission.
4. Header/section actions consume the same operation decision; context-required, verification-required, workflow-blocked, denied and unavailable states remain distinct.
5. Nested fields and masked values agree between Records and Atlas. A tool cannot reveal data merely because it appears in a prompt or context snapshot.
6. Navigation/context changes cancel or discard stale Atlas results. Request scope and executed record/release remain tied to the submitted request.
7. Capture authenticated request IDs, executed release/artifact, selected coordinates and safe decisions without storing credentials, OTPs or protected field values.

No grants, publication or activation changed during this verification workstream. All positive-access and end-to-end assertions remain open until their evidence exists.
