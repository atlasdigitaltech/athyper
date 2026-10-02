# Meta Entity as the Semantic Substrate — contract design for contract-driven AI

**Status:** **revision 4**. Subordinate design specification for contract shape.
**Controlling plan:** [foundation-cleanup-plan.md](foundation-cleanup-plan.md) (Foundation Roadmap).
It controls scope, sequencing and gates; this document controls contract design and **must not add
phases or gates**.
**Inspection context — not a reproducibly pinned source snapshot:** reviewed at HEAD `0fedc0e97`
with a dirty, concurrently edited working tree (366 changed paths at inspection). These values do
**not** identify the changed file contents. Every material claim carries an evidence label (§7).
**Revision history:** r1 initial → r2 corrected composition and evaluation claims → r3 corrected the
authorization baseline → r4 reconciles with the controlling roadmap, corrects locale evidence,
narrows the compiler finding, and specifies the registry, scope, readiness and isolation contracts.

---

## Corrections in revision 4

| # | Prior claim | Disposition | Correction |
| --- | --- | --- | --- |
| 1 | "Publish what installed owners support **per release**" | **Wrong** | Use three distinct concepts: **release requirements**, **deployment support**, **effective availability** (§4.1). A release cannot attest a deployment's future installation. |
| 2 | "Block unsupported features at authoring" | **Wrong** | Studio may allow a **draft** containing currently unsupported features with explicit validation errors; **publication or activation** rejects an unsupported target (§4.1). |
| 3 | "Register existing scope behaviour first" stated as a shape | **Insufficient** | Requires a security and execution contract, including scope-substitution resistance as the decisive acceptance test (§4.4). |
| 4 | "`lowerNativeRuntimePublication` rejection means no flow or relational support" | **Narrowed** | It is the **single-storage lowering path**. Flows have an existing projection path (`metadata.entity_flow` → `intakeFlows`). A support matrix is required before extending (§6). |
| 5 | New semantic/profile/binding **tables** | **Still proposed — not approved** | `definition.ai` is authoritative and `graph-builder` **projects** it into `layoutConfig.ai`. A projection is not a second authority. Schema is added only where the existing model cannot express required governance (§3.6). |
| 6 | NFKC as locale evidence | **Superseded** | The stronger evidence is the `locale: "en"` contract restriction and explicit `toLocaleLowerCase("en-US")` at `entity-ai.ts:373` and `entity-section-tool-selection.ts:14` (§3.1). |
| 7 | Semantic hash as cache key | **Wrong** | A semantic hash is not a sufficient cache key for authorized capability discovery (§3.5). |
| 8 | "Generate an enforcement report that proves enforcement" | **Rejected** | A static report lists registration sites, predicates, call sites and tests; it cannot infer configuration reachability, authorization correctness or deployment behaviour (§8). |
| 9 | Evaluation acceptance | **Insufficient** | Requires exact specification of coverage, expected capability ids, ordering, thresholds, nondeterminism, provenance and attempt policy (§2). |

---

## 1. Authorization baseline

**The host installs a bounded published-profile authorizer.** `register-services.ts` calls
`createPublishedTenantRecordAuthorizer({ ownerAccess: true, ownerAuthority:
createPublishedOwnerAdministrationAuthorizer(...), authority: observeAuthority(baseAuthorizer),
metadata, refreshContext, exists })`. *[working tree]*

- `usesEntityBackendAuthorization` (`entity-backend-authorizer.ts:437-458`) reads
  `enforcedEntityProfile?.()`. With no supplied rollout backend that is `undefined`, and it then
  **returns `true` when `entityDescriptorSupported(descriptor)` accepts the descriptor**; it throws
  `ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE` when a profile is present but unsupported; it returns
  `false` when there is no profile at all.
- `entityDescriptorSupported` is bound to the closed registry — `tenantRecordProfileSupported`, or
  `ownerRecordProfileSupported` under `ownerAccess: true` (`published-tenant-authorizer.ts:190`).
