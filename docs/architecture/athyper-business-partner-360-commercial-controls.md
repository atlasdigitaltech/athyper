# Business Partner 360 commercial controls (BS360-05)

Status: In progress

## Authority boundary

The 360 module is a read composition layer. `master.bank_account` and `master.bank_account_link` remain the bank authority; `document.business_partner_bank_verification` remains the verification authority; qualification, preference, block, and customer-credit control aggregates remain the decision authorities; `master.certification` and the attachment service remain the certificate and content authorities. The 360 module does not create, approve, revoke, lift, verify, or decide these records.

The ordinary banking projection explicitly selects `account_last4` and safe descriptive/status columns. The reveal repository selects only an opaque `protectedValueToken` from permitted metadata; the application role never selects the raw identifier column. Token resolution is reachable only through a POST command that requires a purpose, the bank-reveal permission, a successful record-visibility check, an installed protected-value resolver, and an audit writer. Its response is `private, no-store`; the client keeps the value only in component state and clears it after 60 seconds, close, unmount, or scope/navigation replacement.

Customer credit is presented only as **Credit review**. Its read projection deliberately excludes the legacy classification column and all Phase 1 contracts remain free of supplier-risk fields and hooks.

## Effective and scoped reads

Bank links require an explicit company. Supplier controls require an operating organization and narrow optional company rows without dropping organization-wide controls. Credit reviews require both organization and company. All four projections use half-open effective ranges (`from <= asOf`, `until > asOf`), retain revoked/expired decision state only when it is the effective authoritative row, and make explicit `asOf` reads historical and read-only.

Certification manifests expose only active, current, virus-scanned attachment metadata. The repository currently has an authenticated attachment-status authority but no download-url command. Consequently, expiring authorized download delivery and expired-link failure evidence remain a required follow-up in the owning attachment service; the 360 module must not manufacture storage URLs.

## Verification evidence

- Master-data contracts, service, gateway relay, and NEON client typechecks pass.
- The master-data suite passes 55 tests, including masked projection, classification-negative credit output, raw-column-negative SQL guards, purpose-bound reveal, 60-second expiry, and value-free audit evidence.
- The NEON Business Partner package passes 9 client tests and clears restricted reveal state without browser persistence.
- Disposable-database effective-boundary/cross-scope tests, browser cache/analytics scans, and attachment download expiry integration remain pending before the slice can exit.
