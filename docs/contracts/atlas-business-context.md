# Atlas business context v1 (BP-AI-02)

Implemented on 2026-09-08. This is context transport and admission, not a new insight provider or an authorization grant.

The shared contract is `AtlasBusinessContextV1` in `@athyper/server-contract-ai`. The browser imports only the dependency-free `@athyper/server-contract-ai/business-context` subpath. Its strict JSON schema is used by the HTTP route; the same bounded parser runs in the browser and service. The browser runtime's dependency budget increases by one for this shared contract.

Common fields are `schemaVersion: 1`, `entityCode`, `generationId`, `locale`, and optional `workContext`. Work context contains requested organization, company, legal entity, or network-account coordinates. Principal, tenant, permissions, authorization epoch, profile hash, and descriptor hash are not accepted in the browser context.

| Kind | Context fields |
| --- | --- |
| `manage` | Applied filters/search, displayed field keys, grouping, sort, standard view, selected and visible IDs, analysis target, page size/index/cursor, directory organization/company arrays and role/eligibility filters |
| `record` | Record ID, section, role lens, saved revision, dirty flag, optional historical instant and case ID |

IDs and coordinate arrays are bounded and UUID validated. Context JSON is limited to 24,000 characters; selections and visible rows to 100 each. Empty selection targets and unknown properties are rejected. Field values and unsaved patches are not page context. Filter values are untrusted query inputs validated by Records.

## Publication and navigation

Entity list/form/detail runtimes and BP360 publish semantic context through the shell's Atlas provider. Lists publish the applied search (including the descriptor's minimum search length), rather than pending search input. Displayed fields and grouping travel with the cursor because Records binds cursors to the projection and query. A result-page key prevents rows from the previous query entering the next snapshot.

Record publishers override a mounted Manage publisher. Closing a record panel restores the underlying Manage context. Each changed snapshot receives a generation ID; identical renders do not change it. BP360 publishes its effective section, role, explicit transaction coordinates, historical instant and loaded saved revision. Generic edit forms publish a dirty indicator without draft values. Locale defaults to the shell locale.

Each run captures an immutable snapshot. Changing context aborts its read request, clears the current answer/actions and conversation binding, and discards late progress and completion even if a client ignores cancellation. The SSE envelope echoes `contextGenerationId`; the browser rejects a mismatched stream. Submitted commands continue independently, and their receipts retain their original action target and captured context.

Pinned Atlas reserves its width through a shell-scoped CSS variable so page controls remain reachable. Fullscreen uses an explicit, five-minute, same-tab session-storage handoff keyed by tenant, principal and plane. A matching completed thread binding can travel with it. Stored coordinates are reauthorized by the server on every run; they are not credentials. Navigating away removes the fullscreen context. Unknown historical threads remain viewable, but a new question starts a fresh thread for the current page rather than attaching the new page to an unbound conversation.

## Server admission

Both local and provider-backed runtime compositions use `createAtlasBusinessContextResolver` with the existing authorized Records and Entity List services. Entity List supplies standard-view resolution, descriptor/field/query policy, directory rules, cursor admission and canonical scope coordinates. The resolver verifies every selected ID against the filtered population, and every visible ID against the requested page; it rejects the entire request if any member is absent. Requested work scope and directory membership are resolved separately.

Record contexts require current record admission plus a scoped list check. Published AI metadata must enable the context kind when present. The explicit legacy NEON Business Partner path still supports context when AI metadata is absent, without enabling additional tools. Other entities require published AI enablement.

The internal result contains the validated page, server descriptor hash and scope fingerprint. It is included in run idempotency material and passed to the tool coordinator. The model receives a compact scope projection, labelled as untrusted navigation data, not business evidence. Full filters, displayed fields, cursor data, generation IDs and population ID arrays remain in the server context. A single selected target can supply the registered summary tool; multiple selections retain their count without exposing an incomplete subset as complete. The local runtime fits this scope and reserves at least 128 output tokens within the unchanged 4,096-token conservative bound. If a completed tool result cannot fit alongside another round of tool definitions, the answer step omits those definitions while preserving the complete current turn, verified result and system instructions. Registered BP summary reads are bound to the record/selection/visible-page target and explicit work organization. Existing Records/tool authorization continues at invocation.

Historical contexts disable current-data tools and mutations. Saved revision is descriptive, never a command concurrency token. Case ID and network-account coordinates are schema-defined but fail closed in the current resolver because their relationship/context adapters are not registered in BP-AI-02. Owner evidence, evaluated readiness/eligibility, case relationships and expanded tools remain later work packages.

## Qualification

Focused checks cover contract rejection, real HTTP validation and verified authority, owner-list delegation, mixed denied selections, role/work-context changes, cursor query transport, stream generation mismatch, A-to-B late-event suppression, panel restoration, fullscreen identity binding, historical state, and original-target command receipts.

Commands:

```sh
pnpm --filter @athyper/server-contract-ai --filter @athyper/server-platform-ai test
pnpm exec tsx --test tests/foundation/atlas-business-context.test.tsx tests/contracts/atlas-grounded-answer.test.ts
pnpm qualify:business-partner-r9
```

DEV qualification completed on 2026-09-09 after deploying the API and Neon fixes. All 22 authenticated browser checks passed against the existing local model, including Manage selection/cursor/search, a cited BP360 read, panel section changes, fullscreen thread/context handoff, historical/role context, forged-coordinate rejection, active-request navigation isolation and return to Manage. See [deployed qualification evidence](../architecture/business-partner/evidence/bp-ai-02-deployed-20260909.md).

AI contract/runtime suites passed 209 tests; focused browser-client/controller suites passed 13 tests; R9 passed 94 assertions. Affected package typechecks and production builds passed. Both frontend-spine governance and shared-package purity now pass. The former contract-purity and dependency-budget failures were corrected and audited in [governance closure](../architecture/business-partner/evidence/bp-ai-02-governance-20260909.md). BP-AI-02 has no remaining gates from these implementation notes; later roadmap qualification and production rollout remain separate.
