# Meta Entity–driven Activity and snapshot comparison

Status: proposed requirements, refined on 2026-09-28 and supplemented by the [audit response and interaction specification](entity-activity-ux-audit-review.md). This document defines the next UX and provider deliverables; it does not claim they are implemented or published.

Delivery A implementation checkpoint: [source changes, verification and remaining provider boundaries](entity-activity-delivery-a.md). The comparison foundation is implemented; live acceptance and Delivery B/C remain separate.

Delivery B is in progress: [B1/B2 APIs, B3 consistent manual capture, B4 reusable collection UI and onboarding acceptance](entity-activity-delivery-b.md). UI fixtures and Country source-metadata regressions pass. [Delivery C](entity-activity-delivery-c.md) now adds Timeline/audit UX and optional/independent capture contracts. Concrete provider onboarding, signed publication and live acceptance remain pending.

## 1. Objective

Provide a reusable Activity experience that helps business users understand what changed, when it changed, who performed the action, and which captured values can be compared.

Organize history around the entity's published tabs, sections and business labels. Show business changes first and keep technical metadata in Record information or event inspection.

Country is the first acceptance entity for the section-based comparison redesign. Business Partner Addresses is the first proposed collection-comparison example. Neither requires an entity-specific UI component or implementation folder.

## 2. Scope and delivery boundaries

| Delivery | Included | Boundary |
|---|---|---|
| A — comparison foundation | Section grouping, typed value formatting, changes-only filtering, compact snapshot selection, consistent side/full views | Country remains read-only; no new version history is inferred |
| B — related-section snapshots | Reviewed coverage, reference semantics, collection identity, consistency, section/field authorization and collection comparison | Each included source requires an installed, qualified provider |
| C — Timeline and audit UX | Authorized event projection, trustworthy grouping, actor labels, inspection and server-side filters | Timeline is a new capability requiring contract/API/publication work |

Generic Revisions, restore, export, Evidence and Requests remain outside these deliveries. Audit-integrity verification badges remain deferred until backed by actual verification evidence.

Existing implementation supports root-field snapshot comparison and has an owned-state adapter foundation. B2/B4 now expose authorized collection APIs and reusable UI. This does not establish Business Partner enrollment or Timeline availability.

### Product separation and navigation

Keep **Activity & History separate from Collaboration and the global Activity Center**. These are distinct product responsibilities even when they reuse presentation components.

| Area | Contains | Scope and purpose |
|---|---|---|
| **Activity Center** | Notifications, Inbox | Across records: “What needs my attention?” |
| **Collaboration** | Comments, Attachments | Current record: “What are we discussing and sharing?” |
| **Activity & History** | Timeline, Audit log, Versions*, Saved snapshots | Current record: “What happened, and what changed?” |

*Versions is visible only when an authoritative history provider is available and the viewer is authorized.*

- Keep record navigation simple: **Overview → Comments → Files → Activity**. Files is the current UI label for Attachments. These logical groupings do not introduce another navigation level.
- Use **Activity** for the short navigation label and **Activity & History** for its workspace heading in the upcoming UX implementation.
- Reuse the existing side/full panel framework across Comments, Files and Activity. Shared panel infrastructure does not place Activity inside the Comments or Attachments feature or service.
- Keep reusable record Activity components in the entity runtime; keep global notifications/inbox in the shell Activity Center. Global items may deep-link into an authorized record Activity view without duplicating history storage or UI logic.
- Drive available views and actions through the published Meta Entity Activity profile, qualified providers and current authorization. Country currently exposes Audit log and manual Saved snapshots. The separate Timeline view belongs to Delivery C and requires real event bindings; Versions remains hidden for Country.

## 3. Meta Entity responsibilities

Presentation, capture and comparison are separate contracts with explicit connections. A visible section is not automatically part of a snapshot.

| Contract | Declares | Does not determine |
|---|---|---|
| Activity profile | Enabled views, default view, permitted actions, capture triggers, retention and query limits | User grants or arbitrary database access |
| Entity presentation | Stable tab/section keys, ordering, translated labels and field bindings | Capture ownership or consistency |
| Snapshot coverage | Included sections/fields, source provider, required/optional status, reference policy and consistency requirements | What any particular viewer may see |
| Comparison definition | Object/collection shape, stable identity, relationship target identity, display fields, typed comparison and ordering | Matching by visible labels or array position |
| Authorization | Parent, section, row, field and sensitive-value access | A bypass based on having captured the snapshot |
| Published binding | Reviewed profile versions, entity overrides, provider registrations and compatible schema references | Installation of a provider merely by naming it |

