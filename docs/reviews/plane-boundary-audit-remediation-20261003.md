# Plane boundary audit: corrected assurance and local remediation

This follows the approved A.1–A.6 recommendations. Implementation and tests use
the current working tree, including existing Entity Framework work. The deployed
DEV database was inspected read-only; the ownership migration was applied only
to disposable PostgreSQL 16.15 databases. These results do not attest production
ingress, a deployed release, human publication approval, or complete isolation.

## A.1 — Server-validated plane selection

Use this disposition: **server-validated plane selection; deployment ingress and
enforcement configuration still require qualification.**

The BFF rejects caller-supplied `x-plane` and supplies its own plane. This does
not prove that all API requests originate at a BFF. API token verification runs
before the plane-local identity/admission resolver. The new IAM tests show that
missing local admission rejects requests in `off`, `shadow`, and `enforce` modes;
an admitted request with conflicting claims is rejected only in `enforce` mode.
`PlaneKey` prevents some programming mistakes; it is not a security boundary.

Qualify effective ingress rules and IAM enforcement configuration in each actual
deployment. Container port declarations or configuration defaults alone do not
establish that boundary.

## A.2 — Replace the bypass inventory and qualify RLS claims

The [deployed DEV catalog](../reports/plane-boundary-dev-catalog-20261002.json)
records exact signatures, owners, explicit `row_security=off`, PUBLIC execution,
search paths, role attributes, membership paths, tables and policy expressions.
Each database is observed within one repeatable-read, read-only transaction. The
report includes its observation time and ownership-contract SHA-256.

| Deployed DEV plane | Definers | Explicit `row_security=off` | Elevated owners | RLS enabled / forced |
| --- | ---: | ---: | ---: | ---: |
| Neon | 143 | 10 | 137 | 596 / 596 |
| Studio | 129 | 8 | 122 | 346 / 346 |
| Mesh | 121 | 14 | 115 | 311 / 311 |

These are per-database counts; shared signatures occur in several databases and
must not be added as a unique-function count. The audit's three-bypass and
252/~249 assertions are replaced by these observed inventories. Explicit bypass
is distinct from execution under a superuser or BYPASSRLS owner.

The checker requires ENABLE/FORCE RLS and policies on tenant-column table
parents. It also checks directly accessible partition children, including column
grants. Children accessed solely through protected parents need not have the
same flags. Tenant columns are a scope heuristic: this does not prove that every
table needing isolation was identified, that existing policies are correct, or
that all APIs deny cross-tenant access. `isolationQualified` remains false.

## A.3 — Explicit owners, grants and signature exceptions

The highest-priority implementation is the
[versioned ownership contract](../../server/db/contracts/security/security-definer-ownership.v1.json).
Ordinary definers now have fixed schema owners: NOLOGIN, NOSUPERUSER,
NOBYPASSRLS, NOINHERIT, without database/role creation or replication privileges.
They receive enumerated table DML, schema USAGE and exact function EXECUTE
grants. They receive neither schema CREATE nor table ownership or runtime-role
membership. Fixed owner policies preserve existing service guards through the
original session's role membership; tenant mutation policies enforce tenant
scope. Policies are checked against their full PostgreSQL expression, rather
than discarding parentheses or comparing only RLS flags.

Identity bootstrap has a separate non-bypass owner with tenant-read policies;
it cannot rely on a principal context that authentication has not resolved yet.
The concurrent Studio learning-ancestry functions remain RLS-bound and retain
their source hash, publication, independent approval and draft ancestry checks.
Their read dependencies are included without rewriting that authoring work.

Elevated exceptions are enumerated by exact signature and reason, rather than
function name. Ten limited NOLOGIN BYPASSRLS owners cover existing visibility,
policy-recursion and plane-wide worker operations. Six existing projection
signatures and Studio's recovery-discovery signature retain their dedicated
non-bypass owners. Three administrative signatures retain the DDL executor:

- `audit.ensure_monthly_partitions(date, integer)`
- `audit.install_schema_row_triggers(text)`
- `master.fn_refresh_mv_cpa()`

These are deliberate residual elevated boundaries, not proof of universal RLS
enforcement. The old checker's bypass owner **was required to have** superuser or
BYPASSRLS privileges. The replacement checks explicit privilege classes; the
DDL-owner setting applies only to the three signatures above.

The grants and hardening passes are now the final two entries of all three
foundation manifests. Unknown source signatures, unlisted bypass overloads and
changed bypass flags fail hardening. PUBLIC EXECUTE is revoked and explicit
search paths are required. The Atlas conversation-type helper additionally
checks the session tenant before returning existence information.

The [isolated catalog](../reports/plane-boundary-isolated-catalog-20261002.json)
passes the contract with these current source inventories:

| Isolated source plane | Definers | Explicit bypass | Elevated owners | RLS enabled / forced |
| --- | ---: | ---: | ---: | ---: |
| Neon | 143 | 10 | 27 | 596 / 596 |
| Studio | 117 | 8 | 24 | 348 / 348 |
| Mesh | 121 | 14 | 29 | 312 / 312 |

