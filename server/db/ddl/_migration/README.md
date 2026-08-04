# Manual database changes

This directory is reserved for reviewed SQL that changes an existing database.
It does not use CSV-driven migration generation, and its files are never loaded
by the empty-database manifests.

Keep manual SQL separated by target database:

- `athyper/` for `athyper_platform`
- `neon/` for `athyper_neon`
- `mesh/` for `athyper_mesh`

Each change is reviewed and executed explicitly. Once executed, its SQL is
immutable; the corresponding desired-state DDL must be updated separately.
