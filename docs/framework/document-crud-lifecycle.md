# Canonical document CRUD lifecycle

Document entities use one lifecycle owner: `DocumentEditCoordinator`. UI
surfaces may render fields and stage changes, but they do not choose transport,
open independent record streams, or fetch child collections outside the
compiled workspace plan.

## Commands

- Create an `EARLY_DRAFT` with `POST /runtime/v1/entities/:entity/draft/initiate`.
  `Idempotency-Key` is mandatory. Navigate to the returned edit location.
- Open edit with one `POST /runtime/v1/entities/:entity/:id/edit/open`. OPEN
  returns the record, edit masks, workspace capability, transport policy,
  bootstrap sections, selected labels, and process state.
- Save with `POST /runtime/v1/entities/:entity/:id/edit/submit`, carrying the
  in-memory workspace capability, `If-Match`, and `Idempotency-Key`. Header and
  child-row create/update/delete changes form one transactional bundle.
- Delete an uncommitted provisional document with its explicit
  `POST /runtime/v1/entities/:entity/:id/draft/discard` lifecycle command. A
  normal document delete must continue through the entity operation policy;
  the edit workspace must never issue an unguarded generic hard delete.

## Runtime invariants

- Exactly one document SSE connection exists, at `/edit/events`; the BFF
  proxies its body and never redirects a browser to an internal origin.
- Capabilities and permission stamps stay in memory or request headers. They
  are never placed in URLs, logs, or telemetry.
- Deferred workspace nodes hydrate when their owning surface becomes active.
  Workspace-enabled documents fail closed when a relation has no exact child
  collection mapping; they do not fall back to direct relation APIs.
- Compiled child metadata is shared through the application query cache.
- Submit preflight runs as part of the explicit submit lifecycle. It is not
  warmed continuously for an untouched editor.
- Comment and attachment detail collections load only when their drawer opens.

The runtime service remains the final authority for permissions, lifecycle
guards, validation, concurrency, idempotency, and transactional side effects.
