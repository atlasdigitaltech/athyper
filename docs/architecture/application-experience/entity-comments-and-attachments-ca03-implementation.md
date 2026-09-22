# CA-03 policy and authorization admission

CA-03 makes the published MetaEntity capability definition the single admission contract for Entity App comments and attachments. It adds no browser-facing storage binding and does not enable a new Business Partner operation. The current Business Partner release still publishes only its declared public/private comment behavior and the five declared attachment operations.

## Admission boundary

`createEntityCapabilityPolicy` in `server/packages/platform/experience` resolves the current, verified compiled release for the verified request context. Before returning a projection or allowing a handler, it requires all of the following:

- a matching tenant, principal, plane and entity release coordinate;
- an enabled Core capability and a declared Operation binding action;
- current parent-record admission through the entity descriptor and Records query;
- the action permission against the verified request context;
- server-loaded comment/attachment coordinates, visibility, content limits, MIME limits, revision and idempotency requirements.

The resolver is used by generic entity operation dispatch, collaboration commands, and direct attachment routes. A browser capability projection is display data only. It cannot supply an action, record, attachment, comment, policy hash, release hash, or audience decision. A new authorization check resolves the active release and current parent admission on every request, so a revoked collaborator or superseded release cannot use an earlier browser response.

## Audience and attachment rules

Comment subjects are loaded by ID in the active tenant and parent coordinates. Public is readable after parent admission. Internal requires current record participation. Private is author-only. A reply may keep or narrow the parent audience but cannot broaden it. Mention recipients are not accepted from a caller-supplied ACL; until a participant-directory admission adapter is published, only a self-reference can pass this boundary.

An attachment route obtains entity coordinates, admitted policy hash, draft owner and comment association from its own tenant-scoped query. It never trusts those values from the request. A draft upload must reference a draft owned by the requesting principal and is not given a record-context link. The comment association transaction requires the active attachment to be owned by that principal and to belong to the same draft coordinates. It writes the immutable comment link and clears the draft marker atomically. That transaction is the current explicit transition from principal-only draft visibility to record/comment visibility.

Attachment download checks the pinned comment's audience before generating bytes. Finalization rechecks the active policy hash. Direct archive, preview, history and unlink lack a declared owner action in the current published definition, so the policy rejects them before a lifecycle handler can run. CA-04 introduces any later unlink owner operation; CA-05 and CA-09 introduce readers only with their own published actions.

## Alternate paths and database guard

Collaboration create, edit, archive, reaction, draft, read and flag commands call the same policy boundary. Mention resolution and notification events occur only after that admission; no comment AI or search reader is registered in this stage. The direct comment reader remains parent-admitted and excludes private comments for non-authors.

All three plane RLS definitions now require a visible parent comment before a `document.comment_mention` or `document.comment_reaction` row can be selected. This prevents a same-tenant query from using those child relations to infer a private comment. Tenant separation, private comment visibility, comment history, flags and moderation remain RLS-protected.

## Validation

The disposable container `athyper-ca02-local-20260921` is explicitly labelled `athyper.environment=disposable_local`. Its Neon, Mesh and Studio databases were recreated from the source manifests. The CA-02 integration fixture was extended to prove that a second same-tenant application principal cannot read a private comment, revision, mention or reaction; it also verifies cross-tenant isolation. Every fixture transaction rolls back.

Validation completed:

- `pnpm --filter @athyper/server-platform-experience exec vitest run src/entity-capability-policy.test.ts src/entity-section-service.test.ts` — 16 tests passed.
- `pnpm --filter @athyper/server-platform-collaboration exec vitest run` and `tsc --noEmit` — 49 tests passed.
- `pnpm --filter @athyper/server-service-attachments test` and `typecheck` — 48 tests passed.
- `pnpm --filter @athyper/server-platform-host exec tsc --noEmit` — passed.
- fresh Foundation manifests and `entity-collaboration-ca02.sql` — passed for Neon, Mesh and Studio.
- `entity-capability-ca01.ts athyper-ca02-local-20260921` — Studio authoring, compiler, signature verification and Neon activation passed.

The compact policy tests cover denied parent admission, stale tenant/principal/plane/entity projection, target coordinates outside the parent record, another user's private thread, revoked internal participant, reply escalation, unadmitted mention, and attachment download pinned to a private comment. The existing direct-route test confirms a policy denial occurs before attachment finalization mutates lifecycle state.
