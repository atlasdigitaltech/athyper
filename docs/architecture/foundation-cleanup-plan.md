# Foundation Cleanup Plan — pre-onboarding hardening for NEON, MESH, STUDIO and Atlas

**Status:** proposed plan. Not an authorization to change production or to begin onboarding.
**Date:** 2026-09-30
**Evidence base:** architecture review of 2026-09-30 across four audits (Meta Entity genericity,
three-plane boundary, Atlas AI, verification/CI), read at `HEAD 3f8f7b3b5` with a dirty,
concurrently-mutating worktree. Line numbers are approximate; verify by content.
**Scope:** make the shared foundation strong enough that workspace/module onboarding is
metadata-only, mechanically verified, and safe. Entity onboarding itself is out of scope here.

---

## 1. What "strong foundation" must mean — measurable exit criteria

A foundation is strong when the things we claim are *proven*, not asserted. Seven gates.
All must pass on one frozen commit before the large onboarding phase opens.

| Gate | Claim it proves | Objective acceptance test |
| --- | --- | --- |
| **G1 — Gate is real** | The repository can prove anything | `ci-success` is green on a frozen commit **and** branch protection is active and verified. Every check in the `ci` profile passes or is explicitly retired with a recorded reason. |
| **G2 — Tree is clean** | The commit under review is the code under review | `git status --porcelain` is empty at the qualifying commit; no `dist/`/`.next*` build output on disk; no stub packages; generated artifacts are reproducible via their generators. |
| **G3 — Framework proof** | Onboarding is metadata-only | A third entity — **tenant-owned, with ≥1 relation, ≥1 write path and ≥1 masked field** — is onboarded and published from metadata with **zero** changes under `server/packages/planes/*`, `packages/platform/*` or `apps/*`. Enforced by a policy that fails on any new entity-specific literal. |
| **G4 — Enforcement proof** | Published policy is actually policy | A `masked_only` field is provably masked on the read path; a cross-plane route request is denied; publication target writes use a plane-scoped writer role. Each has an executable test, not a document. |
| **G5 — No silent failures** | Absence of a control is detectable | Every registered capability reports `registered / connected / admitted / unavailable`. A descriptor that publishes an unenforceable authorization profile fails publication and startup. No control may be inert without a startup assertion. |
| **G6 — Plane boundary is mechanical** | Isolation is not discipline | A CI check rejects cross-plane imports under `server/packages/planes/*` and in the composition root; ADR boundaries have executable checks. |
| **G7 — AI is contract-driven and evaluated** | Atlas reasons from the published contract | On a held-out set bound to descriptor/contract hashes, over ≥2 entities: a human-reviewed vocabulary correction measurably improves selection on **unseen** wording after publication; unsupported intent is refused; zero unauthorized disclosure in the acceptance suite. |

**G3, G4 and G7 are the gates that matter.** G1 and G2 exist only so we can trust the others.

---

## 2. Baseline: what is true today

Compact restatement of the 2026-09-30 review. Scores are 1–5.

| Pillar | Score | Blocking reality |
| --- | --- | --- |
| **STUDIO** | 3.5 | Strongest and least duplicated plane; but the compiled lowering path **refuses** `relations`, `flows`, `flowSteps`, `materializationBindings`, `materializationFieldMappings`, `changeCaseBindings` (`server/packages/services/publication/src/compilation/native-runtime.ts:16-20`), and published permission codes are derived from a Business Partner namespace (`entity-definition-consumer.ts:54,106`). |
| **NEON** | 2.5 | 130 `master` + 138 `document` + 16 `ledger` tables; **zero** transactional entities authored as metadata. Lists are scoped by an entity-named switch (`neon.business_partner.directory.v1`). |
| **MESH** | 3 | Genuine separate domain (38 own tables, exchange semantics); one published entity. `verify-plane-boundaries.mjs` never scans `server/packages/planes/*`. |
| **Atlas** | 2 | Governed plumbing is good; the agent graph is **not composed** (`dependencies.ai` has no supplier; `registerAtlas` early-returns at `register-services.ts:3625`; all `ATLAS_AGENT_*` flags default false). No learning mechanism exists. |
| **Platform-wide** | 2 | Merge gate structurally red for ≥4 independent reasons; the RLS verification job is skipped upstream of a missing npm script; the workspace test step executes nothing. |

