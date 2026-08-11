# Phase 9 — Content, Publication, Integration, and Numbering

## Ownership decisions

| Capability | Canonical owner | Database authority | Container boundary | Status |
|---|---|---|---|---|
| Numbering | `@athyper/server-service-numbering` | `control.numbering_policy`, `runtime_meta.entity_number_counter`, append-only `runtime_meta.entity_number_allocation` in every plane | PostgreSQL only; allocation must not depend on Redis | First vertical implemented |
| Publication | future `@athyper/server-service-publication` behind `@athyper/server-contract-publication` | Studio `publication.*` is authority; every plane consumes `runtime_meta` release projections | MinIO/S3 artifact transport, secret-store signing keys, BullMQ delivery/recovery | Backup characterized; rebuild pending |
| Content | future `@athyper/server-service-content` behind `@athyper/server-contract-content` | Plane-local `document.content_item` and immutable snapshot/version evidence | Reuse Documents processing: MinIO/S3, ClamAV, Tika, Gotenberg, Meilisearch and BullMQ | Backup preview route retired; bounded authoring slice pending |
| Integration | `@athyper/server-service-integration` behind a future `@athyper/server-contract-integration` | `control.connector_type`, `connector_instance`, `integration_endpoint`, `webhook_subscription`; execution evidence belongs in `ops`/`event` | Gateway for inbound traffic, secret store for credentials, BullMQ for retries, Redis for rate/dedup only | Empty package classified; endpoint catalog slice pending |

## Numbering rules

- Entity Meta owns the binding from entity field/operation to a portable policy coordinate. It never owns mutable counters.
- Each physical plane resolves its local active policy revision and advances only its local counter inside the same transaction as the business record mutation.
- `allocationId` is durable idempotency. A committed receipt is append-only and may be replayed after any number of later allocations without consuming a new value.
- Preview reads the active policy but never reads or advances a counter.
- Tenant policies override plane-global policies. A policy revision, scope and reset bucket are immutable counter coordinates.
- Fiscal-year reset requires an explicit governed fiscal-year value; it is never guessed from a calendar date.
- There is deliberately no public standalone allocation route. Records and other bounded services call `allocateWithinTransaction` after authorization and command idempotency, keeping the number and business record atomic.

## Publication recovery boundary

Retain the backup state machine (receive, stage, verify, activate, acknowledge, rollback), but move its wire types into a server contract package. Studio owns release/deployment commands. Neon, Mesh and Studio runtime projections accept signed immutable artifacts and continue serving the prior active release until activation succeeds. Artifact loading must use the object-storage contract; signature verification must use a signing/verification port backed by the secret store. Publication must not import S3, BullMQ or a plane database adapter directly.

## Content recovery boundary

The backup content package duplicated object storage, ClamAV and preview behavior and attempted in-process Sharp rendering. Those parts are retired. Content owns authored content metadata, locale/variant lifecycle and entity links. Documents owns binary attachment lifecycle, quarantine, retention, derivatives and access. Document Processing owns scan, extraction and search indexing. Content references clean document artifacts through a narrow Documents contract.

## Integration recovery boundary

The first Integration slice will manage endpoint/connector definitions and resolve a versioned invocation plan. Payload delivery is asynchronous through Jobs, with immutable attempt evidence, bounded retry and DLQ administration. Credential material remains in the secret store and only opaque `credential_ref` values enter PostgreSQL. Webhook delivery already recovered under Notifications remains a transport implementation; Integration owns general connector invocations and must not duplicate notification routing.

## Remaining gates

1. Apply the new numbering receipt DDL to disposable Studio, Neon and Mesh databases and run concurrent allocation/replay tests.
2. Wire Numbering into Records after the active Entity descriptor exposes the published numbering binding coordinate.
3. Rebuild Publication contracts and signed artifact loader as the next bounded slice.
4. Recover Content authoring without duplicating the completed Documents and processing packages.
5. Implement Integration endpoint catalog and governed invocation jobs; defer Apache Camel until a connector requires its routing runtime.
