# Atlas F5 — retrieval, assessment batching and bounded caching

**Status: closed — DEV CirrusAtlantic BP prototype (2026-09-10).**
The current phase includes the deployed hybrid retrieval and document-grounded chat
follow-ups. [Closure record](../architecture/business-partner/evidence/atlas-f5-phase-closure-20260910.json)
links the qualification evidence and preserves the remaining production, broader-corpus
and additional-owner work as follow-up qualification. Earlier evidence files remain
historical snapshots; their original pending-deployment status is not current.


F5 strengthens the existing shared Atlas runtime. Published Meta Entity definitions continue to control capability discovery; Records and domain owners continue to control data access. This change does not create another entity schema or train a model.

## Retrieval admission

`AtlasKnowledgeService.search` treats the vector index as an untrusted candidate locator. It bounds candidates to the requested limit (1–50), validates coordinates, strips extra index fields, and returns only admitted citations and scores.

Every request, including cache hits, performs one bounded canonical repository query joining tenant-scoped source, revision and chunk. Sources must be active, revisions ready and chunks ready. Source/version/revision/chunk/hash/passage bounds must match exactly. The canonical source permission replaces the index permission.

The `AtlasKnowledgeAdmission` owner adapter must then verify current record/parent authorization, current source version, deletion and scan eligibility. Unknown or unavailable owners must deny. The host now composes a built-in entity-linked attachment adapter when its authorizer is available. A supplied `atlas.knowledgeAdmission` overrides that default for other owner implementations. A standalone knowledge service without an adapter still returns no hits. Source registration or an index permission cannot enable retrieval on its own. Generic application retrieval retains read-only grants. The DEV attachment follow-up adds tenant- and actor-scoped owner ingestion grants; other ingestion continues to require its corresponding owner authority.

Search returns locators, not passage text. The deployed attachment passage loader repeats owner admission at disclosure and uses bounded canonical coordinates. The initial F5 admission tests were followed by authenticated DEV document-grounded chat and hybrid retrieval qualification; see the closure record above.

## Candidate cache

The process-local LRU contains sanitized candidate coordinates and scores, never answers, transcripts, passage text or permission decisions. Keys hash tenant, principal, plane, profile hash, authorization epoch, query and limit. Limits are 128 entries, 512 KiB of serialized keys/values and a five-second TTL. Returned values are copies. Failed index calls are not cached; oversized entries are bypassed. There is no shared in-flight request or distributed cache.

Live repository and owner checks always run, even when the authorization epoch is unchanged. Retraction and successful ingestion clear the local cache. Other processes may retain old candidates for up to five seconds, but stale/deleted/revoked candidates cannot pass live admission. Newly indexed candidates may therefore take up to five seconds to appear on another process.

`cacheStats()` exposes entry/byte counts, hits, misses and evictions without query text or entity identifiers. The byte budget measures serialized payload size, not total JavaScript heap overhead. Production latency and aggregate heap/load still require deployment qualification.

## BP assessment batching

The existing BP Manage list tool now executes owner assessments in ordered groups of four. Every item retains its Records admission, field projection, owner scope checks and disclosure filtering. The tool drains each batch before propagating a failure and schedules no following batch after failure or cancellation. It preserves population order, overlapping issue counts, partial coverage and the existing 20-record/100-evidence bounds.

The 3.5-second budget stops admission of another batch; it is not a hard timeout for an owner already executing. Owners must honor the provided abort signal and their own I/O deadlines. A batch can perform up to four reads before the aggregate evidence cap is reached. Results explicitly remain current independent reads, not a point-in-time snapshot.

The factory accepts server-only `concurrency: 1..4`, default four. This is bounded concurrent assessment execution, not a bulk SQL API: owner/Records call counts remain unchanged. No assessment answer cache is enabled without complete owner revisions and live admission.

## Ingestion and cleanup recovery

Failed revisions can be reindexed under the same immutable version/checksum; concurrent indexing and deleted/superseded revisions are not reported as successful replays. Source locks serialize readiness with retraction, preventing an in-flight indexing completion from reviving a removed source. Ambiguous external source IDs fail instead of choosing an arbitrary source kind.

Retraction marks canonical evidence ineligible before attempting index removal. A failed removal remains safe and can be retried with the same source coordinates. There is no new background cleanup worker or recovery lease for a process that dies mid-indexing; operational recovery of an abandoned `indexing` revision remains required.

