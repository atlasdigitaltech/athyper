# CATL Inbox 403 — local repair

## Root cause

The authenticated relay reached the workflow service successfully. `listInbox` rejected the request with `FORBIDDEN: Workflow inbox is not permitted` because the CATL accounts had no effective `workflow.work_item.read` grant. The permission was published and required neither MFA nor separation-of-duties elevation. Session refresh could not manufacture the missing grant.

The local role-permission catalog contained this permission for Athyper roles, but none for the CirrusAtlantic tenant. Existing CATL entity-case reviewer grants did not include workflow Inbox read access. This was a local provisioning gap, not a proxy, URL encoding, notification-delivery or browser-layout failure.

## Applied correction

`tooling/scripts/verification/repair-catl-inbox-access.dev.mjs` creates a dedicated CATL local reader role/group, containing only `workflow.work_item.read`, assigned to `catl.admin` and `catl.owner` at the CATL tenant scope. The script defaults to a rollback rehearsal, checks the local database and exact accounts, and refuses to duplicate an existing repair. The rehearsal passed before `--apply` committed the repair.

The workflow service's permission check remains intact. Repository filtering still restricts Inbox items to the principal's assignments, team membership or eligibility candidacy. No create/claim/complete/cancel permission, notification operator permission, or global role was granted.

The full-page Activity center now describes HTTP 403 as an access requirement instead of offering a misleading retry for a transient load error.

## Local verification

Using the same stored authenticated sessions and the exact requested URL:

- `catl.admin`: HTTP 200, zero assigned items.
- `catl.owner`: HTTP 200, six eligible items.

The underlying API request is `GET /api/relay/workflow/inbox?limit=50&status=open%2Cclaimed%2Cin_progress%2Cblocked`.
