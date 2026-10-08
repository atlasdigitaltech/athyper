# Platform X (Java + Oracle) → Athyper migration feasibility

**Assessment only • 8 October 2026.** Feasibility analysis, not a plan, not design
authority and not a commitment. The Entity Studio blueprint remains the sole design
authority. Nothing here approves scope, a capability or a gate.

---

## 0. Verdict

| Question                                    | Answer                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Can we export Platform X's DDL model?       | **Yes** — mechanical, tooling exists                                                                                                                         |
| Can we convert it into Athyper Meta Entity? | **Partly** — ~60–70 % structural is automatable; identity, labels, navigation, authorization and classification are human decisions _by design_              |
| Can we sync back to DDL and publish?        | **Yes** — that path already exists and works                                                                                                                 |
| Can we migrate the data?                    | **Yes, but** Athyper's record identity is **UUID-only**, so every PK/FK must be remapped. This is the single biggest technical risk                          |
| Can Platform X then run on Athyper?         | **Depends entirely on how much business logic it has.** Forms-over-tables → plausible. A Java service product → the logic is a **rewrite**, not a conversion |

**Headline: the DDL half is largely solved and already designed in the blueprint.
The business-logic half is the real cost, and it is not a conversion problem.**

---

## 1. The good news — Athyper already specifies this path

This is not a new subsystem. The blueprint designs it in three places:

| Design element                      | Blueprint reference | What it gives you                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F2 — physical storage catalogue** | §7.9                | "Approved per-plane DDL catalogue generated alongside Kysely types" with exact hash pin, missing/stale rejection, rebind/diff and incompatible type/nullability findings                                                                                                                                        |
| **Catalogue content**               | §7.3.1              | "plane, schema, object, **columns with SQL type/nullability/length/precision/scale/domain**" + content hash, generated **from the approved DDL by the same path that generates the Kysely types**                                                                                                               |
| **Priority 5 — starter drafts**     | §7.9.2              | "Constraint-enriched storage catalogue and **explicitly accepted starter drafts** … **Propose typed mappings from approved facts, retain unsupported constraints as diagnostics, and require author acceptance.** Unresolved required decisions block publication; incomplete drafts remain visibly incomplete" |
| **Starter-draft rules**             | §7.9.3              | "propose fields/keys/search/surfaces, **prompt for readable identity and navigation**, validate, then persist an ordinary typed draft. **Do not assume the first field is identity, auto-publish, create physical columns or copy reviews**"                                                                    |

The existing introspection pipeline (`prisma db pull` → `.prisma` → Kysely types)
is the DDL-reading mechanism that already feeds this.

**So the architecture anticipates exactly your scenario.** Equally important: the
blueprint's own wording — _"DDL types alone do not define readable identity,
navigation, supported controls or authorization intent"_ — is precisely the limit
you will hit.

---

## 2. Stage-by-stage feasibility

### Stage 1 — Export Oracle DDL · **EASY**

`DBMS_METADATA.GET_DDL`, Data Pump `expdp`, or `Liquibase generateChangeLog` /
Ora2Pg / SchemaCrawler.

**But DDL is not a semantic model.** It gives tables, columns, constraints, indexes,
FKs — and nothing about meaning.

### Stage 2 — Oracle DDL → Athyper storage catalogue · **MECHANICAL, ~70 %**