**The single most useful number:** ~5 entities live against a declared 108-module catalog and a
138-table transactional model. The foundation's job is to make the next 100 modules cheap. Today
onboarding steps 1–6 are metadata-only and steps 7–14 are code.

---

## 3. Workstreams

Effort estimates are rough engineer-days for one focused engineer, including verification.
They are *not* commitments.

### WS0 — Truth and hygiene (establish G1, G2)

**Why first:** every other workstream's evidence is worthless until the gate can pass. Do this
before anything else, because it is the cheapest and it unblocks measurement of everything else.

| # | Task | Evidence | Effort |
| --- | --- | --- | --- |
| 0.1 | Remove or restore the `qualify:business-partner-r9` invocation | `ci.yml:126`; script exists in no `package.json`. Fails `policy:ci-entrypoints`, which **skips the RLS / SECURITY DEFINER / permission DB job** | 0.5 |
| 0.2 | Fix the workspace test invocation | `ci.yml:120` runs `turbo test --coverage`; Turbo rejects `--coverage`. **No workspace test runs in CI.** Fix the flag or the turbo config; add a coverage threshold or stop implying one | 0.5–1 |
| 0.3 | Repair or formally scope `policy:i18n`; add the missing ESLint config | `policy:i18n` asserts DDL columns that do not exist, and `pnpm lint` = `policy:i18n && turbo lint`, so lint is blocked. No ESLint config exists at HEAD | 1–2 |
| 0.4 | Triage the 19 failing checks in the `ci` profile | `docs/architecture/wave1-repository-drift-review.md:38-60`: 28 passed / 19 failed, "failures remain blocking". For each: **fix**, **scope**, or **retire** with a written reason. No check may remain failing-and-blocking | 5–10 |
| 0.5 | Land or revert the dirty worktree | 128 modified / 34 untracked / 5 deleted. A review of a dirty tree is not a review of a commit | 1–3 |
| 0.6 | Delete build output and prevent recurrence; fix the gate that reads it | 98 `dist/` directories on disk, 0 tracked. `verify-theme-token-integrity.mjs:20-27` misses `.next-*` while its two sibling gates implement the rule (`verify-design-system.mjs:50-59`, `audit-style-tokens.ts:39-49`) | 1–2 |
| 0.7 | Remove stub packages and clean workspace globs | `packages/planes/{mesh,neon}/business-partner/`, `packages/planes/neon/{entity-extensions,workforce}/`, `packages/planes/studio/business-partner/` contain only `node_modules`. `pnpm-workspace.yaml` still globs `packages/product-deprecated/*/*` with ~35 negations and commented-out entries | 1–2 |
| 0.8 | Refresh or delete stale evidence | `test-results/` = failed Playwright run 2026-09-24; `governance/evidence/business-partner/*` 2026-09-05; `ci-integrity-local.json` pinned to Sep 11 with `wave0Closed: false`. Rule: dated evidence older than the tree must say so or be removed | 2–3 |
| 0.9 | Fix the failing `policy:plane-boundaries` and `policy:deployment-profiles` checks | Both are in the failing list | 2–4 |

**Exit:** `pnpm policy:static` green on a frozen commit; `ci-success` green; branch protection
active and verified (currently an HTTP 403 to the check).
**Effort:** ~15–30 engineer-days. **Nothing else is measurable until this closes.**

### WS1 — Meta Entity contract completeness (establish G3)

**Why:** this decides whether the ERP thesis is reachable. An ERP entity is largely defined by
its relations and its flows.

