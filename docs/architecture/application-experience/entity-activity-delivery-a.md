# Activity comparison — Delivery A implementation

Status: implemented in the working tree, 2026-09-28. Browser fixtures and focused service tests verified; this is not a new live deployment or publication receipt.

## Delivered behavior

- Root snapshot comparison follows the current authorized record descriptor's tabs, sections, field ordering, localized labels and enum options. No Country-specific renderer or provider branch was introduced.
- Comparison fields retain stable field keys. The public contract names captured values and comparison fields explicitly. Sections are presentation groups, not capture boundaries or collection identities.
- Server-side field authorization remains authoritative. The renderer intersects layout references with returned fields; it does not manufacture hidden-section names, placeholders or counts. Fields absent from the layout appear in Additional fields.
- Booleans, numeric values, enum labels and dates use the shared localization runtime. Date-only values do not shift with timezone. Decimal strings retain their precision; historical reference IDs are not resolved using live labels, and money does not acquire an inferred currency.
- Changes only defaults on. Counts include comparable changed root fields and affected sections, with zero categories omitted. No related-record count is fabricated.
- Uncaptured values are comparison limitations, not changes. Notes outside the changes count remain available; no comparable changes plus missing capture coverage produces one scoped explanation. Captured empty values remain distinguishable from missing capture.
- Expand/collapse controls operate on visible comparison groups, including notes. Filters and expansion remain mounted across side/full transitions.
- Compact snapshot rows show sequence, time and capture actor; native keyboard-accessible capture information explains coverage and source version. Capture type is not invented: the current API does not provide an explicit manual/automatic origin attribute.
- Exactly two distinct snapshots are required. The API rejects identical IDs; the provider orders earlier/later by the record's authoritative snapshot sequence, independently of browser selection order or pagination.
- Incompatible historical contracts remain rejected by the provider. The UI explains the conflict without inferring changed, removed or empty fields. This delivery does not introduce a schema migration mapper.
- Record navigation retains Activity; the workspace heading and accessible region use Activity & History. Collaboration's shared panel infrastructure remains reusable, and the shell Activity Center remains separate.

## Implementation owners

- `packages/contracts/platform/entity-runtime/src/activity.ts`: captured-value and comparison-field contract.
- `packages/platform/entity/runtime/form-detail/src/activity-comparison-model.ts`: root field grouping and typed formatting.
- `packages/platform/entity/runtime/form-detail/src/activity-comparison.tsx`: comparison surface and interaction state.
- `packages/platform/entity/runtime/form-detail/src/activity-workspace.tsx`: compact snapshot selection, detail reads and compatibility feedback.
- `detail-workspace.tsx`, `detail-collaboration.tsx`, `collaboration-surface.tsx` in the same directory: authorized descriptor wiring and shared panel integration.
- `packages/platform/entity/runtime/form-detail/src/styles.css`: theme-token comparison styling and responsive columns.
- `packages/platform/foundation/i18n/src/catalogs/collaboration.ts`: English, Malay and Arabic UI messages.
- `server/apps/platform-host/src/composition/shared/entity-runtime/activity-provider.ts`: comparable-only change detection and authoritative ordering.
- `server/packages/platform/experience/src/entity-activity-service.ts`: distinct-snapshot validation.

## Validation

- 37 Chromium browser checks passed: 11 Activity checks, 24 Comments/Files integration checks and 2 record-footer checks. Includes narrow RTL, typed formatting, section grouping, missing coverage, hidden-section omission, comparison conflicts, native disclosure keyboard control and side/full preservation.
- 4 comparison-model checks passed, including the actual Country metadata source's Country / Phone / Postal and address / Audit sections and Additional fields fallback.
- 9 Activity provider checks passed; 15 Activity service/routes/policy checks passed.
- Entity form-detail and experience-service source typechecks passed. Repository whitespace check passed.
- Host-wide typecheck is still blocked by the previously recorded attachment fixture at `qualify-document-malware.ts:279` (missing `failInspection`); no Activity diagnostic was reported.
- Strict style-token audit remains blocked by existing findings in shared files. The new comparison block uses theme tokens for colors, type, spacing, borders and radii; the ratchet was not changed.

## Delivery B boundary

Business Partner addresses and purchase-order line items need a provider-backed collection contract before they can use this UI. It must define owning section/source identity, stable item identity, relationship target identity, coverage/completeness, current row/field authorization, consistent capture and pagination. Matching by array index, title, address purpose or line display order is prohibited. Reordering cannot itself imply deletion/addition; replacing a relationship target must remain distinct from updating the linked record.

This delivery groups root fields only. It does not enroll Business Partner or Purchase Order, expand capture scope, claim a snapshot is an aggregate historical version, or implement the prototype's historical-layout mapping and grouped Timeline. Those remain Delivery B/C work.

## Runtime activation

No DDL, profile, permission grant or signed entity publication changed in this delivery. Existing Country enrollment remains read-only with Audit log and manual Saved snapshots. Normal source application reload/restart is needed to serve changed code; authenticated live Country acceptance has not been performed in this turn.
