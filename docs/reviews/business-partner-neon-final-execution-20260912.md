# NEON remaining qualification proposal — 12 September 2026

The child provider sent an incomplete entity-operation coordinate for independently owned document capabilities, and omitted the resource ID needed by exact grants. The candidate corrects those coordinates. Four tests through the real permission authorizer now admit an exactly granted child, exclude its ungranted sibling, and reject inheritance from BP parent visibility for both comments and attachments.

The [execution proposal](../../governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json), revision `3c623d23098b2a862b3a32f38e256405ad3d70d2f57f93b5e2ec40845af51e3c`, is prepared but **not approved or applied**. It proposes replacing only the isolated API/worker image and bound harness, then applying new temporary qualification grants. The five signed artifacts remain the same.

| Binding               | Value                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Candidate image       | `sha256:bb6946f9f7d4e771dbc2f27d045dc768a009d4ff26b97d6bd5710ee08b3f4084`                                     |
| Candidate release set | `2638909aa28758e6bd9c19ffd9370a02c171c19d0dcfbb002ed12205c653de1e`                                            |
| Destination           | Isolated `athyper_neon`, CirrusAtlantic                                                                       |
| Proposed window       | **12 September, 13:00–15:00 MYT**                                                                             |
| New authority         | 47 permission assignments through 10 new memberships/assignments, plus two exact resource scope registrations |

| Actor      | Proposed access                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both       | 17 tenant BP discovery/navigation/read permissions; three exact CirrusAtlantic UK company-provider reads; governed-case read for the selected operating organization and its descendants |
| catl.admin | Two separate tenant bank/tax reveal permissions, retaining MFA; tenant Atlas admission, retaining MFA                                                                                    |
| catl.owner | Exact read of synthetic comment `f167a9e4-5ee9-46e2-8722-46fa59489cb1` and attachment `98c4bc13-16e2-4b82-b40b-310a5f8a7628`                                                             |

Tenant reads and reveals are not technically restricted to one fixture BP. The fixture-only restriction is test discipline. Governed-case read can cover generic cases in the selected organization and descendants. Neither actor receives access to the second comment/attachment. No company command, import/export, Mesh, or source reveal permissions are added. Existing denials and MFA checks remain effective.

The [access rehearsal](../../governance/policy/reports/business-partner-neon-final-access-rehearsal-20260912.dev.json) inserted the proposed scopes/grants, revoked the new memberships/assignments, checked constraints and rolled back everything. All eight authorization-table fingerprints were unchanged. Actual execution must additionally verify approval, current authenticated sessions, the fixed time window, all artifact/image/harness pins, and fixture hashes before granting access.

The [candidate smoke check](../../governance/policy/reports/business-partner-neon-final-candidate-smoke-20260912.dev.json) passed health and an unauthenticated NEON summary rejection with the candidate release-set header. The disposable canary was removed. The active runtime remains on the previously approved company image. Master Data type checks, 12 provider tests, four independent-child tests and four Node release-boundary tests passed. All 295 broader regression tests passed individually, but that run detected workspace changes and is not accepted as a stable-source regression receipt.

The [populated fixture inventory](../../governance/policy/reports/business-partner-populated-final-fixtures-20260912.dev.json) retains two independent comments, two linked attachments, a synthetic tax registration and a provisional bank account on the existing synthetic BP. Both object hashes were independently verified after upload. These records are setup evidence, not qualification of business creation or verified banking.

After approval, qualify populated masking and separately authorized reveals; exact child authorization; nested company data and SQL-filtered case rows/counts; scoped Atlas retrieval followed by access removal; and compatible runtime recovery preserving revocation. Revoke these new memberships and assignments immediately after execution and preserve prior revoked/expired access throughout.

Positive **business-activity** remains a distinct engineering gap: both deployed and source hosts configure procurement, finance, sales, projects and contracts with `PROVIDER_NOT_CONFIGURED` summary readers. A real owning-module reader, populated transaction fixtures and its authorization boundary are required. Case activity or an empty provider response does not satisfy this criterion.

All 66 policy dispositions remain unresolved for the candidate: historical acceptance references changed test evidence and does not constitute final-release comparison or acceptance. Mesh, full Atlas conversations, enforcement approval/activation, compatibility retirement, global/legal-entity ownership and cross-instance revocation synchronization remain excluded or separately approved.
