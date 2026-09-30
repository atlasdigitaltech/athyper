# Browser tests

`tests/e2e/` contains browser-executed tests. Session and visual checks retain
their existing projects. The production experience matrix adds desktop and
mobile projects for Studio, Neon and Mesh:

| Project                            | Directory           | Command                    | Purpose                                                                                                          |
| ---------------------------------- | ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `session`                          | `session/`          | `pnpm test:e2e:session`    | Authenticated session lifecycle behavior.                                                                        |
| `visual`                           | `visual/`           | `pnpm test:visual`         | PI screenshot regression only.                                                                                   |
| `bp-v1-009`                        | `business-partner/` | `pnpm test:e2e:bp-v1-009`  | Mandatory requester/approver/materializer BP-SUP-001 journey with retained accessibility and operation evidence. |
| `bp-r2`                            | `business-partner/` | `pnpm test:e2e:bp-r2`      | Four mandatory existing/dual-role journeys proving identity reuse and independent authority preservation.        |
| `bp-r3`                            | `business-partner/` | `pnpm test:e2e:bp-r3`      | Mandatory protected invitation and verified MESH proposal journeys with independent approval.                    |
| `production-studio-desktop/mobile` | `production/`       | `pnpm test:e2e:production` | Studio experience, accessibility and performance contract.                                                       |
| `production-neon-desktop/mobile`   | `production/`       | `pnpm test:e2e:production` | Neon experience, accessibility and performance contract.                                                         |
| `production-mesh-desktop/mobile`   | `production/`       | `pnpm test:e2e:production` | Mesh experience, accessibility and performance contract.                                                         |

Run all browser projects with `pnpm test:e2e`. The visual command remains the
CI-compatible command, but explicitly selects only the `visual` project.

## Shared authentication

`global-setup.ts` accepts shared `PLAYWRIGHT_USER` and `PLAYWRIGHT_PASSWORD`
credentials or plane-specific `PLAYWRIGHT_STUDIO_*`, `PLAYWRIGHT_NEON_*` and
`PLAYWRIGHT_MESH_*` values. It writes one local-only storage state per plane.
Without credentials it writes empty states and exits without launching a
browser, so test discovery remains deterministic.

## BP-V1-009 governed-actor fixture

The BP-SUP-001 journey owns three fresh browser contexts and signs in a requester,
an approver and a separate materializer through the real login surface. It does not inherit the
shared NEON storage state, mock APIs, or skip when fixture configuration is
missing. Configure a clean or resettable test environment with:

```sh
PLAYWRIGHT_NEON_BASE_URL=https://neon.example.test \\
PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID=<procurement-organization-uuid> \\
PLAYWRIGHT_BP_V1_REQUESTER_USER=<requester> \\
PLAYWRIGHT_BP_V1_REQUESTER_PASSWORD=<requester-secret> \\
PLAYWRIGHT_BP_V1_APPROVER_USER=<approver> \\
PLAYWRIGHT_BP_V1_APPROVER_PASSWORD=<approver-secret> \\
PLAYWRIGHT_BP_V1_MATERIALIZER_USER=<materializer> \\
PLAYWRIGHT_BP_V1_MATERIALIZER_PASSWORD=<materializer-secret> \\
pnpm test:e2e:bp-v1-009
```

`PLAYWRIGHT_BP_V1_REGISTRATION_COUNTRY_CODE` defaults to `MY`. The requester
must have create/update/validate/submit/read authority in the configured
organization. The approver must have read/decide authority and own the generated
task. The materializer must have read/materialize authority. All three users must
resolve to distinct principals in the same tenant. The test proceeds through
materialization, Supplier role/readiness and bounded result proof. It retains a
sanitized operation ledger and checks keyboard dialog operation, focus restore,
WCAG 2.2 AA, 200% reflow, and phone/desktop layouts without optional skips.

## R2 existing/dual-role fixture

R2 reuses the BP-V1 requester, approver, materializer and organization settings.
It additionally requires four distinct, resettable target identities so every
scenario begins from an exact role state:

For a freshly rebuilt local `athyper_neon` database, inspect and apply the
deterministic fixture pack first:

```sh
pnpm --dir server/db db:provision:neon:business-partner-r2-fixtures --plan
pnpm --dir server/db db:provision:neon:business-partner-r2-fixtures \
  --confirm=LOCAL-NEON-BP-R2-FIXTURES
```

