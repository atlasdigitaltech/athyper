# Foundation Roadmap — controlling plan

**Status:** controlling plan for foundation work. Supersedes `foundation-cleanup-plan.md` revisions 1–2
of this document and every recommendation in `meta-entity-semantic-foundation.md` revisions 1–3
that conflicts with it. The filename is retained to preserve inbound references.
**Inspection context — not a reproducibly pinned source snapshot:** reviewed at HEAD `0fedc0e97`
with a dirty, concurrently edited working tree (366 changed paths at inspection). These values do
**not** identify the changed file contents. See §2 for the pinning rule.
**Companion specification:** [meta-entity-semantic-foundation.md](meta-entity-semantic-foundation.md)
(revision 4) — **subordinate**. It specifies contract design. Where the two disagree, this document
controls sequencing, scope and gates; that document controls contract shape.

---

## 1. Authority and how to read this document

There is now **one controlling roadmap**. Previously two documents prescribed overlapping and partly
contradictory work. That created a real risk: implementing superseded recommendations.

| Document                                                                             | Role                                                       | Authority                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------- |
| **This document, §§1–11**                                                            | Program: scope, dispositions, ledger, sequencing, gates, estimates | Controlling                                        |
| [meta-entity-semantic-foundation.md](meta-entity-semantic-foundation.md)             | Contract design for L1–L4 and AI                           | Subordinate; must not add phases or gates          |
| [atlas-meta-entity-learning-foundation.md](atlas-meta-entity-learning-foundation.md) | F0–F6 domain plan                                          | Subordinate; its F-phases map onto §7 deliverables |
| Dated `docs/reports/**` and `docs/reviews/**`                                        | Evidence and history                                       | Not instructions; cite, do not execute             |

Appendix A in this file is also evidence and history, not normative instructions. Its uniquely
identified records feed the current closure ledger in §7.0.

**Rule.** No work begins from a dated report, a review appendix, or a superseded revision. Work
begins from a deliverable in §7 with a stated acceptance gate.

---

## 2. Evidence classification and pinning

Claims in this document are labelled **committed** (a named ref), **working tree** (read at the
inspection revision, dirty), or **reported** (a dated report, not re-verified).

**Historical evidence is not current assurance.** Preserving an earlier qualification as _reported_
neither invalidates that historical result nor establishes that the current tree or deployment still
passes it. Canonical wording for the one such claim in this program:

> Country journeys were reported passing for the deployment and source identified in the pilot
> report. Current-checkout reproducibility and current deployment behaviour have **not** been
> requalified.

**Pinning rule.** A HEAD hash plus a changed-path count does **not** identify a reproducible
snapshot. Where evidence must be reproducible, pin one of:

- a clean checkout of a named commit; or
- an explicitly captured source artifact with per-file content hashes.

**Existing tests are never reported as passed tests.** "Test present" and "test executed" are
different evidence classes and must be labelled separately.

Lifecycle vocabulary for every capability claim:
**discovered → registered → exercised → passed → deployed.** A claim at one stage cannot be cited as
evidence for a later stage.

**What the next qualification must produce** — as separate evidence, not one combined claim:

| Evidence                                                      | Establishes                                         |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Source identity and deployment prerequisites                  | Which code and configuration were exercised         |
| Executed tests, including failures and skips                  | What actually ran, and what did not                 |
| Active release and descriptor readback on the intended planes | What the deployment is actually serving             |
| Country journeys against that same qualified source           | End-to-end behaviour of the served artifact         |
| Denial, stale-publication and replay cases                    | The negative paths that green journeys do not cover |

**This does not block D1 scoring work.** It **does** block any claim that the current deployment, or
the complete reviewed learning journey, has been qualified.

---

## 3. Scope discipline

The standing instruction is: **only new Entity onboarding and fixes or improvements to the shared
Entity Framework.** Broad cleanup is not an automatic prerequisite for the already-supported Country
learning loop. Conversely, an authorization defect does not wait behind unrelated cleanup.

**Connection rule.** Every task in §7 must state its connection in this form:

> _This change is necessary for this Entity publication / authorization / runtime / onboarding
> guarantee: …_

A task that cannot state it belongs to an independent platform project and must be raised separately
rather than absorbed here.

**Governing architecture (unchanged).** Published metadata and registered owners feed the existing
Entity list/detail/runtime path. **No parallel entity APIs, custom explorers, application-specific AI
access paths, or bespoke per-entity routes.** A reusable _owner adapter_ may legitimately require
implementation when introducing a capability the framework has never supported — that is framework
work, not a violation.

---

## 4. Disposition of all prior work items

### 4.1 Corrected findings (previously stated, now known wrong or narrowed)

| #   | Prior claim                                                                                              | Disposition               | Corrected statement                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | "Profile enforcement is absent; masking has no production caller" (WS2.1–2.2)                            | **Superseded**            | The host installs a bounded published-profile authorizer (`createPublishedTenantRecordAuthorizer` with `ownerAccess: true`); supported profiles are enforced including `masked` representations; unsupported profiles fail closed. Explicit rollout backend suppliers remain absent, which does not disable enforcement. |
| C2  | "Missing `dependencies.ai` means Atlas is not composed" (WS5)                                            | **Superseded**            | Absence selects the local-runtime composition path; the disabling return belongs to `!routesEnabled`.                                                                                                                                                                                                                    |
| C3  | "Replace the evaluation harness because it calls the production resolver" (WS5.3.3)                      | **Superseded**            | Evaluation must exercise the implementation under test. Corrected requirement: separate improvement scoring from regression protection, and add preservation and safety fixtures.                                                                                                                                        |
| C4  | "The published pipeline cannot carry relations, flows, workflow or materialization"                      | **Narrowed**              | `lowerNativeRuntimePublication` — the **single-storage lowering path** — rejects those branches. Flows also have an existing projection path (`metadata.entity_flow` → `intakeFlows` on the runtime descriptor, per [entity-intake.md](entity-intake.md)). A support matrix is required before extending (§7 D6).        |
| C5  | "Rollback route has no tenant or resource scope at any layer; a shared-reference head is global" (WS4.3) | **Stale — revalidate**    | The route calls `authorizeRollbackTarget({tenantId, publicationKey, targetAppliedReleaseId, targetPlane})` and enqueues tenant-scoped work with `scope: "tenant"`. This does not establish complete rollback safety; it establishes that the old finding is no longer an adequate description. Re-qualify under D4.      |
| C6  | "`layoutConfig.ai` is a second authoring authority"                                                      | **Narrowed**              | `definition.ai` is the authoritative input; `graph-builder` **projects** it into surface `layoutConfig.ai`. A projection is not a second authority. Independently editable representations with conflicting precedence would be. Document the authority and round-trip (§7 D5).                                          |
| C7  | "Migration README says the manifests are comment-only" (WS6.1)                                           | **Completed**             | The README now describes manifests, checksums, receipts and the runner. Documentation correctness does not prove upgrade compatibility; that still requires qualification (D7).                                                                                                                                          |
| C8  | "`atlas-exact-terms/4.0` and NFKC establish English-only behaviour"                                      | **Superseded**            | The stronger evidence is the `locale: "en"` contract restriction and explicit `toLocaleLowerCase("en-US")` in the phrase normalizer (`entity-ai.ts:373`) and tool selection (`entity-section-tool-selection.ts:14`).                                                                                                     |
| C9  | "Semantic hash is what makes staleness detectable"                                                       | **Superseded**            | `contractHash = sha256(graph)` already covers vocabulary and stale corrections are already refused. A semantic hash serves attribution, caching and compatibility.                                                                                                                                                       |
| C10 | "Conformance levels convert a 14-step checklist into a 4-option decision"                                | **Superseded**            | Replaced by capability requirements plus optional presets; the checklist remains and is automated (§6).                                                                                                                                                                                                                  |
| C11 | "Delete the `bp_*` catalogue entries"                                                                    | **Deferred to migration** | Inventory → manifests → retain equivalents → migrate consumers → remove. Deletion alone would break published and conversation consumers.                                                                                                                                                                                |
| C12 | "Publish what installed owners support per release"                                                      | **Superseded**            | Use three distinct concepts: release requirements / deployment support / effective availability (§7 D5).                                                                                                                                                                                                                 |
| C13 | "Generate an enforcement report that would have caught these errors"                                     | **Narrowed**              | A static report can list registration sites, predicates, call sites and associated tests. It cannot infer configuration reachability, authorization correctness or deployment behaviour. Build it from explicit registrations and executed receipts (§7 D10).                                                            |

### 4.2 Work items — retained, reworked, deferred or dropped

| Prior item                                                                     | Disposition                                  | Now                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS0.1 CI invocation defects                                                    | **Completed**                                | —                                                                                                                                                       |
| WS0.2 `turbo test --coverage`                                                  | **Completed**                                | —                                                                                                                                                       |
| WS0.3 `policy:i18n` / ESLint config                                            | **Partially completed**                      | ESLint config exists; `policy:i18n` reported passing in Appendix A16/A19; release qualification remains D8                                                                                                   |
| WS0.4 Triage failing checks (historically 19)                                                 | **Retained**                                 | D8; not a prerequisite for D1–D4                                                                                                                        |
| WS0.5 "Land or revert the dirty tree"                                          | **Reworked**                                 | Qualify an **isolated checkout or captured source snapshot**; preserve unrelated work (§2)                                                              |
| WS0.6 "No build output on disk"                                                | **Reworked**                                 | Source scanners must exclude generated directories; require clean-checkout reproducibility and no unintended **tracked** outputs                        |
| WS0.7 Stub packages / workspace globs                                          | **Deferred**                                 | Out of scope unless it blocks an Entity guarantee                                                                                                       |
| WS0.8 Refresh stale evidence                                                   | **Reworked**                                 | Evidence register + pinning, not blanket regeneration                                                                                                   |
| WS0.9 Failing plane/deployment policy checks                                   | **Retained**                                 | D8                                                                                                                                                      |
| WS1.1 "Implement or narrow the lowering ceiling"                               | **Reworked**                                 | Build the support matrix first; extend only the path the next approved onboarding needs (D6)                                                            |
| WS1.2–1.7 Semantic contract work                                               | **Retained, respecified**                    | Companion spec §3; sequenced as D9                                                                                                                      |
| WS2.1–2.3 Profile backend                                                      | **Superseded by C1; residual item retained** | Residual: rollout backend suppliers and shadow comparison remain uninstalled. No change to enforcement posture required                                 |
| WS2.4 Isolated deployment profiles                                             | **Deferred**                                 | Independent platform project; not an Entity guarantee. Retain combined-only as a recorded posture                                                       |
| WS2.5 Plane-scoped writer role                                                 | **Deferred**                                 | Independent; revisit if publication privilege is shown to affect Entity authorization                                                                   |
| WS2.6 Authorize verification endpoints                                         | **Retained**                                 | D4 (security-relevant)                                                                                                                                  |
| WS3.1 Scope switch → registry                                                  | **Retained, respecified**                    | D5; requires the security and execution contract, not only a registry shape                                                                             |
| WS3.2 Remove `bp_*` from the agent runtime and shell/AI                        | **Retained**                                 | D6, after the registry exists                                                                                                                           |
| WS3.3 Permission-code derivation in the BP namespace                           | **Retained**                                 | D6                                                                                                                                                      |
| WS3.4 Naming-regex behaviour                                                   | **Retained**                                 | D6                                                                                                                                                      |
| WS3.5 Related-child registry constant                                          | **Retained**                                 | D6, when an entity needs a related projection                                                                                                           |
| WS3.6 Reference/lookup sources                                                 | **Deferred**                                 | Until an onboarding requires a new source                                                                                                               |
| WS3.7 Catalog modules and the placeholder surface                              | **Reworked**                                 | Require **honest availability** per exposed module, with explicit `planned`/`container` status. Do not fabricate entity bindings (D8)                   |
| WS3.8 Entity-literal guard                                                     | **Reworked**                                 | A literal scanner finds some coupling and misses indirect dispatch. Combine with dependency boundaries, registration rules and reviewed exceptions (D6) |
| WS4.1–4.2 Publication recovery / failure classification                        | **Elevated to prerequisite**                 | D4                                                                                                                                                      |
| WS4.3 Rollback route                                                           | **Revalidate**                               | See C5; D4                                                                                                                                              |
| WS4.4–4.8 Drift, policy tables, dead transport, dead code, readiness reporting | **Split**                                    | Drift/policy tables/readiness → D5. Dead transport and dead code → deferred unless an Entity guarantee depends on them                                  |
| WS5.3.1 Compose the AI graph                                                   | **Superseded by C2**                         | Not a defect. Recorded configuration posture only                                                                                                       |
| WS5.3.2 Tool authority + policy tables operative                               | **Retained**                                 | D5                                                                                                                                                      |
| WS5.3.3 Evaluation harness                                                     | **Superseded by C3**                         | D1–D3                                                                                                                                                   |
| WS5.3.4 Second entity end to end                                               | **Retained**                                 | D9                                                                                                                                                      |
| WS5.3.5–5.3.7 Broaden targets, lineage, drift                                  | **Retained**                                 | D9                                                                                                                                                      |
| WS6.1 Migration README                                                         | **Completed**                                | See C7                                                                                                                                                  |
| WS6.2–6.6 Upgrade proof, DDL ambiguity, duplicates, ADR Decision 2             | **Elevated (6.2) / deferred (6.3–6.6)**      | Upgrade proof → D7. Schema consolidation and ADR re-homing are independent efforts; raise separately                                                    |
| G1 "CI green" gate                                                             | **Retained**                                 | D8, scoped to Entity-relevant checks                                                                                                                    |
| G2 "Clean tree" gate                                                           | **Reworked**                                 | See WS0.5/0.6 rework                                                                                                                                    |
| G3 all-or-nothing framework gate                                               | **Superseded**                               | Replaced by the qualification matrix in §6                                                                                                              |
| G4 enforcement proof                                                           | **Retained, scoped**                         | Per §6 row, not one gate                                                                                                                                |
| G5 "no silent failure"                                                         | **Reworked**                                 | Readiness dimensions are independent; support evidence is deployment-bound (§7 D5)                                                                      |
| G6 plane boundary                                                              | **Narrowed**                                 | Forbidden **domain** dependencies vs approved **composition** imports                                                                                   |
| G7 AI proof                                                                    | **Retained, made exact**                     | D3 acceptance criteria                                                                                                                                  |
| 165–300 engineer-day total                                                     | **Withdrawn**                                | Replaced by bounded deliverables in §7                                                                                                                  |
| Onboarding freeze pending G3/G4                                                | **Withdrawn**                                | Replaced by capability-specific admission in §6                                                                                                         |
| "Atlas last" sequencing                                                        | **Withdrawn**                                | No phase is prohibited; work is ordered by dependency and authorization risk                                                                            |

---

## 5. Corrected program principles

1. **Capability-specific admission, not an all-or-nothing gate.** Each capability qualifies on its
   own evidence (§6).
2. **Intended planes only.** An entity is published and activated on the planes it belongs to, with
   **denial or documented absence on the others**. Universal activation across three planes is not a
   requirement in itself.
3. **"Metadata-only" means** no entity-specific modifications to **shared runtime code**. Registering
   a new reusable owner adapter for a previously unsupported capability is legitimate framework work.
4. **Parallel work is allowed.** Reproducibility assembly and scoring correction do not block each
   other.
5. **Authorization defects outrank cleanup.** A demonstrated authorization defect goes first.
6. **Publication and migration reliability are prerequisites**, not late hardening.
7. **Readiness reports availability; it never grants access.** Request authorization remains
   authoritative even when deployment qualification is green.

---

## 6. Capability-specific qualification matrix (replaces G3)

Qualify the capability being onboarded. Do not require unrelated capabilities as proof.

| Profile being qualified | Necessary evidence                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Reference read**      | Country-style publication; authorized list/detail; supported controls; no entity-specific shared-code change |
| **Tenant read**         | Tenant containment; field policy; list/detail/export behaviour; masked-field query-inference denial          |
| **Owner-scoped write**  | Owner enforcement; validation; concurrency; mutation authorization; rejection paths                          |
| **Relational read**     | Parent authorization; locked record scope; pagination; aggregate containment                                 |
| **Governed change**     | Approval; idempotency; execution authority; recovery; partial-failure handling                               |

**Cross-cutting requirements for every row:**

- publication on the entity's **intended** planes, with denial or documented absence elsewhere;
- authorization re-checked at every invocation regardless of prior qualification;
- scope-substitution resistance: changing a parent, tenant, filter, cursor or export payload must not
  broaden access;
- evidence labelled by lifecycle stage (§2), with executed tests distinguished from tests present.

---

## 7. Deliverables

Each deliverable states its scope connection, work, and acceptance gate. Estimates are ranges for a
focused engineer **including verification**, for that deliverable only. They are not commitments and
do not sum to a program estimate.

### 7.0 Closure ledger — reconciled 2026-10-02

This is the mutable status register for §§4, 7, 8.1 and 11. Appendix A is historical,
not a source of new work instructions. The gates in D1–D10, §6 and §8.1 remain controlling;
ledger summaries neither weaken them nor introduce blanket deployment prerequisites.
This reconciliation reads recorded evidence; it does not rerun tests, inspect private receipts,
requalify the current checkout, publish an Entity or verify a serving deployment.

**States:** OPEN, IN PROGRESS, IMPLEMENTED and DEFERRED are non-terminal. CLOSED means the
item's own criterion is satisfied; TRANSFERRED requires a named destination and its accepted owner;
SUPERSEDED or WITHDRAWN requires the replacement or authorized disposition. A deferred item is not
a transfer. Missing accepted ownership is recorded as **unassigned**, not inferred from a package,
responsibility area or recommendation. `Blocked by: none` is valid and does not imply completion.

**Evidence is separate from state.** Retain §2 provenance (committed, working tree, reported),
source/configuration pins, and capability lifecycle (discovered, registered, exercised, passed,
deployed). Do not map IMPLEMENTED to exercised or CLOSED to deployed. Documentary corrections and
owner decisions can close on inspected text or recorded authority; source gates require executed,
reproducibly pinned results; serving gates additionally require matching active-release/readback
and authorization evidence. A report reference is not itself a verified receipt.

**Counting:** acceptance rows below are the actionable work count. D1–D10 and stages S1–S6 are
rollups, not additional tasks. C rows are finding dispositions; W rows map every §4.2 row, preserving
its grouped identifiers; O rows are decisions. Report those populations separately. An aggregate
may close only when its applicable gate and all required acceptance rows close. Program closure
requires every in-scope acceptance row and required decision to be terminal, every rollup gate
satisfied, and every remaining disposition either terminal or explicitly accepted outside scope.
A mapping to another item never closes that item's work. No transfer is recorded in this revision.

#### Evidence register

