# MetaEntity source workspace

This repository contains platform-owned MetaEntity **authoring inputs**. A file
move does not validate, approve, sign, publish or activate a definition. Studio
remains the authority for governed release state and independent review.

On 4 October 2026, the remaining seven MDG entities were moved to the owner-selected
source homes: Contact to `common/master/`, Location to
`common/master/`, and Certification to `common/master/certification/`. All 22 moved
files retain their bytes. `entities/mdg/` no longer exists. Folder names do not
change record scope, permissions, storage, navigation or publication status.
The active workspace contains 30 entities. No BP replacement location is declared.

## Domain layout and ownership

| Directory | Responsibility |
| --- | --- |
| `entities/<domain>/<group>/<entity>/` | Existing entity definitions, split artifacts, workflows, presentation and placement inputs |
| `profiles/platform/` | Reusable field and operation defaults, retaining their logical `platform/...` identities |
| `profiles/activity/`, `profiles/collaboration/` | Supporting capability profiles |
| `access/` | Supporting access sources; relocation does not execute or grant access |
| `contracts/` | Authoring and compilation contracts |
| `review/` | Registry/storage evidence and candidate fixtures, not independently deployable entities |
| `history/` | Immutable historical relocation evidence |
| `schemas/entity-artifacts-v2/` | Draft artifact schemas, distinct from native graph contracts |
| `overlays/` | Explicitly governed scoped variations, never environment copies |

`manifest.json` declares the physical roots. Entity descriptors are discovered
recursively beneath the entity root. Folder placement does not assign domain
ownership, storage schemas, module codes, publication targets or navigation.
The [audit correction review](../docs/reviews/entity-metadata-audit-corrections-20261003.md)
records the subsequent source-property corrections and outstanding publication gates.

Logical artifact references such as `address/core.json` resolve through
the derived `entityCode` index, independently of physical domain directories.
Profile references such as `platform/core-field-defaults.v1.json`
resolve relative to the profile root while retaining their existing release-local
identity. No compatibility copies or symlinks are needed. Review/history and
schema files are not discovered as active entity definitions.

The frozen [checkpoint inventory](../docs/reviews/entity-metadata-checkpoint-inventory-20261003.json)
accounts for all 175 relocated metadata files with original SHA-256 hashes.
`history/relocation-map-20260921.json` remains historical evidence; its captured
paths are not the active workspace layout. This workspace does not declare a
single `releaseEntry`; release preparation uses explicitly selected inputs.

The shared offline resolver is `tooling/scripts/metadata/source-workspace.mjs`.
Only `entity.json` with schema `athyper.entity-source/1` or `/2` declares an entity.
All 30 current descriptors use `/2`; `/1` remains supported for existing consumers
and fixtures. The [v2 source contract](contracts/entity-source-v2.md) makes
platform authoring ownership, graph classification and publication target intent
explicit. Unresolved graph properties are recorded as null draft decisions,
never runtime authorization. Required/recommended targets do not expand compiled
artifact planes or attest activation.
Competing declarations fail with both source paths; artifacts may repeat their
owner's `entityCode`. Unknown descriptor schemas/properties, invalid or escaping
paths, unresolved members, duplicate artifact identities and ambiguous logical
refs fail with configuration errors. Capability profile `{code, version}`
selections resolve through existing source locks with byte-hash and identity
checks; native profile parsing still owns binding semantics. Review, history, generated/build output,
dependency and hidden directories are excluded from discovery.

Existing repository-rooted logical inputs such as
`metadata/entities/country/definition.json` are resolved by `resolveSourcePath`
at tooling I/O boundaries. Use the actual physical paths for shell filesystem
commands. No compatibility directories, copies or symlinks are created. The
Python tooling bridge calls this same offline resolver. The derived index is
never saved as a hand-maintained source definition.

| Source home | Entities |
| --- | ---: |
| `entities/common/reference/` | 15 |
| `entities/platform/iam/` | 4 |
| `entities/ppl/workforce/` | 4 |
| `entities/common/master/` | 7 |

The [domain relocation inventory](../docs/reviews/entity-metadata-domain-relocation-20261003.json)
records the original domain relocation of all 49 source/destination homes and the SHA-256 of each of the 202 moved
files. It is historical audit evidence, never a runtime source index. The
[shared-domain relocation evidence](../docs/reviews/entity-metadata-shared-domain-relocation-20261003.json)
records the subsequent nine lookup moves from `mdg/reference/` to
`common/reference/` and three Contact moves from `mdg/bp/` to `mdg/contact/`,
with preserved byte hashes. These are historical paths. The current source homes
are listed above; the owner removed the BP source tree before the 4 October cleanup.

Contact is shared business functionality, with owner-scoped records distinct
from global reference data, HR persons and login identities. The documented
exposure is owner-scoped business views with standard Entity detail navigation
and separately authorized Data Stewardship directories for key users. The move implements source organization only;
validated owner bindings, View/Edit operation bindings and readable presentation
metadata remain separate corrections. Keep existing tables and entity codes.
Neon-only declarations remain source evidence; three-plane applicability follows
the coverage decision below and requires governed implementation/publication.
See the [current integration plan](../docs/reviews/entity-metadata-integration-matrix-20261003.md).
The BP family, including `business_partner_request`, is absent from the active
source workspace following the owner's removal. Historical inventories retain
their captured paths and hashes; they do not restore removed sources.

## Required and recommended plane coverage

