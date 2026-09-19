# Attachment API review

Reviewed the local implementations of all five `/api/attachments` routes, their lifecycle service, SQL repository, quota ledger, storage/scanner contracts, and upload client. The fixes below are implemented in this working tree.

| Severity | Finding | Fix |
| --- | --- | --- |
| High | Repeating `stage` for an active attachment returned a PUT URL for its active storage key, allowing verified bytes to be overwritten. | Only active upload states with an unexpired reservation can receive upload URLs. |
| High | `DELETE` updated any matching tenant attachment without checking its uploader; the Atlas capability also authorized deletion unconditionally. | Require an uploader-scoped lookup before mutation or quota release, add the uploader predicate to SQL deletion, and restrict the Atlas fallback to stored `atlas.prompt` coordinates. Missing or unowned attachments return 404. |
| High | Finalization scanned the writable staging object and subsequently copied it, allowing a replacement between scan and copy. | Copy to a unique private object first, then scan and hash that exact object before committing its key. |
| High | Concurrent finalizations shared a destination; a losing request could delete the successful request's object. | Give each attempt a unique destination and recheck state under the repository's attachment advisory lock before committing. Clean up only the losing attempt's object. |
| High | Atlas capability alone authorized finalize/status operations on ordinary attachments. | Determine Atlas eligibility from the uploader-scoped stored record. |
| High | Generic staging could create a `content.item` link without the write ACL check used by the version route. | Apply the configured content ACL before staging a content-item attachment. |
| Medium | The declared upload size was checked at staging, but finalization could accept different bytes or MIME metadata. | Bound scan consumption by staged size, require exact nonzero measured size, and reject changed content type. |
| Medium | Expired reservations and changed retry parameters could still receive upload URLs. | Reject expired or mismatched retries; cap URL lifetime to the remaining reservation and return the URL's expiration. |
| Medium | Finalization state conflicts and uploads with no stored bytes fell through to generic server errors. | Return a structured `409 ATTACHMENT_CONFLICT`. |
| Medium | Finalize omitted some create-permission aliases accepted by staging. | Accept the current plane's create permission and the generic/document create aliases. |
| Medium | Signed download URLs could outlive attachment expiration. | Cap their TTL to remaining attachment lifetime. |
| Medium | An infected verdict without full stream consumption failed before quarantine. | Process infected verdicts before requiring complete-stream integrity; clean verdicts still require complete consumption. |

Regression coverage also checks deletion during scanning, scanner failure, cache headers, malformed download expiry, and preservation of legitimate Atlas access. Route and lifecycle sources were formatted for reviewability.

Validation completed:

- Attachment package: **37 tests passed**, including 27 added regression cases.
- Attachment package production and test TypeScript checks: passed.
- Existing upload-client coordinate test: passed.
- Attachment diff whitespace check: passed.

Validation limits: HTTP tests exercise registered handlers with test doubles. No live PostgreSQL/RLS, object-storage, or ClamAV integration run was performed. The race tests exercise competing state changes; production serialization relies on the SQL repository's advisory lock. The storage contract does not constrain PUT body length, so size enforcement occurs during finalization rather than during the direct object upload. No deployment or database migration was performed.
