# DEV CirrusAtlantic attachment retrieval

Completed on 2026-09-10 for `catl.admin` and CATL-BP-001. The synthetic fixture is
uploaded, scanned, extracted and indexed through the normal document owner flow.
The API, Neon authenticated relay and record-page document-grounded chat are deployed and healthy.

- Attachment: `fc668e33-9d67-4015-83ba-8be70dfbb2c6`
- Parent: `business_partner / f7688c3d-8c92-5651-a469-da3f4f786375`
- Knowledge revision: `6f2a53ae-330a-442a-81bf-61f329422e68`
- Source version: attachment ID + `:` + scanned file SHA-256.
- Extraction: 1,473 UTF-16 characters, one indexed chunk. The revision checksum
  matches the actual stored extracted text, including Unicode and whitespace.
- Parent metadata: previously published runtime release 18.

[Verification receipt](../examples/atlas-f5/cirrus-attachment-enablement.verified.json)
and [authenticated checks](../examples/atlas-f5/cirrus-retrieval-qualification.json).

## Available capability

Atlas on a Neon record page now retrieves matching linked documents and answers
from their verified extracted text. In CATL-BP-001, ask:

> According to the synthetic document attached to this partner, what is the fictional project name and its review interval? Cite the document and identify the facts as synthetic.

The authenticated browser returned **Indigo Lantern**, **17 days**, and
`cirrus-synthetic-bp-document.txt`, explicitly identifying the facts as synthetic.
The answer and source are visible in the workspace and retained in authorized
conversation history. See the [chat receipt](../examples/atlas-f5/cirrus-document-chat.qualification.json)
and [history withdrawal receipt](../examples/atlas-f5/cirrus-document-history.qualification.json).

Retrieval now combines local semantic embeddings with keyword matching in
`atlas_attachment_passages_neon_nomic_v15_0a109f`. Each search document represents
one canonical passage. The query embedding uses the original question; the keyword
component removes conversational stopwords. The pinned local encoder is
`nomic-embed-text:v1.5`, 768 dimensions. No document text is sent to a cloud model.

The API returns at most eight admitted passage locators. Chat selects whole ranked
passages, up to one per document, at most three documents and 2,000 total passage
characters, within the existing model context budget. It now loads the selected
passage rather than always taking the first chunk. Citation text includes canonical
character offsets. Resource limits remain intentional; oversized complete prompts
are rejected rather than silently truncating evidence. Candidate admission remains
request-scoped. See [hybrid configuration and qualification](atlas-semantic-retrieval.md).

The loader refreshes IAM authority, checks current parent Records admission and
attachment access, and verifies canonical revision, source version and passage
checksum before model invocation. Quoted text is untrusted evidence. Document
answer rounds expose no action tools. Grounded prose is buffered until owner
admission and evidence hashes are rechecked; sources and prose are then disclosed
together. Saved answers and replay use the same live owner checks. A live source
disable withheld the saved answer, and restoring the source restored access.
Permission or extraction changes during generation are covered separately by tests.
No-match requests are told that no document passages were admitted and must not
claim to have read a document. Historical record views do not load current passages.

The Neon BFF relays two authenticated, tenant-required, CSRF-protected POST routes
with 8 KiB request limits:

- `/api/relay/atlas/knowledge/attachments/reindex`
- `/api/relay/atlas/knowledge/search`

Both require `entityCode`, `recordId`, and current parent Records admission.
Reindex also requires `attachmentId`, attachment create/read permissions and the
current actor to own the attachment. Search requires `query`; it returns locators,
not extracted text, snippets or object-storage URLs. Optional `scopeCoordinate`
passes through normal Records scope validation. BP release 18 declares tenant-wide
directory scope, so no organization selector is required for this fixture.
An entity whose Records owner requires work scope continues to reject missing scope.

The API derives source kind, source permission, version and text from the owner;
caller-provided text, permission codes and version values are not authoritative.
Indexing is bounded to 1 MB of extracted UTF-8 text. Every returned locator repeats
canonical source/revision checks and live attachment owner admission, including
parent membership, current series version, expiry, scan/extraction state and chunk
checksum. Changes or revocations cannot be authorized by index contents alone.

Generic attachment permission checks use attachment resource coordinates. They do
not present an incomplete Meta Entity operation coordinate. Parent access remains
an independent authorized Records query, which checks the published operation.

## Database and access boundaries

`20260910_neon_attachment_knowledge_writer.sql` adds INSERT/UPDATE privileges with
RLS for the three knowledge metadata tables in Neon. Policies restrict writes to
current-tenant, current-actor-owned entity attachments and the fixed attachment-read
permission. Arbitrary record/content sources, other owners, permission substitution,
and cross-tenant writes remain denied. No scan/extraction flags were set manually,
and no existing actor grants were broadened during this upload.

The existing synthetic attachment grant expires **2026-09-11 01:15 UTC**
(**09:15 Kuala Lumpur time**). Retrieval continues to enforce current permissions;
it is not a permanent access grant. `catl.owner` was denied at Atlas admission in
the live negative check. Attachment-specific denial/freshness cases are separately
covered by owner and retrieval tests.

## Verification and recovery

```sh
node tooling/scripts/verification/verify-atlas-attachment-enablement.mjs
node tooling/scripts/verification/qualify-atlas-attachment-retrieval.mjs
node tooling/scripts/verification/qualify-atlas-document-chat.mjs
node tooling/scripts/verification/qualify-atlas-document-history.mjs
```

The retrieval check requires valid named sessions and exercises idempotent reindexing.
The chat checks use the saved DEV Neon `catl.admin` session. The history check
briefly disables only this synthetic canonical source using tenant/actor-scoped
owner row-security rules, then restores it in `finally`; do not run it during another
qualification of the same fixture.
Do not rerun the initial upload script to create another fixture. The manifest
records the existing attachment and knowledge revision for recovery.

Validation: 48 focused tests passed (7 host boundary, 3 attachment owner, 6 retrieval,
32 BFF security), plus host/attachment/BFF typechecks. Live HTTP checks verified
successful retrieval with varied wording, repeat-ingestion reuse, published tenant
scope behavior, unavailable-record denial and denied-user behavior. Rolled-back
PostgreSQL checks verified owner-only source/revision/chunk writes, immutable source
permission restrictions and tenant isolation. These are functional checks, not a
production concurrency or latency qualification.

To stop retrieval, an authorized operator can disable the tenant's canonical source
through the knowledge owner; canonical admission then rejects retained index hits.
Preserve the attachment and evidence unless deletion is separately intended. API
and web rollback specifications are retained in the private owner-only directory
`~/.athyper/instances/dev/deployments/atlas-retrieval-20260910/`, under `api/rollback.json`
and `neon-web/rollback.json`. These contain deployment configuration and must not
be committed or printed. Image rollback does not remove stored document/index data
or reverse the row-security migration.
The healthy citation-only API can also be restored with `api/grounding-rollback.json`
in that directory. During deployment, that rollback was used to recover from a
missing module; the final grounding image passed a module-import preflight before
rollout. Final containers are healthy.

Chat validation: the AI suite passed 362 tests with one skipped; 16 host retrieval/grounding tests and the host typecheck passed. After the final prompt-budget fix, four runtime/budget tests were rerun, followed by the successful browser and saved-history checks. These checks do not establish production load performance.

The hybrid extension passed 25 host tests and the host typecheck. The AI suite passed 362 tests with one skipped; four runtime/budget tests passed after the final citation update. Authenticated semantic qualification covers three positive questions and three no-match questions. Later-passage loading is tested locally; live chat qualification uses the existing one-chunk fixture.
