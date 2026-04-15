# 45-08 Developer Onboarding Validation

**Task:** D3 Developer Onboarding validation — simulated new team member follows guide
end-to-end: clone, setup, run, create test entity. Document friction points.  
**Validated by:** Claude Code (automated walkthrough + file-system cross-check)  
**Date:** 2026-04-15  
**Scope:** ALL modules  
**Role:** Tech Writer / Non-author validation

---

## Validation Method

Simulated a net-new developer with no prior repo knowledge. Walked through
`docs/developer-onboarding.md` step by step, cross-checking every command,
file path, environment variable, and SQL statement against the actual repo
state. Friction points were categorised by severity and immediately fixed.

---

## Friction Points Found

### F-01 — CRITICAL: Wrong script paths for mesh startup

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §3 Step 1, `mesh/README.md` Quick Start |
| **Guide said** | `cd mesh/scripts && bash up.sh && bash init-data.sh` |
| **Reality** | `up.sh` lives at `mesh/scripts/stack/up.sh`; `init-data.sh` does not exist |
| **Impact** | First command fails; dev is blocked at the very first step |
| **Fix** | Updated both files to use `bash mesh/scripts/stack/up.sh` |

---

### F-02 — CRITICAL: `init-data.sh` does not exist

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §3 Step 1, `mesh/README.md` Quick Start |
| **Guide said** | `bash init-data.sh` initialises DB schema and Keycloak realm |
| **Reality** | No such file. DB seeding is done by `mesh/scripts/db/seed-db.sh` (which itself called `tsx db/seed/migrate.ts`) |
| **Impact** | Dev has no path forward after starting the stack |
| **Fix** | Replaced `init-data.sh` references with `bash mesh/scripts/db/seed-db.sh` in both docs, and updated the onboarding guide to show `tsx db/seed/migrate.ts --all` as the direct equivalent |

---

### F-03 — MAJOR: Wrong step order — `pnpm install` after infra startup

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §3 |
| **Guide said** | Step 1 = start infra → Step 2 = `pnpm install` → Step 3 = migrations |
| **Reality** | `tsx` (used in Step 3) is a workspace devDependency installed by `pnpm install`. Running migrations without deps installed fails with "tsx: not found" |
| **Impact** | Migrations always fail on a clean machine |
| **Fix** | Reordered: Step 1 = `pnpm install` → Step 2 = copy env files → Step 3 = first-time mesh setup → Step 4 = start infra → Step 5 = migrations → Step 6 = dev servers |

---

### F-04 — MAJOR: `DATABASE_ADMIN_URL` missing from `server/.env.example`

| | |
|---|---|
| **File** | `server/.env.example` |
| **Guide said** | Migrations require `DATABASE_ADMIN_URL` (documented in the env vars table) |
| **Reality** | Variable absent from `.env.example`; `cp server/.env.example server/.env` produces a file that does not contain it |
| **Impact** | `tsx db/seed/migrate.ts --all` exits immediately: _"DATABASE_ADMIN_URL — Direct Postgres connection string (required)"_ |
| **Fix** | Added `DATABASE_ADMIN_URL=postgresql://athyperadmin:athyperadmin@127.0.0.1:5432/athyper_dev1` with explanatory comment to `server/.env.example` |

---

### F-05 — CRITICAL: Entity registration SQL in guide had wrong column names

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §4 Step 2 |
| **Guide said** | `INSERT INTO control.entity (id, code, name, table_name, display_name, primary_key, tenant_scoped, schema_version, created_by) VALUES (...)` |
| **Reality** | The actual `control.entity` schema (from `server/db/sql/04_tables/002_control.sql`) has completely different columns: `module_id`, `entity_class`, `ownership_model`, `kind`, `backing_type`, `governance_level`, `security_tier`, `mutability`, `table_schema`, `label_singular`, `label_plural`, etc. Columns `code`, `display_name`, `primary_key`, `tenant_scoped`, `schema_version` do not exist. The same mismatch applied to `control.entity_field` |
| **Impact** | A dev following the guide exactly gets `ERROR: column "code" of relation "entity" does not exist` |
| **Fix** | Replaced the stale SQL with a correct skeleton (verified against `007_upupr_entity_registration.sql` as the canonical pattern), pointed to that file as the reference, and documented the system-principal UUID |

---

### F-06 — MINOR: `<system-principal-uuid>` placeholder was unexplained

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §4 Step 2, §5 |
| **Guide said** | `created_by: '<system-principal-uuid>'` — no explanation of what this value is |
| **Reality** | The bootstrap principal UUID is `00000000-0000-0000-0000-000000000000`, used consistently across all system seed data |
| **Impact** | Dev either leaves a literal placeholder string (SQL error) or guesses a random UUID (foreign-key violation) |
| **Fix** | Replaced every instance of `'<system-principal-uuid>'` with the literal UUID and added an explanatory callout |

---

### F-07 — MINOR: Dead "See Also" links in `mesh/README.md`

| | |
|---|---|
| **File** | `mesh/README.md` bottom section |
| **Guide said** | Links to `../docs/deployment/QUICKSTART.md`, `../docs/deployment/ENVIRONMENTS.md`, `../docs/architecture/OVERVIEW.md` |
| **Reality** | Directories `docs/deployment/` and `docs/architecture/` do not exist |
| **Impact** | 404 when clicked in GitHub/IDE; erodes trust in all other links |
| **Fix** | Replaced dead links with live ones: `docs/developer-onboarding.md` and `docs/runbooks/README.md` |

