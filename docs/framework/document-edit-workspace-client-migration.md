# Document edit workspace lifecycle

Active document clients save through the workspace lifecycle:

1. `POST /api/runtime/v1/entities/:entity/:id/edit/open` obtains the scoped workspace capability.
2. `POST /api/runtime/v1/entities/:entity/:id/edit/submit` commits header and line changes.
3. Every submit sends `X-Document-Edit-Workspace`, `If-Match`, and `Idempotency-Key`.

`useDocumentEditDraft` owns dirty fields, masks, conflicts, autosave, and save status.
`submitWorkspaceChanges` and the document edit coordinator own transport.

## Retry rule

An interrupted or timed-out submit has an ambiguous outcome. Retrying the same logical
request must reuse its original idempotency key and `clientSeq`. A stale workspace may be
refreshed with one OPEN and retried once using those same values.

Changing the ETag or changes creates a new logical request and therefore a new idempotency
key. Definitive HTTP responses complete the attempt; only transport failures retain it for
retry.

## Operational controls

All supported document entities use workspace submit. There is no alternate save transport
or dual-write path. `DOCUMENT_EDIT_SAVE_AND_TRANSITION_DISABLED` independently blocks
workflow transitions while leaving ordinary workspace saves enabled.

Structured `[document-edit/metric]` events cover save result and latency,
workspace validation and refresh reasons, ETag and validation failures, idempotency replay,
draft recovery/discard, and workflow compensation state. Capability values and document
workspace tokens must never be included in these events.
