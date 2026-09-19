# Shared Atlas entity sections

`createAtlasEntitySectionTool` is the shared current-record, read-only execution path for registered sections in Neon, Mesh and Studio. It is exported by `@athyper/server-platform-ai`. BP Contacts and Addresses now use this engine through small compatibility registrations; their tool names and result shapes remain stable for saved conversations and replay.

A binding declares plane, entity, section key, aliases, owner read permission, Records admission field/identifier field, output field schemas, result key and row limit. The reader supplies a normalized `AtlasEntitySectionProjection`. Registrations are server-owned capability metadata, not authorization grants or arbitrary endpoints. The existing Records gateway continues to use the published entity descriptor for record admission and field security. The owning service must authorize the section and its fields before returning its projection.

```ts
const tool = createAtlasEntitySectionTool({
  planeKey: "studio",
  entityCode: "product",
  sectionKey: "specifications",
  toolCode: "product_specs",
  label: "Product specifications",
  aliases: ["specifications", "technical details"],
  readPermission: "catalog.product.read",
  admissionField: "sku",
  resultKey: "items",
  maxRows: 5,
  fields: {
    label: { type: "string", maxLength: 80 },
    approved: { type: "boolean" },
    weight: { type: "number" },
  },
}, specificationsOwner.read);
```

The example is a registration pattern, not a deployed Product capability. The reader returns `{entityCode, sectionKey, recordId, status, rows, hasMore}`. Status is `ready`, `empty`, or `unavailable`; unavailable contains no rows or hidden totals. Owner-specific mappings and business calculations remain with their owners. BP360 continues to authorize shared Contacts/Addresses, withhold redacted projections and bound their child data.

The engine validates parent admission, caller profile, owner coordinates, output types, bounds and field allowlists; it generates content-based citations. The common coordinator binds the target to the active record or selected/visible IDs and rejects historical current-data calls. Fresh read replay checks detect changed data or permissions. Owner failures are not silently reclassified by the shared engine.

Alias routing consumes the registered section metadata and current entity; it does not infer authorization, record IDs or database relationships from tab labels. Runtime-only routing metadata is removed before tools are sent to the provider. Domain insight routing (readiness, eligibility, mutations) remains separate.

Current boundary: section bindings are registered in server composition/code. This change does not add a Meta Entity authoring UI or automatically install readers from arbitrary published relationships. Other entities can reuse this engine by registering a binding and an existing authorized reader, without copying tool execution or routing logic. Metadata-only publication/discovery, generic field explanation, scoped section input contracts and Home-page name resolution are separate capabilities.

Validation: 240 AI tests include a non-BP entity in all three plane contexts, typed fields, aliases, record/plane isolation, owner substitution, bounds and replay changes. Existing BP owner (24) and host registration (7) checks pass; AI/master-data typechecks and the AI build pass. DEV rollout is API-only and keeps prior owner services. Synthetic deployed checks are distinct from authenticated live-model qualification.

## Direct section answer rendering — 2026-09-09

The reported 12:50 run (`b520e8e1-d680-4258-8f84-9f2e5c82d185`) selected `bp_read_addresses` and completed the owner tool. Its second model invocation failed with `upstream_error`, zero recorded duration and no recorded usage. This locates the failure after retrieval; the ledger alone does not establish the exact underlying exception.

A single successful registered section result now renders directly from the validated output, preserving the previously emitted citations and replay evidence without a second model invocation. Registration metadata supplies the result key and label; empty/unavailable and partial-page states remain distinct. Non-section and mixed tool results retain their existing flow. The renderer introduces no inferred findings or protected totals. This is a shared mechanism, not an address-specific workaround.

Validation: 244 AI tests and AI typecheck/build pass, including a runtime regression that completes a three-address response with one provider call. DEV image `athyper-runtime-server:atlas-section-render-20260909` is healthy; image import preflight and a synthetic deployed owner/tool/citation/renderer check pass. Authenticated rendering verification remains pending.

## Direct current-record section dispatch — 2026-09-09

The 12:57 run (`2a0379e9-2569-42e2-8afc-00d3637b0801`) completed one model call with no tool invocation, despite the address reader being registered. The response claimed the tool was unavailable. The ledger establishes that no tool ran, not why the model declined it.

Explicit summarize/show/list/read requests naming this/current record and exactly one registered section now dispatch directly through the normal tool coordinator. The active tab does not override the requested section. Registered aliases and the resolved entity select the reader; the resolved current record supplies its ID. Section/field authorization remains with the existing reader and gateway. The result uses the shared validated renderer, citations and replay evidence. Denied reads fail without provider fallback. This path does not reserve model quota or invoke a model.

