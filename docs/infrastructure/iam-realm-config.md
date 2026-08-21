# IAM Configuration Directory

This directory contains the checked-in Keycloak realm configuration for the
Athyper local, staging, and production stacks.

## Realm Files

Importable Keycloak realm files:

- `realm-athyper.json` - Unified tenant-facing realm for Neon, Mesh, and Admin plane clients.
- `realm-platform-control.json` - Platform-control product-owner support realm.

Non-importable demo fixtures:

- `realm-athyper-demosetup.json` - Unified demo organizations, memberships, and demo metadata.
- `realm-platform-control-demosetup.json` - Platform-control demo users.

Only importable `realm-*.json` files are mounted into `/opt/keycloak/data/import`.
`*-demosetup.json` files have `"importableByKeycloak": false` and are applied
after import by `tools/scripts/apply-realm-demo-setup.cjs` through
`seed-iam-credentials`.

## Unified Realm

`realm-athyper.json` owns the production IAM contract:

- `neon-web`, `mesh-web`, and `admin-web` clients
- service-account clients and service users
- realm roles such as `NEON_USER`, `MESH_BUYER_USER`, `MESH_PARTNER_USER`, and `ADMIN_USER`
- client roles such as `AUTHORIZED`
- client scopes, protocol mappers, flows, required actions, and realm security policy

`realm-athyper-demosetup.json` owns demo organization metadata. Keycloak
organizations use stable `ORG-*` aliases, while business meaning is carried in
attributes such as `tenant_code`, `legal_entity_code`, `buyer_account_code`, and
`supplier_account_code`.

## Common Commands

Export current IAM realms:

```bash
bash stack/scripts/db/session/iam/export-iam.sh
```

Import checked-in realms into a running Keycloak:

```bash
bash stack/scripts/db/session/iam/import-iam.sh
```

Reset Keycloak IAM from the checked-in realm files:

```bash
bash stack/scripts/db/session/iam/reset-iam.sh
```

Seed demo organizations and passwords:

```bash
bash stack/scripts/db/session/iam/seed-iam-credentials.sh
```

Windows equivalents live beside the shell scripts as `.bat` files.

## Security Rules

Passwords are never committed to realm JSON. Demo passwords are applied after
realm import by `seed-iam-credentials` using `kcadm.sh set-password` inside the
running Keycloak container.

Safe to commit:

- realm settings, flows, policies, and themes
- client and redirect URI configuration
- role and group definitions
- demo user accounts without credentials
- demo organizations and memberships

Do not commit:

- plaintext passwords or password hashes
- production user credentials
- production client secrets
- signing keys or private keys

## Validation

Validate all realm JSON files:

```bash
node -e "const fs=require('fs'); for (const f of fs.readdirSync('stack/config/iam').filter(f=>f.endsWith('.json'))) JSON.parse(fs.readFileSync('stack/config/iam/'+f,'utf8'));"
```

Check the unified realm shape:

```bash
node -e "const fs=require('fs'); const base=JSON.parse(fs.readFileSync('stack/config/iam/realm-athyper.json','utf8')); const demo=JSON.parse(fs.readFileSync('stack/config/iam/realm-athyper-demosetup.json','utf8')); console.log({realm:base.realm, clients:(base.clients||[]).map(c=>c.clientId), demoOrgs:(demo.organizations||[]).length});"
```

## Troubleshooting

If import fails, validate the JSON files first. If import succeeds but demo
users or organizations are missing, run `seed-iam-credentials` so the
non-importable demo fixtures are applied.

Keycloak admin console:

```text
http://localhost/auth
```

## Related

- Keycloak export/import docs: https://www.keycloak.org/docs/latest/server_admin/#_export_import
- Stack IAM scripts: `stack/scripts/db/session/iam/`
- Demo fixture applier: `tools/scripts/apply-realm-demo-setup.cjs`

Last updated: 2026-05-25
Keycloak version: 26.6.1
Realms: athyper, platform-control
