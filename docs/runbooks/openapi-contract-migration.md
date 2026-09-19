# OpenAPI contract coverage and migration

New APIs must use `defineRouteContract` and `registerContractRoute` with unique operation IDs, permission metadata, request schemas and success/error response schemas. Compatibility aliases are separate method/path operations and need contracts too. Business Partner 360 is the first migration slice in this change; its response schemas are generated from the shared response interfaces.

## Existing exceptions

Tracking record: this section is the repository-local migration issue. The owner of each exception is the maintainers of the workspace package named in `openapi-undocumented-baseline.json`. No personal assignee or external issue has been invented.

Exceptions are frozen to explicitly enumerated operations from commit `7cd0dd9a`, the existing approved debt checkpoint. The expiry is 2026-10-06 (UTC). They are temporary migration debt, not documented APIs. The new scanner expands aliases and loops, so these operation counts must not be compared with the old regex declaration counts. Source files are never exempt as a whole.

The gate rejects new operations, expired exceptions, missing ownership/tracking records, stale entries, additions against the merge base, and expiry extensions. Remove entries after migrating their operations. Do not increase the baseline to silence failures. Previously unapproved Business Partner/workforce routes remain blocking migration work.

Migrate one capability at a time: inspect actual request parsing, response interfaces, error and authorization behavior; register accurate contracts; test valid/invalid requests, denied access, error responses and response validation; remove the corresponding exceptions; regenerate the URL catalogue. Generic section data remains open only where the shared public interface explicitly uses an unknown/generic payload.

## Required checks

- `pnpm openapi:check --base <merge-base>`: static route and exception checks, including aliases and finite helper-generated routes.
- `pnpm openapi:bp360:check`: prevent response schemas drifting from shared response interfaces.
- `pnpm test:openapi-policy`: failure-path tests for the policy and deployed specification comparison.
- `pnpm --filter @athyper/server-runtime-http test`: actual Express registration audit and request/response validation.
- `pnpm urls:check`: complete application/source URL inventory against the captured development Swagger document.

Contract coverage must pass for every supported host capability configuration before enabling `enforceContracts: true` in the production host. The runtime audit rejects unresolved router mounts and non-string paths rather than claiming complete coverage. Register full paths on the host contract registry. Do not turn strict startup on while existing raw routes remain; doing so would prevent the current host from starting.

## Deployment verification

Export `/openapi.json` from the exact candidate runtime with the target capability configuration and retain it as a release artifact. After rollout, run `pnpm openapi:verify-deployed --expected /release/openapi.json --url https://api.example/openapi.json`. This compares the full document (schemas, permissions and operations), ignoring object key order only. Supply the private CA via `NODE_EXTRA_CA_CERTS`; TLS verification remains enabled. Verification never updates the expected artifact from the running deployment.

A deployment with different enabled capabilities requires its own expected specification. The development URL snapshot is not a substitute for a release artifact. Refresh it with `pnpm urls:sync` only after deployment verification passes.

CI runs the checks on pushes and pull requests, including `stack-v2-foundation`. Repository administrators must require the OpenAPI policy job in branch protection; the workflow alone cannot set GitHub branch protection. Image publication and release builds also require the policy gate.
