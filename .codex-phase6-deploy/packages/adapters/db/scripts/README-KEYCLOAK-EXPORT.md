# Keycloak Export/Import Guide

Complete guide for exporting and importing Keycloak realms in the athyper platform.

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Export Methods](#export-methods)
3. [Import Methods](#import-methods)
4. [Best Practices](#best-practices)
5. [Troubleshooting](#troubleshooting)

---

## Overview

### Available Tools
```
server/packages/adapters/db/scripts/
├── keycloak-export.sh      # JSON export via Keycloak CLI
├── postgres-export.sh      # PostgreSQL database dump
└── keycloak-import.sh      # Universal import script

stack/scripts/db/session/iam/
├── import-iam.sh / .bat    # Primary IAM seed (JSON realm import)
├── export-iam.sh / .bat    # Export committed realm JSON from running IAM
└── seed-iam-credentials.sh # Seed demo/platform-control passwords after import

stack/config/iam/
├── realm-demosetup.json          # athyper realm (clients, users, orgs, roles)
└── realm-platform-control.json   # Platform administration realm
```

### Export Comparison

| Method | Format | Users | Size | Use Case |
|--------|--------|-------|------|----------|
| **JSON Realm Import** | JSON | ✅ Yes | Small | **Primary seed method** (`import-iam.sh`) |
| **JSON Export** | JSON | ✅ Yes | Small | Single realm, portable |
| **PostgreSQL Dump** | SQL | ✅ Yes | Large | Full backup, disaster recovery |
| **Admin Console** | JSON | ❌ No | Tiny | Quick config backup |

---

## Export Methods

### Method 1: JSON Export (Recommended for Realm Configs)

**Best for**: Portable realm exports, Keycloak version migrations

```bash
cd packages/adapters/db/scripts
chmod +x keycloak-export.sh
./keycloak-export.sh
```

**What it exports** (both `athyper` and `platform-control` realms):
- All realm configurations
- Users with credentials
- Clients, roles, groups
- Authentication flows
- Organizations (Keycloak 26+)

**Output**: `./exports/athyper-realm.json`, `./exports/platform-control-realm.json`

**Pros**:
- Official Keycloak format
- Version-agnostic (mostly)
- Small file size
- Easy to share

**Cons**:
- Requires Keycloak runtime
- Can't export master realm easily

---

### Method 2: PostgreSQL Full Dump (Recommended for Backups)

**Best for**: Complete backups, disaster recovery, environment cloning

```bash
cd packages/adapters/db/scripts
chmod +x postgres-export.sh

# Set environment variables (if not using defaults)
export IAM_DB_HOST=localhost
export IAM_DB_PORT=5432
export IAM_DB_NAME=athyper_iam
export IAM_DB_USERNAME=athyperauth

./postgres-export.sh
```

**What it exports**:
- ✅ All realms (master + athyper)
- ✅ Complete database schema
- ✅ All users, sessions, events
- ✅ Keycloak internal tables

**Output**:
- `./exports/dump-athyper_iam-YYYYMMDDHHMM.sql` - Full dump
- `./exports/keycloak-data-only-YYYYMMDDHHMM.sql` - Data only

**Pros**:
- Complete backup
- All realms included
- Direct database access
- Fast

**Cons**:
- Large file size
- PostgreSQL-specific
- Includes internal Keycloak data

---

### Method 3: Admin Console (Quick Config Backup)

**Best for**: Quick configuration snapshots (no users)

1. Open Keycloak Admin Console: `http://localhost/auth` (or your IAM_HOST)
2. Select realm: **athyper**
3. Go to: **Realm Settings** > **Action** > **Partial Export**
4. Configure export:
   - ☑ Export groups and roles
   - ☑ Export clients
   - ☐ Export users (not available in partial export)
5. Click **Export**

**Output**: `athyper-realm-partial.json`

**Pros**:
- No command line needed
- Quick and easy
- Good for config review

**Cons**:
- **No users exported**
- Manual download
- Limited options
- One realm at a time

---

## Import Methods

### Primary: JSON Realm Import (`import-iam.sh`)

The recommended way to seed the IAM database for fresh installations:

```bash
# Linux/macOS
bash stack/scripts/db/session/iam/import-iam.sh

# Windows
stack\scripts\db\session\iam\import-iam.bat
```

This imports both realm JSON files (`realm-demosetup.json` + `realm-platform-control.json`)
into the Keycloak database and restarts the Keycloak container.

### Universal Import Script

```bash
cd packages/adapters/db/scripts
chmod +x keycloak-import.sh

# Import JSON realm export
./keycloak-import.sh json /path/to/realm-export.json

# Import full PostgreSQL dump
./keycloak-import.sh full-dump /path/to/dump.sql
```

### Manual Import Methods

#### JSON Realm Import
```bash
# Via Keycloak CLI
docker run --rm \
  --network athyper-internal \
  -v $(pwd)/exports:/opt/keycloak/data/import \
  -e KC_DB=postgres \
  -e KC_DB_URL=jdbc:postgresql://dbpool-session:6433/athyper_iam \
  -e KC_DB_USERNAME=athyperauth \
  -e KC_DB_PASSWORD=${IAM_DB_PASSWORD} \
  quay.io/keycloak/keycloak:26.5.1 \
  import \
  --dir /opt/keycloak/data/import \
  --override true
```

#### Admin Console Import
1. Go to: **Realm Settings** > **Action** > **Partial Import**
2. Choose JSON file
3. Select import options:
   - ☑ If a resource exists: **Overwrite**
4. Click **Import**

---

## Best Practices

### 1. **Regular Backups**
```bash
# Automated daily backup (crontab example)
0 2 * * * /path/to/postgres-export.sh > /var/log/keycloak-backup.log 2>&1
```

### 2. **Version Control Workflow**
```bash
# After making Keycloak changes, export the realm JSON:
cd packages/adapters/db/scripts
./keycloak-export.sh

# Update the version-controlled realm config
cp exports/athyper-realm.json ../../stack/config/iam/realm-demosetup.json

# Commit
git add stack/config/iam/realm-demosetup.json
git commit -m "Update Keycloak realm: added new client for API v2"
```

### 3. **Environment Promotion**
```
Development → Staging → Production

1. Export from dev:     ./keycloak-export.sh
2. Update realm JSON:   cp exports/... stack/config/iam/realm-demosetup.json
3. Review changes:      git diff
4. Test import:         bash stack/scripts/db/session/iam/import-iam.sh (in staging)
5. Production deploy:   bash stack/scripts/db/session/iam/import-iam.sh (after approval)
```

### 4. **Security Considerations**

⚠️ **Warning**: Exported files contain sensitive data!

```bash
# Encrypt exports before storing
gpg --symmetric --cipher-algo AES256 dump-athyper_iam.sql

# Decrypt before import
gpg --decrypt dump-athyper_iam.sql.gpg > dump-athyper_iam.sql
```

**Never commit to git**:
- Full dumps with user credentials
- Files with sensitive realm secrets
- Files containing real user data

**Safe to commit**:
- Seed files with test users only
- Configuration-only exports
- Sanitized realm configurations

### 5. **Data Sanitization**

Before committing seed files:
```sql
-- Remove real user emails
UPDATE user_entity SET email = CONCAT('user', id, '@example.com');

-- Reset all passwords to test password
DELETE FROM credential;

-- Remove sensitive realm attributes
DELETE FROM realm_attribute WHERE name LIKE '%smtp%';
```

### 6. **Testing Import**

```bash
# Always test in a non-production environment first
bash stack/scripts/stack-profile/up.sh iam

# Import and verify
bash stack/scripts/db/session/iam/import-iam.sh
bash stack/scripts/stack-profile/logs.sh iam -f

# Check for errors
docker exec athyper-stack-dbpool-session-1 \
  psql -U athyperauth -d athyper_iam \
  -c "SELECT id, name, enabled FROM realm;"
```

---

## Troubleshooting

### Export Issues

#### "Permission denied" on scripts
```bash
chmod +x packages/adapters/db/scripts/*.sh
```

#### "Connection refused" to database
```bash
# Check database session pool is running
docker ps --format '{{.Names}}\t{{.Status}}' | grep dbpool-session

# Check database connection
docker exec -it athyper-stack-dbpool-session-1 \
  psql -U athyperauth -d athyper_iam -c '\dt'
```

#### JSON export fails with "realm not found"
```bash
# List available realms
docker exec -it athyper-stack-iam-1 \
  /opt/keycloak/bin/kcadm.sh get realms \
  --no-config --server http://localhost:8080 \
  --realm master --user ${KEYCLOAK_ADMIN} --password ${KEYCLOAK_ADMIN_PASSWORD}
```

### Import Issues

#### "Constraint violation" errors
```sql
-- Check for existing data conflicts
-- Clean database before import (DESTRUCTIVE!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO athyperauth;
```

#### "Duplicate key" on import
```bash
# Use --override flag for JSON imports
# Or truncate tables before SQL import
TRUNCATE TABLE realm CASCADE;
```

#### Import succeeds but Keycloak shows old data
```bash
# Keycloak caches data - restart required
bash stack/scripts/stack-profile/restart.sh iam

# Clear Keycloak cache
docker exec -it athyper-stack-iam-1 \
  /opt/keycloak/bin/kcadm.sh cache clear \
  --no-config --server http://localhost:8080
```

---

## Quick Reference

### Common Commands

```bash
# Export everything (recommended for backups)
cd packages/adapters/db/scripts && ./postgres-export.sh

# Export single realm to JSON
cd packages/adapters/db/scripts && ./keycloak-export.sh

# Import realm JSON (primary method)
bash stack/scripts/db/session/iam/import-iam.sh

# Check database size
docker exec athyper-stack-dbpool-session-1 \
  psql -U athyperauth -d athyper_iam \
  -c "SELECT pg_size_pretty(pg_database_size('athyper_iam'));"

# Count users in realm
docker exec athyper-stack-dbpool-session-1 \
  psql -U athyperauth -d athyper_iam \
  -c "SELECT COUNT(*) FROM user_entity WHERE realm_id = (SELECT id FROM realm WHERE name = 'athyper');"
```

---

## Environment Variables

Set these in `stack/env/.env` or export before running scripts:

```bash
# Database
IAM_DB_HOST=localhost
IAM_DB_PORT=5432
IAM_DB_NAME=athyper_iam
IAM_DB_USERNAME=athyperauth
IAM_DB_PASSWORD=<your-password>
IAM_DB_URL=jdbc:postgresql://dbpool-session:6433/athyper_iam

# Keycloak Admin
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<admin-password>
IAM_HOST=localhost
```

---

## Additional Resources

- [Keycloak Export/Import Documentation](https://www.keycloak.org/server/importExport)
- [PostgreSQL pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- Project Auth Documentation: `docs/security/AUTH_ARCHITECTURE.md`
- Project Runbooks: `docs/runbooks/auth-operations.md`

---

**Last Updated**: 2026-03-02
**Keycloak Version**: 26.5.1
**PostgreSQL Version**: 16+
