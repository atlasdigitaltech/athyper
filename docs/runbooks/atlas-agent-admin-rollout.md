# Atlas Admin rollout

## Release boundary

The first Admin release is a default-off product-help surface. It may answer
questions about Athyper documentation, general product behavior, and safe
navigation. It cannot inspect tenant records, customer conversations, IAM
traces, policy evaluations, principals, or tenant health, and it cannot invoke
tools, export data, or mutate state.

Two independent environment gates must be enabled before the Admin application
mounts Atlas:

```text
ATLAS_AGENT_ENABLED=true
ATLAS_AGENT_ADMIN_ENABLED=true
```

The effective tenant feature flag `atlas_agent_admin_enabled`, the exact
`ai.agent.use` permission, and an eligible `atlas-fast` binding are still
required by the server. The Admin plane policy admits only `atlas-fast`;
conversation persistence, read tools, and mutations remain denied. The browser
profile controls presentation only and cannot widen this policy.

Keep both environment gates false until the Admin product-help evaluation,
Security review, and internal allowlist are approved. Disabling either gate
removes the Admin UI on the next server render. The server feature flag remains
the authoritative emergency kill switch for catalog and run admission.

## Product-help verification

Before enabling an internal cohort, verify:

1. Admin exposes only the product-help suggestions and public Atlas model name.
2. Requests for tenant records, principals, IAM traces, customer history,
   exports, or actions receive an explicit limitation.
3. The catalog contains no persistence or tool capability.
4. Provider requests contain the restricted Admin system instruction and no
   tool definitions.
5. No prompt, response, record value, or provider body enters logs or traces.
6. Cancellation, rate limiting, feedback, session-scope reset, and provider
   failure behave as they do in the approved base shell.
7. `X-Atlas-Target-Tenant-Id`, `X-Support-Target-Tenant-Id`, and
   `X-Target-Tenant-Id` are rejected before catalog or provider invocation.

## Support-session foundation

`AtlasSupportSessionService` is the only approved contract for a future
tenant-bound Admin session. It requires:

- the exact `ai.agent.admin.support_session` permission;
- a verified Admin request context;
- one UUID target tenant selected by a server workflow;
- a bounded ticket identifier and reason;
- a dedicated `atlas_support` MFA elevation bound to the origin login session,
  target tenant, and action family;
- an active tenant-local support shadow principal;
- one to four allowlisted read scopes;
- a new tenant-bound Admin Atlas thread; and
- a duration between one minute and the configured maximum, which defaults to
  30 minutes.

The signed token binds the origin tenant, staff principal and subject, target
tenant, shadow principal, Admin plane, both authorization epochs, shadow
relationship, allowed scopes, ticket, login-session hash, issue time, expiry,
and signing-key ID. Only its hash is retained by the repository. Verification
checks the signature, stored hash, actor and login-session binding, status,
expiry, requested scope, authorization epochs, and shadow relationship.

Audit entries contain identifiers, scope, timestamps, and an optional
content-addressed resource hash. They must never contain prompts, customer
values, provider bodies, tool arguments/results, or authentication material.
Both the origin staff actor and tenant-local shadow actor are recorded.

The service has deliberately not been exposed as a public HTTP endpoint. A
production adapter must store the support token in the authenticated
server-side BFF session; the browser must not choose the effective tenant by a
header or body field. The data-plane request must use the tenant-local shadow
principal and its ordinary tenant database role. `athyperadmin` is prohibited.

## Activation gates for tenant-bound support

Tenant data access remains disabled until all of the following are delivered
and approved:

1. A durable support-session and append-only audit repository with migration,
   retention, revocation, and concurrency tests.
2. A canonical shadow-principal resolver proving active relationship,
   target-tenant membership, and fresh authorization epochs.
3. A server-only start/end workflow that validates ticket ownership, performs
   dedicated MFA, and installs/removes the token in the BFF session.
4. Trusted relay propagation of the verified support-session identifier;
   arbitrary target-tenant headers and bodies remain rejected.
5. A tenant-thread factory operating as the shadow principal, with no
   transcript discovery or Admin/support RLS bypass.
6. Per-read audit recording and explicit export permission. Support access
   alone never grants transcript export or visibility.
7. Security tests for expiry, revocation, actor/session/tenant/scope replay,
   signing-key rotation, cross-tenant isolation, stale epochs, and concurrent
   session termination.
8. Security, Product, Privacy, and SRE approval plus a staff-only soak.

## Read-only capability sequence

After the support-session activation gates pass, certify one capability at a
time:

1. explain one permission denial already in the selected scope;
2. find one principal within that explicit current scope;
3. explain one bounded, redacted policy-evaluation trace;
4. summarize approved tenant-health aggregates.

Each handler must verify the support session and fresh `atlas_support` MFA,
rebuild ordinary tenant-local authorization, use only its signed scope, and
record a content-free access audit. Cross-tenant principal search, transcript
search, automatic tools, and every mutation remain disabled.

## Break-glass

Break-glass is not part of this release. A future design requires a separate
emergency permission, fresh phishing-resistant MFA where available, a maximum
five-minute elevation, mandatory incident reference, immediate Security alert,
post-event review, and no automatic or mutating tools.

## Rollback

Set `ATLAS_AGENT_ADMIN_ENABLED=false` to remove the Admin surface. Set the
server/tenant Admin feature gate false to deny both catalog and run. Revoke any
future support session in its repository and clear it from the BFF session.
Rollback never requires schema deletion and does not affect Neon.
