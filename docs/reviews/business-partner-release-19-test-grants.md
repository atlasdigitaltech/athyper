# Release 19 temporary qualification grants

Proposal revision: `a4ef0dbcc40af46758034a70698463b5f6ec9bfbbe07a43497eefad1fe5c9176`.

[Exact manifest](../../governance/policy/reviews/business-partner-release-19-test-grants.proposal.dev.json)
and [transactional dry run](../../governance/policy/reports/business-partner-release-19-test-grants-dry-run.dev.json).

**Approved by the user and applied at 06:37 UTC on 10 September 2026.** Earlier membership, operation and policy
approvals explicitly excluded grant changes. This is a separate temporary proposal.

| Item | Proposed value |
| --- | --- |
| Environment | Existing DEV NEON / CirrusAtlantic tenant |
| Recipient | catl.admin, cca94907-7519-5871-8e3c-6b11aa545c93 |
| Approver account | catl.owner keeps existing permissions; no new grants |
| Window | 10 September 2026, 14:35–18:35 Malaysia time (06:35–10:35 UTC) |
| Tenant scope | 44444444-4444-4444-8444-444444444444: 21 dedicated permissions |
| Organization scope | catl.operations / a478f9c0-8226-5d22-9599-b8fb27a45180: 6 dedicated permissions |
| Company scope | catl / 793b6cb3-3c61-57c0-9562-2cbc288bd4cf: the same 6 scoped permissions |
| Propagation | Exact at each coordinate; no inferred tenant propagation |
| Persistent change | None after expiry; only newly introduced test assignments may be revoked |
| Activation | No release-head changes; release-19 activation hold stays installed |

The 27 unique permissions are enumerated by immutable catalog ID and canonical
code in the manifest. Scope compatibility requires 33 role-permission rows across
three roles, each assigned through a new group containing only catl.admin.
The tenant subset includes global reads, import/export, and sensitive reveals.
**These tenant permissions cover all BP records in this DEV tenant; the grant
model does not limit them to test records.** The harness will operate on isolated
test records, but that is not an authorization restriction.

Existing denies and revocations continue to apply. Normal MFA and maker/checker
preflights remain mandatory where the owning service requires them. The proposal
does not claim that adding group membership enforces new MFA policy.

The dry run exercised actual schema constraints and permission/scope compatibility,
verified existing authority rows unchanged, and rolled back. A separate read
confirmed zero proposed roles and groups persisted. No effective grants changed during that rehearsal. The subsequent separately approved application is recorded below.

Cleanup must revoke only the new qualification memberships/assignments, retaining
their audit provenance and every existing denial/revocation. Effective-until
timestamps also limit the grant window. Never restore a historical authority
snapshot. An expired window or changed scope requires a successor proposal and
new approval.

Grant approval alone does not complete execution qualification or authorize
enforcement. A compatible isolated execution deployment, positive/negative tests,
and revocation evidence remain required against the signed release.

## Approved application

The user explicitly approved this proposal with “go ahead with catl.admin”.
[Approval](../../governance/policy/reviews/business-partner-release-19-test-grants.approval.dev.json)
and [committed application](../../governance/policy/reports/business-partner-release-19-test-grants-applied.dev.json)
record the exact proposal revision, account, assignments and expiry. Existing
captured authority rows were unchanged. This is conversation-user authorization,
not an impersonated catl.owner/catl.admin review receipt.

Authenticated IAM confirms all 27 new permissions for catl.admin and no changes
to catl.owner. Three qualification roles/groups contain the 33 role-permission rows.
The grants expire at 10:35 UTC / 18:35 Malaysia time on 10 September 2026.

The cleanup tool
`node tooling/scripts/verification/revoke-business-partner-release-19-test-grants.mjs --revoke`
revokes only these three new memberships and three assignments. Its default mode
rehearses cleanup and rolls back; that rehearsal passed. No old grant snapshot is
restored. Automatic expiry remains the upper bound even before explicit cleanup.

Forty fresh authenticated UI/API checks passed after assignment. New shadow
comparisons show positive target entry/read decisions and import/export preflight
requirements; other provider/context denials remain in the evidence. These checks
are not complete signed-release execution qualification. Release activation remains
held and is not authorized by the grant approval.