| # | Task | Detail | Effort |
| --- | --- | --- | --- |
| 1.1 | **Decide the lowering ceiling** | Either implement lowering for `relations` / `flows` / `flowSteps` / `materializationBindings` / `materializationFieldMappings` / `changeCaseBindings`, **or** narrow the advertised descriptor and state plainly that v2 authoring supports flat, single-object entities. Leaving the contract promising more than the compiler emits is the exact failure this repository has otherwise avoided | 5–15 (implement) / 1 (narrow + document) |
| 1.2 | End dual ownership of entity semantics | Move AI/semantic authoring from surface `layoutConfig.ai` to the entity change set (`metadata.entity_ai_profile`). A surface may *reference* a presentation profile; it must not be a second authority | 5–8 |
| 1.3 | Make the discovery→execution path metadata-driven | Replace the hardcoded provider catalogue (`entity-ai.ts:36-44`, 9/10 entries Business Partner) with a published registry manifest surfaced to Studio | 3–5 |
| 1.4 | Single authoring home for semantic terms | `metadata.entity_semantic_term` with bounded target kinds (entity / field / relationship / enum-role / capability), locale, deterministic precedence, and ambiguity represented explicitly rather than resolved silently | 5–8 |
| 1.5 | Capability bindings validated against a registry | `metadata.entity_ai_capability_binding`: a declaration never installs an adapter and never grants an operation. Effective capability = intersection of published declaration, installed adapter, target plane, feature admission, agent allowlist, data-class policy, **and** current authorization | 5–8 |
| 1.6 | Semantic content inside the immutable release | Own schema version; derived semantic hash covered by the existing contract hash; legacy hashes preserved when semantics are absent | 3–5 |
| 1.7 | Extend the contract test kinds | Add a `semantic` test kind with versioned input/expectation schema, and separate **retrieval examples** from **held-out evaluation cases**. Held-out cases must never enter the runtime example index | 3–5 |

**Note:** this is substantially the F1 scope of
[atlas-meta-entity-learning-foundation.md](atlas-meta-entity-learning-foundation.md), which is a
good plan that has not been executed. **Adopt it rather than inventing a second one.**

**Exit (G3):** the third entity — tenant-owned, relational, with a write path and a masked field —
publishes and activates on all three planes from metadata alone, with a policy proving no
entity-specific code was added.
**Effort:** ~30–55 engineer-days, dominated by decision 1.1.

### WS2 — Install the enforcement layer (establish G4)

**Why:** three headline controls are fully specified and largely coded but not composed into the
running host. A control that is not installed is worse than an absent one, because it reads as
present during review.

| # | Task | Detail | Effort |
| --- | --- | --- | --- |
| 2.1 | **Decide the authorization backend** | `entityBackends` / `entityCaseBackendAuthorization` (`register-services.ts:377,397`) have **zero suppliers**. Either install the enforcing backend, or remove the profile contract from the descriptor. The 2026-09-30 commit `d186532c0` moved this from fail-open to **fail-closed** — correct, but it means any non-trivial profile currently cannot run at all | 8–15 (install) / 2 (remove) |
| 2.2 | Wire the masked/reveal projection | `projectEntityFields` (`entity-authorization.ts:274`) is the only code that turns `representation: "masked"` into `••••`, and it has **zero production callers**. Installing 2.1 alone will **not** produce masking — the verifier established this and it must not be missed | 5–8 |
| 2.3 | Fail publication/startup on an unenforceable profile | `assertEntityAuthorizationEnforceable` exists (`shared/publication/entity-authorization-activation.ts`) and is wired; extend it to cover `entityDescriptorSupported` paths and add a **startup** assertion for the composition, not just activation | 2–3 |
| 2.4 | Implement isolated deployment profiles | Only `combined` can run: `assertDeploymentProfileImplemented` throws for `studio`/`neon`/`mesh` (`deployment-profile.ts:34-37`, called at `bootstrap.ts:11`). Consequently `restrictAuthenticationToPlanes` is wired (`authority.ts:99`) but **vacuous** — `servedPlanes` is always all three. Either implement the profiles, or record combined-only as a deliberate posture with compensating controls | 15–30 (implement) / 2 (document posture) |
| 2.5 | Plane-scoped writer role for publication targets | Publication binds the Studio authority DB and each target DB into one orchestrator (`shared/publication/targets.ts:34-48`) and writes through general `athyperapp` adapters, unlike `authorization-writer-databases.ts:39-45` which uses a dedicated writer. Give target writes their own scoped role | 3–5 |
| 2.6 | Authorize the verification endpoints | The platform verification endpoints authenticate but never authorize (`shared/verification.ts:64-140`); the synthetic privileged run is reachable by any authenticated principal | 1–2 |

