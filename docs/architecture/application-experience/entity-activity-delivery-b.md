# Delivery B — related-section snapshots

Status: **B1/B2, B3 consistent manual capture and B4 reusable collection UI implemented and fixture-tested.** Optional/independent capture contracts are completed in the Delivery C checkpoint; concrete provider onboarding, signed publication and live acceptance remain pending.

## Build sequence

| Checkpoint | Scope | Status |
|---|---|---|
| B1 | Internal capture contract, stable identity comparison, authorization boundary, transactional capture integration | Implemented and tested |
| B2 | Published collection bindings, owning-provider qualification, current section/row/field authorization contract, authorized read/compare API projection and paging | Implemented and tested; concrete entity providers require enrollment qualification |
| B3 | Consistent manual multi-section capture | Implemented for required, complete, same-database sections; optional capture and independent references remain follow-up |
| B4 | Reusable metadata-driven collection UI; address-like and line-item-like fixtures; Country source-metadata regression | Implemented and fixture-tested |
| Future entity acceptance | Validate actual entities after authoring, provider qualification, publication and authorized enrollment | Deferred to each onboarding |

Country continues using Delivery A's root comparison. Business Partner and Purchase Order have not been enrolled. There is no inference of collection support from a foreign key or a section name.

## B1 contract and semantics

The internal `athyper.collection-capture/1` envelope contains the verified parent subject (tenant, plane, entity and record), stable collection key, source entity/contract, reviewed scope pin, identity field, optional target field, field comparison semantics, coverage, consistency and captured records.

- Identity must be an explicit captured string field. Duplicate or missing identities fail; no matching by array order, label, address text or line number is permitted.
- A collection remains an array even with one item. Incidental row reordering produces no changes. A declared line-position field may still carry a real business change.
- Same stable link with a new target is Replaced. Its values remain inspectable, but differences between different target records are not represented as edits to one target record.
- Same identity with unequal comparable authorized fields is Updated. Unmatched records become Added/Removed only with complete equivalent capture scope and complete authorized membership visibility. Otherwise they are Uncomparable.
- Explicit before/after presence distinguishes absent records from unknown coverage. Missing field values remain uncaptured, distinct from captured null.
- Different source contracts, scope pins or comparison definitions yield a comparison limit, not guessed matches. Both captures must match the current admitted subject and definition; matching each other is insufficient.
- Decimal semantics compare precise strings without floating-point conversion. Safe integer numbers are accepted; noninteger/unsafe numeric decimal values must be supplied as strings. Canonical JSON comparison ignores object-key order and preserves meaningful array order. Further type normalization requires an explicit qualified rule.
- Root-transaction captures inherit their containing snapshot's persisted capture time. Independent and consistent-read sources require their own observation time. Independent sources carry an explicit consistency note. No transaction-start timestamp is mislabelled as observation time.

## Authorization and output

The comparison engine requires a current authorization adapter; there is no default allow path. The caller supplies the current admitted parent coordinates and collection definition separately from stored captures.

An undiscoverable section returns nothing. Each matched/unmatched identity is authorized before projection; field keys/labels come from current authorized metadata and are intersected with per-record permissions. Target replacement requires target access. A provider claiming complete membership while denying a row fails closed. Restricted membership never implies additions/removals, and hidden identities never contribute to returned counts.

The output contract contains only authorized item IDs, field projections, change classifications, presence, comparison limits, counts and appropriate source times. Raw storage coordinates, source contract hashes and hidden rows are not emitted. Counts describe only this bounded authorized projection, not all records in storage. Masked/sensitive fields must be omitted unless the installed adapter can provide the approved representation; snapshot capture authority is not viewing authority.

This is a bounded whole-capture engine. API pagination must occur over its authorized comparison projection with pinned snapshot/query coordinates, never by comparing two independently paginated lists. Browser pagination does not establish capture completeness.

## Transactional writer integration

`createOwnedRecordHistoryAdapter` accepts an optional comparison declaration from its installed, release-pinned collection resolver. Existing callers retain their legacy output. Opted-in providers produce the versioned envelope under the existing immutable snapshot's `owned` member; no new table is introduced.

