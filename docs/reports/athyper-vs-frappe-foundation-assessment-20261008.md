# Athyper Entity Framework vs Frappe — foundation assessment

**Assessment only • 8 October 2026.** This is analysis, not design authority,
not a plan and not a qualification record. The Entity Studio blueprint remains the
sole design authority. Nothing here approves a release, a scope change or a gate.

Evidence: local repository inspection of `src/athyper` and `src/onehub`, plus
read-only queries against the DEV Studio database. Counts are local measurements,
not qualification evidence.

---

## 1. What is actually being compared

|                       | Athyper                                                                                                        | Frappe (via `onehub`)                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| What it is            | Governed multi-tenant, multi-plane metadata **delivery** platform                                              | Single-site low-code **application** framework                                                |
| Runtime               | Node/TypeScript + PostgreSQL                                                                                   | Python + MariaDB (`frappe-bench`)                                                             |
| Scale measured        | 3,265 TS files · **466,393 LOC TS** · **302,799 LOC SQL** · 530 DDL files · 72 migrations · 63 metadata tables | 263 core DocTypes · **3,022 field definitions** · 6 apps (frappe, erpnext, hrms, payments, …) |
| Version / age         | First commit **2026-03-04**; 542 commits; ~7 months                                                            | **v15.72.3**; ~15 years, large ecosystem                                                      |
| Entity Framework push | **217 commits since 1 Sept 2026**                                                                              | n/a                                                                                           |

**This is close to apples-to-oranges.** Frappe optimises for developer velocity in
one deployment. Athyper optimises for governed, auditable, multi-plane change.
They are different products. But the comparison is still valuable, because
Frappe is a 15-year existence proof of the one property Athyper is missing.

---

## 2. The one difference that explains everything

**Frappe's metadata generates its own schema. Athyper's does not.**

| Step              | Frappe                                                       | Athyper                                                               |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Metadata unit     | One JSON file per DocType, fields inline                     | ~58 relational authoring tables, normalised rows                      |
| Schema creation   | `sync_for(app, force)` derives tables from metadata          | Hand-authored DDL + **72 forward migrations**                         |
| Adding one field  | Edit JSON → `bench migrate`                                  | Contract + migration + descriptor + compiler + UI + validation + gate |
| Runtime extension | `Custom Field` is itself a DocType — extensions are **data** | Deferred (E1/F7), typed overlays planned                              |
| Permissions       | Closed rights set (15 standard rights) + role DocPerm        | Explicit published permission codes per operation/field/scope         |
| Tenancy           | One site = one database                                      | `tenant_id` + forced RLS + product/tenant source kinds                |
| Deployment        | `bench migrate` per site                                     | release → artifact → deployment → activation, 3 planes                |
| Governance        | None (DocType is mutable data)                               | Immutable artifacts, independent review, activation heads             |

Frappe manages **3,022 fields** through one declarative model where the schema is
_derived_. Athyper needs a hand-written migration and a multi-layer wiring chain
for **one** property. That single difference is the root cause of the velocity
problem identified in the Kanban case (11 touch points for `supportedModes`).

---

## 3. Head-to-head scorecard

| Dimension                     | Frappe | Athyper | Note                                                      |
| ----------------------------- | ------ | ------- | --------------------------------------------------------- |
| Time to add a property        | **A**  | **D**   | Frappe derives schema; Athyper hand-wires 11 layers       |
| Schema derivation             | **A**  | **D**   | `sync_for` vs 72 hand-authored migrations                 |
| Runtime extensibility         | **A**  | **D**   | Custom Field as data; Athyper defers to E1/F7             |
| Governance / audit            | **D**  | **A−**  | Immutable artifacts, independent review, activation heads |
| Multi-plane delivery          | **D**  | **B+**  | Neon/Mesh/Studio with declared targets                    |
| Tenant + field-level security | **C**  | **A−**  | RLS + field access + effective-security composition       |
| Authorization granularity     | **C**  | **A−**  | 15 fixed rights vs explicit published codes per operation |
| Immutability / rollback       | **D**  | **A−**  | Reviewed successor; Frappe migrations mutate in place     |
| Simplicity / maintainability  | **A**  | **C−**  | 1 metadata model vs 63 metadata tables                    |
| Incremental delivery          | **A**  | **D**   | Frappe ships per app; Athyper gates are all-or-nothing    |
| Test discipline               | **B**  | **C+**  | Athyper: **88 of 139 test files run in no CI job**        |
| Maturity                      | **A**  | **D**   | 15 years vs ~7 months                                     |

