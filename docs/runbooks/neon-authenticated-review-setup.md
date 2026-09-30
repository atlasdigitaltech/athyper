# Running the authenticated Neon URL review

The previous review's authentication limitation means the signed-in integration was unverified, not that login was proven broken. The available session files were empty and no test credentials were configured.

## Changes prepared

- Removed the unused local `contract()` helper in `control-service-routes.ts`. The strict scanner can now resolve the actual registered factories; no scanner exceptions were added.
- Regenerated the development URL catalogue. The catalogue check and all 20 catalogue/manifest tests pass.
- Added a dedicated authenticated smoke suite and config. Missing credentials fail in preflight instead of producing an all-skipped result.
- Updated the shared browser login setup and BP-V1 actor fixture to use `/api/auth/login?returnTo=%2Fhome`, support identity-first login, select the authorized context before requiring a tenant session, and verify the final session through `/api/auth/session`.

## Authenticated smoke test

1. Rebuild/restart the development Neon application using the normal development deployment procedure so it contains the prior URL/relay fixes. The previously running deployment returned 404 for the workforce relay; running tests against that version will correctly fail. These review turns did not deploy the source changes.
2. Use a dedicated test account authorized for the BP module, BP request creation, the People/workforce module, and workforce request reads in the intended tenant. Account setup, any required actions, and issuer MFA requirements must be satisfied. The automated password flow does not bypass or automate MFA.
3. Supply credentials through your shell or secret manager. For Bash, the following avoids placing the password in shell history:

```bash
export PLAYWRIGHT_NEON_BASE_URL=https://neon.dev.athyper.test
read -r -p 'Neon test username: ' PLAYWRIGHT_NEON_USER
read -r -s -p 'Neon test password: ' PLAYWRIGHT_NEON_PASSWORD
printf '\n'
export PLAYWRIGHT_NEON_USER PLAYWRIGHT_NEON_PASSWORD
# Set this to the exact displayed tenant name if the account has multiple contexts.
# export PLAYWRIGHT_NEON_TENANT_NAME='Test tenant'

bash tooling/scripts/verification/run-playwright-with-linux-deps.sh test \
  --config=tooling/config/playwright.neon-review.config.ts
```

Install Chromium first with `pnpm exec playwright install chromium` if it is not already available. Do not commit credentials, session cookies, or browser storage state. This dedicated config disables traces, screenshots, and videos during the credential flow.

The smoke suite checks real issuer login, context selection, the resulting authenticated tenant session, three BP alias redirects, workforce list/create pages, and a successful authenticated GET through the workforce relay. It does not create business records or approve/materialize requests. It requires a passing test, not skipped tests, to close this part of the evidence gap.

## Full business workflow evidence

Signed-in page checks alone do not qualify business workflows. In a resettable development tenant, configure the separate requester, approver, and materializer actors and operating-organization fixture described in `tests/e2e/README.md`. All three principals must have their respective permissions and access to the same intended tenant.

```bash
pnpm preflight:e2e:bp-v1
pnpm test:e2e:bp-v1-009
```

Those commands require the `PLAYWRIGHT_BP_V1_*` variables listed in the E2E README. The journey creates a request and exercises validation, submission, independent approval, and materialization. It writes retained business evidence and therefore belongs in a designated test tenant. Further R2/R3 suites require their own seeded role-state and invitation fixtures. The general production matrix contains older surface expectations and should not be treated as complete Neon lifecycle coverage merely because it discovers or skips tests.

Workforce approval/materialization additionally needs protected identity evidence, a selected company and valid employment scope, authorized workflow decision actors, and a known test request. The new smoke test establishes signed-in routing and read access only; it does not certify that lifecycle.

## Catalogue verification

```bash
pnpm urls:generate
pnpm urls:check
pnpm test:url-catalogue
```

The current source check covers all three applications and the stored snapshot of 127 Swagger operations. Use `pnpm urls:sync` when you intentionally want to refresh that snapshot from the deployed Runtime; regenerating the catalogue alone does not claim deployed/source parity.

## Verification performed during remediation

The catalogue check and 20 catalogue/manifest tests passed. TypeScript checks passed for the modified browser auth/test files and the control-admin production sources. The dedicated suite discovers one test, and an attempted run stopped at the expected missing-credentials preflight. No real authenticated workflow was executed, and no source changes were deployed during this remediation.

## Subsequent manual evidence

The user confirmed successful login and supplied a screenshot of the protected `/home` page in the CirrusAtlantic UK context. Login-to-home is therefore manually verified by the user. The dedicated authenticated route/relay test and full business lifecycle tests remain unexecuted in this review environment.
