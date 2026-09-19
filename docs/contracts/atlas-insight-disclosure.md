# Atlas insight disclosure v1 (BP-AI-03)

Implemented 2026-09-08. This is the shared evidence/disclosure foundation for BP-AI-04–08. It does not enable new BP tools, broader owner evaluation, automatic briefs, or Redis caching.

## Owner boundary

`AtlasInsightOwnerProjection` is internal. User-scoped owner adapters supply separately guarded scope, coverage, evidence, findings and registered action references. Every candidate requires at least one owner-registered disclosure claim. The policy checks claims against the verified request, including record, field, relationship, scope and derived-result authority as applicable. Metadata enablement and candidate state never grant that authority. Claims must represent the complete input lineage; adapters must not attach a public claim to a protected result.

`projectAtlasInsight` withholds restricted candidates even if their claims are permitted. It withholds entire findings/actions if any referenced evidence/action is withheld, and never maps denied evidence to missing data. Unapproved aggregate coverage becomes unavailable without counts. Broader service evaluation is rejected in v1. Independent protected-input outcome disclosure still requires a later qualified owner contract.

The resulting `AtlasInsightResult` contains scope, coverage, observation/freshness, findings, evidence and action IDs. `parseAtlasInsightResult` validates the exact bounded wire shape, states, dates, finite facts/counts, unique identifiers and reference closure. Extra diagnostics, arbitrary action URLs and nested raw owner objects are rejected. Both transport consumers and producers must use this parser. The model may explain these values but cannot create executable actions; action IDs are resolved through the application registry and reauthorized on use in subsequent phases.

An evidence revision declares either `record_version` or `projected_content_hash`. The latter is a citation revision only and must never be used as mutation concurrency authority. Role and company/organization scope belong to the result scope. Findings inherit that scope; different transaction scopes require separate results.

## Query-operation audit

| Surface | Enforcement |
| --- | --- |
| Entity and directory admission | Existing Records list executor resolves collection scope and read permission before repository access |
| Filter/operator | Published filterable field, readable field and configured operator checks in `query-service.ts` |
| Sort/group/projection | Published and readable-field checks before repository access |
| Search | Search availability requires a readable searchable field; repository descriptor now disables search on every unreadable field, for SQL and in-memory predicates alike |
| Search counts | Counts run over the same narrowed search predicate; hidden-field matches cannot influence totals |
| Relationships | Atlas gateway disables hydration and does not forward search, group or trusted relationship predicates; unregistered/dotted filter paths fail Records validation |
| Atlas counts and values | Existing gateway requests no counts, projects only requested fields, checks row cardinality and byte bounds |
| Owner errors | Gateway replaces Records diagnostics with a generic unavailable-query error before they can become tool output |

The search correction applies to ordinary Records consumers as well as Atlas. Repositories previously searched all descriptor-searchable fields after checking only that some searchable field was readable.

## Cache and durable history policy

`atlasInsightReuseKey` binds tenant, principal, plane, profile hash, authorization epoch, canonical scope (including filters/selection/as-of), descriptor versions, rule versions, all source revisions, intent and locale. Callers must obtain these coordinates server-side. Revision arrays are canonicalized; incomplete version coordinates are rejected. No semantic or cross-user reuse is permitted.

`AtlasInsightLineage` records the binding key, complete disclosure claims and validity interval. `mayReuseAtlasInsight` requires an exact binding match, positive age budget, unexpired validity and fresh authorization of every claim on every use. Missing lineage, revocation, changed revisions, future timestamps and authorization outages deny reuse. Provider validity/expiry must bound the lineage expiry; a configured maximum age independently limits reuse. Save, workflow, scope and definition changes must update the corresponding binding revisions. No cache store or Redis allocation is enabled by this phase.

