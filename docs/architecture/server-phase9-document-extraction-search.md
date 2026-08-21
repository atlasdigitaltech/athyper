# Phase 9 Document Extraction and Search

The retained container chain is now represented by explicit server boundaries:

```text
Gotenberg or upload -> ClamAV -> S3/MinIO -> document.attachment(pending)
  -> documents.processing / documents.extract-index
  -> S3 checksum verification -> Apache Tika -> PII labels -> PostgreSQL
  -> Meilisearch -> authenticated document search API
```

## Canonical ownership

| Concern | Owner |
| --- | --- |
| Provider-neutral extraction | `@athyper/server-contract-content-extraction` |
| Provider-neutral indexing/query types | `@athyper/server-contract-search` |
| Apache Tika HTTP implementation | `@athyper/server-adapter-document-parser-tika` |
| Meilisearch HTTP implementation | `@athyper/server-adapter-search-meilisearch` |
| Extraction/indexing job and DDL repository | `@athyper/server-service-document-processing` |
| Authorized search service and route | `@athyper/server-platform-search` |
| Concrete construction and job registration | `@athyper/server-platform-host` |

## Invariants

- Only active, current, virus-scanned attachments can be processed.
- Object bytes are fetched by the worker over the object-storage port and are never sent using a public URL.
- Downloaded bytes must match the durable SHA-256 before Tika receives them.
- Unsupported executable extensions and oversized inputs are skipped and removed from the index.
- PII classification stores category labels only; matched source substrings are not copied to audit metadata.
- Meilisearch identifiers contain plane, tenant, and attachment coordinates. Queries derive plane and tenant filters exclusively from verified request context.
- The search API never exposes the Meilisearch master key or raw storage coordinates. PostgreSQL and object storage remain authoritative.
- An indexing retry reuses durable extracted text instead of repeating Tika work.

## Public runtime

`GET /api/search/documents?q=<text>&entity_type=<comma-separated>&page=<n>&page_size=<n>` requires `documents.search`. Page size is capped at 100. Search snippets are cropped plain text; the adapter does not add trusted HTML markup.

The host validates Tika and Meilisearch health at readiness and initializes the `documents` index settings. Generated PDFs are marked `text_extraction_status='pending'` and scheduled with an idempotent BullMQ job ID after their attachment transaction commits.

## Remaining live gates

Exercise the full chain against the pinned Tika, Meilisearch, MinIO, ClamAV, Gotenberg, Redis, and three PostgreSQL plane containers. Add deletion/expiry event consumers and a durable pending-row recovery sweep before general user attachment ingestion is enabled.
