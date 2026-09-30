# Master-data canonical authorization

Local activation status: published, deployed and authenticated acceptance passed
for the selected CirrusAtlantic actors. Evidence:
`master-data-launch/local-master-authority-publication-20260907.json` and
`master-data-launch/local-master-authority-acceptance-20260907.json`.
No QA, staging or production qualification is implied.

The complete six-route matrix is now qualified locally, including direct PATCH
verification success and a same-tenant ungranted user. See
[master-data-six-route-acceptance.md](master-data-six-route-acceptance.md) for the
65-check report and the distinction between provider fixtures and Mailpit proof.

## Permission contract

All codes below have prefix `neon.relationship.business_partner.`.

| Route | Published root operation | Additional sensitive capabilities |
| --- | --- | --- |
| POST owner contacts | `update` | `write_contact_sensitive` |
| POST contact deactivate | `update` | `write_contact_sensitive` |
| POST owner addresses | `update` | `write_address_sensitive` |
| POST address-link deactivate | `update` | `write_address_sensitive` |
| GET owner profile | `read` | `read_contact_sensitive`, `read_address_sensitive` |

The four sensitive capabilities are published in development Neon at medium risk,
without MFA/SoD requirements, sharing or delegation, using the published root-read
module association. These are local synthetic-pilot choices. Their names alone
confer no authority; missing grants deny. Staging and production need separate
catalog review and release.

A tenant-specific CirrusAtlantic descriptor adds the missing published update
binding using the existing stage/verify/activate functions. The global descriptor
and other tenants were not republished. This uses the existing development-only
publication protocol; it is not production signature qualification.

Root checks require a matching active metadata descriptor with the expected
Neon business-partner storage and a matching IAM operation binding in the verified
snapshot. IAM receives both entityCode and operationKey for the root operation.
Sensitive checks receive the same trusted record and organization, without
entity-operation coordinates. IAM retains explicit-deny precedence, scoped grant
containment, entitlement, MFA, SoD and policy enforcement.

## Stored authority and transaction boundary

`createMasterDataAuthority` resolves owner coordinates, contact IDs and address-link
IDs using only the verified tenant/plane and tenant-scoped database records.
Only Neon business-partner owners are supported by this pilot implementation;
other planes or owner types fail closed. The active owner registry must have the
expected tenant-scoped business-partner storage binding.

Every request requires exactly one distinct currently active/effective operating
organization. Duplicate assignments to the same organization are deduplicated;
missing, expired, inactive or ambiguous scope denies. Historical profile dates
select historical data only; authorization uses current database authority time.

The resolver runs inside the same transaction as reads/mutations, audit and outbox.
The runtime has SELECT-only registry access; a SECURITY DEFINER function with a
fixed search path takes only the registry lock. PUBLIC execution is revoked and
execution is granted to the application role. No registry write privilege was
granted. The provisioning SQL must be installed before deploying this host.
Contact/address-link lookup locks its row. SHARE locks hold the owner registry,
business partners, organizations and assignments stable, including against new
assignment inserts. This is conservative table-level locking for a low-volume
pilot. Wider deployment needs throughput qualification; it can delay unrelated
writes to those tables. It does not claim to lock global IAM grant/release changes:
IAM continues to use the verified request snapshot and existing epoch rules.

The host installs this authority alongside the existing verification authority.
Alternative service compositions must supply `authorizeAccess`; otherwise these
five operations return `MASTER_DATA_AUTHORITY_UNAVAILABLE` (503). Scope and IAM
denials return 403; foreign-tenant target lookups return 404 without PII.

## Automated evidence

- 240 service/unit tests pass, including transaction-bound access guards and denied
  access before repository mutation/profile reads.
- 21 PostgreSQL tests pass in a disposable database: five route authority mappings,
  cross-tenant targets, same-tenant scope denial, expired assignments, historical
  reads, missing resolver/bindings, and concurrent scope-writer blocking, plus
  the existing repository/verification/rollback tests.
