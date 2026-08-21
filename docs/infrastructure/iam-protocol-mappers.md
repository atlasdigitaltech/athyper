# Keycloak Protocol Mapper Snippets

These mappers feed claims into the access token that the platform's
unified context gate (`require-platform-context.ts`) and the
`/api/auth/verify` endpoint use to enforce tenant/plane discipline.

## Mappers

| File | Claim | Purpose |
|---|---|---|
| `tenant-id.mapper.json` | `tenant_id` | Cross-checked against the header-derived `x-org` tenant lookup. Mismatch → 403 (`auth_context_mismatch:tenant`). |
| `allowed-tenants.mapper.json` | `allowed_tenants` | Multi-value. Set of tenant codes the principal may select via `x-org`. The gate rejects an `x-org` not in this set. |
| `required-actions.mapper.json` | `required_actions` | Multi-value. KC required-action codes still pending on the user. Blocks sensitive routes per `AUTH_REQUIRED_ACTIONS_MATRIX`. |

## Attaching to a `*-web` client

The realm export JSON (`realm-athyper.json`, `realm-platform-control.json`)
already contains every web client. Each client has a `protocolMappers` array
— append the contents of each snippet to it, generating a fresh UUID for the
`id` field of each entry (KC import rejects duplicates).

Do this **for each plane web client**: `neon-web`, `mesh-web`, `admin-web`.

```bash
# Quick helper — pipes a snippet into a client's protocolMappers via KC admin REST.
# Replace the REALM, CLIENT, and KC_BASE_URL as needed.
KC_BASE_URL=https://iam.athyper.local
REALM=athyper
CLIENT=neon-web

# Fetch admin token (master realm password grant)
TOKEN=$(curl -s -X POST "${KC_BASE_URL}/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  -d username="${KC_ADMIN_USERNAME}" -d password="${KC_ADMIN_PASSWORD}" \
  | jq -r .access_token)

# Look up client UUID
CLIENT_ID=$(curl -s "${KC_BASE_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT}" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r .[0].id)

# Attach each mapper
for f in tenant-id allowed-tenants required-actions; do
  curl -s -X POST \
    "${KC_BASE_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}/protocol-mappers/models" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data @"${f}.mapper.json"
done
```

## User attribute side

The mappers read from these user attributes — set them via the KC admin UI
(`Users → <user> → Attributes`) or via the registration flow:

| Attribute | Cardinality | Source |
|---|---|---|
| `tenant_id` | single | `master.tenant.id` of the user's home tenant |
| `allowed_tenants` | multi | tenant codes the user may select; managed by the org-membership flow |
| `kc.required_actions` | multi | KC writes to this attribute when an action is added/cleared — wire via a custom event listener SPI or sync at user-update time |

## Verification

After import or REST application, decode a fresh access token and confirm
the claims appear:

```bash
TOKEN=...
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{tenant_id, allowed_tenants, required_actions}'
```

## Rollout notes

- The gate is gated by `AUTH_CLAIM_FIRST_CONTEXT=shadow|on` and
  `AUTH_PLATFORM_CONTEXT_GATE=on`. Both default off; attach the mappers
  first, then run `shadow` for one week, then flip the gates to `on`.
- A user without these claims still authenticates — the cross-check is
  skipped (claim absent ⇒ nothing to compare). This is intentional so a
  bad mapper rollout doesn't lock everyone out.
