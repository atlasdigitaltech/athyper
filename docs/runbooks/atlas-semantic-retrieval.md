# Atlas hybrid passage retrieval — DEV CirrusAtlantic

The local runtime now uses semantic embeddings and keyword search for linked Meta
Entity attachments. Parent AI-enabled metadata and read operations remain required.
The current live fixture is CATL-BP-001, used by `catl.admin`.

## Configuration and model

`ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH` selects a server-owned JSON file; DEV mounts
[semantic-retrieval.json](../../deploy/config/atlas/semantic-retrieval.json).
Absent configuration retains the previous lexical mode for rollback. An enabled
but unavailable embedding provider fails closed; it does not silently change mode.

- Encoder: `nomic-embed-text:v1.5`, 768 dimensions.
- Manifest digest: `sha256:0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`.
- Embedding requests verify the model digest, use document/query task prefixes,
  disable truncation, and validate finite nonzero vectors of the expected size.
- Documents and questions use the existing isolated local Ollama endpoint.
  The model was provisioned from the official registry through the host, with all
  four blob checksums verified. The inference container remains network-isolated.
- Meilisearch uses user-provided vectors in the separate versioned index
  `atlas_attachment_passages_neon_nomic_v15_0a109f`.
- Hybrid semantic ratio: 0.75. Minimum ranking score: 0.78, enforced by search
  and checked again by the adapter. These are prototype settings, not a universal
  relevance calibration.

Implementation references: [Ollama embedding API](https://docs.ollama.com/api/embed),
[Nomic model](https://ollama.com/library/nomic-embed-text:v1.5),
[Meilisearch hybrid search API](https://www.meilisearch.com/docs/reference/api/search/search-with-post).

## Indexing, disclosure and bounds

The existing authenticated attachment reindex endpoint backfills every ready
canonical chunk into the semantic index, including when the canonical revision
already exists. Successful asynchronous index tasks are awaited. Chunk IDs are
stable document keys; repeated backfills replace the same entries. The previous
lexical index and canonical source/version/checksum are preserved.

Search filters tenant, entity, parent record and embedding-model digest before
ranking, then rechecks those fields. Search hits carry locators only. Canonical
source/revision/chunk admission and live parent/attachment owner checks remain
mandatory. Stale or disabled entries retained in search cannot authorize disclosure.
Selected chunk IDs are retained in durable message evidence for history and replay.

Ingestion retains the existing 1 MB extraction limit and batches at most 16
embeddings. Retrieval returns up to eight candidate passages. Chat packs whole
ranked passages into 2,000 total characters, at most one per document and three
documents, subject to the unchanged 4,096-token local model budget. It can select
later chunks; it does not claim exhaustive synthesis of arbitrary long documents.
No unbounded caches, model-context expansion, or permissions were introduced.

## Qualification and recovery

```sh
node tooling/scripts/verification/enable-atlas-attachment-retrieval.mjs
node tooling/scripts/verification/qualify-atlas-semantic-retrieval.mjs
node tooling/scripts/verification/qualify-atlas-document-chat.mjs
node tooling/scripts/verification/qualify-atlas-document-history.mjs
node tooling/scripts/verification/verify-atlas-attachment-enablement.mjs
```

The enablement command reindexes the existing fixture; it does not upload a new
one. Valid DEV Neon `catl.admin` storage state is required. The history command
briefly disables and restores this synthetic canonical source; avoid concurrent
qualification of the same fixture.

The semantic receipt records exact-name retrieval, two specific paraphrases,
two unrelated no-match questions, and a vague no-match question, with measured
request duration. The threshold was adjusted after an initial unrelated weak
match; these six fixture cases are regression checks, not an independent benchmark
or production-load qualification. A no-match request must not claim document evidence.

Host tests cover vectors, model pinning, scope filtering, later-passage selection,
canonical extraction checks and denied access. The live document contains one
chunk. A second synthetic upload was denied at staging under the current grants;
no second document was uploaded and no permissions were broadened. Later-passage
loading is therefore locally tested, not independently qualified against a second
live document.

The private deployment directory is
`~/.athyper/instances/dev/deployments/atlas-semantic-20260910/`.
Its `rollout.json` selects the hybrid API and mounted configuration. `rollback.json`
restores the previously healthy grounded-chat image
`athyper-runtime-server:atlas-pre-semantic-20260910` and the original environment.
Do not commit or print those deployment files. Rollback retains document data and
both indexes. Model/index upgrades require a new pinned configuration, a separate
index, reindexing, and renewed qualification.

The existing temporary attachment grant expires **2026-09-11 01:15 UTC**
(**09:15 Kuala Lumpur time**). The hybrid change does not extend it.
