# Metadata audit follow-up

Date: 3 October 2026. This follow-up supersedes the unresolved-test and
unverified-registry status in the earlier correction report. Other concurrent
workspace changes were preserved. No database writes, grants, signatures,
publication, runtime activation or MFA changes were performed.

## Registry inventory and review preparation

The [source-derived inventory](entity-module-registry-inventory-20261003.json)
captures local `athyper_studio`, `athyper_neon` and `athyper_mesh`, with each query
inside a read-only transaction. The scope is the 15 current native products and
platform-owned (`tenant_id IS NULL`) registry rows. Codes are supplied from the
shared source resolver as query data; SQL contains no entity dispatch or code list.
The snapshots are sequential per database, not a distributed atomic snapshot.
No remote environment was inspected.

All 15 local Studio rows currently use `ent`. Ten have active destination modules:
six references → `rel`, four IAM products → `iam`. Address, Person Address Use,
Employee, External Worker and Person require `loc`, `hr` or `workforce`, which
do not exist in Studio's module catalog. Their source/domain module coordinates
need governed authoring-module contract reconciliation; do not create Neon module
copies in Studio or remap them to arbitrary existing modules. Neon/Mesh have
module catalogs but do not host `metadata.entity` or `metadata.entity_release`;
that is distinct from evidence that a product is unregistered there.

The [unsigned successor review inputs](entity-module-successors-20261003.json)
record all 15 registry correction plans with exact existing entity/module IDs,
destination IDs where available, row status, source hashes and predecessor release
identities/hashes. They specify Platform Admin authorship and independent Platform
Owner review, with actor IDs, approval and signatures unset. They are not
executable migrations, registered drafts or release approvals.

Three candidates were compiled for review: Locale, State Region and Timezone.
Each preserves the complete captured predecessor graph and changes only its
product marker module identity/hash, after verifying the old product source hash.
Seven candidates (Country, Currency, Language and four IAM products) are blocked
because the current sources, with the observed old module restored, do not match
the predecessor product marker. Reconcile those sources/amendment histories before
claiming a module-only successor. Five are blocked by missing destination modules.
The plans identify all blockers individually instead of fabricating predecessor
identity or replacing published graphs wholesale with current definitions.

Snapshot hashes use PostgreSQL `jsonb::text` serialization; candidate/compiler
hashes use the existing compiler's canonical JSON. The inventory independently
recomputes the snapshot hash with its owning database function and retains the
original release hash. These distinct hash contracts are recorded separately.
Before enrollment/application, recheck source and row/predecessor pins, capture
active target heads/publication lineage, resolve blockers, complete human review,
and use the existing governed successor workflow. No permission or record-scope
changes accompany the module correction.

Reproduce the inventory and preparation using new output paths:

```sh
node tooling/scripts/metadata/inventory-module-identities.mjs \
  --container athyper-dev-db-1 --output <inventory-review.json>
pnpm exec tsx tooling/scripts/metadata/prepare-module-successors.mts \
  <inventory-review.json> <successor-review.json>
```

## Source coverage, classification and placement

The [derived coverage report](entity-source-coverage-20261003.json) lists all
34 unresolved graph classifications individually, including Business Partner.
It records 18 required declaration gaps (nine references × Mesh/Studio) and
14 recommended gaps (seven business entities × Mesh/Studio). Coverage remains
source evidence, not activation evidence. Draft layout checks print deltas;
`--release-ready` rejects required gaps. Python readiness scopes that check to
entities represented in the selected release's artifacts.

Both the structural schema and resolver now enforce database classification and
ownership enums while preserving explicit null drafts. Unsupported non-null values
are rejected even for split sources without a native graph.

Placement remains 14/49. Missing placements break down as nine references, three
IAM children, four recommended business entities, 17 BP supporting entities,
Certification and Workforce. The four recommended entities without placement are
Address Link and the three Contacts. Address, Person and Person Address Use already
have placements. Parent/self proposals remain proposals; missing placement is not
proof of approved embedded-only intent. Decisions stay anchored in the existing
surface proposal; no new routes or exposure were invented.

The seven complementary format pairs still need lossless consolidation. Canonical
native selection and retained split dependencies do not complete conversion.
The Studio `exp` catalog discrepancy also remains a governed catalog task.

## Validation and historical evidence

The Studio authoring test now asserts that absent operation permissions compile to
an empty grant requirement while preserving declared rules and scopes. Rejection
of unpublished target surfaces remains tested. Production authorization was not
modified to make the test pass.

Frozen DDL receipts are verified against current bytes or exact hash-matched Git
history. Removed BP profile SQL and the earlier index SQL match revision
`1440d3074ab705cd568243be1c8a91a1e65646e7`. Offline validation reports those as
historical-only evidence; release readiness requires recapture of current evidence.
No old files were restored and no frozen receipts/hashes changed.

The broader Python validator now passes that missing-file boundary and encounters
another source/shape-catalog inconsistency: `core.fields.[].display` is absent from
the frozen normative shape catalog. Concurrent presentation/source changes and
their review receipts were left intact. This gate remains non-green; the follow-up
does not claim broader metadata validation, publication or live UI verification.

Focused validation: 14 Node metadata/layout/catalog tests, 34 Studio authoring
tests, and two historical-evidence tests passed. All 49 descriptors pass the
enum-constrained schema; catalog `--check` and diff whitespace checks pass.
The full Studio authoring suite also passes: 370 tests passed, one skipped
(75 passing test files, one skipped). Each prepared candidate was independently
compared against its captured predecessor: only marker `moduleCode` and
`productHash` differ; all business fields, operations, permissions, scope,
capabilities and presentation are preserved.
The required-coverage release gate rejects the nine incomplete references as
expected. The three unsigned candidates compile successfully, with predecessor
snapshot and original product source pins verified.
