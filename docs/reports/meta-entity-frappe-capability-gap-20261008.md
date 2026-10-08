# Meta Entity Framework — Frappe capability gap analysis (revised)

**Assessment only • 8 October 2026 • revision 2.** Analysis for improvement
planning — not design authority, not a plan, not a commitment. The Entity Studio
blueprint remains the sole design authority. Nothing here approves a capability, a
scope change or a gate. **No files or databases were changed by the source review
that produced revision 2.**

**Revision 2 supersedes revision 1.** Five classifications in revision 1 were
wrong because they inferred platform absence from one artifact. Corrections are
recorded in §6 rather than silently rewritten.

---

## 1. Method — and why revision 1's headline was not supported

Revision 1 compared Frappe's capability surface against Athyper's **authoring
vocabulary** — 154 typed properties across five families, read from
`normalized-core.generated.json` (field 49 · runtime 22 · surface 28 · section 28 ·
binding 27). Frappe evidence is the local v15.72.3 checkout (263 core DocTypes,
3,022 field definitions).

**That method has two hard limits, and revision 1 overran both:**

1. **A typed property proves representational capacity — not enforcement, usability
   or publication.** A column existing does not mean a rule is enforced, a control
   renders, or a change can be published.
2. **Absence from `normalized-core.generated.json` does not establish platform
   absence.** Revision 1 got this wrong three times (numbering, bulk operations,
   record history) — each had an implemented service elsewhere in the repository.

**Therefore revision 2 records five separate status questions per row**, and uses
**"not established"** wherever inspection was incomplete:

| Code   | Question                                                               |
| ------ | ---------------------------------------------------------------------- |
| **D**  | Design coverage — is the contract/property specified?                  |
| **I**  | Implementation evidence — does a service, contract or code path exist? |
| **UI** | Shared UI integration — does it reach the shared composer/runtime?     |
| **P**  | Publication evidence — can it be published through the governed path?  |
| **R**  | Runtime verification — is it proven on a real entity in a real plane?  |

A row is **not** complete until R is established. Revision 1 collapsed these into
present/absent, which is the error the corrections in §6 correct.

---

## 2. What Athyper's architecture covers that Frappe does not

Reframed honestly: these are **capabilities the architecture expresses**, not proof
of enforcement, usability or publication. Each would need its own D/I/UI/P/R
evidence before being claimed as working.

| Athyper architectural capability             | Represented by                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Data classification, retention policy        | `dataClassification`, `retentionPolicyCode`                                        |
| Value origin, write mode, create mode        | `valueOrigin`, `writeMode`, `createMode`                                           |
| Soft delete, record versioning, concurrency  | `softDeleteFieldId`, `recordVersionFieldId`, `concurrencyMode`                     |
| Storage binding                              | `storagePlane`, `storageSchema`, `storageObject`, `storageCatalogueHash`           |
| API exposure control                         | `apiExposure`                                                                      |
| Registered components (vs fieldtype strings) | `componentDisplayId`, `componentInputId`, `componentFilterId`, `componentFormatId` |
| Semantic role                                | `semanticRole`                                                                     |
| Typed + context-resolved defaults            | `defaultText/Numeric/Boolean/Date/Datetime/Uuid`, `defaultContextKey`              |
| Validation contracts                         | `validationContractKey/Version`, `pattern`, `jsonSchemaKey`                        |
| Money model                                  | `currencyFieldId` XOR `currencyCode`                                               |
| Governance / transport                       | release → artifact → deployment → activation heads                                 |
| Multi-plane delivery                         | declared targets, per-plane activation                                             |
| Tenant + field-level security                | forced RLS, field access, effective-security composition                           |
| Immutable artifacts, reviewed rollback       | hashed artifacts, reviewed successor                                               |

**These are architectural directions, not verified features.** Frappe's equivalents
may be narrower — but Frappe's are _used by 3,022 fields in production_, which is
evidence revision 1 did not weigh.

