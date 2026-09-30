# DEV session and authoring policy

Studio and Neon use a two-hour idle timeout and a twelve-hour absolute timeout
in the personal DEV source workspace. Other deployments retain their existing
plane defaults unless they explicitly configure overrides. Access-token expiry,
MFA elevation, and operation grants remain independently enforced.

The BFF reads positive integer seconds:

```dotenv
AUTH_SESSION_IDLE_TTL_SECONDS=7200
AUTH_SESSION_ABSOLUTE_TTL_SECONDS=43200
```

The source workspace generator and the local DEV frontend runner provide these
values for Studio and Neon. Restart/recreate the affected web processes after
changing environment variables. Existing sessions retain their original absolute
expiry; sign in again to establish a twelve-hour session.

The running Keycloak realm must be configured by its administrator with SSO idle
7200 seconds and SSO maximum lifespan 43200 seconds. Set matching client overrides
for `studio-web` and `neon-web`; Studio's old 900/14400 overrides must be replaced.
Keep the existing 300-second access-token lifetime. DEV realm generation includes
these settings for future provisioning; it does not alter an existing live realm.
The running realm update is being handled manually by the user.

Authoring is separate from login. The DEV preview role for `catl.admin` contains
only `metadata.entity.author`, `metadata.entity.validate`, and
`metadata.entity.test`. It does not add review or publication grants. The renewal
script accepts `grant_hours=1..168`, defaults to two hours, and inserts fresh
assignments only when no unexpired active assignment exists. Expired history is
retained. Both membership and scoped role assignment need to be valid.

Reviewed DEV renewal commands (run from repository root):

```sh
docker exec -i athyper-dev-db-1 psql -X -U postgres -d athyper_studio -v ON_ERROR_STOP=1 -v apply=false -v grant_hours=168 < server/db/scripts/operations/studio/provision-cirrusatlantic-preview-session.sql
docker exec -i athyper-dev-db-1 psql -X -U postgres -d athyper_studio -v ON_ERROR_STOP=1 -v apply=true -v grant_hours=168 < server/db/scripts/operations/studio/provision-cirrusatlantic-preview-session.sql
```

The seven-day renewal applied on 2026-09-13 expires at **2026-09-20 00:19:56
Asia/Kuala_Lumpur** (2026-09-19 16:19:56 UTC). It does not renew automatically.

After manual Keycloak changes, capture fresh Studio and Neon sessions. The
verification checker refreshes an authenticated session when its access token is
near expiry and atomically saves the resulting browser state after validating
its identity. It cannot revive an expired login or renew authorization grants.

```sh
node tooling/scripts/verification/check-athyper-auth.mjs --environment dev --plane studio --actor catl.admin --require-elevated
node tooling/scripts/verification/check-athyper-auth.mjs --environment dev --plane neon --actor catl.admin
```

Verify fresh session `absoluteExpiresAt` is twelve hours from login, the idle
expiry is approximately two hours, and the Studio graph authoring endpoint returns
200. A separate MFA challenge can still be required when elevation expires.
