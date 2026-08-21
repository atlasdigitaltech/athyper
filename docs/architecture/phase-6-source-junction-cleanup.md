# Phase 6 — Source junction cleanup

Phase 6 verified that no source junctions or symlinks remain under `apps`, `packages`, `server`,
or `tooling`. Dependency links created by pnpm under `node_modules` remain expected and are not
treated as source links.

Completed:

- Removed obsolete workspace exclusions for deleted flat source paths.
- Kept exclusions for duplicate source manifests that still exist and have not yet passed
  content comparison and backup review.
- Added `pnpm policy:no-source-junctions`.
- Included the junction check in the root `pnpm policy` gate.
- Retained canonical grouped package paths and package-name imports.

The hygiene command fails when a source junction or symlink is introduced outside `node_modules`:

```text
pnpm policy:no-source-junctions
```

Old source paths are removed only after all imports, aliases, tests, fixtures, Dockerfiles, and
build scripts use the canonical package authority.
