# Weekly DB Reset, Re-seed, and Export Runbook

**Purpose:** prove that the committed database DDL, seed data, backup, and restore path can recreate the base product from scratch.

**Cadence:** run once every week until the base version is complete. After base completion, keep this as a release-candidate or monthly regression run.

**Default scope:** full committed baseline: DDL, platform seed, universal/industry blueprints, and all committed tenant folders.

**Local workstation path:** `D:\Products\athyper`

**Run log:** [`weekly-reset-run-log.md`](weekly-reset-run-log.md)

---

## 1. Weekly Operating Model

Run this after the week's DB-affecting changes are merged or stabilized.

Recommended weekly outcome labels:

| Result | Meaning | Release impact |
|---|---|---|
| Green | Backup, reset, seed, status, app smoke, export, and restore comparison all pass | Base remains on track |
| Yellow | Main reset/seed passes, but optional restore compare or non-critical smoke test is incomplete | Fix or explain before next run |
| Red | Backup fails, reset/seed fails, post-status has `PENDING`/`CHANGED`, or app cannot boot | Blocks base completion |

Exit the weekly cycle only after the base candidate has at least two consecutive Green runs and no open P0/P1 seed, DDL, login, or backup defects.

---

## 2. Safety Rules

This exercise is destructive. It drops the application schemas in the target app database.

Do this:

- Run only against local/dev/staging databases intended for reset.
- Take the pre-reset backup first.
- Confirm `DATABASE_ADMIN_URL` points to direct Postgres on port `5432`, not PgBouncer on `6432` or `6433`.
- Record the git commit and backup folder for every weekly run.
- Use the same tenant filter, if any, for reset and post-status.

Do not do this:

- Do not run weekly reset against production.
- Do not skip the backup step.
- Do not use `--force` for the normal weekly run. Keep it for a separate idempotency investigation.
- Do not rely on `DROP DATABASE` as a role cold-start test. PostgreSQL roles are cluster-level and survive database drops.

---

## 3. Prerequisites

Required tools on the workstation:

- Docker stack or local Postgres is running.
- Node and pnpm dependencies are installed.
- Git Bash is installed, because `backup-all.bat` calls `backup-all.sh`.
- `pg_dump`, `pg_restore`, and `psql` are available from Git Bash or PATH.
- For local Docker stacks, `backup-all.sh` can fall back to `pg_dump` inside the Postgres container when host `pg_dump` is not installed.
- `stack/env/.env` has usable database credentials.

Confirm from PowerShell or CMD:

```cmd
cd /d D:\Products\athyper
git rev-parse --short HEAD
git status --short
```

The worktree does not have to be clean, but the weekly report must record whether it was clean.

---

## 4. Choose Run Scope

Use the full baseline run unless you intentionally want a narrower demo-only run.

### Option A: Full Baseline

This is the weekly default. It validates every committed tenant folder under `server/db/tenants`.

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --reset --all
```

### Option B: Demo-Only Smoke

Use this for a faster mid-week check, not as the weekly base gate.

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --reset --all --tenant=010_demo
```

Post-status must use the same scope:

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --status --tenant=010_demo
```

---

## 5. Execution Plan

### Step 1: Start Run Log

Record these before touching the database:

```text
Run date:
Operator:
Environment:
Git branch:
Git commit:
Worktree status:
Run scope: full baseline / demo-only
Pre-reset backup folder:
Post-seed backup folder:
Result: Green / Yellow / Red
Issues opened:
```

### Step 2: Pre-Reset Backup

```cmd
cd /d D:\Products\athyper
stack\scripts\db\backup-all.bat --no-upload
```

Expected:

- All 7 databases dump successfully.
- A timestamped folder is created under `ATHYPER_BACKUP_ROOT`.
- A `SHA256SUMS` manifest is written.

If this fails, stop. Do not reset.

### Step 3: Baseline Provision Status

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --status
```

Expected:

- This may show `PENDING` or `CHANGED` before the reset.
- Capture the totals. This is the pre-wipe baseline.

Note: on an already provisioned DB this is a status check. On a brand-new DB it may create `public.schema_provisions`.

### Step 4: Full Reset and Re-seed