**Reading:** Athyper is _not_ weaker engineering — it is building a harder product
and doing the hard parts well. It has lost the _velocity_ property that makes a
metadata platform pleasant to extend.

---

## 4. Where Athyper is genuinely stronger

These are real and should not be traded away:

1. **Governance and auditability.** Immutable hashed artifacts, independent review,
   activation heads, rollback-as-reviewed-successor. Frappe has no equivalent —
   its DocType is mutable runtime data with no release identity.
2. **Multi-plane delivery.** Declared targets across Neon, Mesh and Studio with
   per-plane activation. Frappe is one site, one database.
3. **Tenant and field-level security.** Forced RLS, explicit published permission
   codes, field access, effective-security pinning. Frappe offers DocPerm plus user
   permissions; no field masking or security composition.
4. **Immutability and rollback.** Frappe's `bench migrate` mutates schema forward
   only. Athyper retains immutable artifacts and comparable activation heads.
5. **Security posture.** Fail-closed defaults, no inferred permissions, no silent
   fallback, protected controls preserved. This is stronger than Frappe's model.
6. **Engineering depth.** ~770k LOC across TS and SQL, 790 passing tests, 72
   checksum-pinned migrations, generated drift checks.

## 5. Where Frappe is stronger — and what it teaches

1. **Metadata that generates schema.** The single most valuable property, and the
   one Athyper needs. Frappe proves it works at 3,022 fields.
2. **Extensions as data, not code.** A Custom Field is a row. Athyper requires a
   migration and a full wiring pass.
3. **Radical simplicity.** One metadata model. Athyper has 63 metadata tables for
   authoring alone.
4. **Proven incremental delivery.** Frappe ships per app and per migration without
   a whole-framework gate.

---

## 6. Foundation strength verdict

**Direction: right. Execution strategy: diverged from the proven path.**

The foundation is **substantial and well-built**, not a prototype. It has real
depth, real tests, real migrations, real security design. The architecture is
appropriate for a governed, multi-plane, multi-tenant product — a genuinely harder
target than Frappe's.

The problem is not the destination. It is that in gaining governance, the platform
**gave up metadata-driven schema generation**, and with it incremental delivery.
That produces the observed symptoms: excellent components, no authorable property,
and a developer blocked on gates rather than on engineering.

## 7. Structural risks

| #   | Risk                                   | Evidence                                                                                                                        |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No schema generation from metadata** | 72 hand migrations; 11 layers per property                                                                                      |
| 2   | **All-or-nothing gates**               | 113 prepared columns share **one** `*_native_pending_ck`                                                                        |
| 3   | **Two parallel lifecycles**            | `metadata.entity_release`=45 vs `publication.release`=73; `entity_contract` vs `release_activation_head`                        |
| 4   | **Unbounded migration**                | 22/22 Country fields and 9/9 State Region fields have no member-ID correspondence across 13 snapshots; 727 fields, 0 identities |
| 5   | **Over-specification vs scale**        | Designs for 1,365-binding drafts; DEV has 8 drafts, 102 surfaces                                                                |
| 6   | **Test coverage gap**                  | 88 of 139 authoring test files run in no workflow                                                                               |
| 7   | **Governance exceeds capacity**        | ~12 gates each needing a named owner; all unassigned                                                                            |

---

## 8. Recommendations, ranked

