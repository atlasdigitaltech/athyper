# Business Partner request: Save draft plan

Status: source implementation and development preview completed; runtime publication and live draft creation are verified; live edit/reopen checks still require test-account update access. See [implementation status](save-draft-implementation.md).

## Objective and scope

Let an internal user save an incomplete Business Partner request, leave the form, reopen it and continue without losing entered values or document associations. Saving keeps the request in draft status. Internal manual supplier drafts do not start an onboarding cycle; submission requires the cycle template and starts it transactionally. This phase covers the existing internal supplier request form; customer-specific intake requires its own metadata and regression checks before claiming equivalent coverage.

Use the existing case, snapshot, attachment and protected-value infrastructure. No new draft table is needed. Implementation discovered and applied the existing Studio first-publication schema prerequisite; see the status report. Approval, submission workflow changes, operational Business Partner/bank creation, MESH collaboration and attachment links to materialized master records are outside this phase. Manual Save draft is the initial interaction; autosave is deferred.

## Current foundation and prerequisite

The capture implementation already includes incomplete-draft serialization, typed extension collections, protected bank references, attachment links and metadata-based draft reopening. Development preview revision 40 and intercepted browser checks passed. These are foundations to verify and close gaps in, not proof of live persistence.

The last runtime check found no published `master.business_partner` contract in NEON. First recheck the environment and publish/activate the matching contract through the supported process if it remains absent. Verify its payload validation accepts incomplete draft business fields while retaining structural constraints. Do not remove the contract check or activate an unrelated artifact to enable saving. Confirm that the published form and runtime contract are compatible before live tests.

## User behaviour

| Situation | Planned behaviour |
|---|---|
| Actions | Show Save draft separately from Continue to review. Neither saving nor reopening submits the request. |
| New request | Require selected role and authorized operating organization; resolve company context where required. Business identity fields may remain empty. |
| Save in progress | Show Saving… and prevent duplicate save actions. Serialize the values at the moment Save is pressed. |
| Success | Use the server response to show Draft saved, request reference and saved time. Stay on the current step and retain the returned request ID/version for later saves. |
| Changes during save | Changes made after serialization remain marked unsaved; the response must not overwrite them. |
| Reopen | Restore the saved profile view, scalar fields, repeatable rows, documents and masked protected identifiers. |
| Navigation | Warn when leaving with unsaved changes or unfinished uploads. No warning after a successful save if no further edits occurred. |
| Save failure | Keep form values and document state, show an actionable error and allow retry. Never show Draft saved before server acknowledgement. |
| Session expiry | Preserve the in-memory form where possible and request authentication. Do not persist raw bank data in browser storage. |

Labels, help text and field-validation messages resolve through the published Meta Entity contract and policy bindings. Common action/status messages use the platform's shared message mechanism. Avoid per-page copies of business rules or strings.

## Draft validation

Use an explicit server-enforced draft mode. Skip missing business-field requirements, minimum collection counts and required-document counts when saving. Continue to enforce authorization, supported fields, types, length limits, allowed reference values, collection limits, stable entry identities and document ownership/access checks for supplied values.

An empty bank row may be saved as incomplete. A supplied bank identifier requires sufficient country/type context for protected capture and must pass applicable validation. Raw identifiers must not enter request JSON, logs, browser persistence or review summaries. Existing masked values reuse their protected references; changing identifier context requires re-entry.

Show supplied-value errors inline and in a linked summary; focus the summary after a rejected save. Do not display missing-field errors merely because an incomplete draft was saved. Later submission must independently enforce complete policy requirements on the server; a client draft flag must never bypass submission validation.

## Persistence contract

| Store | Responsibility |
|---|---|
| `document.entity_case` | Stable request ID/reference, tenant, model/form pins, draft status, concurrency version and current snapshot pointer. |
| `snapshot.entity_snapshot_identity` | Immutable snapshot identity, payload hash, version/chain information and capture actor/time. Draft snapshots belong to `document.entity_case` and its request ID. |
| `snapshot.entity_snapshot` | JSON proposed fields and `relationshipProposals`, including stable collection entry keys and document references. |
| `document.attachment_link` | Pinned attachment associations at request/section/entry coordinates. |
| `document.entity_case_command_evidence` | Save outcome and before/after version evidence. |
| `event.command_execution` | Idempotent command execution and retry results. |
| `event.outbox` | Transactionally recorded save event. |