`AtlasThreadService` accepts a server-owned disclosure authorizer keyed by durable message ID. Its implementation must load persisted, immutable lineage for the entire message, including evidence inherited from earlier turns and attachments, and reauthorize that lineage. It must deny messages without complete lineage. The gate applies to history responses, exports and subsequent model context. Runtime idempotent retry output uses the same gate; denied prose is omitted while the original terminal receipt is retained, without invoking the model or repeating a command.

**Durable lineage is connected as of 2026-09-09.** New messages persist an internal `atlas_message_lineage` envelope in the existing tenant/plane-protected `ai.atlas_message.citation_refs` column. User lineage is inserted with the message; assistant content, its digest and completed read evidence are finalized in one transaction. The existing terminal-message trigger makes that evidence immutable. No schema migration or data deletion is required. Internal lineage never becomes a browser/model content block.

The local-generation composition installs `AtlasDurableMessageAuthorizer` and `KyselyAtlasMessageLineageReader`, with `AtlasToolService.revalidate` connected to the real Records gateway. Before history, export, subsequent model use or idempotent output replay, the gate checks principal/tenant/plane/profile/epoch, content integrity, complete ancestry, current page/descriptor/scope admission, and attachment extraction where configured. Each read is executed again under current tool policy and owner authorization; the full authorized projection and source coordinates must match the stored digest. Reauthorization does not create a tool proposal, invoke inference, or execute a mutation.

User messages inherit the preceding message under the thread lock, including history omitted from the model budget. A dependency denial withholds subsequent mixed prose rather than redacting substrings. Cycles, skipped/missing ancestors, cross-thread ancestry and chains exceeding 200 messages deny replay. There is no cross-request authorization cache.

For model history only, adjacent stream fragments are coalesced and completed historical tool exchanges become clearly labelled data, without executable call identifiers. User-visible history and exports retain the original content. The local budget reduces output space before evicting history. If advertising new tools would erase every prior turn, a history-answer round omits that catalogue; the runtime rejects tools not advertised in that exact invocation. This preserves reauthorized facts/prose while retaining the pinned 4,096-token limit.

Legacy messages without lineage remain withheld; they are not retroactively certified. Mutation previews, unsupported/incomplete tool results and descendants of untracked/failed runs also remain withheld. Start a new thread for a new traceable conversation. Replaying mutation commands or reconstructing old protected prose is outside this contract. Thread metadata and immutable command receipts remain intact. Do not substitute thread membership or an unchanged profile hash for evidence authorization.

Persisted messages with mixed newly restricted and public prose are withheld as whole messages. Producers must include transitive evidence dependencies in subsequent message lineage, including user follow-ups that repeat protected context. Previously displayed material cannot be recalled. Revocation during an already-streaming live run and browser clearing still require BP-AI-02/08/09 qualification; the durable replay gates do not claim to recall text already displayed.

## Validation

Focused fixtures cover restricted facts, dependent signals/actions, counts, denied-versus-missing states, invalid wire references/diagnostics, scope denial, unsupported broader evaluation, cache binding changes, expiry, authorization failure, legacy history withholding and revocation across all replay surfaces. Records regression fixtures cover hidden search matches/exact counts and filter/sort/group/relationship denial. Runtime regression verifies retry withholding without duplicate inference or ledger writes.

Package tests/typechecks and the existing R9 gate provide local implementation evidence. Authenticated DEV/persona/browser and live-model qualification remain separate release gates; BP-AI-00 authenticated baseline closure is recorded separately in its 2026-09-09 evidence.

Local checks on 2026-09-08:

| Check | Result |
| --- | --- |
| AI contracts package tests | 4 passed |
| Platform AI package tests | 168 passed; subsequent final focused tests below include the added gateway assertion |
| Records package tests | 206 passed, 3 skipped (environment-dependent existing tests) |
| Final disclosure/history/gateway/runtime focused suite | 12 passed |
| AI contracts, Platform AI and Records typechecks (including tests) | Passed |
| `pnpm qualify:business-partner-r9` | Passed: 54 AI, 37 case-service and 3 provisioning checks |
| `git diff --check` | Passed |

