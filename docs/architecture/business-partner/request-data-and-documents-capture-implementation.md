# Request data and supporting-document capture

Implementation status: source changes, local regression checks and development preview activation are complete. Runtime publication and end-to-end persistence verification remain pending.

## Implemented

The internal supplier request form has an optional repeatable Bank accounts section. The five existing full-profile sections (registration identifiers, tax registrations, classifications, governance and certifications) and each bank entry have repeatable Supporting documents collections. Section order, field labels, document types, attachment messages, reference sources, collection limits and required document-type counts are authored through Meta Entity.

Bank capture includes account holder, bank country/name, identifier type, protected account identifier, BIC, conditional local routing code, branch, currency, intended use and notes. Company scope is inherited from the request. “Use registered name” copies the current name on demand. Country and currency choices use reference sources. IBAN capture validates country, structure and checksum; local account identifiers retain leading zeros. This prototype explicitly selects the identifier type; it does not automatically infer a domestic payment scheme or provide a bank-directory search.

Uploads use the existing attachment stage, storage upload, finalize and status APIs. Only an active upload becomes a selectable attached file. Users can reuse files already added to the current request. This is not a tenant-wide document-library search. File status/read access continues through the existing attachment API.

Bank values enter the protected store before being included in the request. Request snapshots contain tokens, hashes and masked presentation. Saved masked values reuse their original token; changing bank country or identifier type requires re-entry. Reopened supplier drafts use the metadata form rather than the former identity-only editor.

Supporting-document associations serialize separately from business rows, identified by section and stable entry key. The repository checks active, scanned, unexpired and accessible attachment versions and pins them to the request entry using existing attachment links. Prior pinned links remain as historical evidence; the current snapshot determines current entry associations. No attachment file is deleted when an entry is removed.

Explicit draft capture permits incomplete business fields and document entries. It still validates supplied values, bounded collection shapes, document targets and protected-data boundaries. A supplied bank identifier needs its country/type before protected capture. Validation and submission recheck complete metadata requirements. The existing internal request authorization, version checks and idempotency remain in use.

No new bank-account, verification, review, acceptance or payment command is called. No schema migration or operational bank-record creation is included. The existing customer-specific intake and collaboration flows are unchanged.

## Validation

Focused suites passed: 66 master-data service/profile/capture tests, 10 frontend serialization/upload/submission tests, 5 metadata authoring/draft tests and 5 protected-value tests (86 total). Tests cover incomplete drafts, submission rejection, bank masking, IBAN rejection, stable document targets, required document types, inaccessible field shapes and active-upload admission. Typechecks cover the product, master-data service, NEON plane and platform host.

## Activation and remaining blocker

After refreshed Studio MFA, the request-capture metadata activated at development revision 40 on 2026-09-13. Activation also exposed an obsolete certification attachment field left without a binding; the transform now removes that obsolete field without changing authorization requirements. The activation receipt is `governance/policy/reports/business-partner-full-profile-activation.dev.json`.

The NEON browser probe passed for all six document sections, bank controls and stable document associations in the intercepted incomplete-draft payload. It blocked mutations and created zero live cases; it does not establish upload or persistence success. The receipt is `governance/policy/reports/business-partner-request-capture-browser.dev.json`.

A separate live database check still found zero published `master.business_partner` entity contracts for the development tenant in NEON. The earlier `BUSINESS_PARTNER_CASE_CONTRACT_UNAVAILABLE` condition therefore still blocks case creation. Development form preview activation alone does not resolve that runtime-publication requirement. End-to-end create, reopen and submit verification must follow the supported runtime publication/activation process; no live case was submitted by this implementation.

Save draft follow-up: development revision 41 adds save feedback and supplied-value draft validation. See [Save draft implementation](save-draft-implementation.md) for retry, clearing, runtime-schema and publication status.