**Exit (G4):** an executable test proves a `masked_only` field is masked at read time; a
cross-plane request is denied; the least-privilege review accepts the writer roles.
**Effort:** ~20–40 engineer-days, or ~6 if you choose the "narrow the contract" options in 2.1/2.4.

### WS3 — Genericity of the shared runtime (establish G3 and G6)

**Why:** entity-named branches inside shared code are how a "generic" framework quietly becomes N
bespoke frameworks. 24 leak sites in 5 clusters were confirmed.

| # | Task | Detail | Effort |
| --- | --- | --- | --- |
| 3.1 | **Convert list scope from a switch to a registered resolver port** | `compileRecordCollectionScopeCondition` branches on `entity.parent.v1` (generic), then `neon.business_partner.directory.v1`, `neon.business_partner.operating_organization.v1`, `mesh.network_relationship.actor_account.v1`, `studio.metadata_entity.catalog.v1` (`kysely-record-repository.ts:120-170`). An ERP needs company-code, profit-centre, cost-centre, plant, warehouse, project and org-unit scoping — each must be a registration, not a new branch in a shared repository | 5–10 |
| 3.2 | Remove `bp_*` from the central agent runtime and shell/AI | `agent-runtime.ts:311,563-566,1342-1345`; `message-lineage.ts:190`; `atlas-answer.tsx:325,353`; `atlas-workspace.tsx:366,790`; `atlas-context-inspector.tsx:87`; `automatic-brief.ts:5,17-18`; `quick-access.tsx:408`. Note `bp_read_brief` and friends have **zero definitions** in `server/` — these are dead references, so the Atlas F2 gate is currently unmeetable as written, not merely unmet | 5–8 |
| 3.3 | Move published permission-code derivation out of the BP namespace | `entity-definition-consumer.ts:54` `` `neon.business_partner_request.${key}` ``, `:106` `` `neon.business_partner.${journey}.onboarding` ``, plus a hardcoded `supplier.new → formDescriptors["supplierRequest"]` mapping. Permissions are sealed inside signed releases, so migration cost only grows | 3–5 |
| 3.4 | Replace naming-regex behaviour with declared semantics | `list-view/src/index.tsx:5067-5068` ranks search hints on `/country/i` against key+label; `quick-access.tsx:408` chooses an icon on `/business partner/i`. `entity-list-service.ts:868,1386` shows the correct pattern — key off published `semanticRole` | 2–3 |
| 3.5 | De-hardcode the related-child registry | `related-presentation.ts:77,89,111` `ownerEntityCode: "business_partner"`; the source enum is closed at `:210-218`. Must become a registration before any second entity declares a related projection | 3–5 |
| 3.6 | Generalise reference/lookup sources | `shared-reference-directory.ts:39-56,195-245` holds hand-written SQL per source (17 sources) | 3–5 |
| 3.7 | Bind catalog modules to entities in the generator; **fail on an unbound module** | `generate-platform-catalog.mjs:111` emits `entities: []` for all 108 modules; `:98` gives every module the placeholder text "«Module» is ready for published entity experiences." A module with no reachable entity must fail generation — otherwise it is the "page appears complete" pattern the repository's own instructions forbid | 3–5 |
| 3.8 | Add an executable entity-literal guard | Extend `verify-plane-boundaries.mjs` roots (currently `apps/*`, `packages/planes/*`, `packages/shared` — it never scans `server/packages/planes/*`) and add a directory-wide invariant scanning non-test sources for entity literals outside an explicit allowlist. `eslint.config.mjs` has **zero** boundary rules today | 3–5 |

**Exit (G3/G6):** a grep for entity literals in shared runtime code returns only allowlisted domain
composition, enforced by a policy that fails the build.
**Effort:** ~30–45 engineer-days.

### WS4 — Eliminate silent failure (establish G5)

**Why:** the recurring, most dangerous pattern in this codebase is a control that exists, is
documented, and does nothing.