The [current coverage table and publication gates](../docs/reviews/entity-metadata-reorganization-plan-20261003.md#three-plane-applicability-and-publication--3-october-2026)
require Neon, Mesh and Studio publication for all 15 entities under
`common/reference/`: bank_branch, bank_identifier, bank_institution,
classification_scheme, commodity_code, commodity_crosswalk, country, currency,
industry_code, industry_crosswalk, language, locale, state_region, timezone and uom.
Required common IAM coverage also includes `platform/iam/principal`,
`principal_profile`, `principal_ui_profile` and `principal_notification_preference`
in all three planes. Each retains its single source home under `platform/iam/`.
The same applicability is recommended for person, address, address_link,
person_address_use, contact_channel, contact_person and contact_person_role.
Keep their domain homes and tenant/owner scope; three-plane availability does not
mean global records, automatic replication or unrestricted user access.

Six reference native definitions and all four IAM native definitions already
declare all three targets. IAM self-service and administrative surfaces must
preserve exact published permissions and server-enforced tenant/record scope. The other
nine references and the seven business entities currently declare Neon only.
Declarations do not prove publication. Exact per-target authorization, dependency,
storage/provider, navigation and operation bindings must be reconciled first;
the table compiler's current permission-prefix substitution is a shared contract
gap, not a valid source of new permission codes. Track independent release review,
activation receipts and verification per entity/plane before claiming completion.
The subsequent audit correction records required/recommended targets in every
descriptor. The nine split references still have Neon-only compiled artifacts;
their descriptors explicitly require all three publication targets. Provider,
authorization and supported authoring gaps remain before multi-plane compilation.
Native product module identities are corrected to their owning modules; target
navigation placements remain separate. No active releases changed.

## Development rules

- Edit each entity's owning source, preserving existing artifact filenames.
  `definition` is the native product input where present; complementary split
  `artifacts` preserve separate dependency contracts. They must not be interpreted
  as competing native product definitions or deleted without contract reconciliation.
- Coordinate overlapping files and release-envelope/hash updates. Do not
  regenerate or publish another workstream's draft merely because it exists.
- Business handlers stay in their owning services. Shared Entity Framework
  discovery and loaders remain domain-neutral.
- Native entity products and split artifacts are distinct formats. Relocation
  does not convert either format or change business semantics.
- Product defaults require Platform Admin authorship and independent Platform
  Owner review. Tenant extensions require tenant-isolated authorship and review.
- No credentials, runtime record data, permission grants or MFA changes belong
  in this relocation activity.

## Offline checks (from repository root)

```sh
pnpm metadata:check-layout
pnpm metadata:check-layout --release-ready
pnpm metadata:check-layout --baseline
node tooling/scripts/catalog/generate-platform-catalog.mjs --check
python3 tooling/scripts/metadata/validate.py
```

The layout check verifies preserved source files, logical artifact/profile
references, schemas and registry evidence. `--baseline` compares JSON bytes with
the checkpoint; later property edits require their own review. Catalog `--check`
compares generated text without writing outputs or changing module identities.
These checks do not verify runtime behavior or establish publication approval.
Draft checks report required/recommended source coverage deltas; `--release-ready`
rejects unmet required coverage. The derived report tracks each unresolved graph
classification without selecting one at runtime. See the
[successor audit follow-up](../docs/reviews/entity-metadata-audit-followup-20261003.md)
for registry inventory and unsigned module-correction plans.
The broader validator verifies frozen DDL hashes against current bytes or an
exact matching Git revision, reporting historical-only matches explicitly.
Historical-only evidence blocks release readiness until reviewed current evidence
is captured. Never recreate retired SQL or rewrite historical hashes to pass.

After separate implementation/build approval, the collaboration candidate uses
an explicit closure of declared roots and transitive dependencies:

```sh
pnpm exec tsx tooling/scripts/metadata/compile-release-candidate.mts \
  --candidate metadata/review/release-candidates/business-partner-collaboration-ca08.json
python3 tooling/scripts/metadata/validate.py \
  --release-candidate metadata/review/release-candidates/business-partner-collaboration-ca08.json
```

`--release-ready` remains an explicit freeze gate. It rejects unsigned,
unapproved or unpublished dependencies; a source move does not satisfy it.
Live schema and permission gates require their configured database access and
are outside the offline relocation checks. Audit correction tests are recorded
in the successor review; publication and live runtime probes remain unverified.

## Retained locations

- `server/db/scripts/provisioning/`: native graph assemblers and helpers.
- `server/packages/planes/studio/meta-entity-authoring/`: native compiler,
  authoring service and presentation lowering.
- `docs/architecture/application-experience/entity-policy-examples/`: captured
  historical descriptor/source-bundle evidence, not alternate editable sources.
- Studio storage: governed snapshots, approvals, signatures and active releases.

The old `New_Entity/verify_live_schema.py` entry point is retained because an
unchanged review release records its historical command. It delegates to the
current live schema gate. Remove it only through separately reviewed successor
release evidence; never rewrite historical hashes to remove that binding.


## Permission cleanup review input

The [owner-directed cleanup input](../docs/reviews/entity-metadata-permission-cleanup-20261003.json)
and [controlling design](../docs/reviews/entity-metadata-reconciliation-20261003.md#owner-directed-permission-cleanup--controlling-correction)
replace earlier retain-by-default recommendations. These files are review data,
not metadata discovery inputs or permission grants. Explicit removals require
migration of active consumers and removal of old catalog/provisioning references;
a source move or permission rename alone does not complete cleanup. Preserve
historical release/migration evidence and existing MFA controls. Implement all
surface admission through the shared Entity Framework, with no bespoke stack.
