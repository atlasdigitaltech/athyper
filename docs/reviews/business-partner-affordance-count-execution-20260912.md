# UI reveal affordances and ordinary open-work qualification

Proposal revision **d1b9e00eceeb4becd076a4241683eba92a5c865aa10e0cde77567146135d115a**. Explicitly approved and deployed to the isolated environment. The 16:00 MYT window has expired with zero grants applied; both normal session captures timed out without saving. See the [fresh-window proposal](business-partner-affordance-count-execution-20260912-r2.md).

The 66 dispositions were explicitly accepted at revision 589733af… and recorded with 66 accepted / zero pending. This proposal does not reopen or fabricate that acceptance.

Engineering is complete in local preview: reveal permissions now run the existing non-mutating command preflight; tax affordances depend on authorization rather than storage flags; bank accounts without a protected token do not offer an unavailable reveal. The UI clears values on expiry, denied retry, scope/record/permission change, and aborts stale requests. Tests cover these boundaries. The backend and NEON production build pass; both preview canaries return health 200.

Two ordinary draft requests created through the production repository and governed SQL command produced authorized row/count pairs 1/1, 2/2 and 0/0. Revocation during aggregation rejected the response. All preview drafts, snapshots and command records rolled back. This is SQL engineering evidence, not authenticated execution qualification.

- Candidate backend: sha256:c21c07d0806da23eb05d59c004469d91d1af71f57f110e20b3e3e81881a7c470
- Candidate UI: sha256:4560f39e20fc0e3568ec5f5889d7cf16ae9a75a36e8f5895c7527d4873eaece0
- Backend release set: 3fa564b43bbfd59675cfca7d9625a4e7d8dc92ec0ba28b2e19cf3e4d5aa86da6
- Five Studio-signed artifacts remain unchanged.
- Access window: **15:15–16:00 MYT, 12 September 2026**.
- **44 permission assignments in 9 new groups/memberships/role assignments**.

Both accounts receive tenant BP reads, organization-scoped source BP read and exact selected-company customer read. Only admin receives source/target bank and tax reveals, ordinary-case read and ordinary-case create. Owner is the parent-only denial control. No owner case permission, Finance, Atlas, submit, approve, materialize or direct BP mutation permission is included.

The new case-create grant supports two **unsubmitted deactivation-request drafts** for the synthetic BP. They will never be submitted, approved or applied. The BP remains active. Drafts and genuine command/snapshot/audit history will be retained and inventoried. All new access is revoked after the checks or by 16:00, whichever comes first. Previously revoked/expired grants remain untouched.

Approval covers the exact candidate images and these new isolated execution assignments. It does not authorize shared DEV publication, enforcement activation, compatibility retirement, or extension of access. The full standalone UI comes from the current NEON workspace; it is reviewed as an isolated candidate, not claimed as a narrowly patched production UI bundle.

[Exact permissions and bindings](../../governance/policy/reviews/business-partner-affordance-count-execution-20260912.proposal.dev.json) · [SQL preview](../../governance/policy/reports/business-partner-positive-open-work-preview-20260912.dev.json) · [Access insertion rollback](../../governance/policy/reports/business-partner-affordance-count-access-rehearsal-20260912.dev.json)

Deployment and routing verification: the API and worker use the pinned candidate backend, and NEON uses the pinned candidate UI. The UI retains its prior isolated + DEV application network connections for normal sign-in; API/worker remain isolated. The browser transport verifies the actual UI container image before reporting its qualification header. Candidate health checks executed inside both named canaries returned 200. The 16:00 MYT expiry watcher completed; prior access remains revoked.