| # | Task | Detail | Effort |
| --- | --- | --- | --- |
| 4.1 | Publication stalled-recovery is inert | With no tenant coordinate, `publication.release` RLS hides every candidate and the job reports `{"recovered": 0}` as success — reproduced live at 5,173 zero-recovery runs (`kysely-authority-repository.ts:146-156`) | 3–5 |
| 4.2 | Deterministic SQL rejections classified `transient` | A deployment is therefore never marked `failed`, the dead-letter list never sees it, and raw SQLSTATE becomes the failure code (`publication-orchestrator.ts:221-243`) | 2–3 |
| 4.3 | Cross-tenant rollback route | No resource or tenant scope at any layer; for a shared-reference publication the affected head is global (`publication-routes.ts:121-133`) | 3–5 |
| 4.4 | Atlas drift monitoring cannot fire | `swapBaseline` has no producer or route, so the baseline is always absent and `alerted` can never be true (`monitoring.ts:19-21`) | 2–3 |
| 4.5 | Action-policy tables are write-only | `ai_action_policy` / `ai_confidence_threshold` are written by `policy-administration.ts:12-13` and read by nothing at runtime; the intended reader is the unimplemented `AtlasToolAuthority` port (`contracts/ai/src/tools.ts:114-126`) | 3–5 |
| 4.6 | Dead onboarding transport | `register-studio-onboarding.ts:19,63-74` declares a saga + `ProvisioningCommandTransport` with audience `${plane}-provisioner`; the transport is never constructed, so cross-plane provisioning is silently disabled | 2–5 |
| 4.7 | Remove confirmed dead code | `projectEntityFields` and `swapBaseline` have only their own definitions as non-test references; `createEntityMetadataHooks` is unreferenced, so declared `requiredCoordinates` and reference-domain checks are documentation, not controls (`metadata-validation.ts:17`). Delete or wire — do not leave | 2–4 |
| 4.8 | Capability readiness reporting | F0-04: add a protected, content-free diagnostic snapshot distinguishing `registered / connected / admitted / unavailable`, so a dark composition is visible before a user finds it | 3–5 |

**Exit (G5):** every registered capability reports its readiness; a missing composition fails
startup or reports `unavailable`; no inert control remains undocumented.
**Effort:** ~20–35 engineer-days.

### WS5 — Atlas: contract-driven semantic learning (establish G7)

**Why:** the owner's goal is "AI agent self-learning using Meta Entity contract properties". This
is achievable, but not in the form the phrase usually implies, and the prerequisites are upstream
of Atlas itself.

**5.1 Be precise about what is being built.** There is no fine-tuning, gradient, weight-update,
bandit or embedding-refresh code in this repository, and the runtime does not currently compose the
agent graph at all. **Do not promise autonomous self-learning.** What *is* achievable, and is a
genuinely strong capability, is a governed loop we should name **Contract-Driven Semantic
Learning (CDSL)**:

> The published Meta Entity contract is the system's semantic and capability surface. "Learning"
> is the reviewed, evaluated enrichment of that surface — aliases, meanings, approved examples,
> capability bindings — gated by held-out evaluation and published as a new immutable release.
> Model weights are independently versioned and are not the learning substrate.

This is honest, it compounds, and it is auditable — which is the property that makes it usable in
an ERP. It also matches the existing F1–F5 plan.

**5.2 The loop, end to end.**

```
published contract (semantics + capability bindings)
        ↓
admitted capability catalogue for the entity/context
        ↓
bounded intent resolution  →  validated capability request
        ↓
existing tool coordinator + policy  →  owner services (facts, not opinions)
        ↓
validated answer + citations + coverage
        ↓
typed feedback (vocabulary / intent / missing context / unsupported / owner failure)
        ↓
candidate → minimized handoff → Studio inbox → independent review
        ↓
held-out evaluation bound to descriptor + contract hash
        ↓
new immutable release → activation per plane  ⟳
```

**5.3 Tasks.**

