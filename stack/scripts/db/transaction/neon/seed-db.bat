@echo off
REM =======================================================================
REM Athyper — Database Seed Script (Windows)
REM Location:
REM   stack\scripts\db\transaction\neon\seed-db.bat
REM Seeds the application database via the provisioning system.
REM
REM Usage:
REM   seed-db.bat                 # Run all stages (DDL + platform seed + blueprints + tenants)
REM   seed-db.bat --all           # Same as default
REM   seed-db.bat --ddl-only      # Stage 1 only — DDL (schemas/tables/indexes/triggers)
REM   seed-db.bat --system-only   # Stage 2 only — 010_platform/ (platform seed; DDL must exist)
REM   seed-db.bat --no-demo       # Stages 1+2   — DDL + platform seed only
REM                               #   blueprints (020_universal/ 030_industry/) and
REM                               #   tenant data (040_tenants/) are skipped
REM   seed-db.bat --demo-only     # Stages 1+2+3 — same as default; alias for clarity
REM   seed-db.bat --reset         # DROP all app schemas + tracking tables, then re-seed
REM                               #   Drops: shared control master document ledger log event
REM                               #          governance snapshot aggregate schemas, plus
REM                               #          public.schema_provisions and public.migrations.
REM                               #   can combine: --reset --ddl-only  (drop + Stage 1 only)
REM                               #                --reset --no-demo   (drop + Stages 1+2 only)
REM   seed-db.bat --drop-only     # DROP all app schemas + tracking tables only (no re-seed)
REM   seed-db.bat --status        # Read-only report — shows OK / PENDING / CHANGED per file
REM   seed-db.bat --force         # Re-run all stages even if checksum unchanged
REM   seed-db.bat --stage=N       # Low-level: run explicit stage(s) — N is 1, 2, or 3
REM                               #   e.g. --stage=1 --stage=2 for DDL + platform seed only
REM   seed-db.bat --tenant-id=UUID  # Set app.seed_tenant_id for the entire Stage 3 session
REM                               #   Blueprints (020_universal/ 030_industry/) and tenant
REM                               #   instance files use this UUID to scope their inserts.
REM                               #   Can also be set via SEED_TENANT_ID env var.
REM                               #   If omitted, each SQL file uses its own baked-in UUID
REM                               #   (correct for the demo tenant; required for new clients).
REM
REM Environment variables:
REM   DATABASE_ADMIN_URL   Direct Postgres connection URL. Must NOT point to PgBouncer.
REM                        e.g. postgres://athyperadmin:pass@localhost:5432/athyper_dev1
REM                        Resolution order: shell env → stack\env\.env → (error)
REM                        Docker-internal hostnames are rewritten to localhost automatically:
REM                          @db:           → @localhost:
REM                          @dbpool-apps:  → @localhost:
REM                          @dbpool-session: → @localhost:
REM                        Script aborts if the resolved URL targets a PgBouncer port
REM                        (:6432 or :6433) — migrate.ts requires a direct connection.
REM
REM   DB_HOST              Fallback host when DATABASE_ADMIN_URL is absent (default: localhost)
REM                        Used to build: postgres://DB_USER:DB_PASSWORD@DB_HOST:DB_PORT/DB_NAME
REM   DB_PORT              Fallback port (default: 5432). Must be direct Postgres, not PgBouncer.
REM   DB_NAME              Fallback database name (default: athyper_dev1)
REM   DB_USER              Fallback database user (default: athyperadmin)
REM   DB_PASSWORD          Fallback password. Resolution order: shell env → stack\env\.env
REM                        Required when DATABASE_ADMIN_URL is not set.
REM
REM   SEED_TENANT_ID       UUID of target tenant for Stage 3 provisioning.
REM                        Resolution order: shell env → stack\env\.env
REM                        Overridden by --tenant-id=UUID CLI flag.
REM                        If omitted, each Stage 3 SQL file uses its own baked-in UUID.
REM
REM Stage layout (migrate.ts):
REM   Stage 1 — DDL        : all dirs under server/db/sql/ except 900_seed_data/
REM                          Sub-stage order: 00_platform → public → 00_bootstrap →
REM                          shared/01_tables → shared/02_pre_constraint + shared/05_functions →
REM                          */01_tables → 02_pre_constraint → 03_constraints → 04_indexes →
REM                          05_functions → 06_triggers → 07_views → 08_rls → 99_security
REM   Stage 2 — Platform   : 900_seed_data/010_platform/
REM                          Seed order: 000_bootstrap → 000_lookups →
REM                          001_global_reference → 002_permission_model → 003_control →
REM                          003_master → 004_entity_engine → 005_domain_registrations →
REM                          006_system_tenant
REM   Stage 3 — Blueprint  : 900_seed_data/020_universal/  (TIER 1 foundation + TIER 2a COA)
REM                        : 900_seed_data/030_industry/   (TIER 2b industry packs + TIER 3 modules)
REM             Tenant     : 900_seed_data/040_tenants/{client}/
REM                          Per-client order: 000_tenant.sql → 001_tenant_profile.sql →
REM                          100_org_structure → 200_finance → 300_governance →
REM                          800_subscriptions → 900_principals → 950_rbac →
REM                          ap_non_po_demo → entity_engine
REM                          Root-level .sql files (e.g. 000_tenant.sql) run before
REM                          subdirectory contents — all entries sort alphabetically.
REM                          Subdirs starting with _ (e.g. _template) are skipped.
REM
REM Requires: Node.js with tsx available (npx tsx)
REM           DATABASE_ADMIN_URL must be a DIRECT Postgres connection — not PgBouncer.
REM           DDL (CREATE SCHEMA, ALTER TABLE …) fails over a pooled connection.
REM =======================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

