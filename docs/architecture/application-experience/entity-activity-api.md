# Record Activity API and UI

Status: Phase 3 completed — authorized audit queries and snapshot listing/read/compare/manual capture implemented and tested locally, 2026-09-28. Reusable UI is also implemented and tested locally. Deployment, signed publication and live Country acceptance remain under Phase 6 of the implementation plan.

All routes are authenticated and live below `/api/entity-runtime/:entityCode/records/:recordId/activity`. The server resolves the admitted release, checks parent-record access, and authorizes the exact canonical action permission on every request. Browser-supplied storage names, tenant IDs, fields, capture policies, and permissions are not accepted. Responses, including handled failures, are private/no-store.

| Method/path | Purpose | Permission |
| --- | --- | --- |
| GET `/` | Authorized views, capture availability, release and query defaults | At least one enabled history-read action |
| GET `/audit?days=30&cursor=…` | Direct-record tenant audit headers | `common.audit.event.query` |
| GET `/versions?days=30&cursor=…` | Authoritative root-record version headers where a recording provider is admitted | `common.audit.event.query` |
| GET `/snapshots?days=30&cursor=…` | Snapshot headers for this exact record | `common.records.snapshot.read` |
| GET `/snapshots/:snapshotId` | Currently readable captured fields | `common.records.snapshot.read` |
| POST `/snapshots` | Manual capture; empty JSON body, required `Idempotency-Key` header | `common.records.snapshot.capture` |
| POST `/compare` | `{ "from": "<snapshot UUID>", "to": "<snapshot UUID>" }` | `common.records.snapshot.read` |

The describe URL is the base path without a trailing suffix. Pagination uses the published page size and bounded date range. Signed cursors bind the tenant, principal, auth epoch/profile, plane, entity, record, release, view, and range. Each cursor preserves its initial time bounds and timestamp/UUID position, including PostgreSQL microsecond precision. It expires after one hour. The host accepts an injected `entityActivityCursorKey` for replica continuity; the default key is process-local, so restart or a different replica requires starting a new page sequence. A cursor never bypasses current authorization.

## Storage and capture

The provider derives snapshot storage identity from the pinned runtime descriptor. The host admission supports published, read-only shared-reference products, including Country, and qualified tenant-owned roots with the new [recording provider](entity-activity-recording.md). Other domain records still need their owning parent/projection adapter; no table-name fallback is introduced.

Activity captures use the existing `snapshot.fn_capture_entity` and immutable identity/payload tables. Payload schema version **2** wraps the projected record and coverage in the same immutable payload:

```json
{
  "schema": "athyper.activity-snapshot/1",
  "record": { "name": "Example" },
  "coverage": { "kind": "authorized_fields", "fields": ["name"] },
  "releaseHash": "sha256:…"
}
```

Capture covers the fields readable by that caller at capture time. It is not a complete aggregate backup. The source record is read through the pinned authorized query service; source-record version remains absent where unavailable. This manual capture does not claim to share a transaction with an earlier business mutation. Automatic transactional capture is now available through the separately enrolled [root-record provider](entity-activity-recording.md).

The capture and `event.command_execution` receipt commit in one transaction. Concurrent retries use the same receipt, even if live record data changes afterwards. The command fingerprint binds actor, record, release, contract and retention policy; conflicting reuse returns 409. Receipts contain only snapshot identity, not historical field values. Existing command-receipt retention governs the replay lifetime. A new manual-capture key creates a new saved snapshot even when values match an earlier capture.

Listing never returns payloads, hashes, internal storage coordinates, or coverage field names. Reads and comparisons reapply current field authorization. Unauthorized fields are omitted; authorized fields distinguish a captured null from an absent/uncaptured value. Version-1 snapshots retain unknown coverage. Automatic snapshots use schema 3 with declared field coverage; they can be compared with manual schema-2 snapshots under the same contract. A mismatched record, tenant or storage coordinate is not found; incompatible contracts or unsupported formats return 409. Comparison authorizes both snapshots and requires compatible contracts/formats. The legacy snapshot API explicitly rejects version-2 envelopes instead of interpreting their metadata as record fields.

Audit returns direct-record event headers and only authorized changed-field names. It does not return raw before/after payloads, context, IP addresses, reason comments, or platform-scoped rows. Actor identifiers remain identifiers until a governed actor-label projection is available; no unrestricted directory lookup is added. Capture does not synthesize a record-change audit event or version.

## Shared UI

The authorized detail descriptor carries a separate `activity` flag. Activity appears after Comments and Attachments and uses the existing persistent panel portal, resize, focus, responsive and URL mechanics. Its services and data requests remain separate from collaboration services.

Activity loads only when opened. It offers Audit log, Saved snapshots, date-range selection, paginated reads, capture, snapshot details and comparison. Comparison expands to full view. Selection and filter state survive side/full switches. `activityView` and `activityDays` participate in Back navigation; record/tenant/principal/auth-epoch/plane changes discard the mounted record state. Hidden panels stop read requests, and failed reauthorization clears displayed history. Capture retries retain the command key after an uncertain response.

The Activity workspace uses the shared panel gutters and theme tokens for spacing, typography, borders, focus and semantic colors. Audit entries form a timeline with text outcome badges, actor/time metadata and authorized changed-field labels. Snapshot selection includes a two-item counter, clear-selection action, detail loading feedback and dismissible details/comparison. Empty states explain the next available step. Tabs support arrow keys and Home/End, including RTL direction. No entity-specific UI branch or inline style was added.

Labels are available in English, Malay and Arabic; dates use the shell's governed locale/time zone. Record information remains in the footer. Versions uses the authoritative ledger headers and stays hidden without an admitted recording provider; it remains hidden for Country. Generic Revisions, Evidence, Requests, exports and restore remain outside this release.

## Verification and remaining rollout

Local checks cover authenticated routes, denied actions, cursor tampering/scope changes, current-field projection, incompatible snapshots, capture retries, shared-reference ownership, and SQL qualification. An isolated PostgreSQL test executes the actual snapshot tables/functions/triggers and command table, verifying two-tenant isolation, concurrent idempotency, immutable coverage, paging and transaction rollback. It uses minimal supporting schemas and does not replace deployed-role acceptance.

Browser fixtures exercise the real client parsers and record-panel components: navigation order, lazy loading, side/full switches, selection, Back, comparison expansion, compact screens, capture retry, permission denial and identity changes. Seven Activity browser scenarios pass, including narrow Arabic/RTL rendering and keyboard boundary navigation. The 24 existing collaboration scenarios and two footer scenarios pass; form-detail typecheck and whitespace checks pass. Side/full and RTL screenshots were visually reviewed.

Deployment still requires compatible server/client code, Activity catalog and Studio authoring migrations, governed role grants, provider/catalog qualification, a signed successor release, and authenticated Country acceptance on each target plane. Source registration or fixture screenshots do not activate Country.

## Owned recording and delete support

Aggregate/domain recording uses installed transaction-aware adapters selected by a signed `recording.adapterKey`. Hard/soft deletes retain immutable pre-delete tombstones. Public APIs still require current parent admission and do not expose deleted records through an authorization fallback. Snapshot APIs currently compare authorized root fields; retained owned collection payloads are not exposed. See [recording semantics](entity-activity-recording.md) and [DEV rollout](../../reports/entity-activity-rollout-20260928.md).
