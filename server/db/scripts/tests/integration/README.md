# Database integration verification

These checks require an explicitly configured disposable database and are intentionally excluded from the fast `pnpm test` contract suite.

Run the TypeScript verifiers through the named `server/db/package.json` commands:

- `test:integration:effective-lock`
- `test:integration:pipeline`
- `test:integration:atlas:provision-role`
- `test:integration:atlas:conversation-rls`
- `test:integration:atlas:tools-rls`
- `test:integration:publication-repository`

The Business Partner SQL verifiers are available as:

- `test:integration:business-partner-profile-projection`
- `test:integration:business-partner-profile-publication`

The `fixtures/` and `meta-entity/` SQL files remain composable psql assets. They are not a single suite: callers must provision the required plane and fixture state explicitly before executing them.
