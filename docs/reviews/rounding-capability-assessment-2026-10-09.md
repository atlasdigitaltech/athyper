# Round-off (rounding) capability assessment — platform, tenant, company, entity and field levels; sync vs database

**Date:** 2026-10-09
**Scope:** repository `athyper` at the current working tree.
**Status of this document:** evidence only. It is an assessment/review, not an
implementation plan and not design authority. Any new contract property, table,
route or metadata key named below is a proposal that needs project-owner
approval before implementation, and any Entity-metadata work must follow the
[Entity Studio blueprint](../blueprints/entity-studio/blueprint.md).

---

## 1. Method

Read-only inspection of the rounding implementation end to end, plus the
configuration hierarchy it sits in, plus what the collaboration/sync layer does
with rounding configuration. Every claim below is anchored to a file and line.
No files were modified, no database was touched.

The question asked — _round-off across Platform / Tenant / Company / Entity /
Field levels, collaboration-sync level vs database level_ — is answered in
sections 3 and 6. Section 4 is the defect register; section 5 is the
robustness roadmap.

### Headline

- Rounding exists as **one well-built but narrowly wired subsystem**:
  `control.rounding_rule` + `control.rounding_context` (tenant → company →
  currency → slot), exact BigInt arithmetic in `@athyper/server-foundation`, a
  tenant-admin API, transactional audit/outbox, and a finance resolver.
- It is **not operational by default**. All authoring and finance routes are off by
  default; no active seed creates dispatch rows; and only two finance paths ever
  request a rounding slot (`LINE_NET` for GL validation, `LINE_TAX` for tax).
- **Platform level** exists only as currency reference data plus a hard-coded
  `ROUND_HALF_UP` fallback; there is no platform policy row. **Entity level does
  not exist.** **Field level does not exist at runtime** — authored
  `precision`/`scale` are dropped by the runtime projection, `fractionDigits` is
  refused by the compiler, numeric min/max are inert, and the client parses
  decimals through binary64.
- Most finance arithmetic (inventory, FX/closing, budget, planning, tax base and
  recoverables) **bypasses the resolver** with hard-coded 4-dp half-up or
  truncation. A configured cash-rounding currency therefore does not change most
  amounts.
- On the asked comparison: **rounding is enforced at the database/read path, not at
  any collaboration-sync layer.** There is no CRDT/offline/realtime field sync;
  collaboration means comments and attachments. The cache namespace and outbox
  invalidation events for rounding have no consumer and no effect.
- 41 concrete defects and 49 improvement items are catalogued below, each with
  file/line evidence.

---

## 2. What exists today, layer by layer

### 2.1 Database (authoritative store)

| Object                                            | Where                                                                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `control.rounding_rule`                           | `server/db/ddl/common/control/03_tables.sql:1363-1405`                                                                                                                  | Tenant-owned contract: `method` (`control.rounding_method_d`), `precision_digits smallint` (NULL = derive from currency), `rounding_increment numeric(18,6)`, `status`, generated `is_active`, `version integer`, `configured_contexts jsonb`                                                                                                                                      |
| `control.rounding_context`                        | `server/db/ddl/common/control/03_tables.sql:1419-1434`                                                                                                                  | Sparse dispatch `(tenant, company_code_id?, currency_code?, slot?)`; `UNIQUE NULLS NOT DISTINCT` on the coordinate                                                                                                                                                                                                                                                                 |
| `control.rounding_method_d`                       | `server/db/ddl/common/control/02_domains.sql:53-58`                                                                                                                     | `ROUND_HALF_UP`, `ROUND_HALF_EVEN`, `ROUND_DOWN`, `ROUND_UP` — **no `TRUNCATE`**                                                                                                                                                                                                                                                                                                   |
| `control.rounding_slot_d`                         | `server/db/ddl/common/control/02_domains.sql:59-75`                                                                                                                     | 15 calculation roles (`UNIT_PRICE`, `LINE_NET`, `LINE_TAX`, `DOCUMENT_TOTAL`, `EXCHANGE_RATE`, `UNIT_QUANTITY`, …)                                                                                                                                                                                                                                                                 |
| `control.finance_policy_status_d`                 | `server/db/ddl/common/control/02_domains.sql:48-49`                                                                                                                     | `draft`, `active`, `inactive`, `archived`                                                                                                                                                                                                                                                                                                                                          |
| Guard trigger `control.trg_guard_rounding_rule()` | `server/db/ddl/common/control/07_functions.sql:615-666`                                                                                                                 | Blocks deleting non-draft rules; freezes identity/creation evidence; freezes name/method/precision/increment/metadata once non-draft; blocks archived→anything; permits `draft→{active,archived}`, `active→{inactive,archived}`, `inactive→archived`                                                                                                                               |
| `trg_admin_version`                               | `server/db/ddl/common/control/14_admin_integrations.sql:3,9`                                                                                                            | DB-side optimistic-concurrency `version` on insert/update                                                                                                                                                                                                                                                                                                                          |
| `trg_rounding_context_definition_immutable`       | `server/db/ddl/common/control/14_admin_integrations.sql:68-69`                                                                                                          | Freezes the **`configured_contexts` jsonb** once status ≠ draft. It does **not** guard the `control.rounding_context` rows                                                                                                                                                                                                                                                         |
| RLS                                               | `server/db/ddl/common/control/10_rls.sql:278-299`                                                                                                                       | `FORCE ROW LEVEL SECURITY`; tenant policy + seed-write policy on both tables                                                                                                                                                                                                                                                                                                       |
| Grants                                            | `server/db/ddl/common/control/11_grants.sql:205-223`, `14_admin_integrations.sql:40-41`                                                                                 | `athyperapp` gets `SELECT, INSERT, UPDATE` on both tables; `athyper_control_writer` gets full DML under a tenant-scoped policy                                                                                                                                                                                                                                                     |
| FKs                                               | `server/db/ddl/common/control/05_constraints.sql:392-418`; `server/db/ddl/planes/neon/control/05_constraints.sql:1-4`                                                   | tenant, created/updated/status_changed_by, rule, and currency→`shared.currency(code)`. Company FK `(tenant_id, company_code_id) → master.company_code(tenant_id, id)` exists **on the Neon plane only**; `master.company_code` does not exist on Studio/Mesh, so `company_code_id` is an unvalidated uuid there                                                                    |
| Indexes                                           | `server/db/ddl/common/control/06_indexes.sql:165-175`                                                                                                                   | status, created_by, dispatch lookup, rule                                                                                                                                                                                                                                                                                                                                          |
| Platform currency precision                       | `server/db/ddl/common/shared/03_tables.sql:117-157`, check at `:147`                                                                                                    | `shared.currency.minor_units` (0–6), global (no `tenant_id`)                                                                                                                                                                                                                                                                                                                       |
| Currency rounding metadata                        | `server/db/ddl/common/shared/reference-data/003_currency.sql:269-310`                                                                                                   | `metadata.rounding_increment`, and for CHF also `cash_rounding` / `electronic_rounding`; `practical_minor_units`; metals have `minor_units = NULL`                                                                                                                                                                                                                                 |
| Migration history                                 | `server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_control_admin_foundation.sql:17-30,62,91`                                                      | Added `version` + `configured_contexts`, backfilled from `rounding_context`, added triggers and writer grants                                                                                                                                                                                                                                                                      |
| Generated clients                                 | `server/db/prisma/schema.{neon,studio,mesh}.prisma`, `server/packages/adapters/database/*/src/generated/kysely*/types.ts`                                               | `rounding_rule` / `rounding_context` are present in all three planes                                                                                                                                                                                                                                                                                                               |
| Coverage checks                                   | `server/db/scripts/checks/ddl/common-ddl-equivalence.ts:60,92,100-113`, `docs/architecture/generated/ddl-service-coverage.json` (rounding entries for studio/neon/mesh) | The equivalence check _counts_ rounding rows but never asserts or compares them, so there is no rounding regression gate. The generated coverage artifact lists both tables as `commands.decision: "not_exposed"` with empty `repository`, `entryPoints`, `unitTests` and `postgresTests`, and `rolloutStatus: "unverified"` — stale, because a repository, routes and tests exist |

Two independent, **unrelated** rounding surfaces also exist:

- `master.payment_term_clause.rounding_method` / `rounding_scale` — `server/db/ddl/planes/neon/master/03_tables.sql:1659-1661`, check at `:1801-1802`. The domain `master.payment_term_rounding_method_d` is created as bare `text` with **no value constraint** (`server/db/ddl/planes/neon/master/02_domains.sql:213` is inside the `CREATE DOMAIN … AS text` loop). No application code reads these columns.
- Lookup vocabulary `master.payment_rounding_method` — `server/db/ddl/planes/neon/control/lookup-packs/12_catalog_payment_rounding_method_seed.sql:26,42-47` seeds six snake_case values (`half_up`, `half_down`, `bankers`, `ceiling`, `floor`, `truncate`) that do **not** match either the domain's `ROUND_*` values or `rounding_method_d`.

### 2.2 Control-admin API (tenant authoring)

| Route                                         | Where                                                                             | Permission                      |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `GET /api/control-admin/rounding`             | `server/packages/platform/control-admin/src/control-service-routes.ts:45`         | `control.catalog.read`          |
| `POST /api/control-admin/rounding/simulate`   | same, `:46`                                                                       | `control.catalog.read`          |
| `PUT /api/control-admin/rounding/:id`         | `:65`                                                                             | `control.finance_config.manage` |
| `POST /api/control-admin/rounding/:id/retire` | `:66`                                                                             | `control.finance_config.manage` |
| `POST /api/neon/finance/rounding/resolve`     | `server/apps/platform-host/src/composition/spaces/neon/finance-routes.ts:216-231` | `finance.ledger.read`           |

Manifest entries: `docs/architecture/server-route-manifest.json:2707,11956,11971,15568,18603`.

Service: `server/packages/platform/control-admin/src/rounding-control.ts`.
Validation, OCC (`expectedVersion`), active-immutability, duplicate-scope rejection,
specificity scoring (`company 4 + currency 2 + slot 1`, `:264-270`) and simulation.
Writes are Neon-only (`:43-44`, and again in the repository at
`kysely-rounding-repository.ts:58,111`).

Repository: `server/packages/platform/control-admin/src/kysely-rounding-repository.ts`.
Runs one transaction per command (`control-repository-db.ts:14-63`), sets tenant/actor
context, takes an advisory lock, enforces `version()` OCC (`:64-65,115`), writes
`control.rounding_context` rows only while the rule is `active` (`:84-91`),
and appends audit + outbox evidence via `this.evidence(...)` (`:92-100,125-133`,
implemented at `control-repository-db.ts:71-101`). PostgreSQL conflict classes are
mapped centrally: `23514/…` → 400, uniqueness/FK/serialization → 409
(`control-repository-db.ts:44-62`).

Contracts: `server/packages/contracts/control-admin/src/control-services.ts:195-240`
and runtime schemas `…/runtime-schemas.ts:34-36,98-103,137`.
Ownership registry: `control-administration-ownership.ts:79`
(`tenantConfiguration`, tables `control.rounding_rule`, `control.rounding_context`).

**Enablement:** every control-admin route is disabled by default —
`server/packages/platform/control-admin/src/index.ts:14`
(`routesEnabledByDefault: false`), consumed at
`server/apps/platform-host/src/composition/register-services.ts:1446-1460`.
Rounding is gated by **two** independent flags, both defaulting to false
(`server/apps/platform-host/src/config/environment.ts:1139-1142,1155-1158`):
`localCatalogReads` (`WAVE0_CONTROL_ADMIN_LOCAL_CATALOG_READS_ENABLED`) for
`list`/`simulate`, and `lookupAndRoundingConfiguration`
(`WAVE0_CONTROL_ADMIN_LOOKUP_ROUNDING_ENABLED`) for `put`/`retire`. The Neon
finance resolve route is separately off by default
(`financeFoundation.routesEnabledByDefault: false`,
`server/packages/services/finance/src/index.ts:38`).

### 2.3 Finance runtime (consumption)

- Exact arithmetic: `server/packages/foundation/src/decimal-rounding.ts:1-103`.
  `resolveDecimalRounding` derives precision from `currency.minorUnits` when the
  rule omits it, defaults the increment to `10^-precision`, validates the
  increment against the resolved precision, and rejects precision outside 0–6.
  `roundDecimal` is BigInt quotient/remainder arithmetic.
- Resolver: `server/packages/services/finance/src/shared/rounding-resolver.ts:14-123`.
  Filters candidates, sorts by specificity, falls back to the currency default with
  hard-coded `ROUND_HALF_UP` (`:54-66`), and always returns `RoundingEvidence`
  including `contextRevision`, `ruleRevision`, `currencyRevision` and a
  `canonicalFinanceHash` evidence hash.
- Reader: `server/packages/services/finance/src/shared/kysely-finance-foundation.ts:19-54`.
  Reads `control.rounding_context JOIN control.rounding_rule … WHERE r.status='active'`
  and `shared.currency`. **Reads directly from the database, uncached, inside the
  caller's finance transaction.**
- Contracts: `server/packages/contracts/finance/src/foundation.ts:5-6,31-66`
  (method and 15-slot unions), `ports.ts:29-38` (`RoundingPolicyReader`).
- Admission: `server/packages/services/finance/src/shared/posting-guard.ts:14`
  resolves rounding as part of the posting admission and folds it into
  `evidenceHash` (`:16`).
- Applied paths (only two):
  - GL posting **validates** journal lines against the `LINE_NET` rule and
    rejects non-conforming lines — it does not round them
    (`server/packages/services/finance/src/ledger/gl-posting-service.ts:17,19,39-49`).
  - Tax calculation **applies** rounding for `LINE_TAX` in transaction and base
    currency, persists the rounding evidence inside `basisSnapshot`
    (`server/packages/services/finance/src/tax/tax-calculation-service.ts:20-22,66-68,72`;
    contract `server/packages/contracts/finance/src/tax.ts:81-87`), and replays it
    on reversal (`:43-45`).
- Real-persistence evidence: `server/packages/platform/control-admin/src/control-repositories.postgres.test.ts:841-880`
  saves a rule, resolves it through `RoundingResolver` + `KyselyRoundingPolicyReader`,
  rounds a value, retires the rule and proves the resolver then fails closed.
  It is **opt-in** (`ATHYPER_CONTROL_REPO_DB_TESTS`/`…DATABASE_URL`, `:17-19`).

### 2.4 Frontend, entity and field layer

- Published runtime field descriptors carry `key/label/kind/required/readOnly/options`
  only — no numeric type config: `packages/contracts/platform/entity-runtime/src/index.ts:39-49`.
- Form input consequently treats `decimal`/`money` as unrestricted `step="any"`
  numbers and defers to the server: `packages/platform/entity/runtime/form-detail/src/field-input.tsx:121-136`.
- Server field validation accepts `decimal`/`money` only as a JavaScript `number`
  and checks only `minimum`/`maximum` — no scale, no precision, no exact-decimal
  string form: `server/packages/services/records/src/field-validation.ts:23-26,61-70`.
- Entity Studio authoring **does** model per-field `precision`/`scale`
  (`server/packages/contracts/meta-entity-authoring/src/normalized-core-contract.ts:184-185`,
  allowed for `decimal`/`money` and validated `scale ≤ precision` at
  `normalized-core-validation.ts:266-310`), and the release compiler copies them
  into the field `typeConfig` (`server/packages/planes/studio/meta-entity-authoring/src/native-release-compilation.ts:315-320`).
- **But the runtime projection drops them:** `server/packages/platform/metadata/src/native-runtime-projection.ts:396-403`
  projects `minLength`, `maxLength`, `pattern`, `minimum`, `maximum` only.
- List/aggregate decimal arithmetic is exact but display-oriented and truncating
  for averages: `packages/contracts/platform/entity-list/src/decimal.ts:52-60`
  (`averageDecimals` divides with BigInt, truncating); display formatting is in
  `packages/platform/foundation/i18n/src/entity-value.ts:27-28,36`.
- Client-side parsing already loses precision: numeric form values are parsed
  with `Number(value)` before submission
  (`packages/platform/entity/runtime/form-detail/src/form-values.ts:23-24`,
  `packages/contracts/platform/entity-runtime/src/intake-data-values.ts:330-332`),
  so a decimal becomes binary64 in the browser and the server never restores it.
- Two authored field-level display mechanisms exist but are dead ends:
  `fractionDigits` is a layout binding option
  (`normalized-core`/`normalized-layout-contract.ts:104`), validated against the
  field's `scale` (`normalized-layout-validation.ts:502-508`), yet the native
  compiler rejects any non-null `fractionDigits`
  (`native-release-compilation.ts:684`) and no frontend reads it; and
  `ListFieldDescriptorV1.formatting`
  (`packages/contracts/platform/entity-list/src/types.ts:213`, parsed at
  `parsers.ts:1123-1127`) has no producer and no consumer in the entity runtime.
