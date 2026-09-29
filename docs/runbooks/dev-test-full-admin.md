# DEV Test Full Admin access

Applied and verified on 2026-09-26. This is operational test access, not a
production role template and not proof that Country has been published.

## Assignment

Each of Studio, Neon and Mesh has a separate tenant-local group with code
`test.full_admin`, name **Test Full Admin Group**, in these two tenants:

| Tenant | Members |
| --- | --- |
| `athyper` | `athyper.admin`, `athyper.owner` |
| `cirrusatlantic` | `catl.admin`, `catl.owner` |

The primary role has code `test.full_admin`, name **Test Full Admin Role**.
Supporting roles use `test.full_admin.<scope_kind>.<propagation>` because a single
role containing incompatible scope permissions cannot be assigned safely.
All group memberships and role assignments have `effective_until = NULL`.
No QA, staging or production containers/databases were targeted.

Studio also gained a principal/identity projection and a non-expiring standard
plane membership for the existing Keycloak subject of `athyper.owner`. Keycloak
now assigns that user `STUDIO_USER` and `studio-web/AUTHORIZED`. Passwords, MFA,
other realm/client roles and organization memberships were not changed.

## Effective limits

These are explicit **currently published permission snapshots**, not wildcards.
Assignments cover existing active, compatible scope targets in the user's own
tenant. MFA, separation-of-duties checks, deny rules, record ownership and
application qualification continue to apply. New permissions/scopes require
explicit reconciliation; the script rejects permission-snapshot drift.

There are supporting roles without assignments because no active scope targets
of those kinds exist for these tenants:

| Plane | Unassigned scope kinds |
| --- | --- |
| Studio | company code, legal entity, module, operating organization, resource, workspace |
| Neon | company code, network relationship, resource |
| Mesh | company code, legal entity, network relationship, operating organization, resource |

Those are not effective grants. No synthetic `all` scope or authorization bypass
was introduced to conceal missing scope registrations. Future scope provisioning
must resolve real tenant-owned/published targets before assigning these roles.
Permissions missing from the live catalog (including unpublished Country
capabilities) are not created by this operation.

## Verification receipt

| Plane | Groups | Roles | Memberships | Scoped group-role assignments | Distinct permissions at assigned scopes per member |
| --- | ---: | ---: | ---: | ---: | ---: |
| Studio | 2 | 14 | 4 | 2 | 49 |
| Neon | 2 | 16 | 4 | 60 | 177 |
| Mesh | 2 | 14 | 4 | 40 | 51 |

Subsequent Country preparation on 2026-09-26 installed
`common.platform.reference.view` and added it to the two tenant-level
`test.full_admin` roles in each plane. Distinct permission counts consequently
increase to **50 / 178 / 52** for Studio / Neon / Mesh respectively. Memberships,
scope-assignment counts and expiry settings are unchanged. This was an explicit
single-permission reconciliation, not automatic future-permission expansion.

- All 12 memberships are active, in the expected tenant, and non-expiring.
- All 102 scoped assignments are non-expiring; zero incompatible permission/scope pairs.
- Studio owner subject matched the existing live Neon binding before provisioning.
- Keycloak Studio realm/client admission roles verified after the write.
- Four operational-script tests passed.
- Real PostgreSQL rollback checks passed on all three planes before mutation.
- Post-apply rollback/idempotency checks passed with unchanged counts.
- Normal audit and authorization-invalidation triggers remained enabled.
- Browser login and per-endpoint business authorization were not tested.

The counts above describe this provisioning source only, not users' pre-existing
access. They do not mean every application endpoint is operational or accessible.
Sign out and sign back in to refresh identity claims, particularly for
`athyper.owner` in Studio.

## Reproduce / reconcile

### Refresh existing roles after publishing new permissions

Use the additive reconciliation command (does not provision identities, change
group membership, assign new scopes or modify expiry):

```sh
node server/db/scripts/operations/authorization/refresh-dev-test-admin.mjs --check
node server/db/scripts/operations/authorization/refresh-dev-test-admin.mjs --confirm=DEV-REFRESH-TEST-ADMIN-PERMISSIONS
```

On 2026-09-27 this added the nine published `common.collaboration.comment.*`
and `common.collaboration.attachment.*` permissions to both tenant-level roles
in Studio, Neon and Mesh: 18 role-permission rows per plane, 54 total.
`common.platform.reference.view` was already present. All three rollback
checks and post-commit idempotency checks passed; six operational tests passed.
No newly published permission is absent from the managed role sets. Permissions
on roles with no eligible scope assignment remain ineffective at that scope.

The four existing members retain non-expiring, tenant-local memberships.
Distinct permission counts across their active assigned test roles are now
62 (Studio), 187 (Neon), 61 (Mesh), not an endpoint-level access guarantee.
See [fresh receipt](../reports/dev-test-admin-permission-refresh-20260927.json).
MFA, ownership, deny rules and separation of duties remain enforced. The Country
shell route-admission gap is separate and is not repaired by these grants.

New scope kinds without supporting roles require separate provisioning review;
this refresh command deliberately does not create roles or assignments. Existing
grants are never deleted automatically, including retired catalog entries.

### Initial provisioning

From the repository root:

```sh
node --test server/db/scripts/operations/authorization/setup-dev-test-admin.test.mjs
node server/db/scripts/operations/authorization/setup-dev-test-admin.mjs --check
node server/db/scripts/operations/authorization/setup-dev-test-admin.mjs --confirm=DEV-TEST-FULL-ADMIN-NO-EXPIRY
```

`--check` exercises provisioning in rollback transactions, including immediate
evaluation of deferred constraints. Apply first repeats these checks on every
plane, then updates identity admission and commits each plane independently.
It is not a distributed transaction; failure after a commit must be reported
and reconciled, not described as an all-plane rollback.

Source marker: `dev:test-full-admin:v1`. The script checks the running Docker
Compose project is exactly `athyper-dev`, uses only the named DEV DB and IAM
containers, and does not expose identity credentials in output.

## Revoke later

Use normal tenant-local authorization management to revoke the four group
memberships or the relevant group-role assignments (filter by this source marker
and group code). Keep their audit history; do not delete authority rows. Perform
this in each plane. Revocation removes only this test access, not pre-existing
roles/groups. If removing Studio admission for `athyper.owner` is also desired,
review that separately before revoking its plane membership and the two newly
added Keycloak role mappings.

This document is a local operational receipt, not tamper-evident audit storage.

## Activity permissions — 2026-09-28

Following Country release 9, refreshed the existing DEV full-admin roles at the user's request. Added the three canonical Activity permissions (audit query, snapshot read, snapshot capture) for both managed tenants on Studio, Neon and Mesh. Reconciliation reports no remaining published-permission gaps. Active member/role chains were verified for all four managed test accounts. See [Activity access verification](../reports/activity-full-admin-access-20260928.json).
