# BP projection readers and predecessor reconciliation

**Current follow-up:** [Nested projection, runtime and tenant-override review](bp-nested-projection-runtime-review-20261003.md). The owner approved unavailable coverage references. Shared nested projection/display and compiler admission fixes are implemented; exact tenant deltas are recorded. Root legacy operation/storage reconciliation, complete runtime publication and independent approval remain blocked.

Date: 3 October 2026. **Unsigned implementation checkpoint; not ready for activation or permission retirement.** Existing DEV is the only target. No persistent database changes, release publication, authorship/review attestations, permission deletion or role/group changes were performed in this checkpoint.

## Read-model implementation

Country's `entity.record.list.v1` / `entity.record.read.v1` and `tenant.record.v1` select the existing host read registrations, shared query service and Entity list/detail routes. Banking, industry and qualification drafts now select those same handlers. Their `directoryScope.parent` remains mandatory; a SQL view is not an authorization substitute. Complete runtime members are still required by the shared compiled-runtime validator before publication.

| Entity | New read object | Behavior |
| --- | --- | --- |
| Banking | `master.v_partner_banking_read` | Bank/branch labels, instrument lifecycle, account holder and last four digits; link identity for the existing protected reveal operation. No raw account value. |
| Industry | `master.v_partner_industry_read` | Assignment facts, industry code/name joined on both ID and domain, verified/unverified state. |
| Qualification | `control.v_partner_qualification_read` | Stored decisions, tenant/qualification-scoped coverage, bounded condition summaries and a UTC date-window assessment. No eligibility or condition-satisfaction assertion. |

Each is a security-invoker, security-barrier view. Existing underlying tenant RLS remains applicable. The additive forward migration and fresh-install manifest include the same definitions; no applied migration was rewritten. Only existing database application/admin roles receive SELECT; these are not business permission grants. The migration has **not** been applied to DEV.

Core field bindings now describe the actual view columns. Read and list operations select the existing shared registrations; old proposed entity-specific read handler names are removed from these three drafts. Cached draft hashes are removed so compilation owns new artifact hashes. Request/change/reveal operations and their controls remain preserved dependencies, not newly qualified capabilities. No MFA requirement or implementation changed.

### Qualification reference decision

The owner approved unavailable context references until sourcing events, engagements, contracts and projects are onboarded. Non-standing contexts return `[{"name":null,"state":"unavailable"}]`; standing records return `[]`. Context IDs and private decision reasons are not projected. No ungoverned context-label query is introduced.

Conditions expose only the `partner-condition-summary.v1` presentation envelope: a nonblank string of at most 1,000 characters. At most 100 summaries are projected, while `recorded_condition_count` retains the full count. Invalid or absent envelopes yield `summary_unavailable`; they never imply a waived condition. Private condition properties are excluded.

Coverage retains its declared stored dimensions and technical reference coordinates. **Its nested lookup presentation remains a blocker:** referenced UUIDs must resolve through authorized, published display contracts or explicitly declared unavailable reference presentation. The view does not grant target-record access or authorize UUID display. This checkpoint does not certify the nested UI renderer or coverage reference authorization. The owner's context-reference decision is not treated as blanket approval to change coverage semantics.

Banking and tax remain tenant plus required BP parent scope, with no company relation introduced. Organization assignment retains the prior explicit organization binding.

## Verification

- The three SELECT projections describe successfully against existing DEV tables in a read-only transaction: 12 banking, 16 industry and 15 qualification columns.
- PostgreSQL fixture runner: `node server/db/scripts/tests/integration/partner-child-read-models.mjs athyper-dev-db-1`. It accepts only an existing container labeled `athyper-dev`, creates session-local fixtures/views and rolls back. Checks cover tenant-safe joins, parent predicates, domain label isolation, excluded bank/decision secrets, context unavailability, coverage isolation, malformed condition envelopes, count/summary limits and UTC start/end boundaries.
- Migration inventory/layout verification passes: 121 classified files, 113 retained SQL files.
- Shared required-parent and compiled-runtime contract tests pass: 13 tests; Records parent-scope and parent-collection tests pass: 12 tests. These preserve the rejection of incomplete or contradictory runtime contracts; they do not establish a compiled BP release.

The Country reference preparation also succeeds with the unchanged default profile location; it produces offline unsigned output only.

These checks do **not** constitute real-user RLS admission, browser acceptance, signed release compilation, publication or DEV cutover. Temporary fixtures do not alter production records.

## Predecessor reconciliation

[Machine-readable provenance](entity-product-predecessor-provenance-20261003.json) records captured release/revision/contract/product identities, the input inventory hash, parser input hashes, Git source paths/commits, attempted hashes, exact matches and current-source JSON-pointer differences. The tool is read-only and searches reachable source history, including the previous source layout, with historical capability profiles. It never changes a predecessor graph to force a match.

| Previous state | Current finding | Remaining action |
| --- | --- | --- |
| Seven unresolved products | Exact predecessor product hashes recovered for Currency, Language, Principal, Principal Notification Preference and Principal Profile | Review their non-module changes explicitly; recovery does not make current sources module-only successors. |
| Country, Principal UI Profile | No exact predecessor recovered from the searched reachable history | Recover original publication inputs or use the governed reconciliation process; do not overwrite the recorded predecessor. |
| Locale, State Region, Timezone | Previously prepared unsigned candidates remain unsigned | Await module-contract decision and exact human review. |
| Address, Person Address Use, Employee, External Worker, Person | Historical predecessor inputs recovered; module destination decision remains deferred | Resolve the authoring-module contract before preparing further successors. |

Currency and Language include AI/choice-definition differences. Principal includes AI, localization, navigation, relationships and presentation differences. Principal Notification Preference includes AI, lookup and identity/presentation differences. Principal Profile includes form-presentation differences. Exact paths are in the provenance report; none is silently bundled into a module reassignment.

## Release review gates

1. Finish coverage/nested presentation qualification and complete the BP root plus seven child runtime contracts, preserving unrelated BP behavior. Qualify actual shared list/detail, required-parent and organization-scope paths.
2. Resolve the approved tenant override separately from the platform baseline, using exact source release identities and hashes.
3. Resolve the deferred module contract and the two unrecovered predecessors. Prepare separately reviewable amendments for the five recovered products with additional source changes.
4. Platform Admin must author/propose the exact product release; a different Platform Owner must review/approve it. Tenant extensions require their corresponding independent tenant authorship/review. No such evidence is fabricated or recorded by this implementation.
5. After governed activation, prove allowed/denied/deep-link behavior on existing DEV, then execute the guarded permission cleanup with role/group relationship handling and rebuild-prevention verification.

**All seven redundant BP child-read permissions remain unretired.** Permission retirement must not precede governed successor publication and qualification. This report prepares evidence for review; it is not independent release approval.