The last three capture/comparison capabilities are proposed contract extensions, not existing property names to copy directly into production metadata.

Use global profile defaults. Entity-specific overrides are allowed only where the selected profile permits them and publication qualification accepts them. Reuse existing metadata for labels, formatters and section order rather than maintaining a second layout definition.

Publication must reject missing providers, ambiguous collection identity, incomplete required projections, unsupported comparison rules and unauthorized profile overrides. Ordinary readers must not acquire access to raw provider configuration or storage coordinates.

## 4. Snapshot storage and capture

Represent a logical snapshot using an immutable manifest with captured section payloads or immutable references to those payloads. Persist this through the existing snapshot architecture; this requirement does not prescribe a new table per entity or section.

The manifest must identify the record, tenant/plane, capture time and actor, profile/schema/release references, declared coverage and consistency result. Each related section must retain its stable key, source identity, captured fields, completeness and source version/time where available. A source version may be absent; never fabricate one.

### Data ownership

| Source | Capture requirement |
|---|---|
| Root business fields | Capture the reviewed stored projection |
| Owned related collections | Capture explicitly declared records and relationship identities through the owning provider |
| Lookup references | Retain identifier/code and permitted display label at capture time |
| Independently managed related entities | Capture an explicitly approved projection; retain source version/time and consistency limits |
| Sensitive sections | Apply dedicated storage/capture policy and current authorization on read |
| Computed values | Exclude by default; explicitly define whether a captured value or versioned derivation is supported |
| Comments, files, requests and other linked resources | Exclude by default; introduction requires its own governed coverage definition |

Do not recursively capture every foreign-key target. Do not fetch current referenced values to fill missing historical values. A reference label changing must not be presented as a change to the referenced identity.

### Consistency and completeness

For an owning mutation, required history and automatic snapshots must commit with the mutation or roll back with it. Collection writers must follow the root-lock/ownership protocol. A manual multi-section capture needs a defined consistent-read strategy; merely issuing several reads within a default transaction does not prove a single point in time.

For independent services or planes, retain per-source capture metadata and explicitly label the consistency limitation. Such captures must not be described as atomic record versions. Automatic transactional capture must not silently depend on an external service that cannot participate in its commit guarantee.

A required section failure fails capture. Partial capture is permitted only by an explicit policy and must record which authorized coverage was incomplete. Provider limits must fail or declare permitted incompleteness; never silently truncate and mark a collection complete. UI pagination is separate from stored coverage.

Manual capture retains its authorized capture coverage. Required automatic capture follows the reviewed server policy independently of the editor's viewing permissions. Both are filtered by the current viewer's access when read or compared.

## 5. Comparison semantics

### Compatibility

Compare snapshots only within the admitted tenant/plane and record identity. Pin the snapshots and comparison definition so paging or changing views cannot mix comparison versions.

For compatible captures, use the entity's authorized published layout for familiar grouping. Preserve the capture's schema/layout references so renamed or moved fields can be mapped explicitly. Across incompatible schemas, require a registered compatibility mapping or explain that comparison is unavailable. Never match fields by translated labels.

Old snapshots may use a flat fallback when reliable historical section mapping is unavailable. Unmapped fields must not silently disappear; show them in an authorized additional-fields or technical group.

### Field states

Distinguish a captured value, a captured empty value, and a value not captured. Internally distinguish authorization restrictions and unsupported comparisons as well. Render a generic unavailable/restricted indicator only when the viewer may discover that field or section; otherwise omit it entirely.

Compare canonical typed values before display formatting. Use declared semantics for dates, numbers, enums, references and ordered versus unordered collections. Formatting or locale differences alone must not produce business changes.

Only comparable captured values establish a field change. A coverage difference is not a cleared value. Counts, titles, previews and section summaries must be computed over authorized, comparable data and must not reveal hidden records or fields.

### Collection identity and classification

A collection remains a collection even when a capture contains one item. Declare a stable record or relationship identity. Preserve target identity separately where links can point to independently managed records.