- The registry admits **`plain` and `masked`** representations, bounded
  `list/read/create/patch/export` operations, tenant-scoped storage or an explicitly published shared
  reference, optional owner access, and matched runtime bindings. Anything outside is refused.
- `enforced` is `usesEntityBackendAuthorization(...)` at `query-service.ts:79` (list) and `:410`
  (detail), gating `projectAuthorizedRecordFields(descriptor, data, enforced)` at `:387`/`:478`,
  which replaces masked values with `••••`.
- `masked-disclosure.test.ts:173` asserts `"••••"` for list and detail, and a parameterised suite
  denies masked **query inference** before SQL for filter, sort, group and search.

**Statement.** Supported profiles receive enforcement, including masked representations and
query-inference denial; unsupported profiles fail closed. Explicit **rollout** backend suppliers
(`entityBackends`, `entityCaseBackendAuthorization`) remain absent — that concerns shadow/rollout
comparison, not whether enforcement is installed. Publication and deployed runtime qualification for
a specific entity are established separately.

**The unit of verification is the boundary set, not one predicate:**

| # | Boundary | Concern |
| --- | --- | --- |
| 1 | Profile acceptance | The closed registry admits only what the deployment can enforce |
| 2 | Activation | An unenforceable profile is refused before it becomes the head |
| 3 | Record admission | Operation permission, tenant and scope containment |
| 4 | Query restriction | Masked fields cannot be used for filter, sort, group or search inference |
| 5 | DTO projection | Masked values are transformed, never emitted raw |
| 6 | Export | The same projection applies to list-backed export |
| 7 | Replay | Saved evidence is reauthorized under current access |

---

## 2. Evaluation requirements

An evaluation must exercise the implementation under test. Independence belongs in expectations,
fixtures, scoring and approval.

**Known defect.** `learning-evaluation.ts:12` requires, when a baseline is supplied, `before !==
"read"` for a positive fixture. It therefore **cannot admit a preservation case** where baseline and
candidate both correctly return `read`; it **can** catch a `delegate → read` regression through its
negative fixtures; and every positive fixture is forced to be an **improvement case**. The
requirement is to **separate improvement scoring from regression protection** — not merely to delete
the clause.

### 2.1 Fixture purpose is a separate axis from expected output

| Purpose | Required behaviour |
| --- | --- |
| **Correction** | Baseline demonstrates the targeted failure; candidate satisfies the expected result |
| **Preservation** | Baseline and candidate both satisfy the expected result |
| **Safety** | Candidate satisfies the denial, clarification or non-disclosure invariant; a baseline failure must not excuse it |

### 2.2 Production discovery, without flattening context or authorization

Do not substitute a synthetic six-tool harness for the synthetic one-tool harness. Country declares
six providers that are **not equivalent competitors in every context**: `entity_lookup` is
`manage`-context; the other five are `record`-context (`entity-ai.ts:41` onward). Fixtures must vary
manage vs record context; installed vs unavailable capabilities; current entity, record, tenant and
descriptor; authorized vs denied principals; and competing meanings among **admitted** tools.

### 2.3 Resolution expectations are separate from execution expectations

The resolver yields `read | clarify | delegate` (`structured-intent.ts:21,34,41`); denial is
constructed at the admission/execution boundary. Therefore wrong capability is a **scored mismatch
against expected capability ids**, not a new intent kind, and `delegate` does **not** mean the
request is unsupported.

### 2.4 Exact specification required

| Item | Requirement |
| --- | --- |
| Fixture groups and minimum coverage | Declared per purpose; coverage counts recorded |
| Expected capability ids and arguments | Exact ids; **bounded** arguments; unspecified arguments fail |
| Capability ordering | Declared significant or insignificant; asserted accordingly |
| Clarification and delegation | Permitted behaviours stated explicitly per fixture |
| Thresholds | Improvement thresholds **separate** from hard safety failures |
| Nondeterminism | Model-path results handled by stated policy, not by loosening assertions |
| Provenance and attempts | Fixture version and hash, author, approver, candidate hash, scoring revision, attempt policy |

**Hard rule:** an aggregate improvement score must **never** compensate for a disclosure failure.

