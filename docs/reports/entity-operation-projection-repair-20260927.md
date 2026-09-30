# Entity operation projection repair — 2026-09-27

## Status: implementation repaired; successor publication not completed

The compiler and publication admission/staging paths now preserve and validate
reviewed operation bindings. Country remains unavailable: the adjacent live
inventory records release 1 active on all three DEV planes with zero published
operation bindings. All three head IDs and artifact hashes match the earlier
activation receipt. No existing artifact, signature, approval, or release was
modified, and no bindings were installed directly into live tables.

## Cause and implemented correction

The native projector checked operation permissions and scopes but did not emit
the IAM operation projection. Split-artifact staging silently skipped an absent
projection. Additionally, staging passed only source/binding fragments to SQL,
which would fail the common-reference read-only descriptor guard once bindings
were present. Source entity IDs are not part of the graph's entity declaration;
they must come from the persisted authoring release, not a generated UUID.

- `services/publication/src/shared/authorization/operation-projection.ts`:
  dependency-free validation and projection of explicit metadata operations,
  permission links, and scope bindings. Resolves each permission ID/kind against
  the target catalog. Preserves source IDs, decision modes and coordinates;
  denies missing, ambiguous, orphaned and non-denying scope bindings. No entity
  names or product imports are used. AST dependency checks cover this module.
- `services/publication/src/compilation/native-runtime.ts`: includes that
  projection in the signed runtime contract.
- `services/publication/src/compilation/compiled-runtime.ts`: rejects incomplete
  bound-operation artifacts at compile/sign/dispatch; binds descriptor source
  identity/hash to manifest evidence. New compiler version is `1.1.0`.
- `services/publication/src/kysely-publication-authority-work.ts` and host
  `composition/shared/publication/compiled-runtime.ts`: carry persisted source
  entity ID and authoring release hash, and target-local permission ID/kind.
  Host qualification still reproduces the full expected projection from the
  persisted, approved source at every phase.
- `services/publication/src/kysely-local-projection-repository.ts`: validates
  bindings and passes the full signed descriptor to the existing SQL staging
  command. Rechecks stored descriptors before resumed activation as well.
- `db/ddl/planes/studio/publication/16_compiled_entity_source_identity.sql`:
  versioned source reader preserves the original approval/tenant gate and joins
  the authoritative entity ID/release hash. The v1 function is unchanged.

All package paths above are relative to `server/packages/`, except the host
path under `server/apps/platform-host/src/` and DDL under `server/`.

## Live changes and tests

Only the new source-reader function was installed persistently in DEV Studio.
It grants function execution to the existing publication-service role, not
global table writes. Source-mounted API/worker picked up the code changes and
remain running. QA, staging and production were not changed.

- Publication source/test typechecking: clean.
- Publication tests: **331 passed**.
- Host tests: **676 passed, 25 skipped**.
- Host source typecheck: only the existing gated `entity-case-preflight.ts`
  missing `KyselyBusinessPartnerCaseRepository` export.
- Focused host lowering/runtime/capability tests: **25 passed**.
- Real DEV PostgreSQL regression: **2 tests passed**. One test exercises all
  three target databases: lower the persisted source, resolve target-local
  permissions, stage via the restricted projection command, verify operation
  count, and roll back. It also rejects the incomplete descriptor and verifies
  cross-authority source denial. No activation or persistent grant is performed.

Reproduce the database rehearsal:

```sh
OPERATION_PROJECTION_POSTGRES_TEST=1 \
OPERATION_PROJECTION_RELEASE_ID=1efcf86a-75e3-4a79-9154-ea62f5abdc7d \
OPERATION_PROJECTION_AUTHORITY_TENANT=11111111-1111-4111-8111-111111111111 \
pnpm --filter @athyper/server-db exec tsx --test scripts/operations/publication/operation-projection.test.ts
```

These are projection/SQL checks, not authenticated browser list/detail or
collaboration acceptance. The receipt JSON is local diagnostic evidence, not
immutable audit storage.

## Remaining release boundary

The enrolled workflow is explicitly first-publication-only at three layers:

1. `composition/shared/publication/workload.ts` rejects any existing authoring
   release with `REFERENCE_PUBLICATION_FIRST_RELEASE_REQUIRED`.
2. `meta-entity-authoring/src/kysely-authoring-repository.ts` permits the global
   release path only with `expectedSourceReleaseId === null`.
3. `publication.fn_create_system_entity_release` rejects an existing release
   with `SYSTEM_PUBLICATION_FIRST_RELEASE_REQUIRED`.

The separate development-publication workflow does not bypass that repository
restriction. Re-running first publication, overwriting compilation rows, or
directly staging this repaired projection into the active release is not a
valid successor deployment.

A successor implementation must pin the predecessor ID/hash and target heads,
prepare a fresh source change set, obtain independently activated enrollment for
those exact pins, check the predecessor again under the release lock, then use
the ordinary signing/dispatch/activation path. The existing first-release
enrollment must not silently gain successor authority. That extension and its
independent enrollment have **not** been implemented or performed here.

After the successor is genuinely activated, verify installed bindings and
authenticated list/detail on Studio, Neon and Mesh separately. Country is not
ready for manual acceptance until those checks succeed.
