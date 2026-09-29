# Delivery C — Timeline and Audit log

Status: implemented and locally validated; compatible DEV services restarted. Country successor is prepared, **not published**. Release 9 remains active pending authenticated proposal, independent MFA approval and signed execution.

## Published contract

`platform.activity.standard` version 2 adds Timeline while retaining the existing Audit log and Saved snapshots policy. Its exact profile is source-locked. The new `timeline_query` action uses `common.audit.event.query`, not a new permission or grant. Country source now selects this profile for its next publication; Versions and automatic capture remain disabled and Country operations remain read-only.

Timeline is a projection, not a new ledger. `/activity/timeline` merges direct authorized audit events with independently authorized snapshot identities and authoritative version headers when available. It never reads snapshot values into an event. Source-prefixed IDs and PostgreSQL microsecond timestamps provide deterministic tuple pagination. Signed cursors pin record/tenant/plane/principal, release, authorization context, enabled source actions, date window and filters.

Audit and Timeline accept exact event-code, actor-ID and outcome filters. Filtering occurs in SQL before pagination. The existing Days control bounds the server query. Actor IDs remain explicit when no authorized display-name source is installed; no current directory name is guessed from captured data. The UI uses the user's existing localization/timezone context.

## UI and truthfulness

- Timeline groups by displayed date; only explicit same-record correlation identities form related-event groups. Similar timestamps do not create groups. Snapshot captures remain standalone and say they do not establish a record change.
- Group summaries show the number of **loaded events** and every outcome count, including failures before later successes. They do not claim a complete command history or a single aggregate success. A correlation group can continue on a later page.
- Audit uses a full-view table and side-view entries. Inspect discloses only projected event/operation codes and authorized field labels; raw payloads, IP addresses, user agents and unrestricted context stay server-side.
- Filters and controlled inspection state persist across side/full switches. Native disclosure controls, localization, shared tokens and reduced-motion behavior remain in use.
- Evidence, Requests, exports and integrity-verification badges remain intentionally parked. No success, actor or historical value is inferred from unavailable sources.

## Completion of reusable capture-policy support

Collection declarations can now explicitly specify `manualCapture.coverage` (`required` or `optional`) and `manualCapture.consistency` (`transaction` or `independent`). Omission keeps required transaction capture.

An optional missing section is persisted as `not_captured`, never an empty complete collection. Required missing/incomplete capture still aborts. Independently observed sources require a separately installed `captureIndependent` callback, publication/runtime qualification, current authorization and a validated envelope carrying its own observation timestamp. These are never labelled as a common transaction snapshot. Their failure aborts a required capture or records not-captured coverage for an optional section. Independent sources are excluded from the owning automatic transactional history binding; they need their own future entity/provider acceptance.

The repeatable-read root and owned-section reader continues to use only the supplied transaction. Independent adapters are separately observed, bounded reads and must not perform business mutations. No concrete remote provider, Business Partner or Purchase Order is created/enrolled by these contracts.

## Verification

- Publication contracts: 224 passed; publication integration: 16 passed; Country preparation: 5 passed.
- Experience Activity tests: 19 passed. Host provider/recording tests: 18 passed; qualification regression passed.
- Activity browser suite: 27 passed before the controlled-disclosure refinement; affected Timeline/audit checks rerun afterward. Includes a 12-event mixed-outcome group and server-filter transport.
- Isolated PostgreSQL Timeline test passes: equal-time source ordering/cursor continuity, tenant isolation, source permission exclusion and filters. Isolated snapshot/history PostgreSQL suite also passes.
- Host, Experience, publication, descriptor-client and form-detail typechecks pass. Fixed the pre-existing missing `failInspection` method in the malware qualification test repository so the host check can complete.
- New Delivery C component/styles have no style-token audit findings. The existing whole-worktree CSS ratchet debt remains; no baseline was raised.

See [publication handoff and receipts](../../reports/activity-delivery-publication-20260928.md). Live acceptance and future entity onboarding remain distinct from fixture validation.