- Authored `minimum`/`maximum` are decimal strings in `typeConfig`
  (`native-release-compilation.ts:315-320`), but the runtime validator applies
  them only when `typeof === "number"` (`field-validation.ts:23-26`), so numeric
  range enforcement is inert on the native path.
- Client-side rounding that does exist is display-only: progress percentage
  `Math.round` (`packages/platform/entity/runtime/list-view/src/progress-value.ts:13`),
  `Intl.NumberFormat` rendering of JSON numbers
  (`packages/platform/foundation/i18n/src/entity-value.ts:28`), and Gantt percent
  labels. Nothing rounded on the client is submitted.
- Money has no dedicated formatting: `EffectiveLocalization`
  (`packages/platform/foundation/i18n/src/index.ts:41-54`) carries no currency or
  precision, nothing passes Intl `style:"currency"`, and a `money` field renders
  exactly like a `decimal` with no symbol. There is no company- or locale-level
  decimals setting in the frontend.
- Published metadata confirms the gap: `metadata/**` contains no `precision`,
  `scale` or `rounding` property, and a published runtime contract for a decimal
  field (`ownership_pct`) carries no validation or scale at all
  (`docs/reviews/bp-read-runtime-contracts-20261003.json:1701-1714`); per-field
  scale survives only implicitly in `storageType` strings such as `numeric(5,2)`
  (`metadata/entities/common/reference/industry_crosswalk/core.json:124`).
- There is no rounding administration UI anywhere in `packages/` or `apps/`.
  The only rounding strings in frontend code are the comments above.

### 2.5 Publication and "sync"

- Ownership is platform-governed: Studio publishes bank rules, Neon alone writes
  rounding rules (`docs/runbooks/control-repository-integrations.md`, Deployment §4;
  ownership entry `control-administration-ownership.ts:79`).
- Reads are uncached by design, and the outbox exists to let a future consumer
  subscribe or re-read fresh revisions (`docs/runbooks/control-repository-integrations.md`,
  Persistence and runtime behavior).
- The application invalidates `namespace: "rounding"` after a successful write
  (`rounding-control.ts:135-138,162-165`) through `CacheInvalidator`
  (`server/packages/contracts/control-admin/src/control-services.ts:14-24`).
  **No rounding reader exists to invalidate**, and the default invalidator is a
  no-op (`register-services.ts:1544,1644`).
- Writes emit `control.rounding.saved` / `control.rounding.retired` audit events
  and `event.outbox` rows whose payload carries
  `cacheInvalidation: { namespace: "rounding", tenantId }`
  (`control-repository-db.ts:81-100`). **Nothing consumes those events** (no
  handler for `control.rounding.*`; `athyperapp` is not routed through it).
- "Collaboration" in this codebase is comments, reactions, drafts, flags and
  notification fanout (`server/packages/contracts/collaboration/src/ports.ts:1-24`,
  `…/collaboration.ts:1-40`). There is no CRDT, WebSocket field sync, offline
  queue or collaborative document model; the only realtime transport in the tree
  is AI answer streaming and notification delivery.

### 2.6 Where rounding sits in the configuration hierarchy

There is **no generic five-level precedence engine** in this repository. Three
different mechanisms coexist:

1. **Typed parameters — exactly two levels.**
   Platform default `control.parameter_definition.default_value`
   (`server/db/ddl/common/control/03_tables.sql:856-910`) and tenant override
   `control.tenant_parameter_value`, keyed on `(tenant_id, parameter_definition_id)`
   with an effective window (`:912-938`), resolved by
   `KyselyParameterRepository.readEffective` (`kysely-parameter-repository.ts:71-101`)
   and reported as `source: "tenant_override" | "default"` (`parameter-control.ts:113`).
   There is no company-, entity- or field-scoped parameter table.
2. **Experience/profile settings — three levels.**
   `readProfileOrDefault` resolves `principal ?? tenant ?? PLATFORM_PROFILE`
   (`server/packages/platform/experience/src/service.ts:1193-1252`), backed by
   `master.principal_ui_profile` and `master.tenant_profile`.
3. **Rounding — a bespoke aggregate with its own four dimensions.**
   Tenant (`rounding_rule.tenant_id`, `NOT NULL`) → company
   (`rounding_context.company_code_id`, genuinely operating-company scoped, below
   legal entity) → currency → slot, with wildcard specificity 4/2/1.

Adjacent, but not a value chain: `control.numbering_policy.scope_kind` enumerates
`tenant, entity, legal_entity, company_code, site, operating_organization,
resource_company, ledger, network_account` (`control/03_tables.sql:1199-1202`) as a
counter-partition contract, not a fallback hierarchy.

**Product-default rounding cannot be published.** `server/packages/services/publication/**`
contains no rounding code, and the Entity Studio blueprint defines no rounding
publication semantics. The only rounding write path is Neon through the
control-admin API (`control-service-routes.ts:62,146`).

**Plane ownership is application-enforced, not database-enforced.** The common DDL
grants `SELECT, INSERT, UPDATE, DELETE` on both rounding tables to
`athyper_control_writer` on every plane (`14_admin_integrations.sql:40-41`), and
`athyperapp` gets `SELECT, INSERT, UPDATE` (`11_grants.sql:210-215`). RLS only
enforces tenant scope (`10_rls.sql:278-299`). The plane-boundary catalog reports
`runtimeWrite: true` for both tables on Studio, Neon **and** Mesh
(`docs/reports/plane-boundary-dev-catalog-20261002.json`, rounding entries under
each plane). The runbook line "Studio alone publishes bank rules; Neon alone
writes rounding rules" (`docs/runbooks/control-repository-integrations.md:58`) is
therefore an API-layer guarantee, not a privilege boundary.

**Governance disposition.** `control.rounding_rule` and `control.rounding_context`
are inventoried as `dataClass: "ddl_catalog_reference"`,
`disposition: "recreate_from_approved_seed"`, `decisionSource: "schema_default"`,
`approvalStatus: "pending"`
(`governance/config/governance/authorization-data-disposition-inventory.v1.json:3022,3040`;
report `governance/policy/reports/authorization/inventories/authorization-data-disposition-inventory.md:226-227`).
That disposition is identical to every other control table, including
tenant-authored ones, so as written it would permit recreating tenant rounding
configuration from a seed rather than preserving it. It is unapproved, so this is
a risk to resolve before approval, not current policy.

---

## 3. Level-by-level verdict

| Level        | What exists                                                                                                                                                                      | Where                                                                                                                  | Enforced by                                                            | Verdict                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform** | Global currency precision + optional platform increment: `shared.currency.minor_units`, `metadata.rounding_increment`; global lookup vocabulary `master.payment_rounding_method` | `shared/03_tables.sql:117-157`; `reference-data/003_currency.sql:269-310`; lookup pack `:26`                           | DB `CHECK 0..6`; resolved at read time                                 | **Partial.** It is a currency default, not a policy row. `cash_rounding` / `electronic_rounding` / `practical_minor_units` are seeded but ignored. No platform-owned rounding _rule_ exists (`rounding_rule.tenant_id` is `NOT NULL`).                                                                  |
| **Tenant**   | `control.rounding_rule` aggregate, 4 admin routes, repository, audit/outbox, RLS, optimistic versioning                                                                          | §2.1–2.2                                                                                                               | Service + repository + DB guard + RLS                                  | **Built, but gated and inert by default.** Routes are off by default; there is no UI; no seed creates dispatch rows (see D1); only Neon accepts writes.                                                                                                                                                 |
| **Company**  | `rounding_context.company_code_id` with weight 4                                                                                                                                 | `control/03_tables.sql:1419-1434`; specificity `rounding-control.ts:264-270`; reader `kysely-finance-foundation.ts:32` | DB uniqueness on the coordinate; company FK on the **Neon plane only** | **Supported in schema and reader**, exercised by the admin API body, but there is no company-scoped fixture/test and no company integrity on Studio/Mesh.                                                                                                                                               |
| **Entity**   | Nothing                                                                                                                                                                          | —                                                                                                                      | —                                                                      | **Absent.** No Meta Entity property, no `entity_type`/`record_type` dimension on `RoundingResolutionRequest`, no per-entity policy binding.                                                                                                                                                             |
| **Field**    | Authoring-only `precision`/`scale` on `decimal`/`money` fields; a rejected `fractionDigits` binding; 15-value `RoundingSlot` calculation-role enum                               | `normalized-core-contract.ts:184-185`; `native-release-compilation.ts:684`; `02_domains.sql:59-75`                     | Authoring validation only; runtime projection drops scale              | **Absent at runtime.** Field scale is authored then dropped (`native-runtime-projection.ts:396-403`); `fractionDigits` is refused at compile time (D34); authored min/max are inert (D36); the client parses with `Number()` (D37); only 2 of the 15 slots are ever requested (`LINE_NET`, `LINE_TAX`). |

