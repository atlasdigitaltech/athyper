# Entity source descriptor v2

`athyper.entity-source/2` is an offline authoring descriptor, validated by
`tooling/scripts/metadata/source-workspace.mjs` and documented structurally by
`metadata/schemas/entity-source-v2.schema.json`. It is not a published runtime
descriptor, permission catalog, storage definition or approval receipt. Existing
`/1` descriptors remain readable and reject the new properties.

Every v2 descriptor explicitly declares:

- `authoringOwnership: platform`: product-default source releases require
  Platform Admin authorship and independent Platform Owner review. This does
  not change record ownership or tenant scope.
- `entityClass` and `ownershipModel`: the native graph values when present.
  Non-null classes are restricted to `business`, `configuration`, `reference`,
  `process`, `projection` and `technical`; ownership values are `system`,
  `package`, `tenant` and `overlay`, matching the database domains.
  The shared-reference product contract defines `reference` and `system`.
  Split drafts without graph evidence explicitly use null; successor graph
  classification remains unresolved and cannot be used as an authorization allow.
- `targets.declared`: planes supported by the canonical native product's
  `planes`, or by the split core artifacts when there is no native product.
- `targets.required`: mandatory publication coverage decided for this source.
- `targets.recommended`: proposed expansion requiring target-specific contracts
  before implementation. Required and recommended targets cannot overlap.

All plane arrays reject unsupported values and duplicates. Required targets may
exceed declared targets: this records an implementation gap, not implicit compiler
support. A split core's `plane` denotes that compiled artifact's target and must
remain in declared targets. Adding required targets never rewrites storage,
permissions, hashes or release envelopes.

`definition`, where present, selects the single native product input. `artifacts`
are complementary split-format dependency inputs; they are not a second native
product. The seven mixed-format entities retain these inputs until a binding-aware
compiler conversion preserves their fields, operations and transitive references.
This contract does not claim that conversion is complete. For split-only sources,
the artifact set remains the authoring input.

Native graph identity and classification must agree with the descriptor. A core
artifact must belong to its descriptor entity. Placement identity and planes must
agree as well. When a native product has a placement on its authoring plane
(Studio if declared, otherwise its first declared plane), `moduleCode` must match
that placement's module. A source module identity is distinct from navigation on
another plane: Country belongs to Studio `rel` while its Neon placement is `org`.

Absent placement remains an unresolved or non-directory exposure decision.
Descriptors do not infer standalone menus, parent relationships, section order,
permissions, display fields or publication from directory names. Child/self
surfaces require published relationship and server scope contracts. Certification
retains its observed Neon target; Mesh DDL alone does not declare publication.

Offline discovery derives `coverage` with per-entity required/recommended deltas
and unresolved classifications. `metadata:check-layout` prints gaps without
rejecting valid drafts. `metadata:check-layout --release-ready` rejects unmet
required declarations. The Python release-readiness validator applies the same
derived deltas to entities in the selected release's artifact scope. Recommended
coverage remains informational; neither check attests active publication.
