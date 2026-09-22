# MetaEntity source workspace

This is the repository home for product-owned MetaEntity **authoring inputs**.
A file move does not validate, approve, sign, publish or activate a definition.
The relocated MDG package retains its existing draft/review status and known
in-progress Phase 2 work. Studio remains the authority for governed release state.

## Layout and ownership

| Directory | Responsibility |
| --- | --- |
| `products/mdg/entities/` | BP, request, role and related definition artifacts; one evolving source, not copies per development phase |
| `products/mdg/review/` | Registry/storage evidence and review fixtures, not independently deployable entities |
| `schemas/entity-artifacts-v2/` | Existing draft artifact JSON schemas; versioned separately from native graph contracts |
| `shared/` | Future explicitly owned cross-product definitions; no duplicate BP copies |
| `overlays/` | Future approved scoped variations, not DEV/QA/PROD copies |
| `relocation-map.json` | Original-to-current file mapping and pre-move byte hashes, including uncommitted work |

`products/mdg/manifest.json` identifies the physical roots. Artifact references
such as `business_partner/core.json` are **logical paths relative to entities/**;
they deliberately do not include repository directory names. The artifact bytes,
hashes, release membership and references were preserved during relocation.
Review evidence is resolved separately from `products/mdg/review/`.

The bundled `platform/`, `workforce/` and shared-reference dependencies retain
their existing logical identities inside the MDG package for now. Their presence
does not transfer service ownership to MDG. Extracting them into independently
versioned shared products needs explicit dependency manifests and resolver support;
do not duplicate or move them opportunistically during feature development.

## Development rules

- BP foundation, BP2, intake and collaboration teams edit the same owning entity.
  Keep existing artifact filenames in this pass; avoid a second simultaneous rename.
- Coordinate overlapping files and release-envelope/hash updates. Do not regenerate
  another workstream's draft or publish its additions merely because they exist here.
- Runtime/UI code stays under `packages/`; services and executable graph builders
  stay under `server/`; physical definitions stay under `server/db/ddl/`.
- Native MetaEntity graphs and the draft split-artifact format are distinct. These
  files are not silently converted into native intake surfaces by the relocation.
- Tenant overrides must be explicit; application routing and target planes do not
  create alternate canonical copies. No credentials or runtime record data here.

## Checks (from repository root)

```sh
pnpm metadata:check-layout
python3 tooling/scripts/metadata/validate.py
python3 -m unittest discover -s tooling/scripts/metadata -p test_validate.py
```

The collaboration candidate has a separate, explicit closure. It compiles only
its declared roots and their transitive dependencies; it does not rewrite the
broad review envelope or publish anything:

```sh
pnpm exec tsx tooling/scripts/metadata/compile-release-candidate.mts \
  --candidate metadata/products/mdg/review/release-candidates/business-partner-collaboration-ca08.json
python3 tooling/scripts/metadata/validate.py \
  --release-candidate metadata/products/mdg/review/release-candidates/business-partner-collaboration-ca08.json
```

Add `--release-ready` only at freeze time. It checks the candidate's exact
artifact, permission and provider closure, then rejects unsigned, unapproved,
or unpublished candidate dependencies. It does not treat deferred artifacts in
the broad review envelope as candidate blockers.

The layout check verifies source placement and logical reference resolution; it
does not substitute for schema/contract validation or publication. The optional
`--baseline` checks original JSON bytes against the move inventory and is only
for qualifying this relocation, not for blocking subsequent feature edits.
Live schema/permission gates still require their existing configured DB access.

## Retained locations — not missed files

- `server/db/scripts/provisioning/`: native graph assemblers and data-surface
  helpers, including `business-partner-intake-graph.ts` and its dependencies.
- `server/packages/planes/studio/meta-entity-authoring/`: native graph compiler,
  authoring service and the executable BP intake presentation overlay.
- `docs/architecture/application-experience/entity-policy-examples/`: older
  `Current_Entity`, prototype and captured descriptor/source-bundle evidence.
  These are historical fixtures, not alternate editable product sources.
- Studio DB/artifact storage: governed snapshots, approvals, signatures and active
  releases. None were modified by this reorganization.

The old `New_Entity` directory contains only a relocation notice and a compatibility
schema-gate entry point: its command is embedded in an unchanged hashed review
release. All active tooling and CI use the new paths. Remove that bridge only with
an intentional release-envelope update, not by rewriting historical hashes.