| Oracle                                          | PostgreSQL             | Athyper                               | Trap                                                                              |
| ----------------------------------------------- | ---------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| `DATE`                                          | `timestamp`            | `datetime` + `temporalKind`           | ⚠️ **Oracle `DATE` includes time.** Mapping it to `date` loses the time component |
| `TIMESTAMP WITH TIME ZONE`                      | `timestamptz`          | `datetime`                            | timezone semantics differ                                                         |
| `NUMBER(p,s)`                                   | `numeric(p,s)`         | `decimal` / `money`                   | money needs `currencyFieldId` XOR `currencyCode`                                  |
| `NUMBER(p)`                                     | `numeric` / `bigint`   | `bigint` (if p≤18) or `decimal`       | precision loss risk above 18 digits                                               |
| `NUMBER(1)` 0/1 or `VARCHAR2(1)` 'Y'/'N'        | `boolean`              | `boolean`                             | needs an explicit conversion decision                                             |
| `VARCHAR2(n)`                                   | `varchar(n)`           | `string` + `maxLength`                | Oracle counts **bytes** by default, PG counts characters                          |
| `CHAR(n)`                                       | `bpchar`               | `string`                              | blank-padded; trim semantics must be declared                                     |
| `CLOB` / `NCLOB`                                | `text`                 | `text`                                | —                                                                                 |
| `BLOB` / `BFILE`                                | `bytea` / object store | **attachment provider**, not a scalar | Blueprint: blobs are files, not fields                                            |
| `RAW(16)` GUID                                  | `uuid`                 | `uuid`                                | verify it is a true GUID, not opaque bytes                                        |
| `ROWID`, `ROWNUM`, `ORA_ROWSCN`                 | —                      | **exclude**                           | internal Oracle artifacts                                                         |
| `XMLTYPE`                                       | `xml`                  | `json`/structured                     | needs a pinned schema (blueprint: no property bag)                                |
| `INTERVAL`, `SDO_GEOMETRY`, Oracle object types | —                      | **unsupported → diagnostic**          | report, never silently drop                                                       |
| Sequence + trigger PK                           | `gen_random_uuid()`    | `keyGeneration: database_uuidv7`      | **identity changes** — see Stage 5                                                |

