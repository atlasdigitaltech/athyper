# athyper Rebuild Plan — Meta-Entity-Driven Country Application

Status: **DRAFT — for owner manual review. Nothing has been changed yet.**

---

## 1. Objective

Replace the current `athyper` monorepo (which mixes bespoke code with the
meta-entity framework) with a **fresh, purely meta-entity-driven** application,
scoped to the **Country** entity plus its **lookup reference entities**
(`currency`, `language`, `locale`, `timezone`, `state_region`).

Everything the app renders must come from **published Meta Entity metadata**.
There must be **no bespoke entity pages, no hardcoded entity branches, and no
parallel API/provider stacks**.

## 2. Scope

### In scope

| Item | Notes |
| --- | --- |
| Shared schema tables | `shared.country` + the 5 lookup tables it links to |
| Meta Entity metadata | `country`, `currency`, `language`, `locale`, `timezone`, `state_region` |
| Shared Entity Framework | generic list/read runtime (server) + generic list/detail renderer (client) |
| Publication | Studio authors → independent review/approve → publish to Neon/Mesh/Studio |
| Docker | fresh, minimal (Postgres + API + web), no dependency on `deploy/` stack |
| DDL | copied from current repo, then trimmed to the in-scope tables |

### Out of scope (dropped)

- Bespoke app pages and the custom history explorer (`/app/history`).
- All non-Country entities: `business_partner` family (mdg/bp), `contact`,
  `location`, `iam` principals, `ppl/workforce`, bank/commodity/industry/classification.
- `packages/product-deprecated`, `packages/planes`, legacy `packages/contracts/*`.
- The `deploy/` Stack controller and multi-node orchestration.
- MFA / step-up flows (see §9 — requires explicit owner approval, out of scope here).
- AI insights/actions initially (metadata declares them; runtime can be added later).

## 3. Directory & backup strategy

1. Back up current tree: `mv ~/src/athyper ~/src/athyper_backup` (preserves git
   history **and** the current uncommitted metadata changes on
   `recovery/entity-framework-cleanup-20261003`).
2. Create fresh `~/src/athyper` and initialize a new git repo there.
3. Build the new project entirely in the fresh directory. The backup is read-only
   reference for DDL and metadata shape.

> Note: the agent cannot rename its own workspace root under the current
> sandbox, so the rename is a single manual owner command (or escalated in-session).

## 4. Target architecture

```
athyper/                          (fresh repo)
├── docker-compose.yml            # postgres16 + api + web
├── pnpm-workspace.yaml
├── package.json                  # pnpm 10, Node 24
├── db/
│   ├── ddl/
│   │   ├── _database/            # extensions, service roles, schema provisions
│   │   ├── shared/               # shared schema: country + lookups (+ trim)
│   │   ├── runtime_meta/         # entity metadata tables (the framework's spine)
│   │   ├── authz/                # permissions (trimmed)
│   │   ├── audit/                # audit events/snapshots (trimmed)
│   │   └── control/              # lookup domains (trimmed)
│   └── migrate.ts                # ordered DDL runner + seed entrypoint
├── metadata/
│   ├── entities/common/reference/
│   │   ├── country/              # entity.json, definition.json, core.json,
│   │   ├── currency/             #   placement.json, localization.json,
│   │   ├── language/             #   capabilities.json, activity.json
│   │   ├── locale/
│   │   ├── timezone/
│   │   └── state_region/
│   ├── schemas/                  # JSON Schema for entity-source/2, compiled-artifact/2.0
│   ├── contracts/                # governed contracts + hash ledger
│   ├── access/                   # permission bindings
│   ├── review/                   # independent review records
│   └── manifest.json
├── packages/
│   └── entity/
│       ├── contracts/            # shared types: EntitySource, CompiledArtifact, Placement
│       ├── runtime/              # generic list/read engine (server)
│       ├── ui/                   # generic list/detail renderer (client)
│       └── publication/          # compile + review + publish pipeline
├── apps/
│   ├── studio/                   # authoring + publication plane (Next.js)
│   ├── neon/                     # tenant operating plane (Next.js)
│   └── mesh/                     # partner plane (Next.js)
├── server/                       # API: entity list/read endpoints only
└── tests/                        # contract + framework tests
```

