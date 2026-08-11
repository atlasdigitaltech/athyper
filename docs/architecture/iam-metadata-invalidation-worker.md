# IAM and metadata invalidation worker

`event.authorization_invalidation_outbox` and `event.descriptor_invalidation_outbox` are the durable authorities. Authorization writers call `event.fn_authorization_emit_invalidation(...)`; metadata writers insert a descriptor invalidation row. Both operations run inside the same database transaction as the authority mutation. Insert triggers emit `athyper_invalidation` only after commit; the notification contains no authority or sensitive payload and merely wakes the worker.

Each plane worker polls continuously, claims rows with `FOR UPDATE SKIP LOCKED`, and owns them through a bounded lease. It atomically deduplicates the event and increments a coordinate-specific Redis generation, then records that generation on completion. Replays after a crash return the prior generation. Expired leases and notifications missed during listener disconnects are recovered by polling.

The listener requires `STUDIO_INVALIDATION_LISTENER_DATABASE_URL`, `NEON_INVALIDATION_LISTENER_DATABASE_URL`, or `MESH_INVALIDATION_LISTENER_DATABASE_URL`. These URLs must connect directly to PostgreSQL or use PgBouncer session pooling; transaction pooling is invalid for `LISTEN`.

Processing reports lag, reconnect, processed, failed, DLQ and backlog observations. Invalid coordinates are poison messages. Transient failures use bounded exponential retry; poison or exhausted messages move atomically to `event.invalidation_dead_letter`. DLQ payloads exclude secret-like fields, retain only scalar values, cap fields and string lengths, and have a database-enforced 4 KiB limit.
