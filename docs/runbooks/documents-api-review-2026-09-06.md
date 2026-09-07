# Documents API review — 2026-09-06

Scope: `POST /api/documents/render` and `POST /api/documents/:documentId/download`, including service orchestration, document contracts, Kysely persistence, strict template substitution, and host wiring. Reviewed the local workspace source. Changes are local; no deployment was performed.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| High | Download authorization used `document.generated` and the attachment ID instead of the linked entity and record. Entity-scoped policy could not correctly evaluate the requested document. | Resolve the tenant-scoped artifact and authorize `documents.download` against its linked entity before signing a URL. |
| High | Tenant-wide idempotency lookup returned any document with the key, although authorization applied only to the new request's coordinates. Another principal or a changed entity, operation, template selection, filename, or payload could receive the old result. Concurrent recovery had the same defect. | Persist a canonical SHA-256 request fingerprint covering the principal and all rendering inputs; validate it and the returned entity coordinates on both replay paths. Return `409 IDEMPOTENCY_CONFLICT` for mismatches; never include the fingerprint in the public response. JSON object property order does not affect matching. |
| Medium | Download lookup omitted inactivity, expiry, and pinned-link checks. | Require an active, scanned, unexpired artifact and a link that permits this version. |
| Medium | Inactive artifacts disappeared from replay lookup even though the unique index continued to reserve their keys, causing another render/upload followed by a persistence error. | Retain key lookup for unavailable artifacts, including unlinked or unscanned artifacts, but withhold a replayable fingerprint so the service returns a conflict. |
| Medium | A synchronous extraction-scheduler exception after transaction commit entered upload cleanup and could delete the committed document's bytes. | Catch synchronous and asynchronous scheduling failures within the best-effort scheduling boundary. |
| Medium | Optional fields with invalid types or blank values silently fell back to defaults. Empty idempotency headers bypassed validation. | Reject malformed supplied fields and keys with `400`, while preserving defaults for omitted fields. |
| Medium | Operation lookup could resolve inherited names such as `constructor` instead of requiring a published operation. | Require an own property in the published operation map. |
| Medium | Template syntax validation inspected substituted output, so valid user data containing `{{` or `}}` failed rendering. Path resolution could also read inherited data. | Validate template syntax before substitution and resolve only own data properties; preserve scalar HTML escaping. |

Download responses additionally use `Cache-Control: no-store` because they contain signed URLs.

## Compatibility

Existing persisted idempotency records do not contain a request fingerprint. Reusing those keys now returns `409`; use a new key to render again. The fingerprint is stored in existing JSON metadata, so no database schema migration is required. Keys remain tenant-wide as required by the existing unique index; another principal cannot reuse a key to obtain the first principal's result.

Callers supplying `null`, blank strings, arrays, or other non-string values for optional string fields must omit the field or supply a valid non-empty string instead.

## Verification

- Documents service suite: HTTP authentication and validation, domain error mapping, download cache headers, service permission checks, missing resources, normal rendering on all three planes, malware rejection and scanner failure, persistence cleanup, idempotency matching/conflicts/concurrent recovery, scheduling failure, and template substitution.
- Repository tests compile SQL through Kysely with a deterministic driver and inspect tenant/lifecycle/link guards and replay mapping.
- Platform-host Documents vertical test exercises authenticated render and download through container registration.
- Typechecks for the Documents service (including tests) and Documents contracts.
- Whitespace validation for the affected packages.

Limits: repository tests do not execute against live PostgreSQL; host tests use injected storage, rendering, scanner, and repository implementations. Deployed PostgreSQL RLS, S3 signing, Gotenberg conversion, and ClamAV connectivity were not exercised. Renderer network isolation remains a deployment responsibility; the checked-in parity composition restricts Chromium to local temporary files.