Pins below are **reported by the cited records**, not independently reverified in this edit.
`unrecorded` means there is no reproducible acceptance pin established here. Where a record contains
both diagnostics and a captured packet, only the packet's actual contents receive its pin.

| Evidence ID | Pointer | Provenance / achieved evidence | Recorded identity and limit |
| --- | --- | --- | --- |
| E12 | [A12](#a12), including former §12.1 | Working-tree implementation and earlier live Country/model diagnostics | Use exact source/deployment identities in A12; not present-checkout assurance |
| E13 | [A13](#a13) | Working-tree preparation checks; assigned custody; no independent content | unrecorded for acceptance; author catl.admin, approver catl.owner |
| E14 | [A14](#a14) | Reported captured manifest-pinning source checks | Private foundation-manifest-pinning/2026-10-02T02-05-51 packet; compiler db06508d28b7fe0e15dc9504e51578dc385d1fa1793d618cefb87449eaf7d3a3 |
| E15 | [A15](#a15) | Reported Principal/Preference publication and bounded live results; local scope tests | Exact releases/receipts in A15; empty child journeys and failed model/field explanation are not acceptance |
| E16 | [A16](#a16), [A16-D7](#a16-d7), [A16-D8](#a16-d8) | Reported upgrades and static diagnostics; independent content absent | Historical packet references in these records; source-drift runs not qualification |
| E17a | [A17a](#a17a) | Reported captured reproducibility assembly | Exact archive/source pins in A17a; not deployed qualification |
| E17b | [A17b](#a17b) | Working-tree executed D1/D2 checks, 359 AI tests | unrecorded reproducible acceptance pin |
| E18 | [A18](#a18) | Working-tree support-storage implementation checks | unrecorded deployment pin; installation status updated by E20 |
| E19 | [A19](#a19) | Reported captured six reconstructed upgrade paths and 44/7 static profile | D7 source index aff2356c76e95fa91afd5bfca1b8eb817f2de1b0f359914fa628b4da45e90082; D8 fingerprint 881d29026362abcc694d021d27fda368c2da3c38988f08902d70d03ab90e4f19 |
| E20 | [A20](#a20) | Reported clean-candidate source qualification, 16 checks / 228 tests | Candidate c4c39123a606a00bf28c899270c0c43e210e5b4a; tree 1c4c1d10d075739514864669d3688704783869ea6229793fc6c0d78b02436219; private foundation-publication/2026-10-02T03-02-34.037Z-695011 packet; not serving proof |
| E21 | [A21](#a21) | Working-tree installed-manifest compatibility checks | unrecorded new qualification pin; does not replace E20 |
| E22 | [A22](#a22) | Working-tree attempt preservation: 4 tests plus 3 preparation tests | unrecorded acceptance pin; implementation-diagnostic only |
| E23 | [A23](#a23) | Working-tree publication conflict classification: 46 targeted tests | unrecorded new qualification pin; does not replace E20 |
| E24 | [A24](#a24) | Recorded owner target decision; inspected support matrices; 104 local tests | Owner decision 2026-10-02; unrecorded new source qualification pin |
| E25 | [A25](#a25), [audit follow-up](../reports/architecture-audit-followup-20261002.md) | Executed docs reproduction/fix, ownership metrics, generic relationship pins and reader concurrency checks; nonempty admin/self/denied DEV journeys; failed model receipts | Private architecture-audit/2026-10-02-followup packet carries candidate identity/results; mounted DEV source is not immutable deployment support; independent fixtures/agreement absent |
| E26 | [A26](#a26), [audit follow-up](../reports/architecture-audit-followup-20261002.md#follow-up-successful-reference-citations-and-serving-admission) | Country field model/tool citation and deterministic summary citation passed; Principal explicit-support admission blocker isolated | Private atlas-acceptance/2026-10-02/runtime-evidence.json retains actual model/tool records and hashes; independent custody and Principal deployment support remain pending |
| E27 | [A27](#a27), [qualification writer](../../server/packages/platform/metadata/src/entity-support-qualification.ts) | Shared qualification orchestration and explicit host registration implemented; 80 source tests and both owning package typechecks passed; local source deployment IDs installed and authenticated descriptor readback passed | Dedicated custody authentication/storage/atomic authority and actual registered owner probes remain unconfigured; no deployed support receipt or independent acceptance pass |
| ED | §§4.1, 4.2, 9 and 11 | Documentary disposition or recorded owner authority only | No runtime pin applicable; does not prove execution or deployment |

#### Deliverable rollups

All deliverable owners remain unassigned. Evidence IDs resolve to the register above.

| Item | State | Acceptance rows | Closure criterion (existing gate) | Evidence | Blocked by |
| --- | --- | --- | --- | --- | --- |
| D1 | IMPLEMENTED | T01 | Correction, preservation and safety independently verified under D1 | E17b | none |
| D2 | IN PROGRESS | T02–T03 | Real discovery, correct capability and manage/record context separation; retain live-owner/model boundary | E17b, E12 | Relevant D4/D5 for live acceptance |
| D3 | IN PROGRESS | T04–T08 | Independent controlled fixtures and attempt agreement; evaluated artifact approved, published, activated and read back with negative cases | E13, E16, E22 | T04–T05; relevant D4/D5 |
| D4 | IN PROGRESS | T09–T15 | All seven D4 reliability items qualified on relevant paths, including authenticated serving recovery; no cross-plane atomicity claim | E17a, E20, E23 | Relevant D7; serving/custody evidence |
| D5 | IN PROGRESS | T16–T23 | Registry, scope, readiness and semantic-authority gates in D5; request authorization preserved | E14–E15, E18, E20–E21 | Serving/custody and nonempty scope evidence |
| D6 | IN PROGRESS | T24–T26 | Principal-family standard list/detail/runtime; only demonstrated gaps; historical compatibility under current authorization | E15, E24 | Relevant D5; D7 only for schema-dependent work |
| D7 | IN PROGRESS | T27–T28 | Pinned populated forward upgrades, preserved data and exact retries for every declared supported baseline and plane | E16, E19–E20 | Supported historical/DEV/QA baseline declaration |
| D8 | IN PROGRESS | T29–T38 | D8 scanner/availability/disposition gate plus existing clean release, tracked-output and passing-release requirements | E16, E19 | Seven recorded failing gates; release assembly |
| D9 | DEFERRED | T39 | Agreed locale, isolation, ambiguity, executable-target, held-out and authorized-cache guarantees | E24 | Relevant D3/D5 |
| D10 | DEFERRED | T40 | Generated registration/receipt report with distinct lifecycle stages and pinned source; no inferred enforcement | E24 | Relevant D5 |

#### Actionable acceptance rows

The evidence column identifies existing progress, **not proof of the unmet criterion**. All rows
remain non-terminal. `unassigned` means an accepted owner is still missing. T04 and T06 retain the
explicit custodian assignments; T05 records the required participants without inventing an accepted
rules author. The project owner's 2026-10-02 assignment pairs fixture author/candidate proposer
under catl.admin and fixture reviewer/publisher/evaluation reviewer under catl.owner. These two
principals must differ; maker/checker crossover remains forbidden. This supersedes the historical
four-principal requirement. No fabricated questions, identity,
review, agreement or successful retry may substitute for independent acceptance.

| Item | State | Item-specific closure criterion | Evidence | Owner | Blocked by |
| --- | --- | --- | --- | --- | --- |
| T01 | IMPLEMENTED | D1: capture reproducible correction/preservation/safety execution and per-purpose scoring; already-correct preservation passes without masking safety failure | E17b | unassigned | none |
| T02 | IMPLEMENTED | D2: pin real discovery/coordinator execution, admitted capability mismatches, manage/record separation and declared context cases | E17b | unassigned | none |
| T03 | OPEN | D2: qualify the outstanding production-owner/model answers with source/model/configuration bindings; context forwarding is not live tenant isolation | E12, E17b | unassigned | Relevant D4/D5 |
| T04 | OPEN | D3: independently author held-out correction/preservation/safety questions with exact capabilities and bounded arguments; not authored | E13, E16, E22 | catl.admin (assigned author) | none |
| T05 | OPEN | D3: author and record predeclared repetitions, nondeterminism, safety thresholds and attempt rules agreed with catl.admin/catl.owner before acceptance; not authored | E13, E16, E22 | unassigned (custodian agreement required) | none |
| T06 | OPEN | D3: authenticated independent review/publication, recorded authorship and single-author history with required role separation; account existence is insufficient | E13, E22 | catl.owner (assigned approver) | T04–T05; authenticated session/action authorization |
| T07 | OPEN | D3: bind candidate/source/fixture/evaluator/artifact to activated release; concurrent edits, stale-source publication and rejected approval exercised | E12, E22 | catl.admin (proposer), catl.owner (evaluation reviewer) | T06; relevant D4 |
| T08 | OPEN | D3: retain every semantic/runtime attempt and pass runtime readback, denial, stale/revocation/replay and disclosure cases against the same approved release | E12, E22 | unassigned | T05–T07; relevant D5 |
| T09 | IN PROGRESS | D4: pinned exact-retry/idempotency receipts on relevant publication and recovery paths | E20 | unassigned | none |
| T10 | IMPLEMENTED | D4: qualify permanent/conflict/transient classification including E23 repairs in a reproducible packet | E20, E23 | unassigned | none |
| T11 | OPEN | D4: full tenant/resource/owner authorization for verification and recovery, including negative paths | E20 | unassigned | Authenticated qualification actors |
| T12 | OPEN | D4: end-to-end concurrent publication/activation protection with target/source and per-plane outcomes | E20 | unassigned | Serving qualification |
| T13 | OPEN | D4: requalify C5 rollback authorization, target compatibility and authenticated deployed target readback | E20 | unassigned | Serving qualification |
| T14 | OPEN | D4: partial-plane recovery reaches authenticated serving state; preserve per-plane receipts and explicit non-atomic recovery behavior | E20 | unassigned | Serving qualification; T18 |
| T15 | IN PROGRESS | D4: qualify required schema upgrades on relevant supported baseline with source/baseline/target/per-plane positive and negative evidence | E19–E20 | unassigned | T27–T28 |
| T16 | IN PROGRESS | D5: answer seven registry contract questions; qualify owner dependencies, historical manifests and conformance authority while preserving historical interpretation | E14, E20–E21 | unassigned | none |
| T17 | OPEN | D5: nonempty self/admin/denied parent-scoped rows/counts/groups/search/IDs/export and Atlas answers; substitutions, cursor/stale/revoked access and background/transaction refresh guarantees | E15, E20, E24–E25 | unassigned | Remaining model-answer, revoke/refresh and serving evidence; T18–T20 |
| T18 | IN PROGRESS | D5: authenticated qualification writer, immutable receipt retention/permissions and authorized mutable pointers/serving-target authority; no fabricated support receipt | E18, E20, E27 | unassigned | Orchestration/host registration implemented; dedicated deployed custody, owner probes, retention and authority acceptance remain |
| T19 | OPEN | D5: production build and actual serving deployment/configuration/adapter identity bound to receipts and readback; DEV compiler identity alone insufficient | E20–E21 | unassigned | Production identity and serving evidence |
| T20 | IN PROGRESS | D5: qualify shared evaluator at startup/activation/configuration change/admission; removal/mixed versions/expiry invalidate support, required blocks and optional disappears | E20–E21 | unassigned | T18–T19 |
| T21 | OPEN | D5: complete authorized tenant inventory and policy-table consumption; support evidence never replaces request authorization | E20–E21 | unassigned | Authorized inventory/serving evidence |
| T22 | IMPLEMENTED | D5: retain pinned definition.ai authority, permitted edit paths and round-trip qualification; schema changes only for demonstrated governance gap | E20 | unassigned | none |
| T23 | IN PROGRESS | D5: requalify installed manifest/plane/input/result compatibility repairs for required and optional declarations against the selected source/serving targets | E21 | unassigned | T18–T20 |
| T24 | IMPLEMENTED | D6: preserve approved Principal-family target and Employee/BP comparison matrices; revalidate selected capability support before extension | E24 | unassigned | Relevant D5 |
| T25 | OPEN | D6: qualify Principal-family standard list/detail/runtime and nonempty embedded relationships, including summary/field explanation/export/Atlas; Profile AI/PII requires separate declared admission | E15, E24–E25 | unassigned | T17; relevant D5; D7 if schema gap |
| T26 | OPEN | D6: migrate remaining bp_* consumers through registered capabilities with historical IDs/results and current authorization; declared semantics replace name/regex assumptions; reviewed scanner exceptions | E24 | unassigned | Relevant D5; demonstrated scope under D6 |
| T27 | OPEN | D7: declare complete supported baseline matrix and resolve historical/DEV/QA starting schemas; reconstructed baselines are not substitutes | E19 | unassigned | none |
| T28 | IN PROGRESS | D7: rehearse all declared paths on populated disposable databases with nonempty relevant Profile/identity fixtures, preserved data/retries and pinned per-plane receipts; no foundation DDL replay on populated DBs | E19–E20 | unassigned | T27 |
| T29 | OPEN | D8 policy:server-boundaries: owning domain explicitly retires or supports preserved synthetic HR command; do not fabricate an out-of-scope domain service | E19 | unassigned | Owning-domain disposition |
| T30 | OPEN | D8 policy:server-rebuild-boundaries: resolve same command ownership and six source imports through public exports/host composition | E19 | unassigned | T29 |
| T31 | OPEN | D8 policy:frontend-spine: resolve actual supported shared/shell dependencies within existing budgets | E19 | unassigned | none |
| T32 | OPEN | D8 policy:foundation-phase1: resolve foundation CSS/theme size overages without increasing ratchets or losing supported behavior | E19 | unassigned | none |
| T33 | OPEN | D8 format:changed:check: resolve remaining owned-workstream formatting for release assembly while preserving unrelated work | E19 | unassigned | Owning-workstream assignments |
| T34 | OPEN | D8 lint:eslint: resolve warnings within unchanged budget and execute subsequent server lint stage completely | E19 | unassigned | none |
| T35 | OPEN | D8 openapi:check: real contracts for uncovered routes and removal of stale exceptions; no placeholders or baseline growth | E19 | unassigned | Relevant route owners |
| T36 | OPEN | D8: verify honest catalogue/placeholder availability and reachable content or explicit planned/container status | E19 | unassigned | none |
| T37 | IN PROGRESS | D8: verified generated-directory exclusions, boundary/registration exceptions and no unintended tracked outputs in reproducible clean release source | E16, E19 | unassigned | Release source assembly |
| T38 | OPEN | D8: rerun required release profile against selected stable qualified source; retain every result/disposition and passing release evidence | E19 | unassigned | T29–T37 |
| T39 | DEFERRED | D9: qualify agreed locales/canonical tags/fallback/normalization/collisions/ambiguity, typed executable targets, isolation/held-out compiler rules and authorization-sensitive caches | E24 | unassigned | Relevant D3/D5 |
| T40 | DEFERRED | D10: generate explicit registration and executed pinned receipt report distinguishing lifecycle stages and evidence limitations | E24 | unassigned | Relevant D5 |

**Acceptance count:** 40 non-terminal rows; 0 CLOSED, 0 TRANSFERRED, 0 SUPERSEDED/WITHDRAWN.
D1–D10 are 10 non-terminal rollups, not 10 additional acceptance tasks.

**Preparation automation (2026-10-02):** the existing offline benchmark command now validates
the shared Country template, creates proposed attempt rules and a custodian handoff, and optionally
binds the rules hash into the preparation packet. See the [repeatable workflow](../runbooks/atlas-f4-learning-inbox.md#controlled-country-benchmark-preparation).
Six working-tree preparation tests passed; no new reproducible source or deployment qualification
is claimed. The generated template is not independently authored, rules remain proposed, and
T04–T08 remain open. Accepted owners and all existing gates are unchanged.

#### Finding dispositions (C1–C13)

Closing a corrected finding closes the inaccurate statement, not its mapped deliverable.
For terminal documentary dispositions the evidence is ED; no execution/deployment claim is made.

| Item | State | Closure / replacement / remaining criterion | Evidence | Owner | Blocked by |
| --- | --- | --- | --- | --- | --- |
| C1 | SUPERSEDED | §4.1 installed bounded authorizer replaces absence claim; residual suppliers → O1 | ED | unassigned | none |
| C2 | SUPERSEDED | §4.1 local-runtime composition replaces missing-composition claim | ED | unassigned | none |
| C3 | SUPERSEDED | §4.1 evaluation correction replaces replacement demand; D1–D3 retain acceptance | ED | unassigned | none |
| C4 | CLOSED | §4.1 limits rejection claim to native lowering; D6 matrices/gaps → T24–T26 | ED, E24 | unassigned | none |
| C5 | OPEN | Requalify rollback safety rather than repeat stale route description → T13 | ED, E20 | unassigned | T13 |
| C6 | CLOSED | §4.1 records definition.ai authority and projection; D5 round trip → T22 | ED, E20 | unassigned | none |
| C7 | CLOSED | §4.1 records README correction; upgrade proof remains D7 | ED | unassigned | none |
| C8 | SUPERSEDED | §4.1 replaces normalizer inference with explicit locale contract restrictions | ED | unassigned | none |
| C9 | SUPERSEDED | §4.1 records contractHash staleness; semantic hash remains attribution/cache/compatibility | ED | unassigned | none |
| C10 | SUPERSEDED | §6 capability qualification replaces conformance-level shortcut | ED | unassigned | none |
| C11 | DEFERRED | Retain historical IDs until consumers migrate under current authorization → T26 | ED, E24 | unassigned | T26 |
| C12 | SUPERSEDED | D5 distinguishes release requirements, support and availability | ED | unassigned | none |
| C13 | CLOSED | §4.1 narrows report claims; generated evidence report remains T40 | ED | unassigned | none |

**Finding count:** 13 rows; 11 terminal documentary dispositions, 2 non-terminal mappings.

#### Prior work-item crosswalk (§4.2)

W IDs identify the 43 original table rows, including grouped identifiers. These are mappings,
not additional acceptance tasks. Preserve §4.2 dispositions: reported completion is not newly
verified completion; deferred independent work has no accepted transfer destination recorded.
Each owner is **unassigned**; each evidence pointer is **ED**, supplemented by the linked acceptance
row’s evidence. `Blocked by` is the mapped requirement below, or `none` for terminal dispositions.

| Mapping | Prior item | State | Closure criterion / mapped requirement or replacement |
| --- | --- | --- | --- |
| W01 | WS0.1 CI invocation defects | OPEN | Verify recorded CI invocation repair under T38 |
| W02 | WS0.2 `turbo test --coverage` | OPEN | Verify recorded coverage invocation repair under T38 |
| W03 | WS0.3 `policy:i18n` / ESLint config | OPEN | T37–T38; E16/E19 report policy:i18n passing, replacing the old unverified note |
| W04 | WS0.4 Triage failing checks (historically 19) | OPEN | T29–T38; historical 19 is not current failure count |
| W05 | WS0.5 "Land or revert the dirty tree" | OPEN | T37–T38; capture/clean assembly, preserve unrelated work |
| W06 | WS0.6 "No build output on disk" | OPEN | T37 |
| W07 | WS0.7 Stub packages / workspace globs | DEFERRED | Outside scope pending demonstrated Entity guarantee or accepted independent destination |
| W08 | WS0.8 Refresh stale evidence | OPEN | T01–T40 evidence pinning as applicable |
| W09 | WS0.9 Failing plane/deployment policy checks | OPEN | T29–T38 |
| W10 | WS1.1 "Implement or narrow the lowering ceiling" | OPEN | T24–T26 |
| W11 | WS1.2–1.7 Semantic contract work | DEFERRED | T39 |
| W12 | WS2.1–2.3 Profile backend | OPEN | O1; enforcement absence claim superseded by C1 |
| W13 | WS2.4 Isolated deployment profiles | DEFERRED | O2; independent destination/owner unassigned |
| W14 | WS2.5 Plane-scoped writer role | DEFERRED | Independent destination/owner unassigned; revisit only demonstrated Entity authorization impact |
| W15 | WS2.6 Authorize verification endpoints | OPEN | T11 |
| W16 | WS3.1 Scope switch → registry | OPEN | T16–T23 |
| W17 | WS3.2 Remove `bp_*` from the agent runtime and shell/AI | OPEN | T26 |
| W18 | WS3.3 Permission-code derivation in the BP namespace | OPEN | T26 |
| W19 | WS3.4 Naming-regex behaviour | OPEN | T26 |
| W20 | WS3.5 Related-child registry constant | OPEN | T17, T25; only required related projection |
| W21 | WS3.6 Reference/lookup sources | DEFERRED | Onboarding trigger or accepted independent destination unassigned |
| W22 | WS3.7 Catalog modules and the placeholder surface | OPEN | T36 |
| W23 | WS3.8 Entity-literal guard | OPEN | T26, T37 |
| W24 | WS4.1–4.2 Publication recovery / failure classification | OPEN | T09–T14 |
| W25 | WS4.3 Rollback route | OPEN | T13 |
| W26 | WS4.4–4.8 Drift, policy tables, dead transport, dead code, readiness reporting | OPEN | Drift/policy/readiness → T20–T21; dead transport/code deferred without accepted destination |
| W27 | WS5.3.1 Compose the AI graph | SUPERSEDED | C2; none |
| W28 | WS5.3.2 Tool authority + policy tables operative | OPEN | T16, T21 |
| W29 | WS5.3.3 Evaluation harness | SUPERSEDED | C3; residual acceptance T01–T08 |
| W30 | WS5.3.4 Second entity end to end | DEFERRED | T39 |
| W31 | WS5.3.5–5.3.7 Broaden targets, lineage, drift | DEFERRED | T39 |
| W32 | WS6.1 Migration README | CLOSED | C7 documentary correction only; none |
| W33 | WS6.2–6.6 Upgrade proof, DDL ambiguity, duplicates, ADR Decision 2 | OPEN | WS6.2 → T27–T28; WS6.3–6.6 independent/deferred, no accepted destination |
| W34 | G1 "CI green" gate | OPEN | T38 with §6 scope |
| W35 | G2 "Clean tree" gate | OPEN | T37–T38 |
| W36 | G3 all-or-nothing framework gate | SUPERSEDED | §6 replaces G3; none |
| W37 | G4 enforcement proof | OPEN | §6 applicable rows through D1–D10 |
| W38 | G5 "no silent failure" | OPEN | T18–T23 |
| W39 | G6 plane boundary | OPEN | T29–T31, T37; domain vs composition distinction |
| W40 | G7 AI proof | OPEN | T04–T08 |
| W41 | 165–300 engineer-day total | WITHDRAWN | §7 bounded estimates replace total; none |
| W42 | Onboarding freeze pending G3/G4 | WITHDRAWN | §6 capability-specific admission; none |
| W43 | "Atlas last" sequencing | WITHDRAWN | §8 dependency/risk ordering; none |

**Crosswalk count:** 43 rows; 7 terminal dispositions, 36 non-terminal mappings. No transfer is
claimed. Grouped retained/deferred work must be split before a partial transfer can be terminal.

#### Decisions and stage rollups

O1–O5 are tracked in §11, including resolution, authority and date: **4 unresolved, 1 resolved**.
Decision owners are the project owner; no execution owner is inferred. A recommended option is not
a resolution. O5's decision closure does not close D6.

Stage owners remain **unassigned**. State is IN PROGRESS for S1–S5 and DEFERRED for S6.
Every stage closes only on its exact §8.1 completion gate, not merely its mapped deliverable label.
Stage mappings locate related work; they do not require every mapped task to close beyond that
stage’s own gate. In particular, S1 requires explicit resolution tasks, not complete D8 acceptance.

| Item | Mapped work | Evidence | Blocked by / closure gate |
| --- | --- | --- | --- |
| S1 | D7/D8; T27–T38 | E16, E19 | Selected reproducible packet and explicit blocking-check resolution tasks; §8.1 stage 1 |
| S2 | D4/D7; T09–T15, T27–T28 | E19–E20, E23 | Supported baselines and authenticated serving recovery; §8.1 stage 2 |
| S3 | D5; T16–T23 | E18, E20–E21 | Custody/serving evidence; §8.1 stage 3 |
| S4 | D2/D3/D5; T03–T08, T17 | E13, E15, E22 | Independent content/rules and relevant D4/D5; §8.1 stage 4 |
| S5 | D6; T24–T26 | E24 | Relevant D5, D7 for schema-dependent work; §8.1 stage 5 |
| S6 | D9/D10/final D8; T38–T40 | E19, E24 | Relevant D3/D5 and final release evidence; §8.1 stage 6 |

#### Validation contract

A mechanical ledger check must reject duplicate/missing item IDs, missing owner/state/criterion/
evidence fields (including explicit shared defaults), unresolved cross-references or inconsistent
population counts. Missing ownership must remain `unassigned` and be reported as an ownership gap;
it must not be silently assigned. `Blocked by: none` is valid. Missing evidence is explicitly
`unrecorded` and cannot satisfy a closure gate.

A TRANSFERRED row must name a destination and record receiving-owner acceptance evidence/date;
otherwise it remains DEFERRED or OPEN. A CLOSED row must name evidence appropriate to its own gate:
recorded authority/disposition for documentary decisions, pinned executed results for source gates,
and matching deployment/readback plus authorization receipts where serving is required. Merely
having an evidence ID, a passing local test or a pin is insufficient. Required non-terminal children
prevent aggregate closure; missing or expired support cannot establish current availability.

Structural checks can validate fields, links and counts; they cannot authenticate human approval or
prove runtime semantics. Those require actual evidence review. This documentation change specifies
these checks; it does not claim an installed automated validator or newly qualified runtime.

### D1 — Scoring correction

**Connection:** a trustworthy learning loop is required before any learned term reaches an Entity.
**Work:** separate improvement scoring from regression protection; add correction, preservation and
safety fixture purposes; an already-correct case must pass.
**Gate:** correction, preservation and safety behaviour independently verified.
**Estimate:** 3–6 days.

### D2 — Production-context evaluation

**Connection:** learned vocabulary changes what Atlas selects for an Entity; the evaluator must
observe the real selection.
**Work:** exercise production discovery with explicit fixtures for manage vs record context,
installed vs unavailable capabilities, current entity/record/tenant/descriptor, authorized vs denied
principals, and competing meanings among **admitted** tools. Separate resolution expectations
(`read | clarify | delegate`) from execution expectations. Wrong capability is a scored
capability-id mismatch, not a new intent kind. `delegate` is not "unsupported".
**Gate:** real discovery; correct capability selection; context separation.
**Estimate:** 5–10 days.

### D3 — Reviewed learning qualification

**Connection:** proves the published artifact is the evaluated one.
**Work:** independently controlled fixtures with recorded authorship, approver, candidate hash,
scoring revision and attempt policy; exact expected capability ids and bounded arguments; thresholds
for improvement vs hard safety failure; nondeterministic model-path handling. **An aggregate
improvement score must never compensate for a disclosure failure.** Receipt binds candidate, source,
fixture set, evaluator revision and resulting artifact.
**Gate:** the evaluated artifact survives approval, publication, activation and runtime readback; the
receipt identifies the activated release. Also exercise concurrent candidate edits, stale-source
publication and rejected approval.
**Estimate:** 5–10 days.

### D4 — Publication and migration reliability prerequisites

**Connection:** a learning release is only trustworthy if publication is.
**Work:** idempotent retries; correct permanent-vs-transient failure classification; tenant-scoped
recovery; concurrent activation protection; rollback authorization and compatibility
(**re-qualify C5**); partial failure across intended planes; required schema upgrades on the
supported baseline.
**Gate:** each item qualified on the relevant path. **Do not describe cross-plane activation as
atomic unless the implementation supplies it**; report per-plane state and define recovery from
partial completion.
**Estimate:** 10–20 days.

### D5 — Registry, scope contract, readiness, semantic authority

**Connection:** these are the interfaces every later Entity onboarding depends on.
**Work:**

- **Capability registry:** who may register; duplicate id/version resolution; input/output/evidence
  schema identification; exact manifest revision resolution at compile time; version support for
  historical descriptors; required owner dependencies; who verifies a claimed conformance result.
  Manifests are **trusted composition inputs**; metadata selects an approved registration and may not
  choose a module, URL, SQL handler or credential. Preserve old ids and result interpretation until
  consumers migrate; historical compatibility still runs under current authorization.
- **Scope contract:** trusted server inputs vs user-supplied selectors; parameter validation and
  allowed types; parent-record authorization before child disclosure; intersection with tenant and
  user filters; application to rows, counts, aggregates, search, export and background work;
  transaction and authorization-refresh requirements; failure behaviour for missing or incompatible
  resolvers. **Register existing scope behaviour first, preserve its semantics**, then demonstrate a
  second entity on the same shared path. Avoid replacing a switch with an unrestricted extension
  mechanism.
- **Readiness:** the three concepts (release requirements / deployment support / effective
  availability); what identifies the target serving deployment; support-evidence validity; rolling
  deployments with mixed adapter versions; whether a required adapter may be removed while active
  releases depend on it; behaviour when support evidence cannot be refreshed; isolation of optional
  capability failures from unrelated Entity reads. One shared evaluator called from startup,
  activation, configuration change and admission — a successful publication-worker check is **not**
  proof that every API instance can serve the release.
  - **Qualification receipts are immutable.** Record each receipt against the release/artifact hash,
    the deployment and configuration revision, adapter versions, qualification results and
    timestamp. The deployment's **current** support record _references_ the applicable receipt
    rather than overwriting it. History is preserved without treating an old qualification as
    current readiness.
  - **Reassessment triggers.** Adapter removal, configuration change, or publication of an
    incompatible release must force reassessment; a stale receipt must never be read as present
    support.
  - **Optional versus required declarations.** An optional capability that is unavailable must
    **disappear from discovery**; a **required** capability that is missing must **block the relevant
    activation or operation**. Optional and required are distinct declarations with distinct failure
    behaviour.
  - **Request authorization remains mandatory regardless of qualification** — a valid receipt never
    substitutes for a per-request decision.
- **Semantic authoring authority:** document the authoritative input (`definition.ai`), the
  transformation (graph-builder projection), permitted edit paths, and round-trip behaviour. Add
  schema **only** where the existing model cannot express required governance.
  **Gate:** existing behaviour preserved; unavailable tools excluded; deployment changes handled;
  scope-substitution tests pass.
  **Estimate:** 20–40 days.

### D6 — Next justified framework capability

**Connection:** unblocks the next approved Entity onboarding.
**Work:** produce Employee/BP support matrices (**authoring feature → compiler path → artifact → runtime
consumer → qualification status**) before extending anything. Then implement **only** demonstrated
gaps needed by the next approved onboarding. Migrate remaining `bp_*` coupling through registered
capabilities, retaining historical ids and result interpretation until consumers migrate. Replace
entity-name and naming-regex assumptions with declared semantics. Where a literal scanner is added,
pair it with dependency boundaries, registration rules and reviewed exceptions.
**Gate:** another entity uses the standard list/detail/runtime with no shared entity-specific branch.
**Estimate:** scope set by the support matrix; **no blanket estimate**. Relations, flows,
materialization and change cases have distinct semantics and must be decomposed before estimating.

### D7 — Upgrade compatibility

**Connection:** a schema change must be applicable to an existing Entity database before onboarding
depends on it.
**Work:** declare the supported baseline matrix and rehearse forward upgrades from every declared
supported baseline using disposable populated databases. Do not replay foundation DDL on populated
databases.
**Gate:** executed receipts identify the pinned source, baseline, target release and per-plane outcome
for every declared supported path; preserved data and retry behaviour are verified. Migration
classification alone does not establish upgrade compatibility.
**Estimate:** 3–6 days.

### D8 — Static-policy and hygiene gates (reworked)

**Connection:** gates that overclaim erode the evidence they are supposed to provide.
**Work:**

- generated-directory exclusion in scanners; clean-checkout reproducibility; no unintended **tracked**
  outputs;
- literal scanners paired with dependency boundaries, registration rules and reviewed exceptions;
- forbidden **domain** dependencies distinguished from approved **composition** imports;
- catalogue modules require **reachable supported content or an explicit `planned`/`container`
  status** — not fabricated entity bindings;
- the `"ready for published entity experiences"` placeholder corrected to honest availability;
- triage of the failing check set: fix, scope, or retire with a recorded reason.
  **Gate:** scanner exclusions verified; honest availability rendering; no check failing-and-blocking
  without a recorded disposition.
  **Estimate:** 8–15 days.

### D9 — Multilingual semantics and broader targets

**Connection:** extends what learned meaning can express.
**Work:** locale support with canonical tags, supported set, fallback chains, normalization version,
collision handling and cross-locale ambiguity; typed semantic targets with executable meaning;
semantic isolation rules (platform defaults vs tenant overrides, locale fallback, conflicting
meanings, platform promotion, target release compatibility, authorization-filtered discovery);
example split with held-out cases excluded by the compiler.
**Cache rule:** a semantic hash is **not a sufficient cache key** for authorized capability
discovery. Any cache must account for tenant, plane, context, publication, installation and
authorization changes — or reauthorize at the boundary.
**Gate:** locale, isolation, ambiguity and executable-target guarantees demonstrated. For each newly
supported locale, test collisions and ambiguity rather than assuming translation preserves intent.
**Estimate:** 15–30 days.

### D10 — Enforcement boundary report

**Connection:** reduces repeated documentation staleness about enforcement.
**Work:** generate from **explicit registrations** and **executed qualification receipts**:
registration sites, profile predicates, call sites, associated tests, and the lifecycle stage
reached. Pin dirty-tree evidence with content hashes or a captured source artifact.
**Gate:** report generated; stages distinguishable. **It cannot infer configuration reachability,
authorization correctness or deployment behaviour, and does not by itself prove enforcement.**
**Estimate:** 5–10 days.

---

## 8. Ordering

| Order | Deliverable                                           | May run in parallel with               |
| ----- | ----------------------------------------------------- | -------------------------------------- |
| 1     | **D1** scoring correction                             | reproducibility assembly (D4 partial)  |
| 2     | **D2** production-context evaluation                  | D4                                     |
| 3     | **D4** publication and migration prerequisites        | D2, D5                                 |
| 4     | **D5** registry, scope, readiness, semantic authority | D4                                     |
| 5     | **D3** reviewed learning qualification                | after D1+D2, needs D4                  |
| 6     | **D8** static-policy gates                            | anytime                                |
| 7     | **D6** next justified framework capability            | after D5                               |
| 8     | **D7** upgrade compatibility                          | before any schema-dependent onboarding |
| 9     | **D9** multilingual and broader targets               | after D3+D5                            |
| 10    | **D10** enforcement boundary report                   | after D5                               |

**Do not make the whole program a prerequisite for proving the narrow learning loop (D1–D3).**
**Do not use a successful narrow loop as evidence that the broader foundation is complete.**

### 8.1 Pending foundation activity and next activities — 2026-10-02

This sequence directs the remaining work under §7. It preserves the capability-specific admission
rule in §6 and the narrow learning-loop boundary above. Stages 1–4 close pending foundation work;
stages 5–6 describe the next onboarding and semantic work, subject to their relevant gates.
Implementation, publication/activation and verified serving behaviour remain separate claims.

The latest D7/D8 record is Appendix A19: both reconstructed upgrade baselines pass, and the
full static profile has **44 passed / 7 failed** with stable captured source. That
record supersedes earlier failure counts; historical/deployed D7 baselines and
the seven explicitly listed D8 gates remain open.

The earlier implementation record in Appendix A16 reports a captured source packet, migration registration
and passing migration layout and `policy:i18n` checks, bounded upgrade rehearsals, and a shared D5
readiness evaluator. These are recorded results, not closure of the broader qualification gates.
Stage 1 revalidates them against the snapshot selected for the next run, captures configuration,
adapter versions and active releases, and resolves the seven failures in the latest recorded full-profile run (Appendix A19);
that recorded count is not a fresh current-checkout result.
Responsibility areas in Appendix A16 still require explicit accepted owners; independent benchmark questions
and attempt rules remain pending.

| Stage                                           | Deliverables      | Planned activity                                                                                                                                                                                                                                                                                                                                                                                                        | Completion gate                                                                                                                                                                                                                             |
| ----------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Pin the baseline and resolve blockers**    | D7, D8            | Capture source contents, configuration, adapter versions and active releases. Reconcile `20261002_principal_person_link_target.sql` with the migration inventory, checksum and Neon manifest against the selected snapshot, retaining Appendix A16's registration evidence. Verify `policy:i18n` and give each remaining failing check an owner and disposition with an explicit resolution task.                                | Reproducible source packet; migration layout passes; blocking checks have explicit resolution tasks. Classification alone does not establish upgrade compatibility.                                                                         |
| **2. Qualify publication and upgrades**         | D4, D7            | Exercise tenant/resource authorization, rollback compatibility, recovery, exact retries, concurrent publication/activation and partial-plane failures. Rehearse forward upgrades from every declared supported baseline using disposable populated databases.                                                                                                                                                           | Executed positive and negative receipts identify source, baseline, target release and per-plane outcome. Recovery reaches a verified serving state.                                                                                         |
| **3. Complete shared registry and readiness**   | D5                | Install immutable support-receipt storage, trusted deployment support lookup and required/optional declarations. Bind readiness to the serving deployment/configuration. Verify owner dependencies, conformance evidence, policy-table consumption and historical manifest support. Use the shared evaluator at startup, activation, configuration change and admission. Qualify `definition.ai` authoring round trips. | Missing required capabilities block the relevant activation/operation; unavailable optional capabilities disappear from discovery. Configuration changes invalidate stale support evidence. Current request authorization remains enforced. |
| **4. Close live scope and learning acceptance** | D2, D3, D5        | Complete production-owner/model-answer evaluation. Independently author held-out questions, declare attempt rules and obtain authenticated independent approval/publication. Complete nonempty parent-scoped reads, counts, search, aggregates, export and Atlas answers, including revoked access and stale-publication cases.                                                                                         | The evaluated artifact is the activated artifact. Durable runtime answers and scope/denial receipts pass agreed semantic and safety gates. All attempts remain recorded.                                                                    |
| **5. Complete the next onboarding capability**  | D6                | Produce Employee/BP support matrices covering authoring → compiler → artifact → runtime consumer → qualification. Implement only demonstrated gaps. Migrate remaining `bp_*` coupling through registered capabilities, retaining compatibility until consumers migrate.                                                                                                                                                 | Approved onboarding uses the standard Entity list/detail/runtime; declared semantics replace entity-name assumptions; historical consumers remain compatible under current authorization.                                                   |
| **6. Extend semantics and publish evidence**    | D9, D10, final D8 | After relevant D3/D5 gates pass, implement and qualify the agreed locale/semantic scope. Generate the enforcement report from explicit registrations and executed pinned receipts. Run release checks from the qualified snapshot.                                                                                                                                                                                      | Locale ambiguity, isolation and executable-target checks pass. The report distinguishes registered, exercised, passed and deployed evidence; reproducible release evidence is complete.                                                     |

D4 and D5 work may proceed in parallel once the required baseline evidence is pinned. Stage 4
acceptance depends on the relevant D4 publication/recovery and D5 scope/readiness guarantees;
benchmark authorship and attempt-rule preparation can proceed earlier. Stage 5 implementation
requires the relevant D5 gate and D7 qualification before schema-dependent onboarding. Preparing
support matrices does not approve an onboarding target; O5 is now resolved to Principal-family
scope from Appendix A13 by the owner's 2026-10-02 instruction (see Appendix A24).
D10 report preparation may proceed after D5, while final semantic and release qualification remains
in stage 6. A triaged check is not a passing release check, and no gate is weakened by this sequence.

---

## 9. Withdrawn from the previous revision

- The all-or-nothing **G3** framework gate — replaced by §6.
- The **onboarding freeze** — replaced by capability-specific admission.
- **"Atlas last"** and the prohibition on parallel work — withdrawn.
- The **165–300 engineer-day program estimate** — withdrawn in favour of §7 deliverable estimates.
- **"No build output on disk"**, **"land or revert the dirty tree"**, **"no entity literals"**,
  **"no cross-plane imports"**, **"every module needs an entity"** as absolute gates — reworked in D8.

---

## 10. What not to do

- Do not start work from a dated report, review appendix, or superseded revision.
- Do not build parallel entity APIs, custom explorers, or application-specific AI access paths.
- Do not add a capability without a conformance test and a readiness decision.
- Do not assert an enforcement property from one code path — name the installing symbol, or exercise
  the boundary.
- Do not present a present test as a passed test, or a registered capability as a working one.
- Do not claim cross-plane atomicity the implementation does not supply.
- Do not let an aggregate improvement score mask a disclosure failure.
- Do not treat readiness green as authorization.

---

## 11. Open decisions for the owner

Resolution records owner decisions only; implementation and acceptance remain in §7.0.
Unresolved decisions have no recorded decision date; recommendations do not establish approval.
Each decision closes when the project owner records the selected option, authority and decision
date. An independent-work transfer additionally requires destination and receiving-owner acceptance;
implementation remains subject to its own gate. Decision blockers are owner resolution (O1–O4) and
none (O5); execution owners remain unassigned unless explicitly recorded in §7.0.

| # | Decision | Options / impact | Resolution | Authority | Date |
| --- | --- | --- | --- | --- | --- |
| O1 | Rollout backend suppliers | Install or intentionally absent; affects shadow/rollout comparison | UNRESOLVED; absence is a proposed option | Project owner; decision pending | unrecorded |
| O2 | Deployment profiles | Isolation or combined-only posture; independent platform scope | UNRESOLVED; no accepted transfer destination | Project owner; decision pending | unrecorded |
| O3 | Upstream-unsupported authoring | Drafts with validation errors, reject at publication/activation (recommended) | UNRESOLVED; recommendation not adopted by this edit | Project owner; decision pending | unrecorded |
| O4 | Semantic schema | Extend existing model or add tables; existing D5 demonstrated-gap constraint remains | UNRESOLVED; no new schema authorization | Project owner; decision pending | unrecorded |
| O5 | Next onboarding target | Principal-family; relevant D5/D7 gates retained | RESOLVED; target only, not D6 acceptance | Project owner instruction recorded in Appendix A24 | 2026-10-02 |

---

## Appendix A — historical implementation records (not normative)

These **16 top-level records** preserve the original implementation chronology and evidence limits.
They are historical reports, not instructions or current acceptance status. Use §7.0 for outstanding
work and §§6–8 for admission and acceptance gates. Original §12.1 remains within A12. Two original
§17 headings are now A17a/A17b; previously unnumbered D7/D8 records are A16-D7/A16-D8.
Original heading anchors are retained. Historical prose retains its original section references;
the crosswalk below resolves them without rewriting evidence narratives.

Appendix A24 updates A13's Principal-family target/support inventory only; A13's custody requirements
remain applicable through §7.0. A20 records host integration after A18's earlier uninstalled state.
A21–A24 diagnostics do not supersede A20's pinned packet or qualify A15's serving deployment.

| Historical ID | Original record |
| --- | --- |
| [A12](#a12) | 12. Initial implementation record — working tree, 2026-10-01 |
| [A13](#a13) | 13. Next increment started — independent benchmark and Principal-family scope |
| [A14](#a14) | 14. D5 compiler-manifest pinning and D7 inventory increment — 2026-10-02 |
| [A15](#a15) | 15. Principal-parent scope implementation — 2026-10-02 |
| [A16](#a16) | 16. Pending foundation build — 2026-10-02 |
| [A16-D7](#a16-d7) | D7 upgrade compatibility assessment — 2026-10-02 |
| [A16-D8](#a16-d8) | D8 deliverable policy receipts — 2026-10-02 |
| [A17a](#a17a) | 17. D4 reproducibility assembly — 2026-10-02 |
| [A17b](#a17b) | 17. D1 scoring validation and D2 production-context evaluation — 2026-10-02 |
| [A18](#a18) | 18. D5 immutable support-receipt persistence — 2026-10-02 |
| [A19](#a19) | 19. D7 upgrade repair and D8 policy remediation — 2026-10-02 |
| [A20](#a20) | 20. D4/D5 publication recovery and serving readiness integration — 2026-10-02 |
| [A21](#a21) | 21. D5 installed manifest compatibility — 2026-10-02 |
| [A22](#a22) | 22. D3 runtime attempt preservation — 2026-10-02 |
| [A23](#a23) | 23. D4 publication conflict classification — 2026-10-02 |
| [A24](#a24) | 24. D6 target decision, support matrices and D9/D10 admission — 2026-10-02 |
| [A25](#a25) | 25. Architecture audit correction and Principal nonempty diagnostics — 2026-10-02 |
| [A26](#a26) | 26. Country citations and Principal serving-admission diagnosis — 2026-10-02 |
| [A27](#a27) | 27. Qualification writer and local deployment identity — 2026-10-02 |

Historical static-policy counts are preserved per run: A16 reports 29/21 then 31/19 across
50 checks; A16-D8 adds `policy:i18n` to the profile and reports 34/17 across 51 checks, with
source drift. A19 reports the latest captured stable run, **44/7 across 51 checks**, still failed.
These counts are not interchangeable, cumulative, or present-workspace verification.

<a id="12-initial-implementation-record--working-tree-2026-10-01"></a>
<a id="a12"></a>

## A12. Historical — 12. Initial implementation record — working tree, 2026-10-01

This is an implementation/qualification record, not a deployed-release claim or a new gate.
Existing unrelated working-tree changes were preserved.

| Deliverable | Implemented increment                                                                                                                                                                      | Qualification boundary                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| D1          | Versioned correction/preservation/safety scoring, exact capability sets, fixture parser and existing Studio review controls                                                                | Shared evaluator and parser tests; existing caller fixtures retain compatibility                      |
| D2          | Production discovery adapter shares runtime gates; real Country metadata fixtures; exact current-record semantic phrases work with lookup installed                                        | Registry/coordinator selection and admission tests; owner execution/model answer quality are separate |
| D3          | Persisted-graph evaluation; receipt/source/artifact binding; installed evaluator version checks; optional trusted fixture-set provider; fresh-draft requalification with preserved history | Disposable reviewed publication journey; default host fixtures remain reviewer-submitted              |
| D4          | Retry classification and stable rollback operation identity; exact-current-head retry; additive migrations; optional compilation-source detection                                          | Publication tests and isolated PostgreSQL rehearsal; no live database migration applied               |
| D5          | Initial interface specification in semantic spec §4.7                                                                                                                                      | Specification only; no claim that deployment readiness or policy-table consumption is installed       |

Executed results: AI **333 tests**, authoring **267 tests**, publication **408 tests** passed.
Package typechecks, platform-host and Studio shell typechecks passed. The disposable Studio
journey passed with controlled fixture IDs, obsolete-evaluator rejection, immutable receipt checks,
fresh-draft requalification, signing, activation, production discovery readback, delivery replay,
rollback and source invalidation. PostgreSQL rollback retry and migration-layout checks passed.

Verification commands:

- `pnpm --filter @athyper/server-platform-ai test`
- `pnpm --filter @athyper/server-plane-studio-meta-entity-authoring test`
- `pnpm --filter @athyper/server-service-publication test`
- Corresponding package typechecks; platform-host and Studio shell typechecks.
- `node --test server/db/scripts/tests/integration/publication-rollback-retry.test.mjs`
- `pnpm exec tsx server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-inbox.mts --plane=studio`
- `pnpm --dir server/db db:verify:migration-layout`

Deployment prerequisites added in this increment are the forward migrations
`20261001_publication_rollback_retry.sql` (three planes) and
`20261001_atlas_learning_requalification.sql` (Studio). Never rewrite applied migration receipts.
Requalification preserves the earlier evaluation and descriptor binding, creates a new draft,
and requires fresh submission/approval. It does not make a previously approved draft publishable
under an obsolete evaluator.

At the initial checkpoint (superseded by the follow-up below), no production controlled-fixture source was composed, no
durable failed-attempt history was claimed, no live Country journey was repeated, and no end-to-end
model-answer fidelity is established by intent tests. The database fixture uses controlled test
identities; it proves provenance enforcement mechanics, not independent human benchmark authorship.
The rollback rehearsal stubs authorization projection owners and proves function-level retry
behavior rather than full owner authorization. These results do not close the whole D4/D5 program.

### 12.1 Controlled fixtures, durable attempts and live qualification follow-up

The production Studio composition now resolves controlled fixtures from an immutable, independently
approved Entity release. Sources must have saved draft history owned by the recorded author;
mixed-author saved revisions fail closed until a contributor-aware contract is introduced.
The declaration and `<release UUID>/<test key>` reference are specified in
`meta-entity-semantic-foundation.md` §4.7. Declaration validation does not certify model performance;
the questions are excluded from runtime descriptors. Request callers cannot supply author or
approver identities. The disposable PostgreSQL journey uses the actual provider and independently
owned published source rather than a synthetic provider callback, and checks tenant/plane/key denial.

Failed attempts now survive draft rollback in append-only, tenant-scoped attempt/start and terminal
result tables. Successful evidence commits with the draft; interrupted work remains `started`.
Existing inbox responses and review controls expose the latest 20 attempts and total count, without
raw questions or exception text. Re-evaluation creates a fresh reviewed draft and preserves failures.
The existing Studio relay explicitly allows the inbox and six declared actions, with tenant, CSRF,
and idempotency controls. Shared authoring governance maps internal workflow verbs to canonical IAM
permissions. Pre-draft review checks the actual inbox proposer; subsequent approval/publication
checks the ordinary change-set/release coordinates. No alternate provider, approval route or grant
bypass was introduced.

Only these two targeted migrations were applied to DEV Studio through the normal checksum ledger:
`20261001_atlas_learning_requalification.sql` and `20261001_atlas_learning_attempts.sql`.
The rollback-retry migration from §12 remains a separate deployment prerequisite for other targets.
The full disposable Studio journey passed again after these changes: failed attempt, controlled
success, requalification, independent approval, signing, activation, discovery readback, replay and
rollback. The isolated canonical/upgrade SQL rehearsal verifies immutable terminal evidence,
tenant RLS, rollback survival, interruption, and distinct retry identities.

Live qualification exposed shared runtime issues, which were corrected in the existing path:

- Explicit current-record section questions now select already-admitted section tools, avoiding
  unnecessary generic discovery within the unchanged local context budget.
- History disclosure reuses exact owner/dependency reads within one request, validates every full
  ancestry chain, and processes messages sequentially to avoid owner timeout contention. Nothing
  is cached across requests; revocation, content integrity and missing ancestry still deny disclosure.
- Studio learning review now reaches the existing server through the shared BFF and authoring policy
  mapping, preserving permission, MFA, tenant and reviewer-separation enforcement.

The production fixture provider is implemented and composed; no claim is made that a human-authored,
independently reviewed benchmark has been installed in DEV. Disposable fixture custodians prove
provenance enforcement mechanics. Broader unseen-language/generalization and free-form business
answer accuracy remain separate qualifications; typed owner-grounded answers and a bounded model
refusal are narrower evidence.

**Final executed results (2026-10-01, DEV):** AI **340** tests, authoring **298** tests,
authoring-governance **26** tests, BFF composition/security **49** tests and Studio review interaction
**2** tests passed. AI, authoring, platform-host, Studio shell and BFF typechecks passed. The final
single-author provider also passed the complete disposable PostgreSQL release journey. Migration
layout and canonical/upgrade attempt-ledger rehearsals passed.

Live Country release **13**, descriptor
`130dc526eb7c57c083f626ebd1597d28f67a17e3e8ceb94b2d46dbc82be7904e`, passed the standard
list/detail routes, search, filter, sorting, cursor pagination and anonymous denial. A single
conversation then passed all five capabilities in sequence: record summary, field explanation,
comments, snapshots and snapshot comparison. Each observed the expected admitted tool, a scoped
citation, and exact authorized durable answer readback. The record's scalar values and comparison's
change/unknown counts matched their existing owners. Missing snapshot IDs produced a durable
failed comparison with no invented answer or citations. Older incompatible snapshots separately
returned `ACTIVITY_SNAPSHOT_CONTRACT_MISMATCH`; two compatible snapshots were captured through the
existing owner without changing Country values.

The final model-path run `89c51985-50a0-45ce-b37a-36f562e33fcd` passed using `qwen3:8b`, digest
`sha256:500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`, checked against the
actual inference registry. It made two provider calls, produced bounded no-owner-evidence refusal,
and passed durable readback and idempotent replay with no additional provider calls. This qualifies
the model path and enforced answer boundary, not raw model prose accuracy for arbitrary business
questions. Studio inbox GET returned **200** through the actual BFF and authoring policy.

Earlier failures are retained rather than recast as passes: context-budget exhaustion, replay
latency/omission, missing Studio relay/permission mapping, a harness expectation for an SSE failure
event that was instead durably recorded, and unrelated source reload interruptions. One reload left
inference admission deliberately quarantined. Documented recovery proved all nine local application
clients stopped, restarted inference, atomically cleared only unchanged abandoned ownership/waiters,
preserved the epoch and restored every client. The final model and **complete Country sequence plus
negative case were rerun successfully after recovery**. No permissions or business values were changed.

Private evidence is retained at
`~/.athyper/instances/dev/artifacts/atlas-foundation-live/2026-10-01-resumed/`:
`country-standard-recovered.json`, `country-recovered/browser.json`, `model-recovered/report.json`, `studio-recovered.json`,
`studio-migrations.json`, and the deployment/recovery and source manifests. The before/after Atlas,
host, Records and Country source manifests for the final run are byte-identical, SHA-256
`f53cd4b62d9dba98f4b6edf37761ea761ab429f1e2f240575dc056cffe10b3f9`.
The broader completed source manifest is `source-manifest-completed.json`, SHA-256
`65021f5b2858827e67a02f3fe45d1bdcd4ce619a9fd5cde986178ffdbdcab01d`. This is a dirty,
source-mounted DEV qualification, not a production deployment or a claim about unrelated changes.

The qualified comments fixture was empty and the compatible snapshot comparison had no business
value changes. Latency remains material: the five final scenarios took approximately **2.8, 29.5,
42.4, 57.2 and 76.5 seconds**, respectively. No low-latency service level, multilingual coverage,
nonempty-comment generalization or arbitrary free-form model fidelity is inferred from these results.

<a id="13-next-increment-started--independent-benchmark-and-principal-family-scope"></a>
<a id="a13"></a>

## A13. Historical — 13. Next increment started — independent benchmark and Principal-family scope

**Decision reconciliation (2026-10-01):** the newer owner acceptance and sequencing in
[Reference baseline](../runbooks/entity-reference-baseline.md#stage-acceptance--2026-10-01)
places Principal family after the accepted reference entities. Use that recorded sequence as the
working O5 target, subject to owner correction; do not reopen Currency as a new onboarding project.
[Stage 2](../runbooks/entity-principal-family-stage2.md) owns the detailed Entity work. Its evolving
implementation checkpoints supersede earlier gap descriptions within that document. This increment
adds Atlas acceptance criteria without declaring that family's existing work newly implemented.

### D3 benchmark preparation and custody

The offline preparation command is implemented and tested:

```sh
pnpm exec tsx tooling/scripts/verification/prepare-atlas-controlled-benchmark.ts \
  source-graph.json independently-authored-declaration.json principal-summary-v1 new-private-output
```

Inputs are an exported Entity authoring graph and the declaration shape in semantic spec §4.7.
This stricter preparation boundary requires explicit fixture purposes, exact capability IDs and
correction/preservation/safety coverage. It rejects an existing key and failing authoring tests.
It adds only an authoring contract test, verifies that the runtime descriptor hash is unchanged,
and creates a new private directory containing `graph.json` and `preparation.json`. Existing output
is not overwritten. Its receipt binds source/prepared contract hashes, descriptor hash and fixture
hash/count; it explicitly says `prepared-only` and `independence: not-attested`.

The tool does not contact DEV, publish, approve, create principals, or certify independence.
A real designated author must supply the held-out questions and save the graph through existing
Entity authoring under their own identity. A distinct approver reviews and publishes it. Both
custodians were originally required to differ from the correction proposer and evaluation reviewer;
that four-principal rule is superseded by the project owner's 2026-10-02 paired assignment below.
The provider additionally requires single-author saved history. No account or human approval may
be fabricated to close D3.
**Custodians assigned by the project owner (2026-10-01):** `catl.admin` is the benchmark
author; `catl.owner` is the independent approver. Both are active, distinct Studio principals in
the Cirrus tenant, verified by read-only DEV inspection. The correction proposer and evaluation
reviewer were originally required to be two other eligible principals. The project owner's
2026-10-02 instruction now assigns candidate proposal to catl.admin and evaluation review to
catl.owner, retaining separation between the two principals.

Access check: the existing `catl.admin` Studio session matched its principal and tenant, had elevated
assurance, and read the learning inbox with HTTP 200. The saved `catl.owner` Studio session did not
authenticate; its active database identity is not a substitute for login/MFA or action authorization.
No credentials, grants or sessions were changed. The owner must use an authenticated Studio session
for actual review/approval; successful inbox read alone does not prove publication permissions.

No published `learning_fixture_set` declaration with this author/approver pair was found in the
Cirrus Studio release catalog at this checkpoint. Independent questions and their actual review
remain pending. Account assignment is recorded custody intent, not evidence that those people
have authored or approved a benchmark. Preparation tooling and the existing authoring workflow
remain the path for those inputs.

Benchmark acceptance has two separate evidence sets:

| Evidence                    | Required coverage                                                                                                                            | Acceptance                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Semantic scoring fixtures   | Unseen correction wording, already-correct preservation, mutation/delegation safety; admitted-competitor ambiguity when applicable           | Versioned evaluator receipt, exact expected capability set, no safety failure compensated by improvement                                        |
| Runtime qualification cases | Self/admin/denied actor, changed tenant/parent, unavailable capability, stale descriptor, protected fields, revocation/replay, owner failure | Current authorized owner facts only; bounded answers or explicit failure; no unauthorized values/citations; source/model/configuration bindings |

The existing `LearningFixture` schema expresses semantic questions, purposes and capability IDs.
It does not express a persona, tenant, model seed or owner execution fixture. Do not cram runtime
coverage into that schema or claim semantic scoring establishes disclosure/model fidelity. Keep
runtime receipts separate and bind them to the same approved candidate/release for acceptance.
Nondeterministic runs must retain every attempt and use predeclared repetitions and acceptance
rules; successful retries must not erase earlier failures. Those rules need to be agreed with the
benchmark custodians before the first acceptance run.

### O5 support matrix and D5 implementation boundaries

This is a source/architecture inventory, not a fresh live publication receipt. Before any enabling
amendment, capture current active Entity releases and effective descriptors for every target plane.
Country remains the proven reference: source `definition.ai` -> graph-builder projection -> Entity
compiler/native publication -> registered Atlas tools -> authorized Records/section owners -> standard
list/detail context and scoped citations. Principal-family source declarations currently do not
contain an `ai` block; existing Entity publication does not automatically enroll them in Atlas.

| Target concern                                | Existing shared integration                                                                  | Next required interface/qualification                                                                            | Status                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Principal read-only summary/field explanation | Principal product; published owner admission; Records; generic Entity read and section tools | Exact registered capability/version/manifest identity; published AI declaration and admitted-field qualification | Reuse path; Atlas amendment/qualification pending                                 |
| Profile and preferences under Principal       | Record-scoped relationships, owner adapter, shared dependent list/forms                      | Explicit server-derived parent scope, filter intersection, scope proof for counts/lookup/replay                  | Reuse existing owners; Atlas scope-substitution coverage pending                  |
| Profile PII                                   | Field classification and existing model/data-class admission                                 | Declare eligible capabilities/data classes; fail closed when provider/owner support is absent                    | No reclassification or default enrollment authorized                              |
| Workforce-linked profile data                 | Stage 2 source-authority work and registered Records owner ports                             | Readiness must distinguish registered, qualified and currently available owner support                           | Reuse Stage 2 implementation; source presence is not a serving-deployment receipt |
| Historical answers                            | Shared Activity/snapshot owners and release compatibility                                    | Required/optional capability availability per plane, current disclosure and mismatch handling                    | Qualify per plane; do not inherit Country history support                         |
| Fixture publication                           | Existing Entity contract tests, immutable releases and learning provider                     | Exact fixture release/key + custody + evaluator/attempt receipts                                                 | Provider complete; independent benchmark content/acceptance open                  |

Implement D5 in this order: (1) exact trusted registry resolution and manifest identity;
(2) Principal-parent scope contract using existing Records owners; (3) deployment/configuration-bound
support evidence and required/optional availability; (4) semantic-authority round-trip checks.
No parallel registry executor, arbitrary metadata-selected handler, bespoke Principal Atlas page,
or new permission bypass is justified. Existing registration IDs and historical consumers must remain
compatible. This matrix scopes the work; it does not claim these D5 interfaces are all implemented.

**First D5 interface implemented:** `AtlasToolRegistry.resolveManifest(toolCode, version, plane)`
resolves only an exact trusted registration for an allowed plane. It returns a frozen manifest,
canonical manifest SHA-256 and separate input/result schema hashes. The registry owns a deep-frozen
JSON copy of each manifest, so later mutation by a registration caller cannot alter its identity.
Existing handlers, IDs and version lookup remain in the same registry; duplicates still fail.
This identity describes manifest content, not executable code, owner conformance, current deployment
readiness or principal authorization. Compiler pinning, readiness consumers and scope evidence remain
subsequent increments; adding this interface alone does not close those gates.

### D7 and D9 boundaries

The offline benchmark preparation tool requires **no database upgrade**. Existing fixture publication
and attempt history reuse the two already-qualified Studio upgrades. For each subsequent schema
change, record its affected planes, supported baseline, canonical/forward parity, upgrade rehearsal,
checksum receipt and rollback/recovery behavior before publication depends on it. Do not replay
foundation DDL against populated databases. Reuse Stage 2's migration evidence where applicable;
do not invent a new migration solely for this plan.

D9 remains deferred until the relevant D3 acceptance and D5 contracts pass. Preference fields pointing
to Language/Locale are not evidence of multilingual Atlas semantics. Locale collisions, fallback,
isolation, executable targets and authorized cache invalidation require their own qualification.

**Increment verification:** all **343 AI tests** pass, including exact-version/plane rejection,
duplicate registration, canonical hash stability, schema change detection and protection against
caller mutation. **Three benchmark-preparation tests** pass, including an actual CLI invocation,
private artifact permissions and refusal to overwrite an existing packet. AI and platform-host
typechecks pass. No Entity publication, database upgrade or new live Atlas qualification was performed
for this increment; §12.1 live receipts remain bound to their recorded earlier source snapshot.
D3 custodians are assigned as recorded above; acceptance remains pending their authored/approved content and the approver’s authenticated review.

<a id="14-d5-compiler-manifest-pinning-and-d7-inventory-increment--2026-10-02"></a>
<a id="a14"></a>

## A14. Historical — 14. D5 compiler-manifest pinning and D7 inventory increment — 2026-10-02

**Connection:** this change is necessary for the Entity publication/runtime guarantee that an
approved capability resolves to the same trusted manifest version and schemas at compilation,
signing, dispatch, discovery and owner invocation. It also restores inventory/checksum coverage for
existing Principal-family publication prerequisites. This is working-tree implementation evidence;
no new Entity release, activation or live Atlas qualification is claimed.

### Implemented

- The standard host publication composition installs a closed Entity tool manifest resolver through
  `CompiledEntityRegistry.resolveAiToolManifest`. The resolver and actual serving tool factories share
  their manifest builders; it does not invent owners or claim that a serving deployment is ready.
- The shared artifact compiler adds `aiManifestBindings` before hashing the runtime member. Each
  declared insight provider is bound to an exact id/version/plane, manifest hash and input/result
  schema hashes. Authoring-supplied pins are rejected. The existing AI declaration, actions,
  presentation profiles and authorization remain separate; this increment pins executable insight
  providers, not every possible owner/dependency or presentation contract.
- Runtime parsing validates complete declared-provider coverage, exact coordinates and immutable
  binding content. Signing/dispatch qualification rejects unavailable resolution or changed
  identities. The standard host also rebuilds the projection from the approved source as before.
- Serving discovery compares release requirements with the actual registered manifests. Record,
  section and lookup handlers recheck compatibility before owner reads, including repeated execution.
  Existing authorization and record/tenant checks continue to run. Historical descriptors without
  bindings retain their existing behavior; legacy compiler composition without the optional port
  retains its existing wire shape. The standard host installs the port for new compilation.
- The publication compiler source fingerprint now includes the AI package, covering the trusted
  manifest builders. An earlier successor compiler pin cannot authorize this changed source build.
- Three existing upgrades were classified in the checksum inventory without changing their SQL:
  `20261001_entity_uuid_key_reference.sql` (Studio),
  `20261001_principal_person_source_authority.sql` (Neon), and
  `20261002_projected_profile_source_authority.sql` (Studio/Mesh). The UUID upgrade was added after
  its existing key-reference prerequisite in the Studio manifest. Previously installed migration
  receipts were not rewritten.

### Executed verification

- AI: **346 passed**; publication: **414 passed**; metadata contracts: **83 passed**.
- Metadata runtime: **95 passed, 2 skipped**. Skips are not passing qualification evidence.
- Host publication integration/boundary checks: **24 passed**. The real Country authoring → native
  lowering → artifact compiler → runtime descriptor path preserves AI metadata and binds manifests
  on Studio, Neon and Mesh. Existing Principal source traverses that same compiler without automatic
  Atlas enrollment. These are source integration tests, not live publication receipts.
- AI, publication, metadata, metadata/publication contracts and host typechecks passed.
- Migration layout passed: **104 classified files, 96 retained SQL files**.
- The isolated PostgreSQL canonical/forward-upgrade rollback rehearsal passed on all three plane
  database names, including concurrent exact retries and tenant/evidence substitution rejection.
  Authorization projection owners remain stubs in that function-level rehearsal; it does not close
  full rollback authorization or deployment qualification.

### Remaining acceptance work

The owner confirmed that independent benchmark content is not available yet. D3 remains pending
actual held-out authorship by `catl.admin`, authenticated approval/publication by `catl.owner`, and
separate semantic/runtime receipts with predeclared attempt rules.

The next D5 increment is the Principal-parent scope contract using existing Records relationship
owners, followed by deployment/configuration-bound readiness and semantic-authority round-trip
qualification. A manifest identity is not a deployment-support receipt. Full owner/dependency
conformance, required/optional capability declarations and policy-table consumption remain open.
Principal-family AI amendments, PII admission and live qualification remain pending those gates.
No Principal or Profile AI declaration was enabled by this increment.

D4/D7 still require the relevant supported-baseline upgrade rehearsals, full authorization/recovery
qualification and target deployment receipts. Registering the three existing SQL files proves layout
and checksum ownership, not their complete upgrade compatibility. The existing live Country receipts
in §12.1 remain bound to their earlier source and deployment.

Source evidence is captured privately at
`~/.athyper/instances/dev/artifacts/foundation-manifest-pinning/2026-10-02T02-05-51/`
(`source.tar.gz`, per-file `source-manifest.json`, and `verification.json`). The compiler build identity
is `db06508d28b7fe0e15dc9504e51578dc385d1fa1793d618cefb87449eaf7d3a3`. This pins the
implementation snapshot, not a currently serving deployment.

<a id="15-principal-parent-scope-implementation--2026-10-02"></a>
<a id="a15"></a>

## A15. Historical — 15. Principal-parent scope implementation — 2026-10-02

The next D5 increment carries a published parent relationship through the existing shared Entity
list/detail context, Atlas discovery and reads, Records queries and background exports. The browser
supplies only `parentEntityCode`, `parentRecordId` and `relationshipKey`. Server resolution pins the
current parent descriptor hash and derives constraints from its published relationship. It verifies
the parent through the existing Records authorization path, including tenant/plane/identity checks.
The child read intersects those constraints with its own authorization, filters, search and record
selection. Model-facing tool arguments cannot replace the locked scope. Replay revalidates current
parent publication and authorization; stale bindings and cross-entity substitutions fail closed.

An embedded Manage context may narrow its matching open parent record; unrelated lists cannot
replace that record context. Opening a child record takes precedence, and leaving the embedded list
restores the parent. The standard shared list UI and its scoped API request were exercised in a
controlled browser test. The in-memory Records adapter now applies the same parent and owner
predicates as the SQL adapter. Parent authorization precedes the child transaction; this increment
does not establish an atomic parent/child snapshot across those operations.

### Authoring and publication status

Explicit AI declarations were added to the Principal and Principal Notification Preference table
products, using the existing read-only Entity tools. Table-product authoring projects the single
`definition.ai` authority into the active detail surface and rejects competing graph authorities.
Successor amendments preserve the remaining compiled contract. Principal Profile remains outside
this enrollment. Compiler source identity now includes the affected AI and Records contracts.

Two real unpublished successor drafts and three-plane policy candidates were prepared through the
existing maintenance and policy preparation commands:

- Principal: `93ab181d-c000-44bf-b083-fa4073e7b726`.
- Principal Notification Preference: `45b3ef39-bc40-42f0-87de-a22f1aa090dc`.

Both current candidates bind compiler build
`4048b6c6e73633b73157cb238e6efce007153dcd2322031703f54ad748e4a7ad`.
The earlier candidate and failed proposal receipt remain in the packet. A live preflight found the
Control API process still running older source; the separate Control API, runtime API and worker
were restarted. The parent publication pin was also admitted into the shared list HTTP schema,
with an executed route-contract regression test.
The packet is private at
`~/.athyper/instances/dev/artifacts/foundation-parent-scope/2026-10-02-UGpfQ2/`.
It is preparation evidence, not approval, publication, activation or serving qualification.
At preparation, serving Principal remained release 3 and Notification Preference release 2.
The refreshed operator sessions were verified through the live Control API. `platform.admin`
proposed both exact candidates and the separate `platform.owner` activated their policies:

- Principal policy `8a9ba27b-5a60-4d51-ba73-1de9ebe47ea2`; publication release 4
  `f1442628-f9c2-404f-bba3-89b52a385066`.
- Notification Preference policy `704c1443-ff89-4cd7-b2b1-3a5338be2abf`; publication release 3
  `8dcb7f99-54d4-41a2-844a-8ed49be2567f`.

Execution used the existing independent workload credentials through the publication API. Active
heads and applied-release receipts were read back on Studio, Neon and Mesh for both releases.
Per-plane artifact hashes are in each `activated-baseline.json`; dispatch alone was not accepted as
activation evidence. Earlier conflicts and failed attempts remain in the private packet.

Live qualification exposed a shared Atlas gateway defect: exact record reads used an `id` filter,
but Principal does not publish that field as filterable. The gateway now lowers exact ID equality
to standard Records `recordIds` selection while retaining other filters and parent scope; conflicting
selectors fail. No entity filter capability or authorization was widened. This runtime fix postdates
the publication compiler pin. The current runtime source fingerprint is
`d25c7da0576377f3ac80692542c87cd2fd0f56a387deb525e8b4a15a14b2660b`;
publication policies and signed artifacts retain their original pins.

On activated Principal release 4, Neon `catl.admin` completed a real Atlas record summary using
`entity_read_record`, a record-scoped citation, checked saved code/name values and matching durable
answer readback. Run: `519e4967-f3af-4ff1-86b7-adfaa1a73453`. The earlier failed summary run was
retained. `catl.finance` remained authenticated but Atlas admission returned `permission_denied`;
this is denial coverage, not positive finance Atlas qualification.

Activated Records reads admitted finance's own notification parent, denied finance access to the
admin parent, and rejected a stale parent hash with `ENTITY_PARENT_ACCESS_DENIED`. Scoped child
lists were empty, so nonempty child isolation remains a separate live acceptance boundary. A field
explanation run failed with `inference_admission_abandoned` in the shared embedding admission owner.
The actual embedded Notifications view submitted Manage context for
`principal_notification_preference` with the expected locked Principal parent selector. Scoped
`entity_discover` completed and its durable invocation was read back in run
`02bbfce9-9dfa-4785-88a8-d8e573400a7c`; the subsequent model phase failed with
`inference_admission_abandoned`. This establishes live parent-context/discovery integration, not
completed lookup/answer acceptance. Earlier browser selector failures are retained as attempts.
The abandoned inference owner was not cleared or automatically replaced.

### Executed verification and acceptance boundaries

- AI: **350 passed**; Records: **479 passed, 4 skipped**; authoring: **304 passed**;
  publication: **414 passed**; full host: **894 passed, 26 skipped**.
- Browser-safe AI contracts: **20 passed**; client context: **10 passed**; shared embedded-list
  browser flow: **1 passed**. Skips do not establish acceptance.
- AI, Records, AI/Records contracts, authoring, host, list/detail and Atlas UI typechecks passed.
- Migration layout currently fails on the independently present unregistered/unclassified
  `20261002_principal_person_link_target.sql`. This increment adds no SQL migration and does not
  claim to resolve that upgrade's ownership or compatibility.

The parent-scope tests cover row/count/group/search/export intersection, publication and cursor
substitution, missing resolver, revoked parent access and tool evidence replay. Owner authorization
fixtures and controlled browser responses remain separate from live IAM/database/model acceptance.
Publication and three-plane activation receipts are complete for the two successors. The live
record-summary receipt above is separate from the pending parent-scoped Atlas/model acceptance.
D5 deployment-bound readiness, required/optional availability, policy-table consumption and semantic
authority round trips remain open, as do D3 independent benchmark acceptance and D4/D7 qualification.

<a id="16-pending-foundation-build--2026-10-02"></a>
<a id="a16"></a>

## A16. Historical — 16. Pending foundation build — 2026-10-02

This increment begins the remaining D4/D5/D7/D8 work. Existing unrelated working-tree changes
are preserved. It does not publish, activate, restart, or alter the serving deployment.

### Migration integration and qualification

The existing `20261002_principal_person_link_target.sql` is now registered as a Neon forward upgrade
with its unchanged installed SHA-256
`987b280731392a01b17b7c0abc1d9e389329e2aa6aa8ed04e508984a2e5e8a26`.
Migration layout passes with **105 classified files and 97 retained SQL files**. This supersedes
the current-layout failure recorded in §15; it does not alter that historical observation.

Fresh-install manifests now include Neon Principal source and bounded target authority, and
Studio/Mesh projected Profile source authority after their existing prerequisites. New qualification
entrypoints use private disposable PostgreSQL clusters and refuse deployed database targets:

- `pnpm qualify:principal-link-target-upgrade`: **17 checks passed** on a populated bounded
  dependency fixture through the actual forward runner. Checks cover unchanged populated rows,
  exact retry/receipt preservation, gate substitution rejection, generic Principal RLS isolation,
  wrong-plane rejection and checksum-drift refusal. This is not full domain authorization.
- `pnpm qualify:principal-source-foundation`: fresh canonical installation passed on **all three
  planes**, including foundation receipts and expected source/target function installation.
- `pnpm qualify:principal-source-foundation --upgrade`: the full canonical schema with only the
  source/target additions excluded was installed on **all three planes**, then the exact source
  upgrades were applied through the existing forward runner. Installation, preserved row contents
  and exact retry receipts passed. The baseline is identified by captured manifests/DDL; this
  does not qualify every archived supported baseline or populated domain journey.

The existing D4 service checks were re-executed: **38 passed** across rollback, recovery,
orchestration and activation-hold tests. The existing canonical/forward rollback retry PostgreSQL
rehearsal passed on Studio, Neon and Mesh. Its projection authorization owners remain stubs;
full authorization, partial-plane recovery and target deployment receipts remain open.

### D5 shared readiness contract implementation

`server/packages/contracts/metadata/src/entity-readiness.ts` now exports a shared evaluator and
trusted support-lookup contract. Requirements explicitly distinguish required and optional references.
Support receipts bind deployment, configuration revision, plane, release artifact hash, support
revision, adapter versions, exact manifest/input/result hashes, qualification results and validity
period. The current support pointer references a receipt content hash. The evaluator reports distinct
missing, invalid, changed, expired, failed-qualification and lookup-failure reasons; it returns no
authorization grant. Lookup failures exclude optional capabilities without blocking unrelated reads;
unavailable required capabilities make the relevant requirement set unready.

The metadata contract suite passed **103 tests**, including **20 new readiness cases**, and its
production/test typechecks passed. Workforce owner tests passed **28 tests**. This is contract
implementation and source verification, **not installed deployment readiness**. Durable immutable
receipt storage, trusted deployment lookup, publication of required/optional declarations and host
wiring at startup/activation/configuration/admission remain the next D5 increment. Owner/dependency
conformance, policy-table consumption and semantic-authority round trips remain open.

### D8 executed check triage

`policy:i18n` passes. The first CI static profile executed **50 checks: 29 passed, 21 failed**.
After the UI-control and CI-toolchain repairs, a second full profile executed **31 passed, 19 failed**.
These are diagnostic results, not a passing release qualification. The original failure set below
has an explicit disposition; none is waived, retired or converted into a passing gate. Responsibility
areas identify where each fix belongs, not a claim that a human owner has accepted an assignment.

| Failing check                                    | Disposition and responsibility area                                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy:temporal-discipline`                     | Fix: 94 findings; replace unsupported parsing in affected shared Entity contracts/runtime using the established temporal contract. Independently triage remaining package findings.                            |
| `policy:ui-system`                               | Fixed and rechecked: learning-inbox selection uses the existing `SegmentedControl`, declared as a workspace dependency. No ratchet increase.                                                                   |
| `policy:server-boundaries`                       | Fix: qualification/provisioning code reaches domain services from DB scripts; move domain qualification to the owning service/host composition and use public contracts. Preserve existing command behavior.   |
| `policy:server-rebuild-boundaries`               | Scope review: distinguish legitimate host composition imports from forbidden business dependencies using the existing architecture; do not blanket-allow kernel imports.                                       |
| `inventory:server-rebuild:check`                 | Fix: regenerate and review inventory after relevant composition changes settle.                                                                                                                                |
| `inventory:authorization:check`                  | Fix: resolve unknown authorization sources and writers before regenerating/reviewing the inventory. Generation alone cannot certify them.                                                                      |
| `inventory:authorization-data-disposition:check` | Fix: reconcile ownership/disposition drift with the reviewed authorization inventory.                                                                                                                          |
| `routes:server-manifest:check`                   | Fix: regenerate and review the manifest against actual shared Entity routes.                                                                                                                                   |
| `policy:docker-toolchain`                        | Fixed and rechecked: BP artifact schema CI now selects the repository-pinned Node 24.19.0.                                                                                                                     |
| `policy:frontend-spine`                          | Scope review: verify actual dependency ownership/cycles and justify current budgets; do not merely raise budgets to clear failures.                                                                            |
| `policy:foundation-phase1`                       | Fix/scope review: generic choice UI must not import Entity-specific messages; separately review CSS/token budget applicability.                                                                                |
| `policy:api-client-phase2`                       | Scope review: validate localization, Entity-contract and temporal dependencies against the established API-client boundary.                                                                                    |
| `policy:deployment-profiles`                     | Fix: reconcile removed BP workspace references and missing ownership metadata without creating placeholder applications.                                                                                       |
| `policy:bff-relay-phase4`                        | Scope review: validate the current shared relay/auth implementation and migrate stale source-shape assertions only with equivalent behavioral coverage.                                                        |
| `format:changed:check`                           | Fix: format owned changes before release assembly; preserve unrelated working-tree work.                                                                                                                       |
| `lint:eslint`                                    | Fix: 255 warnings exceed the current 231 budget; repair owned warnings and triage remaining debt without increasing the warning limit.                                                                         |
| `openapi:check`                                  | Fix: remove stale route exceptions and register real contracts for uncovered framework routes; do not expand the exception baseline.                                                                           |
| `urls:check`                                     | Fix: regenerate/review the URL catalogue after route contracts settle.                                                                                                                                         |
| `ddl:coverage:check`                             | Partial fix: missing Principal-source manifest integration is repaired. Generated inventory drift and deleted finance composition references still require ownership review; the overall gate remains failing. |
| `policy:design-system`                           | Fix: replace unsupported glyphs in the existing Entity activity prototypes; do not introduce a separate application.                                                                                           |
| `policy:style-tokens:strict`                     | Fix: resolve strict-mode color/style findings in owning shared UI packages.                                                                                                                                    |

The static-profile logs are retained under the private DEV `artifacts/static-policy/` directory.
Successful migration/foundation rehearsals do not establish passing scanner, dependency, availability
or release gates. A final reproducible release run remains required.

### D3 independent benchmark custody

The owner reconfirmed `catl.admin` as benchmark author and `catl.owner` as independent approver.
The controlled benchmark preparation suite passed **3 tests**, including unchanged runtime meaning,
explicit correction/preservation/safety coverage, rejection of caller-claimed authorship and refusal
to overwrite preparation packets. No independent questions were authored or substituted by this
implementation increment. The owner subsequently confirmed that the questions are **not authored
yet**. Independent authorship and agreed attempt rules remain pending;
authenticated independent publication and semantic/runtime acceptance receipts are still pending.

The owner indicated that benchmark content belongs in the repository. Repository searches found
the preparation tool, implementation fixtures and historical GPU-performance results, but no
independently authored `atlas-learning-fixtures/1` declaration or agreed attempt-rule record.
The owner clarified that the content is not authored yet; there is no declaration to ingest.
Historical GPU benchmarks and implementation-authored test
questions do not establish D3 custody or semantic acceptance.

### Evidence packet and remaining work

The implementation snapshot before this evidence-index update is captured privately at
`~/.athyper/instances/dev/artifacts/foundation-pending-build/20261002-4c9a2eed22ca4e729e7df3415934a499/`.
Its `source.tar.gz` contains **7,683 source entries**, identified by per-file hashes in
`source-manifest.json`; archive SHA-256 is
`069cd3187148b9a628ff996eb78348b004c379bf063412773ceb82923b312d21`.
The packet's `verification.json` indexes executed suites, the second static-policy run and
source-matching qualification receipts. The full Country/Principal compiler and host integration
selection passed **19 tests**; this is source integration, not live serving acceptance.

Current source-matching receipts are retained separately:

- Populated bounded upgrade: `artifacts/principal-link-target-upgrade/2026-10-02T00-31-32.647Z-1790149/`.
- Fresh three-plane foundation: `artifacts/principal-source-foundation/2026-10-02T00-31-32.778Z-1790181/`.
- Canonical pre-source forward upgrade: `artifacts/principal-source-foundation/2026-10-02T00-27-15.620Z-1744447/`.
- Full static-policy rerun: `artifacts/static-policy/2026-10-02T00-27-41.712Z-1753874/ci/`.

These paths are beneath the private DEV instance directory. Earlier attempts and snapshots remain
preserved. New implementation files pass targeted formatting; the readiness implementation passes
targeted ESLint. Metadata, Studio shell and the new foundation qualification tool typechecks pass.

Next work remains: resolve the 19 triaged gates without weakening them; close D4 full owner/recovery,
concurrent and partial-plane deployment acceptance; qualify the rest of the supported D7 baseline
matrix; install D5 immutable receipt storage/trusted deployment support lookup and lifecycle wiring;
and ingest the independently authored D3 questions with predeclared attempt rules. No D3 semantic
acceptance, complete D4/D7 qualification or deployed D5 readiness is claimed by this increment.

<a id="d7-upgrade-compatibility-assessment--2026-10-02"></a>
<a id="a16-d7"></a>

## A16-D7. Historical — D7 upgrade compatibility assessment — 2026-10-02

D7 now has a declared qualification matrix at
`server/db/migrations/compatibility-baselines.json` and a reproducible command,
`pnpm qualify:entity-upgrade-compatibility`. The matrix distinguishes reconstructed
current/pre-Principal-source schemas from unresolved historical and DEV/QA starting
schemas. The command captures input bytes and hashes, installs fresh disposable
foundations through the existing runner, then exercises complete active forward
manifests independently on Studio, Neon and Mesh. No serving deployment is changed.

All six foundation installations passed, but **all six forward paths failed**.
Studio's execution-binding migration tries to recreate `entity_change_case_binding`;
Neon/Mesh history migrations try to recreate `record_version`. Canonical foundation
DDL already installed those tables without corresponding forward migration receipts.
The existing runner records failed migrations and requires operator resolution.
Complete preservation and exact retry acceptance were not reached.

The [dated assessment](../reports/entity-upgrade-compatibility-assessment-20261002.md)
records the pinned source packet, per-plane receipts, fixture coverage and required
resolution tasks. Migration layout, three target-rejection tests, syntax and targeted
formatting passed. These checks do not qualify the failed upgrade paths.

Next D7 work is to reconcile canonical-install and forward-receipt ownership while
preserving immutable SQL/ledger identities, rerun the complete manifests, and
declare exact supported historical schemas and populated installation fixtures.
**D7 remains open; schema-dependent onboarding still requires its relevant upgrade
qualification.** The reconstructed matrix does not declare historical/deployed
compatibility or close the gate.

<a id="d8-deliverable-policy-receipts--2026-10-02"></a>
<a id="a16-d8"></a>

## A16-D8. Historical — D8 deliverable policy receipts — 2026-10-02

**Connection:** this change is necessary for the shared Entity publication/runtime guarantee that
each foundation deliverable has static evidence bound to the source actually checked, and generated
documentation copies cannot change an authored-source gate's outcome.

Run `pnpm policy:foundation --deliverable D8` throughout D8 work; replace `D8` with the relevant
`D1`–`D10` identifier for each other deliverable. This uses the existing complete CI profile, without
a smaller deliverable-specific selection or waived checks. The CI profile now includes `policy:i18n`.
Existing workspace, release and CI entrypoints retain their selections and aggregate diagnostics.

The shared runner captures tracked and nonignored untracked source contents as SHA-256 blobs,
with a per-file manifest covering deleted paths, symlink targets and executable flags. It compares
source fingerprints before and after all checks. `gate.json` records the deliverable, timestamps,
source identity and failing policies; a changed source fails qualification even when all individual
checks pass. Existing evidence directories cannot be overwritten; an explicit repeated run ID must
be changed. The captured packet identifies a dirty source artifact, not a clean checkout, installed
dependencies, serving deployment or runtime qualification. Consumers must inspect `gate.json` as
well as individual results; passing static checks alone does not establish publication acceptance.

Generated-directory fixtures cover dependencies, build output, coverage, Turbo and alternate Next
outputs. The design-system scanner also excludes the exact docs staging paths produced by
`stage-content.mjs`, while continuing to inspect authored public assets in other apps. The prototype
finding recorded in §16 came from an ignored generated docs copy; its disposition is corrected to
scanner scope, rather than modifying that copy or increasing the ratchet. The existing prototype
source remains unchanged. The shared Entity form section legend now uses the existing medium-weight
theme token in place of a raw font weight.

Executed source verification: **14 tests passed**, covering real subprocess failures, timeouts,
source drift, repeated evidence IDs, source capture and scanner exclusions. Targeted formatting and
ESLint passed. The original fresh static baseline reproduced **31 passed / 19 failed**. An intermediate
deliverable run retained a source-drift failure while scanner repairs were underway; it is not a
qualification receipt.

The final full-profile diagnostic run executed **51 checks: 34 passed / 17 failed**. I18n,
design-system and strict style-token gates passed without ratchet increases. All remaining failed
checks already have blocking dispositions in §16. The run also rejected source drift: concurrent
edits changed this roadmap and `docs/reports/entity-upgrade-compatibility-assessment-20261002.md`.
No stable or passing release qualification is claimed. The exact pre-run source contents and both
manifests are retained privately beneath the DEV instance at
`artifacts/static-policy/d8-20261002-source-gates-stable/ci/D8/`; its initial source fingerprint is
`2bce7082c0686a897cfaa4d6622b59b6b9a62e1f1591b757006a89ff91655566`.
The packet predates this receipt-index update. A new complete run against a stable isolated source
artifact is still required, after the blocking checks are resolved.

The other §16 failure dispositions remain blocking. D8 is not complete: remaining boundary,
inventory, route-contract, lint and format findings, clean-checkout reproducibility, tracked-output
review and honest catalogue availability still require their stated acceptance work. No publication,
activation or serving runtime claim is made by this static-policy increment.

<a id="17-d4-reproducibility-assembly--2026-10-02"></a>
<a id="a17a"></a>

## A17a. Historical — 17. D4 reproducibility assembly — 2026-10-02

`pnpm qualify:foundation-publication` now assembles publication prerequisites from a detached,
clean candidate using the existing local candidate-snapshot utility. The command captures tracked
edits, deletions and non-ignored new files without changing the developer's branch or index.
Qualification runs in that candidate, with an offline, frozen-lockfile dependency installation;
installation scripts are disabled. The candidate, source archive and per-file manifest are retained
under the private DEV `artifacts/foundation-publication/` directory. Existing attempt directories
cannot be overwritten. `ATHYPER_ARTIFACT_ROOT` and `ATHYPER_ARTIFACT_RUN_ID` select a new evidence
destination; no deployed database target or arbitrary executable is accepted.

The fixed recipe exercises assembly integrity, publication rollback/recovery/orchestration and
activation holds, host verification authorization and Entity publication integration, the existing
compiler source identity, migration registration/checksums, concurrent exact rollback retries on
three planes, the populated bounded Principal-link upgrade, and fresh/forward Principal-source
foundation installation on Studio, Neon and Mesh. Each check retains its command, result and raw
log; Vitest counts and required-file assertions distinguish executed tests from missing or skipped
coverage. Database receipts retain their baseline manifests, SQL hashes and per-plane results.
Source identity is checked again after execution. Any missing check, failed installation, failed
receipt or source drift prevents the assembled qualification from passing. Independent checks
continue after a failure so later evidence is retained.

This is reusable D4 prerequisite evidence for D2/D5 work and later D3 preparation. It does not
replace independent D3 authorship or agreed attempt rules, and does not publish or activate a
release. The summary explicitly leaves full owner authorization, concurrent publication/activation,
partial-plane recovery to a verified serving state, the remaining supported upgrade baseline matrix,
target deployment readback, authenticated Country serving journeys, deployed D5 readiness and full
release static gates unqualified. Existing function-level rollback projection owners remain stubs.
Cross-plane activation is not claimed atomic.

### Executed assembly evidence

The final recipe passed all **nine checks** from clean candidate
`499645d0c5a81aa1a6df1554eced51924b5562e4`: **5 assembly/source-capture tests, 38 publication
tests, 50 host tests and 1 three-plane rollback rehearsal**, with no failures or skips. Migration
layout passed with **105 classified files and 97 retained SQL files**. The bounded populated
upgrade and fresh/canonical-pre-source forward foundations passed; both foundation modes executed
Studio, Neon and Mesh. Offline frozen installation passed on Node **24.19.0**, pnpm **10.33.0**.
The candidate's before/after source identities match. Targeted ESLint and formatting passed for
the new assembly implementation and its tests.

The private packet is
`~/.athyper/instances/dev/artifacts/foundation-publication/2026-10-02T00-55-37.469Z-2042824/`.
Its `summary.json` indexes the exact commands, test counts, hashed logs/reports and disposable
database receipts. `source-manifest.json` identifies **7,693 files**; independent archive inspection
matched every path, content hash, entry kind and executable flag. Source tree SHA-256 is
`3ffff033dee3a81826e47d3954fba9c63361f6f9431772fcacabe929c1632b1e`;
`source.tar.gz` SHA-256 is
`58f3d94b21aa54bde6716603808db3c1314eaac97dfdc10f57f12ea841a392b7`.
The candidate compiler identity is
`724b66fc3b090f8ef4f7bf33af9c65e36a781a88b7d2e581422b75e8fd1f8093`.
These pins identify the implementation before this evidence-index update, not a serving deployment.
The earlier successful recipe attempt remains separately preserved at
`artifacts/foundation-publication/2026-10-02T00-51-50.137Z-1924545/` beneath the same private DEV
instance directory; it predates the compiler-identity check. No full D4/D7 completion or D3 acceptance
is established by either packet.

<a id="17-d1-scoring-validation-and-d2-production-context-evaluation--2026-10-02"></a>
<a id="a17b"></a>

## A17b. Historical — 17. D1 scoring validation and D2 production-context evaluation — 2026-10-02

**Connection:** trustworthy correction and regression evidence is necessary before learned vocabulary
changes published Entity capability selection. This increment extends the existing shared Atlas
learning evaluators and Country-based registered-tool discovery tests; no Entity definition changes
are required.

D1 correction, preservation and safety scoring was validated first (**8 tests passed**). Both the
narrow vocabulary evaluator and production discovery evaluator now use the same group summary.
Already-correct preservation passes without counting as correction, and successful correction and
preservation cannot compensate for a safety failure. Existing scoring revision
`atlas-learning-scoring/2.0` is retained because outcome rules are unchanged.

D2 was then exercised through the existing production discovery adapter and registered coordinator
(**28 tests passed**). Its receipt now includes the scoring revision and separate correction,
preservation and safety totals. Duplicate expected admitted capability IDs are rejected before
resolution. The expanded scenarios cover stale descriptor, substituted entity and wrong plane;
explicit baseline publication context; tenant/principal context forwarding and different current
records; and wrong-capability failure despite successful discovery. Existing scenarios cover manage
versus record context, authorization denial, unavailable registrations, admission/profile restrictions,
historical contexts, disabled tools and learned Country terms with lookup installed.

Competing actually admitted summary/comment meanings delegate because the comments capability
requires model arguments. That is an expected resolution outcome, not an execution failure or an
unsupported-capability claim. The separate direct-read clarification fixture remains resolver-only
coverage; it does not claim installation of another production owner. Tenant context forwarding
uses controlled metadata, and does not establish live cross-tenant database isolation.

Executed working-tree verification: full AI suite **359 passed across 50 files**; AI production and
test typechecks passed; Studio learning-inbox and evaluation-receipt selection **10 passed**.
These are implementation-authored source checks, not independently controlled benchmark acceptance.
No publication, activation, deployment change, live owner execution or model-answer qualification
was performed. The checkout contains unrelated changes and these results are not a reproducibly
pinned release qualification. D3 independent authorship, attempt rules and authenticated acceptance,
and the live production-owner/model-answer boundaries recorded above, remain pending.

<a id="18-d5-immutable-support-receipt-persistence--2026-10-02"></a>
<a id="a18"></a>

## A18. Historical — 18. D5 immutable support-receipt persistence — 2026-10-02

The next shared Entity Framework increment implements an immutable support-receipt storage adapter
and the read side of trusted current-support resolution. No entity-specific route, provider or UI
is introduced. The existing Country/table-product publication and shared metadata/Records paths
remain the integration reference; this increment changes only shared readiness contracts and the
platform metadata package.

`ImmutableEntitySupportReceiptStore` uses the existing host-configured `ObjectStorage` contract.
It requires atomic `putIfAbsent`, stores canonical JSON under the receipt SHA-256 and verifies bytes
on every read and replay. Different qualification revisions retain separate objects; the adapter
exposes no overwrite or deletion operation. Bucket selection and credentials remain composition
inputs. Hashes establish content identity, not who qualified a capability or permission to use it.

The shared contract now parses persisted receipts and current-support pointers, rejects unsupported
fields and malformed bindings, and freezes detached nested values. The readiness evaluator consumes
these same parsers. `createEntityDeploymentSupportLookup` reads a host-supplied current pointer for
each evaluation and resolves its exact immutable receipt. It does not enumerate old receipts or
select the latest receipt as a fallback. Its current-pointer snapshot is detached before asynchronous
storage I/O; it does not establish an atomic configuration/admission transaction.

### Executed source verification

- Metadata contracts: **114 passed**, including **11 new persistence-boundary cases** and the
  existing **20 readiness cases**.
- Platform metadata: **110 passed, 2 skipped**, including **15 new storage/lookup cases**. The
  focused storage/lookup rerun passed all **15 tests**. Skips do not establish acceptance.
- Both packages' production and test typechecks passed. Owned files passed formatting.
- The server-boundary policy check still fails on four pre-existing service imports in host
  qualification and DB provisioning/verification scripts, already within the D8 boundary triage.
  This increment introduces none of those imports and does not waive that gate.
- The readiness production implementation passed targeted ESLint. The repository ESLint
  configuration does not cover the new platform metadata implementation or these test files;
  ignored-file warnings are not lint qualification for those files.

Tests cover concurrent exact retries, immutable conflict/corruption, preserved receipt history,
invalid content and hashes, snapshots across asynchronous boundaries, changed configuration, absent
current authority, and required/optional behavior on storage failure. Storage tests use a controlled
atomic in-memory port; they do not establish live object-store durability or deployed availability.

### Remaining D5 integration

The adapter and lookup factory are exported for trusted host composition, but are **not installed
in a serving host**. Durable current-pointer authority and authenticated qualification custody,
required/optional publication declarations, and startup/activation/configuration/admission consumers
remain to be implemented. Those consumers must bind the actual serving API instance/configuration,
use the shared evaluator, and preserve current request authorization. Production storage permissions
and retention must enforce receipt immutability beyond the adapter's API. Owner/dependency
conformance, historical manifest support, policy-table consumption, semantic-authority round trips
and the pending nonempty parent-scoped live journeys remain open. This increment does not close D5
or claim publication, activation, runtime acceptance, or readiness for D6/D9/D10.

<a id="19-d7-upgrade-repair-and-d8-policy-remediation--2026-10-02"></a>
<a id="a19"></a>

## A19. Historical — 19. D7 upgrade repair and D8 policy remediation — 2026-10-02

**Connection:** this change is necessary for the shared Entity onboarding guarantee
that a populated supported database can complete its forward manifest without
rewriting installed SQL, and that foundation checks assess the actual shared
publication/runtime composition. Entity definitions, publication and serving
activation were not changed.

### D7 executed reconstruction qualification

Both declared reconstructed baselines now pass their complete forward manifests
on Studio, Neon and Mesh: **six paths passed**, including preserved Country and
Principal rows and unchanged receipts on exact retry. **72 equivalence probes
passed**, covering positive acceptance and rejection of source-receipt, schema,
RLS, grant, trigger, constraint and permission drift. Studio records 31 migrations
per path (five verified canonical equivalents), Neon 18 (two equivalents), and
Mesh 14 (two equivalents). Migration layout passes with **106 classified files
and 98 retained SQL files**.

The existing forward runner now verifies explicit migration/validator checksums,
canonical source receipts and the relevant live catalog before recording a
canonical equivalent. Validator identity is retained in the receipt. Existing
applied hashes remain unchanged, and failed/applying ownership cannot be silently
reset. A new Studio prerequisite supplies the historical publication grantee as
an inert role on fresh installations; it grants no login or membership. The
[migration README](../../server/db/migrations/README.md) explains the admitted
canonical supersets and failure behavior.

The [D7 assessment follow-up](../reports/entity-upgrade-compatibility-assessment-20261002.md)
indexes the final private packet, captured source and per-plane results. Its
source index SHA-256 is
`aff2356c76e95fa91afd5bfca1b8eb817f2de1b0f359914fa628b4da45e90082`.
Earlier six-path failures are superseded only for these reconstructed baselines.
**D7 is not closed:** historical/DEV/QA starting schemas remain unresolved;
Profile and identity-binding fixtures were empty; no serving Entity journey or
full owner-authorization acceptance is inferred from schema qualification.

### D8 implemented repairs and source checks

- Shared timestamp parsing removes all eight new temporal findings without
  increasing the ratchet. The PostgreSQL cursor parser accepts explicit offsets
  while retaining the original microsecond string for pagination.
- Qualification and publication-preparation commands use public owner exports.
  Host composition moved behind the existing CLI commands where required; the
  database package no longer imports those host implementations. The host-local
  DI/bootstrap exception is restricted to exact modules and composition callers;
  tests retain denial for business callers and cross-package kernel use.
- Relay checks follow the shared operation group and authenticated session adapter
  and execute the allowlist/security tests. API-client checks admit only the
  existing pure transport parsers at their specific boundaries. The generic
  searchable-select message contract no longer depends on Entity vocabulary.
- Deployment/spine metadata no longer requires removed bespoke BP packages.
  Package ownership, contract ownership, route/URL and DDL inventories were
  reconciled. Six existing authorization entrypoints were inspected and registered
  as discovery symbols; this does not grant permissions or certify enforcement.

Executed verification: publication **414 tests passed**; authoring **304 passed**;
relay/security **44 passed**; boundary/qualification-tool tests **18 passed**;
temporal parser **3 passed**. Publication, authoring, host, DB and shared detail
package typechecks passed; moved host qualification/preparation scripts passed
an additional focused typecheck. These are source checks, not deployment receipts.

A source check exposed an existing out-of-scope dependency in
`provision-hr-stage2-synthetic-policy.mts`: its HR domain service implementation
has been removed. That command was preserved, and its boundary failure remains
visible. Restoring an unrelated domain service or silently retiring its command
is not part of this Entity Framework repair.

The final static-profile result and remaining gate dispositions follow. D8 acceptance still requires passing
release checks, honest catalogue availability and tracked-output review; diagnostic
passes do not close those remaining gates.

### D8 final full-profile receipt and remaining blockers

The complete CI profile executed **51 checks: 44 passed / 7 failed**. Source was
stable throughout the run (`sourceStable: true`); the gate remains failed. This
improves the previous 34/51 result by ten gates without changing warning limits,
dependency/CSS budgets, route-exception baselines or design-system ratchets.

The captured dirty-source packet is retained at
`~/.athyper/instances/dev/artifacts/static-policy/2026-10-02T02-16-59.959Z-399019/ci/D8/`.
Its source fingerprint is
`881d29026362abcc694d021d27fda368c2da3c38988f08902d70d03ab90e4f19`.
Inspect `gate.json`, `source-before.json`, `source-blobs/` and the individual logs.
This packet predates this receipt-index update; it establishes a captured stable
source run, not clean-checkout release acceptance or deployed readiness.

| Remaining check                    | Required resolution; no waiver                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy:server-boundaries`         | The preserved synthetic HR provisioning command imports the removed `hr-stage2-service`. Its owning domain must decide an explicit retirement or supply a supported implementation; no replacement domain service was fabricated.                                   |
| `policy:server-rebuild-boundaries` | The same command retains six cross-package source imports. Resolve that unavailable command's ownership, then use public owner exports and host composition. All other previously reported kernel/cross-package findings were repaired.                             |
| `policy:frontend-spine`            | Review and reduce the actual API-client, app-foundation, shared shell, Mesh shell and Studio shell dependencies against their existing budgets. Removed-package references are repaired; budgets remain unchanged.                                                  |
| `policy:foundation-phase1`         | The generic control's Entity vocabulary dependency is repaired. Foundation CSS remains 142,366 bytes against 24,576, and theme-token source 18,534 against 12,288; review supported shared-component scope and reduce duplication without losing existing behavior. |
| `format:changed:check`             | The diagnostic reports 370 formatting differences across the pre-existing dirty tree. Owned changes were formatted; unrelated source was preserved. Resolve the remaining owned-workstream changes before release assembly.                                         |
| `lint:eslint`                      | 255 warnings exceed the unchanged 231 limit. Repair shared UI typing/accessibility/hook findings; the subsequent server lint stage still needs complete execution.                                                                                                  |
| `openapi:check`                    | Register real request/response contracts for 53 uncovered routes and remove six stale exceptions. Do not grow the exception baseline or publish placeholder schemas.                                                                                                |

Additional completed checks: API transport **11 tests passed**, and three preserved
CLI commands rejected invalid arguments before any database access. The final
D7 runner, SQL and equivalence-validator bytes match the passing captured D7
packet; subsequent changes to its captured JSON files were formatting-only, plus
the README evidence update. D7 historical/deployed compatibility, nonempty domain
fixtures, D8 clean-release checks and honest catalogue availability remain open.

<a id="20-d4d5-publication-recovery-and-serving-readiness-integration--2026-10-02"></a>
<a id="a20"></a>

## A20. Historical — 20. D4/D5 publication recovery and serving readiness integration — 2026-10-02

**Connection:** this increment extends the shared Entity publication, metadata and
Atlas admission paths used by Country. Country's product still declares the
standard registered list/read handlers, published reference permission and shared
list/detail experience. No entity-specific application, route or provider was
added. The existing dirty worktree was preserved.

### Implementation boundaries

The D4 disposable three-plane rehearsal now exercises the canonical SQL stage,
verify and activation functions under concurrent retries and competing signed
predecessor pins. It checks interrupted per-plane heads, rejected verification,
transaction rollback, recovery to the exact verified source/hash and unchanged
activation-event counts on replay. Its projection-owner functions remain stubs:
these checks establish SQL head convergence, not full owner authorization or an
authenticated serving journey. Cross-plane activation is not atomic.

D5 required/optional declarations are carried from authoritative `definition.ai`
through the graph projection, compiled manifest bindings and descriptor parser.
Historical omitted flags remain optional. Qualification is independent of current
request authorization. Unavailable optional tools are excluded from Atlas
discovery/execution; missing required tools reject the relevant descriptor
admission, activation or rollback.

Host composition installs the shared evaluator using the existing immutable
receipt store and artifacts storage adapter. `ENTITY_SERVING_DEPLOYMENT_ID`
identifies the serving instance. Its configuration digest, loaded manifest
identities, source-build fingerprint and exact runtime artifact hash bind current
support to that instance. Configuration is reassessed at each admission and
readiness probe. Pointer authority is read before and after immutable receipt I/O;
revocation or a changed pointer fails closed. These checks bracket reads; they do
not create an atomic transaction across storage authority, deployment changes and
database activation.

Activation and rollback use a separate trusted target-set document for the
environment, plane and runtime artifact. Every declared serving API target must
have matching current authority and a valid immutable receipt. The worker's own
support is not substituted for an API target. Rollback checks the exact historical
target inside the existing locked, tenant-scoped transaction, including retries.
The API independently reassesses its loaded configuration when serving requests.

Startup/readiness probes enumerate active Entity heads through the metadata owner
and reuse serving descriptor parsers. An unreadable or RLS-hidden Entity payload
is an incomplete inventory and makes the probe unhealthy; it is never treated as
an empty, qualified deployment. The inventory does not elevate database privileges.
Deployments with tenant-private payloads therefore need an authorized complete
inventory before their global probe can pass. Per-request tenant authorization
continues through the existing stamped Entity transaction and owner checks.

### Deployment custody and remaining acceptance

Receipt and current-pointer storage now have host consumers, but writing a passing
receipt is still a trusted qualification responsibility. The host's
`describeDescriptor` result supplies exact target and adapter bindings; it is not
a qualification result. Custody must persist the real executed qualification via
`ImmutableEntitySupportReceiptStore`, reference its hash at the key returned by
`entitySupportPointerKey`, and install every intended API pointer in an
`entity-serving-targets/1` document at `entityActivationTargetsKey`. Receipt
timestamps and expiry must describe actual qualification. Missing identity,
storage, required support or target authority fails closed; an old receipt is not
selected as a fallback.

Production bucket permissions/retention and qualification-writer authentication
must protect receipt history and mutable authority independently. The installed
build fingerprint currently uses the existing DEV source-compiler identity; it
does not attest a production binary. An installation unable to resolve that
identity remains unqualified. No deployment configuration, credentials, receipt
authority or serving release was changed by these source edits.

D4/D5 are not closed by source installation. Remaining acceptance includes full
publication/rollback owner authorization, end-to-end concurrent publication,
partial-plane recovery to authenticated serving, deployed target readback and
receipt custody, complete tenant inventory authority, production build identity,
historical manifest/owner-dependency conformance, policy-table consumption and the
pending nonempty parent-scoped live journeys. D3 independent acceptance, remaining
D7 supported baselines and D8 release gates retain their existing dispositions.

### Executed combined qualification

`pnpm qualify:foundation-publication` passed all **16 checks** from clean candidate
`c4c39123a606a00bf28c899270c0c43e210e5b4a` on Node **24.19.0**. The offline frozen
dependency installation passed, and before/after source identities matched.

| Executed test group | Passed | Failed / skipped |
| --- | ---: | ---: |
| Assembly/source capture | 6 | 0 / 0 |
| Publication/recovery and manifest compiler | 46 | 0 / 0 |
| Host authorization, readiness, pinned reads and rollback | 94 | 0 / 0 |
| Readiness/receipt contracts | 34 | 0 / 0 |
| Support storage, declaration enforcement and inventory, including PostgreSQL/RLS | 31 | 0 / 0 |
| Country authoring round trip and storage-plane qualification | 9 | 0 / 0 |
| Atlas manifest admission/discovery | 6 | 0 / 0 |
| Three-plane rollback retry and concurrent activation/recovery | 2 | 0 / 0 |
| **Total** | **228** | **0 / 0** |

All six affected packages passed their declared typechecks in that candidate.
The recipe now generates Kysely types from the tracked Prisma schemas using the
existing DB-owned `codegen` command before typechecking, and records the three
generated-file hashes. It neither copies ignored developer outputs nor accesses
a deployed database to generate them. Migration layout passed with **106 classified
files and 98 retained SQL files**. The bounded populated Principal-link upgrade,
fresh foundations and canonical-pre-source forward foundations passed; both
foundation modes exercised Studio, Neon and Mesh.

The final private packet is
`~/.athyper/instances/dev/artifacts/foundation-publication/2026-10-02T03-02-34.037Z-695011/`.
`summary.json` indexes exact commands, counts, raw logs, generated-file identities
and per-plane receipts. Archive, check-log and generated-type hashes were verified
after completion. Source tree SHA-256 is
`1c4c1d10d075739514864669d3688704783869ea6229793fc6c0d78b02436219`;
archive SHA-256 is
`32330d913d81bf867baae3329b729b97c542bf430b6ae82d27f55fe120e3f198`;
compiler/source-build identity is
`cf0eaa5db5d6a55c4164d8cb1eaf05ada0856d72525b72fbc2c33180d1521ca1`.
These pins precede this evidence-index update and identify source qualification,
not a serving deployment.

Earlier packets remain preserved under the same private root:
`2026-10-02T02-56-36.157Z-535621` predates the added typecheck gate;
`2026-10-02T02-58-51.126Z-580711` failed the new test-fixture typecheck;
`2026-10-02T03-00-26.508Z-626735` failed clean host typechecking because generated
Kysely types were absent. The final packet includes the fixture repairs and the
isolated code-generation prerequisite; no failed attempt was overwritten.

Additional working-tree regression results: host **912 passed / 26 skipped**,
platform metadata **127 passed / 2 skipped**, publication **416 passed**, and AI
**362 passed**. Skips are not acceptance evidence. Targeted readiness-contract and
qualification-tool ESLint checks passed, as did scoped whitespace checks. The
server-boundary policy still fails on the existing synthetic HR provisioning
import of the removed domain service, with no new finding from this increment.
That failure and the other D8 release dispositions remain open.

<a id="21-d5-installed-manifest-compatibility--2026-10-02"></a>
<a id="a21"></a>

## A21. Historical — 21. D5 installed manifest compatibility — 2026-10-02

**Connection:** shared Entity serving admission must not report a required
capability as available when the installed contract differs from the published
manifest or input/result schema pins, even if a receipt matches those published
pins. This extends the existing host readiness adapter used by Country's metadata
admission and active-inventory checks. Entity definitions, owner authorization,
registered handlers and list/detail routes are unchanged.

The host now compares each resolved installed manifest's plane and three content
hashes with the descriptor binding. An incompatible required tool rejects serving
admission; an incompatible optional tool is removed from availability without
blocking an independently qualified required tool. Receipt matching and current
request authorization remain separate requirements. Activation still evaluates
the declared serving targets, not the publication worker's installed manifests.

Executed working-tree checks: six new regression cases first failed against the
prior implementation, then passed after the repair. The focused host run passed
**56 tests** across readiness, inventory, Country compilation, parent admission
and published owner authorization. Atlas manifest/discovery compatibility passed
**6 tests**. Host production typechecking and formatting of the two changed source
files passed. These local checks do not supersede §20's captured qualification
packet or establish a new reproducibly pinned release qualification.

**D4/D5 remain open** for deployed acceptance, authenticated receipt custody,
production build identity and complete tenant inventory, as well as the remaining
acceptance work recorded in §20. No publication, activation, receipt authority or
deployment was changed by this increment.

<a id="22-d3-runtime-attempt-preservation--2026-10-02"></a>
<a id="a22"></a>

## A22. Historical — 22. D3 runtime attempt preservation — 2026-10-02

**Connection:** reviewed Entity learning qualification must retain failed runtime
attempts so a later successful retry cannot replace evidence needed for acceptance.
The existing Country Entity page/Atlas relay and model qualification commands now
claim a new private output directory exclusively and write an attempt-start record
before browser or session initialization. Startup failures produce terminal reports;
cleanup happens after report persistence. Existing directories, including abandoned
attempts, and existing terminal reports cannot be overwritten by these commands.
Retries require a new directory and receive a distinct attempt identity.

The shared verification helper marks these runs `implementation-diagnostic`.
It does not attest independent authorship, agreement on attempt rules, approval,
publication, or runtime acceptance. Entity definitions, serving behavior and
authorization were not changed.

Executed local verification: **4 attempt-preservation tests passed**, including
both real CLIs failing on unavailable startup prerequisites before any DEV request,
plus **3 controlled-benchmark preparation tests passed**. These are working-tree
source checks, not a new pinned release or live model/Entity qualification.

D3 remains pending independently authored questions from `catl.admin`, attempt
rules agreed with `catl.owner` before acceptance execution, and authenticated
independent review/publication followed by the required runtime and negative-path
receipts. Those inputs were requested in this session; implementation test questions
were not substituted for them. No reviewed acceptance run or deployment change was
performed by this increment.

<a id="23-d4-publication-conflict-classification--2026-10-02"></a>
<a id="a23"></a>

## A23. Historical — 23. D4 publication conflict classification — 2026-10-02

**Connection:** Entity publication and rollback state conflicts must retain their
non-retryable classification instead of being mistaken for dependency outages.
The shared local projection repository emits message-only activation and rollback
head-mismatch errors. The publication classifier previously recognized only
permanent message-only codes, losing known conflict identities; rollback head
mismatch was also missing from the conflict set.

The shared classifier now recognizes exact known conflict messages and includes
the rollback head mismatch. Structured error codes retain precedence. Unknown
messages remain sanitized dependency failures; connection failures, serialization
failures and deadlocks remain retryable. The existing rollback worker consumes
the corrected classification without changing its tenant execution coordinates,
authorization, transactions or durable operation identity.

Executed working-tree verification: **8 regression cases failed before the fix**;
afterward, **46 targeted tests passed** across classification, orchestration and
the rollback worker. Publication production/test typechecking passed. This is
source verification, not deployed recovery or complete D4 acceptance. Independent
D3 questions, predeclared attempt rules and authenticated review remain pending;
their purpose and custody requirements were explained to the owner. No acceptance
input or approval was fabricated, and no serving release was changed.

<a id="24-d6-target-decision-support-matrices-and-d9d10-admission--2026-10-02"></a>
<a id="a24"></a>

## A24. Historical — 24. D6 target decision, support matrices and D9/D10 admission — 2026-10-02

**Owner decision:** D6 targets **Principal-family scope from §13**. Employee and
Business Partner remain comparison inventories required by D6, not newly approved
onboardings. This resolves O5. The instruction to proceed when relevant
prerequisites pass preserves the existing gates; it does not waive them.

**Connection:** this preparation follows Country's existing Entity publication,
registered Records handlers, owner authorization and shared list/detail paths.
Only this controlling plan changed in this increment. No entity definition,
runtime component, publication, support pointer or deployment was changed.

### Country reference and current source boundaries

- Authoring: `metadata/products/shared/entities/country/definition.json` selects
  `entity.record.list.v1`, `entity.record.read.v1` and `tenant.record.v1`.
  `graph-builder.ts` in Studio authoring projects its `definition.ai` authority.
- Publication: host `composition/shared/publication/compiled-runtime.ts` reads
  the approval-enforcing source and qualifies target storage; publication service
  `compilation/native-runtime.ts` lowers it into core/operation members and a
  runtime contract. Compilation also pins the registered AI manifests. This
  host adapter explicitly limits itself to the local DEV workload profile.
- Provider and authorization: host Entity runtime `read-registrations.ts` binds
  the published operations to Records `list`/`get` and the registered scope
  resolver. `services.ts` supplies metadata, authorizer and transactions;
  `read-bindings.ts` installs the standard Records HTTP routes. Qualification
  receipts do not replace these request decisions.
- UI: Neon `lib/entity-application-route.tsx` uses `NeonEntityList`, which mounts
  shared `EntityListRuntime`. Its `/app/entity/[entityCode]/[[...segments]]`
  route uses shared `createEntityReadRoute`. Principal-family work must retain
  this integration and the shared embedded relationship components.

### Employee and Business Partner comparison matrices

These are inspected working-tree source capabilities. A checked-in artifact with
`contractStatus: published` is not evidence of a currently active release. Tests
below qualify bounded source behavior, not either entity's authenticated journey.

| Authoring feature | Compiler path | Artifact / descriptor | Runtime consumer | Qualification status and D6 disposition |
| --- | --- | --- | --- | --- |
| Employee tenant read, explicit Neon storage, list/read permissions and list/detail surfaces in `metadata/products/shared/entities/employee/definition.json` | Studio `compileTableEntityProduct` → native projection → `lowerNativeRuntimePublication` | Core, operation and runtime contract with tenant authorization | Registered Records list/read; shared Entity list/detail | Employee case in `table-entity-publication.test.ts` passed in this increment. Existing source already supplies the read shape; no new Employee framework feature is justified. Current serving behavior was not checked. |
| Employee Person/Principal references | Table-product field/type and reference declarations | Tenant-qualified key references and `fieldReferenceBindings` | Shared reference and relationship consumers | Source inspected; `workforce-products.test.ts` contains reference assertions but was not executed in this increment. A reference does not establish a parent-scoped child collection or permission to disclose Person PII. |
| BP core, list/detail and child sections in `metadata/products/mdg/entities/business_partner/` | Split compiled-artifact path; distinguish it from single-storage native lowering | `core.json`, `operation.json`, list/detail and section members | Pinned compiled Entity reader and shared Entity surfaces | Members inspected, no fresh BP release or UI qualification. Native lowering explicitly rejects nonempty `relations`; this is a path limitation, not proof that all relational runtime support is absent. |
| BP intake authoring (`entity_flow` / `entity_flow_step`) | `compileEntityIntakeFlows` through native runtime projection; compiled flow reader for split members | `intakeFlows`; BP `flow.intake.json` and pinned request/workflow members | Shared Entity intake and `CompiledEntityFlowReader` | Intake projection and compiled-flow-reader suites passed (9 tests). Native publication lowering separately rejects `flows`/`flowSteps`. Do not extend that path merely because the separate projection exists. |
| BP materialization and governed changes | Single-storage native lowering rejects `materializationBindings`, `materializationFieldMappings`, `changeCaseBindings`; governed-flow consumption is a separate path | Requires its own qualified compiled bindings and owner dependencies | Existing owning services through Entity publication/runtime contracts | Materialization rejection test passed. No full materialization/change-case compilation or execution qualification performed. Neither capability is required by the selected Principal-family read scope. |
| Historical BP Atlas behavior | Explicit BP tool checks in AI `agent-runtime.ts`, `runtime-tool-discovery.ts` and `message-lineage.ts`; BP branches also remain in shell Atlas components | Existing tool IDs, insight result shape and evidence hashes | Atlas discovery, replay and shell presentation | Source coupling confirmed, not migrated. Future registry migration must preserve historical IDs/result interpretation and current authorization. No evidence yet that replacing all these branches is needed for Principal-family scope. |

### Selected Principal-family support matrix

This updates §13's historical inventory: Principal and Notification Preference
now have `definition.ai` blocks, as recorded in §15; Profile still does not.

| Authoring feature | Compiler path | Artifact / descriptor | Runtime consumer | Qualification and remaining relevant prerequisite |
| --- | --- | --- | --- | --- |
| Principal read-only Atlas summary/field explanation | Table-product `definition.ai` projection → graph/compiler → native publication with exact manifest bindings | Published runtime AI declarations and pinned capability/schema identities | Generic Entity tools → authorized Records owner | Country/manifest/table publication suites passed locally. §15 reports Principal release 4 and a live record summary; field explanation failed there. Requalify the selected serving artifact and target support before claiming present availability. |
| Notification Preferences embedded under Principal | Principal `recordPresentation.entityRelationships` plus the child's declared AI tools; existing relationship qualification and table compilation | Parent relationship and descriptor hash; child runtime contract | Shared related list → server parent scope resolver → Records; parent scope retained by Atlas | Local parent tests pass for rows/counts/groups/search/IDs, cursor substitution, stale publication, tenant/owner denial and export. §15's live child lists were empty and the model phase failed. Nonempty self/admin/denied reads, export and Atlas answer receipts remain open. |
| Profile embedded under Principal | Existing table/relationship declarations, without AI enrollment | Standard child descriptor and parent relationship | Shared detail/related list and existing owner authorization | Preserve existing UI scope and field policy. Profile AI/PII exposure is not enabled by the target choice alone; any proposed enrollment needs declared eligible fields/capabilities and demonstrated owner support. No enrollment change made. |
| Deployment-bound tool support for the selected declarations | Host readiness adapter resolves installed manifests and compares published manifest/input/result hashes | Immutable support receipt, current pointer and serving-target authority | Shared readiness evaluator at admission, readiness probes and activation/rollback target checks | Focused readiness/inventory/owner/parent/registry suites passed (59 tests). Deployed receipt custody, matching production build identity and complete authorized tenant inventory remain unqualified in §§20–21. No current support was inferred from local tests. |

### Conditional work disposition

| Deliverable | Relevant admission evidence still required | Result of this increment |
| --- | --- | --- |
| D6 Principal-family scope | D5 parent-scope acceptance with nonempty live data, current owner authorization and deployment-bound support for the exact selected capabilities. D7 is additionally required if an actual schema gap is demonstrated. | Target fixed and support matrices prepared under §8.1's explicit preparation allowance. No demonstrated missing compiler branch in the selected read shape; feature extension remains gated. Do not import Employee/BP scope into this target. |
| D9 multilingual semantics and broader targets | D3 independent fixtures, predeclared attempt rules, authenticated review/publication and evaluated-to-activated readback; relevant D5 registry, semantic-authority and availability guarantees. | Deferred. Preference Locale/Language references and local source passes do not establish multilingual semantic acceptance. |
| D10 enforcement boundary report | Relevant D5 explicit registrations and qualified scope/readiness evidence, with executed receipts bound to captured source identities. | Deferred. This support inventory is not the generated enforcement report and does not establish reachability, authorization correctness or deployment behavior. |

No dependency on unrelated capabilities or blanket D8 completion is added here.
The remaining relevant live/custody requirements are already recorded in §§15,
20–22. Closing them must use real authenticated actors and actual qualification
results; implementation fixtures cannot substitute for independent D3 acceptance.

### Executed diagnostics

Executed from the existing dirty workspace, with **104 tests passed, zero failed
and zero skipped** in these selected files:

- Host publication: `native-runtime-lowering.test.ts`,
  `table-entity-publication.test.ts`, `entity-ai-manifest-publication.test.ts`:
  **29 passed**.
- Metadata: `intake-projection.test.ts`, `compiled-entity-flow-reader.test.ts`:
  **9 passed**.
- Host Entity runtime: `deployment-readiness.test.ts`, `readiness-inventory.test.ts`,
  `published-owner-authorizer.test.ts`, `published-parent-admission.test.ts`,
  `entity-scope-registry.test.ts`: **59 passed**.
- Records: `parent-scope.test.ts`, `entity-list-parent-scope-routes.test.ts`,
  `parent-export-scope.test.ts`: **7 passed**.

Commands used the owning package's `pnpm --filter <package> exec vitest run`
with the listed source test paths. These are fresh implementation diagnostics,
not a captured reproducible qualification packet. They do not supersede §20's
pinned packet, revalidate §15's deployment, or close D3/D5 acceptance. No live
publication, model/browser journey or deployment change was performed.


<a id="a25"></a>

## A25. Historical — 25. Architecture audit correction and Principal nonempty diagnostics — 2026-10-02

The owner authorized the recommended order: correct audit wording/metrics,
reproduce and fix the full docs gate in a clean checkout, improve generic related
Entity registration with server enforcement, complete the selected Principal-family
qualification, and close independent/serving evidence before claiming learning readiness.
See the [audit follow-up](../reports/architecture-audit-followup-20261002.md) for source
integration points, exact conclusions, commands/results and retained private evidence.

This increment corrected inventory reporting to 1,291 owned but unverified
physical declarations, 66 rows with implementation references and zero rows with
test references. It reproduced 10 docs errors at the detached baseline and passed
the full 277-task typecheck after the four docs fixes. The final source snapshot
and verification outcomes are in the private architecture-audit/2026-10-02-followup
packet; selected working-tree tests are separately identified as diagnostics.

Generic published relationships now select a registered descriptor key and retain
the loaded parent publication hash through shared list/detail/setup, Records create
validation and Atlas context. Server-owned predicates and current parent authorization
remain authoritative. Simultaneous admin/finance journeys exposed cross-principal
in-flight release coalescing; the shared compiled reader now separates those actor
coordinates and source admissions. Regression tests cover allowed/denied concurrency.

Normal Neon sessions passed nonempty parent-scoped Notification rows, exact counts,
search, requested IDs, pagination and cross-parent/stale-pin denials. After the reader
fix, concurrent admin/finance journeys both passed and cleaned up all disposable
rows. Profile setup/update also passed. Notification publishes no groupable fields
or export operation: live grouping/export requests were rejected and controls are
hidden. These negative checks do not establish successful grouped queries or exports;
background export remains source-tested on explicitly eligible generic fixtures.

DEV inference admission was recovered using the documented quiescent procedure,
with the original healthy client images restored and the coordination epoch preserved.
Principal field explanation still failed after discovery with
`local_context_budget_exceeded`. A Principal summary and nonempty embedded-list
model response completed without the required successful reader/citation receipts.
None of those responses qualifies its intended capability. Failed attempts remain
retained. This operator recovery does not establish D5 support custody or a production
serving identity; DEV executes mounted working-tree source.

The refreshed Studio admin/owner sessions are authenticated; both learning inboxes
returned zero entries. The user subsequently supplied nine Country questions, saved in
`tooling/scripts/verification/fixtures/country-record-summary.user-supplied.json`
and validated by the existing declaration parser. They match the shared template;
independent authorship and agreement to the attempt rules remain unattested. The assigned actors/session refresh are not authorship,
agreement or approval attestations. No learning candidate, independent review,
publication, activation, support receipt or Profile AI enrollment was fabricated.
T04–T08, T17 and T25 remain OPEN; no acceptance state or rollup is promoted by this
increment. T18–T21 and the unrelated BP catalogue migration retain their existing gates.


<a id="a26"></a>

## A26. Historical — 26. Country citations and Principal serving-admission diagnosis — 2026-10-02

E26 records two fresh Country release-13 passes: a field explanation with one
actual `qwen3:8b` model call and successful field-reader citation, plus a
deterministic record-summary reader/citation with zero model calls. Both citations
match the current record and descriptor; both answers pass authorized durable
history reconstruction. The private
`atlas-acceptance/2026-10-02/runtime-evidence.json` packet retains model bindings,
installed digest readback, durable run/tool records, result and evidence hashes,
container identities and the failed Principal follow-up. See the
[audit follow-up](../reports/architecture-audit-followup-20261002.md#follow-up-successful-reference-citations-and-serving-admission)
for exact run IDs and scope.

Principal and Notification published manifest pins match the installed tools, but
explicit enrollment requires deployment-bound support. The actual source API has
no `ENTITY_SERVING_DEPLOYMENT_ID`; readiness cannot qualify its optional tools.
Country lacks explicit manifest bindings and uses legacy compatibility, so its
success does not qualify those enrolled entities. The missing support also
explains why Principal discovery falls back to unrelated tools. No budget,
authorization, manifest pin or readiness requirement was relaxed.

T18 still requires an authenticated qualification writer, retained immutable real
execution evidence and authorized current-pointer/target custody. A configuration
ID alone cannot supply those results. The supplied nine questions and proposed
rules have a private review packet, but independent final authorship, exact rules
agreement and distinct eligible proposer/evaluator are still absent. No review,
publication, activation or support receipt was fabricated. T04–T08, T17–T21 and
T25 retain their existing dispositions; no closure metric changes.

<a id="a27"></a>

## A27. Historical — 27. Qualification writer and local deployment identity — 2026-10-02

E27 advances T18 to IN PROGRESS. Shared metadata now implements qualification
orchestration through explicit custody, storage and registered owner-probe ports;
the host composes it through `entitySupportQualification` dependencies. It does
not silently use the publication writer credential or expose a parallel Entity
API. Evidence hashes must resolve to retained, target/capability/actor/attempt-bound
probe results. All installed cases must pass; failed/interrupted attempts remain
retained and cannot update current support. Revalidation brackets immutable
retention and atomic pointer replacement. Cancellation and bounded timeouts also
retain failure when a registered probe does not settle.

80 selected source tests passed (44 metadata, 33 host readiness/storage, 3 host
qualification registration), as did metadata production/test and host typechecks.
They use isolated fixtures, not deployed support receipts. The local source
startup script now supplies stable API/worker deployment identities; both were
restarted and returned healthy. Normal authenticated Entity readback still shows
Country 13, Principal 4 and Notification 3. No entity release was published or
activated by this increment.

The missing identity prerequisite is resolved for this personal source DEV
instance. Dedicated custody credentials/retention, authenticated atomic support
and serving-target authority, and actual registered owner probes remain
unconfigured. No passing deployed receipt or support pointer was fabricated.
Principal/Notification model-answer acceptance and independent final fixtures,
exact rules agreement and distinct proposer/evaluator identities remain open.
The rollup is 5 IMPLEMENTED, 25 OPEN, 8 IN PROGRESS and 2 DEFERRED; none is CLOSED.
See the [audit follow-up](../reports/architecture-audit-followup-20261002.md#follow-up-qualification-orchestration-and-local-deployment-identity)
and private `atlas-acceptance/2026-10-02/` evidence packet for bounded results.
