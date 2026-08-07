# Meta Entity Phase 2 activity summary

Status: **P2.1-P2.8 implemented on 2026-08-02**. P2.8 remains
authorization-gated for an app-role live smoke.

Completed:

- P2.1 contract and domain lock
- P2.2 ten Phase 2 tables
- P2.3 graph integrity and optimistic-concurrency boundary
- P2.4 RLS, grants, full Athyper fresh build, and rollback-only graph smoke test
- P2.5 clean authoring contract alignment
- P2.6 isolated authoring service/API, audit/outbox integration, and clean-database service smoke
- P2.7 independent reference/authorization/example seeds and rerun certification
- P2.8 functional Admin Studio graph editors and optimistic save/validation wiring

Next: **P2.8 app-role smoke after canonical permission assignment, then P2.9
checkpoint/review/publication UX**.

## Phase objective

Deliver a complete, normalized and usable Athyper authoring slice for Entity
runtime profiles, intrinsic fields, keys, search, and relations. At the end of
this phase, Admin Studio must be able to create and edit this graph through the
new clean-room API, validate it, create immutable checkpoints, review semantic
changes, and exercise the existing approval/publication foundation.

This phase does not copy or modify the legacy Meta Entity implementation.

## Approved implementation inventory

Approve the normalized ten-table inventory:

1. `metadata.entity_class_profile`
2. `metadata.entity_runtime_profile`
3. `metadata.entity_field`
4. `metadata.entity_key`
5. `metadata.entity_key_field`
6. `metadata.entity_search_profile`
7. `metadata.entity_search_field`
8. `metadata.entity_relation`
9. `metadata.entity_relation_target`
10. `metadata.entity_relation_field`

The final two tables support polymorphic targets and composite field mappings
without JSON arrays and are now implemented in the target DDL.

The property definitions and legacy disposition are in
`META-ENTITY-PHASE-2-DDL-REVIEW.md`.

## Work packages

### P2.1 - Contract and domain lock

Deliverables:

- Add the controlled domains/enums needed by the ten tables.
- Freeze logical-key formats and the four strict field specifications:
  `type_config`, `default_spec`, `computation_spec`, and `validation_spec`.
- Define one canonical serialized contract schema and deterministic collection
  ordering.
- Record allowed conditional combinations for runtime profiles, fields, keys,
  search bindings, and relations.

Exit gate:

- Every editable property has exactly one owner.
- No generic `metadata`, `config`, `.passthrough()`, field-membership array, or
  relation-mapping JSON remains in the authoring contract.

### P2.2 - Phase 2 tables

Deliverables:

- Create the ten Athyper-only `metadata.*` tables.
- Add primary keys, nullable-tenant composite uniqueness, logical-key checks,
  standard audit pairs, comments, and deprecation coordinates.
- Add FKs to Entity/change-set parents and normalized binding parents.
- Add indexes for Studio lists, graph loading, dependencies, target resolution,
  and revision serialization.

Exit gate:

- A complete draft graph can be inserted using only normalized rows.
- Global and tenant graph rows cannot be mixed.
- Composite keys and polymorphic relation mappings require no JSON property.

### P2.3 - Graph integrity and optimistic concurrency

Deliverables:

- Add the shared editable-change-set guard.
- Add one compare-and-advance function for expected `lock_version`.
- Add deferred graph validators for invariants that span multiple rows.
- Validate one primary key, key field compatibility, search match compatibility,
  relation target/key resolution, composite mapping arity, and deprecation
  references.
- Add consistent updated-at and audit-pair triggers.
- Give every function an explicit trusted `search_path`; use invoker security.

Exit gate:

- Draft/rejected graphs are editable; review/approved/published graphs are
  sealed.
- One API save advances the change-set lock exactly once, regardless of how
  many child rows change.
- Invalid graphs fail with stable diagnostic codes and property paths.

### P2.4 - RLS, grants, and database verification

Deliverables:

- Enable and force RLS on every mutable table.
- Add tenant read/write policies and Admin global-management policies.
- Restrict immutable class-profile writes to the seed/Admin path.
- Add application/Admin grants with no unintended PUBLIC execution.
- Add catalog verification for columns, domains, constraints, indexes, RLS,
  policies, functions, triggers, and grants.
