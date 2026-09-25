# Role-free partner section audit — 2026-09-24

The reported Network request failed because `network` applicability still required a supplier/customer role. The native service's expected 404 was then exposed as a generic 500 by the compiled-section adapter.

## Implemented

- Partner-owned Network/governance applicability is now global (role-independent), preserving the existing Network read permission, related-partner authorization and additional identity permission for governance rows.
- Mesh commercial relationship/schema checks remain unchanged. Admitting partner facts does not authorize a Mesh relationship or commercial transaction.
- The common compiled-section adapter maps native 403/404 responses to safe runtime errors instead of 500.
- Policy regression coverage checks role-free/no-company applicability across all existing partner-fact section definitions and all role lenses, preserves permission denial, and keeps commercial company/credit/transaction sections conditional.
- Service regression coverage checks role-free Network admission, independent permission denial and rejection of an inapplicable Mesh commercial coordinate.

## Live screenshot audit

The CATL Aster fixture has zero supplier rows, customer rows and operating-organization assignments. Reads were executed without organization/company query coordinates.

| Section | Result |
| --- | --- |
| Overview | 200 |
| Identity | 200 |
| Industries | 200 |
| Commodities | 200 |
| Contacts | 200 |
| Addresses | 200 |
| Identifiers Tax | 200 |
| Banking | 200 |
| Qualifications | 200 |
| Certificates | 200 |
| Governance & ownership (`network`) | 403 — separate scope authorization blocker, no longer 500 |

Qualification visibility is role-independent; individual commercial decisions retain their explicit role/company restrictions. Protected banking/identifier/tax read/reveal controls are unchanged.

## Pending authorization configuration

CATL admin's temporary `dev.bp2.catl.network` grant covers one organization and company only. The published `business_partner.network_read` operation binding also requires scoped coordinates. This does not establish tenant-level read authority for role-free Aster. Approval has been requested for a tenant-level partner Network read binding and CATL-admin-only read grant. No permissions, grants or company assignments were changed in this fix; no successful live Governance read is claimed yet.

Re-run: `node tooling/scripts/verification/verify-role-free-partner-sections.live.mjs`. It reports the remaining permission blocker explicitly rather than treating a 403 as a successful read.