**Levels the platform actually offers for rounding: tenant → company → currency → slot.**
The generic configuration hierarchy is even narrower — platform default + tenant
override only (`control.parameter_definition` / `control.tenant_parameter_value`,
`control/03_tables.sql:856-946`).

---

## 4. Defect register

Ranked by financial-correctness and blast radius. Each item is verifiable from
the citations.

**D1 — No active provisioning path creates rounding dispatch data (high).**
A repository-wide search finds `control.rounding_context` only in DDL, never in a
seed or provisioner. The only `rounding_rule` seeds live under
`server/db/seed-backup/` (`…/020_technostat/004_technostat_finance_controls.sql:108-119`,
`…/020_tax/323_tax_groups.sql:23-39`), which `server/db/seed/README.md:28` declares
"historical source material only. Provisioners, checks, and generators must never
read from it." Even those seeds insert `status='active'` rules and never the
dispatch rows. The runtime reader consumes only `rounding_context`
(`kysely-finance-foundation.ts:28-36`), and both the control-admin routes
(`control-admin/src/index.ts:14`) and the finance routes
(`server/packages/services/finance/src/index.ts:38`) are disabled by default, so
a default deployment has no way to make any tenant rounding rule dispatch. The
resolver always falls through to `source:"currency_default"` with `ROUND_HALF_UP`
(`rounding-resolver.ts:54-66`).

**D2 — Field-level precision/scale is authored then discarded (high).**
Authoring requires/allows `precision`+`scale` for `decimal`/`money`
(`normalized-core-validation.ts:266-310`) and the compiler carries them
(`native-release-compilation.ts:315-320`), but `native-runtime-projection.ts:396-403`
projects only `minLength/maxLength/pattern/minimum/maximum`. The runtime form
cannot show or enforce scale (`field-input.tsx:121`), and the server write path
accepts any finite JS `number` for `decimal`/`money`
(`field-validation.ts:61-70`) — losing precision above binary64 and never
enforcing the authored scale.

**D3 — Rounding-method vocabulary drift, with an API/DB contradiction (high).**
`control.rounding_method_d` has 4 values and excludes `TRUNCATE`
(`02_domains.sql:53-58`); `decimal-rounding.ts:2-3` and the API runtime schema
(`runtime-schemas.ts:35`) both include `TRUNCATE`. A `PUT /rounding/:id` with
`method:"TRUNCATE"` passes schema and `resolveDecimalRounding`, then hits the
domain check on write; `23514` is mapped centrally to HTTP 400
`CONTROL_ADMIN_INVALID_VALUE` (`control-repository-db.ts:59-60`), so the caller
gets a misleading generic value error rather than a contract error. A third,
incompatible vocabulary (`half_up`…`truncate`) is seeded for payment terms
(`12_catalog_payment_rounding_method_seed.sql:42-47`) against an
**unconstrained** domain (`neon/master/02_domains.sql:213`). Two further inert
vocabularies exist in Neon control storage: `control.formula_expression.default_rounding`
(`planes/neon/control/03_tables.sql:481`) and
`control.formula_expression_version.rounding_config` (`:531`), plus a seeded
`{"mode":"half_up","precision":2}` in the payroll blueprint
(`server/db/seed-backup/blueprints/universal/070_people/340_payroll_masters.sql:52,219`).
None is read by any code path.

**D4 — Rule lifecycle has dead-end states (high).**
The repository rejects _any_ update to a non-draft rule
(`kysely-rounding-repository.ts:66-67`), so `suspended` can be set only at
creation and a `suspended` rule can never be reactivated; `active → inactive`
is permitted by the DB guard (`07_functions.sql:651-663`) but unreachable
through the API. The contract advertises the full
`draft|active|suspended|retired` vocabulary
(`control-services.ts:195-240` and `EffectiveStatus`) against a repository that
implements `draft → active` and `any non-archived → retired` only, with no
reactivation.

**D5 — Dual source of truth for rounding contexts (high).**
`rounding_rule.configured_contexts` is authoritative for the admin API
(`kysely-rounding-repository.ts:164`) while `control.rounding_context` rows are
authoritative for the runtime (`kysely-finance-foundation.ts:28`). The DB
immutability trigger guards only the jsonb
(`14_admin_integrations.sql:68-69`); the child rows can be deleted or rewritten
for an active rule by any `athyperapp`/`athyper_control_writer` session
(grants `11_grants.sql:210-215`, `14_admin_integrations.sql:41`). Activated-rule
immutability is therefore not enforced at the database level for the table the
runtime actually reads.

**D6 — No effective dating and no as-of resolution (medium-high).**
`rounding_rule`/`rounding_context` have no `effective_from`/`effective_to`
(`control/03_tables.sql:1363-1434`; contrast `control.tax_group`, which has both).
Resolution is "whatever is active now" plus revision strings. Tax lines persist
the rounding evidence in `basisSnapshot.rounding`, but GL postings persist only
an `admissionEvidenceHash` (`gl-posting-service.ts:29-31`), so a historical GL
rounding decision cannot be reconstructed without the audit snapshot.

**D7 — Tax group's declared rounding rule is evidence, not behaviour (medium-high).**
`tax_group.rounding_rule_id` is `NOT NULL`, must reference an **active** rounding
rule before the group may be scheduled/active
(`server/db/ddl/planes/neon/control/07_functions.sql:2568-2576`), and is copied
into `TaxRuleSnapshot.roundingRuleId`
(`kysely-tax-configuration.ts:24-25`; `contracts/finance/src/tax.ts:55`). The tax
calculation service never reads it — it resolves the `LINE_TAX` slot from
`rounding_context` instead (`tax-calculation-service.ts:20-22`). The declared rule
and the applied rule can differ while both appear in the evidence. Separately,
`roundingAdjustment` is hard-coded to `0.0000` (`tax-calculation-service.ts:72`),
so the ledger's `rounding_adjustment` column
(`server/db/ddl/planes/neon/ledger/03_tables.sql:558`) never carries a round-off.

**D8 — Slot vocabulary is triplicated and 13 of 15 slots are dead (medium).**
The list exists in the DB domain (`02_domains.sql:59-75`), the TypeScript union
(`contracts/finance/src/foundation.ts:7-22`) and a hand-written route array
(`finance-routes.ts:410-437`). Only `LINE_NET` and `LINE_TAX` are requested in
production code. Document-level round-off (`DOCUMENT_TOTAL`), cash rounding and
quantity/rate precision therefore have declared contract surface but no runtime.

**D9 — Untracked second rounding surface on payment terms (medium).**
`master.payment_term_clause.rounding_method`/`rounding_scale` are stored with an
unconstrained domain and are read by nothing in the repository.

**D10 — No authoring UI and routes off by default (medium).**
`routesEnabledByDefault: false` (`control-admin/src/index.ts:14`); no rounding
screen exists in `packages/` or `apps/`. The only way to create dispatch rows is
the direct API or SQL.

**D11 — Cache invalidation is a no-op in the default composition (medium).**
`namespace: "rounding"` is declared and emitted
(`control-services.ts:14-24`, `control-repository-db.ts:91`) but the default
`CacheInvalidator` does nothing (`register-services.ts:1544,1644`) and no routing
reader consumes `control.rounding.*` outbox events.

**D12 — Smaller integrity gaps (low-medium).**
`rounding_context.company_code_id` is FK-validated only on the Neon plane
(`planes/neon/control/05_constraints.sql:1-4`); Studio/Mesh accept any uuid
(§2.1). `cash_rounding`/`electronic_rounding`/`practical_minor_units` in currency
metadata (`003_currency.sql:274,288-310`) are never read; the resolver uses only
`rounding_increment`. MGA/MRU are stored as `minor_units=2` with
`rounding_increment=1` — a contradiction reconciled only in application code.
Metals with `minor_units = NULL` and no rule raise `FINANCE_NOT_FOUND` rather
than a specific "no precision available" contract error.