- Run an isolated Athyper fresh build and Phase 2 graph smoke tests.

Exit gate:

- Cross-tenant reads/writes fail.
- Tenant sessions cannot create or mutate global definitions.
- The full Athyper manifest installs cleanly from an empty PostgreSQL database.

### P2.5 - Canonical authoring contracts

Deliverables:

- Update `@athyper/meta-entity-authoring-contracts` to the approved DDL model.
- Remove duplicated `required` and `queryable` field properties.
- Remove Entity/field target coordinates from reference `typeConfig`.
- Add strict DTOs for runtime profiles, fields, keys, search profiles/bindings,
  relations, targets, mappings, diagnostics, commands, and responses.
- Add expected-lock-version and idempotency coordinates to mutation commands.

Exit gate:

- Transport contracts map one-to-one to canonical properties or explicitly
  labeled derived projections.
- No clean contract imports or aliases a legacy Meta Entity contract.

### P2.6 - Clean server service and API

Status: **Complete**.

Deliverables:

- Create `server/packages/services/meta-entity-authoring`.
- Implement repositories for catalog/change sets and the Phase 2 graph.
- Implement transaction-scoped create/update/delete commands using one
  optimistic lock advance.
- Implement graph validation and deterministic serialization.
- Implement checkpoint creation into `snapshot.entity_contract_revision`.
- Implement semantic diff/history reads.
- Implement submit, approve, reject, publish, rollback, and retire commands on
  top of the completed Phase 1 DDL.
- Write canonical audit evidence and publication outbox records in the same
  transaction as meaningful workflow actions.
- Add permission checks and stable problem responses.

Exit gate:

- CRUD, checkpoint, validation, history, and workflow APIs pass integration
  tests against the new schema without touching `control.entity_*`.
- Lock conflicts return a deterministic conflict response and never partially
  save a graph.

Evidence:

- `@athyper/svc-meta-entity-authoring` builds and typechecks independently.
- The full runtime server typechecks with the new route registration.
- A fresh PostgreSQL 16 manifest build passes the Phase 2 DDL smoke.
- The app-role service smoke completes create, graph save, checkpoint, submit,
  approve, publish, rollback, and retire with 16 audit and 16 outbox rows.
- The canonical release payload excludes authoring row UUIDs and derived usage
  counts; bindings serialize by logical field key.

### P2.7 - Independent Meta Entity seeds

Status: **Complete**.

Deliverables:

- Populate `server/db/seed/meta-entity` without using legacy seed discovery.
- Seed the six immutable Entity class profiles.
- Add a small set of representative canonical Entity graphs covering:
  relational storage, composite key, search weighting, normal relation, and
  polymorphic relation.
- Make the seed pack rerunnable and give it its own ledger identity/version.

Exit gate:

- A fresh seeded database provides enough real data to exercise every Phase 2
  editor and validator.
- No SQL is copied from `server/db/seed/platform/003_control`.

Evidence:

- Independent pack `athyper.meta-entity@p2.7-v1` has an explicit ten-file
  manifest, guarded database target, immutable content ledger, and no legacy
  Entity seed discovery.
- Six immutable class profiles and six exact `metadata.entity.*` permissions
  are installed, including separate rollback and retire capabilities.
- Seven package-owned `1.0.0` baselines cover Business Partner, supplier,
  customer, composite identifiers, reusable addresses, polymorphic address
  links, and canonical contact links.
- `contact_link.channel_type` explicitly permits email, phone, SMS, WhatsApp,
  and website; channel-specific companion Entities are not seeded.
- One separate `business_partner:p2_7_studio_draft` remains editable.
- PostgreSQL 16 accepted the pack twice with the same hash. Final inventory:
  153 fields across eight graphs, 16 keys, seven search profiles, eight
  relations, 12 relation targets, seven valid revisions, and seven releases.

### P2.8 - Functional Studio editors

Status: **Implementation complete; canonical authorization assignment pending**.

Deliverables:

- Connect `/setup/entity-studio` to the new service/API.
- Implement the Entity catalog and persistent change-set header.
- Implement the runtime-profile editor with explicit class-default copy/reset.
- Implement fields table and typed field inspector.
- Implement keys and ordered key-field bindings.
- Implement search profiles and weighted search-field bindings.
- Implement relations table, target/mapping editor, and synchronized diagram.
- Implement optimistic saves, dirty state, conflict recovery, accessible loading
  and error states, and property-path problem navigation.