pushd "%SCRIPT_DIR%\..\..\..\.." >nul
set "STACK_DIR=%CD%"
popd >nul

pushd "%STACK_DIR%\..\server" >nul 2>&1
if errorlevel 1 (
    echo ERROR: server directory not found at "%STACK_DIR%\..\server"
    echo Ensure the full repo is cloned ^(stack\ and server\ must be siblings^).
    exit /b 1
)
set "SERVER_DIR=%CD%"
popd >nul

if exist "%STACK_DIR%\env\.env" (
    set "ENV_FILE=%STACK_DIR%\env\.env"
) else (
    set "ENV_FILE=%STACK_DIR%\env\.env.example"
)

echo.
echo === Athyper Database Seed ===

REM ---------------------------------------------------------------------------
REM Read DATABASE_ADMIN_URL — environment variable takes precedence over .env file
REM ---------------------------------------------------------------------------
if "%DATABASE_ADMIN_URL%"=="" (
    if exist "%ENV_FILE%" (
        for /f "tokens=1* delims==" %%a in ('findstr "^DATABASE_ADMIN_URL=" "%ENV_FILE%" 2^>nul') do (
            set "DATABASE_ADMIN_URL=%%b"
            set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:"=!"
        )
    )
)

if "%DATABASE_ADMIN_URL%"=="" (
    REM Build URL from individual vars
    if "%DB_HOST%"=="" set "DB_HOST=localhost"
    if "%DB_PORT%"=="" set "DB_PORT=5432"
    if "%DB_NAME%"=="" set "DB_NAME=athyper_dev1"
    if "%DB_USER%"=="" set "DB_USER=athyperadmin"

    if "%DB_PASSWORD%"=="" (
        if exist "%ENV_FILE%" (
            for /f "tokens=1* delims==" %%a in ('findstr "^DB_PASSWORD=" "%ENV_FILE%" 2^>nul') do (
                set "DB_PASSWORD=%%b"
                set "DB_PASSWORD=!DB_PASSWORD:"=!"
            )
        )
    )

    if "%DB_PASSWORD%"=="" (
        echo Error: Cannot determine database credentials.
        echo Set DATABASE_ADMIN_URL or DB_PASSWORD in stack\env\.env
        echo Example: DATABASE_ADMIN_URL=postgres://athyperadmin:pass@localhost:5432/athyper_dev1
        exit /b 1
    )

    set "DATABASE_ADMIN_URL=postgres://!DB_USER!:!DB_PASSWORD!@!DB_HOST!:!DB_PORT!/!DB_NAME!"
)

