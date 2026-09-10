# Atlas F4: reviewed vocabulary publication

F4 adds an explicit correction → Studio review → held-out evaluation → draft → independent approval → signed publication → activation workflow. The first supported correction is a short English term for `entity_read_record` (record summary), shared by Business Partner and the second entity. This is metadata learning; it does not retrain a model or modify authorization.

## Using the workflow

1. Ask Atlas a question on a saved record using the current definition. Submit **Wording** or **What I meant** feedback with a wrong, partial, or missing assessment.
2. Enter a general term under **Term for record summary**, then choose **Share term with Studio**. Send vocabulary only, without names or confidential record values. The term, intended capability and source coordinates go to reviewers; the conversation is not copied.
3. Open Studio `/atlas/learning`. A different person with `metadata.entity.review` and `metadata.entity.author` supplies two new positive questions and a negative question. For example, for “company snapshot”: “Show this company snapshot”, “Could you display the current company snapshot please?”, and “Delete this company snapshot”.
4. **Evaluate and create draft** checks improvement against the source definition, validates the graph, allocates a new tenant change set, and stores the exact fixtures and result hash. Failure leaves the candidate pending and creates no draft. Test questions never enter the runtime vocabulary.
5. **Submit draft for approval** requires `metadata.entity.submit`. Another authorized person approves with `metadata.entity.review`; authors and submitters cannot approve their own draft. **Publish** requires `metadata.entity.publish` and uses the existing signed publication pipeline for the originating plane.
6. Review delivery status. A reviewed or approved draft is not active vocabulary. Only the active runtime descriptor changes routing. **Retry delivery** requeues the same prepared release; it creates neither another change set nor another release. Existing publication operations handle terminal worker failures and rollback.

The inbox is available only when Studio authoring/publication is configured. The host registers a typed internal handoff from the origin service; there is no public arbitrary-import endpoint and Studio does not read origin transcripts. A standalone deployment without this registered bridge cannot accept delivery. Failed delivery keeps the origin candidate, and the same request/candidate ID can be retried.

## Boundaries and evidence

- Each proposal binds an existing completed response and its feedback, tenant, principal, origin plane, source release, contract hash and descriptor hash. New runs record the source hashes. Older feedback lacking this lineage requires a new question on the current record.
- Candidate IDs and immutable proposal hashes make retries idempotent; mismatched retries conflict. Database foreign keys bind feedback ownership, events and proposal coordinates. Review transitions use locked rows and expected revisions, with independent-review and tenant-draft checks.
- The origin service checks current response disclosure. Before review/publication, the registered source attestation checks that the source still exists and is unexpired. A removed conversation invalidates unpromoted learning. The proposal expires no later than its conversation expiry or 30 days. Reviewed publication evidence and published terms have an independent lifecycle; withdrawing published vocabulary requires a reviewed replacement or rollback.
- Studio promotes only a tenant-owned source release with a matching registered runtime artifact. Tenant feedback cannot publish a global/platform definition. Stale releases, conflicting terms, changed graphs and unsupported targets fail closed. Rebase by asking against the current release and submitting a new proposal.
- `ai.vocabulary` is an optional version-1 contract with explicit English locale, bounded exact phrases, declared provider targets and provenance. No vocabulary leaves the server as provider instructions. Runtime intersects terms with current descriptor hashes, admitted registered tools, permissions and profile restrictions. English locale fallback is limited to `en`/`en-*`.
- New publication preparation preserves the existing native runtime descriptor and changes only its AI vocabulary. It atomically creates the immutable per-plane artifact and publication link with the entity release. The worker signs canonical runtime content; the verified loader checks the contract signature, descriptor hash, references and equality with authored AI metadata. SQL snapshot coordinate hashes remain distinct from runtime content hashes; both legacy source forms are verified against the exact source artifact.
- Snapshot revision numbering is separate from the change-set optimistic lock version. Publication captures/reuses the latest validated graph checkpoint and checks its content against the signed graph.

The first slice does not promote field aliases, role meanings, readiness/eligibility corrections, record-name resolution, fuzzy matches or other locales. Those require their own typed target contracts and evaluation coverage. Platform-global promotion, remote service transport, automatic clustering and background retention reconciliation remain follow-up work. Origin conversation purge cascades through response-bound feedback/candidates; pending Studio copies remain under the bounded proposal retention window and require operational cleanup. No automatic training or candidate-to-runtime index is installed.

## Database and rollout

Apply these migrations using the existing forward migration runner, after the F3 migration:

- All planes: `20260910_atlas_learning_common.sql`.
- Studio: `20260910_atlas_learning_studio.sql`.

Canonical definitions are in marked F4 blocks under common AI and Studio AI DDL. Check/rebuild migrations with:

```sh
pnpm --dir server/db db:verify:atlas-learning
pnpm --dir server/db db:generate:atlas-learning
pnpm --dir server/db test:integration:atlas-f4
```

The integration command owns a disposable PostgreSQL container and accepts no deployed target. An optional `--plane=studio` selects the Studio qualification. It checks fresh provisioning, forward migration, response-bound proposal capture, retry, tenant isolation, review/evaluation, real authoring release creation, signed publication delivery, activation and rollback.

Deploy the reader/host changes before publishing vocabulary-bearing descriptors. Confirm Studio permissions, the origin-to-Studio service bridge, signer, publication workers, artifact store, target projection adapters and database service privileges. The source must be a supported tenant definition; there is no automatic conversion of existing global Business Partner metadata. Publication/activation is explicit and independently tracked. Application rollback should first restore a compatible prior descriptor via existing publication rollback; old readers reject unknown vocabulary properties.

No live database migration, tenant publication or deployment was performed as part of this build. Disposable integration fixtures use privileged authoring connections and the restricted runtime role for source isolation; deployed service-role qualification remains part of rollout.

## Build verification

611 package/vertical/client/UI tests passed, along with 11 typechecks and test-reachability verification. Disposable PostgreSQL qualification passed on all three planes; Studio additionally verified real Ed25519 delivery, activation, retry and rollback, including compatibility with legacy snapshot hashes. See [the recorded qualification evidence](../architecture/business-partner/evidence/atlas-f4-reviewed-learning-20260910.json).

Public authoring routes enforce Studio/tenant scope. Platform-scoped change sets additionally require platform catalogue management; browser-supplied break-glass evidence is not accepted as independent review authority.
