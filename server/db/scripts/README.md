# Database scripts

Scripts are grouped by the responsibility they own. Invoke supported entry
points through `server/db/package.json`; direct paths are implementation
details and may move during cleanup.

- `business-partner-360/`: BP360 evidence, approval, rollout, and fixture tools.
- `provisioning/`: database creation, disposable-target marking, and seed-pack application.
- `operations/`: state-changing runtime and repair operations.
- `checks/`: read-only DDL, contract, and release checks.
- `seed/`: deterministic seed and authorization-inventory compilers.
- `reports/`: read-only database quality reports.
- `tools/`: lower-level introspection and migration utilities.
- `tests/integration/`: explicitly invoked live-database integration checks.
- `__tests__/`: hermetic Node test suites grouped by domain.

New state-changing commands must validate their database target and require an
explicit confirmation token. Reuse the helpers in `lib/` for CLI parsing,
entry-point detection, and local database target validation.
