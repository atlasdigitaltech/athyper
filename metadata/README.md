# MetaEntity source workspace

This repository contains platform-owned MetaEntity **authoring inputs**. A file
move does not validate, approve, sign, publish or activate a definition. Studio
remains the authority for governed release state and independent review.

## Flat layout and ownership

| Directory | Responsibility |
| --- | --- |
| `entities/<entity>/` | Existing entity definitions, split artifacts, workflows, presentation and placement inputs |
| `profiles/platform/` | Reusable field and operation defaults, retaining their logical `platform/...` identities |
| `profiles/activity/`, `profiles/collaboration/` | Supporting capability profiles |
| `access/` | Supporting access sources; relocation does not execute or grant access |
| `contracts/` | Authoring and compilation contracts |
| `review/` | Registry/storage evidence and candidate fixtures, not independently deployable entities |
| `history/` | Immutable historical relocation evidence |
| `schemas/entity-artifacts-v2/` | Draft artifact schemas, distinct from native graph contracts |
| `overlays/` | Explicitly governed scoped variations, never environment copies |

`manifest.json` declares the physical roots. Entity sources remain flat at
`entities/<entity>/` for this checkpoint. Folder placement does not assign domain
ownership, storage schemas, module codes, publication targets or navigation.
Domain nesting and format/property corrections remain separate review steps.

Artifact references such as `business_partner/core.json` resolve relative to the
entity root. Profile references such as `platform/core-field-defaults.v1.json`
resolve relative to the profile root while retaining their existing release-local
identity. No compatibility copies or symlinks are needed. Review/history and
schema files are not discovered as active entity definitions.

The frozen [checkpoint inventory](../docs/reviews/entity-metadata-checkpoint-inventory-20261003.json)
accounts for all 175 relocated metadata files with original SHA-256 hashes.
`history/relocation-map-20260921.json` remains historical evidence; its captured
paths are not the active workspace layout. This workspace does not declare a
single `releaseEntry`; release preparation uses explicitly selected inputs.

## Development rules

- Edit each entity's owning source, preserving existing artifact filenames.
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
pnpm metadata:check-layout --baseline
node tooling/scripts/catalog/generate-platform-catalog.mjs --check
python3 tooling/scripts/metadata/validate.py
```

The layout check verifies preserved source files, logical artifact/profile
references, schemas and registry evidence. `--baseline` compares JSON bytes with
the checkpoint; later property edits require their own review. Catalog `--check`
compares generated text without writing outputs or changing module identities.
These checks do not verify runtime behavior or establish publication approval.
The broader validator can fail on stale captured DDL evidence; relocation must
not rewrite historical hashes or reconcile SQL to make that gate pass.

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
are outside the offline relocation checks. No tests or runtime probes run for
this activity.

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
