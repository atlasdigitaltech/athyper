# Platform-control API

## Post-cutover browser acceptance completed (2026-09-27)

Both actors completed fresh authorization-code/PKCE browser logins after the
cutover. The helper exchanged each code and called the deployed HTTPS
`/api/platform-control/session` endpoint successfully:

| Actor | API verification time (UTC) | Returned policy permission | Opposite permission |
| --- | --- | --- | --- |
| `platform.admin` | `2026-09-27T03:31:43.135Z` | `studio.metadata.publication_policy.create` | Activation absent |
| `platform.owner` | `2026-09-27T03:32:41.381Z` | `studio.metadata.publication_policy.activate` | Proposal absent |

Both results returned the preserved expected principal, Studio plane,
platform-authority tenant, `platform-control` realm, elevated assurance, and
`pwd` + `otp` authentication methods. This closes the outstanding post-cutover
browser-login check; the earlier pre-cutover logins and DB probes are separate
evidence. No credentials or bearer tokens are included here. Local private
verification receipts remain operational records, not immutable audit storage.

This verifies login and returned effective permissions, not execution of a
policy proposal or activation. Country publication may resume its remaining
checks; neither a policy nor Country was activated by this verification.

## DEV actor cutover completed (2026-09-27)

This supersedes the pending-cutover status in the earlier deployment checkpoint.
Both humans completed real control-API verification with password + OTP:
admin at `2026-09-27T03:14:14.387Z`, owner at `2026-09-27T03:17:07.641Z`.
The operator then explicitly authorized migration. Before changing state, the
cutover tool reverified the signed tokens at their original verification time,
checked exact subject/issuer/audience and current enabled Keycloak identities,
and exercised all staging drift checks in a rollback-only DB rehearsal.
This historical evidence check is not an expired-token API login or publication
approval. Normal API token expiration checks remain unchanged.

Applied with:

```sh
node server/db/scripts/operations/authorization/cutover-dev-platform-authority.mjs --confirm=DEV-PLATFORM-AUTHORITY-CUTOVER
```

- Existing Studio principal IDs and audit identities are preserved.
- Exact old `athyper` bindings are revoked and no longer primary.
- New pinned `platform-control` bindings are active and primary.
- Exact staged group memberships are active, retaining tenant-exact scopes.
- Both principals' `auth_epoch` advanced from 0 to 1.
- Exact old Keycloak accounts are disabled; logout completed and online-session
  counts were checked as zero. No accounts or historical rows were deleted.
- No corresponding old-subject bindings were found in Neon or Mesh; neither
  database was changed. No customer-tenant grants were made.

Database cutover and Keycloak retirement are separate recoverable steps, not a
distributed transaction. `event.command_execution` stores separate
`studio.platform_authority.cutover` and
`studio.platform_authority.identity_retirement` receipts. The latter records
confirmed account disablement/session revocation; it does not overwrite the
earlier cutover receipt. Repeat execution confirmed recovery/idempotency without
incrementing epochs again. Historical-login evidence currently limits operational
retries to 24 hours; later recovery requires deliberate re-verification.

Post-cutover grants exposed a missing runtime dependency on subscription
entitlement tables. The restricted DB role now has explicit SELECT/EXECUTE on
the required entitlement tables/functions; no admin membership or RLS bypass
was introduced. These grants are in `prepare-dev-control-api.mjs`.

Live restricted-DB identity/permission probes confirmed:

| Actor | Policy proposal | Policy activation permission |
| --- | --- | --- |
| `platform.admin` | Granted; real revision authorizer permits with MFA | Absent; denied |
| `platform.owner` | Absent; denied | Granted; missing revision still denied |

Admin without MFA, foreign tenant/Neon contexts, and both retired subject
bindings were denied. The real revision authorizer was used with live DB grants;
these were **authorization integration probes, not fresh post-cutover HTTP
logins**. No policy was proposed/activated to manufacture a positive activation
test. Existing enrollment tests cover independent-reviewer/maker-checker behavior.
Fresh targeted tests: 40 host tests across `control-plane.test.ts`,
`control-session.test.ts`, `publication-policy-enrollment.test.ts`, and
`publication-policy-enrollment-routes.test.ts`, plus 2 cutover-script tests,
passed. The 40 is a targeted subset, not a full-host-suite count. No new full
host suite or typecheck is claimed in this operational cutover; their earlier
results remain historical. Country activation is outside this cutover.