- Continue strict semantic utility/theme usage; no raw color literals or legacy
  Studio imports.

Exit gate:

- Every Phase 2 canonical property is editable from exactly one Studio location.
- Dependency counts navigate to actual bindings instead of duplicate switches.
- Keyboard, focus, empty, loading, error, conflict, and read-only review states
  are covered.

Evidence:

- `/setup/entity-studio` loads the canonical class profiles, Entity catalog,
  preferred change set, and complete Phase 2 graph through the authenticated
  Admin relay.
- The runtime profile, typed fields, ordered keys, weighted search profiles,
  relations, polymorphic targets, and field mappings are editable without any
  legacy Studio imports.
- Dirty-state guards protect Entity/change-set switching and refresh. Saves use
  `expectedLockVersion`; HTTP 409 responses enter an explicit conflict state.
- Validation persists dirty changes first, then validates the stored graph and
  routes diagnostics back to the owning editor section.
- Global package-owned change sets and graphs now follow the same read scope as
  the global Entity catalog, allowing the P2.7 examples to load.
- Admin production build, runtime-server typecheck, package typechecks, runtime
  tests, clean-room boundary, and semantic theme verification pass.
- The UI continues to fail closed until the active Admin authorization runtime
  grants the six canonical `metadata.entity.*` permissions. No seed assigns a
  role implicitly.

### P2.9 - Checkpoint, diff, review, and publication experience

Deliverables:

- Connect validation and problems to server diagnostics.
- Add checkpoint history and semantic revision comparison.
- Add reason/ticket forms for workflow actions.
- Add submit, approve, reject, publish, rollback, and retire experiences with
  permission-aware affordances.
- Display audit evidence separately from revision payload history.
- Show target-plane and compatibility information without introducing runtime
  projection editing.

Exit gate:

- A user can create a change set, author the Phase 2 graph, validate,
  checkpoint, review, approve, and publish it entirely through the new Studio.
- The resulting release references the exact approved revision/hash.

## Required tests and evidence

| Layer | Minimum evidence |
|---|---|
| DDL | Fresh install, rerun safety where supported, schema catalog assertions |
| Tenancy | Global/tenant visibility and cross-tenant denial tests |
| Integrity | Conditional fields, bindings, composite keys, polymorphic relations, sealed change sets |
| Concurrency | Successful expected version, stale version rejection, multi-row single increment |
| Serialization | Stable JSON/hash across insertion order and repeated serialization |
| Revision/release | Hash chain, immutability, approved revision match, rollback coordinates |
| Audit | Same-transaction evidence for checkpoint and workflow actions |
| API | CRUD, validation, conflicts, permissions, idempotency, transaction rollback |
| Seeds | Independent manifest, rerun, canonical-only references |
| Studio | Typecheck, runtime tests, theme-policy check, production Admin build, interaction tests |

## Explicitly outside Phase 2

- Phase 3 surface, section, field-binding, and operation DDL/designer work.
- Live runtime UI preview and renderer/editor configuration.
- Neon/Mesh runtime descriptor deployment and execution rewiring.
- Legacy route, service, UI, or seed cleanup/removal.
- Live database migration or deployment.
- Prisma and Kysely regeneration.
- Physical business-table provisioning and destructive schema evolution.

These items begin only after the Phase 2 authoring workflow passes its exit
gate and the Entity DDL inventory is frozen again.

## Proposed execution order

```text
Approve inventory
  -> P2.1 contract/domain lock
  -> P2.2 tables
  -> P2.3 integrity/concurrency
  -> P2.4 RLS/fresh-build gate
  -> P2.5 clean contracts
  -> P2.6 server/API
  -> P2.7 independent seeds
  -> P2.8 Studio editors
  -> P2.9 review/publication experience
  -> Phase 2 freeze
```

DDL work is intentionally completed and verified before the service, seeds, or
Studio begins relying on the new properties.

## Review decision

Approval of this activity summary authorizes Phase 2 implementation in the
order above, beginning with P2.1 and P2.2. It does not authorize live database
deployment, legacy removal, runtime projection rewiring, or Phase 3 surface
work.