Historical contexts, attachments, ambiguous section matches, mutation wording and requests without an explicit current-record reference retain agent routing. This is a bounded direct-read path, not Home name resolution or a general semantic query parser.

Validation: 253 AI tests, typecheck and build pass. DEV image `athyper-runtime-server:atlas-direct-section-20260909` is healthy. Image import preflight and deployed synthetic runtime checks pass for direct reads, citations/replay, authorization denial and zero model calls. Authenticated browser verification and scoped readiness/eligibility qualification remain pending.

## Zero-model completion persistence correction — 2026-09-09

The 13:24 runs `1970f976-4931-4a78-9d18-01912501d0fe` and `ba1357c5-9e74-4026-85b4-e40ebd463332` both completed `bp_read_addresses` with no model calls, but failed terminal completion. The deployed runtime contained direct dispatch. The Kysely run repository still required provider usage for every completed run; the earlier runtime mocks did not cover that persistence invariant.

The repository now permits zero-provider completion only when a non-error tool result, matching tool-use block and nonempty answer are backed by a completed read invocation matching tenant, run, principal, plane, call ID and tool code. Existing model-usage validation remains for other completions. No provider call or token usage is fabricated.

255 tests, typecheck and build pass. Deployed image `athyper-runtime-server:atlas-read-completion-20260909` is healthy and preserves the preceding summary-card image. A synthetic deployed repository check validates success and rejection through compiled SQL with a test driver; it is not an authenticated browser test. Browser confirmation remains pending.

## Database metering constraint correction — 2026-09-09

Run `273b3e97-29bd-4e24-9b70-d12687bab53c` (14:49) completed the address read without a model call, then PostgreSQL rejected the metering insert with `ai_agent_run_aar_completed_usage_chk`. The previous application fix was present but did not update this database constraint.

The forward migration `20260909_atlas_tool_only_completion.sql` and canonical DDL allow completed unavailable-provider-usage records only with zero model calls, a positive tool-call count and no resolved provider or actual model. Existing token coherence constraints still reject fabricated tokens. The repository records one tool call for its validated direct-read completion; the matching successful invocation remains mandatory.

DEV migration applied and API image `athyper-runtime-server:atlas-tool-only-metering-20260909` is healthy. All 255 AI tests, typecheck, build and deployed repository checks pass. A rolled-back PostgreSQL test using a temporary table with the actual metering constraints accepted tool-only completion and rejected zero tools, model calls without usage, and fabricated tokens. Existing failed conversation messages were not changed. Signed-in browser confirmation remains pending.

## Record section intent and availability — BP-AI-04, 2026-09-09

Shared section rendering accepts the current question and distinguishes summaries, bounded name filters (named/called/like/name contains), and existence questions. Registrations declare searchable string fields; Contacts declares displayName. Matching uses normalized, case-insensitive substring comparison over authorized returned rows only. A partial page or missing searchable fields prevents an exhaustive non-match claim. Unsupported filter expressions produce an explicit limitation instead of an unfiltered summary. These are record-local filters, not BP-AI-06 cross-record searches.

The generic projection supports optional missing_scope, denied, and reader_unavailable reasons on unavailable results. Non-ready projections contain no rows or hidden totals. Contacts/Addresses owners preserve 403/redaction as denied and 503 as reader unavailable; ambiguous 404/409 remain neutral. Actual readiness scope guidance remains in the owner insight contract. Bindings without a connected reader return reader_unavailable after parent admission, with no data citations. Banking, certificates and tax identifier registrations currently use this explicit unavailable path; no owner reader is claimed implemented for those sections.

DEV image atlas-section-intents-20260909 is healthy. 270 AI tests, 14 focused owner tests, typechecks and builds pass. Deployed synthetic checks pass for Chandravel non-match, partial authorized coverage and unavailable banking reader. Signed-in browser qualification of this change remains pending. Prior successful address/contact screenshots establish completion of those earlier retrieval paths only.

### Name wording regression — 2026-09-09

The browser phrase “for this business partner do we have any contact as Chandravel” was interpreted as unfiltered existence because the parser recognized “like/named/called” but not “as”. The shared parser now recognizes “as”, “with name”, “with the name” and “name is” while excluding “as of” from name matching. Seven phrasing regressions cover match, non-match and partial lists. 277 AI tests, typecheck/build and a deployed synthetic check using the exact wording pass. DEV image atlas-contact-name-phrasing-20260909 is healthy. Signed-in retry remains pending.
