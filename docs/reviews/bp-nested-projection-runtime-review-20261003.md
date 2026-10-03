# BP nested projection and runtime review

**Follow-up:** [Read-contract implementation and exact legacy-binding ledger](bp-read-contract-and-legacy-binding-review-20261003.md) supersedes the next-build findings below. This document records the earlier checkpoint.

3 October 2026. **Implementation checkpoint; publication and independent approval remain blocked.** Existing DEV only. No release head, permission, role/group relationship or persisted review was changed.

## Implemented

The owner confirmed **“Show unavailable-reference text now”** for companies, organizations, commodities and tax jurisdictions. Qualification coverage now explicitly declares `display.unavailableReference` on its six UUID reference fields. Stored rule dimensions and technical coordinates remain intact. The shared section presentation, browser DTO parser and existing renderer carry the published message “Reference unavailable or not permitted”; they do not request target labels. This is explicit metadata configuration, not a fallback after an authorization failure. Conflicting lookup/renderer declarations and invalid labels fail publication validation.

Dynamic nested code labels (such as coverage countries) are now resolved by the actual deduplicated values in the authorized response, rather than the first catalog page. Explicit unavailable UUID references trigger no label read.

The shared Records query service previously rejected all nested JSON, including the three qualification read-model arrays. It now admits an explicit `structuredProjection` contract for read-only, non-queryable JSON object arrays. Qualification declares coverage (maximum 1,000 items), context references (one) and condition summaries (100). Each declaration specifies every permitted key, scalar type and nullability. Extra keys, missing keys, unexpected nested objects, invalid values and oversized arrays fail closed before list/detail returns data. Undeclared nested data retains its existing denial. This grants neither target-record access nor label resolution.

The runtime descriptor parser validates these declarations. Compiled Core and runtime members must have identical normalized declarations; changing the runtime's array limit or fields independently fails compilation. Existing field authorization, masking, tenant/parent scope and explicit deny controls remain in place. No MFA code or configuration changed.

The Core artifact parser now admits the existing `directoryScope` and `entityRelationships` properties. Previously, the source drafts declared them but the closed artifact parser rejected them before the runtime validator could enforce them. Tests now parse the real seven Core drafts before proving that a missing enforcing runtime still blocks publication.

## Runtime completion findings

The active tenant BP runtime has **43 operation bindings**. Qualification against the current shared read-registration builder rejects them. Its legacy directory operation is `discover`; the shared read contract requires `list`, and the artifact names legacy domain handlers. This diagnostic covers the current shared read registrations, not any unobserved deployment-specific injected handlers. It is not permission to delete those operations, downgrade them to generic reads, or restore the removed bespoke application.

A complete successor must explicitly reconcile the root's existing operations, presentation and field mappings before adding the seven child runtime members. In particular, current BP Core person-field bindings point to person columns while the selected root read view does not join Person; code/label aliases cannot be inferred from those bindings. A syntactically valid descriptor would not establish a correct root projection.

BP Request is an existing collection contract with `operation_scope_bindings`. It deliberately has no handler runtime. Its qualification must use that collection path; the shared read-handler qualifier must not be substituted for it.

**No complete BP runtime release was compiled in this checkpoint.** The shared nested projection machinery is implemented and tested; full BP root/child integration, navigation, permitted/denied browser flows and deployment qualification remain incomplete. The existing section renderer is updated, but no DEV browser acceptance claim is made.

## Tenant override reconciliation

[Exact reconciliation evidence](bp-tenant-override-reconciliation-20261003.json) was generated from the active DEV heads in a read-only transaction:

| Authority | Source release | Artifact hash |
| --- | --- | --- |
| Platform | `28bf5bff-caba-5a16-b971-dfc376b2b501` | `0c37e4c13904b0586c4b591e906ee5e80753f3e57a99f4affd37a6c2e6e154fa` |
| Tenant `11111111-1111-4111-8111-111111111111` | `b0515908-244d-40e9-b518-12116ddb7354` | `bfb27ee31463398b9fd1e5e2c473e1216c16967c8e019120add54a792e779ced` |

The platform contains 120 artifacts; the tenant contains 122. Comparing content without artifact hashes identifies:

- Tenant-only BP and BP Request runtime members: preserve for explicit reconciliation, not automatic promotion into the platform product.
- BP Core: tenant storage and field changes; current source preserves some changes and differs elsewhere.
- BP Request Core: tenant field changes; current source preserves some changes and differs elsewhere.
- BP Request Operation: its tenant content delta is represented in the current source.
- Other common artifacts have equal content. A different stored artifact hash alone is not classified as a content delta.

The reusable offline tool compares platform, tenant and current workspace source, records exact predecessor hashes and JSON-pointer paths, and runs the shared read-registration diagnostic. Array paths are positional and deliberately conservative; unresolved paths are review work, not an assertion that every path represents an independent business conflict. No merge, tenant-head removal, baseline overwrite or approval inheritance occurred. Reconciliation analysis is complete for this capture; the governed tenant successor is not complete.

## Verification

Focused tests pass: six structured-contract tests, six unavailable-reference validation tests, 21 shared section-service tests, 21 Records projection/masking/parent-scope tests, and 14 metadata/runtime tests (68 total). These include two unrelated entity/field names, malformed and undeclared nested data, exact Core/runtime consistency, existing masked values and parent scope. The section-service mock assertions now verify exact requested lookup values.

Production typechecks passed for metadata contracts, publication contracts, platform metadata, platform experience and Records. Browser descriptor-client and form-detail typechecks passed. These checks do not establish a signed release, live runtime admission or browser acceptance.

## Independent review status and next gate

Platform Admin authorship and independent Platform Owner approval remain required for the exact completed product successor. Tenant Admin/Tenant Owner authority remains separate. All author/reviewer fields in the evidence are null; no service account or automated check is treated as a human reviewer.

The immediate next build gate is the complete root operation/storage/presentation reconciliation, followed by the seven enforcing child runtime members and the tenant successor. Only once that concrete release passes compilation and runtime qualification should it be submitted for independent approval. Existing permission cleanup remains gated behind reviewed publication and DEV access verification. **All seven old BP child-read permissions remain unretired.**