First save uses the existing create command with draft mode and a new idempotency key. Subsequent saves use the existing patch command with the same request ID, expected version and required base snapshot information. Keep the existing immutable snapshot/hash behaviour: changed accepted saves advance the current snapshot; retries replay their recorded result. Do not promise a new snapshot for a content-identical save without checking the existing snapshot deduplication rules.

Persist the case/snapshot changes, validated attachment links and command evidence in the database transaction. Return authoritative request ID, reference, version and saved state to the client. Protected-value capture and object uploads occur separately before this transaction; a failed save must not be described as rolling those operations back.

## Attachments

1. Upload through the existing managed attachment lifecycle. A file must reach the accepted active/scanned state before its attachment ID is saved as an attached document.
2. While upload or scanning is pending, explain why saving the selected document is not ready. Permit retry or explicit removal of a failed/pending document so the user can save the remaining data; do not silently omit it.
3. Store document metadata and stable target keys in the request snapshot; pin the accepted attachment version through `document.attachment_link`.
4. Reopening resolves authorized attachment metadata from stored references and displays the saved filename/status. An unavailable file must be identified explicitly without silently erasing the document entry.
5. Removing a row/document changes the current request contents. Retain prior pinned evidence according to the existing retention rules; do not delete the uploaded file as a side effect.

There is one file and potentially multiple associations. This phase creates request associations only. Later master-record links can reuse the same attachment version without copying the file. Use existing orphan-upload retention/cleanup for uploads that never become part of a saved request; verify that policy rather than adding a cleanup workflow here.

## Retry, concurrency and metadata changes

Reuse the same idempotency key for a retry of the same serialized command after an uncertain response. A changed command gets a new key. Distinguish an unknown network outcome from an explicit server rejection, and reconcile the saved result before starting a duplicate create.

Preserve existing expected-version and three-way-merge behaviour. Where the server accepts a safe merge, reconcile its returned state without dropping newer local edits. Where it reports conflicting paths, keep local changes and explain the conflict; provide a reload/review route rather than silently overwriting the other version.

Reopening must respect the saved form/contract pins. Verify how pinned definitions are resolved today. If a compatible saved definition cannot be loaded, show an explicit compatibility error and retain the stored data. Do not reinterpret the draft under the latest metadata or silently discard fields. Automatic draft upgrade is outside this phase.

## Delivery order

1. Recheck and resolve runtime publication; verify draft-compatible runtime validation and saved-form resolution.
2. Exercise existing create/patch/reopen services and fix gaps in incomplete-draft validation, response state, idempotency and field preservation.
3. Complete Save draft feedback, dirty-state handling, errors, upload readiness and conflict presentation using existing shared controls.
4. Verify protected-value and document round trips, including entry reorder/removal and unavailable attachments.
5. Run focused automated checks, then live persistence tests with identifiable development fixtures. Record request/snapshot IDs and outcomes without raw protected values. Do not advance fixtures into approval or operational master creation.

## Acceptance tests

| Test | Expected evidence |
|---|---|
| Organization and role only | Draft saved and reopened with missing business fields preserved as incomplete. |
| Edit and save twice | Same case ID, updated current contents and retained previous changed snapshot. |
| Repeatable data | Registration, tax, classification, governance, certification and bank entries retain independent stable identities. |
| Protected bank identifier | Reopens masked; raw value absent from snapshot and command/audit evidence; unchanged masked save reuses the reference. |
| Document round trip | Actual upload and save succeed; reopen shows the correct file on the correct entry without a second file upload. |
| Pending/failed upload | No false saved-document state; retry or explicit removal preserves the remaining form. |
| Reorder/remove | Associations follow stable keys; removed entries disappear from current contents while prior evidence remains. |
| Duplicate click/network retry | One logical create/save result for the same idempotent command. |
| Concurrent edits | Safe merge or explicit conflict according to existing server rules; no silent lost updates. |
| Invalid supplied value | Inline and summary error; no success indication or partial case transaction. |
| Unauthorized save/document | Server rejects it even if client checks are bypassed. |
| Metadata changed since save | Compatible pinned definition used, or explicit compatibility failure; no silent data loss. |
| Leave/reopen | Unsaved-change warning is accurate; saved draft appears through the existing request navigation. |

Completion means real create, update and reopen have passed against NEON with database evidence, attachment round trips have passed, and capture has created no operational Business Partner or bank records. Intercepted browser payload tests alone are insufficient.

Related: [capture implementation status](request-data-and-documents-capture-implementation.md).