## Restricted DEV deployment checkpoint (2026-09-27)

The separate `athyper-dev-control-control-api-1` process is deployed from
`deploy/compose/instance/compose.control-api.yaml`. It has no published host port,
no combined bootstrap, and no tenant entity routes, worker, or scheduler. The DEV
gateway routes only the session probe and human policy proposal/activation URLs
to it. Workload `/execute` URLs continue to use their separate registration.

The dedicated PostgreSQL role `athyper_control_api` is neither superuser nor
RLS-bypassing and has no inherited role memberships. The repeatable DEV-only
`prepare-dev-control-api.mjs --confirm=DEV-CONTROL-API` tool installs its explicit
table/function grants and authority-tenant-restricted source-snapshot read policy.
Credentials are private mounted files; DEV publication keys are resolved through
the existing Infisical publisher credential and fingerprint-pinned trust manifest.
No new signing key material was generated or exported.

The identity resolver now first uses the existing narrow subject-resolution
function, then stamps the principal and verifies issuer/audience pins under
self-read RLS. Direct live calls using the restricted database credential resolve
both preserved principal IDs and return **zero effective permissions**, as
expected while their new group memberships remain suspended. Those are database
integration probes, not human authentication evidence.

The dedicated `athyper-platform-control-operator` public client uses authorization
code + S256 PKCE with the exact loopback callback `http://127.0.0.1:18765/callback`.
Password grant, implicit flow, service accounts and Full Scope Allowed are off.
Its dedicated flow requires fresh password and OTP without a cookie shortcut.
The realm's normal browser flow is unchanged. AMR is derived from completed
authenticators, not hardcoded assurance. See Keycloak's
[authentication flow documentation](https://www.keycloak.org/docs/latest/server_admin/).
Keycloak 26.7 masks execution configuration values on GET; configuration reads
alone therefore do **not** establish emitted MFA evidence.

Provision/check the client explicitly (also required after fresh realm import;
the realm export JSON does not yet embed this operational client):

```sh
node server/db/scripts/operations/authorization/provision-dev-control-client.mjs --confirm=DEV-CONTROL-CLIENT
node server/db/scripts/operations/authorization/provision-dev-control-client.mjs --check
```

For each actor, run the following from the repository, substituting
`platform.owner` for the second run. Open the printed URL in the local browser and
complete password + OTP there. Do not paste credentials or tokens into chat.

```sh
NODE_EXTRA_CA_CERTS=/home/chandravel_natarajan/.athyper/platform/secrets/tls.crt node server/db/scripts/operations/authorization/verify-dev-control-login.mjs platform.admin
```

The helper verifies the token through the actual HTTPS control API, checks the
expected persisted principal/tenant and OTP assurance, and writes a private,
short-lived token receipt outside the repository under
`/home/chandravel_natarajan/.athyper/instances/dev/secrets/control-api/login/`.
These files are sensitive local operational records, not immutable audit storage.
The API independently validates signatures; the helper does not treat decoded
claims or token simulations as authentication evidence.

Fresh verification:

- Container startup/DEV trust initialization succeeded; internal `/livez`: 200.
- Public HTTPS session probe without authentication: 401.
- Internal tenant entity route: 404.
- Focused control/enrollment tests: 40 passed; deployment/client tests: 3 passed.
- Full host suite: 646 passed, 25 skipped (85 files passed, 3 skipped).
- Host typecheck: the single pre-existing gated preflight repository import error.

**Cutover is not complete.** Neither old account has been disabled, neither old
binding retired, and new human memberships remain suspended. Fresh human API MFA
verification is still required for both actors. Account-console screenshots do
not satisfy this gate. After that succeeds, perform audited Studio binding/grant
cutover preserving principal IDs, invalidate authorization state, disable the
exact old realm subjects and revoke their sessions, and verify live admin/owner
permission separation. No policy proposal/activation, Country activation, or
QA/staging/production change is claimed by this deployment checkpoint.

## DEV account-console role-claim correction (2026-09-27)

After the HTTPS correction, `account/?userProfileMetadata=true` still returned
403. Both users had existing account self-service roles, but the built-in
`account-console` client had no default client scopes. Its token simulation
contained no account role claims. This was distinct from application publication
permissions and did not require adding user roles.

The existing `roles` client scope is now attached to this client in the DEV
`platform-control` realm. Full Scope Allowed remains false; existing role scope
mappings were checked unchanged. Token simulation now includes `manage-account`
and `manage-account-links` for both actors. Simulation is not a signed login
token or an authenticated profile-API acceptance test. Users must obtain fresh
tokens by signing out and logging back in.

The source and clean-slate realm JSON files now explicitly declare account-console
with the roles scope, PKCE, restricted account scope mappings and no password
grant/service account. The generator rejects source definitions missing that
boundary. Two source/import configuration tests pass; no fresh realm import was
performed. The IAM image uses the clean-slate JSON on initial import. Existing
realms are not repaired simply by restarting or importing an image; use the
explicit idempotent DEV repair tool:

```sh
node server/db/scripts/operations/authorization/repair-dev-account-console-scope.mjs --check
node server/db/scripts/operations/authorization/repair-dev-account-console-scope.mjs --confirm=DEV-ACCOUNT-CONSOLE-ROLES
node --test deploy/compose/tests/account-console-scope.test.mjs
```

Only the account-console scope attachment is mutated. Human grants, MFA, password
credentials, application memberships and other environments remain unchanged.

## DEV account-console HTTPS forwarding correction (2026-09-27)

The account console displayed “Server responded with an invalid status” because
its `login-status-iframe.html/init` request returned 403 for the legitimate HTTPS
origin. The public ingress terminates TLS, but the internal DEV gateway reported
its HTTP hop to Keycloak. Direct probes with HTTPS forwarding returned 204.

`deploy/compose/instance/config/traefik/dev.yaml` now attaches `iam-public-origin`
only to the DEV IAM router, pinning `X-Forwarded-Proto=https`, port 443 and host
`iam.dev.athyper.test`. This uses Traefik's documented
[custom request headers](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/headers/).
It relies on the existing TLS-terminating ingress and the internal gateway having
no published web port. Do not reuse this configuration for a public plaintext
HTTP entrypoint. Broad insecure forwarding trust was not enabled.

Only `athyper-dev-gateway-1` was restarted to reload its non-watching file provider.
Live probes, verifying TLS with the mounted public certificate, confirmed:

- Legitimate HTTPS account-console origin: 204 in `platform-control` and `athyper`.
- Untrusted origin: 403 in both realms.
- Platform-control account HTML and OIDC discovery: 200.
- DEV gateway: running and healthy.

The regression test `deploy/compose/tests/iam-forwarded-origin.test.mjs` passes.
No credentials, MFA settings, role assignments or identity bindings changed.
Actual password-and-OTP login remains a human verification step; gateway probes
are not authentication or publication-authorization evidence.

## Ownership and identities

Platform authority is independent of customer tenancy. The Keycloak realm is
`platform-control`; the application authority tenant is an explicitly configured
tenant UUID, presently the DEV `athyper` tenant. It is not derived from the
username, realm name, token role, or request header.

Requested human actors:

| Account | Responsibility |
| --- | --- |
| `platform.admin` | Metadata administration, policy proposal, permitted publication requests and inspection |
| `platform.owner` | Independent policy activation and separately authorized exceptions |

These responsibilities require explicit application grants. Neither name grants
Keycloak administration, SQL administration, cross-tenant data access, or an
exception to MFA or maker/checker separation. Workload identities remain separate.

## Initial inventory before migration staging

During this implementation, read-only DEV inventory found both requested names
already in **Keycloak `athyper`**, and neither in `platform-control`. Both already
have active application principals in Studio's `athyper` tenant:

| Account | Existing Studio principal | Existing Keycloak subject |
| --- | --- | --- |
| `platform.admin` | `df0159b0-2bdc-55e8-944b-efaa9ed9b8e5` | `595e91ac-59fd-402c-ac65-fc392d98da9d` |
| `platform.owner` | `41bf4855-6aa1-5e43-bc11-ee2cfa647693` | `6e4efc64-ea29-49a4-965e-ac33614ad015` |

Their existing bindings have realm `athyper` and no pinned issuer/audience.
Studio has zero `platform-control` bindings. No accounts, passwords, bindings,
memberships or grants were mutated by this implementation.

The initial implementation required choosing explicitly between migrating these actors
(including disposition of old bindings, grants and sessions), or keeping the
existing actors and provisioning distinct control-plane application principals.
Do not silently attach another realm identity to the same principal: both
identities would otherwise share application permissions outside this API.

## DEV migration staged — human MFA verification required

The user approved controlled migration preserving the existing application
principals. `stage-dev-platform-authority.mjs` has now been applied to DEV only.
This supersedes the initial inventory's zero-control-bindings/no-mutations status.

| Account | New Keycloak `platform-control` subject | Studio role/group |
| --- | --- | --- |
| `platform.admin` | `72d03346-0958-4f3b-a59b-a5e17faee330` | `platform.control.admin` |
| `platform.owner` | `52380ee6-88a8-4083-947e-d0628871d747` | `platform.control.owner` |

- Existing principal IDs and historical audit attribution are unchanged.
- Both new users have temporary passwords and required `UPDATE_PASSWORD` and
  `CONFIGURE_TOTP` actions. A required action is not proof that MFA was completed.
- New issuer/audience-pinned Studio identity bindings are active and non-primary.
  The old ordinary-realm bindings remain primary/active until verified cutover.
- Existing Studio plane memberships are reused. No customer tenant, Neon or Mesh
  records, memberships or grants were added or modified.
- Before staging, both principals had only the permissionless
  `studio.access.quarantine` group. No active group-role grants were present.
- The new roles and exact authority-tenant scope assignments exist, but their
  human group memberships are **suspended**. A post-commit query confirmed zero
  effective group grants. Neither realm identity gains new authority at this stage.
- Administrator permissions: contract view, draft create, edit, submit and policy
  proposal. Owner permissions: contract view, review and policy activation.
  Neither receives automated publication, break-glass, wildcard or database-admin
  permissions. Exception authority requires a separate explicit assignment.

Each user must open:

`https://iam.dev.athyper.test/realms/platform-control/account/`

Use the respective private file under
`.athyper/instances/dev/secrets/platform-control-onboarding/`:
`platform.admin.json` or `platform.owner.json`. The files contain temporary
credentials; do not paste them into chat, logs, screenshots or source control.
The directory is mode 0700, credential files 0600 and explicitly Git-ignored.
Change the password and enroll a personal authenticator. This account-console
login is identity verification, **not** proof of control-API authorization.

After both new-realm logins are verified, perform a separately checked cutover:
retire the old bindings, promote the new primary bindings, activate only the new
scoped memberships, invalidate identity caches/epochs as required, disable the
old Keycloak accounts and revoke their sessions. Do not activate memberships
while the old bindings still work. Check existing target-plane projections during
retirement; preserve audit principals rather than deleting them.

Tooling:

```sh
node server/db/scripts/operations/authorization/stage-dev-platform-authority.mjs --check
node --test server/db/scripts/operations/authorization/stage-dev-platform-authority.test.mjs
```

The staging command is repeatable while memberships remain suspended, and refuses
drift or an already-completed cutover. It runs a rollback rehearsal before Keycloak
mutations, stores a Studio `event.command_execution` receipt on commit, and never
resets an existing account's password. Keycloak discarded an unmanaged custom
attribute on the first account, so the tool now pins actual subject IDs in private
operational receipts; it does not rely on the discarded label. These local JSON
receipts are DEV bookkeeping, not immutable audit storage.

Verification: three operational-script tests passed; live Studio rollback,
commit, post-commit binding/scope checks and a repeat `--check` passed. Host
implementation was unchanged in this provisioning step; host suites were not
rerun. The restricted control API remains undeployed and Country unactivated.

## Implemented source boundary

- `server/apps/platform-host/src/entrypoints/control-api.ts`: independent API
  entrypoint; does not call the combined bootstrap/registration chain.
- `src/config/control-plane.ts`: explicit DEV-only configuration, one issuer and
  one audience, no fallback to tenant API environment variables.
- `src/composition/control-plane/identity.ts`: exact persisted
  tenant/provider/realm/subject/issuer/audience binding, active human identity,
  existing plane-admission and permission resolution. It does not require or
  bypass a customer's organization projection; this is a separate admission path.
- `src/composition/control-plane/register.ts`: only policy proposal and
  activation routes. No customer routes or machine execution route.
- `src/composition/shared/identity/platform-authority.ts`: application tenant,
  realm, Studio plane and elevated-assurance checks before enrollment storage.

Human enrollment routes were removed from combined `register-services.ts`.
Existing workload execution remains independently authenticated and still needs
an enrolled exact policy pin. This does not complete machine publication wiring.

The standalone entrypoint uses the existing token verifier (signature, issuer,
audience), IAM service, permission resolver, revision authorizer, policy service,
transactional mutation audit, and fingerprint-pinned DEV signing adapter. It
rejects database roles with superuser or BYPASSRLS privileges. No entity-specific
implementation or naming is introduced.

## Configuration and launch

Run `pnpm --filter @athyper/server-platform-host dev:control-api` only after
credentials, grants and live identity bindings are provisioned and reviewed.
The production-build command is `start:control-api`; the current implementation
deliberately rejects QA, staging and production configuration.

Required variables:

```text
ATHYPER_ENV=local
ATHYPER_INSTANCE=dev
ATHYPER_DOMAIN_SUFFIX=dev.athyper.test
PLATFORM_AUTHORITY_TENANT_ID=11111111-1111-4111-8111-111111111111
PLATFORM_CONTROL_REALM=platform-control
PLATFORM_CONTROL_ISSUER_URL=https://iam.dev.athyper.test/realms/platform-control
PLATFORM_CONTROL_AUDIENCE=athyper-platform-control-api
PLATFORM_CONTROL_DATABASE_URL_FILE=<private mounted file>
PLATFORM_CONTROL_TRUST_MANIFEST_FILE=<reviewed DEV manifest file>
PLATFORM_CONTROL_SIGNING_KEY_ID=<manifest key ID>
PLATFORM_CONTROL_SIGNING_KEY_FILE=<private PKCS8 DER file>
PLATFORM_CONTROL_VERIFICATION_KEY_FILE=<SPKI DER file>
PLATFORM_CONTROL_PORT=4010
```

Database URL and private-key files must deny group/other access. Secret references
are a closed two-entry map; keys are fingerprint-checked on each resolution.
Mounting secret material is not evidence of an approved policy. Audit mutation
receipts must persist in the same database transaction, not merely local logs.

The listener currently binds loopback only. No public ingress, browser client,
login callback or live control API deployment has been installed. Do not expose
it by changing the tenant API's issuer. A dedicated HTTPS ingress and client
must be configured as a separate deployment step. Use public+PKCE for a browser
client, or a confidential client only behind a server-side BFF. Never hardcode
an elevated ACR/AMR claim: the authentication flow must prove actual MFA.

## Remaining live gates

1. Resolve the existing-account migration choice; inventory their current grants.
2. Provision dedicated client(s), required-action/MFA flow and exact identity
   bindings; preserve original audit attribution and do not rename historical IDs.
3. Provision narrow roles/groups, Studio membership and exact authority-tenant
   scopes; no wildcard or Test Full Admin role reuse.
4. Provision least-privileged database access and secret mounts; verify RLS and
   binding reads with the actual runtime database role.
5. Install dedicated HTTPS ingress/login flow; prove real MFA login, wrong
   issuer/audience denial, ordinary-route absence, tenant/plane isolation,
   revocation, missing grants and independent activation.
6. Move workload authority off the customer tenant through the reviewed path.
   No approval or activation is inferred from these provisioning steps.

## Verification scope

Unit coverage checks configuration isolation, foreign context rejection before
storage, missing/ambiguous bindings, token-principal mismatch, MFA, maker/checker,
transactional audit, and entrypoint import ownership. Dummy-driver SQL tests are
not live PostgreSQL/RLS evidence. The isolated process has not been live-qualified.
The known `entity-case-preflight.ts` repository error remains intentionally outside
this implementation. Country activation is not claimed.
