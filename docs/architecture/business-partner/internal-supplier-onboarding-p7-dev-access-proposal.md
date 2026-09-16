# P7 fresh activation-notice qualification access

Status: explicitly authorized by the user, applied through canonical authorization management, and revoked after successful P7 qualification. Receipt: `governance/policy/reports/supplier-communications-dev-access.dev.json`. All three assignments are revoked; prior P6 assignments remain revoked.

P7 can qualify submission, task, return and decision notices under current permissions. A fresh activation-confirmation event must come from the qualification and activation owners. Replaying a retained P6 artifact in a database test does not prove a fresh live activation notice.

For DEV NEON tenant `44444444-4444-4444-8444-444444444444`, propose the previously supported scopes:

| Principal | Permission | Scope |
| --- | --- | --- |
| catl.admin | `neon.supplier.qualification.admin` | CirrusAtlantic Operations (`a478f9c0-8226-5d22-9599-b8fb27a45180`), subtree |
| catl.owner | `neon.supplier.qualification.admin` | Same organization, subtree |
| catl.admin | `neon.relationship.business_partner.activate` | Same organization, subtree |
| catl.admin | `neon.relationship.bp_target.qualification_company` | Company catl (`793b6cb3-3c61-57c0-9562-2cbc288bd4cf`), exact |

Create dedicated P7 groups/roles through canonical authorization management. Assignments expire after 24 hours and are revoked after qualification. Organization/subtree permissions cover all company scopes under the organization, beyond the synthetic cases. No existing role or permission definition changes.

Use these grants only to complete the three fresh P7 synthetic supplier journeys through the existing qualification, company, activation and document APIs, then verify one eligible activation notice in the inbox and Mailpit. Maker-checker, MFA, readiness and exact document bindings remain enforced. No qualification, activation or closure outcomes are written directly.

## Completed qualification

Basic, Standard and Enhanced were qualified and activated through their owning APIs. Each activation confirmation was rendered and its PDF hash checked. Exactly one inbox notice and one captured email per activation were verified against the document pins and recipient. The same notice/link checks passed after revocation. Evidence: `governance/policy/reports/supplier-communications-activation-notices.dev.json`.