---

## 3. Gap register — with full status

Rows marked **corr.** were reclassified in revision 2.

### 3.1 Conditional and derived behaviour

| #   | Capability                                            | D       | I       | UI  | P   | R   | Note                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------- | ------- | ------- | --- | --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Conditional requiredness**                          | ✅      | partial | ✗   | ✗   | ✗   | **corr.** Blueprint §7.10: _"**operation-owned** conditional validation and matching UI indicators; current visibility/editability predicates do not authorize a new requiredness purpose."_ A binding property or UI predicate **cannot** enforce requiredness across API, import and bulk writes. **Define the server rule first**, then matching UI indicators |
| 2   | **`fetch_from`** (derive from linked record)          | ✗       | ✗       | ✗   | ✗   | ✗   | Blueprint §7.10 "Reference fetching" gap: live-display vs copied-stored, timing, overwrite/only-if-empty, access enforcement, server execution                                                                                                                                                                                                                    |
| 3   | **Copy behaviour** (`no_copy`, identity regeneration) | ✗       | ✗       | ✗   | ✗   | ✗   | Blueprint §7.10 "Copy behavior" gap                                                                                                                                                                                                                                                                                                                               |
| 4   | **Quick entry** (compact create form)                 | ✗       | ✗       | ✗   | ✗   | ✗   | Blueprint §7.10 gap                                                                                                                                                                                                                                                                                                                                               |
| 5   | **Form tabs**                                         | ✗       | ✗       | ✗   | ✗   | ✗   | Blueprint §7.10: needs a contract amendment; navigation groups are detail-only                                                                                                                                                                                                                                                                                    |
| 6   | **Editable child rows**                               | partial | partial | ✗   | ✗   | ✗   | Owned-row add/edit/delete, locked parent scope, atomicity, concurrency and deletion semantics all unqualified                                                                                                                                                                                                                                                     |

### 3.2 Data-surface services (some implemented — revision 1 was wrong)

| #   | Capability                    | D   | I   | UI  | P   | R   | Note                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------- | --- | --- | --- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7   | **Record history**            | ✅  | ✅  | ✗   | ✗   | ✗   | **corr.** `server/packages/services/records/src/record-history.ts` already provides contracts, descriptor qualification and a capture hook — beyond Studio draft snapshots. §7.10 also carries "Activity and view tracking." **Narrow the finding** to any unqualified field-diff, read, or UI experience. History must be onboarded **through Entities**, preserving locked record scope and field disclosure rules                 |
| 8   | **Numbering / formatted IDs** | ✅  | ✅  | ✗   | ✗   | ✗   | **corr. — removed from Tier 1.** `server/packages/services/numbering/` implements policy revisions, format templates, scope/reset kinds, allocation replay and counter locking. Blueprint §11.6.1 parks it as: _"Governed policy revisions and **Entity field/operation bindings** … mutable counters remain in the execution plane."_ **The missing piece is Entity binding and authoring integration — not a numbering subsystem** |
| 9   | **Bulk operations**           | ✅  | ✅  | ✗   | ✗   | ✗   | **corr.** `server/packages/services/records/src/bulk/bulk-service.ts` implements preflight, eligibility, patch/delete/registered actions, per-item results and governed background dispatch. This disproves _absence_; it does **not** prove working UI or deployed integration                                                                                                                                                      |
| 10  | **Record rename**             | ✗   | ✗   | ✗   | ✗   | ✗   | **corr.** Needs a concrete use case first. Separate changing a **readable business code** from changing **technical identity**; with stable internal identity a code change may be a governed update, and reference rewriting should not be assumed necessary                                                                                                                                                                        |

### 3.3 Entity archetypes