## 5. Phase 1 — Docker infrastructure (fresh)

- `docker-compose.yml` with three services: `postgres` (16, extensions used by
  shared DDL), `api` (Node/Express), `web` (Next.js).
- No reuse of `deploy/` controller, catalogs, or instance definitions.
- Success: `docker compose up` → Postgres reachable, `_database` extensions applied.

## 6. Phase 2 — DDL (copy + trim)

Copy these trees from the backup, then **trim to Country + 5 lookups**:

- `server/db/ddl/common/_database/` — extensions, service roles, schema provisions.
- `server/db/ddl/common/shared/` — `00_schema`, `01_bootstrap`, `02_domains`,
  `03_tables`, `05_constraints`, `06_indexes`, `07_functions`, `08_triggers`,
  `10_rls`, `11_grants`, `12_reference_seed`, and `reference-data/`
  (`001_country`, `002_state_region`, `003_currency`, `005_locale`, `…language/timezone`).
- `server/db/ddl/common/runtime_meta/` — entity metadata tables (kept as-is; this
  is the framework spine).
- `server/db/ddl/common/authz/`, `audit/`, `control/` — trimmed to what list/read,
  RLS, and audit need for reference entities.

Trim rules: drop bank/bp/commodity/industry/master/ai/document/event/governance/log/
ops/snapshot tables and their seeds. Keep only tables referenced by Country/lookups
and the entity runtime.

Success: `tsx db/migrate.ts --all` applies a clean schema; `shared.country` +
5 lookups seeded.

## 7. Phase 3 — Shared Entity Framework + frontend + publication

### 7.1 Governed metadata (the model we are reproducing, unchanged in spirit)

- `entity.json` → `athyper.entity-source/2`: `entityCode`, `authoringOwnership`
  (`platform`), `entityClass` (`reference`), `ownershipModel` (`system`),
  `targets { declared/required/recommended }` = `studio/neon/mesh`, and references
  to `definition.json`, `core.json`, `placement.json`, `localization.json`,
  `capabilities.json`, `activity.json`.
- `definition.json` → `athyper.shared-reference-product/1`: `runtimeBindings`
  (`list`/`read` → `entity.record.list.v1` / `entity.record.read.v1`,
  resolver `tenant.record.v1`), `fields[]`, `columns[]`, `searchFields[]`,
  `navigation.tabs[].sectionKeys[]`, `sections[]`, `codeField`/`titleField`.
- `core.json` → compiled artifact binding fields to `shared.country` columns,
  `idField`, `referencePicker`, `validationAuthority`, `projectionPolicy`.
- `placement.json` → `{ plane, workspace, module, routeSlug }` per plane
  (e.g. `neon/mdg/org/countries`, `studio/foundation/rel/countries`,
  `mesh/core/rel/countries`).
- JSON Schemas for every artifact + **validation that fails closed** on invalid
  or unpublished metadata.

### 7.2 Server runtime

- Generic `GET /entity/:code` (list) and `GET /entity/:code/:id` (read) driven
  **only** by `runtime_meta` published records — no per-entity handlers.
- Resolves `codeField`/`titleField`/`columns`/`searchFields` from metadata;
  enforces `storageObject` binding and `projectionPolicy`.
- **No UUID presentation**: list identity comes from `codeField` + `titleField`
  (e.g. `US — United States`), never raw `id`.
- Permissions: read the exact permission code from Meta Entity properties; an
  **undefined** permission means access for everyone; a **defined** permission is
  enforced through the shared authorization path. No inferred defaults, no
  entity-name-derived permission codes.

### 7.3 Frontend renderer

- One generic list view + one generic detail view in `packages/entity/ui`,
  consumed by all three planes (no duplicated bespoke pages).