Default weekly command:

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --reset --all
```

Expected:

- Drops app schemas: `shared`, `control`, `master`, `document`, `ledger`, `log`, `event`, `governance`, `snapshot`, `aggregate`.
- Drops tracking tables: `public.schema_provisions` and `public.migrations`.
- Re-runs Phase 1 DDL.
- Re-runs Phase 2 platform seed.
- Re-runs Phase 3 blueprint and tenant seed.
- Exits with code 0.

Typical runtime: 3-8 minutes, longer when global reference data changes.

If it fails:

- Save the failing file name from the JSON log line `migrate_failed`.
- Save the SQL error text.
- Mark the weekly run Red.
- Do not continue to post-seed export until the failure is understood.

### Step 5: Post-Reset Status

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --status
```

Expected:

- `Pending: 0`
- `Changed: 0`
- Every tracked file is `OK`

If a file shows `CHANGED`, treat it as a seed tracking defect or a file modified after the reset. Decide whether the fix is a repair seed, an explicit migration, or rerunning the current reset after the file change is complete.

### Step 6: Application Smoke Test

Start the runtime server:

```cmd
cd /d D:\Products\athyper\server
pnpm run dev
```

Or from repo root:

```cmd
cd /d D:\Products\athyper
pnpm --filter @athyper/runtime-server dev
```

Smoke endpoints:

```text
GET /livez   -> 200, process alive
GET /readyz  -> 200, dependencies ready
GET /health  -> 200, alias for readiness
```

If checking through the Neon plane app, use:

```text
/api/admin/health
```

That route requires a logged-in session.

Manual Neon UI smoke checklist:

- Login succeeds for the demo tenant user.
- Finance GL page loads: `/finance/gl`.
- Journal entries are visible.
- A record/entity search returns expected seed records.
- At least one seeded AP or finance workflow page opens without metadata errors.

### Step 7: Post-Seed Export

```cmd
cd /d D:\Products\athyper
stack\scripts\db\backup-all.bat --no-upload
```

Expected:

- A second timestamped dump folder is created.
- `athyper_neon_<timestamp>.dump` exists.
- The manifest includes all dump files.

Record this folder as the post-seed snapshot for the week.

### Step 8: Restore to Compare Database

This step is optional for quick smoke, but required for a Green weekly base gate.

Find the newest app dump. In PowerShell:

```powershell
$backupRoot = (Select-String -Path stack\env\.env -Pattern '^ATHYPER_BACKUP_ROOT=' | Select-Object -First 1).Line.Split('=', 2)[1].Trim('"')
$latestRun = Get-ChildItem -Path $backupRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
$neonDump = Get-ChildItem -Path $latestRun.FullName -Filter 'athyper_neon_*.dump' | Select-Object -First 1
$neonDump.FullName
```

Create a fresh compare DB:

```powershell
$env:PGPASSWORD = "<DB_ADMIN_PASSWORD>"
psql -h localhost -p 5432 -U athyperadmin -d postgres -c "DROP DATABASE IF EXISTS athyper_neon_compare WITH (FORCE);"
psql -h localhost -p 5432 -U athyperadmin -d postgres -c "CREATE DATABASE athyper_neon_compare OWNER athyperadmin;"
pg_restore -h localhost -p 5432 -U athyperadmin -d athyper_neon_compare --no-owner --no-privileges $neonDump.FullName
```

Expected:

- Restore completes with no errors.
- Warnings only if already understood and recorded.

### Step 9: Schema Diff

Dump schema-only views of live and compare:

```powershell
New-Item -ItemType Directory -Force -Path .weekly-db-checks | Out-Null
$env:PGPASSWORD = "<DB_ADMIN_PASSWORD>"
pg_dump -h localhost -p 5432 -U athyperadmin --schema-only --no-owner --no-privileges -d athyper_neon -f .weekly-db-checks\live.schema.sql
pg_dump -h localhost -p 5432 -U athyperadmin --schema-only --no-owner --no-privileges -d athyper_neon_compare -f .weekly-db-checks\compare.schema.sql
git diff --no-index -- .weekly-db-checks\live.schema.sql .weekly-db-checks\compare.schema.sql
```

Expected:

- No meaningful schema diff.
- If there is a diff, classify it:
  - Expected pg_dump ordering/noise: record and ignore.
  - Real object mismatch: mark Yellow or Red and open a defect.