| #   | Capability                        | D       | I   | UI  | P   | R   | Note                                                                                                                                                                                                  |
| --- | --------------------------------- | ------- | --- | --- | --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | **Tree entities**                 | partial | ✗   | ✗   | ✗   | ✗   | **corr.** Reasonable investigation candidate, **demand-led**. Needs explicit relationship/traversal semantics. Tree _section_ membership exists; a tree **entity type** is not automatically required |
| 12  | **Singleton / settings entities** | ✗       | ✗   | ✗   | ✗   | ✗   | **corr.** Demand-led. Needs declared scope and concurrent-create enforcement. Does **not** automatically require a new Entity type                                                                    |

### 3.4 Larger scope — not reference-slice work

| #   | Capability                                                               | Note                                                                                                    |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 13  | View modes (Kanban, Calendar, Gantt, Tree, Image, Map, Dashboard, Inbox) | `supportedModes` exists; each mode needs a component-catalogue declaration, runtime and query semantics |
| 14  | Reports (Report Builder, Query Report)                                   | Substantial subsystem with its own permission model                                                     |
| 15  | Dashboards, charts, number cards                                         | Composable analytical surfaces                                                                          |
| 16  | Data Import tool                                                         | Mapping, validation, transaction, background semantics                                                  |
| 17  | Workspace composition                                                    | Navigation exists; workspace does not                                                                   |
| 18  | Module onboarding                                                        | Sequence + completion state per tenant                                                                  |
| 19  | Auto Repeat                                                              | Scheduling, idempotency, audit                                                                          |
| 20  | Assignment Rules                                                         | Rule evaluation + owner resolution                                                                      |
| 21  | Duplicate detection / merge                                              | Match rules + merge with reference reassignment                                                         |
| 22  | Global cross-entity search                                               | `searchProfileId` is per-surface; cross-entity needs its own scope and permission model                 |
| 23  | Customize Form UI                                                        | Composer — see §4                                                                                       |
| 24  | Per-record ad-hoc sharing                                                | Conflicts with governed metadata; likely **do not copy**                                                |
| 25  | Tags / Likes / Follow / ToDo                                             | Activity capability scope; deferred                                                                     |
| 26  | Property Setter (generic override)                                       | Rejected as a generic store; typed overlays only                                                        |

### 3.5 Do not take

| Capability                                                | Disposition                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Server Script / Client Script                             | **Forbidden** — AGENTS.md forbids executable upload                                        |
| Print Format                                              | **Parked** — blueprint §11.6.1                                                             |
| Workflow (states/transitions)                             | **Parked**                                                                                 |
| Document lifecycle (`is_submittable`, `docstatus`, amend) | **Parked**                                                                                 |
| Auto-CRUD REST per table                                  | **Rejected** — cannot express revision, ordering, identity, audit or transaction semantics |

---

## 4. Composer status — corrected

**corr.** Revision 1 said the composer is "0 % built." That is unsupported
precision. The blueprint records an **explicit deferral** (8 October 2026):

> "the owner defers shared composer UI and UI wiring. The control API now has an
> optional backend composition using the existing authenticated authoring
> authorizer, refreshed IAM evidence, separate issuer/application pools, canonical
> label writer and transaction-bound audit."

So the accurate status separates layers:

| Layer                                                        | Status                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Contracts, schemas, codecs, validators                       | established (implemented)                              |
| Authoring repository, scoped writes, snapshots, receipts     | established (implemented)                              |
| Backend composition (authorizer, IAM evidence, pools, audit) | established (implemented)                              |
| **Shared composer UI and UI wiring**                         | **deferred by owner decision — not a missing feature** |

This is a **delivery disposition**, and it should be reported as one.

---

## 5. Frappe descriptions — corrected

