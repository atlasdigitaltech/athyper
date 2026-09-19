# Master-data local review after address cancellation

Scope: the six `/api/master` handlers in the current checkout, service guards/effects, owner authority, repository concurrency, cancellation/effective dating, signed verification and local host wiring. Local development only; QA/staging/production remain deferred.

## Findings fixed

### P2 — Owner/child lock-order inversion

Child-ID authority resolution acquired a contact/address row lock before the repository acquired its owner advisory lock. Creation acquired the owner lock first. A transaction holding the owner lock and subsequently touching that child could therefore form a lock cycle with authorization/deactivation. This is a confirmed ordering defect and deadlock risk; no live user deadlock incident was observed during this review.

A shared `lockMasterDataOwner` helper now defines canonical lock identity. Authority resolution acquires it before child-row locking, for both owner and child targets. Child ownership is read again under the row lock after waiting; disappearance returns 404, and changed ownership returns 409 `MASTER_DATA_OWNER_CHANGED` before a decision can use stale coordinates. The repository uses the same helper.

The PostgreSQL regression holds an owner lock, observes authorization waiting on that advisory lock, and verifies another transaction can still acquire the child row with `FOR UPDATE NOWAIT`. It runs for both contacts and addresses. Thus the wait cannot retain the opposite lock and form that owner/child cycle.

### P2 — Exact contact-deactivation retries duplicated effects

`deactivateContact` allowed `effective_until >= requested_end`. An exact retry updated the row again, returned success, and caused the service to append another audit/outbox event despite an unchanged period.

It now requires a strictly shorter period when an end is already present. Repeating an equivalent timestamp returns 409 `MASTER_DATA_PERIOD_CLOSED`. The database regression covers this rejection; authenticated acceptance additionally compares data/effect counts before and after the repeated request. This matches the existing address end-date retry policy.

## Review coverage and validation

- 90 focused route/service/evidence/challenge-route tests passed.
- 25 disposable PostgreSQL tests passed, including the lock-order regressions, cancellation, duplicate/primary races, historical visibility, tenant isolation, signed replay and rollback.
- 17 host authority/registration/verification-route tests passed.
- Master-data TypeScript package build passed.
- All 91 authenticated checks passed, covering all six routes, cancellation/replacement and exact contact-deactivation replay. Mailpit verification and replay rejection passed for both CirrusAtlantic users; both Athyper users were denied. Services are healthy and the queue is empty.
- [Acceptance receipt](master-data-launch/local-lock-review-acceptance-20260907.json).

No additional confirmed defect was found in the reviewed route input parsing, signature target binding, or local host registration. Test coverage does not certify QA/staging/production, real inbox/device delivery, or arbitrary external SQL writers.

## Deployment and limits

The local image derives from the currently qualified cancellation runtime and changes only authority, repository and the shared lock helper. It requires no new schema migration, grants or key changes. The persistent profile pins the image; the previous profile is retained under `~/.athyper/instances/dev/deployments/local-master-lock-review-20260907/`.

Owner operations, including profile reads, now serialize on the same owner lock. This is intentional for the low-volume local pilot. Table-wide authority locks remain; higher-volume deployment needs contention qualification. External callers composing multiple owners in one transaction still need a consistent multi-owner acquisition order.
