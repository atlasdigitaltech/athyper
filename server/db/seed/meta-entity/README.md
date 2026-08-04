# Canonical Meta Entity seed pack

This independently executed pack seeds only the new Athyper `metadata.*` and
Meta Entity revision/release model.

Rules:

- Files are explicit in `_manifest.txt`; directory scanning is forbidden.
- The pack has its own execution ledger identity: `athyper.meta-entity`.
- It does not import, copy, or query legacy `control.entity_*` seed files.
- Reference data and demo fixtures use separate numbered subfolders.
- Runtime packages never execute or import seed SQL.

P2.7 installs:

- six immutable `metadata.entity_class_profile` defaults;
- six exact `metadata.entity.*` capabilities in the target `authz` catalog;
- published `1.0.0` baselines for seven related package-owned example Entities;
- one separate editable `business_partner` Studio draft;
- rerun and coverage assertions for composite keys, weighted search, normal,
  aggregate-child, and polymorphic relations.

Prerequisites are deliberately not duplicated by this pack. The Athyper
foundation must already provide the well-known system principal and the `META`
module. Apply the pack through `db:seed:meta-entity`; it verifies the explicit
manifest and records an immutable content receipt before committing.