| Captured condition | Classification |
|---|---|
| Same identity, changed comparable fields | Updated |
| Same relationship identity, different target identity | Linked record replaced |
| Identity appears only in the later complete comparable scope | Added |
| Identity appears only in the earlier complete comparable scope | Removed from this entity |
| Same identities/values, different incidental row ordering | Unchanged |
| Changed primary designation | Primary designation changed; retain the underlying affected-row changes |
| Missing, partial or incompatible coverage | Coverage differs / comparison unavailable |

Added/removed inference requires complete equivalent coverage and sufficient authorization for the compared scope. Matched items may still have comparable field changes when collection completeness differs; do not infer unmatched items were added or removed.

Reject duplicate identities. Do not use array position, address text, display title or fuzzy similarity as identity. Removal of a relationship does not establish deletion of its target master record.

## 6. Snapshot UI

### Snapshot selection

Use compact rows in full view and compact cards in side view. Show capture time, authorized actor display name and capture type. Use one accessible capture-info indicator for scope details, expandable on click/tap or keyboard; avoid a coverage paragraph on every row. Show source version only when it exists. Keep UUIDs and internal metadata in technical details.

Allow selection of exactly two distinct snapshots. The same snapshot cannot occupy both sides; comparing saved snapshots is not a check against the live record. Label the comparison by Earlier and Later capture time, with deterministic ordering if timestamps tie. Show a persistent Compare selected action and preserve selection across paging and side/full switching.

A successful capture uses a brief accessible status notification. Do not carry the success message into unrelated Activity views.

### Comparison workspace

Show:

- Snapshot identities and capture dates, with timezone clearly indicated.
- A summary distinguishing changed fields, affected sections and changed collection items.
- Changes only enabled by default, plus an option to show all captured comparable data.
- Published tab/section navigation, with changed sections expanded and unchanged sections collapsed or summarized.
- Discoverable coverage/compatibility limits remain available under Changes only, in a separate compact Comparison notes area when their section has no comparable changes. They are not counted as changes. Show one prominent explanation only when a no-differences result would otherwise imply unsupported completeness.
- Expand all and Collapse all controls for displayed comparison sections and items. Omit zero-count change categories.

Use real snapshot times in the comparison columns. Format booleans as Yes/No, enums as translated labels, numbers using declared formatting and timestamps in the selected timezone. Preserve date-only values without timezone conversion. Retain captured reference labels as historical data.

Technical identifiers and audit timestamps belong in collapsed Record information unless the published presentation explicitly treats them as business fields.

When no comparable differences exist, display: **No differences in the comparable captured fields.** If coverage is incomplete, explain that limitation alongside the result.

### Single and multiple related records

For one collection item, expand the item automatically. For several items, show a concise list with recognizable titles, change badges and a short summary. For large collections, use server-side search/filtering and pagination over the full authorized comparison result.

For Updated items, expand a field-level Earlier/Later comparison. For Added items, display the later formatted record. For Removed items, display the earlier formatted record. Do not render unnecessary empty comparison columns.

For linked-record replacement, label the replacement explicitly and show earlier/later identities or permitted titles. Do not imply that two different target records are the same record with edited fields.

A section summary should read, for example: **1 added · 1 updated · 1 removed**. A separate field count may be shown, but should not be mixed with record counts under an ambiguous total.

### Responsive behavior and accessibility

Full view uses side-by-side values. Side view stacks Earlier and Later within the same section/item. Preserve snapshot selection, filters, expanded sections and selected item when switching views.

Provide an explicit side/full toggle; narrow layouts stack values without resetting logical mode or selection. Honor prefers-reduced-motion for optional expansion/timeline effects. Use existing theme tokens, localization and layout primitives. Support light/dark modes, RTL, keyboard operation, accessible tab/expansion semantics, focus restoration and readable narrow layouts. Change meaning must use text/icons as well as color.

Keep existing Comments → Files → Activity navigation. Do not duplicate the Activity heading at every nested level.

## 7. Reference acceptance scenarios

### Country

Use published sections: Country, Phone, Postal and address, and Audit. Group comparable business fields accordingly; present technical Audit fields through Record information. Do not introduce synthetic Country versions or an automatic-capture claim.

Two identical manual snapshots show no comparable differences. A permitted controlled test change appears in its owning section with formatted values. Earlier snapshots and their stored values remain immutable.

### Historical layout/schema change

