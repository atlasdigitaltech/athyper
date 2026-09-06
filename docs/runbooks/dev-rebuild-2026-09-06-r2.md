# DEV rebuild and deployment — 2026-09-06, second run

Rebuilt the current IAM theme, identity replay approval, localization and jobs
changes with Node 24.19.0 and pnpm 10.33.0. Frozen dependency installation and all
104 forced workspace build tasks passed, with zero cache hits. All five Docker
Bake images were built locally as `rebuild-20260906-r2`; their digest references
are recorded in `deploy/image-sets/dev.yaml`. Images retain working-tree provenance
and were not published to a registry.

Deployed Neon, Mesh, Studio, API, worker, scheduler and IAM through a scoped DEV
Compose update, preserving current runtime settings and publication secret mounts.
All seven containers are healthy, use the rebuilt images and have zero restarts.
API liveness, readiness and OpenAPI endpoints returned 200; all readiness checks
were healthy and OpenAPI exposed 127 paths. All three web planes returned HTTPS
200 through ingress with certificate verification enabled.

The Studio identity replay approval migration was absent. A private Studio dump
was taken, the migration was rehearsed with transaction rollback, and the schema
plus checksum ledger entry were committed atomically. Replay enablement retains
the existing environment setting; this deployment does not enable it implicitly.
Other database contents, optional services, QA and shared infrastructure were
preserved. Operator deployment/rollback files and the pre-migration dump are under
`~/.athyper/instances/dev/deployments/rebuild-20260906-r2/`.

Validation:

- Affected suites passed: experience 45, IAM 109, platform jobs 46, notifications
  96, jobs service 52 and jobs runtime 30 tests.
- Platform host: 127 passed, one opt-in test skipped. Configuration expectations
  now cover the default and explicitly enabled identity replay flag.
- Stack v2: 77 passed after updating the expected Studio migration manifest.
- URL catalogue: 12 tests passed; regenerated catalogue verification passed.
- IAM generated token CSS verification passed.
- OpenAPI policy still fails for 126 undocumented routes; no baseline expansion
  was made. This deployment is not a claim that the full repository CI passes.

Build, validation and deployment logs are in
`/tmp/athyper-rebuild-20260906-r2/`.