**D13 — Verification depth (low-medium).**
Cross-plane persistence and finance-consumption coverage exists but is opt-in
(`control-repositories.postgres.test.ts:17-19`). The parity test
(`rounding-parity.test.ts`) and service/HTTP tests are unit-level; its stub
readers both call the same foundation functions, and its fixture is always a
tenant-wide wildcard, so it proves "same math given equivalent inputs" and never
exercises the currency-default fallback. There is no default-CI end-to-end path
from a saved rule to a posted financial amount.

### 4.1 Additional finance-runtime findings

These rank alongside D1–D5; they were found by tracing every amount-producing
finance path rather than only the resolver call sites.

**D14 — Configurable precision above 4 breaks posting and tax (high).**
`precision_digits` accepts 0–6 (`control/03_tables.sql:1389-1390`;
`decimal-rounding.ts:26`), but the finance runtime is hard-wired to 4 decimal
places: `decimalUnits(value, 4)` throws `FINANCE_INVALID_COMMAND` when the value
has more than four places (`server/packages/services/finance/src/shared/decimal.ts:7`).
`GlPostingService.validateJournal` re-reads every rounded amount at scale 4
(`gl-posting-service.ts:44-46`) and the tax service does the same
(`tax-calculation-service.ts:72,104,110-111`), so a `precisionDigits: 5|6` rule
makes GL posting fail and tax calculation fail. The tax path then normalises
through `fixed()` — a hard-coded 4-dp `ROUND_HALF_UP` helper
(`tax-calculation-service.ts:110`) — so precision ≤ 4 is re-rounded a second time
and 5–6 fails outright.

**D15 — Most finance arithmetic bypasses the rounding policy entirely (high).**
Only two code paths consult the resolver, and one of them only validates. Every
other amount-producing path hard-codes its own rounding:

- Inventory FIFO partial-layer value: hard-coded half-up at currency scale 4
  (`server/packages/services/finance/src/inventory/inventory-service.ts:31-33`).
- FX revaluation and asset revaluation: `multiplyMoneyRate` hard-codes half-up
  to 4 dp (`closing/closing-services.ts:60,10-18`); closing/IC/asset amounts are
  otherwise validate-only.
- Budget: 4-dp truncation via `(fraction+"0000").slice(0,4)` and a ≤4-place input
  regex (`budget/budget-service.ts:103-104`), never the resolver.
- Planning and commitments: 4-dp range validation only
  (`planning/planning-service.ts:20`).
  This means a tenant that configures cash rounding (CHF 0.05, COP 50, HUF 1) still
  gets 4-dp half-up arithmetic in inventory, FX, closing and budget, and only sees
  the policy on tax and GL validation.

**D16 — Admin simulator and finance resolver can disagree (medium-high).**
`matches`/`specificity` are duplicated (`rounding-control.ts:257-270` vs
`rounding-resolver.ts:100-118`) with behavioural differences:

- The simulator cannot reproduce the currency-default fallback — no matching
  context throws 404 (`rounding-control.ts:188`), while the resolver returns
  `source:"currency_default"`.
- The simulator treats equal top specificity as a 409 conflict
  (`rounding-control.ts:189-190`); the resolver silently takes `candidates[0]`.
- Input bounds differ: the simulator accepts up to 38 integer digits
  (`runtime-schemas.ts:98`) while `roundFinanceDecimal` rejects more than 20
  (`canonical.ts:25-29`, `rounding-resolver.ts:76`).
- The simulator's `RoundingContext.slot` is an unconstrained `string`
  (`control-services.ts:200`, `runtime-schemas.ts:34`), not the 15-value union.
  Consequently "simulate" is not a faithful preview of runtime behaviour.

**D17 — Rounding evidence is not tenant-bound (medium).**
`RoundingEvidence.evidenceHash` is `sha256(canonical JSON)` over the evidence
object (`canonical.ts:8-10` in `rounding-resolver.ts:119-122`) and excludes
`tenantId`, so identical rule definitions in two tenants produce identical
evidence hashes.

**D18 — Currency rounding increment is unvalidated at rest (medium).**
`shared.currency` has no `rounding_increment` column; both readers parse
`metadata->>'rounding_increment'` (`kysely-finance-foundation.ts:42-45`,
`kysely-rounding-repository.ts:26-36`). Only `minor_units` is constrained 0–6
(`shared/03_tables.sql:147`); the increment is free-form JSON with no positivity
or representability check, unlike `rounding_rule.rounding_increment`
(`control/03_tables.sql:1370,1391`). A bad metadata increment surfaces as a
runtime `RangeError` → `FINANCE_INVALID_COMMAND`, not as a configuration error.

**D19 — The declared invalidation guarantee has no implementation (medium).**
The host asserts `guarantees.invalidation === true` or refuses to start
(`register-services.ts:1625-1634`) while wiring
`cache: { invalidate: async () => {} }` and documenting in a comment that the
reads are uncached and durable events carry invalidation
(`register-services.ts:1543-1552`). There is no rounding cache to invalidate and
no consumer of `control.rounding.*` outbox events, so the guarantee currently
means "an event was written", not "a cache was invalidated". Any future cached
consumer would silently rely on an unverified contract.

### 4.2 Ownership, evidence-normalisation and documentation defects

**D20 — Same stored row can hash differently on the two paths (medium).**
The admin repository strips trailing zeroes from `rounding_increment` when mapping
(`kysely-rounding-repository.ts:156-162`) while the finance reader does not
(`kysely-finance-foundation.ts:95`). Since `roundingIncrement` feeds
`RoundingEvidence.evidenceHash` (`rounding-resolver.ts:119-122`), the simulator and
the runtime can report different increments and different hashes for the same
`1.000000`-style row.

**D21 — Neon-only ownership is not a database boundary (medium).**
See §2.6: `athyper_control_writer` may write rounding rows on all three planes, and
the plane catalog records `runtimeWrite: true` on Studio and Mesh. Deployment
security therefore depends entirely on the API's `neon()` guard
(`control-service-routes.ts:146`, `rounding-control.ts:43-44`,
`kysely-rounding-repository.ts:58,111`).

**D22 — Governance disposition conflicts with tenant authorship (medium).**
The inventory proposes `recreate_from_approved_seed` for tenant-authored rounding
configuration (§2.6). If approved unchanged this would authorise replacing tenant
financial policy from a seed.

**D23 — Two runbooks now overstate the remaining work (low).**
`docs/runbooks/rounding-administration-api-review-2026-09-07.md:14` still says the
API "has no currency-default reader", but `getCurrencyDefaults` is now required and
called (`rounding-control.ts:90-95,191-196`;
`docs/runbooks/rounding-shared-resolution.md:15-17`). `:21` still says SQL "has no
aggregate version column", but `rounding_rule.version` exists
(`control/03_tables.sql:1380`) with the `zz_admin_version` trigger
(`14_admin_integrations.sql:9`). The current, accurate description is
`docs/runbooks/rounding-shared-resolution.md` plus the "Persistence and runtime
behavior" table in `control-repository-integrations.md`.

### 4.3 Database drift, gates and missing invariants

**D24 — No "must be created draft" invariant (medium).**
`control.rounding_rule` has no `BEFORE INSERT` status trigger, so direct SQL can
mint an immutable `active` rule with no draft/review step. Sibling finance policy
tables enforce this (`control.tax_group` must be inserted draft —
`planes/neon/control/07_functions.sql:2529-2532`).

**D25 — Cross-rule overlap detection is TOCTOU and reads the mirror (medium).**
The service reads other rules' `configured_contexts` and then saves in a
separate transaction (`rounding-control.ts:117-126`), so concurrent saves surface
as a generic `409 PERSISTENCE_CONFLICT`, and drafts can overlap freely until
activation. The DB arbitrates only exact-tuple equality
(`rounding_context_dispatch_uq`, `control/03_tables.sql:1427-1428`); there is no
exclusion constraint and no DB check that an active rule has at least one context.

**D26 — Migrated and fresh databases may differ (medium).**
`rounding_context_dispatch_uq` and `rounding_context_company_fk` exist in the
fresh DDL but in **no** upgrade migration in this checkout
(`server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_control_admin_foundation.sql`
is the only rounding migration and adds neither). A migrated database cannot be
confirmed to have exact-key context uniqueness or the Neon company FK.

