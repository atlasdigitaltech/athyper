# NEON Finance activity and positive reveal execution proposal

Local engineering is complete for the Finance journal summary and selected-context reveal wiring. Authenticated positives, final-release recovery/revocation and the 66-disposition comparisons/acceptance are **not complete**.

The proposed execution window is **12 September 2026, 14:00–16:00 MYT**. It requires separate execution-access approval under the user's existing instruction. No expired or revoked assignment will be renewed.

The [exact proposal](../../governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json) has revision `01d4baa18931c72025a4cea425b7b34ff111f5e76c54767d7f7c428c15fc6d45`. It pins candidate image `sha256:09f65ba5550ab4344ecf46dd627c1060b173652c8b65029b778e31b2f1882f0a` and release-set `fa38af6dc796d520ffa30ea10920d69f0a85c52311062f6ba6493118bca0acde`. The five signed BP/dependency artifacts remain unchanged. The active image remains `0a2546bd…`; the candidate has only run as a disposable isolated canary.

## Proposed access and fixture changes

There are **52 permission assignments in 13 new groups/memberships/assignments**. These do not reactivate any prior group or assignment.

| Actor           | New access                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Both            | Published BP target reads; exact UK company provider reads; selected organization-subtree case read and source BP read              |
| catl.admin only | Target and organization-subtree source bank/tax reveals, with MFA, replay protection and auditing preserved; scoped Atlas admission |
| catl.admin only | New `finance.ledger.business_partner_activity.read`, owned by Accounting and scoped exactly to CirrusAtlantic UK                    |
| catl.owner only | Exact access to the first synthetic comment and attachment; sibling children remain ungranted                                       |

Tenant-scoped BP target reads cover the isolated tenant, and organization-subtree source permissions cover the selected organization and descendants. Restricting operator activity to the inventoried BP is test discipline, not a narrower policy grant. The Finance permission does **not** grant `finance.ledger.read`, posting, or another Finance command. Owner has no Finance activity permission and is the negative control.

The proposal includes a guarded NEON catalog-reference migration for the new Accounting-owned, medium-risk, exact-company permission. It creates no grants by itself. Accounting entitlement is already present for the tenant. The rehearsal applied this reference only inside a rolled-back transaction.

The additional populated dataset is one synthetic draft GL account, three unposted draft journals and six journal lines, created with fixture-provisioner attribution. Exact identifiers and SQL are pinned in the proposal. These are count fixtures, not evidence of Finance posting or a business command lifecycle. Retain them in the qualification inventory/history if committed during the approved run. Existing bank, tax, company, comment and attachment fixtures remain pinned separately.

## Completed engineering evidence

- Finance checks current organization/company/BP compatibility, independently checks its permission before and after reading, and rechecks company compatibility before returning data. SQL filters tenant, company, BP and business date before aggregation. `EXISTS` prevents duplicate BP lines inflating journal counts.
- [Production-reader SQL preview](../../governance/policy/reports/business-partner-finance-activity-preview-v2-20260912.dev.json): one matching journal today, two on the later business date, zero on the earlier date, and incompatible-company rejection. Real isolated database constraints were exercised. Every fixture insert rolled back. This uses an injected authorization allow for SQL engineering and is explicitly **not authenticated qualification**.
- Selected organization/company now travels through bank/tax reveal clients, HTTP contracts, replay fingerprints, stored ownership resolution and source authorization. Incomplete and incompatible contexts fail before protected-value reads.
- Published target reveal business-policy admission is limited to bank/tax operations with existing-record target, parent admission, preflight and elevated assurance. Real IAM tests preserve missing-grant, explicit-deny, MFA and SoD failures. Source/target intersection is unchanged.
- 60 focused tests passed: 41 Master Data service/route/reveal tests, 7 UI/client tests, 5 target-policy tests and 7 Finance-reader tests. Master Data, Finance, host and BP UI type checks passed; affected server packages compiled.
- The compiled server delta against the deployed image contains eight files. The Finance index preserves its deployed exports and adds only the new reader. Canary health returned 200; unauthenticated activity returned 401 with the exact candidate release-set header. UI changes remain local source, and no new UI image is included.
- [Access rehearsal](../../governance/policy/reports/business-partner-finance-reveal-access-rehearsal-20260912.dev.json): all 52 assignments and 13 memberships/assignments validated, then were revoked inside the transaction, followed by full rollback. Authorization/catalog fingerprints were unchanged.

## Qualification and closure after approval

Use normal authenticated sessions for the correct actors and CirrusAtlantic tenant. Verify the exact candidate image, five artifacts, migrations, fixtures and proposal hash before applying new access. Qualify positive masked/revealed data, company reads, independent children, populated Finance counts, wrong/stale context and owner Finance denial. Capture staged API/command/Atlas revocation and compatible recovery against this final image. Preserve prior revoked and expired access throughout.

Refresh all 66 policy comparisons using final-release evidence. Present intentional differences for **separate explicit acceptance**; this proposal does not accept them. Ordinary-case positive `openWork` counts still need a populated open-case fixture; Finance journal counts do not substitute for that evidence.

Revoke the 13 new memberships/assignments immediately after qualification and no later than 16:00 MYT. Record retained fixtures, catalog/role definitions, revoked history and approval/command records. Recheck the publication queue and final access inventory. Mesh, enforcement approval/activation, compatibility retirement, global/legal-entity ownership, cross-instance synchronization, full Atlas conversations and a posted-journal workflow remain excluded.