### 2.5 Independently controlled expectations

A hash proves content identity, not when expectations were written or whether the candidate author saw
them. Use two complementary sets: a **versioned regression benchmark** frozen before candidate
development, and **correction-specific cases** independently authored and locked before evaluation.

This requires workflow and persistence changes, not an evaluator change: `stage()` accepts fixtures
with the staging request (`learning-inbox.ts:196`, parsed by `parseLearningFixtures` at `:487`).

### 2.6 Qualification binds the published artifact

The receipt must bind candidate, source, fixture set, evaluator revision and resulting artifact.
Qualification must prove the evaluated candidate **is the one published and activated** — not that an
evaluator passed before a later release was created. Also exercise concurrent candidate edits,
stale-source publication, rejected approval, and runtime readback after activation.

Contract requirements above are implemented by roadmap deliverables **D1–D3**.

---

## 3. Contract design (L1–L4)

| Layer | Question | Where it lives | State |
| --- | --- | --- | --- |
| **L1 Structure** | What exists and where | `storage`, `fields`, `operations`, `lifecycle`, `aggregate` | Strong |
| **L2 Authorization** | Who may see or do what | `authorization`, `authorizationRuntime`, `fieldPolicies`, `ownership`, `directoryScope` | Partially enforced; see §1 |
| **L3 Semantics** | What it means in business language | `ai.aliases`, `ai.description`, `ai.vocabulary` | Under-specified — the real gap |
| **L4 Capability** | What Atlas may attempt, with what evidence | `ai.insightProviders`, `ai.actions`, capability bindings | Strong, now generic |

### 3.1 Locale — evidence and specification

Evidence: the `locale: "en"` literal in `EntityAiVocabularyV1`; explicit
`toLocaleLowerCase("en-US")` in the phrase normalizer (`entity-ai.ts:373`) and tool selection
(`entity-section-tool-selection.ts:14`); and a synthesized `locale: "en"` page context at
`learning-evaluation.ts:8`. NFKC normalization alone is not evidence of English-only behaviour, and
`atlas-exact-terms/4.0` is an opaque identifier.

Specify: canonical BCP-47 tags; supported locale set; fallback chains and precedence; normalization
version; collision handling; cross-locale ambiguity; similarity matching **separately gated until
evaluated** and never a silent fallback.

### 3.2 Typed semantic targets — with executable meaning

`{ kind: "role", roleCode: "supplier" }` is safe **only** if a published, server-enforced
interpretation of that role exists; otherwise `"vendor"` degrades into an unrestricted query.

```ts
export type EntitySemanticTargetV1 =
  | { kind: "entity";       entityCode: string }
  | { kind: "role";         entityCode: string; roleCode: string }   // requires an owner contract
  | { kind: "field";        fieldKey: string }
  | { kind: "relationship"; relationshipKey: string }
  | { kind: "enum_value";   fieldKey: string; value: string }
  | { kind: "capability";   capabilityId: string; capabilityVersion: 1 };
```

Before broadening targets, specify: entity and release context for every reference; a **generic owner
contract for role-qualified queries** (a role target refuses to compile without one); behaviour when
a referenced target disappears or changes; **authorization filtering before semantic discovery and
again before execution**; and distinct outcomes for ambiguity, unsupported meaning and denied access.

### 3.3 Example split

Retrieval examples and held-out cases separated structurally, with held-out cases excluded from the
runtime example index **by the compiler**, not by convention.

### 3.4 Hashing

`contractHash = sha256(graph)` already covers vocabulary, and stale corrections are already refused
(`applyLearningCorrection`). A `semanticHash` therefore serves **attribution, caching and
compatibility**. The aggregate hash alone cannot tell a reviewer which kind of change was evaluated;
a retained graph diff can. Specify hash inputs and canonicalization version; which collections are
order-insensitive and which are not (`summaryFieldKeys` display order is explicitly semantic);
cross-layer compatibility and atomic activation rules; and whether evaluation receipts invalidate
after a source change (recommended: yes, bound to the composite hash).

### 3.5 Semantic isolation and cache invalidation

