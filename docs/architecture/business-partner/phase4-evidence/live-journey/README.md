# Authorized permission fix and label journey

## Completed

- Added dedicated Studio role/group `dev.bp.deployment_observers` with only `publication.deployment.view`, exact CirrusAtlantic tenant scope.
- Assigned to `catl.admin` and `catl.owner`; existing roles and grants were preserved.
- Rehearsed the SQL transaction with rollback, then committed it once. Applied SQL: `tooling/scripts/verification/grant-studio-bp-deployment-view.dev.sql`.
- Refreshed both saved Studio sessions through the normal refresh endpoint. Both activation reads now return HTTP 200. The selected older release reports `not_active`, rather than an authorization error.
- Saved the requested small label change on the existing working graph: `intake_partner / requested_role`, placement `dd030024-3640-5185-874f-445546fc0027`, `Requested role` → `Requested business role`.
- Draft `be767e01-f36d-434f-91f3-67bff689a367` moved from revision 59 to revision 60.
- Reread confirmed all configuration was preserved apart from that label. The storage layer reordered the otherwise identical three test definitions; the initial strict array-order comparison detected this and an identity/key comparison verified it.
- Revision 60 validation has zero issues, and all three contract tests pass. Contract hash: `ac740ab3451f4ebffcc53d22c8a31438c33238f9291e393100d4761076b5f5e7`.
- Save reports an active development preview. This is not published-release evidence.

## Remaining blocker

Submission as `catl.admin` returned HTTP 403 `missing_permission`. Inspection found the older `metadata.entity.submit` / `metadata.entity.publish` assignments for the author and `metadata.entity.review` assignments for the reviewer are expired or revoked. They were not reactivated.

Requested explicit authorization for fresh seven-day, tenant-scoped grants preserving the author/reviewer separation. No approval or publication was performed. Existing published releases remain intact.

Publication will include the existing working configuration plus this single label change; that working baseline differs from published release 2. Review the complete graph before independent approval.

## Evidence

- `permission-check.json`: both refreshed Studio sessions receive activation HTTP 200.
- `save.json`: actual save response, revision 60 and development-preview receipt.
- `review.json`: exact label and normalized preservation check.
- `saved-validate.json`, `saved-test.json`: actual server results.
- `submission.json`: failed submission, deliberately preserved.
- `saved-label.png`: actual Studio stored-label display.

## Follow-up: seven-day workflow grants applied

The user explicitly authorized fresh grants. Applied `grant-studio-bp-workflow-seven-days.dev.sql` after a successful rollback rehearsal:

- `catl.admin`: `metadata.entity.submit`, `metadata.entity.publish`.
- `catl.owner`: `metadata.entity.review`.
- Exact CirrusAtlantic tenant scope, Studio only.
- Starts 2026-09-15 22:59:00 UTC; expires 2026-09-22 22:59:00 UTC (23 September 2026, 06:59 Malaysia time).
- Both membership and scoped role assignment have the same seven-day validity window. Old expired/revoked grants remain untouched; MFA and separation-of-duties catalog requirements were preserved.
- Both saved Studio sessions refreshed successfully. See `workflow-grants.txt`.

Submission was retried for revision 60. It now returns `403 mfa_required` instead of `missing_permission`. The draft remains unsubmitted; no approval/publication was performed. The earlier permission denial is retained in `submission-before-grants.json`.

Added a CSRF-bound **Verify with MFA** form to the native publication panel using the existing OIDC step-up endpoint. It preserves the selected draft in the return URL and prevents navigation while edits are unsaved. The normal interactive sign-in must be completed by the account holder; refreshing tokens alone does not satisfy the API's MFA check.

The MFA entry is also available when source inspection reads are denied, so signing in does not depend on loading the protected draft first.

Verification: fourteen publication/workbench tests passed, including CSRF-bound step-up and dirty-edit protection. Product and Studio typechecks passed. Browser check confirmed the MFA button and draft return context without attempting authentication.
