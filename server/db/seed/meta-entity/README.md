# Canonical Meta Entity seed pack

This independently executed Athyper pack separates production reference data
from the Meta Entity validation corpus.

Rules:

- Files are explicit in `payload-manifest.txt`; directory scanning is forbidden.
- `pack.v1.json` defines ordered `core` and `validation` profiles.
- The pack has its own execution ledger identity: `athyper.meta-entity`.
- It does not import, copy, or query legacy `control.entity_*` seed files.
- Production application defaults to `core`; examples require `validation`.
- Runtime packages never execute or import seed SQL.

The `core` profile installs:

- six immutable `metadata.entity_class_profile` defaults;
- six exact `metadata.entity.*` capabilities in the target `authz` catalog.

The opt-in `validation` profile additionally installs:

- published `1.0.0` baselines for seven related package-owned example Entities;
- one separate editable `business_partner` Studio draft;
- rerun and coverage assertions for composite keys, weighted search, normal,
  aggregate-child, and polymorphic relations.

Prerequisites are deliberately not duplicated by this pack. The Athyper
foundation must already provide the well-known system principal and the `META`
module. Each profile records an independently immutable version and receipt:
`1.0.0-core` or `1.0.0-validation`.

```powershell
# Production reference data (default profile)
pnpm.cmd --dir server/db run db:seed:meta-entity:check
pnpm.cmd --dir server/db run db:seed:meta-entity -- --expected-database=athyper_studio

# Disposable validation corpus
pnpm.cmd --dir server/db run db:seed:meta-entity:validation:check
pnpm.cmd --dir server/db run db:seed:meta-entity:validation -- --expected-database=athyper_studio
```