| # | Task | Detail | Effort |
| --- | --- | --- | --- |
| 5.3.1 | **Compose the AI graph, or declare Atlas out of the shipped profile** | `bootstrap.ts:41` passes no `dependencies.ai`; `registerAtlas` returns early at `register-services.ts:3625`; `ATLAS_AGENT_ENABLED` / `TOOLS_ENABLED` / `MUTATIONS_ENABLED` all default `false`. Today the host runs Atlas as retrieval + grounding + experience config only. Do not report Atlas as enabled while this is true | 5–10 |
| 5.3.2 | Implement `AtlasToolAuthority` and make policy tables operative | Back it by `ai_action_policy` + `ai_confidence_threshold` so an administrator's edit changes behaviour, and route thresholds into `authorize` | 5–8 |
| 5.3.3 | **Replace the coupled evaluation harness** | `learning-evaluation.ts:5-14` calls the production resolver under test, so it cannot detect its own error pattern. This is the methodological blocker on any future tuning: fix the harness before tuning anything, or you will be measuring the regex | 5–8 |
| 5.3.4 | Register owner readers and section bindings per entity; prove a second entity | `atlas-entity-sections.md` bindings do not survive in the tree. F2 exit gate: BP **and** one non-BP entity work with no central-runtime edits | 8–15 |
| 5.3.5 | Broaden learning targets beyond record-summary terms | `learning-candidates.ts` rejects anything but `capabilityId !== "entity_read_record"`: "This workflow currently teaches record summary terms." Extend to field aliases, role meanings, capability bindings; add platform-global promotion rules | 5–10 |
| 5.3.6 | Make evaluation and lineage first-class in the contract | Record descriptor + semantic hash, resolver revision, model/embedding revision, policy revision, fixture revision per run. Held-out cases must never enter the runtime example index (WS1 1.7) | 3–5 |
| 5.3.7 | Operate drift honestly | Seed baselines, run the job, alert, and either act on it or remove the claim | 2–4 |

**Exit (G7):** on a held-out set bound to release hashes, over ≥2 entities, a reviewed correction
measurably improves selection on unseen wording after publication; unsupported intent is refused;
zero unauthorized disclosure in the acceptance suite.
**Effort:** ~35–65 engineer-days. **Deliberately last — it is downstream of WS1, WS2 and WS3.**

### WS6 — Migration and schema foundation

**Why:** onboarding a hundred entities only makes sense if a hundred schema changes can be applied
safely to existing databases.

| # | Task | Detail | Effort |
| --- | --- | --- | --- |
| 6.1 | Correct the migration guidance | `server/db/migrations/README.md:3-4` still states the three upgrade manifests "are intentionally comment-only"; they now contain 9 / 13 / 20 real entries. Documentation drift of exactly the kind that erodes earned credibility | 0.5 |
| 6.2 | Prove the forward-migration path | `runner-transactions.sha256` is empty; demonstrate an upgrade from a supported baseline against a disposable fixture, and record the receipt | 3–5 |
| 6.3 | Resolve `common/` vs `planes/<p>/` schema ambiguity | `document`, `master`, `control`, `snapshot` are authored in both; disambiguation is **convention only** (plane owns `00_schema.sql`, ordinals interleave). Zero collisions today — nothing prevents one tomorrow. Extend `three-plane-model.ts` duplicate detection beyond common-master and the authz stack | 3–5 |
| 6.4 | Resolve or formally allow the three-way near-duplicates | `document.conversation`, `document.multipart_upload(_part)`, `control.owner_type`/`_purpose`/`subscription_plan`, `snapshot.template_version` are near-duplicated across planes. Either promote to `common/` or record why they must diverge | 5–10 |
| 6.5 | Reconcile ADR Decision 2 with the schema | The ADR states Mesh-specific data "must not be stored in or read from Neon", yet NEON DDL defines `document.mesh_business_partner_acceptance(_event)` and `document.mesh_profile_change_case` (`planes/neon/document/03_tables.sql:4459,4488,5068`) — with generated Kysely types and **no hand-written service consumer**. These are plausibly Neon-owned *acceptance receipts* rather than Mesh authority data. **Either rename/re-home the tables, or amend the ADR and add a check.** Do not leave an Accepted ADR stating a boundary nothing enforces | 2–4 |
| 6.6 | Reconcile stale DDL generation guidance | AI DDL headers previously named a generator that did not exist; confirm remaining references resolve | 1–2 |