The existing writer protocol still requires root locking and complete ownership of child mutations. Captures read tenant-scoped active rows in the owning transaction. The maximum-record limit fails capture rather than truncating a collection and calling it complete. Required capture failure rolls back the mutation. Capture metadata is stable across repeated reads in one transaction and cannot manufacture a no-op history change.

B2 now binds the declaration through the published Activity capability. Metadata alone cannot install an adapter. Legacy owned arrays do not acquire inferred identity, completeness or schema compatibility.

## Source files

- `packages/contracts/platform/entity-runtime/src/activity-collections.ts`: authorized collection comparison projection.
- `server/packages/services/records/src/snapshots/collection-capture.ts`: internal capture contract and validation.
- `server/packages/services/records/src/snapshots/collection-comparison.ts`: identity, compatibility and authorization-aware comparison.
- `server/packages/services/records/src/owned-history-adapter.ts`: opt-in transactional capture integration.
- `server/packages/services/records/src/__tests__/collection-comparison.test.ts`: collection, authorization and exact-decimal tests.
- `server/packages/services/records/src/__tests__/record-history.postgres-case.ts`: real transactional capture/rollback/replay integration, exercised through the isolated Activity PostgreSQL suite.

Exports use the existing entity-runtime contract and Records service package entry points. No entity-specific implementation file/folder was added.

## Validation

See the checkpoint test results recorded below. PostgreSQL verification uses a disposable, network-isolated container; it does not mutate the DEV Country or Business Partner database.

- Records suite: **332 passed**, 4 opt-in cases skipped in the ordinary run; includes 19 collection-comparison tests.
- Explicit isolated PostgreSQL Activity suite: **passed**, including the opted-in collection envelope, transactional rollback/replay and repeated-read stability.
- Records source and test typechecks: **passed**.
- Repository whitespace check: **passed**.
- No UI/CSS changed in B1, and no live deployment or authenticated application acceptance is claimed.

## B2 published metadata and qualification

The locked global `platform.activity.recorded-owned` profile version 2 permits a typed `collections` entity override. Version 1 profiles remain unchanged. Each declaration pins a published section, stable collection identity, child source contract, reviewed membership scope, identity/optional target fields, explicit comparison semantics and maximum record count. The closed schema rejects arbitrary SQL/storage instructions, duplicate keys, undeclared identity fields and excessive limits (8 collections, 128 fields, 1,000 records per collection).

Collections require an owning recording adapter and enabled snapshots. Version 2 disables manual capture: consistent manual multi-section capture belongs to B3. Existing root-only Country capture is unaffected.

Publication requires a real published section plus installed graph/runtime qualification and current authorization callbacks. Installed providers must verify the exact child contract, projection, scope and limits; declaration alone does not qualify a provider. Runtime also checks the parent's declared aggregate relationship. No Business Partner or Purchase Order provider is enrolled by this change.

The writer receives the published binding, verifies the actual child projection against it and stores the versioned envelope. The generic history hook requires every declared collection, complete root-transaction coverage, matching parent subject and matching definition. Failure rolls back the owning transaction. Capture limits fail rather than truncate.

## B2 authorized API boundary

- `GET /api/entity-runtime/:entityCode/records/:recordId/activity/snapshots/:snapshotId/collections/:collectionKey`
- `POST /api/entity-runtime/:entityCode/records/:recordId/activity/compare/collections/:collectionKey` with `{from,to,cursor?}`.

Both use existing snapshot read/compare admission and `common.records.snapshot.read`; no new permission namespace or role grant is introduced. Current section, retained/deleted row, field and target authorization is mandatory. Hidden sections return 404. Missing installed providers return 503. Unsupported/legacy capture envelopes return 409; incompatible definitions retain explicit comparison limitations. Compare rejects duplicate snapshot selections and normalizes direction by saved-copy sequence.

Snapshot details expose only currently discoverable collection headers, not a claim that the historical snapshot captured those sections. The API omits raw manifests, storage coordinates and hidden data. Each request reauthorizes the whole bounded projection before paging. Signed cursors bind the principal, tenant, release, authorization context, action, snapshots, collection and complete authorized result; changed access or projection invalidates paging. Counts describe the authorized result, never hidden membership.