Studio DEV has 14 installed-only definer signatures, while current source adds
two learning-ancestry signatures absent from DEV. Reconcile that drift before
installing the ownership upgrade. Do not delete or accept the installed-only
functions merely to obtain matching counts.

The generated
[ownership migration](../../server/db/migrations/20261002_security_definer_ownership.sql)
is registered as an operational upgrade, outside automatic startup manifests.
It runs transactionally, rejects undeclared installed functions and passes
repeat application on the isolated source databases. Its deployed execution is
pending qualification; shipped migration bytes must remain frozen.

## A.4 — Provisioning exists; reconcile attributes and inspect membership

`init-postgres.sh` already creates runtime and worker login roles. Existing-role
reconciliation now also explicitly sets LOGIN, NOSUPERUSER, NOBYPASSRLS,
NOCREATEDB, NOCREATEROLE and NOREPLICATION instead of updating only passwords.
Foundation service memberships remain in their existing composition.

The observed DEV runtime and worker roles already have safe attributes. The
checker rejects direct and indirect access to privileged or definer-owner
roles, including a SET-role prefix followed by inherited object privileges and
ADMIN OPTION that can re-enable membership access. Owner roles cannot have
memberships. These checks follow PostgreSQL 16's distinct
[membership options](https://www.postgresql.org/docs/16/sql-grant.html) and
[role inheritance rules](https://www.postgresql.org/docs/16/role-membership.html).
They need to be rerun against every deployment, not inferred from provisioning
source or this DEV observation.

## A.5 — Locally implemented and tested

The ownership configuration uses
`WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED`. The coverage verifier requires
both a configuration declaration and a non-test composition consumer. All six
coverage-policy tests pass, including missing/unwired gate rejection. The
coverage inventory has been regenerated and its verifier passes. This closes
the local implementation finding; deployed gate behavior remains unverified.

## A.6 — Narrow the coupling finding and preserve shared Entity integration

Business Partner collaboration compatibility aliases now live in the owning
master-data service and are registered through host composition. Shared
collaboration code accepts a coordinate port and otherwise preserves exact
identities. Atlas brief eligibility and starter prompts use generic saved
record/manage context and published capabilities instead of Business Partner
literals.

The legacy related-presentation DTO catalogue still has three supported shapes.
Its fixed Business Partner owner binding has been removed: validation requires
an approved descriptor relationship with the matching target and list
cardinality. This is a presentation restriction, separate from metadata-driven
`EntityRelatedSection` lists. Those lists continue through the shared Entity
runtime with server-enforced parent scope and authorization. No entity-specific
page, route or provider stack was introduced.

## Verification and remaining qualification

Local checks pass:

- Eleven security tests, including a fresh complete three-plane foundation,
  repeat migration, unguarded definer read/write RLS, no-context denial, identity
  bootstrap, Country read, real snapshot capture/read/hash verification,
  foreign-tenant denial, Atlas visibility, and role escalation fixtures.
- IAM: 19 tests; collaboration: 68 tests; host section/Country authorization:
  16 tests; governance route: one test.
- Automatic briefs: ten tests; relationship runtime: four tests; metadata-based
  related-presentation ownership: two tests; coverage policies: six tests.
- Changed-package typechecks, security artifact consistency, migration layout,
  coverage verification, plane package boundaries and initialization shell syntax.

The broader Atlas answer suite has three failures concerning local evidence
links, keyboard focus and 403 error text. The same failures were reproduced
with the unchanged baseline component; they remain unresolved. This report
does not claim an aggregate green repository suite or a live browser/API flow.

The server boundary policy also fails on the unchanged
`server/db/scripts/provisioning/provision-hr-stage2-synthetic-policy.mts`: it
imports `master-data/src/hr-stage2-service.js` directly from DB code. That
unrelated provisioning violation is retained, not waived by the passing plane
package check.

Before deployed closure, reconcile Studio catalog drift, review each elevated
signature and its caller grants, install through the established operational
upgrade process, rerun the three-plane catalog check, and test authorized and
cross-tenant flows with the deployed runtime/worker logins. Qualify API ingress
and effective enforcement configuration separately. Preserve platform/tenant
publication ownership and independent human review throughout.

Read-only deployment check:

```sh
pnpm --filter @athyper/server-db db:verify:plane-boundary
```

This uses `ATHYPER_NEON_DATABASE_ADMIN_URL`,
`ATHYPER_PLATFORM_DATABASE_ADMIN_URL` and `ATHYPER_MESH_DATABASE_ADMIN_URL`.
`SECDEF_DDL_OWNER` names only the three retained administrative owners. For local
catalog inspection, the verifier also accepts `--docker-container=<name>` and
`--output=<path>`; `--inventory-only` records failures without returning a
qualification success. Reports contain catalog evidence, not credentials or
routine bodies.