**Must be reported as unsupported, never dropped** (Athyper's rule: _"Report
unsupported paths; never silently drop them"_):

- **PL/SQL packages and triggers carrying logic** — this is application code
- **Oracle VPD / `DBMS_RLS`** — Oracle's RLS equivalent, but _code-based policy_;
  it cannot be converted into Athyper's declarative RLS and must be re-authored
- **Materialized views, synonyms, partitions, Oracle Text indexes, Advanced
  Queuing, Flashback** — no Athyper authoring equivalent

### Stage 3 — Catalogue → starter draft · **AUTOMATABLE + HUMAN REVIEW**

This is where the blueprint's Priority 5 design pays off:

| Aspect                                          | Automatable?                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tables, columns, types, nullability             | **~95 %**                                                                            |
| PK / FK / unique / index                        | **~85 %**                                                                            |
| CHECK constraints → typed validation            | **~40 %** — arbitrary SQL `CHECK` is explicitly _not_ inferred as a UI enum          |
| Enum domains from CHECK / lookup tables         | **~50 %**                                                                            |
| **Readable identity / title field**             | **0 % — human decision** (blueprint: "do not assume the first field is identity")    |
| **Navigation groups / sections / list columns** | **0 % — human decision**                                                             |
| **Labels and translations**                     | **~0 %** — Oracle stores none; Platform X's labels live in **Java resource bundles** |
| **Authorization intent**                        | **0 %** — Oracle grants/roles ≠ published permission codes                           |
| **`dataClassification`, `retentionPolicyCode`** | **0 %** — no Oracle equivalent; must be authored                                     |
| **Business logic**                              | **0 % — rewrite**                                                                    |

**Realistic split: ~60–70 % structural, ~0 % semantic.** That is not a tooling
failure — it is the design. DDL cannot carry meaning.

### Stage 4 — Athyper → DDL + publish · **ALREADY WORKS**

Contract → generated DDL (`reference-member-ddl.ts` emits tables, FKs, indexes,
guards, `FORCE ROW LEVEL SECURITY`, grants, policies) → manifest build /
checksum-pinned forward migration → release → artifact → deployment → activation.

⚠️ **You get PostgreSQL DDL in Athyper's normalised shape** — not Oracle DDL, and
not Platform X's original shape.

### Stage 5 — Data migration · **FEASIBLE; identity remap is the crux**

**The pivotal finding: Athyper's record identity is UUID-only.**

```
keyGeneration: "none" | "database_uuidv7" | "provided"
validation:  if (keyGeneration !== "none" && dataType !== "uuid") → FAIL
             NORMALIZED_CORE_KEY_GENERATION_INVALID
```

So Platform X's **numeric sequence PK cannot be Athyper's record key**. The old ID
becomes a **business code field with a uniqueness key** (`entity_key` /
`entity_key_field` support ordered and compound members), while the technical
identity is a new UUID.

**Consequence: every table gains a UUID PK and every FK must be remapped.** That
means a full-graph, topologically ordered identity remap, plus a mapping table for
external references to the old IDs (files, integrations, URLs, printed documents).

Data hazards to plan for:

| Hazard                                              | Impact                                                    |
| --------------------------------------------------- | --------------------------------------------------------- |
| **Oracle treats `''` as NULL; PostgreSQL does not** | Silent corruption — the classic Oracle→PG trap            |
| Oracle `DATE`/timestamp + NLS timezone              | Wrong instants                                            |
| `NUMBER` precision                                  | Lossy if mapped carelessly                                |
| `CLOB`/`BLOB` volume                                | Storage/throughput, and blobs become attachments          |
| Legacy data violating new typed constraints         | Migration must reject or remediate, not bypass            |
| `tenant_id` backfill + forced RLS                   | Every row must be tenant-classified (or product baseline) |
| Encoding, collation, case sensitivity               | Duplicate keys appear after migration                     |

### Stage 6 — "Platform X runs on Athyper" · **THE REAL QUESTION**

| If Platform X is…                                                              | Plausible?   | What it needs                                                                   |
| ------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------- |
| **Forms over tables** — CRUD, list/detail, simple rules                        | **Yes**      | Semantic metadata authoring + data migration                                    |
| **Has meaningful Java business logic** — services, batch, integrations, PL/SQL | **Partial**  | Logic **rewritten as registered domain handlers**, not converted                |
| **A full product** with workflow, print, integrations                          | **Not soon** | Athyper **parks** workflow, print and integration automation (blueprint §7.9.4) |

**Athyper is a metadata/entity framework, not a Java application server.** It cannot
_convert_ Java or PL/SQL. Per AGENTS.md, business rules belong in "the owning domain
service package, registered through host/plane composition" — that is a **rewrite**.

And AGENTS.md **forbids executable code upload**, so importing PL/SQL or Java as
metadata is not merely unsupported; it is prohibited.

---

## 3. Honest effort profile

| Workstream                                                                           | Share                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| DDL export + storage catalogue                                                       | ~5 %                                       |
| Type / structural mapping                                                            | ~15 %                                      |
| **Semantic authoring** — identity, labels, navigation, authorization, classification | **~30 %**                                  |
| **Data migration + UUID identity remap**                                             | **~25 %**                                  |
| **Business-logic rewrite as registered handlers**                                    | **~40 %+ (dominant, if any logic exists)** |
| Workflow / print / integration                                                       | **parked**                                 |

**"Convert the DDL" is roughly a fifth of the work. "Run Platform X" is dominated by
logic rewrite.**

---

## 4. Recommendation

**Do not attempt a whole-platform port.** Sequence it:

1. **Prove the pipeline on ONE table end-to-end** — export → catalogue → starter
   draft → human review → generated DDL → publish to a plane → migrate rows →
   verify in the shared list/detail runtime.
2. **Build the Oracle DDL → storage catalogue adapter** (reuse the shape of the
   existing introspection pipeline, with an explicit unsupported-type disposition).
3. **Build the catalogue → starter draft proposer** — the blueprint's Priority 5
   already specifies its behaviour; this is implementing a designed thing.
4. **Publish the type-mapping table** with every unsupported mapping as an explicit
   named diagnostic.
5. **Decide the record-identity policy before any data work.** This is the pivotal
   decision; everything downstream depends on it.
6. **Treat business logic as a separate, domain-scoped rewrite programme.** It is
   the largest item and cannot be automated.
7. **Defer** workflow, print and integration — parked, not blocked.

**Sequencing caveat:** this is Priority 5+ work. The blueprint orders it _after_ the
Country/State Region reference slice. Building a generic importer before the
reference path works is the exact anti-pattern identified throughout this review —
the framework must prove routine onboarding first.

---

## 5. Bottom line

- **Is it possible?** For the **metadata half, yes** — and Athyper has already
  designed it (F2 storage catalogue + Priority 5 starter drafts).
- **~60–70 % of the structural mapping is automatable.** Identity, labels,
  navigation, authorization and data classification are **human decisions by
  design**, not tooling gaps.
- **Data migration is feasible**, but Athyper's **UUID-only record identity** forces
  a **full PK/FK remap** — the biggest technical risk, and it should be decided
  before anything else.
- **"Platform X runs on Athyper" is a business-logic question, not a DDL question.**
  Metadata can host the _data surface_; the _logic_ must be rewritten as registered
  handlers. If Platform X is more than forms-over-tables, this is a programme of
  quarters, not a conversion script.

**The most valuable first deliverable is not an importer — it is a decision on
record identity and a single-table proof that the whole chain works.**

---

## 6. Future direction — AI-assisted DDL reconciliation (explicitly NOT current scope)

**Owner decision, 8 October 2026:** DDL-model reconciliation and data migration
between Platform X and Athyper is **not for now**. It is recorded here as a
**future exploration direction**, intended to be automated with AI assistance.

This is an exploration note — not a design, not a roadmap entry and not a
commitment. Any accepted approach belongs in the Entity Studio blueprint.

### 6.1 Why this is a good AI candidate

The task decomposes into a large **propose** half and a small **decide** half, and
that split is what makes AI practical here.

| Sub-problem                                          | AI suitability             | Why                                                                                                    |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Type mapping (Oracle → Athyper families)             | **High**                   | Large but finite rule space; proposals are mechanically checkable against the existing type vocabulary |
| Enum/domain inference from `CHECK` and lookup tables | **Medium–High**            | Pattern recognition over constrained shapes                                                            |
| **Readable identity suggestion**                     | **Medium**                 | Currently a pure human decision; AI can _propose_ ranked candidates                                    |
| **Field → section/group clustering**                 | **Medium**                 | Layout inference from naming and FK proximity                                                          |
| **Label extraction from Java resource bundles**      | **High**                   | Matching existing bundle keys to columns is a bounded retrieval problem                                |
| Unsupported-object triage (PL/SQL, VPD, MVs)         | **High**                   | Classification into "diagnostic" vs "actionable"                                                       |
| **Authorization intent**                             | **None — must stay human** | Security class; never infer                                                                            |
| **`dataClassification` / retention**                 | **None — must stay human** | Governed classification; never infer                                                                   |
| Business logic                                       | **None**                   | Rewrite; not a migration problem                                                                       |

### 6.2 Why the architecture is already AI-ready

The AI path works **because** Athyper already defines both ends as structured,
reviewable artifacts:

- **Structured input** — the F2 storage catalogue contract (plane, schema, object,
  columns with type/nullability/length/precision/scale/domain + content hash)
- **Structured output** — starter drafts, which the blueprint already specifies as
  _proposals_ requiring acceptance
- **Existing discipline** — "propose typed mappings from approved facts, retain
  unsupported constraints as diagnostics, and require author acceptance"
- **Existing gates** — review, publication and activation already sit downstream

So AI slots in as a **proposer feeding the existing review gates**, not as a new
authority.

### 6.3 Non-negotiable guardrails for any future implementation

1. **AI proposes; a human accepts.** The blueprint already says _"do not assume the
   first field is identity"_ — an AI suggestion is a candidate, never a decision.
2. **No inferred authorization, classification or retention.** These are security
   classes; an inferred allow is precisely what AGENTS.md forbids.
3. **Unsupported paths become named diagnostics, never silent drops.**
4. **The deterministic rules stay authoritative.** AI proposes; the existing type
   vocabulary and validation decide.
5. **Everything still passes review → publication → activation.** AI removes
   _authoring effort_, never a control.
6. **No executable-code import.** PL/SQL and Java remain out of scope entirely.

### 6.4 Gate before exploring

This work stays behind the reference slice. The precondition is not tooling — it is
that **routine onboarding must work end-to-end first**. Building an AI-assisted
importer before Country/State Region completes would be automating a path that has
not yet been proven manually.

**Recommended trigger to revisit:** once the reference entities are delivered and
the same onboarding completes for a **second** entity through the same metadata
path, an AI-assisted reconciler becomes a natural next exploration.