## Verification and measurement

Run from the repository root:

```sh
pnpm --filter @athyper/server-platform-ai test
pnpm --filter @athyper/server-platform-ai typecheck
pnpm --filter @athyper/server-contract-ai typecheck
pnpm --filter @athyper/server-platform-host typecheck
pnpm --filter @athyper/server-db test:integration:atlas-f5
ATLAS_F5_BENCHMARK=1 pnpm --filter @athyper/server-platform-ai exec vitest run src/__tests__/business-partner-list-insights.test.ts
```

The PostgreSQL test owns a disposable, labelled PostgreSQL 16.13 container and provisions canonical Neon, Mesh and Studio databases. It accepts only an optional disposable `--plane` selector, never deployed target credentials. It checks application-role retrieval against administrative ingestion, canonical supersession/deletion, live owner revocation, failed cleanup retry, failed ingestion retry and tenant isolation.

The opt-in benchmark writes `/tmp/atlas-f5-benchmark.json`. It executes the same actual coordinator/list path at concurrency one and four, with 20 authorized records, five repetitions and a synthetic 10 ms owner delay. Recorded median: **209.16 ms sequential; 53.74 ms at concurrency four**. Both perform 20 owner calls. This demonstrates reduced serial waiting under the fixture, not production database throughput or an SLA. Retrieval tests separately verify that two identical searches use one index call but two canonical and two owner admissions.

No live migrations, publication or deployment are part of this change. Deployed owner-adapter qualification, realistic multi-user load, database pool sizing and p95/p99 latency remain rollout exit gates.

Qualification: **362 AI tests, 8 host tests, three package typechecks, and PostgreSQL checks on all three planes passed**. See [recorded evidence](../architecture/business-partner/evidence/atlas-f5-retrieval-batching-20260910.json).

## Enabling the built-in attachment owner

No permissive feature flag is needed. The full Atlas host uses `createAttachmentRetrievalAdmission` by default. To make an entity-linked attachment eligible:

1. Publish the parent Meta Entity with `ai.enabled: true` and a read operation. Its ID field must be readable through Records. The request must pass both record-specific authorization and the normal Records collection-scope checks. Missing required work scope remains denied; scope is never inferred from the attachment.
2. Link the attachment series to that entity/record through the document owner. Prompt attachments (`atlas.prompt`) and content-library links (`content.item`) use different ownership rules and are excluded from this adapter.
3. Finish scanning and text extraction. Both attachment and series must be active, unexpired, and the attachment must be the series' current version. The adapter limits extracted UTF-8 text to 1 MB and examines at most 20 matching parent links.
4. Register the knowledge source with `sourceKind: "attachment"`, `sourceId: attachment.id`, and `entityCode` equal to the canonical link's entity type. Keep the canonical source permission appropriately restrictive. The owner independently requires `neon.collaboration.attachment.read`, `mesh.catalog.attachment.read`, or `studio.catalog.attachment.read`.
5. In the authorized ingestion job, set `sourceVersionId` to `attachment.id + ":" + attachment.sha256` and index the exact stored `extracted_text`, preserving Unicode and whitespace. Older incompatible version coordinates need reingestion. Passage coordinates use JavaScript UTF-16 indices, as the existing Atlas chunker does.

The adapter loads no text until parent and attachment authorization succeed. It then rechecks lifecycle/link eligibility and verifies the indexed chunk's SHA-256 against the current extracted text. Extraction changes under an unchanged file checksum therefore also invalidate stale citations. No signed URL or passage text is returned by admission.

For `record` or `content` knowledge sources, provide a separate registered owner adapter through `atlas.knowledgeAdmission`; the built-in attachment adapter returns false for those kinds. Do not substitute an unconditional allow callback. Custom ingestion and passage loading still need the corresponding owner authority.

Attachment-adapter follow-up: **40 attachment tests, 10 host tests, two package typechecks, and disposable PostgreSQL checks on Neon, Mesh and Studio passed**. [Owner-admission evidence](../architecture/business-partner/evidence/atlas-f5-attachment-admission-20260910.json). DEV CirrusAtlantic owner admission and reingestion are now qualified. Production persona and additional-owner qualification remain follow-up work.

## DEV deployment follow-up

The CirrusAtlantic synthetic document was uploaded and citation retrieval enabled
on 2026-09-10. See [deployment, access expiry and API limits](atlas-attachment-retrieval-enablement.md).
