# IAM Configuration Directory

This directory contains Keycloak realm configurations for the athyper platform.

## Files

### `realm-demosetup.json`

Keycloak realm export containing:

- **Realm**: athyper
- **Clients**: neon-web, admin-console, etc.
- **Users**: Demo users and credentials
- **Roles**: Realm and client roles
- **Groups**: User groups and hierarchies
- **Organizations**: Multi-tenant org setup (demo_in, demo_my, demo_sa, demo_qa, demo_fr)
- **Authentication Flows**: Custom auth flows
- **Identity Providers**: External IdP configurations (if any)

## Usage

### Export Current Configuration

**Linux/macOS:**

```bash
cd stack/scripts
./export-iam.sh
```

**Windows:**

```cmd
cd stack\scripts
export-iam.bat
```

This will export the current `athyper` realm to `realm-demosetup.json`.

### Import Configuration

**Linux/macOS:**

```bash
cd stack/scripts
./initdb-iam.sh
```

**Windows:**

```cmd
cd stack\scripts
initdb-iam.bat
```

This will import `realm-demosetup.json` into Keycloak, overriding existing data.

## Workflow

### 1. Initial Setup (New Environment)

```bash
# Start stack infrastructure
cd stack
./up.sh --profile core

# Import demo realm configuration
cd scripts
./initdb-iam.sh

# Verify in Admin Console
# http://localhost/auth
```

### 2. Making Changes

```bash
# 1. Make changes via Keycloak Admin Console
# 2. Export updated configuration
./export-iam.sh

# 3. Commit changes (if desired)
git add stack/config/iam/realm-demosetup.json
git commit -m "IAM: Updated client redirect URIs for staging"
```

### 3. Environment Promotion

```bash
# Development → Staging
git checkout staging
git merge development
cd stack/scripts
./initdb-iam.sh

# Verify changes in staging environment
```

## Security Considerations

⚠️ **Important Security Notes:**

### Passwords are NEVER committed to realm JSON

Demo user passwords are set **after** realm import by
[`stack/scripts/db/seed-iam-credentials.sh`](../../scripts/db/seed-iam-credentials.sh) using
`kcadm.sh set-password`. Source values come from `IAM_DEMO_USER_PASSWORD` and
`IAM_PLATFORM_CONTROL_USER_PASSWORD` in `stack/env/.env` (safe dev defaults in `.env.example`).

Every user in the committed JSON has `"credentials": []` and `"requiredActions": ["UPDATE_PASSWORD"]`
as a defense-in-depth guard: if an older JSON with inline passwords is ever re-imported, the required
action forces a password reset at first login.

### What's Safe to Commit

- ✅ Realm configuration (settings, flows, policies)
- ✅ Client configurations (redirect URIs, settings)
- ✅ Role definitions
- ✅ Group structures
- ✅ Demo/test user accounts **without** credentials (`credentials: []`)

### What NOT to Commit

- ❌ Plaintext passwords or password hashes in the `credentials[]` array
- ❌ Real user credentials
- ❌ Production secrets (client secrets, signing keys)
- ❌ Real email addresses
- ❌ SMTP credentials
- ❌ LDAP/AD credentials

Before committing a re-exported realm JSON, strip credentials:

```bash
jq '(.users[].credentials) = []' realm-demosetup.json > realm-demosetup.clean.json
mv realm-demosetup.clean.json realm-demosetup.json
```

### Best Practices

1. **Sanitize before committing:**

   ```bash
   # Review the export before committing
   cat realm-demosetup.json | jq '.users[] | {username, email}'
   ```

2. **Use environment-specific secrets:**
   - Client secrets should be regenerated per environment
   - Don't rely on exported secrets for production

3. **Separate demo and production:**
   - Keep demo users in version control
   - Manage production users through proper IAM processes

4. **Encrypt sensitive exports:**
   ```bash
   # If you must export production config
   gpg --symmetric --cipher-algo AES256 realm-production.json
   ```

## File Format

The exported JSON follows [Keycloak's realm export format](https://www.keycloak.org/docs/latest/server_admin/#_export_import).

Key sections:

```json
{
  "realm": "athyper",
  "enabled": true,
  "clients": [...],
  "users": [...],
  "roles": {
    "realm": [...],
    "client": {...}
  },
  "groups": [...],
  "organizations": [...],
  "authenticationFlows": [...],
  "identityProviders": [...]
}
```

## Troubleshooting

### Export fails: "Container not running"

```bash
# Check if IAM is running
docker ps | grep iam

# Start stack if needed
cd stack && ./up.sh --profile core
```

### Import fails: "Cannot connect to database"

```bash
# Check database connection
docker exec athyper-stack-dbpool-auth-1 \
  psql -U athyperauth -d athyperauth_dev1 -c '\l'

# Check password in stack/env/.env
grep IAM_DB_PASSWORD stack/env/.env
```

### Import succeeds but changes not visible

```bash
# Keycloak caches realm data - restart required
docker restart athyper-stack-iam-1

# Wait for health check
docker logs -f athyper-stack-iam-1
```

### "Invalid JSON" error

```bash
# Validate JSON syntax
jq empty stack/config/iam/realm-demosetup.json

# Pretty print for debugging
jq '.' stack/config/iam/realm-demosetup.json > realm-formatted.json
```

## Related Documentation

- [Keycloak Export/Import Docs](https://www.keycloak.org/docs/latest/server_admin/#_export_import)
- Project Auth Architecture: `../../docs/security/AUTH_ARCHITECTURE.md`
- Stack Scripts: `../../scripts/`
- Database Scripts: `../../framework/adapters/db/scripts/README-KEYCLOAK-EXPORT.md`

---

**Last Updated**: 2026-02-16
**Keycloak Version**: 26.5.1
**Realm**: athyper