| Revision 1 claim                              | Correction                                                                                                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Filter operators: `in_standard_filter` only" | **Understated.** Frappe documents operator-based API filters (equality, comparison, `like`, `in`, `between`, `is`, …). The row understated its capability                                                                         |
| "Free-text `fieldtype`"                       | **Misleading.** The pinned v15.72.3 `DocField` declares `fieldtype` as a **`Select` with an enumerated `options` list** of ~49 types. It is not free text                                                                         |
| "Child tables are equivalent"                 | **Premature.** Revision 1 simultaneously called child tables equivalent _and_ listed editable child rows as a Tier-1 gap. Ownership, atomic writes, deletion and concurrency remain unqualified, so equivalence cannot be claimed |
| Generated endpoints implied unrestricted      | **Do not imply.** Generated endpoints operate with user permissions; automatic exposure ≠ unrestricted access                                                                                                                     |

---

## 6. Corrections log — what revision 1 got wrong

| Revision 1                                        | Why it was wrong                                                                                         | Revision 2                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| "Athyper is ahead" headline                       | Typed property counts prove representational capacity, not enforcement, usability or publication         | Reframed as §2: architectural coverage, not verified working features |
| #9 numbering — "new gap, Tier 1"                  | An implemented service exists; the blueprint parks **Entity binding**, not the subsystem                 | Reclassified: implemented service, missing Entity binding (§3.2)      |
| #17 bulk operations — "absent"                    | `bulk-service.ts` implements preflight, actions, per-item results, background dispatch                   | Reclassified: implemented service, UI/integration unqualified         |
| #8 record history — "new finding"                 | `record-history.ts` provides contracts + capture; §7.10 already carries "Activity and view tracking"     | Reclassified: partly acknowledged; narrowed to field-diff/read/UI     |
| #1 conditional requiredness as a binding property | Blueprint makes it **operation-owned**; a UI/binding property cannot enforce across API, import and bulk | Corrected ownership: server rule first                                |
| #26 composer "0 % built"                          | The composer UI is an **explicit owner deferral**, not an absent feature                                 | Corrected to layered status (§4)                                      |
| #10 record rename as a gap                        | No established use case; business-code change ≠ technical identity change                                | Downgraded: use case required first                                   |
| #11–12 tree/singleton as Entity types             | Neither automatically requires a new Entity type                                                         | Downgraded: demand-led investigation, semantics first                 |
| All rows present/absent                           | Collapsed five distinct status questions                                                                 | Replaced with the D/I/UI/P/R ladder                                   |

---

## 7. Recommended approach — corrected

**Revision 1 bundled seven parity gaps into reference-slice delivery and called
some "small." Both need evidence.** Instead:

1. **Keep the blueprint's existing delivery sequence.** Do not resequence it from
   this assessment.
2. **Select only the capabilities the reference-entity acceptance scenarios
   actually require.** Not every §3 gap belongs in that delivery.
3. **Resolve capabilities in this order:**
   - **Existing services awaiting Entity integration** (#7 history, #8 numbering,
     #9 bulk) — the service exists; the work is binding, authoring and
     qualification, which is far less than building a subsystem
   - **Missing contracts** (#2 fetch, #3 copy, #4 quick entry, #5 form tabs) —
     contract + persistence + compiler + UI
   - **Server-rule-first items** (#1 requiredness) — server enforcement before UI
   - **Demand-led investigations** (#10 rename, #11 tree, #12 singleton) — scope
     decision before any build
4. **Record D/I/UI/P/R per capability**, and use **"not established"** where
   inspection is incomplete.
5. **Do not claim effort size without measurement.** "Small" is unsupported until
   the four-phase measurement (author effort · execution · review waiting ·
   recovery) exists.

---

## 8. Headline (revised)

> **Athyper has an explicit governed authoring architecture. Its remaining parity
> work must distinguish missing contracts from existing services awaiting shared
> Entity integration and runtime qualification.**

The first task is not to build parity features — it is to **classify each capability
by which of those two categories it falls into**, because revision 1 got that wrong
three times, and each error would have sent work toward building something that
already exists.

**Caveats:** this is a source and document review. No deployed behaviour was
verified, and no DEV query was run for this revision. Where a status is marked
"not established," it means inspection was incomplete — not that the capability is
absent.