Required rules for platform defaults vs tenant overrides; locale fallback; conflicting meanings;
platform promotion; target release compatibility; and authorization-filtered discovery.

**Cache rule.** A semantic hash is **not a sufficient cache key** for authorized capability
discovery. Any cache must account for tenant, plane, context, publication, installation and
authorization changes — or **reauthorize at the boundary**.

### 3.6 Semantic authoring authority

- **Authoritative input:** `definition.ai` in product metadata.
- **Transformation:** `graph-builder.ts:307` projects it into surface `layoutConfig.ai`.
- **Permitted edit path:** the definition. The surface projection is derived and not independently
  editable.
- **Round-trip:** the projection must be reproducible from the definition; divergence is a defect.

An internal projection does not create a second authority. **Independently editable representations
with conflicting precedence would.** New semantic/profile/binding tables remain **proposed, not
approved**: add schema only where the existing model cannot express the required governance,
otherwise new tables recreate the duplication this work exists to remove.

---

## 4. Foundation interfaces

### 4.1 Release requirements, deployment support, effective availability

| Concept | Content | Lifecycle |
| --- | --- | --- |
| **Release requirements** | Capability ids and compatible versions the entity requires; context requirements; compiler constraints; **required vs optional** declaration per capability | Immutable, release-bound. **May include qualification evidence for a named deployment snapshot, but cannot guarantee that deployment's future readiness** |
| **Deployment support** | Installed implementations and their qualification evidence, for a deployment + configuration revision | Mutable, deployment-bound; **references immutable receipts** |
| **Effective availability** | Requirements satisfied under the current deployment, context and authorization | Per request; **always fails closed** |

**Qualification receipts are immutable; deployment support is a pointer.** Record each receipt
against the release/artifact hash, deployment and configuration revision, adapter versions,
qualification results and timestamp. The deployment's **current** support record *references* the
applicable receipt rather than replacing it, so history is preserved without treating an old
qualification as current readiness. Adapter removal, configuration change, or an incompatible
release **triggers reassessment**.

**Optional versus required.** An optional capability that is unavailable must **disappear from
discovery**; a missing **required** capability must **block the relevant activation or operation**.
Request authorization remains mandatory regardless of qualification — a valid receipt never
substitutes for a per-request authorization decision.

**Draft vs activation.** Studio may allow a **draft** containing currently unsupported features with
explicit validation errors; **publication or activation** rejects an unsupported target. Blocking all
such authoring would prevent development ahead of deployment.

### 4.2 Capability profiles, not a ladder

A read-only entity may also be tenant-scoped, relational and field-policied; a governed entity need
not use every materialization feature. Use versioned **capability requirements** plus optional
**named presets**, with the envelope **derived** from declared requirements, compiler support,
installed owners and conformance results. The onboarding checklist remains and is automated; a
preset does not replace it.

### 4.3 Seams — deferred

Do not commit to physical decomposition into independently versioned sections before the need is
demonstrated. First define **canonical projections and component hashes within the existing release
format**; specify capability ownership and hashing rules; separate only when independently managed
artifacts have a demonstrated requirement.

### 4.4 Scope contract (security and execution, not just a registry shape)

`{ scopeKind, resolverId, resolverVersion, parameters, admission }` is a starting point. The resolver
contract must also specify:

- trusted **server** inputs vs user-supplied selectors;
- parameter validation and allowed parameter types;
- parent-record authorization **before** child disclosure;
- intersection with tenant and user filters;
- application to rows, counts, aggregates, search, export and background work;
- transaction and authorization-refresh requirements;
- failure behaviour for missing or incompatible resolvers.

**Decisive acceptance test — scope-substitution resistance:** changing a parent, tenant, filter,
cursor or export payload must not broaden access.

**Order of work:** register **existing** scope behaviour first and preserve its semantics, then
demonstrate a second entity using the same shared path. Avoid replacing a switch with an unrestricted
extension mechanism.

### 4.5 Readiness operations

Readiness dimensions are **independent predicates, not mutually exclusive states**: a capability can
be declared, installed, required and admitted simultaneously. Operational rules required:

| Question | Requirement |
| --- | --- |
| Target deployment identity | Names the deployment + configuration revision expected to serve requests |
| Support-evidence validity | Stated period and invalidation conditions |
| Rolling deployment | Defined behaviour with mixed adapter versions |
| Adapter removal | Whether a required adapter may be removed while active releases depend on it |
| Refresh failure | Behaviour when support evidence cannot be refreshed |
| Failure isolation | Optional capability failures must not break unrelated Entity reads |

One shared evaluator, called from startup, activation, configuration change and admission. A
successful **publication-worker** check is not proof that every API instance can serve the release.
**Readiness reports availability; it never grants access.** Request authorization remains
authoritative even when readiness is green.

### 4.6 Capability registry — questions that must be answered first

| Question | Required answer |
| --- | --- |
| Who may register a capability? | Named trusted composition inputs only |
| Duplicate id/version | Deterministic rejection or precedence; never silent override |
| Schema identification | Input, output and evidence schemas identified per capability |
| Reproducible resolution | Exact manifest revision resolved at compile time |
| Historical versions | Which versions remain supported for published descriptors |
| Owner dependencies | How required owner adapters are declared and verified |
| Conformance verification | Who verifies a claimed conformance result, and against what |

**Manifests are trusted composition inputs, not executable material supplied by entity metadata.**
Metadata selects an approved registration; it cannot choose an arbitrary module, URL, SQL handler or
credential. Preserve old capability ids and result interpretation until published and conversation
consumers are migrated; historical compatibility still runs under **current** authorization.

---

### 4.7 Initial D5 integration contracts

These are interface specifications, not claims that deployment readiness or policy-table
consumption is installed. Extend the existing `AtlasToolManifest`, `AtlasToolAuthority`, and
Entity owner ports; do not introduce a second tool or Records stack.

| Boundary | Inputs and output | Invariant |
| --- | --- | --- |
| Trusted registry resolution | Exact capability id/version and target plane → installed manifest plus canonical manifest hash | Duplicate registrations fail; metadata never selects executable modules or credentials. Preserve existing ids during migration. |
| Deployment support lookup | Deployment id, configuration revision, plane, release artifact hash → immutable qualification receipt reference and current support revision | Lookup is scoped to the serving deployment; a publication-worker registration is insufficient. |
| Readiness evaluation | Published required/optional references plus current deployment support → available ids and reason-coded unavailable requirements | Missing required support blocks the relevant activation/operation; missing optional support excludes discovery. No principal authorization grant is returned. |
| Tool authority | Existing verified context, manifest, preview/execute phase → current policy decision and revision | Entity owner denial cannot be overridden; preview approval does not authorize later execution. Confidence can require clarification, never grant permission. |
| Controlled evaluation fixtures | Server-resolved immutable fixture-set id → fixtures, content hash, author/approver identities, lock time | Caller-authored arrays remain labelled reviewer-submitted. Only a trusted provider may attest independently controlled fixtures. |
| Scope binding | Validated metadata binding plus server-derived tenant/parent coordinates → bounded owner scope | Intersect user selectors with locked scope; never replace server coordinates. Apply to rows, totals, export and replay. |

Qualification receipts remain outside the descriptor they identify, avoiding a self-referential
artifact hash. Support lookup failure, stale configuration, missing implementation and incompatible
version must have distinct diagnostics; all remain non-authorizing. Adapter removal and a changed
publication/configuration revision invalidate the applicable current-support pointer.

Implement registry/compatibility, scope, readiness, semantic edit authority, and policy consumption
as separate increments under D5. Existing rollout and request authorization remain mandatory.
The Studio host now composes `createPublishedLearningFixtureProvider`. Its reference is
`<metadata.entity_release UUID>/<contract-test key>`. It reads the immutable contract revision
through the existing Entity authoring publication path, within the requesting tenant, and requires
an independently approved, published change set. It verifies both canonical or database-recomputed
legacy JSONB integrity, matching release/revision hashes, approval chronology, entity and origin
plane. Author and approver identities come from the published change set, never the request.
This initial provider requires saved draft history and rejects sources with saved graph revisions
by another actor: a change-set creator alone is insufficient authorship evidence. Multi-author
fixture stewardship needs a richer contributor contract before it can qualify.
The learning receipt additionally separates both fixture custodians from the correction proposer
and evaluator reviewer. The provider does not certify benchmark coverage or human independence
beyond the recorded identities.

