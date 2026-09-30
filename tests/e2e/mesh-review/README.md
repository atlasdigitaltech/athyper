# Authenticated Mesh route verification

This suite verifies a real Mesh tenant session, context/bootstrap agreement, ten protected pages, and network workspace reads for the principal's authorized acting accounts. It performs no business mutations. Publication, bank approval, registration lifecycle, import execution and interactive MFA need separate workflow fixtures and are not certified by this smoke suite.

Deploy the reviewed Mesh frontend and Runtime changes to the target development environment before verifying them. Building the local checkout does not update the running service.

Use an authorized development test account with Mesh membership and at least one network account. Configure `PLAYWRIGHT_MESH_USER` and `PLAYWRIGHT_MESH_PASSWORD` in the execution environment. If the identity has multiple tenant contexts, also set `PLAYWRIGHT_MESH_TENANT_NAME` to the exact authorized tenant name. Login uses the actual browser OIDC flow; identities requiring interactive MFA can instead supply a session captured after completing it.

Run:

```bash
pnpm exec playwright test --config=tooling/config/playwright.mesh-review.config.ts
```

The default origin is `https://mesh.dev.athyper.test`; override it with `PLAYWRIGHT_MESH_BASE_URL` when needed. The development configuration tolerates the local self-signed certificate.

Alternatively, point to an authenticated Playwright storage-state file:

```bash
PLAYWRIGHT_MESH_STORAGE_STATE=/absolute/path/to/mesh-state.json \
  pnpm exec playwright test --config=tooling/config/playwright.mesh-review.config.ts
```

Setup verifies that supplied state against the live `/api/auth/session` endpoint without overwriting the file. Missing credentials or an expired/anonymous/wrong-plane session fail setup rather than silently skipping the checks. Credential-based setup saves state under the ignored `tests/e2e/.auth/mesh-review.json` path. Login is not traced.

To inspect discovery without running authenticated checks:

```bash
pnpm exec playwright test --config=tooling/config/playwright.mesh-review.config.ts --list
```

Discovery lists 12 tests; it is not evidence of successful execution. Test artifacts are written under `tests/e2e/.playwright-mesh-review-output`.