---

### F-08 — MINOR: `mesh/README.md` directory structure diagram was stale

| | |
|---|---|
| **File** | `mesh/README.md` Directory Structure section |
| **Guide said** | `scripts/up.sh`, `scripts/down.sh`, `scripts/logs.sh`, `scripts/init-data.sh` |
| **Reality** | Scripts live under `scripts/stack/` and `scripts/db/`; `init-data.sh` doesn't exist |
| **Impact** | Dev looks for `scripts/up.sh`, finds nothing, assumes the README is for a different branch |
| **Fix** | Updated diagram to show `setup/`, `stack/`, and `db/` subdirectories with current file names |

---

### F-09 — MINOR: `seed-db.sh` had a broken `SEED_DIR` path

| | |
|---|---|
| **File** | `mesh/scripts/db/seed-db.sh` line 26 |
| **Code** | `SEED_DIR="$(cd "$MESH_DIR/../framework/adapters/db" && pwd)"` |
| **Reality** | `MESH_DIR` is `.../athyper/mesh`, so this resolves to `.../athyper/framework/adapters/db` — a directory that does not exist. The provisioner is at `server/db/seed/migrate.ts` |
| **Impact** | `bash mesh/scripts/db/seed-db.sh` exits with `cd: .../framework/adapters/db: No such file or directory` |
| **Fix** | Changed to `SERVER_DIR="$(cd "$MESH_DIR/../server" && pwd)"`, updated run command to `npx tsx db/seed/migrate.ts $MIGRATE_ARGS`, and added arg-translation logic (`--no-demo` → `--phase=1 --phase=2`, `--demo-only` → `--phase=3`, etc.) |

---

### F-10 — MINOR: DLQ file path reference in worker template was wrong

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §5 |
| **Guide said** | DLQ constants are in `server/src/foundation/jobs/dlq.middleware.ts` |
| **Reality** | Workers in `server/framework/runtime/services/jobs/workers/` import from `"../dlq.middleware.js"`, which resolves to `server/framework/runtime/services/jobs/dlq.middleware.ts` — a different file |
| **Impact** | Confusing when a dev opens the wrong file to cross-reference the API |
| **Fix** | Updated the path reference to `server/framework/runtime/services/jobs/dlq.middleware.ts` |

---

### F-11 — MINOR: No root `README.md` — no entry point on clone

| | |
|---|---|
| **File** | Repository root |
| **Reality** | Cloning the repo and opening it in GitHub/IDE shows an empty landing page |
| **Impact** | Dev has no idea where to start; discovery of `docs/developer-onboarding.md` depends on luck |
| **Fix** | Created `README.md` at repo root with 5-minute setup steps and links to the full guide |

---

### F-12 — MINOR: First-time mesh setup steps were missing from the guide

| | |
|---|---|
| **File** | `docs/developer-onboarding.md` §3 |
| **Guide said** | Jump straight to `up.sh` |
| **Reality** | `up.sh` requires `mesh/data/` subdirectories (created by `create-data-dirs.sh`) and `mesh/env/.env` (created by `setup-env.sh`) to be present first. Both scripts live in `mesh/scripts/setup/` |
| **Impact** | `up.sh` silently starts containers that fail health checks because volume mount paths are missing |
| **Fix** | Added explicit "Step 3 — First-time mesh setup" with `create-data-dirs.sh` + `setup-env.sh local` before `up.sh` |

---

## Files Changed

| File | Change type | Friction points addressed |
|------|-------------|--------------------------|
| `docs/developer-onboarding.md` | Updated | F-01, F-02, F-03, F-05, F-06, F-10, F-12 |
| `server/.env.example` | Updated | F-04 |
| `mesh/README.md` | Updated | F-07, F-08 (Quick Start, Scripts Reference, Directory Structure, See Also) |
| `mesh/scripts/db/seed-db.sh` | Updated | F-09 |
| `README.md` | Created | F-11 |

---

## Validation Checklist (for re-validation)

Use this checklist after any future changes to onboarding docs.

### Clone + install
- [ ] Repo has a root `README.md` with visible quick-start steps
- [ ] `pnpm install` succeeds on a clean machine

### Environment setup
- [ ] `cp server/.env.example server/.env` produces a file containing `DATABASE_ADMIN_URL`
- [ ] All variables documented in the guide exist in `.env.example`

### Mesh startup
- [ ] `bash mesh/scripts/setup/create-data-dirs.sh` exists and is runnable
- [ ] `bash mesh/scripts/setup/setup-env.sh local` exists and is runnable
- [ ] `bash mesh/scripts/stack/up.sh` exists and is runnable
- [ ] No references to `init-data.sh` in any doc

### Migrations
- [ ] `tsx db/seed/migrate.ts --all` (from `server/`) completes successfully
- [ ] `bash mesh/scripts/db/seed-db.sh` resolves `SERVER_DIR` to an existing path

### New entity walkthrough
- [ ] DDL example uses `shared.uuidv7()`, `tenant_id`, `status` with correct CHECK constraint
- [ ] Seed SQL columns match actual `control.entity` schema
- [ ] `created_by` uses literal `'00000000-0000-0000-0000-000000000000'` (not a placeholder)
- [ ] File is modelled after an existing seed file referenced in the guide

### RLS + verification
- [ ] `pnpm --filter @athyper/runtime-server rls:verify` is documented and runnable

### Links
- [ ] All links in `mesh/README.md` See Also resolve
- [ ] All links in `developer-onboarding.md` resolve to real files
