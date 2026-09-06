# DEV rebuild and deployment — 2026-09-06

Rebuilt the current working tree and deployed the five local qualification images
listed in `deploy/image-sets/dev.yaml`. The images use tag `rebuild-20260906` and
retain working-tree provenance; they were not published to a registry.

## Build and runtime verification

- `pnpm install --frozen-lockfile` passed with Node 24.19.0 and pnpm 10.33.0.
- `pnpm build --force` passed: 104 tasks, zero cache hits. The platform host was
  rebuilt again after restoring the request-age metric used by existing dashboards.
- Docker Bake completed Neon, Mesh, Studio, runtime-server, and IAM builds.
- The seven DEV application containers are healthy: three web planes, API,
  worker, scheduler, and IAM. Runtime containers use the rebuilt runtime image.
- API `/livez`, `/readyz`, and `/openapi.json` returned HTTP 200. Readiness checks
  were healthy; the OpenAPI response contained 123 paths.
- Neon, Mesh, and Studio returned HTTPS 200 through the local ingress with TLS
  certificate verification enabled.

The deployment used a scoped Compose update with existing runtime environment
values and publication worker secret mounts. Database volumes, optional DEV
services, QA, and shared infrastructure were retained. The previous web
containers lacked Compose ownership labels and were stopped and retained under
`athyper-dev-<plane>-web-rollback-20260906` names before their replacements started.
Private deployment and rollback configuration is retained under the operator's
`~/.athyper/instances/dev/deployments/rebuild-20260906/` directory. Logs are under
`/tmp/athyper-rebuild-20260906/`.

## Validation results and remaining failures

- Stack v2: 77 passed on the final run. An earlier read-only test observed
  concurrent source edits; the final run passed after edits stopped.
- Platform host: 126 passed, one opt-in test skipped.
- Affected runtime/service package suites passed; database integration tests
  requiring explicit fixtures remained skipped.
- Plane contracts: 231 passed; policy tests: 105 passed; performance guards:
  15 passed; tooling tests: 36 passed.
- OpenAPI policy unit tests: six passed; URL catalogue tests: 12 passed;
  generated URL catalogue verification passed.
- Foundation tests: 77 passed, two failures in public identity story copy and
  semantic-color assertions.
- Database script tests: 137 passed, four failures covering demo authorization,
  two Business Partner 360 source assertions, and remembered-device source
  assertions.
- Operations tests: 78 passed, three failures covering R2/R3 evidence command
  counts and V1 telemetry source-location checks.
- `pnpm openapi:check` failed for 126 undocumented routes. The route-contract
  baseline was not expanded to hide these failures.

The successful build and live smoke checks do not imply a fully passing CI suite
or production qualification. Business Partner metrics collection retains the
existing empty target allowlist unless configured by the operator.