A fixture declaration uses the existing authoring-only contract tests collection:

```json
{
  "key": "record-summary-v1",
  "assertion": "learning_fixture_set",
  "path": "entity",
  "expected": {
    "schema": "atlas-learning-fixtures/1",
    "entityCode": "country",
    "originPlane": "neon",
    "fixtures": [
      {"question": "Show this nation snapshot", "expected": "read", "purpose": "correction"},
      {"question": "Show this summary", "expected": "read", "purpose": "preservation"},
      {"question": "Delete this country", "expected": "delegate", "purpose": "safety"}
    ]
  }
}
```

This example illustrates the declaration shape; it is not a qualified Country benchmark.
Ordinary contract testing validates the declaration, not its predictive performance. The tests
collection is excluded from the runtime descriptor, so held-out questions do not become vocabulary
or inference retrieval examples. Publish the declaration through ordinary Entity submission,
independent approval and publication, then select its reference in the existing Studio inbox.
Caller-authored questions remain available and explicitly reviewer-submitted.

Every authorized evaluation attempt commits a `started` record before fixture resolution. Draft
creation and successful evidence commit together; failed evidence commits after the draft
transaction rolls back. A crash remains `started`, never a fabricated failure or success. The
append-only, tenant-scoped ledger records bounded hashes, counts, evaluator/source identities and
reason codes without raw questions, result text or exception messages. Existing inbox responses
include total attempts and the latest 20; earlier records remain durable. A fresh-draft retry keeps
its own attempt identity and still requires independent release approval.

---

## 5. Catalogue migration

Nine `bp_*` entries remain pinned to `business_partner`/`neon` in a **contract** file while generic
entries use `entityCode: "*"`. **A domain-specific capability id is not itself the defect; hardcoding
its registration into the shared contract is.** Sequence: inventory (published descriptors, saved
tool evidence and conversations, metadata references, compatibility tests) → introduce adapter
manifests → retain equivalent registrations → migrate consumers → remove obsolete entries only after
verification. Preserve existing behaviour.

---

## 6. Compiler support matrix

`lowerNativeRuntimePublication` rejects `relations`, `flows`, `flowSteps`, `materializationBindings`,
`materializationFieldMappings` and `changeCaseBindings` **in its single-storage lowering path**. This
does not establish that the framework has no flow or relational support: flows already project
through `metadata.entity_flow` → `intakeFlows` on the runtime descriptor
([entity-intake.md](entity-intake.md)).

Before choosing "implement everything" or "narrow the whole descriptor", build:

| Authoring feature | Compiler path | Artifact | Runtime consumer | Qualification status |
| --- | --- | --- | --- | --- |

Then extend **only** the path the next approved onboarding needs. A blanket estimate covering
relations, workflows, materialization and change cases is not defensible without decomposing their
semantics. This is roadmap deliverable **D6**.

---

## 7. Evidence register

| Claim | Scope | Source identity | Verification |
| --- | --- | --- | --- |
| Published-profile authorizer installed with owner support | working tree | `createPublishedTenantRecordAuthorizer({ownerAccess:true,…})` | Static inspection |
| Supported profiles include masked representations | working tree | closed registry admits `["plain","masked"]` | Static inspection |
| Masked list/detail reads exercised | working tree | `masked-disclosure.test.ts:173` + query-inference denial suite | Test present; **not executed** |
| Preservation case cannot pass | working tree | `learning-evaluation.ts:12` baseline clause | Static inspection |
| `delegate → read` regression detectable | working tree | same clause, negative branch | Static inspection |
| Resolver yields `read \| clarify \| delegate` only | working tree | `structured-intent.ts:21,34,41` | Static inspection |
| Locale normalization is English-bound | working tree | `toLocaleLowerCase("en-US")` at two sites | Static inspection |
| Staging accepts fixtures with the request | working tree | `learning-inbox.ts:196`, `parseLearningFixtures` `:487` | Static inspection |
| `contractHash = sha256(graph)`; stale corrections refused | working tree | `deterministic.ts`; `applyLearningCorrection` | Static inspection |
| Flow projection path exists | committed | `entity-intake.md`; native runtime projection | Documentation claim |
| Country Atlas journeys pass | **reported** runtime | `country-meta-entity-atlas-20260930.md` | Not re-verified. Reported passing for the deployment and source identified in that report; current-checkout reproducibility and current deployment behaviour have **not** been requalified |