**D27 — The generated coverage artifact under-reports the feature (low-medium).**
`docs/architecture/generated/ddl-service-coverage.json` records
`commands.decision: "not_exposed"`, `repository: []`, `entryPoints: []`,
`unitTests: []`, `postgresTests: []` and `rolloutStatus: "unverified"` for both
tables, while `KyselyRoundingRepository`, the four control-admin routes, the Neon
finance route and three test suites exist. The generator merges only
`tooling/config/ddl-service-ownership.yaml`, which has no rounding entry, and does
not scan code. Any coverage/compliance conclusion drawn from that artifact for
rounding is unreliable.

### 4.4 Control-admin API surface findings

**D28 — One bad stored row takes down the whole tenant read surface (high).**
`rows()` validates every rule and throws `CONTROL_ADMIN_ROUNDING_STORED_CONFIGURATION_INVALID`
(503) if any row fails the runtime schema or `validateRounding`
(`rounding-control.ts:53-66`). The API schema requires `contexts` with
`minItems: 1` (`runtime-schemas.ts:35`), but the table default is
`configured_contexts = '[]'` (`control/03_tables.sql:1381`) and the existing seed
rules carry no contexts (§D1). So applying those seeds, or any hand-written row
with empty contexts, makes `list`, `simulate` and `save`'s overlap check fail for
the entire tenant. The API is also stricter than the storage it reads: it rejects
a rule with neither precision nor increment (`rounding-control.ts:219-223`) that
the DB and the finance resolver both accept.

**D29 — Retiring a rule can strand an active tax group (medium-high).**
`control.tax_group.rounding_rule_id` must reference an **active** rule before a
tax group may be scheduled/active (`planes/neon/control/07_functions.sql:2567-2576`),
but that condition is evaluated only when the tax group is written. `retire`
archives the rule and deletes its dispatch rows with no reference-use check
(`kysely-rounding-repository.ts:105-136`), and the ownership entry does not carry
the `reference_use_check` or `retirement_only` safeguards that `reference_lookups`
has (`control-administration-ownership.ts:79` vs `:98`). An active tax group can
therefore be left pointing at an archived rule.

**D30 — The write permission may not exist in any catalog (medium).**
`control.finance_config.manage` appears only in TypeScript
(`control-service-routes.ts:151`, `rounding-control.ts:37`,
`contracts/control-admin/src/index.ts:35`). There is no seed, migration,
governance file or provisioning script in this repository that defines it, and the
authorizer fails closed when a code is absent from the verified snapshot
(`server/packages/platform/iam/src/permission-authorizer.ts:94-96`). Unless the
deployed catalog provisions it separately, every rounding write returns 403.

**D31 — The ownership registry is incomplete and points at a missing document.**
The rounding entry (`control-administration-ownership.ts:79`) omits
`reference_use_check`/`retirement_only`, and the module header cites
`docs/architecture/control-administration-ownership-matrix.md`, which does not
exist in this checkout.

**D32 — API verification gaps (medium).**
`control-admin-inventory.test.ts` asserts only that 44 routes exist, are
authenticated and carry a truthy permission; it never asserts the rounding
permissions, and `control-administration-ownership.test.ts` never asserts the
`rounding_configuration` entry. There is no rounding OCC/concurrency race test
(contrast the connector and lookup suites), no test that the DB guard/`zz_admin_version`
triggers actually fire, no cross-tenant RLS test for the rounding tables, no
draft/suspended persistence test, and no HTTP-level test of repository-origin
409/503 codes — `rounding-routes.test.ts` uses a fake repository.

**D33 — Smaller API inconsistencies (low-medium).**
A `suspended` rule yields `CONTROL_ADMIN_ROUNDING_ACTIVE_IMMUTABLE` while a
`retired` rule yields `CONTROL_ADMIN_VERSION_CONFLICT` for one "not draft" class
(`rounding-control.ts:108-116`). The repository health probe checks
`SELECT version FROM control.rounding_rule LIMIT 0` but never
`control.rounding_context` or the guard/version triggers that OCC depends on
(`kysely-control-repositories.ts:41-43`). Response schemas are not enforced in
production (`composition/runtimes/http.ts:29-39`), and the route contract's
`permission` field is documentation only — enforcement is the service's.

### 4.5 Entity, field and client-surface findings

**D34 — Authored per-field display precision is rejected at compile time (medium).**
The layout binding option `fractionDigits`
(`normalized-layout-contract.ts:104`) is validated against the field's authored
`scale` (`normalized-layout-validation.ts:502-508`) and then explicitly refused by
the active native compiler for any non-null value
(`native-release-compilation.ts:670-692`). No frontend reads it. A per-field
display precision therefore cannot be authored to effect, even though the
authoring contract and validator invite it.

**D35 — `formatting` is a dead list-field contract property (low-medium).**
`ListFieldDescriptorV1.formatting`
(`packages/contracts/platform/entity-list/src/types.ts:213`) is parsed
(`parsers.ts:1123-1127`) but is emitted by no producer and read by no consumer in
the entity runtime.

**D36 — Authored numeric range constraints do not fire at runtime (medium).**
Two independent reasons. First, the native authoring contract **forbids**
`type_config` for native change sets (`NATIVE_FIELD_LEGACY_PAYLOAD_FORBIDDEN`,
`server/db/ddl/planes/studio/metadata/52_native_field_contract_trigger.sql:20-27`),
while the runtime projection reads _only_ `field.typeConfig` to build the
`validation` bag (`native-runtime-projection.ts:396-403`) — so for natively
authored fields the whole bag is empty. Second, where `minimum`/`maximum` do
arrive they are decimal **strings** (`native-release-compilation.ts:315-320`), and
the write validator applies them only when both the value and the bound are
JavaScript numbers (`field-validation.ts:23-26`).

**D37 — Client parsing destroys precision before the server sees it (medium).**
Numeric form values are converted with `Number(value)` on submit
(`form-values.ts:23-24`, `intake-data-values.ts:330-332`), so a high-precision
decimal is already binary64 when it reaches the API, and the server neither
re-derives nor rejects it (`field-validation.ts:65`). A value with more than ~15–16
significant digits cannot round-trip through the entity form.

### 4.6 Further field and aggregate inconsistencies

**D38 — `money` is modelled differently in the two authoring generations (low-medium).**
The legacy DDL gate allows only `kind`, `currency_mode`, `currency_field_key`,
`fixed_currency_code` and `scale` for `money`
(`server/db/ddl/planes/studio/metadata/07_functions.sql:759`), while the
normalized contract applies the `decimal` option family — including `precision` —
to `["decimal","money"]` (`normalized-core-validation.ts:272`). A money field's
precision is representable in one generation and rejected in the other.

**D39 — Average aggregation can differ between the two repositories (low-medium).**
The in-memory repository computes averages with `averageDecimals` (truncating at
10 fraction digits, `decimal.ts:53-60`), while the SQL repository delegates to
PostgreSQL `avg` with no explicit rounding
(`kysely-record-repository.ts:326-335`). The same data can therefore produce
different average text depending on the repository, and the in-memory path is the
one used in tests.

**D40 — Concurrent numeric edits have no field-level merge (low-medium).**
The only frontend write path is the governed form
(`entity-form-runtime.tsx:162-170`); concurrency is record-level optimistic
versioning and on conflict the user is told to reconcile by hand
(`entity-form-runtime.tsx:181-184`) — there is no three-way merge, field diff, or
"reload mine/theirs" affordance, so a superseded numeric edit is indistinguishable
from a rejection.

**D41 — `intl.number` clamps to three fraction digits when options are omitted (low).**
The helper forwards options straight to `Intl.NumberFormat`
(`packages/platform/foundation/i18n/src/index.ts:206`), whose default
`maximumFractionDigits` is 3. Today's no-option call sites are counts and integer
identifiers, so nothing is mis-rounded, but a future decimal renderer that omits
options would silently round to three places.

---

## 5. Robustness improvements

Proposals only. Each is shared-framework or governed-metadata work — no
entity-specific branch, route or provider is proposed, and each new metadata
property or contract field needs owner approval and a blueprint update where it
touches Entity/Studio authoring.

### 5.1 Make the data model single-sourced and enforceable

1. **One dispatch source.** Derive the admin list from `control.rounding_context`
   rows (or make `configured_contexts` a generated/derived column) and add a DB
   constraint or trigger that fails any write where the jsonb and the child rows
   disagree. _Acceptance:_ a direct `DELETE`/`INSERT` on `control.rounding_context`
   for an `active` rule raises an integrity error; the admin list and runtime
   resolver can never disagree.
