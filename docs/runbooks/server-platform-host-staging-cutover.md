# Server Platform Host staging cutover and rollback

Status: prepared; execution not authorized until Closure Gate E passes

## Entry criteria

- Candidate commit and immutable image digest are recorded.
- Clean-checkout Gate E is green, including the deployment-profile policy and
  disposable Studio/Neon/Mesh integration matrix.
- Every deferred legacy disposition is closed or has an explicit, named
  staging waiver.
- Migration, rollout, rollback, and incident owners are named.
- Separate least-privilege API and worker database identities are provisioned.
- Database and object-store backup/restore evidence is current.
- Prior known-good image digest and the recovery-time objective are recorded.

Do not place credentials, tokens, JWTs, connection strings, or customer data in
the evidence bundle.

## Protected execution

1. Create a release evidence ID and record UTC time, operator, candidate commit,
   image digest, rendered configuration checksums, and prior image digest.
2. Deploy the candidate image with high-risk capability flags disabled. Start
   API, worker, and scheduler as independent processes.
3. Apply additive migrations with the migration identity. Record schema
   versions; never use API or worker credentials for DDL.
4. Verify API `/livez` and `/readyz`, worker/scheduler heartbeat freshness,
   and intentional startup failure when each mandatory dependency is absent.
5. Smoke authentication/authorization, database connectivity, Redis/BullMQ,
   object storage, secret-store access boundaries, telemetry export, and audit
   persistence.
6. Run the Studio, Neon, and Mesh repository matrix and representative IAM,
   records, notifications, documents/rendering/storage, governed Jobs, and
   Publication canary flows.
7. Enable one capability, tenant, and plane at a time. Observe request failures,
   latency, retries/DLQ, schedule lag, database/Redis saturation, heartbeat age,
   audit failures, and Publication acknowledgement lag.
8. Send SIGTERM separately to API, worker, and scheduler. Prove bounded drain,
   idempotent shutdown, retry recovery, schedule reconciliation, and absence of
   duplicate durable mutation.

## Rollback rehearsal

1. Freeze canary expansion and stop new high-risk work through feature flags.
2. Redeploy the recorded prior image without reversing additive schema.
3. Verify readiness, reads, safe writes, job recovery, and schedule ownership.
4. If the prior image is not compatible with the migrated schema, execute only
   the pre-approved forward-fix or restore path; do not improvise destructive
   DDL.
5. Redeploy the candidate digest and prove convergence without duplicate
   activation, acknowledgement, execution, or audit mutation.
6. Record elapsed rollback/recovery time, observed alerts, sanitized logs, and
   owner approvals.

## Exit and stabilization

Seal the evidence bundle only after smoke, canary, rollback, and redeployment
pass. Begin the stabilization window at that point. A material incident resets
the window after remediation and requalification. Retain `server-backup`
throughout; its retirement is never part of this runbook.