**Effort:** ~15–30 engineer-days.

---

## 4. Per-plane readiness checklists

Each plane is "foundation-ready" when its list is complete. These are the *plane-specific* slices
of WS0–WS6.

### STUDIO (authoring and publication authority)
- [ ] Lowering decision made and implemented or the descriptor narrowed (WS1 1.1)
- [ ] Permission-code derivation no longer BP-shaped (WS3 3.3)
- [ ] Entity-level semantic authoring replaces surface `layoutConfig.ai`; dual ownership ended (WS1 1.2)
- [ ] Published provider registry replaces the hardcoded catalogue (WS1 1.3)
- [ ] Learning inbox operates on the broadened target set with an independent evaluation harness (WS5 5.3.3, 5.3.5)
- [ ] Cross-plane review/approval reads are atomic per database and pinned by hash — or the residual risk is recorded (there is no atomic transaction across the three databases)
- [ ] `assertEntityAuthorizationEnforceable` covered by a startup assertion, not only activation (WS2 2.3)

### NEON (tenant business operations — the ERP)
- [ ] List scope is a registered resolver port; BP directory is the first registration (WS3 3.1)
- [ ] ERP transactional entities have an onboarding template and a first vertical slice approved (finance + supply chain)
- [ ] `mesh_*`-named relations either re-homed or covered by the amended ADR (WS6 6.5)
- [ ] 138 `document` tables reconciled against the entity contract surface — a written mapping of which tables become entities and in what order
- [ ] No `neon.business_partner.*` scope kinds remain in the shared repository

### MESH (partner-network collaboration)
- [ ] `verify-plane-boundaries.mjs` extended to `server/packages/planes/*` and the composition root (WS3 3.8)
- [ ] `network_relationship` joined by a second published entity, proving the MESH entity path
- [ ] BP profile-sync SQL (`mesh-external-reference-code.ts:10-24`) generalised or explicitly recorded as domain-specific
- [ ] Cross-plane provisioning transport actually constructed, or the disabled state recorded and surfaced (WS4 4.6)
- [ ] Mesh→Neon acceptance flow has an executable end-to-end test

### Atlas
- [ ] Graph composed, or Atlas explicitly not in the shipped profile (WS5 5.3.1)
- [ ] `AtlasToolAuthority` implemented; policy tables read at runtime (WS5 5.3.2)
- [ ] Independent held-out harness (WS5 5.3.3)
- [ ] Second entity with registered owner readers and section bindings (WS5 5.3.4)
- [ ] Learning targets broadened beyond `entity_read_record` (WS5 5.3.5)
- [ ] Drift either operable or removed from the claims (WS5 5.3.7)
- [ ] Whitepaper §13 reconciled with what is actually reachable

---

## 5. Sequencing, and the onboarding gate

### Phase 0 — Truth (WS0) · ~2–4 weeks
Nothing is measured until this closes. Fix the gate, land the tree, kill the build-output and
stub-package litter, refresh or retire stale evidence, triage the 19 failing checks.

**Do not start anything else in parallel beyond WS6 6.1–6.2 (documentation truth), which is free.**

### Phase 1 — Contract and enforcement (WS1 + WS2 + WS3) · ~6–12 weeks
These three are coupled and should run together, because each decides the other's shape:
- WS1 1.1 (lowering ceiling) determines what entities are expressible.
- WS2 2.1 (authorization backend) determines whether non-trivial entities are runnable.
- WS3 3.1 (scope resolver port) determines whether tenant-scoped entities are expressible.

**G3/G4/G6 must pass before Phase 2.**

### Phase 2 — Silent-failure elimination and migration hardening (WS4 + WS6) · ~4–8 weeks
Correctness debt and schema-change safety. This is what makes a hundred onboardings survivable
rather than a hundred incidents.

### Phase 3 — Atlas (WS5) · ~6–12 weeks
Deliberately last. Atlas is downstream of the contract and of compositional enforcement; building
it earlier means building against an interface that is still moving.

