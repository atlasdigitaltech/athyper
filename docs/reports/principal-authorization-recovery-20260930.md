# Principal runtime authorization recovery

Principal, Principal Profile and Principal Notification Preference remained active
at release 1 in Studio, Neon and Mesh. Principal's Neon activation was
2026-09-29 06:16:30 UTC, source release
`d450f7e8-2d71-4abd-8b1f-82f6ab8148bc`. The reported 500 was
`ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE`, not a missing publication.

The shared published-record authorizer admitted Country's read-only tenant profile
but rejected every descriptor with `ownerAccess`. The owner adapter's separate
admin permission also collided with IAM's entity-operation permission binding.

The framework now qualifies the published owner profile only when the host installs
transactional owner enforcement. Supported operations are list/read and explicitly
published create/patch. Qualification checks immutable ownership, tenant storage,
write fields, runtime handlers and optimistic versions. The existing activation
guard consumes this same qualification and continues to reject unsupported profiles.

Admin capability checks use their own tenant grant, separately from the entity
operation grant. The high-risk admin capability has a dedicated policy evaluator restricted to
the current published owner descriptor, matching plane/tenant/release and installed
operation. Current IAM, explicit denies, entitlements and MFA still apply; no
separation-of-duties evidence is fabricated.
Record-existence checks prepare owner scope before reading. Non-admin reads add a
mandatory owner predicate to list, count and record SQL as well as using RLS. This
also excludes records exposed through unrelated permissive database policies.
Published child relationships continue to derive locked scope from an authorized
parent; no entity-specific route or provider was added.

Country's published metadata reader, generic record provider, shared authorization,
`/app/entity/:entityCode` route and shared list/detail workspace remain the reference
path. No entity definitions, release heads, permissions, grants or schema were changed.

Verification:

- Records suite: 394 passed, 4 skipped.
- Platform host suite: 829 passed, 26 skipped.
- Records and host TypeScript checks passed.
- Seventeen new tests cover the actual three Principal products on all planes,
  activation rejection without the owner adapter, unsupported profiles, tenant and
  identity mismatch, existing-record denial, field writes, stale publication pins,
  admin revocation, real IAM operation bindings, high-risk owner policy admission,
  preserved MFA/SoD/deny gates and mandatory owner SQL predicates.
- Existing DEV rollback database checks passed on all three planes for self-read,
  self-create, cross-owner denial, admin edit, stale-version denial, admin marker
  reset, cross-tenant denial and new-user defaults. All fixture writes rolled back.

DEV runtime deployment and final authenticated browser results are recorded below.

## DEV deployment

Deployed runtime source snapshot:
`86df13c8434a82f0666806edd93a6664341d53acc82a8dae4b68946689e2fcc7`.
API, worker and scheduler use image
`sha256:0ed92cade4252aa69b6772cb3f433cdd0326d68e548f9630c94d44f69f57ed1a`.
The image passed an isolated API health check before replacement. Existing frontend
images were retained. Snapshot, original image IDs and rollback Compose configuration
are private under `~/.athyper/instances/dev/workspace/principal-authorization-20260930`.
Other checkout work was preserved; the build uses a fixed snapshot.

Authenticated Neon `catl.admin` verification:

| Check | Result |
| --- | --- |
| Principal list descriptor / list | 200 / 200; all six current-tenant records |
| Principal detail descriptor / record | 200 / 200 |
| Admin read of another principal in the same tenant | 200 |
| Profile and Notification Preference descriptors / lists | 200 |
| Both parent-scoped child descriptors / lists | 200 |
| Search and exact count | 200 |
| Principal record in another tenant | 403 |
| Child list under a parent in another tenant | 403 |
| Child list with the wrong published relationship | 403 |
| Country list descriptor | 200 |

Principal's list, detail, Profile and Notifications render through the normal Entity
page. Profile creation form was opened and cancelled. Browser checks had no JavaScript
errors or failed relay requests. Profile/preferences have no rows for the inspected
principal; no live user profile or notification preference was created or edited.
Write behavior and isolation were checked through unit tests and rollback database
probes, rather than claiming a completed live browser save. Ordinary Studio/Mesh
saved sessions were expired; their live authenticated UI was not reverified.