Reusable browser-client parsers and relay allowlist entries are included. There are no collection components or CSS changes in B2.

## B2 verification and next checkpoint

- Publication contracts: 221 tests passed; publication service Activity integration: 16 passed.
- Host Activity provider/qualification/recording: 26 tests passed across the focused suites (including new collection qualification and authorized projection cases).
- Experience Activity service/routes/policy: 18 passed, including authorized paging and input rejection.
- Records regression: 332 passed, 4 ordinary opt-in skips; explicit isolated PostgreSQL Activity test passed, including published collection capture and mismatch rollback.
- Relay security/composition: 43 passed.
- Records, Experience and descriptor-client typechecks passed. Host typecheck remains blocked by an unrelated missing `AttachmentRepository.failInspection` implementation in `qualify-document-malware.ts:279`.

The B3 checkpoint below adds consistent manual multi-section capture. **B4 is recorded below; live entity enrollment remains pending.** No deployment or authenticated live acceptance is claimed.

## B3 — consistent manual multi-section capture

The new locked global `platform.activity.recorded-owned` profile **version 3** enables manual capture with existing `common.records.snapshot.capture` permission. Prior profile versions and Country enrollment are unchanged. Entity collection declarations still use the published B2 contracts and limits. Publication rejects a manual collection capability unless the installed provider supplies `captureConsistent` in addition to graph/runtime qualification and current authorization.

The installed reader receives the admitted subject, pinned descriptor, authorized root fields and the actual persistence transaction. It must use this transaction for every source read; nested transactions and remote reads are not qualified consistent sources. Same-database references can use this contract only after provider qualification. No entity-specific reader is enrolled in this checkpoint.

Capture now proceeds as follows:

1. Admit the existing capture action; resolve and qualify the published sections and current access.
2. Open a plane-local **repeatable-read** transaction before actor stamping or data queries. The repository verifies the isolation level, failing closed if a custom coordinator ignores the requested level.
3. Check the command receipt. A replay returns the existing saved-copy identity without calling the reader again.
4. Read authorized root and section data inside that transaction. Validate exact published definitions, subject, record limits, complete membership and current row/field/target access. Every declared section is required; no truncation or partial-success fallback is allowed.
5. Persist one immutable version-3 manual snapshot and its command receipt atomically. Root coverage remains `authorized_fields`; each section retains its validated capture envelope. The saved copy does not create a business record version or claim the capture actor changed the record.

A failed reader, missing/partial section, mismatched subject or unauthorized value aborts the capture. Existing root-only capture keeps its existing payload and replay fingerprint. Manual snapshot listing/detail distinguishes authorized coverage from automatic declared-field coverage.

### B3 verification

- Publication contracts: **222 passed**; Activity publication integration: **16 passed**.
- Host capture/provider, recording qualification and transaction coordinator: **17 passed**.
- Records regression: **332 passed**, 4 ordinary opt-in skips; Records source/test typechecks passed.
- Isolated PostgreSQL proves stable root/section reads while another transaction commits an update, replay without rereading, and required-reader failure rollback/retry. Existing tenant isolation and automatic history regressions also pass.
- Host typecheck still reports the pre-existing missing `AttachmentRepository.failInspection` in `qualify-document-malware.ts:279`.

**Remaining:** optional section coverage policy, separately observed/external reference providers, live provider/entity enrollment and deployment. These are not represented as completed by this consistent-capture checkpoint.

## B4 — reusable collection UI and future onboarding

B4 implements shared UI, not Business Partner or Purchase Order entity creation/enrollment. Country remains the current root-comparison regression target. Its source metadata is used in automated model and browser tests; this checkpoint does not claim authenticated live Country acceptance or deployment.

### Implemented behavior

