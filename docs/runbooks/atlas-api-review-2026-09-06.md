# Atlas API review — 2026-09-06

Reviewed the local `stack-v2-foundation` working tree, based on commit `535cd9ac`, covering all 26 requested method/path pairs. This was a source review with local HTTP, service, SQL-compilation, and host composition tests. The development API and live AI providers were not called. Existing unrelated working-tree changes were preserved.

Both groups belong to Atlas AI. They expose different responsibilities and should remain separate.

| Route group | Responsibility | Access enforcement |
| --- | --- | --- |
| `/api/atlas` — 16 routes | Discover admission, manage conversations and participants, stream agent runs, preview/execute/cancel tools, inspect tool history | Authentication, injected thread authorization, runtime admission/model policy, and tool authority/permissions/confirmation checks |
| `/api/admin/atlas` — 10 routes | Configure tenant provider credentials, knowledge sources, action policies, confidence thresholds and quotas; read monitoring | Authentication and explicit admin authorization; host accepts effective `atlas.admin.manage` or legacy `ai.admin` |

There are **no duplicate method/path pairs** among these 26 routes. The PUT/DELETE pairs perform different lifecycle actions. GET/PUT quota endpoints read and update the same quota manager used by the runtime. Admission reports whether a caller may use capabilities; admin quota reports tenant limits and consumption. Tool execution consumes governance decisions; action-policy administration changes governance configuration. These are related operations, not duplicate implementations.

Route-contract permission strings are descriptive metadata, not an authorization middleware by themselves. The actual checks above matter. In particular, the user route contracts currently describe `neon.ai.agent.use`, while the admission resolver evaluates `${planeKey}.ai.agent.use`; tooling should not interpret that static Neon label as a complete description of every plane's permissions. Model and tool policy resolvers are injected dependencies, so the exact application of configured policies also depends on those implementations.

The following findings were fixed. P1 denotes authorization, unintended mutation, or concurrency integrity defects; P2 denotes validation, lifecycle, contract, or availability defects.

| Priority | Finding and trigger | Fix and evidence |
| --- | --- | --- |
| P1 | Host admin authorization checked only `permissions.allowed`, ignoring explicit denial, plan lock, and plane exclusion for the same permission. | Host now uses the effective-permission helper for both supported admin codes. Permission exclusion regressions cover all three restrictions. |
| P1 | Tool preview accepted arbitrary thread/run references without checking run ownership or correspondence. Valid foreign UUIDs could reach proposal persistence. | Preview validates UUIDs, checks thread access/active status, and verifies run tenant, plane, principal, and thread before creating a proposal. The host supplies its run repository. Four mismatch regressions verify no proposal is created. |
| P1 | Both policy PUTs read `expectedRevision` and then upserted without serialization. Concurrent callers could both pass the check and overwrite each other. Millisecond timestamp revisions could also collide. | Transaction-scoped advisory locks serialize each natural key before reading, including first creation. Opaque revisions include PostgreSQL `xmin` as well as the timestamp; this also accommodates the existing database timestamp triggers. Stale revisions return 409. SQL-driver tests verify lock-before-read, distinct revisions at identical timestamps, and no write or invalidation on conflict. |
| P1 | Public tool cancellation could transition an executing proposal to cancelled without stopping the downstream command. The command could succeed while its completion receipt failed to persist. | Public cancellation uses compare-and-swap only from proposed/confirmed; execution returns 409 `TOOL_IN_PROGRESS`. Worker cancellation retains its separate path. A paused-command regression verifies that cancellation cannot corrupt the eventual completion receipt. |
| P1 | Knowledge sources are unique by tenant, source kind and source ID, but retraction selected every source sharing the external ID. | Added optional `sourceKind`; ambiguous IDs return 409 before any update. The repository locks matching source rows and scopes changes to the selected internal source UUID. A regression verifies ambiguous requests do not mutate and qualified requests target one source. |
| P1 | Knowledge search filtered only the allowed-permission list, so a hit could survive an explicit denial of that same permission. | Search now uses effective permissions. A denied-hit regression verifies the citation is removed. |
| P2 | Admin helper validation and policy business-rule failures used generic errors, producing server errors instead of client errors; revision conflicts also lacked correct HTTP mapping. | Validation throws typed `INVALID_ARGUMENT`, conflicts throw `VERSION_CONFLICT`, and admin handlers reuse the Atlas problem-response mapper. Invalid providers, empty secrets, quota fractions, monitoring windows and policy conflicts have HTTP regressions. |
| P2 | Most conversation/tool request contracts accepted any object. Numeric coercion accepted null, booleans, empty strings or arrays; status was only type-cast; malformed optional fields could be silently ignored. | Added operation-specific body/query schemas, strict numeric/text parsing, UUID validation for tool references, and an explicit thread-list status enum. Tests cover malformed bodies, repeated query parameters, invalid identifiers and coercion cases. |
| P2 | Policy contracts rejected explicit nulls even though service types supported them. Revoking a missing credential returns null, but its response contract required an object. | Nullable policy fields now match the service contract; credential revocation declares object-or-null. Successful HTTP tests run with response validation enabled, including these cases. |
| P2 | Participant PUT allowed assigning member/observer to the owner, although DELETE already protected the owner. | Thread service rejects owner demotion before calling the repository. |
| P2 | Retraction marked revisions deleted before removing index content. If index removal failed, retries excluded deleted revisions and could never clean them up. | Retraction retains deleted revision IDs in its removal set, allowing retry. A fail-once index regression verifies the second attempt receives the same revision ID. |
| P2 | SSE ignored socket backpressure and selected event-stream headers before runtime preflight. Consumer shutdown could also close the generator without marking the run cancelled. | Streaming waits for drain, releases listeners on disconnect, and delays headers until an event exists. Runtime cleanup records cancellation when the request signal is aborted and still settles its quota reservation. Tests cover preflight, drain, disconnect, generator finalization and cancellation cleanup. |