2. **Guard the runtime table.** Extend activated-rule immutability to
   `control.rounding_context` (parent-status-aware trigger), and narrow the
   `athyperapp` grant to `SELECT` so only `athyper_control_writer` can write.
   _Acceptance:_ direct SQL as `athyperapp` cannot mutate dispatch rows; the
   admin path still succeeds.
3. **Add the missing integrity checks.** FK on `company_code_id`; a cross-column
   `CHECK` that `rounding_increment` is representable at `precision_digits` when
   both are present; and a constraint tying quantity slots
   (`UNIT_QUANTITY`, `LINE_QUANTITY`, `WEIGHT`, `VOLUME`, `PERCENTAGE`) to
   `currency_code IS NULL`, which the table comment already asserts.
4. **Unify the method vocabulary.** One canonical set, one mapping, agreed across
   `control.rounding_method_d`, the lookup domain, and
   `foundation/decimal-rounding.ts`; either add `TRUNCATE` to the domain or remove
   it everywhere. _Acceptance:_ a table-driven test proves the DB domain, the
   runtime schema, the TypeScript union and the simulator accept exactly the same
   set.
5. **Retire or wire `payment_term_clause.rounding*`.** Either constrain and
   consume it through the same resolver, or drop it; do not keep a second
   unconstrained rounding surface.

### 5.2 Close the field-level gap

6. **Project authored scale into runtime metadata.** Add `precision`/`scale` to
   the runtime field descriptor (`native-runtime-projection.ts:396-403`) and to
   `EntitySurfaceFieldV1`, so the form can set `step`, the list can format, and
   validation can reject over-scale input. _Acceptance:_ an authored
   `decimal(18,4)` field renders with four-digit affordance, the list formats it,
   and an over-scale write is rejected with a field violation.
7. **Validate decimals exactly, not as binary64.** Accept an exact decimal string
   for `decimal`/`money` in `field-validation.ts` (mirroring
   `@athyper/server-foundation`), validate scale against metadata, and pass the
   exact text to the database. _Acceptance:_ a value with more than 16 significant
   digits round-trips unchanged, and an over-scale value is rejected before SQL.
8. **Decide the relationship between field scale and the rounding policy
   explicitly.** Field scale is representation; `control.rounding_rule` is
   calculation policy. Document the boundary in the shared framework so a field's
   scale never silently substitutes for a governed rounding rule.

### 5.3 Reconcile policy with execution

9. **Make declared vs applied rounding agree.** Either have tax use
   `tax_group.rounding_rule_id` (with the context `LINE_TAX` as fallback), or
   stop declaring it as the tax rounding authority; pick one and encode it in
   evidence. Populate `rounding_adjustment` with the actual round-off, and post
   it through the existing ledger path rather than leaving `0.0000`.
   _Acceptance:_ a tax line and its GL round-off reconcile for a
   cash-rounding currency (CHF, COP, HUF) end to end.
10. **Persist complete rounding evidence for GL postings.** Store the resolved
    `RoundingEvidence` (or a retrievable snapshot reference) rather than only a
    hash, so a posting can be reproduced.
11. **Effective-date the policy** (or explicitly declare it non-temporal). If
    temporal, resolve as-of the posting date and pin it in evidence. If not,
    record that decision so the absence is deliberate rather than accidental.
12. **Consume or remove the sync surface.** Either wire a rounding cache with
    the declared invalidation/outbox contract, or drop the `"rounding"` namespace
    and `cacheInvalidation` payload. Reads are currently uncached and correct;
    the risk is a future consumer subscribing to a namespace nothing guarantees.
13. **Make the platform default first-class.** Expose
    `cash_rounding`/`electronic_rounding`/`practical_minor_units` (or an explicit
    transaction-channel dimension) instead of silently using `rounding_increment`,
    and return a specific contract error when a currency has no resolvable
    precision.

### 5.4 Lifecycle, verification and operability

14. **Complete the lifecycle.** Permit `active → inactive` and
    `inactive → active` (or remove `suspended` from the contract). _Acceptance:_
    a table-driven test covers every status pair and proves the API and the DB
    guard agree.
15. **Seed dispatch, not just rules.** Any seed that creates an `active` rounding
    rule must create its `rounding_context` rows (or seed it as `draft`).
    _Acceptance:_ the DDL-equivalence check that already counts rounding rows is
    extended to assert rule/context consistency.
16. **Promote the real-Postgres path into the default gate** for at least one
    Neon end-to-end case (save → resolve → post → retire), since the current
    suite is opt-in.
17. **Add a shared admin surface** for rounding under the existing control-admin
    UI patterns rather than a bespoke page, so the routes stop being API-only.
18. **Make the slot vocabulary single-sourced** from the contract type so the
    DB domain and the route validator cannot drift.
19. **Document the level model.** Record in the shared framework which
    configuration levels rounding supports (tenant → company → currency → slot),
    which it deliberately does not (entity, field), and what a future
    entity-level binding would require — so a reader does not assume an
    entity-level capability that does not exist.

### 5.5 Make the policy the single source of truth for amounts

20. **Reconcile configured precision with runtime scale.** Either constrain
    `precision_digits` to what the runtime can consume (0–4) or widen
    `decimalUnits`/`assertFinanceDecimal` so a 5–6 dp rule is usable end to end.
    _Acceptance:_ a `precisionDigits: 6` rule posts a GL entry and calculates tax
    without `FINANCE_INVALID_COMMAND`, and a test proves the configured precision
    is what is applied.
21. **Route the bypassed paths through the resolver.** Inventory FIFO residual
    value, FX/asset revaluation, budget arithmetic and planning/commitment
    amounts should resolve a slot (`EXCHANGE_RATE`, `UNIT_PRICE`,
    `DOCUMENT_SUBTOTAL`, …) instead of hard-coding half-up/truncation at 4 dp.
    _Acceptance:_ for a cash-rounding currency, every amount-producing finance
    path either uses the resolved rule or records why it must not.
22. **Remove double rounding in tax.** Apply the resolved rule once and persist
    that result; do not re-normalise through a hard-coded 4-dp `ROUND_HALF_UP`
    helper. Populate `roundingAdjustment` with the actual difference.
23. **Share one resolver implementation.** Have the admin simulator call the same
    matching/specificity/resolution code as the finance resolver (with the tenant
    context supplied), so fallback, tie and input-bound behaviour cannot diverge.
    _Acceptance:_ `rounding-parity.test.ts` proves identical outputs for the same
    stored configuration across fallback, company, currency, slot and tie cases.
24. **Bind evidence to tenant and to the policy revision.** Include `tenantId`
    (and the resolved currency revision) in `RoundingEvidence.evidenceHash`.
25. **Validate currency metadata increment at rest** with a check that mirrors
    `rounding_rule.rounding_increment`, so a bad platform default fails as a
    configuration error rather than at posting time.
26. **Make the invalidation guarantee honest.** Either implement a rounding
    cache + outbox consumer, or rename/split the guarantee so
    `invalidation: true` asserts only what is true today (durable events), and
    document that runtime readers are uncached.
27. **Normalise numeric strings once.** Share the trailing-zero/increment
    canonicalisation between the admin map and the finance reader so the same row
    yields the same evidence and hash.
28. **Decide whether plane ownership is a privilege boundary.** If Neon-only
    rounding writes are a control (not just an API convention), revoke rounding
    DML from `athyper_control_writer`/`athyperapp` on Studio and Mesh, or record
    explicitly that application-layer plane routing is the only control.
29. **Correct the pending governance disposition.** Classify tenant-authored
    rounding rows as tenant configuration requiring export/preservation, not
    `recreate_from_approved_seed`, before the inventory is approved.
30. **Refresh the stale runbooks.** Update
    `rounding-administration-api-review-2026-09-07.md` to point at the current
    shared-resolution behaviour, or mark the superseded sections, so operators do
    not re-solve closed problems.
31. **Enforce creation sequencing in the database.** Add a `BEFORE INSERT` guard
    that requires `status = 'draft'` (excluding the seed role), matching
    `control.tax_group`, so an immutable active rule cannot be minted by ad-hoc SQL.
32. **Add the missing invariants to `control.rounding_context`.** A parent-status
    aware immutability guard, a constraint that an active rule has at least one
    context, and an explicit decision on wildcard/specific overlap (an exclusion
    constraint, or a documented statement that exact-key uniqueness is the full
    invariant given the 4/2/1 power-of-two weighting).