REM ---------------------------------------------------------------------------
REM Rewrite Docker-internal hostnames to localhost (this script runs on the host).
REM The .env file uses Docker service names (e.g. @db:5432) that only resolve
REM inside the Docker network. Rewrite @db:/@dbpool-*: to @localhost: so the
REM host-side Node process can connect. PgBouncer ports (:6432/:6433) are
REM checked and rejected separately below — DDL requires a direct connection.
REM ---------------------------------------------------------------------------
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@db:=@localhost:!"

REM Warn and abort if the URL still routes through PgBouncer (ports 6432/6433).
REM migrate.ts explicitly requires a direct connection — PgBouncer breaks DDL.
echo !DATABASE_ADMIN_URL! | findstr /C:":6432" /C:":6433" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo ERROR: DATABASE_ADMIN_URL appears to use a PgBouncer port ^(:6432 or :6433^).
    echo        migrate.ts requires a direct Postgres connection ^(port 5432^).
    echo        Set DATABASE_ADMIN_URL to the direct DB URL, e.g.:
    echo          postgres://athyperadmin:^<pass^>@localhost:5432/athyper_dev1
    exit /b 1
)
REM Rewrite dbpool hostnames only after the port check (so the error message is
REM actionable — user sees the original pooler address, not localhost).
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@dbpool-apps:=@localhost:!"
set "DATABASE_ADMIN_URL=!DATABASE_ADMIN_URL:@dbpool-session:=@localhost:!"

REM ---------------------------------------------------------------------------
REM Read SEED_TENANT_ID — environment variable takes precedence over .env file
REM Optional — only used by Stage 3 (blueprint + tenant provisioning).
REM ---------------------------------------------------------------------------
if "%SEED_TENANT_ID%"=="" (
    if exist "%ENV_FILE%" (
        for /f "tokens=1* delims==" %%a in ('findstr "^SEED_TENANT_ID=" "%ENV_FILE%" 2^>nul') do (
            set "SEED_TENANT_ID=%%b"
            set "SEED_TENANT_ID=!SEED_TENANT_ID:"=!"
        )
    )
)

REM If --tenant-id=UUID was passed on the command line, it overrides SEED_TENANT_ID.
REM migrate.ts handles that precedence internally; we just ensure the env var is
REM visible as a fallback.

REM Show connection target (mask password) and active variables
for /f "tokens=1,2 delims=@" %%x in ("!DATABASE_ADMIN_URL!") do (
    echo Database : %%y
)
echo Server    : %SERVER_DIR%
if not "%SEED_TENANT_ID%"=="" (
    echo Tenant ID : %SEED_TENANT_ID%
) else (
    echo Tenant ID : (not set — Stage 3 files use baked-in UUIDs)
)
echo Arguments : %*
echo.

REM ---------------------------------------------------------------------------
REM Pass all args directly to migrate.ts.
REM Supported flags:
REM   (no args) / --all / --ddl-only / --system-only / --no-demo / --demo-only
REM   --reset [--ddl-only | --no-demo] / --drop-only / --status / --force
REM   --stage=N  (repeatable, N = 1 | 2 | 3)
REM   --tenant-id=UUID  (sets app.seed_tenant_id for Stage 3; overrides SEED_TENANT_ID)
REM ---------------------------------------------------------------------------
set "MIGRATE_ARGS=%*"
if "!MIGRATE_ARGS!"=="" set "MIGRATE_ARGS=--all"

REM ---------------------------------------------------------------------------
REM Run the provisioner (cd to server/ so node_modules and tsconfig resolve correctly)
REM SEED_TENANT_ID is inherited by the child process automatically.
REM ---------------------------------------------------------------------------
cd /d "%SERVER_DIR%"
npx tsx db/seed/migrate.ts !MIGRATE_ARGS!

if errorlevel 1 (
    echo.
    echo Seed failed!
    exit /b 1
)

echo.
echo === Seed complete ===

endlocal
