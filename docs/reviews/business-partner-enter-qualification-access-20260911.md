# BP qualification access review

Status: current access inventoried; proposed temporary assignments passed insertion and revocation rehearsals; **no grants applied**.

## Current state

Read-only checks of shared DEV and the fresh isolated clone confirm catl.admin and catl.owner are active with active NEON plane admission. Neither database has NEON roles, role-permission grant paths, delegation grants, denials, overrides or record ACLs supplying business access. Plane admission and reviewer nomination do not grant BP permissions.

Studio retains five temporary author/publisher permissions for catl.admin and one metadata review permission for catl.owner, valid 11 September 17:00–21:00 MYT. They remain separate from NEON test permissions. No extension is proposed. The authenticated runtime-review receipts for the exact signed artifact remain recorded; qualification grants do not replace those approvals.

Inventory: `governance/policy/reports/business-partner-enter-qualification-access.dev.json`.

## Concrete isolated-only proposal

Proposal `f24babe9afad16fb34680bee4da2e407a5353e446b7b4bcaa450bc77ae860d3a` in `governance/policy/reviews/business-partner-enter-test-access.proposal.dev.json` pins the exact release, artifact, image, database/network, principal IDs, permission IDs and scope-target IDs.

Window: **11 September 2026, 18:30–22:30 MYT** (10:30–14:30 UTC).

| Account    | Proposed permissions                                        | Scope / propagation                                               |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| catl.admin | 17 BP read permissions                                      | CirrusAtlantic tenant, exact                                      |
| catl.owner | Same 17 BP read permissions                                 | CirrusAtlantic tenant, exact                                      |
| catl.admin | BP import and export                                        | CirrusAtlantic tenant, exact                                      |
| catl.admin | Case create, read, update, validate, submit and materialize | `catl.operations` operating organization and descendants, subtree |
| catl.owner | Case read and decide                                        | Same operating organization and descendants, subtree              |

There are **44 permission assignments across five new groups/roles**. Existing IDs are never reactivated or reused. The current catalog requires subtree propagation for case permissions. An earlier exact-only proposal was rejected in a rollback-only rehearsal and is preserved separately; the revised proposal explicitly exposes the subtree boundary. There is currently one organization scope in the captured tenant inventory, but future descendants would be covered during the validity window.

The case capabilities are generic `entity_case` permissions: they cover governed cases in that organization subtree, not only BP test records. Using newly created BP cases is an operator restriction, not an IAM entity/record restriction. This exposure requires explicit approval.

Catalog MFA/risk/SoD flags stay unchanged. Case decision requires MFA; maker/approver/applier workflow checks remain. No extra grant-level MFA condition is claimed. catl.admin is the proposed requester/applier; catl.owner is the independent approver. New source-permission allows are not automatically added and current source constraints remain applicable.

Excluded: shared grants or enforcement activation, sensitive reveals, company-scoped permissions (no active company scope target exists), supplier qualification administration, independently owned child/pilot grants without exact published policies, and acceptance of policy differences. Those remain separately scoped access/engineering gates.

## Validation and next step

Rollback rehearsal inserted all 44 permission assignments, five memberships and five scoped assignments, then exercised revocation of only those new rows. It reported zero remaining active test memberships/assignments, forced deferred constraints, and rolled back. All captured authorization and activation fingerprints were unchanged.

Receipt: `governance/policy/reports/business-partner-enter-test-access.dry-run.dev.json`.

Explicit approval is still required to commit this exact proposal. At application, recheck current time, catalog/principal/scope identities, the isolated destination, pinned artifact/image, and existing grant state. Abort on changes or an expired window; never renew automatically. Clean up only the newly approved assignments after testing, preserving revocations and expiries. A passed SQL rehearsal does not establish that authenticated business commands succeed.