### Step 10: Idempotency Spot Checks

Run the platform stage twice:

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --system-only
stack\scripts\db\transaction\neon\seed-db.bat --system-only
```

Expected:

- Second run skips already-executed files by checksum.
- Post-status still shows `Pending: 0`, `Changed: 0`.

For DDL-only ordering checks:

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --reset --ddl-only
stack\scripts\db\transaction\neon\seed-db.bat --all
stack\scripts\db\transaction\neon\seed-db.bat --status
```

Use this variant only when specifically validating DDL order; it is destructive.

### Optional Step 11: Generate Ordered SQL From Backup

Use this when you want clean restore-order SQL from the post-seed dump.

The safe order is:

1. Pre-data schema: schemas, types, tables, functions, and sequences.
2. Data: PostgreSQL `COPY` blocks. Keep provision tracking data separate from application data.
3. Post-data objects: constraints, indexes, triggers, RLS, policies, and materialized view refreshes.

Keep this output as a review/restore artifact unless it has been curated back into the provisioner folder structure. A pg_dump archive knows PostgreSQL restore order; it does not know the product's hand-authored phase boundaries.

---

## 6. Weekly Completion Checklist

Mark the run Green only when all required items pass:

- [ ] Pre-reset backup completed.
- [ ] Pre-reset status captured.
- [ ] `--reset --all` completed with exit code 0.
- [ ] Post-reset status shows `Pending: 0` and `Changed: 0`.
- [ ] Runtime health endpoints pass.
- [ ] Login and finance smoke tests pass.
- [ ] Post-seed backup completed.
- [ ] Restore to compare DB completed.
- [ ] Schema diff is clean or explained.
- [ ] Issues were opened for every failure or unexplained warning.
- [ ] Run log includes git commit and backup folders.

---

## 7. Failure Triage

| Failure | First action |
|---|---|
| Backup fails | Stop. Fix backup credentials, `pg_dump`, or DB connectivity before reset. |
| Reset fails during DDL | Use the failing file from `migrate_failed`; fix ordering or missing dependency. |
| Reset fails during seed | Check whether prerequisite platform or tenant data is missing; add repair/migration seed if needed. |
| Post-status has `PENDING` | The file was discovered but not applied. Check scope flags and failure logs. |
| Post-status has `CHANGED` | A tracked file changed after application. Rerun reset after finalizing file, or create explicit repair/migration. |
| App health fails | Check direct DB URL, Redis, IAM, object storage, and runtime logs. |
| Login fails | Check Keycloak realm/user seed separately; app DB reset does not reset IAM. |
| Restore fails | Verify exact dump path, compare DB exists, and `pg_restore` version compatibility. |
| Schema diff appears | Determine whether it is pg_dump ordering noise or a real object mismatch. |

---

## 8. Local Rollback From Pre-Reset Backup

Use only if the weekly reset leaves the local database unusable and you need to restore the pre-reset snapshot.

```powershell
$env:PGPASSWORD = "<DB_ADMIN_PASSWORD>"
$preResetDump = "D:\Stack\athyper\backups\<timestamp>\athyper_neon_<timestamp>.dump"
psql -h localhost -p 5432 -U athyperadmin -d postgres -c "DROP DATABASE IF EXISTS athyper_neon WITH (FORCE);"
psql -h localhost -p 5432 -U athyperadmin -d postgres -c "CREATE DATABASE athyper_neon OWNER athyperadmin;"
pg_restore -h localhost -p 5432 -U athyperadmin -d athyper_neon --no-owner --no-privileges $preResetDump
```

After rollback:

```cmd
stack\scripts\db\transaction\neon\seed-db.bat --status
```

Record rollback in the weekly log and keep the failed post-reset dump if one exists.

---

## 9. Base Completion Gate

The base version can be considered DB-ready when:

- Two consecutive weekly full-baseline runs are Green.
- No open P0/P1 reset, seed, login, or backup defects remain.
- All expected base tenant data is visible in the app.
- Restore-to-compare passes from the exported dump.
- The team agrees no pending DDL or seed shape changes remain for base.

After that, change this exercise from weekly to release-candidate validation, or keep it monthly as a regression check.