The apply command reads `ATHYPER_NEON_DATABASE_ADMIN_URL`, is restricted to a
local database named `athyper_neon`, and prints the operating-organization and
four target environment coordinates. Reset by rebuilding the disposable local
database and applying the pack again; do not delete retained case evidence.

```sh
PLAYWRIGHT_BP_R2_SUPPLIER_EXTENSION_TARGET_ID=<bp-with-no-role-uuid> \
PLAYWRIGHT_BP_R2_CUSTOMER_TO_DUAL_TARGET_ID=<customer-only-bp-uuid> \
PLAYWRIGHT_BP_R2_CUSTOMER_EXTENSION_TARGET_ID=<second-bp-with-no-role-uuid> \
PLAYWRIGHT_BP_R2_SUPPLIER_TO_DUAL_TARGET_ID=<supplier-only-bp-uuid> \
pnpm test:e2e:bp-r2
```

Run `pnpm preflight:e2e:bp-r2` first to report all missing or invalid variable
names in one pass. It never prints configured values or secrets.

The suite fails rather than skips when a target is missing, duplicated, outside
the selected operating organization, or has the wrong initial roles. Each test
retains bounded before/after identity and role coordinates; it excludes proposed
payloads and protected decision data.

## R3 invited Supplier fixture

R3 reuses the three internal BP-V1 actors and requires a fourth restricted
applicant, a fresh invitation, a different applicant-owned request for negative
access proof, and a delivered active MESH snapshot:

```sh
PLAYWRIGHT_BP_R3_APPLICANT_USER=<restricted-applicant> \
PLAYWRIGHT_BP_R3_APPLICANT_PASSWORD=<applicant-secret> \
PLAYWRIGHT_BP_R3_INVITATION_TOKEN=<fresh-token> \
PLAYWRIGHT_BP_R3_INVITEE_EMAIL=<invited-email> \
PLAYWRIGHT_BP_R3_OTHER_REQUEST_ID=<another-applicants-request-uuid> \
PLAYWRIGHT_BP_R3_MESH_SNAPSHOT_ID=<active-received-snapshot-uuid> \
pnpm test:e2e:bp-r3
```

Run `pnpm preflight:e2e:bp-r3` first for the same secret-safe environment check.

`PLAYWRIGHT_BP_R3_MESH_CANDIDATE_BP_ID` is optional when the profile should
extend an existing identity. Neither scenario skips when its fixture is absent.

## R5 Customer and R6 MESH qualification fixtures

R5 reuses the three BP-V1 actors and sales-organization UUID, plus three R5
UUIDs for a resettable Customer scope: `PLAYWRIGHT_BP_R5_CUSTOMER_BUSINESS_PARTNER_ID`,
`PLAYWRIGHT_BP_R5_CUSTOMER_ID`, and `PLAYWRIGHT_BP_R5_COMPANY_CODE_ID`.
The onboarding test creates its own case; no materialized-case ID is required.
See the [R5 qualification runbook](../../docs/runbooks/business-partner-r5-qualification.md)
for disposable fixture provisioning and the six evidence gates. Run `pnpm preflight:e2e:bp-r5`, then
`pnpm test:e2e:bp-r5`.

R6 requires `PLAYWRIGHT_MESH_BASE_URL`, distinct supplier and buyer username/
password pairs (`PLAYWRIGHT_BP_R6_SUPPLIER_*`, `PLAYWRIGHT_BP_R6_BUYER_*`), and
`PLAYWRIGHT_BP_R6_BUYER_ACCOUNT_ID`. The target must configure
`MESH_SELF_REGISTRATION_POLICY_URL` (and optionally the server-only
`MESH_SELF_REGISTRATION_POLICY_BEARER_TOKEN`) so the qualification request
returns `internal_sponsor_required`. Run `pnpm preflight:e2e:bp-r6`, then
`pnpm test:e2e:bp-r6`. Neither suite skips when configuration is absent.

The R2, R3, R5 and R6 commands bootstrap missing Chromium NSS, NSPR and ALSA libraries
into the ignored `node_modules/.cache/playwright-linux-libs` directory on Linux.
This requires `apt-get`, `dpkg-deb`, and access to the configured package mirror,
but does not require administrator privileges.

Set `PLAYWRIGHT_BASE_URL` to a reachable Neon instance. Session tests require
the credentials and skip when they are absent. The dormant visual spec also
skips until its activation prerequisites are complete.

## Production matrix

Production execution is opt-in and fail-closed:

```powershell
$env:PLAYWRIGHT_PRODUCTION_MATRIX = "1"
$env:PLAYWRIGHT_STUDIO_BASE_URL = "https://studio.example.test"
$env:PLAYWRIGHT_NEON_BASE_URL = "https://neon.example.test"
$env:PLAYWRIGHT_MESH_BASE_URL = "https://mesh.example.test"
pnpm test:e2e:production
```

The core surface, shell, keyboard, WCAG 2.2 AA, light/dark, density and
performance checks run for every enabled plane/form-factor project. Seeded
journeys use the following optional fixture variables and skip explicitly when
their fixtures are absent:

- `PLAYWRIGHT_RUNTIME_ENTITY`, `PLAYWRIGHT_RUNTIME_RECORD_ID`
- `PLAYWRIGHT_WORK_ITEM_TITLE`, `PLAYWRIGHT_WORK_ITEM_ACTION`
- `PLAYWRIGHT_SETTINGS_SCOPE_ROUTE`
- `PLAYWRIGHT_SAVED_VIEW_TITLE`, `PLAYWRIGHT_SETUP_DESTINATION`,
  `PLAYWRIGHT_CONTENT_TITLE`
- `PLAYWRIGHT_DENIED_ROUTE`
- `PLAYWRIGHT_STATE_<STATE>_ROUTE` for each required component state, with
  hyphens represented as underscores

State fixtures should expose `data-ui-state="<state>"`; semantic fallback text
is accepted during migration. Fixture actions must be safe to repeat because
CI retries failed tests.

### Business Partner 360 qualification

The BP360 qualification suite is limited to the supported Chromium desktop and
Pixel 7 profiles and is invoked with:

```sh
PLAYWRIGHT_PRODUCTION_MATRIX=1 \
PLAYWRIGHT_NEON_BASE_URL=https://neon.example.test \
PLAYWRIGHT_BP360_RECORD_ID=<dual-role-business-partner-uuid> \
PLAYWRIGHT_BP360_PERSON_RECORD_ID=<workforce-business-partner-uuid> \
PLAYWRIGHT_BP360_ORGANIZATION_ID=<operating-organization-uuid> \
PLAYWRIGHT_BP360_COMPANY_CODE_ID=<company-code-uuid> \
PLAYWRIGHT_BP360_RESTRICTED_SENTINELS=<comma-separated-synthetic-raw-values> \
PLAYWRIGHT_BP360_PERFORMANCE=1 \
pnpm test:e2e:bp360-qualification
```

`PLAYWRIGHT_BP360_AS_OF` may override the historical date. Use an account that
can perform the audited person reveal for the cleanup journey. The suite covers
canonical/deep-link history, superseded-request abort, role/scope switching,
historical read-only behavior, governed destinations, sensitive close/expiry/
navigation/permission-loss cleanup, browser-state leakage, WCAG automation,
200% reflow, RTL layout, and the HTTP latency/payload budgets. Automated Axe
and semantic checks support but do not replace manual screen-reader and
localization certification.
Use unique, synthetic fixture values for the restricted sentinels, covering raw
bank, tax, national identifier, birth, compensation, evidence and risk data.
The variable is used only as a negative matcher and its value is never printed.

## PI visual activation record

The PI visual project is manual and non-blocking in CI until activation.

| Field             | Record                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accountable owner | Neon application plane                                                                                                                                                                                                                        |
| Decision deadline | 2026-09-30                                                                                                                                                                                                                                    |
| Decision outcome  | **Activate** only after fixture data, test credentials, a reachable base URL, and a committed reference snapshot are complete; otherwise **delete** the dormant PI spec, its manual no-op CI job, and this activation record on the deadline. |

To activate, complete the following and then remove the `test.skip(...)` in
`visual/pi-fixture.spec.ts`:

1. Finish the fixture seed in `server/db/seed/tenants/neon/010_demo/999_visual_fixture_pi.sql`.
2. Configure `PLAYWRIGHT_USER`, `PLAYWRIGHT_PASSWORD`, and `PLAYWRIGHT_BASE_URL` for the test environment.
3. Generate and review the reference snapshot:

   ```sh
   pnpm test:visual --update-snapshots
   git add tests/e2e/visual/__screenshots__/
   ```

4. Change the manual CI job to the agreed blocking lifecycle only after the
   reference snapshot is stable.

Until then, do not broaden `test:visual`: it must run only the PI visual
project. The manual screenshot job uploads output from
`tests/e2e/.playwright-output/` and reference images from
`tests/e2e/visual/__screenshots__/` on failure.
