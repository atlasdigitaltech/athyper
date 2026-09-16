# P6 DEV qualification access proposal

Status: revised organization/subtree scope explicitly authorized by the user, applied through canonical authorization management commands, and revoked after qualification. Receipt: `governance/policy/reports/supplier-onboarding-dev-access.dev.json`.

The refreshed sessions successfully completed reviewer voting and company-case materialization for Basic, Standard and Enhanced. Qualification creation now returns `403 Permission denied: neon.supplier.qualification.admin`. Read-only inspection found no role assignments for that permission, the company qualification creation permission, or supplier activation.

Create dedicated P6 qualification roles/groups with only the following membership and grants:

| Principal | Permission grants |
| --- | --- |
| `catl.admin` (`cca94907-7519-5871-8e3c-6b11aa545c93`) | `neon.supplier.qualification.admin`, `neon.relationship.bp_target.qualification_company`, `neon.relationship.business_partner.activate` |
| `catl.owner` (`645b6a55-3355-526a-9643-3900425bde47`) | `neon.supplier.qualification.admin` |

All assignments are limited to DEV NEON tenant `44444444-4444-4444-8444-444444444444`, exact company scope `catl`, target `793b6cb3-3c61-57c0-9562-2cbc288bd4cf`, scope target `01a0953c-dfa1-7cf4-af43-5da91bed7d29`. Assignments expire 24 hours after application and are revoked after qualification. These permissions affect this company scope, not just the three synthetic suppliers. Existing roles and memberships remain intact.

The administrator creates qualification records and applies independently approved activation cases. The owner decides qualification records created by the administrator. Existing maker-checker, MFA, case approval, readiness, version and document gates remain enforced. This proposal grants permission to execute the owning commands; it does not write qualification, activation or closure outcomes directly.

After authorization, use the existing authorization configuration commands/publication path, record the created assignment identifiers and expiry, and qualify the three profile journeys through their owning APIs. If this exact scope cannot be represented by the existing authorization owner, stop and report the mismatch before broadening access.

## Scope preflight and proposed revision

`authz.fn_internal_permission_is_assignable_at_scope` returned false for company-exact assignment of `neon.supplier.qualification.admin` and `neon.relationship.business_partner.activate`. Their existing published compatibility supports operating-organization/subtree assignments. No grants were applied.

The revised proposal keeps the same two principals, permissions, 24-hour expiry and cleanup, but assigns those two permissions at operating organization `a478f9c0-8226-5d22-9599-b8fb27a45180` with subtree propagation. This covers **all company scopes under that organization**, beyond company `catl`. The separate `neon.relationship.bp_target.qualification_company` grant for `catl.admin` remains company-exact. No permission definitions or enforcement rules change.