- List: `columns[]`, search over `searchFields[]`, sort, pagination, density,
  row identity — all metadata-driven.
- Detail: `navigation.tabs[].sectionKeys[]` → the shared Navigation Tabs /
  Section Tabs components; renders `sections[]` field groups in declared order.
- Hard rule enforced in shared validation: **UUIDs never appear in any list
  view, saved view, embedded list, card, hint, or fallback label.**

### 7.4 Publication (Studio → Neon/Mesh/Studio)

- Studio is the **platform-owned authoring surface** (product defaults).
- Author proposes → **Platform Owner independently reviews/approves** → publish
  to declared `targets` (Neon/Mesh/Studio) as **source releases with identities
  and hashes** (mirror the current governed pipeline, simplified).
- Tenant extensions (later) remain isolated to their tenant; not in this build.
- Success: changing Country metadata in Studio, approving it, and observing the
  change in Neon/Mesh/Studio **without touching application code**.

## 8. Milestones & verification

| # | Milestone | Verifiable outcome |
| --- | --- | --- |
| M0 | Backup + scaffold + Docker | fresh repo; `docker compose up` healthy |
| M1 | DDL copy/trim + migrate + seed | `shared.country` + 5 lookups seeded |
| M2 | Metadata schemas + validation + Country import | Country artifacts validate & import into `runtime_meta` |
| M3 | Server list/read engine | `GET /entity/country` + `…/:code` return metadata-driven results |
| M4 | Frontend list/detail | Country renders list + detail in Neon, no UUIDs, tabs/sections correct |
| M5 | Publication pipeline | Studio → approve → Neon/Mesh/Studio, same metadata renders everywhere |
| M6 | Onboard the 5 lookups | new entity added with **metadata only**, zero app code changes |
| M7 | Hardening + tests + docs | RLS/authz, audit, no-UUID validation, contract tests green |

Each milestone ends with a small verification command; I report the exact result
rather than assuming it works.

## 9. Risks & decisions

1. **Rename mechanics** — the sandbox can't rename its own root; owner runs one
   `mv` command (or grants escalation).
2. **Auth/IAM** — reference entities with no defined permission mean "everyone"
   (per AGENTS.md). I propose starting **without** Keycloak/MFA for M0–M6 and
   adding the shared authorization path in M7. Confirm this sequencing.
3. **MFA** — explicitly **not** introduced; any future MFA requires separate
   owner approval. No MFA code will be written in this build.
4. **Effort honesty** — the current framework is large (compiled artifacts,
   successor releases, canaries, trust provisioning). I will reproduce the
   *faithful minimum* for a single reference entity + lookups, not the entire
   plane/deploy surface. Deviations from the current behavior will be called out.
5. **"All shared-schema tables"** — you asked for the framework to cover all
   shared-schema tables. I read this as "generic over the shared schema", but the
   **onboarded** entities are Country + 5 lookups. If you want *every*
   `common/reference` table onboarded now (bank/commodity/industry/etc.), that's a
   scope expansion — confirm.

## 10. Success criteria

1. Zero hardcoded entity names/allowlists in runtime, UI, routing, authz, or SQL.
2. Country + 5 lookups render end-to-end in Neon, Mesh, and Studio from published
   metadata only.
3. Onboarding a new reference entity = **metadata files only**; no code change.
4. Publication requires independent review/approve and produces hashed source
   releases.
5. No UUIDs visible anywhere in list views.

## 11. Owner decisions needed before I start

- [ ] **Rename**: run the one-liner yourself, or grant in-session escalation?
- [ ] **Auth timing**: defer IAM/Keycloak to M7 (recommended), or in from M0?
- [ ] **Entity breadth**: Country + 5 lookups only (recommended), or all
      `common/reference` tables?
- [ ] **Tech stack**: confirm Next.js + Express + Postgres 16, pnpm 10, Node 24
      (matches the current repo), or change?