A third reference scenario must cover a renamed/moved section with an approved stable-field mapping and an earlier field with no compatible later mapping. The former is not a data change; the latter remains inspectable without being labelled removed. See the companion interaction specification and prototype.

### Business Partner Addresses

Declare a qualified address-section provider. Preserve the BP–address link identity and target address identity, together with the approved address projection and coverage metadata.

Illustrative display:

| Address | Change | Summary |
|---|---|---|
| Registered office · Kuala Lumpur | Updated | Street and postal code changed |
| Delivery address · Penang | Added | New address linked to this Business Partner |
| Billing address · Johor Bahru | Removed | Address link removed from this Business Partner |

Expand the updated row to show its changed fields. Added/removed rows expand to formatted address blocks. These examples are proposed acceptance fixtures, not claims about live Business Partner data or enrollment.

## 8. Timeline and Audit log

Timeline is an authorized chronological projection over available audit, version and snapshot sources. It does not create another historical ledger. Add it through the same metadata, publication and permission qualification process as other Activity views.

Use date groups, a vertical connecting line, concise event titles, actor/time/outcome and expandable detail. Standalone entries have no grouping chevron; groups show a disclosure and event count. Keep individual outcomes visible for compact groups, and explicit outcome counts with full details for large groups. Never use the snapshot capture actor as an inferred change actor. Expose historical values only from an authorized source that actually captured them. Snapshot capture does not imply a business record mutation.

Group related events only through explicit, appropriately scoped command/transaction/correlation identities. Similar timestamps are insufficient. Preserve individual failures and later successes; do not label a whole group successful merely because its final event succeeded. Maintain source identities to avoid displaying one operation repeatedly as separate unrelated changes. Preserve deterministic ordering and cursor continuity across pages.

Audit log uses a table in full view and compact entries in side view: Time, Event, Actor, Outcome and Details. Add version/correlation data when available. Put raw event codes and permitted technical context in Inspect. Never expose unrestricted audit payloads.

Date, event, actor and outcome filters apply server-side to the complete authorized result set. Counts must represent the stated filter scope; do not label a loaded-page count as a total. Timezone changes affect display, not event ordering.

Views are enabled by metadata and current permissions. The existing three canonical Activity permissions remain the baseline. Any additional permission must follow the established naming and global-profile rules; this proposal does not create grants or a restricted-events bypass.

Evidence, request navigation and exports remain parked. A future audit-integrity indicator must identify verified coverage and verification time and must not imply that every historical event was captured.

## 9. Acceptance criteria

1. The same published comparison contract and components render Country and a qualified related-collection fixture without entity-name branches.
2. Global defaults apply without overrides; unsupported overrides and missing providers fail publication qualification.
3. Country comparison follows published section order and typed formatting, with technical details separated.
4. Single, multiple and paginated collection results retain stable matching and accurate authorized summaries.
5. Reordering produces no false additions/removals; target replacement and relationship removal have distinct meanings.
6. Partial or different coverage never produces false deletions or a misleading complete/no-change result.
7. Unauthorized section names, item titles, values and counts are not disclosed; current permissions are rechecked by the server.
8. Capture failures honor required-section and transactional guarantees; immutable captures are never patched to add missing data.
9. Schema changes require explicit compatibility handling; historical reference labels do not silently become current labels.
10. Side/full switching preserves interaction state. Keyboard, RTL, localization and theme-token checks pass.
11. Timeline grouping follows explicit source correlation and retains underlying outcomes; no invented before/after data or verification badges appear.
12. Business Partner collection capture is marked available only after its actual provider, publication and authorization tests pass.

## 10. Implementation sequence

1. Define the proposed coverage/comparison contract extensions and qualification rules, reusing existing profile and publication machinery.
2. Deliver Country section comparison and compact snapshot selection using reusable field/section components.
3. Qualify a related-section provider and extend the API with authorized collection comparison, completeness semantics and pagination; validate Business Partner Addresses using explicit fixtures before live enrollment.
4. Add Timeline source normalization/correlation and improve Audit log filtering and inspection.
5. Publish through the existing governed workflow and perform separate signed-in UI acceptance for each enrolled entity and plane.

References: [existing recording architecture](entity-activity-recording.md), [Activity API](entity-activity-api.md), [implementation plan](entity-activity-implementation-plan.md), and [DEV rollout evidence](../../reports/entity-activity-rollout-20260928.md).
