# CA-07 participant, history and draft-retention implementation

Implemented locally on 2026-09-21. This record describes source implementation and disposable-database verification; it is not a DEVFULL activation receipt.

## Admission and mentions

`createRecordParticipantResolver` is the canonical candidate/search contract. Search examines at most 50 candidates and returns at most 20 admitted principals. The host loads active tenant principals, resolves each candidate's fresh plane permission snapshot, and runs the owning entity's record reader admission. It never copies the requester's permissions or elevated authentication to a candidate. Subjects requiring unavailable organization/authentication context are conservatively excluded.

The authenticated `/api/collab/participants` route and generic `comments.mention` dispatch both require the current published action and parent admission. Rich-content mentions are extracted server-side and revalidated for create/edit/draft commands. Private comments allow only their author; edits use the stored audience even if an API caller supplies a broader one. Unsupported legacy content-item mention/history calls fail closed.

## Revisions and reporter feedback

`GET /api/collab/comments/:id/history` and generic history dispatch resolve the current capability, parent and target audience. History additionally requires the author, matching existing revision RLS. The repository returns immutable revisions in descending order, with an exclusive revision cursor, default page size 20 and maximum 50. It exposes rich content and timestamps, not reviewer evidence.

Inline rich editing sends the expected revision. A failed edit retains text; loading saved history does not refresh/unmount the editor. The user can explicitly adopt the reviewed revision while retaining unsaved content. A subsequent concurrent change still fails the server revision check.

The shared section reader projects only the current reporter's flag status and governance decision code. Reviewer notes/evidence are absent. Removed comments project tombstones with no text, rich content, reactions or pinned-file chips; reporter feedback remains available. Governance retains decision ownership. The child-resource revision hashes the projected data, including report/reaction changes, rather than only the newest comment timestamp.

## Draft retention and maintenance

`commentBinding.draftRetentionDays` is optional, defaults to 30 days and accepts integers 1–365. The server derives it from current published metadata; request bodies cannot set retention. Canonical DDL adds `document.comment_draft.expires_at` and its bounded-scan index. Successful draft saves refresh the deadline; restore and attachment association exclude expired drafts. Cancellation advances the deadline for maintenance instead of deleting a referenced draft immediately.

The existing five-minute plane attachment reconciliation job owns the cleanup schedule. In its transaction, `expireCommentDrafts` locks at most 100 expired drafts with `FOR UPDATE SKIP LOCKED`. Comment association takes the same draft locks. Cleanup detaches obsolete draft linkage; only owner-uploaded attachments without any series association can become orphaned. Shared attachments remain active. The host appends durable `attachments.orphaned` outbox intent in that same transaction.

Cleanup never calls object storage. Retention and legal holds remain intact. Existing attachment reconciliation/purge owns deterministic purge scheduling and rechecks links, retention and active holds before deleting bytes. A held orphan can remain retained indefinitely.

## Source integration

Business Partner authoring, presentation and handler review evidence use `metadata/products/mdg/`. Operation JSON Schema and the closed-shape catalog include draft retention. Mention/history actions are enabled in source after their admission handlers were wired and tested. Compiler-produced release hashes remain authoritative; no release-envelope activation was performed. The existing folder declaration was corrected to the revision concurrency already required by the parser; no folder command implementation was changed in this slice.

Neon, Mesh and Studio BFF registries now admit the collaboration routes while retaining the relay's authentication/tenant/CSRF boundary. Runtime/service code and DDL remain in their owning packages. `New_Entity` was not edited or recreated.

## Verification

- Collaboration: 52 tests passed, including stale edit and denied history service checks.
- Experience: 15 focused participant/current-policy tests passed, including revoked recipients, private-audience spoofing and another author's history denial.
- Publication contracts: 35 tests passed, including invalid retention bounds and handler/feature consistency.
- Typechecks: collaboration, platform host, form detail, collaboration UI and BFF relay passed.
- Metadata authoring validation: 113 artifacts passed.
- Fresh Neon foundation provisioning passed in `athyper-ca07-local-20260921`, a labelled disposable container with no published ports.
- Existing CA-02 SQL fixture passed against the fresh database: revision concurrency, immutable history, canonical reporting and application-role/tenant isolation.
- `comment-draft-ca07.ts` passed using real concurrent PostgreSQL connections: locked save versus expiry, renewed deadlines, cancellation, shared references, retention/legal holds, transaction rollback on durable-intent failure and replay. The same fixture exercises the history repository as the application role, including exclusive paging, stale edits and denied ownership.

Reproduction:

```bash
pnpm exec tsx server/db/scripts/provisioning/foundation-runner.ts --plane=neon --container=athyper-ca07-local-20260921
docker exec -i athyper-ca07-local-20260921 psql -U postgres -d athyper_neon < server/db/scripts/tests/integration/entity-collaboration-ca02.sql
pnpm exec tsx server/db/scripts/tests/integration/comment-draft-ca07.ts athyper-ca07-local-20260921
python3 tooling/scripts/metadata/validate.py
```

Provision only an empty disposable database. The TypeScript fixture refuses non-disposable containers. It creates synthetic records; it does not touch application data.

## Remaining acceptance boundary

This resolves the server-contract dependencies listed in the current CA-07 request. CA-07 as a whole remains in progress: grouped reply presentation and the multi-actor browser journey still need acceptance. DEVFULL needs its coordinated schema application, dependency-complete publication and activation receipts before any of these source features are considered live. Existing local application databases were not modified.
