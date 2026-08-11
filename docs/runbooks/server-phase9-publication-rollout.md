# Phase 9 Publication rollout and rollback

Publication is fail-closed and disabled by default. Canonical plane values are `studio`, `neon`, and `mesh`; the Foundation plane-key cutover is not part of this runbook.

## Preconditions

- Apply the current Studio, Neon, and Mesh DDL manifests and pass the Publication DDL fixtures.
- Provision one Ed25519 private key and its public key in Infisical. Give the API/worker only the references required by its role; target-plane appliers never receive the private key.
- Confirm MinIO/S3 immutability and that target-plane identities have read-only artifact access.
- Drain or migrate legacy durable jobs before enabling any Publication writer.

## Rollout

1. Keep all `PUBLICATION_*_ENABLED` flags false and run the three-plane integration gate.
2. Enable `PUBLICATION_API_ENABLED` only on API. API must receive no `PUBLICATION_PRIVATE_KEY_REFERENCE` or `INFISICAL_TOKEN`.
3. Enable `PUBLICATION_APPLY_ENABLED` for one worker and set `PUBLICATION_TARGET_PLANES=studio`. Verify health, activation-head reads, audit events, recovery queue, and DLQ remain clean.
4. Add `neon`, then `mesh`, one plane at a time. Stop if acknowledgement coordinates or active heads diverge.
5. Enable dispatch only after apply workers are healthy. Enable compile last and only on the Studio authority worker; only that worker receives the private-key reference and Infisical machine token.
6. Enable `PUBLICATION_RECOVERY_ENABLED` only on scheduler.
7. Run `pnpm --dir server/db run db:operate:publication:canary` with the required `PUBLICATION_CANARY_*`, Studio/Neon/Mesh database URLs, and a short-lived MFA-qualified bearer token. Use `PUBLICATION_CANARY_EVIDENCE_PATH` to create a non-overwriting JSON evidence file.
8. Hold the canary for one recovery interval plus the maximum BullMQ retry window before widening worker replicas.

## Rollback rehearsal

1. Disable compile and dispatch first; leave apply enabled so already-dispatched work can converge.
2. Invoke the governed rollback route with an existing verified local applied-release ID and a reason.
3. Verify `runtime_meta.release_activation_head` points to that release and runtime reads use only the local head.
4. Confirm the authority ledger and immutable acknowledgement history were not rewritten.
5. If a dependency is unhealthy, disable apply, restore it, then rely on `publication.recover-stalled`; do not mutate BullMQ payloads or authority rows manually.

## Evidence record

Record environment, image SHA, DDL manifest hashes, signing key ID (never key material), artifact hashes, deployment IDs, activation-head queries, acknowledgement IDs, health output, queue/DLQ counts, timestamps, and operator identity. A rollout is not complete until the three-plane container gate and a real canary/rollback rehearsal have attached evidence.