The route coverage below corresponds to real local HTTP requests with mocked service dependencies and response-contract enforcement enabled. This verifies routing and contract behavior; deeper repository and provider behavior requires separate integration evidence.

| Method | Path | Reviewed behavior |
| --- | --- | --- |
| PUT | `/api/admin/atlas/action-policies` | Admin authorization, nullable fields, policy validation, optimistic concurrency |
| PUT | `/api/admin/atlas/confidence-thresholds` | Admin authorization, nullable fields, ordered bounded thresholds, optimistic concurrency |
| PUT | `/api/admin/atlas/credentials/:providerId` | Provider/secret validation, encryption-before-storage service path, metadata-only response |
| DELETE | `/api/admin/atlas/credentials/:providerId` | Provider validation, revocation, nullable response |
| POST | `/api/admin/atlas/knowledge/sources` | Source identifiers, permission label, optional entity code |
| POST | `/api/admin/atlas/knowledge/sources/retract` | Source selection, ambiguity rejection, deletion/retraction, index-removal retry |
| GET | `/api/admin/atlas/monitoring/calibration` | Admin authorization, bounded window, tenant-filtered aggregate query |
| GET | `/api/admin/atlas/monitoring/drift` | Admin authorization, bounded window, tenant-filtered aggregate query |
| GET | `/api/admin/atlas/quota` | Admin authorization, current tenant snapshot |
| PUT | `/api/admin/atlas/quota` | Admin authorization, positive safe integer limits |
| GET | `/api/atlas/admission` | Capability decision through injected resolver |
| GET | `/api/atlas/threads` | List authorization, status and pagination validation |
| POST | `/api/atlas/threads` | Creation authorization, title validation, 201 response |
| GET | `/api/atlas/threads/:id` | UUID validation, tenant/plane checks, read authorization |
| DELETE | `/api/atlas/threads/:id` | Delete authorization, legal hold, row version, 204 response |
| PATCH | `/api/atlas/threads/:id` | Manage authorization, title and row version |
| POST | `/api/atlas/threads/:id/archive` | Manage authorization and row version |
| GET | `/api/atlas/threads/:id/export` | Export authorization and configured message limit |
| GET | `/api/atlas/threads/:id/messages` | Read authorization and pagination validation |
| DELETE | `/api/atlas/threads/:id/participants/:principalId` | Participant authorization, owner protection and row version |
| PUT | `/api/atlas/threads/:id/participants/:principalId` | Participant authorization, role validation, owner protection and row version |
| POST | `/api/atlas/threads/:id/runs` | Request/attachment validation, runtime admission, streaming, disconnect cleanup |
| POST | `/api/atlas/tools/:proposalId/cancel` | Proposal ownership and safe cancellation transitions |
| POST | `/api/atlas/tools/:proposalId/run` | Argument hash, confirmation, policy/authorization recheck, execution transition |
| GET | `/api/atlas/tools/history` | Principal-scoped audit projection and limit parsing |
| POST | `/api/atlas/tools/preview` | Thread/run reference authorization and request validation |

Compatibility changes: policy revisions are opaque strings and now contain a transaction component; previously cached timestamp-only revisions receive 409 and should be refreshed. Omitting `expectedRevision` continues to request an unconditional update. Retraction callers can continue using an unambiguous `sourceId`; collisions require `sourceKind`. Malformed inputs that formerly coerced or disappeared now receive 400. Cancelling an executing tool now returns 409. Custom registrations enabling tool previews must supply the run repository; missing repositories fail closed. Production host wiring has been updated.

Validation completed:

- `pnpm --filter @athyper/server-platform-ai test` — **128 tests passed in 16 files**.
- `pnpm --filter @athyper/server-platform-ai typecheck` — passed, including test types.
- `pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/ai-vertical.test.ts` — **3 tests passed**.
- `pnpm --filter @athyper/server-platform-host typecheck` — passed.
- Whitespace/diff checks on the changed Atlas files — passed.

New review evidence is in `route-review.test.ts`, `repository-review.test.ts`, and the added SSE, runtime cancellation and tool-lifecycle tests under `server/packages/platform/ai/src/__tests__`.

Verification limits: SQL tests use Kysely's PostgreSQL compiler with a controlled driver, not a live PostgreSQL server. They do not prove production lock scheduling, RLS, grants, or external index behavior. Thread/run repositories and their authorizers are injected in this checkout; the tests do not certify an unseen deployment implementation. Monitoring intentionally routes through Neon in the current implementation, while several admin writes use the request plane; cross-plane operational expectations need deployment-specific verification. Retraction cleanup remains a database/index two-step operation, so failed index removal requires retry; these changes do not make it an atomic distributed transaction. No deployment, migration, or live provider call was performed.
