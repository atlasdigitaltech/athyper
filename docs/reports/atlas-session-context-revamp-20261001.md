# Atlas authenticated sessions and Entity context

The approved policy is that Atlas uses the current authenticated application
session. Login policy may require MFA, but the general Atlas-use permission does
not. Atlas still requires an explicit plane-local grant. Every underlying read,
protected-value disclosure or action retains its own current authorization and
verification requirements.

## Implementation

- Set `requiresMfa: false` for the exact `studio.ai.agent.use`,
  `neon.ai.agent.use` and `mesh.ai.agent.use` canonical permissions; regenerate
  authorization packs, definition hashes and seed ledger.
- Add `20260930_atlas_authenticated_session.sql` to all three forward manifests.
  The upgrade validates permission identity, updates through the existing
  suspend/change/publish lifecycle in one transaction, and preserves prior status.
  It does not add grants, change login policies, or alter operation permissions.
- Retain the shared Entity page publisher and server-bound tenant/plane context.
  Record admission rechecks the current published descriptor, Records access and
  scoped owner membership. Tenant-wide reference admission does not require
  optional company/organization coordinates. Scoped operations still require the
  owner-defined coordinates; browser or model input cannot supply authority.
- Separate unsupported Entity AI metadata, unavailable record access, and failed
  context services. Generic HTTP 403 errors no longer tell users to change their
  organization, company or role. Expired sessions have distinct sign-in guidance.
- Extend the existing Country browser qualifier to accept a plane and record
  label, detect unexpected Atlas step-up requests, and qualify a single read
  without requiring snapshot fixtures. The original five-capability journey
  remains available for records with the two controlled snapshots.

This is a shared policy/context correction. It does not replace IAM, the Records
owner services, the Entity UI, or the publication maker/checker workflow.

## Validation and DEV deployment

- 267 Atlas tests; three plane-specific policy tests using the real authorizer;
  two Records vertical integration tests; 31 answer/client/context UI tests pass.
- Atlas server, IAM, Atlas client and Atlas UI typechecks pass.
- Canonical catalog validation, deterministic seed-pack generation and migration
  layout checks pass.
- Migration rehearsed with rollback against all three DEV databases, then applied
  through the normal checksum/receipt runner. Before/after hashes confirm every
  other permission row and all role-permission grants were unchanged.
- Scoped shared runtime changes copied into the DEV source checkout, preserving
  unrelated work. API restarted only after confirming no active inference owner;
  health returned healthy.

Private migration evidence:
`~/.athyper/instances/dev/artifacts/country-atlas/20260930/session-policy/migration.json`.

## Open live qualification

The saved Neon, Studio and Mesh browser sessions return HTTP 401. Normal Neon and
Studio sign-in capture was requested without `-Elevated`. Neither the earlier
MFA-elevated browser evidence nor the unit tests proves this new live journey.
The Studio screenshot's underlying 403 cause remains unconfirmed until replayed
with a current session; do not report it as fixed based on the message change.

For the user's Afghanistan records, run the existing qualifier with
`ATHYPER_ATLAS_CAPABILITY=entity_read_record`,
`ATHYPER_ATLAS_RECORD_LABEL=Afghanistan`, and the corresponding plane and state:

- Neon record: `01a0d433-806b-7874-862d-49a9b955f6a1`.
- Studio record: `01a0d433-134c-7d54-a7fa-0a7b9a28baed`.

Verify an actual successful authorized tool call, a source citation for that
exact record, the rendered answer, and no Atlas step-up request. Do not relax
record or field authorization to make either journey pass.

## Follow-up: thread creation rejected by CSRF

The user's normal browser now reports successful Neon admission, but thread
creation fails at the BFF with `RELAY_CSRF_INVALID`. This precedes Entity context
resolution and is not an Atlas grant failure. The user also tried a Country
Manage count question; that is separate from the record-only Country capability
currently published and must not be claimed as qualified by fixing thread creation.

Atlas had a private cookie reader that preferred production `__Host-` cookies
regardless of the running authentication mode. The DEV source startup wrapper
sets `NODE_ENV=development`, despite the container's original production variable.
The shared Entity client already selected the matching cookie namespace. Both
clients now use one API-client helper, with no cross-namespace fallback. Session
inspection repairs missing/stale CSRF cookies only after validating the existing
session. Invalid unsafe requests remain rejected and are never automatically
retried. CSRF failures now render session-security guidance, not permission advice.

109 targeted transport, relay, cookie, UI and authentication tests pass, together
with Atlas client/UI and authentication-BFF typechecks. Shared changes are copied
to DEV source mode. The user's next browser retry remains necessary to establish
end-to-end success; the captured-cookie contents were not inspected or requested.