33. **Close the migration gap.** Add a forward migration that creates
    `rounding_context_dispatch_uq` and `rounding_context_company_fk` where absent,
    and record the equivalence in the migration inventory, so migrated and fresh
    databases are provably identical.
34. **Make equivalence and coverage checks assert.** Turn the rounding row counts
    in `common-ddl-equivalence.ts` into an assertion, and fix or explicitly scope
    the `ddl-service-coverage.json` generator so rounding is not reported as
    unexposed with no repository or tests.
35. **Deduplicate the rounding vocabularies.** Reconcile
    `control.rounding_method_d`, the API/`foundation` method set, the
    `master.payment_rounding_method` lookup, `master.payment_term_rounding_method_d`,
    and the inert `formula_expression.default_rounding` /
    `formula_expression_version.rounding_config` / payroll `default_rounding` into
    one governed vocabulary, or delete the unused surfaces.
36. **Stop one bad row from breaking the tenant.** Report invalid stored rules as
    per-row findings instead of failing the whole list/simulate/save surface, or
    make the storage schema and the API schema agree on whether empty contexts are
    valid. _Acceptance:_ a tenant containing a legacy `configured_contexts = '[]'`
    row can still list, simulate and save, and the bad row is surfaced explicitly.
37. **Add a reference-use check before retirement.** Refuse (or warn and require
    confirmation for) archiving a rule that an `active`/`scheduled` tax group
    references, and add `reference_use_check`/`retirement_only` to the rounding
    ownership safeguards.
38. **Provision the write permission.** Ensure `control.finance_config.manage`
    exists in the governed permission catalog, or document that writes stay
    fail-closed until it does.
39. **Fix the ownership references.** Add the missing
    `control-administration-ownership-matrix.md` or correct the header citation,
    and extend the ownership test to assert the rounding entry's classification,
    tables and safeguards.
40. **Deepen API verification.** Add a rounding OCC/concurrency race test, a
    direct-SQL immutability test that proves the guard and `zz_admin_version`
    triggers fire, a cross-tenant RLS test, draft/suspended persistence coverage,
    an HTTP-level test that repository 409/503 codes reach the client as the
    documented statuses, and per-route permission assertions.
41. **Align status codes and health probes.** Give the "not draft" class one
    consistent error code, and extend the repository health probe to
    `control.rounding_context` and the trigger/version dependency that OCC relies
    on.
42. **Make per-field display precision work or remove it.** Either support
    `fractionDigits` in the native compiler and runtime (form `step`, list
    rendering) or delete the authoring option so authors cannot bind something
    that is refused at compile time. The same applies to the unused
    `ListFieldDescriptorV1.formatting`.
43. **Fix numeric range enforcement.** Make `minimum`/`maximum` comparable
    regardless of whether they arrive as strings or numbers, and add a test that an
    over-range decimal write is rejected on the native path.
44. **Keep decimals exact end to end.** Carry decimal/money values as exact strings
    from the form through the API to storage instead of `Number(...)`, using the
    same exact-decimal helpers as `@athyper/server-foundation`. _Acceptance:_ a
    20-significant-digit decimal round-trips through the entity form unchanged, and
    an over-scale value is rejected with a field violation.
45. **Give money a real representation.** Add currency/precision to the effective
    localization or list field descriptor and pass it to `Intl` so money renders
    with its symbol and scale, rather than rendering identically to a plain
    decimal.
46. **Reconcile native and legacy field contracts.** Decide whether `precision`
    applies to `money` in both generations, and make the runtime projection read
    the native typed columns (not the legacy `type_config` that native authoring
    forbids), or state explicitly that runtime field validation is not yet a
    supported capability.
47. **Make aggregation rounding consistent.** Either make the in-memory average
    match PostgreSQL `avg` semantics or make both paths use the same explicit
    scale, so tests and production cannot disagree.
48. **Add field-level conflict handling** for numeric edits — at minimum a diff or
    "mine/theirs" choice — rather than a record-level conflict that silently
    supersedes a value.
49. **Guard the number formatter.** Require explicit fraction-digit options in
    `intl.number` for numeric fields, so no future decimal renderer inherits
    `Intl`'s silent three-digit default.

---

## 6. Collaboration-sync level vs database level — direct answer

**Rounding is enforced at the database/read path, not at any collaboration or
sync layer.**

- There is no collaborative/CRDT/offline document sync of record values in this
  repository. "Collaboration" is comments, reactions, drafts, flags and
  notification fanout (`server/packages/contracts/collaboration/src/ports.ts:1-24`),
  and its browser tests exercise those panels, not concurrent field editing.
- Clients do not compute and persist rounded amounts: decimal/money inputs defer
  to the server (`field-input.tsx:121-136`), and the only client decimal module
  is exact display/aggregation arithmetic for lists
  (`packages/contracts/platform/entity-list/src/decimal.ts`).
- The finance runtime resolves rounding by reading `control.rounding_context` and
  `shared.currency` directly inside the posting transaction, uncached
  (`kysely-finance-foundation.ts:19-54`; the runbook states repository reads are
  uncached).
- The sync-shaped machinery exists but is unwired for rounding: a declared cache
  namespace with no reader (`control-services.ts:14-24`), a default no-op
  invalidator (`register-services.ts:1544,1644`), and `control.rounding.*` outbox
  events with a `cacheInvalidation` payload and no consumer
  (`control-repository-db.ts:81-100`). The invalidation worker supports only the
  `metadata` and `authorization` kinds (`server/packages/platform/jobs/src/invalidation-worker.ts:3,183-194`),
  its repository claims only `event.authorization_invalidation_outbox` and
  `event.descriptor_invalidation_outbox`
  (`server/packages/platform/metadata/src/invalidation.ts:44-56`), and
  `pg_notify('athyper_invalidation')` fires only for those two outboxes
  (`server/db/ddl/common/event/07_functions.sql:427`,
  `event/08_triggers.sql:95-98`). The generic `event.outbox` has no notify trigger
  and no push path. Parameters (`control.parameters`) are in the same position.

So the correct mental model is: **the database is the only enforcement point;
the sync layer currently carries rounding invalidation coordinates that nothing
subscribes to.** That is safe today (uncached reads cannot go stale) but fragile
as an architecture, because the declared invalidation contract is unverified.

---

## 7. Evidence index (fast re-verification)

```bash
# DDL and guards
sed -n '1358,1440p' server/db/ddl/common/control/03_tables.sql
sed -n '48,76p'    server/db/ddl/common/control/02_domains.sql
sed -n '615,670p'  server/db/ddl/common/control/07_functions.sql
sed -n '1,75p'     server/db/ddl/common/control/14_admin_integrations.sql
sed -n '205,225p'  server/db/ddl/common/control/11_grants.sql

# API + repository
sed -n '1,290p' server/packages/platform/control-admin/src/rounding-control.ts
sed -n '1,180p' server/packages/platform/control-admin/src/kysely-rounding-repository.ts

# Runtime
sed -n '1,110p' server/packages/foundation/src/decimal-rounding.ts
sed -n '1,130p' server/packages/services/finance/src/shared/rounding-resolver.ts
sed -n '19,54p' server/packages/services/finance/src/shared/kysely-finance-foundation.ts

# Field-level gap
sed -n '390,405p' server/packages/platform/metadata/src/native-runtime-projection.ts
sed -n '55,72p'   server/packages/services/records/src/field-validation.ts
sed -n '675,695p' server/packages/planes/studio/meta-entity-authoring/src/native-release-compilation.ts
sed -n '15,30p'   packages/platform/entity/runtime/form-detail/src/form-values.ts

# Bypassed finance arithmetic
sed -n '25,40p'   server/packages/services/finance/src/inventory/inventory-service.ts
sed -n '60,72p'   server/packages/services/finance/src/closing/closing-services.ts
sed -n '98,108p'  server/packages/services/finance/src/budget/budget-service.ts
sed -n '1,12p'    server/packages/services/finance/src/shared/decimal.ts

# Enablement and sync hooks
grep -n 'routesEnabledByDefault' server/packages/platform/control-admin/src/index.ts server/packages/services/finance/src/index.ts
grep -n 'invalidate: async' server/apps/platform-host/src/composition/register-services.ts
grep -n 'finance_config.manage' -r server --include=*.sql --include=*.json

# Seeds with no dispatch rows
grep -rn 'rounding_context' server/db --include=*.sql
```