### The onboarding gate — an explicit recommendation

**Freeze tenant-owned business-entity onboarding at the current set until G3 and G4 pass.**

Permit, in the meantime:
- **read-only reference entities** — the proven path (Country), metadata-only, low risk;
- **operational fixes** to already-live entities;
- **framework work** (WS0–WS6).

Do **not** onboard a tenant-owned, writable, or masked-field entity before the authorization
backend and the lowering decision are settled. Reason: onboarding such an entity today either
cannot publish at all (fail-closed authorization) or requires a new entity-named branch in shared
code — and each such branch increases the cost of the cleanup you are trying to do now. **Every
week of onboarding before Phase 1 closes adds a bespoke branch that Phase 1 then has to undo.**

---

## 6. Definition of done — the frozen commit

The foundation is strong when this is true and recorded:

1. `ci-success` green on a frozen commit, with branch protection active and verified. (G1)
2. `git status --porcelain` empty; no build output on disk; no stub packages. (G2)
3. A tenant-owned entity with a relation, a write path and a masked field is onboarded from
   metadata with zero entity-specific code, enforced by policy. (G3)
4. A masked field is provably masked; a cross-plane request is denied; publication writes use a
   plane-scoped role. (G4)
5. Every registered capability reports readiness; an unenforceable published profile fails
   publication **and** startup. (G5)
6. A CI check rejects cross-plane imports under `server/packages/planes/*`. (G6)
7. A held-out evaluation over ≥2 entities shows a reviewed correction improving unseen wording
   after publication, with zero unauthorized disclosure. (G7)

Until then, maintain one honest number on the wall: **live onboarded entities**. Today it is
about five. It is the only figure that describes the state of the thesis.

---

## 7. What not to do

- **Do not onboard a hundred modules first and harden later.** Each module adds an entity-named
  branch; the cleanup cost grows with every one. This is the whole point of the plan.
- **Do not build Atlas before the contract is stable.** The agent reads the contract; a moving
  contract means rebuilding the agent.
- **Do not add a capability without a startup assertion.** The dominant defect pattern here is the
  inert control. Wire it or delete it — never ship it documented-but-uninstalled.
- **Do not accept "documented" as "enforced" in any status report.** For every claim, name the
  command that proves it and the commit it ran against.
- **Do not let the placeholder surface stand.** "«Module» is ready for published entity experiences"
  for 108 modules is precisely the pattern the repository's own instructions prohibit.
- **Do not promise autonomous self-learning.** Give the governed CDSL loop instead; it is
  defensible, auditable, and it actually compounds.

---

## 8. Effort summary

| Workstream | Effort (engineer-days, rough) | Gate |
| --- | --- | --- |
| WS0 Truth and hygiene | 15–30 | G1, G2 |
| WS1 Contract completeness | 30–55 | G3 |
| WS2 Enforcement installation | 20–40 (≈6 if narrowing) | G4 |
| WS3 Genericity | 30–45 | G3, G6 |
| WS4 Silent-failure elimination | 20–35 | G5 |
| WS5 Atlas / CDSL | 35–65 | G7 |
| WS6 Migration foundation | 15–30 | — |
| **Total** | **≈165–300 engineer-days** | |

The cheapest decisions with the largest effect are **WS1 1.1** (lowering ceiling) and
**WS2 2.1/2.4** (enforce or narrow). Each is a *decision* that can shrink the programme by weeks,
because narrowing a contract is a legitimate engineering answer and is far cheaper than
implementing an unused capability surface.

### The first two weeks

1. WS0 0.1, 0.2, 0.3 — three small fixes that make the gate able to speak.
2. WS0 0.5 — land or revert the dirty tree so reviews describe a commit.
3. WS1 1.1 and WS2 2.1/2.4 — bring the three "enforce or narrow" decisions to the owner with a
   written recommendation and cost for each option.
4. WS3 3.8 — add the entity-literal and cross-plane import guard. It is cheap, it is permanent,
   and from that day every new bespoke branch is visible the moment it is written.

That fourth item is the highest-leverage change in this plan: it converts the cleanup from a
one-time effort into a standing property.
