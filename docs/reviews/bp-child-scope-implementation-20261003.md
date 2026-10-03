# BP child scope implementation and publication status

**Latest implementation checkpoint:** [BP projection readers and predecessor reconciliation](bp-projection-reader-and-predecessor-review-20261003.md). Banking, industry and qualification SQL read models and draft shared read/list bindings are implemented and fixture-qualified; complete runtime publication and nested coverage presentation remain gated. Five of seven predecessor source blockers are recovered but have additional source changes to review; two remain unresolved. Context references will be unavailable as approved. No permission retirement or independent release approval has occurred. Earlier counts and statuses below describe their recorded checkpoints.

Date: 3 October 2026. Status: scope implementation completed locally; projection readers and governed publication remain incomplete. Existing DEV is the only intended deployment. No live writes or permission cleanup were performed.

## Owner clarification

The owner specified: **“no company relation for tax and bank at this stage.”** Banking and tax child drafts now use tenant scope with their mandatory published BP parent relationship. Their business-context declaration is tenant-scoped. Existing bank company-assignment data was not changed; this correction does not add company ownership to tax records. Existing permission bindings, protected-value masking, reveal requirements and MFA configuration were not modified.

This supersedes the earlier proposal to add company scope to these two child views. Historical inventories and generated proposal snapshots remain evidence of their capture time, not current activation instructions.

## Shared framework change

`directoryScope.fieldBinding` explicitly selects the reusable `neon.directory.fields.v1` resolver and names immutable persisted UUID scope fields. Organization assignment declares its `operating_organization_id` field. No entity name selects this implementation.

The Neon resolver uses the existing principal-authorized work-context catalogs. It requires a selected scope, rejects forged or incompatible selections, includes catalog revisions in cursor authority, and emits equality constraints through the ordinary repository. It rejects multi-selection for this capability rather than weakening scope. The shared parent resolver intersects those constraints with its independently authorized parent predicates.

The shared SQL and in-memory repositories enforce the same field binding and target storage identity. Null or different owners do not match. Counts, groups and selected-record queries use the constrained query. Publication/compiler and descriptor admission reject missing, writable or non-UUID fields; split publication requires an enforcing runtime member and matching source/runtime binding. This also supports other eligible entities through explicit metadata.

The existing Neon organization selector recognizes the resolver's declared work-context requirement. Changing selection preserves parent coordinates. The existing UI rejects company-only/combined coordinate requirements; backend support does not imply those UI flows are qualified. Organization assignment is the only BP child opting into this capability in this checkpoint.

Banking and tax do not opt into this field binding. The capability supports company scope for other explicitly configured entities, but no company relation has been added to these BP children.

## Integration trace

Country's native definition declares `entity.record.list.v1` and `entity.record.read.v1` with `tenant.record.v1`. Studio's product compiler and runtime projection produce the published descriptor. Host `read-registrations.ts` binds those operations to the shared query service; `services.ts` and `read-runtime.ts` compose parent scope, ordinary authorization and list/detail queries. The shared list routes and record presentation remain the consumption path. This implementation extends that scope/query path without adding routes, entity-specific UI or a separate authorization stack.

## Verification and limits

Focused checks passed: 23 Neon resolver tests, 16 Records parent/repository tests, 15 metadata parser/publication tests, two directory contract tests and one Studio graph compiler test. These include two unrelated entity names, invalid/revoked/incompatible coordinates, exact parameterized SQL, parent/scope intersection, counts/groups, selected IDs, null owners and tenant separation.

Five host Country/standard read-registration checks also passed. The Neon list-view typecheck passed. No browser acceptance run was performed. The broader frozen metadata shape/evidence gates remain separate blockers; this change does not rewrite their historical receipts.

Production typechecks passed for Records, Neon, metadata and Studio authoring; Neon and Studio test typechecks passed. The Records test typecheck remains blocked by optional-permission typing errors in existing authorization fixtures; the new test files have no reported type errors. SQL compilation and in-memory checks are not a PostgreSQL execution rehearsal or a verified DEV user flow.

## Remaining publication gates

1. Implement and qualify the full banking, industry and qualification projections. Qualification's nested context references, coverage and condition summaries must retain their own authorized projection semantics. A table read or an unqualified handler name does not satisfy this gate.
2. Compile complete BP root and child runtime contracts with these updated scope declarations. Resolve the existing tenant override through the appropriate authority, preserving all unaffected BP behavior.
3. Obtain Platform Admin authorship and independent Platform Owner review for exact product release identities and hashes, plus the corresponding tenant review where needed. Only then activate through Studio, prepare role relationships, run guarded cleanup and verify DEV allowed/denied/deep-link behavior.
4. Module successors remain a separate track: three unsigned candidates, seven predecessor reconciliation blockers and five awaiting the deferred module decision. This scope implementation does not change those states.

The seven old BP read permissions have not been removed from existing DEV. This is a source/framework checkpoint, not publication approval or a completed permission cutover.
