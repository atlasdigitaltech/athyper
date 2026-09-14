# PgBouncer authentication, health, and sizing

Both instance poolers use a static allowlist containing `athyper_runtime` and
`athyper_worker`. PostgreSQL superuser credentials are not mounted in poolers;
administration and migrations connect directly to `db`. Keycloak also connects
directly. Do not add `auth_user` without deliberately designing dynamic lookup
permissions: it enables authentication fallback for roles outside the file.

Secret files must contain 1–1024 bytes with no NUL, CR, or LF, including trailing
newlines. Startup rejects unsupported files without printing their contents.
PgBouncer and libpq password files use different escaping rules; the startup
script generates both with mode 0600 in tmpfs. Restart/recreate both poolers after
credential rotation so their generated files match the database credentials.
Secrets are delivered as files and omitted from Compose environment values and
image metadata; application startup scripts may export credentials to their
process environments.

The app healthcheck uses `athyper_runtime`; the session healthcheck uses
`athyper_worker`. Each executes `SELECT 1` through its local pooler against Neon,
Mesh, and Studio, with a three-second deadline per database and a ten-second
Compose timeout. This requires only db-init, not foundation tables. This checks
connectivity and authentication, not application schema permissions. Compose
health dependencies gate startup; an unhealthy status alone does not restart a
running container.

Poolers start as root to read host-owned mode-0600 secrets, then run PgBouncer as
uid 70. Capabilities are limited to `DAC_READ_SEARCH` (secret reads), `CHOWN`
(generated files), and `SETUID`/`SETGID` (privilege drop). db-init only retains
`DAC_READ_SEARCH`. Other upstream services need separate image-specific
capability testing before their capability sets are changed.

## Environment controls

Set host environment variables or instance env-file values using these prefixes:

- `ATHYPER_PGBOUNCER_APPS_` for the transaction pooler.
- `ATHYPER_PGBOUNCER_SESSION_` for the session pooler.

| Suffix                 | Default | Meaning                                              |
| ---------------------- | ------- | ---------------------------------------------------- |
| `MAX_CLIENT_CONN`      | 200     | Client connection limit per pooler                   |
| `DEFAULT_POOL_SIZE`    | 20      | Backend connections per user/database pair           |
| `RESERVE_POOL_SIZE`    | 5       | Additional backend connections per pair              |
| `MAX_DB_CONNECTIONS`   | 0       | Backend limit per database per pooler; zero disables |
| `MAX_USER_CONNECTIONS` | 0       | Backend limit per user per pooler; zero disables     |

The first two controls must be positive; the others may be zero. Startup accepts
only decimal integers up to 1,000,000. Defaults preserve existing sizing; they
are not a guarantee that PostgreSQL has sufficient connections.

Budget both poolers together against the actual PostgreSQL `SHOW max_connections`
setting, leaving room for IAM, migrations, administration, and reserved slots.
For three databases and one active role per pooler, existing defaults permit up
to `2 × 3 × (20 + 5) = 150` backend connections. Both roles using both poolers
could reach 300. Session connections can occupy these slots for long periods.

For example, setting both default pool sizes to 8, reserves to 2, and both
`MAX_DB_CONNECTIONS` values to 10 caps the combined pooler budget at 60 across
these three databases. Confirm that the remaining database capacity is adequate
before adopting this example. Database/user caps apply independently in each
pooler; wildcard database routing means newly introduced databases also need
budgeting. Raising client/backend limits also requires checking container
`ulimit -n` and configuring Compose `ulimits.nofile` accordingly.

## Verification

Run the disposable-container integration test:

```sh
ATHYPER_PGBOUNCER_TESTS=true node --test deploy/compose/tests/pgbouncer.integration.test.mjs
node --test deploy/compose/tests/structure.test.mjs
```

It uses the pinned service images, capability sets, and host-owned secret mounts,
creates its own internal network and data volume, and cleans them up. It covers
idempotent db-init, escaped passwords, both pooling modes, unlisted-role denial,
invalid secrets/configuration, sizing overrides, backend outage, and recovery.
