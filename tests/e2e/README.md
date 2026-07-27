# Browser tests

`tests/e2e/` contains browser-executed tests. Session and visual checks retain
their existing projects. The production experience matrix adds desktop and
mobile projects for Admin, Neon and Mesh:

| Project | Directory | Command | Purpose |
| --- | --- | --- | --- |
| `session` | `session/` | `pnpm test:e2e:session` | Authenticated session lifecycle behavior. |
| `visual` | `visual/` | `pnpm test:visual` | PI screenshot regression only. |
| `production-admin-desktop/mobile` | `production/` | `pnpm test:e2e:production` | Admin experience, accessibility and performance contract. |
| `production-neon-desktop/mobile` | `production/` | `pnpm test:e2e:production` | Neon experience, accessibility and performance contract. |
| `production-mesh-desktop/mobile` | `production/` | `pnpm test:e2e:production` | Mesh experience, accessibility and performance contract. |

Run all browser projects with `pnpm test:e2e`. The visual command remains the
CI-compatible command, but explicitly selects only the `visual` project.

## Shared authentication

`global-setup.ts` accepts shared `PLAYWRIGHT_USER` and `PLAYWRIGHT_PASSWORD`
credentials or plane-specific `PLAYWRIGHT_ADMIN_*`, `PLAYWRIGHT_NEON_*` and
`PLAYWRIGHT_MESH_*` values. It writes one local-only storage state per plane.
Without credentials it writes empty states and exits without launching a
browser, so test discovery remains deterministic.

Set `PLAYWRIGHT_BASE_URL` to a reachable Neon instance. Session tests require
the credentials and skip when they are absent. The dormant visual spec also
skips until its activation prerequisites are complete.

## Production matrix

Production execution is opt-in and fail-closed:

```powershell
$env:PLAYWRIGHT_PRODUCTION_MATRIX = "1"
$env:PLAYWRIGHT_ADMIN_BASE_URL = "https://admin.example.test"
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

## PI visual activation record

The PI visual project is manual and non-blocking in CI until activation.

| Field | Record |
| --- | --- |
| Accountable owner | Neon application plane |
| Decision deadline | 2026-09-30 |
| Decision outcome | **Activate** only after fixture data, test credentials, a reachable base URL, and a committed reference snapshot are complete; otherwise **delete** the dormant PI spec, its manual no-op CI job, and this activation record on the deadline. |

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
