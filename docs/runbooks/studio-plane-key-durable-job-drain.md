# Studio plane-key durable-job drain

During the one-release Studio compatibility window, only readers may normalize a
pending BullMQ payload with `planeKey: "athyper"` to `studio`. Publishers must
write canonical `studio` values only.

Before removing the reader compatibility code:

1. Pause publishers and workers, then record each queue's waiting, delayed,
   paused, active, failed, and prioritized jobs.
2. Query each queue for payloads whose top-level or envelope `data.planeKey` is
   `athyper`. Requeue each with the same deterministic job ID and a canonical
   `studio` payload; do not mutate acknowledgement or execution evidence.
3. Drain or retain the original legacy job according to its durable execution
   state. Completed and failed records remain audit evidence; only pending
   transport entries are removed after the canonical replacement is confirmed.
4. Resume workers, repeat the inventory until the legacy count is zero, and
   retain the inventory report with the release record.
5. Set the compatibility window closed, deploy removal of the ingress aliases
   and `normalizeStoredPlane`, then run the repository gate.

Rollback before step 5 consists of restoring the reader-only compatibility
release. Never reintroduce legacy values in publishers or durable execution
records.
