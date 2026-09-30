# Reset BP successor execution

Status: engineering in progress; temporary authoring assignment decision required.

The eight catalog definitions are installed under the user's explicit approval. That approval expressly excluded grants. Both named Studio accounts exist, but no Studio roles remain on the reset baseline. Historical revoked assignments cannot be replayed.

## Fresh assignment proposal

Proposal: `governance/policy/reviews/business-partner-reset-studio-authoring-grants.proposal.dev.json`.

Revision: `e75d4ffc805c48c81615eca22c3ab066dadf400d829256de9629ae7638535128`.

Window: **11 September 2026, 17:00–21:00 MYT** (09:00–13:00 UTC).

| Account    | Capabilities                                            | Scope                                     |
| ---------- | ------------------------------------------------------- | ----------------------------------------- |
| catl.admin | metadata.entity.author, validate, test, submit, publish | CirrusAtlantic tenant, exact; Studio only |
| catl.owner | metadata.entity.review                                  | CirrusAtlantic tenant, exact; Studio only |

All six catalog definitions require MFA. Review and publish require separation of duties; the existing independent reviewer checks remain active. The authority applies across native metadata in this Studio tenant because draft creation has no BP-specific authorization coordinate. Operator work is restricted to the BP successor and company pilot; this restriction is not claimed as an IAM-enforced entity boundary. No NEON grants or enforcement activation are included.

The proposal derives fresh assignment identities from its revision. Rehearsals created two assignments, two memberships and six role-permission mappings transactionally, then rolled back. A second rehearsal revoked those test assignments twice and proved they remained revoked, then rolled back. Neither rehearsal used fabricated approval evidence.

Evidence:

- `governance/policy/reports/business-partner-reset-studio-authoring-grants.dry-run.dev.json`
- `governance/policy/reports/business-partner-reset-studio-authoring-grants.revocation-rehearsal.dev.json`

The installer requires exact acceptance, successful rehearsals and execution within the approved window. Prior applied receipts cannot be replayed. Revoke these assignments after use; expiry does not justify restoring them later.

## Engineering completed during preparation

The company-owned setup-request resolver incorrectly required organization coordinates for collection discovery. Company-owned collection browsing now resolves a validated company without an organization selector. Proposed creation still requires a compatible organization and company; existing ownership still comes from storage. Five resolver tests pass, including missing/inactive company denial. Platform-host build passes. This correction is local and is not yet deployment qualification.

The temporary-grant SQL builder now permits rollback-only rehearsal without approval. Committing still requires exact matching approval, and mismatched supplied approval is rejected even in rehearsal. Scope target and validity-window validation prevent proposal/SQL inconsistencies. Four grant-builder regressions pass.

## Remaining publication and qualification dependencies

The reset removed Studio's native BP entity and predecessor publication. The historical canonical-v2 staging helper assumes that predecessor exists; its old receipts must not be replayed. Restore/author a compatible native source through a reviewed path before successor compilation. Catalog installation alone does not resolve this engineering dependency.

The company pilot still needs lifecycle integration, complete published field policies and authenticated execution. Complete the signed successor and its exact-release ownership/field, command, Atlas and compatible-recovery evidence before reconciling the 66 dispositions. Do not record acceptance of unreproduced behavior or describe rollback-only SQL previews as authenticated business journeys.

The phase remains open. Approval of the temporary assignments permits the next authenticated authoring steps, not phase closure or enforcement activation.

## Assignment application — 17:00 MYT

The user explicitly approved proposal `e75d4ffc805c48c81615eca22c3ab066dadf400d829256de9629ae7638535128`. Two fresh assignments committed at 17:00:21 MYT, inside the approved 17:00–21:00 window. A read-back confirmed exact propagation, correct accounts and the six approved capability mappings. No NEON grant or enforcement changes were included. Receipt: `governance/policy/reports/business-partner-reset-studio-authoring-grants.applied.dev.json`.

The saved Studio author session is anonymous; normal login requires fresh catl.admin MFA. Native publication preflight compiled the historical graph with zero validation errors but identified runtime branches that require a materializer. Evidence: `business-partner-reset-native-publication-preflight.dev.json`. Do not publish the native descriptor alone as a BP runtime replacement.

Six native draft ownership checks and six binding-recovery guard checks passed again in rollback-only local previews. Successor reports retain the reset prefix; historical reports are preserved. These remain local regression evidence, not signed-release or authenticated journey qualification.
