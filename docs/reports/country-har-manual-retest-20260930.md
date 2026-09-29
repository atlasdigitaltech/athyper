# Country HAR fixes: manual retest

## Implementation

Shared Entity Framework changes:

- Detail reads wait for an authenticated session and ready experience bootstrap.
  Identical pending descriptor/record pairs share a request within the same client,
  principal, tenant, auth epoch, publication revision and permissions. Obsolete
  consumers cancel their work; one consumer cannot cancel another's shared request.
- Thumbnail tiles retain ready capabilities while scrolling until their signed
  expiry (with a five-second margin). Identity, permission, attachment and
  experience changes invalidate them. Pending identical requests are shared and
  thumbnail API concurrency is capped at three. Queued canceled work is removed.
- Activity descriptors are reused in the mounted record workspace for 30 seconds.
  Refresh, errors, changed release, identity and permission changes invalidate reuse.
  Activity data calls still go through server authorization.
- Attachment search/browse expose authorization, transaction_acquire and database
  stage durations in Server-Timing; search also exposes hit_authorization. The
  relay preserves this header. Acquisition includes transaction setup and pool
  wait, and database includes commit; these are not pure pool/SQL measurements.
  These endpoints use PostgreSQL, not an external search provider.

## Remaining publication blocker

The read-only command
`node tooling/scripts/verification/setup-activity-collections.dev.mjs --check`
still reports the saved Studio catl.admin session as anonymous.
No Activity configuration was published. Notifications and Inbox may still return
404 until the approved authoring/review/publication workflow completes.

Refresh the separate Studio author and reviewer sessions and the plane reader
sessions described in
`docs/architecture/application-experience/activity-collections-phase1-api.md`,
then rerun readiness and the existing publication workflow. Do not bypass review
or directly insert runtime configuration.

## Manual acceptance checks

1. Reload Country detail with Network recording enabled. Under a stable session,
   expect one descriptor/record pair. A real context change may cancel and replace
   it. Confirm the final record and field labels are correct.
2. Open Files; scroll quickly down/up several times. Already loaded, unexpired
   thumbnails should survive scrolling. Expect at most three active thumbnail API
   requests; canceled offscreen pending requests remain normal.
3. Leave a thumbnail visible for over two minutes, then scroll away/back.
   Confirm it refreshes its capability instead of displaying an expired image.
   Test preview/download, unsupported files, and Files versus Comments thumbnails.
4. Change record, session, or permissions. Confirm old data/previews do not appear
   in the new context and server denials remain enforced.
5. Switch timeline/audit/snapshots within 30 seconds. Expect data calls per tab
   without repeated /activity prerequisites. Explicit Refresh must fetch /activity
   again. Test snapshot capture/comparison and browser Back.
6. Search attachment contents and browse names/folders. Inspect Server-Timing:
   authorization, transaction_acquire, database, and hit_authorization (search).
   Export a new HAR with response headers for latency comparison.
7. After publication recovery, verify both Activity collection descriptors return
   200 for the intended tenant/plane.

## Verification boundary

Focused automated lifecycle tests and attachment discovery tests cover sharing,
concurrency, cancellation, stale context and diagnostic stage order. Package
typechecks pass. Authenticated end-to-end latency and the publication recovery
remain manual verification items; no live performance improvement is claimed.
