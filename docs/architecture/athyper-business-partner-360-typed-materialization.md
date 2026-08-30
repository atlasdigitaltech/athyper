# Business Partner 360 typed materialization closure

**Slice:** BS360-01  
**Status:** Technical closure evidence passed; accountable approval pending  
**Prepared:** 2026-08-30

## Inventory and decision

The request foundation previously stored `proposed_payload`, evidence manifests, and validation findings, but had no typed repeating identity children. Authoritative target relations already exist for addresses and links, named contacts and channels, Business Partner identifiers, tax registrations, commodity/industry classifications, and certifications. BS360-01 reuses those targets rather than creating competing master authorities.

New requests use `extension_mode=typed_v1` and stage repeating values in seven tenant-bound request-child relations. Rows created before this change retain `extension_mode=legacy_untyped`; their JSON is not parsed, backfilled, or silently reinterpreted. A later governed migration may backfill a legacy request only from independently verified source evidence.

## Security and application contract

- Address, contact, identifier, tax, classification, and certification families are rejected from general commercial `proposed_payload` at both service and database write boundaries.
- Tax, national-ID, passport, and equivalent restricted identifiers accept only opaque protected-data tokens plus hash and masked presentation. Raw values do not enter request JSON, events, audit metadata, errors, or materialization evidence.
- Each typed child carries request ID, definition field code, client item key, request source, source reference, and effective range.
- Approved application locks the request and all typed children, checks the frozen counts, writes canonical rows inside the existing transaction, and records an immutable child-to-target coordinate.
- The application fingerprint covers the typed-extension fingerprint and counts. Exact replay returns the stored request/materialization coordinates; different fingerprints retain the established stable conflict path.
- Typed children can be changed only while their same-tenant parent is draft, returned, or validation-failed. Materialization evidence is insert-only.

## Current evidence and remaining exit work

Contract and service typechecks pass. Service tests cover typed summaries and rejection of restricted JSON/raw identifier paths. The database contract test covers all seven relations, tenant keys, RLS, payload guards, legacy mode, immutable evidence, application wiring, and the NEON migration manifest.

The migration applies successfully to the isolated disposable NEON baseline and all eight typed/evidence tables are present; see the [P0 integration baseline evidence](./athyper-business-partner-360-integration-baseline-evidence.md). The [P0 security evidence](./athyper-business-partner-360-security-privacy-evidence.md) passes six write-stage rollback probes, exact replay/fingerprint/stale-version cases, database-visible leakage scans, RLS/IDOR scope checks and owner-type discrimination.

The full organization journey now also passes through the production
`KyselyBusinessPartnerRequestRepository`. One address, named contact, contact
channel, identifier, tax registration, classification and certification were
created, reviewed, approved and applied. The result contained seven immutable
child-to-target evidence rows, one application snapshot, stable exact-replay
coordinates and a fail-closed fingerprint conflict. A separate
`legacy_untyped` request applied with zero typed materialization rows, proving
that legacy JSON is not silently reinterpreted. Both journeys ran inside an
explicit rollback-only transaction and left zero request or partner rows. The
machine evidence is [retained here](./evidence/business-partner-360-materialization-evidence.json).

The technical materialization and legacy-read-policy evidence is complete. The
slice remains formally **In progress** until the master-data authority owner
signs the materialization/legacy-policy gate and the independent security and
privacy approvals are recorded in the [P0 approval packet](./evidence/business-partner-360-p0-approvals.json).
