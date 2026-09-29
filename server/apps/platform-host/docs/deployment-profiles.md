# Deployment profiles

| Launch command | Role |
| --- | --- |
| `pnpm --filter @athyper/server-platform-host start:api` | api |
| `pnpm --filter @athyper/server-platform-host start:worker` | worker |
| `pnpm --filter @athyper/server-platform-host start:scheduler` | scheduler |
| `node dist/main.js` | `MODE`, default api |

Run `build` before production start commands. `dev:api`, `dev:worker`, and
`dev:scheduler` use the matching TypeScript entrypoint with watch mode. An explicit
entrypoint supplies its role when `MODE` is absent and rejects a conflicting
`MODE`. Non-production launch loads dotenv before role selection, so conflicts
in local `.env` files are also rejected. The compatibility `dev` command retains
its existing API mode selection.

`HOST_DEPLOYMENT_PROFILE` defaults to `combined`. Studio, Neon, and Mesh names are
recognized by the parser but startup rejects them with
`DEPLOYMENT_PROFILE_NOT_YET_IMPLEMENTED`. Only combined composition is currently
implemented. A registration plan distinguishes served planes from database
planes; extra coordination database access must not grant API access.

`ENTITY_RELEASE_REVIEW_CONFIG_PATH` enables the existing review coordination for
workers only. The closed module registry rejects review loading for other roles.
The separate `control-api` entrypoint retains its existing configuration and
isolated publication control composition; it does not launch the combined host.

No deployment, database change, release publication, or live readiness verification
is part of this source reorganization.


## Isolation implementation status

There are three isolated profile names, each with API, worker, and scheduler
roles. These are nine possible plane/role combinations, not nine implemented
isolated deployments. `combined` is a fourth profile; `control-api` is a separate
entrypoint, not a fourth isolated space profile.

| Boundary | Studio | Neon | Mesh |
| --- | --- | --- | --- |
| Profile parsing and registration-plan selection | Implemented | Implemented | Implemented |
| Runtime/worker database selection and lifecycle tests | Covered | Covered | Covered |
| Independently loadable shared infrastructure and IAM authority | Extracted | Extracted | Extracted |
| Shared Entity service and HTTP construction | Extracted | Extracted | Extracted |
| Extracted Entity capability selection and served-plane admission | Implemented | Implemented | Implemented |
| Complete isolated capability graph | Pending | Pending | Pending |
| Isolated startup enabled | No | No | No |

Review coordination can add Studio/Neon read connections without adding worker
credentials, authorization-writer pools, or invalidation listeners for those
extra planes. Those capabilities follow `servedPlanes`, not `databasePlanes`.
These connection restrictions are prerequisites; they do not establish HTTP
admission or queue isolation on their own.

Shared Entity service and HTTP construction have been extracted from
`register-services.ts`. Before enabling a profile, select its capability
registrars and required providers explicitly, and verify
that unserved-plane requests are denied even when coordination connections exist.
API qualification must exercise the actual Country publication, authenticated
list/detail flow, supported controls, and locked embedded-list scopes. Worker
and scheduler qualification must also demonstrate queue/schedule ownership.
Do not remove `assertDeploymentProfileImplemented` merely because the database
selection matrix passes.

## Additional isolation prerequisites

Bootstrap now passes `servedPlanes` to IAM composition. The installed authenticator
rejects unserved planes before invoking identity resolution, including injected
resolvers, and rejects an authenticated result that changes the requested plane.
Review coordination connections never expand this admission set. Tests cover all
three single-plane selections and the installed host IAM binding.

Governance persistence and publication target construction are independently
loadable and tested without cross-plane repository fallback. These tests use
fixtures; they do not qualify a live isolated deployment.

Isolated startup remains blocked until the complete capability graph is extracted.
The combined registrar still includes space-specific finance, authoring and other
services, and publication registration still requires Studio authority. The
extracted Entity persistence, experience, governance and authorization factories
now register through the closed capability catalog. Their database selection and
governance/control health loops use served planes, excluding coordination-only
connections. IAM context discovery also denies unserved planes.

## Job and scheduler ownership

API publishers, workers and schedulers receive the same deployment namespace and
served-plane set. For isolated plans, logical queues are mapped to
`host-<plane>.<queue>`. Enqueue, worker dispatch, replay and scheduler upsert/inspect
reject missing or excluded execution planes. Job transaction access is restricted
to served planes even when coordination connections exist.

Cancellation channels, scheduler leader keys and durable owner inventories are
namespaced too. Tests cover queue matching, cross-plane rejection, cancellation,
fencing, inventory ownership and lifecycle shutdown. The existing combined DEV
queue names and scheduling keys are retained; no pending jobs are migrated.
Do not mix combined and isolated consumers as a deployment migration strategy.

## DEV Country qualification

Use the existing DEV environment and ordinary authenticated browser state:

```sh
node tooling/scripts/verification/qualify-country-dev.mjs --state tests/e2e/.auth/dev/neon/catl.admin.json
```

The read-only runner checks the authenticated Neon session, Country descriptor,
list/detail API and browser routes, search/filter/sort APIs, cursor pagination and anonymous denial. It
writes a sanitized receipt to `/tmp/athyper-country-dev-qualification.json` and
exits nonzero on failure. It does not qualify record mutations, all list controls,
embedded locked-scope flows, or independent isolated deployments. Those broader
checks remain required before claiming complete deployment qualification.

The initial 2026-09-29 attempt stopped at `DEV_SESSION_NOT_AUTHENTICATED`.
After the user refreshed the DEV session, the read-only Country qualification
passed at 13:12 UTC: descriptor, list/detail APIs, standard browser routes,
search/filter/sort APIs, cursor pagination and anonymous denial. The runner uses
the browser BFF's `/api/relay/entity-runtime/` paths and requires JSON responses.
This does not qualify mutations, saved-view writes or embedded locked scopes.
The sanitized receipt is retained under the DEV instance's
`receipts/host-capability-20260929-1225/country-qualification.json`.