The initial 2026-09-08 checks did not include authenticated browser/live-model evaluation or deployment; subsequent closure evidence is recorded below. No database migration or Redis configuration change was performed.

## Durable replay closure — 2026-09-09

[Sanitized DEV qualification evidence](../architecture/business-partner/evidence/bp-ai-03-replay-20260909.json) records successful deployment and qualification of the enabled BP summary replay path. Raw transcripts, session state, fixture coordinates, image/configuration snapshots and exact rollback arguments remain under the owner-only `~/.athyper/instances/dev/receipts/bp-ai-03-replay-20260909/` directory.

| Check | Result |
| --- | --- |
| New authenticated BP summary with content-hash citation | Passed |
| Persisted history after page reload, export, same-request replay | Passed |
| Follow-up using reauthorized prior evidence in the pinned local model | Passed |
| Replay after API recreation, from a separate browser process | Passed |
| Temporary DEV tool-capability revocation | Prior assistant prose withheld from history/export/model context; stale retry rejected |
| Restore original capability configuration | Passed; API and Neon healthy; authorized replay restored |
| Runtime-role storage isolation | Owner sees six fixture messages; other tenant/principal/plane sees zero |
| Terminal lineage immutability | No-op update attempt rejected; no data modification committed |
| Platform AI / relay tests | 192 / 32 passed |
| Focused lineage, budget and unadvertised-tool tests | 9 passed |
| AI contracts, AI platform, host and relay typechecks; R9 | Passed |
| Production API and Neon builds | Passed |

The measured read took 3,026 ms; idempotent replay took 203 ms, and 310 ms after API recreation. These are individual observations, not a new percentile benchmark. The first live attempts exposed the missing export relay entry and excessive stream-fragment overhead in historical prompts; both were corrected before the passing evidence was captured.

The DEV API and Neon image changes are confined to these services. Existing flags are restored; no database migration, business-record mutation, IAM-grant change or Redis configuration change was required. The existing export endpoint is now reachable through the tenant-required Neon relay allowlist and retains the backend export/disclosure checks.

Live revocation used the existing Atlas tool-capability switch. Record/field denial, changed projected data, profile/epoch changes, attachment/scope revisions, missing ancestry and authorization failures have service-test coverage. This is not a claim that the broader BP-AI-09 multi-persona, visual/accessibility or future-tool rollout gates have passed.

Reproduce using a current authorized DEV session and synthetic fixture coordinates:

```bash
ATLAS_TEST_STORAGE_STATE=/private/current-neon-state.json \
ATLAS_TEST_RECORD_ID='<authorized BP UUID>' \
ATLAS_TEST_ORGANIZATION_ID='<authorized organization UUID>' \
ATLAS_REPLAY_RECEIPTS=/private/bp-ai-03-live \
node tooling/scripts/verification/qualify-atlas-message-replay.mjs

ATLAS_REPLAY_RECEIPT=/private/bp-ai-03-live/receipt.json \
node tooling/scripts/verification/qualify-atlas-message-lineage-storage.mjs

ATLAS_TEST_STORAGE_STATE=/private/bp-ai-03-live/state.json \
ATLAS_REPLAY_RECEIPT=/private/bp-ai-03-live/receipt.json \
node tooling/scripts/verification/qualify-atlas-message-replay-revocation.mjs --apply

ATLAS_TEST_STORAGE_STATE=/private/bp-ai-03-live/state.json \
ATLAS_REPLAY_RESUME=/private/bp-ai-03-live/receipt.json \
ATLAS_REPLAY_RECEIPTS=/private/bp-ai-03-after-restart \
node tooling/scripts/verification/qualify-atlas-message-replay.mjs
```

The revocation runner explicitly recreates DEV API and restores its previous Compose configuration in `finally`; it is an operational qualification command. The private rollback overlay pins the pre-change immutable API/Neon images, with full Compose arguments in `rollback-command.json`. Retain those images and files; rollback does not alter or delete durable message or command evidence.
