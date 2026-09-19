# GET /api/search/documents review — 2026-09-06

Reviewed the local route, search service and contracts, Meilisearch adapter, host registration, IAM authorizer, and content indexing/ACL implementation. Changes are limited to the document search package and this report. Existing unrelated workspace changes were preserved.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| High | The shared index includes `content_item` records, but document search checked only `documents.read`. A principal with document permissions could receive content titles/snippets without the content service's record ACL check. | Request only attachment resources and defensively discard non-attachment hits. Content remains searchable through its dedicated ACL-aware endpoint. |
| High | Per-hit authorization supplied `entityType`/`entityId`, while IAM record ACL evidence matches `resourceCode`/`recordId`. Record grants failed to match, and record denials could be missed in the presence of a broader allow. | Supply the canonical record coordinates, verified tenant, and attachment resource ID, retaining the existing fields for policy compatibility. |
| Medium | Raw index offsets combined with authorized-hit overfetch produced overlapping pages after denied hits. A fixed five-times overfetch could also return an empty page despite later readable matches. | Scan index batches in order, count authorized hits, and apply page offsets to that authorized sequence. |
| Medium | `total` was only the current page's visible count, including zero for out-of-range pages. Returning the raw estimate instead would reveal denied matches. | Count only authorized, retrievable attachment matches across batches. |
| Medium | Repeated/object query parameters silently fell back to defaults or removed the entity filter. Empty comma-separated filter elements were discarded, sometimes broadening the search to all entity types. Pagination accepted hexadecimal/exponent notation and treated empty values as absent. | Reject non-scalar parameters, empty filter elements, and non-decimal pagination with HTTP 400; preserve defaults only for omitted pagination fields. |

Also set `Cache-Control: no-store` on authenticated search responses, since results contain permission-dependent metadata and snippets.

## Validation

- Search package: 60 tests passed, including actual HTTP requests against a local Express server.
- Meilisearch adapter: 7 tests passed.
- Search production and test TypeScript checks passed.
- Scoped `git diff --check` passed.

Regression coverage includes authentication, verified plane/tenant isolation, global and per-hit permissions, canonical authorization coordinates, mixed resource types, pagination across denied hits and batch boundaries, authorized totals, malformed query parameters, validation bounds, cache headers, and error propagation.

## Operational limits

Exact authorized totals require checking every retrievable candidate on each request. Memory is bounded to one index batch plus the requested page, but authorization work grows with the candidate count. Totals cover the index's retrievable window, not documents beyond backend result limits. Concurrent index or permission changes can alter results between requests; the current search contract offers no snapshot/cursor facility.

Validation used local automated tests and mocked dependencies; no deployed endpoint or live Meilisearch/database validation was performed. Existing index entries must have the `resource_type` field populated by the current adapter to match the attachment filter.