1. **Add schema generation to the typed contract (adopt Frappe's best idea).**
   One declaration per property → generated DDL fragment, Kysely type, published
   descriptor, browser type, parsers, save/load mapping, compiler mapping and
   validation skeleton. Target: a new property = **1 declaration + 1 runtime
   consumer + fixtures**. This is the highest-value change available.
2. **Release gates per property, not per batch.** Replace the blanket
   `*_native_pending_ck` with per-property enablement once that property has a
   converter, a compiler mapping, a fixture and a runtime consumer. Unblocks board
   without waiting on 112 unrelated columns.
3. **Collapse to one lifecycle.** `publication.release` becomes the sole ledger;
   `entity_contract` becomes a projection of the activation model.
4. **Add a lifecycle status read model plus a reconciler.** Answer "where is entity
   X live?" in one query and assert published → deployed → activated → materialized.
5. **Freeze an identity baseline.** Stop reconciling 13 historical snapshots;
   declare one frozen revision as the canonical identity set and reconcile forward.
6. **Auto-enrol tests and build one integrated acceptance suite.** Glob/project
   selection replaces hand-maintained filename lists; one Country/State Region
   scenario replaces accumulated component proofs.
7. **Adopt a vertical-slice rule.** Do not add a framework property until a second
   entity needs it. Generality must be earned.
8. **Right-size governance for DEV.** Reserve independent owner review for security,
   access and governance changes; routine metadata edits need not carry it.
9. **Track "cost to add a property" as an SLO.** Measure declaration → generated
   artifact → deployed property. Without this counter-metric, over-engineering has
   no feedback signal.

## 9. What "strong" looks like in 90 days

| Signal                     | Today                              | Target                                |
| -------------------------- | ---------------------------------- | ------------------------------------- |
| Cost to add one property   | ~11 layers, days–weeks             | 1 declaration + 1 consumer + fixtures |
| Gate granularity           | 1 blanket gate for 113 columns     | per-property enablement               |
| Release ledgers            | 2 (divergent)                      | 1                                     |
| Lifecycle answer           | 6-table join, unreconciled         | 1 read model + reconciler             |
| Authoring test files in CI | 51 of 139                          | 100%                                  |
| Country/State Region       | revision 1, 0 identities, 0 labels | promoted through the governed path    |
| Identity baseline          | 13 snapshots, 0 correspondence     | 1 frozen revision                     |

## 10. Bottom line

Athyper is **not** a weaker framework than Frappe — it is a more ambitious one,
and the parts it built (governance, tenancy, multi-plane delivery, security) are
genuinely better than Frappe's. Its ~770k LOC and 72 migrations are real
engineering, not a prototype.

But it is **missing the property that makes Frappe fast**: metadata that generates
its own schema. Until the typed contract emits its own DDL, descriptors and
mappings, every new capability will cost 11 layers, and the platform will keep
feeling slower than a 15-year-old framework that manages 3,022 fields with one
declarative model and a single `migrate` command.

The direction is right. The foundation is strong. **The missing piece is
generation** — and it is a fix, not a rewrite.

---

# 11. Frappe techniques worth adopting — strong recommendations

**Candidate inputs for review into the Entity Studio blueprint, which remains the
sole design authority.** These are recommendations, not an approved design, not a
scope change and not a plan. Each requires its own review before implementation.

## 11.1 The insight: Frappe's three crown jewels are all "metadata as data"

| Frappe mechanism              | Verified shape                                                                                                                                 | What it buys                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `sync_for()`                  | Derives tables from DocType metadata, ordered (core → `custom_field` → `property_setter`)                                                      | **Schema without hand-written DDL**            |
| `Custom Field` (a DocType)    | `dt, label, fieldname, insert_after, fieldtype, options, fetch_from, default, reqd, unique, permlevel, depends_on, width, columns, properties` | **Extend any entity at runtime, as a row**     |
| `Property Setter` (a DocType) | `doctype_or_field, doc_type, field_name, property, property_type, value, default_value, is_system_generated`                                   | **Override any property at runtime, as a row** |

Together these mean Frappe can reshape an entity **without code and without a
migration**. Athyper made metadata typed-relational — correct for governance — but
lost that dynamism, and that is precisely where the 11 layers came from.

**The synthesis to adopt:** typed columns for the _core entity shape_; **data rows
for extension and override**, bounded by a closed property registry. That keeps
AGENTS.md's ban on property bags intact while recovering Frappe's velocity.

## 11.2 Tier 1 — transformative. Adopt.

### R1 · Metadata generates schema (from `sync_for`)

**Recommendation.** One property declaration generates: DDL fragment, Kysely type,
published descriptor, browser type, parsers, save/load mapping, compiler mapping
and validation skeleton. Target: a new property = **1 declaration + 1 runtime
consumer + fixtures**.

**Adaptation, not port.** Frappe executes DDL at `bench migrate`. Athyper must keep
review, so generate a **reviewed forward migration** at build time rather than
executing DDL at runtime. This preserves immutable applied hashes and independent
review while removing the hand-wiring.

**Why it matters most.** This is the root cause of every velocity complaint. It is
also proven at 3,022 fields across 15 years.

### R2 · Extension as data (from `Custom Field`)

**Recommendation.** A tenant extension field should be a **typed row** consumed by
the compiler, not a migration. Athyper already designs this (E1/F7) but has not
built it.

**Correction (8 October 2026 review).** Frappe's Custom Field avoids a _manually
authored_ migration; it does **not** avoid a physical schema change.
`custom_field.py:213` calls `frappe.db.updatedb(self.dt)` inside `on_update`. The
earlier claim that it avoids DDL was wrong.

**Adaptation.** Keep typed columns and validation; the row is typed, never a
property bag. Adopt Frappe's _mechanism_ (data, not DDL), reject its _looseness_
(unvalidated `options`/`properties` blobs).

**Why it matters.** Multi-tenant extension is currently the most expensive
operation in the platform and the one tenants will request most.

### R3 · Property overrides — **withdrawn as proposed**

**Withdrawn 8 October 2026.** The original R3 proposed a generic table of
`target_id + property_key + value_type + typed_value` bounded by a closed registry.
That is an **entity–attribute–value configuration model**, and restricting its keys
to a registry makes it bounded and more governable — it does not make it cease to
be EAV. The blueprint excludes it explicitly at
[blueprint.md:30](../blueprints/entity-studio/blueprint.md#L30):

> "No authoring property bag, **EAV replacement for configuration**, executable
> code/SQL upload, entity-name dispatch or inferred permission is part of this
> model."

The original text argued the design was "safe under AGENTS.md" by defending the
letter of the rule while violating its intent. It also understated the semantics
such a store hides: precedence, conflicting edits, inheritance versus clearing,
baseline upgrades, protected properties and references to removed members.
**Ordering alone is not a sufficient resolution policy.**

**Replacement direction.** Use the blueprint's **explicit typed overlay and
override contracts**. Note that the design direction and the available
implementation are different things:

- `metadata.capability_profile_override_rule` is a **proposed** dictionary entry,
  not an installed capability.
- `metadata.entity_surface_overlay` is **not present** in the canonical DDL; the
  generated native authoring guard actively rejects overlay usage as unavailable
  (`NATIVE_REFERENCE_STORAGE_UNAVAILABLE:entity_surface_overlay`,
  [33_native_typed_row_guards.generated.sql:198](../../server/db/ddl/planes/studio/metadata/33_native_typed_row_guards.generated.sql#L198)).

Therefore: **implement and qualify the missing portions through the shared
authoring repository, compiler and runtime before enabling their controls.** Do not
describe the sanctioned direction as an existing mechanism.

### R4 · Declarative behaviour flags

**Verified on Frappe's DocType:** 33 flags —
`is_submittable, istable, issingle, is_tree, is_virtual, track_changes, autoname,
naming_rule, allow_rename, allow_import, allow_copy, quick_entry, editable_grid,
title_field, search_fields, sort_field, sort_order, image_field, max_attachments,
translated_doctype, show_title_field_in_link, default_print_format, …`

**Recommendation.** Ensure Athyper's equivalent flags are **authorable, compiled and
capability-resolved** — never referenced by entity name in code. This is the
cleanest expression of AGENTS.md's "no hardcoded entities" rule: behaviour comes
from declared flags, resolved through registered capability contracts.

**Note.** Many exist as dictionary columns already. The gap is that they are not
authorable end-to-end, which is an R1 problem, not a missing-property problem.

## 11.3 Tier 2 — high value

| ID  | Technique                                                               | Athyper adaptation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R5  | **Ordered once-only patches with a patch log**                          | **Corrected 8 Oct 2026.** Frappe's `executed()` is `get_value("Patch Log", {"patch": …, "skipped": 0})` — a `skipped=True` row is **not** counted as executed, and an already-executed patch can return success without a new record. The earlier "skipped means success" framing was wrong. Desired outcomes: applied + matching checksum → report applied and preserve the receipt; applied + different checksum → integrity failure; not applied → run; failed/interrupted → uncertain, reconcile before retry; deliberately skipped → record the disposition without claiming success. Append invocation history separately; never rewrite original migration evidence                                                                                                                                                                                                       |
| R6  | **Generate transport contracts around the shared mutation path**        | **Narrowed 8 Oct 2026.** Generate request schemas, response types, client bindings and docs around the **registered command handlers**. Generic CRUD for authoring tables would be a regression — revision checks, sibling ordering, identity references, audit and transactional constraints cannot be represented at table level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R7  | **Dependency-aware cache invalidation**                                 | **Corrected 8 Oct 2026.** Athyper **already** keys the cache by entity: `EntityDescriptorCoordinate = {tenantId, principalId, planeKey, entityCode}`, and `descriptorKey()` derives tenant and system generation keys from it. The earlier claim that entity-level granularity was missing was wrong. The genuinely missing idea is Frappe's _dependency-aware_ clearing — invalidating affected parent/related types when child metadata changes. Treat as a **verification** question, not a defect finding: does activation invalidate all affected descriptors; do shared-profile and referenced-resource changes reach dependents; do product changes propagate to tenant-effective metadata; can delayed events or concurrent reads repopulate obsolete entries; does a cache failure fall back to authoritative metadata rather than turning missing evidence into access |
| R8  | **Declarative composition patterns** (`istable`, `is_tree`, `issingle`) | Tree and child composition exist in design; a **singleton/settings** pattern may be valuable. **Conditional:** add only on a demonstrated Entity need, with explicit scope and lifecycle semantics defined first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R9  | **`permlevel` + per-role DocPerm ergonomics**                           | Keep Athyper's field-access model; adopt the _ergonomic_ lesson — a shared matrix editor that writes the canonical typed rows, with preview explaining the exact published permission, applicable field/record restrictions, source release and denial reason. It must preserve the distinction between a valid absent permission and unavailable or invalid metadata, and must not derive permission codes or add MFA requirements                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 11.4 Do NOT adopt

| Rejected                                            | Reason                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Server/client scripts, executable upload            | AGENTS.md forbids executable code upload outright                      |
| `layout_config`-style JSON blobs                    | This is the legacy source Athyper is eliminating                       |
| Runtime DDL execution at request time               | Breaks immutable applied migrations and independent review             |
| Frappe's governance model                           | Athyper's (artifacts, review, activation heads) is materially stronger |
| Record submission lifecycle (`docstatus`, amend)    | Parked workflow territory — do not pull it into the reference slice    |
| Auto cross-cutting fields (`_user_tags`, `_assign`) | Capability scope, parked; revisit after the reference slice            |

## 11.5 Recommended sequencing

| Order | Item                                | Rationale                                                          |
| ----- | ----------------------------------- | ------------------------------------------------------------------ |
| 1     | **R1 — generation**                 | Unblocks everything else; highest leverage; a fix, not a rewrite   |
| 2     | **R4 — behaviour flags authorable** | Cheap once R1 exists; directly serves the no-hardcoded-entity rule |
| 3     | **R3 — property override registry** | Removes tenant/plane variation from the migration path             |
| 4     | **R2 — extension as data**          | Only valuable after R3's registry exists                           |
| 5     | **R5–R9**                           | Incremental robustness; each independently reviewable              |

## 11.6 The strongest single recommendation

> **Adopt Frappe's "metadata as data" for _variation_, while keeping Athyper's
> typed columns for _core shape_ — and make one declaration generate the schema,
> descriptors and mappings (R1).**

Frappe's three crown jewels (`sync_for`, `Custom Field`, `Property Setter`) are all
the same idea applied at three levels. Athyper implemented the _governance_ of that
idea and skipped its _generation_ — which is why adding one property currently
costs eleven hand-wired layers.

**Superseded in part (8 October 2026).** The original claim that adding R1 **and
R3** yields Frappe's velocity is withdrawn: R3 is withdrawn (see above), and its
replacement depends on overlay contracts that are designed, not installed. R1
stands; its effect must be **measured**, not asserted. The original claim that this
would be "strictly better than either framework" is also withdrawn — more
governance carries operational complexity, and superiority requires demonstration
under real workloads, not argument.

## 11.7 Assurance model — three boundaries, not one

The verification chain has three distinct assurances. None substitutes for another,
and the earlier wording ("parity certifies structure") was too broad.

| Assurance                          | What it proves                                                                     | Evidence required                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Generated artifact consistency** | Pinned inputs reproduce the committed generated outputs                            | Manifest → disposable DB → introspection → relation normalization → type generation → diff against committed artifacts |
| **Database contract consistency**  | Relevant catalog objects, integrity rules and security controls match expectations | Catalog comparison of views, relations, ACLs, RLS flags and policies, column privileges, functions and triggers        |
| **Runtime qualification**          | Actual supported user operations work under the intended permissions and scope     | Authenticated positive/negative flows with revocation, plane lag and unmappable-pin cases                              |

Fresh-install versus upgrade compatibility is a **cross-cutting scenario** within
these assurances, not a fourth category: a clean manifest build can pass while an
existing installation missed a forward migration.

### 11.7.1 The verification gap — precisely scoped

**Finding.** The inspected CI invokes `codegen` and checks generated TypeScript for
differences. Because the committed Prisma snapshots are inputs to that step, a
**stale snapshot can reproduce stale Kysely types successfully**. The inspected CI
therefore does not prove that the committed snapshots and generated types reflect
the schema produced by the current plane manifests.

**Scope of this finding.** It establishes a **missing verification**, not that any
generated type is currently wrong, and not that other checks are absent. The
repository already applies the right instrument for contract consistency:
`server/db/scripts/lib/database-catalog.ts` queries views, relation security
(owners, reloptions, ACLs), column privileges, functions, RLS flags and policies,
and triggers — covering PostgreSQL semantics that introspection cannot represent.
`server/db/scripts/reports/database-drift.ts` exists, but its existence proves only
that tooling exists; coverage depends on its selected schemas, catalog queries,
execution and results.

**Prisma introspection cannot certify the database contract.** It does not
represent RLS policies, grants, function execution privileges, triggers,
security-definer behaviour or check constraints. Snapshot parity verifies the
**represented schema projection** only.

### 11.7.2 Interim notice — advisory only

A "DDL changed without a type change" heuristic **must not be a blocking gate**. It
would fire on changes that legitimately require no type change (RLS, grants,
triggers, function bodies, many constraints and indexes), it can be satisfied by an
unrelated generated-file edit while the relevant column is still missing, and it
encourages meaningless edits to artifacts that should change only through
generation.

If an interim signal is used at all, keep it advisory, keep investment small, and
remove it once the real check exists:

> Database definitions changed. The existing generation check verifies snapshots
> against generated types; it does not yet verify those snapshots against freshly
> applied manifests. See the regeneration procedure.

The notice must not claim to close the verification gap.

## 11.8 Corrected priority — two concurrent concerns, not a serial programme

The earlier ordering wrongly treated generation as "demoted to priority five."
Generation that removes a current Country/State Region blocker should happen **as
part of completing that path.**

| Concern                 | Contents                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| **Framework assurance** | Reproducible database-to-type generation; generator mapping fixtures; upgrade compatibility           |
| **Entity delivery**     | Complete the reference entities' authoring, publication, activation and shared list/detail experience |

Extend generation wherever it directly reduces duplication **in those activities**.
Defer broad extension mechanisms until their existing blueprint requirements are
satisfied. This avoids turning useful verification work into another indefinite
prerequisite for all Entity progress.

**Measurement.** Track author effort, machine execution, review waiting and
recovery time separately. Improvements must reduce measured effort without
weakening controls.

## 11.9 Status of this section

This is **assessment**, not design authority. Any accepted architectural change
belongs in the Entity Studio blueprint, not here. Earlier conclusions withdrawn on
8 October 2026 are marked as withdrawn rather than silently rewritten, so the
evidentiary history remains visible.