- Host tests exercise the real IAM evaluator with scoped snapshot evidence and
  all six registered HTTP routes. SQL is simulated in host tests; PostgreSQL SQL
  correctness is covered by the separate database suite.
- Service and host TypeScript checks pass.

Live browser acceptance also passed for the five sensitive routes. The existing
verification workflow succeeded via Mailpit and recorded audit/outbox evidence;
PATCH verification rejected replay, cross-contact evidence and foreign-tenant
access. Browser sessions use development SSO, not password/MFA enrollment.
For the two primary contact/address pairs there are ten master-data audit events
and ten matching outbox events, one per successful mutation. Additional synthetic
contacts used for negative cases are retained as test evidence.

## Local roles and scopes

| Actor | Sensitive capabilities | Root read/update | Verification |
| --- | --- | --- | --- |
| catl.admin | Organization A, exact | Organization A, subtree | Existing organization A grant |
| catl.owner | Synthetic organization B, exact | Organization B, subtree | Added B grant; existing A verification grant retained |
| athyper.admin / athyper.owner | No new grants | No new grants | No new grants |

Root scopes use their existing catalog-compatible subtree mode. Sensitive scopes
are exact and live in a separate role, so a root subtree grant alone cannot widen
sensitive access. The existing verifier-only role remains separate. Dedicated
one-user groups apply the new scoped roles. Normal catalog, role publication and
scope validation triggers remain enabled.

Organization A is `a478f9c0-8226-5d22-9599-b8fb27a45180` (existing CATL operations).
Organization B is `24267903-6196-5846-8322-43a8e35c9630` (synthetic procurement
organization), with a synthetic partner and supplier role. Cross-organization
checks rejected all five sensitive operations for both selected actors. Athyper
users were rejected on all six original routes plus challenge creation.

## Reapply, deploy and test

```bash
node tooling/scripts/verification/setup-local-master-data-authority.mjs --apply
node ~/.athyper/instances/dev/deployments/local-master-authority-20260907/deploy.mjs
LD_LIBRARY_PATH=/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu \
  node tooling/scripts/verification/verify-local-master-data-workflow.mjs
```

Omit `--apply` to inspect the local publication plan. The installer is idempotent
and local-only; it installs capabilities, scopes, dedicated roles/groups, synthetic
organization-B prerequisites, the mutation audit contract, the restricted registry
lock function and the tenant-specific descriptor. It fails on conflicting
publication hashes rather than silently replacing an existing release.

The deployment preserves capture/challenge overlays and the parameter-runtime flag,
and adds `LOCAL_MASTER_DATA_PILOT_ENABLED=true` only to local Neon. This admits the
six browser relay paths while retaining session, CSRF and server IAM checks.
Images: `athyper/runtime-server:local-master-authority-20260907-r2` and
`athyper/neon-web:local-master-authority-20260907`. Full server/Neon builds passed;
r2 adds the compiled, PostgreSQL-tested registry lock call. All four containers
were healthy after activation.

`rollback.mjs` in that deployment directory restores the previous verification
images. It retains catalog definitions, scoped grants, descriptor publication,
functions and synthetic evidence. To withdraw authority, suspend the new local
master-data groups through the normal IAM process; do not delete publication
history or disable validation triggers.

The acceptance harness waits up to 90 seconds for the normal minute-based delivery
sweep. `LOCAL_MASTER_DATA_RESUME=true` resumes an interrupted run's existing
fixtures/challenges; it does not reset tokens, verification state or rate counters.
After deactivation has begun, add `LOCAL_MASTER_DATA_FINALIZE=true` to finish
remaining closes and audit/outbox assertions without duplicate mutations. Use
these flags only with the saved `/tmp` acceptance report for that run.

Address-link validity is date-based with an exclusive end strictly after its start.
Acceptance creates synthetic links effective yesterday. A link created today
cannot be closed with today's date; same-day cancellation semantics remain a
separate API design question. Earlier synthetic test attempts remain available
for review and were not used to claim a completed acceptance run.

QA/staging/production still require their own launch scope, catalog assurance
review, deployment schema/privilege qualification, key trust, delivery provider,
operational tests and release approval.