- Snapshot inspection and comparison discover only authorized collection headers. Published section keys determine placement in the current tab/section order; unknown older mappings retain the provider order rather than guessing.
- One record uses the same collection contract as many records. Each row has stable identity, an optional authorized display label, change status and expandable captured fields. Repeated labels/products never merge records. Authorized labels are presentation, never matching keys.
- Record outcome totals exclude zero categories. Changed-field counts are separate and attached to individual records. Changes-only hides unchanged records, while comparison notes remain visible and outside the counts.
- Added/removed records distinguish absent membership from uncaptured values. Replaced targets explicitly avoid presenting cross-target values as edits to one target. Unknown membership, incomplete capture and incompatible scope remain limitations, not invented changes.
- Field labels/order come from the authorized projection. Optional authorized date/datetime/enum format metadata drives values; decimals remain exact strings, booleans use localized text, and null/uncaptured remain distinct. Historical references are never resolved to today's values by the UI.
- Per-section read/compare paging uses the B2 signed cursor. Expired/denied paging clears previously displayed rows and offers restart; duplicate pages or a changed release are not appended. Counts reflect the complete authorized result, and the UI separately shows how many records have loaded.
- Controls and expanded records stay mounted across side/full switches. Requests are cancelled on unmount or hiding. Keyboard-operable native disclosures, localized English/Malay/Arabic copy, RTL, narrow layout and reduced-motion behavior use shared components and theme tokens.
- Root no-differences guidance is scoped to root fields when related sections exist. Coverage limitations cannot disappear under the changes-only filter.

### DDL-informed fixture scope

Reviewed `server/db/ddl/common/master/03_platform_tables.sql`: `master.address_link.id` is distinct from `address_id`, informing stable-link versus replaced-target fixtures. Reviewed `server/db/ddl/planes/neon/document/03_tables.sql`: the purchase-invoice-line model has a stable `id`, separate `line_no`, repeatable item references and numeric quantity/price columns. This informs generic line-item tests; it is not a claim that a runtime Purchase Order/line entity exists.

The browser fixtures pass through the shared response parsers, and the collection engine tests validate matching and authorization separately. No production tables, entity definitions, permissions, profiles or provider registrations were added by B4.

### Verification

- **25 Activity browser tests passed**, including Country source-metadata regression and unchanged Comments/Files navigation behavior, zero/single/multiple related records, additions/removals/replacement, repeated products, exact decimal values, explicit line position changes, paging/restart, coverage notes, denied section disclosure, snapshot inspection, keyboard controls, side/full preservation and narrow RTL/reduced-motion rendering.
- **20 collection-engine tests passed**, including stable identities, authorization, hidden labels/formats, exact decimals and reordered rows.
- **4 comparison-model tests passed**, including actual Country source section grouping and value formatting.
- **11 host provider tests passed**. Form-detail, descriptor-client and Records typechecks passed.
- New collection component/styles: **zero style-token audit findings**. Whole-worktree strict CSS audit remains blocked by existing findings in record, form-detail, shared UI and shell styles; its baseline was not raised.
- Host typecheck retains the unrelated `qualify-document-malware.ts:279` missing `failInspection` error. No deployment/live acceptance is claimed.

### Required acceptance when onboarding each future entity

1. Author and publish its tabs/sections, collection identity/target definitions, field format metadata and capture scope; confirm these against the actual DDL and mutation ownership.
2. Install and qualify its providers. Verify root and child mutation capture, transaction consistency, required capture rollback, delete history, record limits, replay and version semantics.
3. Exercise current section/row/field/target access, including deleted records, denied access, profile inheritance/entity overrides and stale cursors. Confirm hidden values, labels and counts do not leak.
4. Repeat the zero/one/many, added/updated/removed/replaced, null/uncaptured, reference and line-item scenarios using real enrolled data. Include duplicate products, stable IDs despite reordered rows, decimal precision and multi-page collections where relevant.
5. Run side/full, keyboard, localization, RTL and responsive acceptance in the authenticated application. Record the tested release/profile/provider and evidence before marking that entity accepted.

Country cannot substitute for these future entity acceptance checks. Optional capture and independent-source providers remain separate unfinished work.

## Final reusable-provider checkpoint

The previously pending optional-section and independent-source contracts are now implemented and tested; see [Delivery C](entity-activity-delivery-c.md). Every real independent-source adapter still requires installation, qualification and onboarding acceptance. Country remains root-only.