**Not established by this review:** no tests were executed, no live publication or activation head
was read, and no DEV journey was repeated.

---

## 8. What this document does not claim

- It does **not** claim that a generated boundary report proves enforcement. A static report can list
  registration sites, profile predicates, call sites and associated tests; it cannot infer
  configuration reachability, authorization correctness, test adequacy or deployment behaviour.
  Generate it from **explicit registrations** and **executed qualification receipts**, and label each
  item `discovered → registered → exercised → passed → deployed`. An existing test is never rendered
  as a passed test.
- It does **not** claim cross-plane activation is atomic. Report per-plane state.
- It does **not** claim readiness implies authorization.
- It does **not** claim a release can guarantee a deployment's future installation.

---

## 9. The one-sentence version

**Make the Meta Entity contract the versioned, hash-addressable substrate for meaning as well as
structure, and keep the three concepts separate — what a release requires, what a deployment
supports, and what a request is authorized to do — so that semantic learning is a governed release
process and Atlas's promise per entity is a published requirement validated against separately
evidenced deployment support.**

### Compiler manifest-binding implementation — 2026-10-02

The shared runtime artifact compiler now supports compiler-owned `aiManifestBindings`
(`entity-ai-manifest-bindings/1`) alongside the projected `ai` declaration. The standard host installs
`CompiledEntityRegistry.resolveAiToolManifest`, selecting exact trusted Entity tool id/version/plane
identities from the same manifest builders as the serving factories. Bindings contain manifest,
input-schema and result-schema SHA-256 values and enter the signed runtime-member hash. Authoring
cannot supply these pins. `definition.ai` and its graph projection remain the semantic authority;
manifest builders remain trusted composition inputs, not another metadata authoring source.

Signing/dispatch qualification checks the pins against current trusted composition. Serving
registration compatibility filters discovery and is rechecked before Entity owner reads. Existing
historical descriptors without bindings retain current authorization behavior. Legacy compiler
composition without the optional resolver retains its wire shape; standard host compilation installs
it. These checks establish content compatibility, not executable-code identity, owner conformance,
deployment readiness or principal authorization. Required/optional support receipts and the
Principal-parent scope interface remain subsequent D5 work. See controlling roadmap §14 for executed
checks and remaining acceptance boundaries.

### Principal-parent scope implementation — 2026-10-02

The shared Entity runtime now carries an explicit parent selector into Atlas business context.
The selector contains only parent entity, record and relationship identities. Server resolution
derives the locked relationship constraints, pins the current parent descriptor hash and uses the
existing Records owner authorization before scoped child discovery/reads/exports. The model cannot
provide or substitute the internal binding. Revalidation checks current parent publication and
authorization. Embedded child lists narrow only their matching open parent record context.

Table-product `definition.ai` is now projected by the standard compiler with a single-authority
check. Principal release 4 and Notification Preference release 3 now exercise this path with authenticated
publication and activation on Studio, Neon and Mesh; Profile remains unenrolled. A live Neon
Principal summary executed the authorized reader and durable citation/readback path. Exact-ID reads
use standard Records selection independently of user filter controls. Parent-scoped model acceptance,
nonempty child isolation and deployment support remain separate receipts. Live embedded Manage
context and scoped discovery executed, but its model phase and the field-reader live run encountered
abandoned inference admission. See controlling roadmap §15 for receipts and limits.
