# Business Partner full-profile prototype

The local Supplier request Details form has two published Meta Entity views: **Standard request** (default) and **Full profile**. Select Full profile to test optional, repeatable profile records before assigning their collection to lifecycle stages.

## Authoritative definition

`server/db/scripts/provisioning/business-partner-full-profile.ts` authors native fields, sections, bindings, visibility rules, collection limits, labels and child surfaces. NEON consumes the active application descriptor; it does not import this authoring catalog. The same descriptor validates API commands. Optional collections have no required rows, but every added row must satisfy its field rules.

The prototype adds incorporation date, alternate names, business identifiers, tax registrations, commodity/industry classifications, governance members, partner relationships and certifications. Existing organization identity, address and contact sections remain available. Address country and one primary contact/channel remain required; street and city are optional. Tenant identity, record identity, audit columns, derived aliases, lifecycle status and verification decisions remain system-owned.

This is the current Supplier intake prototype, not a wholesale edit form for every SQL column. Additional operating-organization/company assignments and finance/bank activation continue through their existing governed workflows. It does not replace MESH registration or Customer intake.

## Persistence and safeguards

- The request-capture extension adds explicit incomplete draft saving, metadata-based draft reopening, bank capture and supporting documents. See [implementation status](request-data-and-documents-capture-implementation.md); development preview revision 40 is active. Live persistence verification remains blocked by the missing published NEON runtime entity contract.
- Added collections serialize to typed request extensions in the governed case snapshot. Approval materializes supported child rows and records per-row snapshot lineage. Replaying materialization does not duplicate them.
- Tax and certificate numbers use protected capture. Requests contain opaque references and masked presentation. Tax storage uses a fingerprint and retains the protected reference in metadata because canonical tax normalization changes text case.
- Lookup options come from active reference sources. Related partners use authorized entity-directory search and normal record-access validation at submission.
- Changing a view cannot silently omit populated additional fields. Remove their values before returning to Standard request.
- No approval, verification, banking entitlement or invitation permission is added by selecting Full profile.

## Local activation and evidence

Studio development preview revision 39 activates the authored definition. The two updated materialization functions were applied atomically from the existing DDL; no migration file was created.

Activation script: `tooling/scripts/verification/activate-business-partner-full-profile.mts`.
Browser probe: `tooling/scripts/verification/probe-business-partner-full-profile.mts`. It intercepts mutation requests; it does not create or submit a live case.
Database regression: `server/db/scripts/tests/integration/business-partner-full-profile.sql`. Synthetic fixtures and governed materialization run inside a rolled-back transaction, including all seven extension collections and child lineage.

The local commodity and tax catalogs are currently empty. Populate those catalogs through normal reference-data maintenance to test their selectors. Industry and country references are available.

Studio graph PUT requests have a bounded 1 MiB limit for UUID change-set routes; unrelated routes retain the default 256 KiB limit. Authentication, author permission, scope checks and optimistic concurrency still apply.

## Verification results

Focused frontend, metadata, protected-capture, API validation and HTTP-limit tests passed. Platform-host and production NEON typechecks passed. The full NEON test-source typecheck still reports unrelated integration-fixture imports (`pg` and a relative account-linkage import) and retired `displayName` properties in profile-match test fixtures; the new protected-capture tests pass.

Browser verification captured the draft command before transport and created zero cases. The database regression verified persistence for all seven collections, independent approval materialization, eleven child lineage entries and replay, then rolled back its fixtures.
