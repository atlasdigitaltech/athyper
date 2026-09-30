# Metadata-driven Atlas Entity discovery — 2026-10-01

Implementation adds shared, read-only `entity_discover`, `entity_lookup` and
`entity_follow_reference` tools. No entity-specific question matching, model SQL,
new permission grants or relaxed authentication are introduced.

An explicitly named record can be looked up independently of the current page.
Atlas discovers eligible published entity aliases, labels, searchable fields and
capabilities, then calls the existing authorized Records service. The current
page remains the source for relative questions. Named-record tools bypass the
old current-section shortcut so it cannot silently substitute the open record.

Discovery resolves active tenant/plane publications, not draft graphs. It limits
candidate enumeration to 256 entities, returns at most six matching descriptors,
and explicitly reports partial coverage. Each lookup is pinned to its discovered
descriptor hash, projects at most eight requested fields plus the search field,
and returns at most three authorized matches. Multiple matches require user
clarification; absence is not proof of nonexistence.

Metadata and data reads use the verified caller. Entity permissions, operation
bindings, tenant isolation, row/field authorization and existing Records masking
remain authoritative. Discovery conservatively excludes unclassified,
confidential, PII, JSON and metadata-masked fields. Model arguments cannot supply
tenant, principal, plane, SQL or arbitrary query operators. Relative source IDs
and descriptor hashes are bound server-side to the current record. Source and
target are read separately under authorization and both are cited. Evidence is
revalidated by the existing durable-message disclosure service.

Published single UUID references are supported. String-key joins, composite
references and collection traversal are not inferred. Business Partner's
registration-country code and address collection require an explicit successor
metadata contract and qualification; its currently published AI metadata declares
no relationships. Consequently the relative Business Partner example is **not
live-qualified** by this change.

Country's source definition adds the `entity_lookup` capability and `manage`
context while retaining its existing record capabilities. Other eligible entities
can opt in through publication without model retraining or another tool handler.

## Verification and publication state

- Atlas: 277 tests passed; package source/test typechecks passed.
- Metadata: 93 tests passed; two optional database tests skipped; typechecks passed.
- Studio authoring: 238 tests passed; source/test typechecks passed.
- Real Entity authorization/Records integration test passed, including revoked
  permission, denied fields, tenant isolation and plane isolation.
- Host typecheck passed in isolated and DEV source checkouts.
- Country successor persisted as draft `3eec2d8e-fc56-4813-94e1-655f7696183b`;
  recompilation in the isolated checkout matches the deployed-source draft.
- Predecessor: Country release 11, `274fd17d-8e1f-4f2e-91cf-c4424c0c3dbc`.
- Proposed policy: `country-meta-entity-lookup-20261001`, revision 1.
- Maker proposal `108a5817-43ca-4cd7-a2a1-012980c50d6d` is recorded. Independent
  checker activation and positive browser/model qualification remain pending. Code tests are not evidence of live enablement.

DEV changes were merged against the previous feature commit to preserve unrelated
workspace changes. API/worker restart was performed only with no inference lease
owner. The persisted draft creates neither an approval nor an active release.

## Remaining qualification

Publish the exact Country successor through the existing control workflow. From
Business Partner and an unrelated page, ask for Afghanistan's calling code and
verify `entity_discover` → `entity_lookup`, authorized Country fields and record
citation. Test denial/revocation, multiple matches, unavailable page context and
normal current-record summaries. Qualify Studio/Mesh separately. Declare and
publish the real Business Partner relationships before enabling relative
country/address traversal; never guess a default address.
