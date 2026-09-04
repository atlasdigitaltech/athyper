# Business Partner protected documents

Status: Phase 0 policy baseline accepted
Owners: Security, Privacy, Document Platform and SRE

## Classification

| Class          | Business Partner examples                                                                                                       | Minimum handling                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `public`       | Intentionally published organization material                                                                                   | Integrity controls; publication purpose recorded                                                                                     |
| `internal`     | Request checklist, non-sensitive operational correspondence                                                                     | Authenticated tenant access; normal audit and retention                                                                              |
| `confidential` | Registration certificates, contracts, tax-status evidence, insurance and qualification evidence                                 | Need-to-know permission, tenant isolation, encrypted storage, audited download                                                       |
| `restricted`   | Bank proof, full tax identifier, government identity, beneficial-owner identity, immigration, credentials and security evidence | Purpose-bound permission, recent elevation where policy requires, narrow recipients, enhanced audit and approved residency/retention |

Business Partner evidence defaults to `confidential`. The definition sets a floor per requirement. Runtime classification is the maximum of the definition floor, detected content and receiving-policy floor. Users and extraction services cannot downgrade it. Candidate/worker documents never enter a general Supplier profile or notification payload.

Only `active` evidence may satisfy a case requirement. `staged`, `uploading`, `scanning`, `extracting`, `quarantined`, `replaced` and `expired` items remain visible as lifecycle metadata but do not satisfy the requirement.

## Contract boundary

- Document metadata owns linkage, classification, version, scan state, content hash, retention and legal hold.
- Object Storage owns encrypted bytes and provider coordinates.
- Browser responses contain attachment/evidence identifiers and capabilities only. They exclude bucket, object key, provider ID and durable signed URL.
- Upload and download capabilities are short-lived, one-purpose and server-authorized at use time.
- Replacement creates a new immutable version. Purge obeys retention and legal hold; application code does not destructively overwrite evidence.
- Extracted fields include confidence and source spans and remain proposals until a governed command accepts them.

## Production storage qualification checklist

Every item needs target-environment evidence, reviewer identity, timestamp, source revision and remediation owner. `N/A` requires Security and Privacy approval.

### Identity and network

- [ ] Workload identity is used; static application credentials are absent or exception-approved and rotated.
- [ ] Bucket/container policy denies public access and cross-tenant prefix access.
- [ ] Service endpoints use TLS and approved private-network controls where required.
- [ ] Upload/download capability TTL, audience, method, object and maximum size are bound and tested for replay.
- [ ] Revoked, expired, wrong-tenant, wrong-case and stale-authorization-epoch access is denied.

### Encryption, keys and residency

- [ ] Encryption at rest is enabled with approved key owner, separation of duties and rotation schedule.
- [ ] Key disable/recovery and decrypt audit behavior are rehearsed.
- [ ] Storage region, replicas, backups, logs and malware/extraction processors satisfy residency policy.
- [ ] Restricted data never crosses region through preview, telemetry, support tooling or AI processing.

### Integrity and hostile content

- [ ] Server verifies declared size, actual size, media signature and SHA-256 before activation.
- [ ] Malware scanning runs in isolation; timeout, provider outage, encrypted archive and polyglot behavior fail closed.
- [ ] Quarantined bytes cannot be downloaded, previewed, extracted or used to satisfy a requirement.
- [ ] Parser/preview sandbox limits CPU, memory, recursion, archive expansion and outbound network access.
- [ ] Extraction and preview outputs are treated as untrusted and safely encoded.

### Lifecycle, recovery and observability

- [ ] Retention, expiry, replacement and legal-hold policies are configured and reconciliation is monitored.
- [ ] Metadata/object consistency repair covers missing, orphaned, duplicate and wrong-version objects.
- [ ] Backup/restore meets approved RPO/RTO and preserves metadata-to-object integrity and legal hold.
- [ ] Access, capability issue/use, scan, quarantine, extraction, download, replacement and purge are auditable without logging content or URLs.
- [ ] Quota, latency, error, scan backlog, orphan and purge-failure alerts have tested runbooks.

### Operational approval

- [ ] Security approves threat findings and penetration results.
- [ ] Privacy approves purpose, minimization, residency, retention, subject access and deletion behavior.
- [ ] Document Platform approves provider compatibility and failure modes.
- [ ] SRE approves dashboards, alerts, restore and rollback evidence.
- [ ] Release owner records the exact image/source revision and environment before enabling protected uploads.

Passing code tests proves the adapter contract only. Protected uploads remain release-blocked until every required target-environment item is evidenced.
