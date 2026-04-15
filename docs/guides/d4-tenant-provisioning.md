# D4 — Tenant Provisioning Guide

**Audience:** Platform engineers and ops staff responsible for onboarding new customer tenants.  
**Last updated:** 2026-04-15  
**Task:** 45-06

---

## Table of Contents

1. [Blueprint Seed Overview](#1-blueprint-seed-overview)
2. [Tenant Onboarding Sequence](#2-tenant-onboarding-sequence)
3. [Post-Provisioning Checklist](#3-post-provisioning-checklist)

---

## 1. Blueprint Seed Overview

Blueprints are additive data packs that inject reference data and configuration into a tenant's namespace. They do not alter DDL — all tables already exist; blueprints only populate rows.

### 1.1 Blueprint Registry

The authoritative list of available blueprints lives in:

```
server/db/sql/900_seed_data/020_blueprint/000_registry/000_blueprint_registry.sql
```

It populates two tables:

| Table | Purpose |
|-------|---------|
| `control.blueprint_registry` | Catalogue of available packs (code, category, framework, dependencies) |
| `control.tenant_blueprint_application` | Per-tenant audit log of what has been applied |

A convenience view `control.v_blueprint_catalogue` filters to `status = 'active'` and is ordered by category.

### 1.2 Blueprint Categories

| Category | Code examples | Notes |
|----------|--------------|-------|
| `base` | `base` | **Must be applied first.** Provides system lookups, permission templates, default workflow routes. |
| `coa_framework` | `coa_ifrs` | Chart of Accounts seed for a specific accounting framework (IFRS / GAAP / MFRS). |
| `default_rules` | `default_rules` | AP defaults, AR defaults, payment term templates. Depends on `base`. |
| `industry_pack` | `pack_utilities`, `pack_construction`, `pack_real_estate`, `pack_trading`, etc. | Spend categories, intent taxonomy, commodity bridge, budget tree templates specific to an industry vertical. |

### 1.3 What an Industry Pack Contains

When `pack_*` blueprints are applied they seed rows across several schemas. The major areas are:

**Spend categories**  
Hierarchical rows in the procurement dimension tables (typically `master.spend_category`) covering the standard commodity taxonomy for that vertical. These drive GL mapping and budget allocation.

**Intent taxonomy**  
Rows in the workflow intent tables that define what kinds of approval chains are pre-configured for the vertical (e.g., `CAPEX_APPROVAL`, `SERVICE_PO`, `LEASE_CONTRACT` for `pack_real_estate`).

**Budget tree templates**  
Pre-built budget structure templates (cost centre hierarchy + budget period definitions) seeded into the budgeting dimension tables. Tenants can extend or override these after provisioning.

**Routing rules**  
Default workflow routing rules stored in `control.workflow_route` (or equivalent) that map document types to approver roles. These are defaults only — tenants customise them via the Workflow Template UI at `/setup/workflows`.

**Commodity bridge**  
Crosswalk rows that map industry-specific commodity codes to the platform's internal spend categories, enabling interoperability when importing vendor catalogues or purchase orders from external systems.

### 1.4 Blueprint Dependencies

Blueprints declare dependencies in their `dependencies text[]` column. The apply API does **not** auto-install dependencies — the caller must apply them in order. The correct sequence for a typical tenant:

```
base  →  coa_ifrs  →  default_rules  →  pack_<vertical>
```

Applying a blueprint that has an unapplied dependency returns HTTP 409 with a `dependenciesUnmet` error detail.

### 1.5 Blueprints Are Additive

Unapplying a blueprint (`DELETE /api/platform/blueprints/:code/apply`) sets the `tenant_blueprint_application.status` to `removed`. It does **not** roll back seeded data. This is by design — removing reference data from a live tenant could break existing transactions. If a rollback is genuinely required, restore from a pre-provisioning DB snapshot.

---

## 2. Tenant Onboarding Sequence

Complete the following steps in order. Each step lists the responsible tool (SQL script, API call, or UI action) and the verification command.

### Step 1 — Create the Tenant Row

```sql
-- Run against athyper_dev1 (or the target DB) as athyperadmin
INSERT INTO master.tenant (
    code, name, display_name,
    realm_key,
    region, subscription, status,
    created_by
) VALUES (
    'acme',                          -- URL-safe slug, unique per realm
    'Acme Corp',                     -- internal name
    'Acme Corporation',              -- shown in the UI
    'athyper',                       -- Keycloak realm (usually 'athyper' for SaaS)
    'GCC',                           -- data-residency region
    'enterprise',                    -- subscription tier
    'provisioning',                  -- keep in provisioning until setup is complete
    '00000000-0000-0000-0000-000000000000'  -- system principal
);
```

**Constraints to know:**

- `code` must match `^[a-z][a-z0-9_-]{1,62}$`
- `(realm_key, code)` must be unique — two tenants in the same realm cannot share a code
- `status` starts as `'provisioning'`; set to `'active'` only after the checklist in §3 is complete

**Verify:**

```sql
SELECT id, code, name, status FROM master.tenant WHERE code = 'acme';
```

---

### Step 2 — Apply Blueprints

Use the Blueprint UI at `/setup/blueprints` or call the API directly.

**Via UI:**
1. Navigate to **Setup → Blueprints**.
2. Filter by category **Base** and click **Apply** on the `base` blueprint.
3. Apply `coa_ifrs` (or the appropriate COA framework).
4. Apply `default_rules`.
5. Apply the relevant `pack_<vertical>` blueprint(s) for the tenant's industry.

**Via API (for scripted provisioning):**

```bash
TENANT_TOKEN="<bearer-token-for-system-principal>"
BASE_URL="https://api.athyper.local"
ORG_HEADER="acme"
REALM_HEADER="athyper"

for CODE in base coa_ifrs default_rules pack_real_estate; do
  curl -sf -X POST "$BASE_URL/api/platform/blueprints/$CODE/apply" \
    -H "Authorization: Bearer $TENANT_TOKEN" \
    -H "X-Org: $ORG_HEADER" \
    -H "X-Realm: $REALM_HEADER" \
    | jq '{code: .blueprintCode, status: .status, appliedAt: .appliedAt}'
done
```

**Verify:**

```sql
SELECT blueprint_code, status, applied_at
FROM control.tenant_blueprint_application
WHERE tenant_id = (SELECT id FROM master.tenant WHERE code = 'acme')
ORDER BY applied_at;
```

---

### Step 3 — Create the Keycloak Realm (if new realm)

For SaaS multi-tenant deployments all tenants share the `athyper` realm — skip this step.

For dedicated-realm (on-premise or enterprise-isolated) deployments:

1. Log into the Keycloak admin console at `https://iam.mesh.athyper.local/admin`.
2. Click **Create realm**.
3. Set the realm name to match the `realm_key` chosen in Step 1 (e.g., `acme`).
4. Import the base realm template:
   ```bash
   # From the repo root
   bash server/framework/adapters/db/scripts/keycloak-import.sh acme \
     mesh/config/kc/realm-template.json
   ```
5. Create the `athyper-api-runtime` confidential client, copy the client secret into `server/.env` (`KEYCLOAK_CLIENT_SECRET`).
6. Restart the API server so the new realm is picked up by `createAuthAdapter`.

> **Note:** The auth adapter accepts additional realms via the `additionalRealms` config map — see `server/framework/adapters/auth/src/keycloak/auth-adapter.ts`.

---

### Step 4 — Create the Admin Principal

The admin principal is the first human user for the tenant. Create it in two places:

**4a. In Keycloak** — add the user in the realm, set a temporary password, and note the user's UUID (Keycloak sub claim).

**4b. In the platform DB:**

```sql
INSERT INTO master.principal (
    id,                             -- must match Keycloak sub UUID
    tenant_id,
    email, display_name,
    principal_type,                 -- 'user'
    status,
    created_by
) VALUES (
    '<keycloak-sub-uuid>',
    (SELECT id FROM master.tenant WHERE code = 'acme'),
    'admin@acme.example',
    'Acme Admin',
    'user',
    'active',
    '00000000-0000-0000-0000-000000000000'
);
```

> **JIT fallback:** The platform's IAM layer can provision principal rows on first login if `IAM_JIT_PROVISION=true` is set. For production tenants the explicit INSERT is preferred so role assignments can be made before the user ever logs in.

---

### Step 5 — Assign Roles

At minimum, grant the admin principal the `TENANT_ADMIN` role.

**Via the IAM API:**

```bash
curl -sf -X POST "$BASE_URL/api/iam/roles/assignments" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "X-Org: acme" \
  -H "X-Realm: athyper" \
  -H "Content-Type: application/json" \
  -d '{
    "principalId": "<keycloak-sub-uuid>",
    "roleCode": "TENANT_ADMIN",
    "scopeType": "tenant",
    "scopeId": null
  }'
```

**Via the UI** (after the admin can log in):
1. Navigate to **Setup → Users**.
2. Open the admin user.
3. Open the **Grants** tab → **Add role**.

---

### Step 6 — Activate Modules via `tenant_module_subscription`

Modules gate which features are available to a tenant. Activate the modules the tenant has licensed.

```sql
-- Discover module UUIDs
SELECT id, code, name FROM master.module ORDER BY code;

-- Activate modules
INSERT INTO master.tenant_module_subscription
    (tenant_id, module_id, status, subscribed_at, created_by)
SELECT
    (SELECT id FROM master.tenant WHERE code = 'acme'),
    id,
    'active',
    now(),
    '00000000-0000-0000-0000-000000000000'
FROM master.module
WHERE code IN (
    'FIN',   -- Finance core (GL, AP, AR)
    'CMS',   -- Content management
    'WFL',   -- Workflow
    'NTF',   -- Notifications
    'AUD'    -- Audit
);
```

**Constraints:**

- `(tenant_id, module_id)` is unique — duplicate inserts will conflict.
- `status` values: `active` | `suspended` | `trial`.
- `expires_at` is nullable; set it for trial subscriptions.

**Verify:**

```sql
SELECT m.code, tms.status, tms.subscribed_at
FROM master.tenant_module_subscription tms
JOIN master.module m ON m.id = tms.module_id
WHERE tms.tenant_id = (SELECT id FROM master.tenant WHERE code = 'acme')
ORDER BY m.code;
```

### Step 7 — Set Tenant Active

```sql
UPDATE master.tenant
SET status = 'active',
    status_changed_at = now(),
    status_changed_by = '00000000-0000-0000-0000-000000000000'
WHERE code = 'acme';
```

---

## 3. Post-Provisioning Checklist

Run through this checklist after completing all steps. Tick each item before handing the tenant over.

### 3.1 Login Verification

- [ ] Admin user can authenticate via the login page (Keycloak redirects to `/callback`).
- [ ] JWT decoded at [jwt.io](https://jwt.io) shows correct `tenant_id` and `sub` claims.
- [ ] The shell loads without 401/403 errors in the browser console.
- [ ] The shell shows the correct `display_name` in the top-right user menu.

### 3.2 Confirm Company Codes

Company codes (subsidiary/entity codes within a tenant) are seeded by the `base` blueprint or created manually.

```sql
-- List company codes for the tenant
SELECT code, name, status
FROM master.company_code
WHERE tenant_id = (SELECT id FROM master.tenant WHERE code = 'acme')
ORDER BY code;
```

- [ ] At least one company code exists.
- [ ] Each company code has a matching GL account segment if the `FIN` module is active.
- [ ] Company codes visible in the Finance module (navigate to **Finance → Chart of Accounts**).

### 3.3 Seed Reference Data Overrides

Blueprints seed default reference data. If the tenant needs customisations, apply them now before any transactions are created (changes after go-live may require data migrations).

Common overrides:

| Data type | Where to edit | Notes |
|-----------|--------------|-------|
| Chart of Accounts | **Finance → COA** or direct SQL insert into `master.account` | Add/rename accounts; do not delete blueprint-seeded accounts in use by default rules |
| Payment terms | **Setup → Lookups → payment_terms** | Adjust days for tenant's local commercial norms |
| Spend categories | **Setup → Metadata → Lookups** | Extend or rename commodity categories |
| Workflow routing rules | **Setup → Workflows** | Customise approver roles per document type |
| Budget periods | **Finance → Budget** | Create fiscal year + period structure |
| Approval thresholds | **Setup → Policies** | Set monetary limits per role |

- [ ] Finance: COA reviewed, company codes mapped to account segments.
- [ ] Workflow: At least one routing rule per active document type (JE, PO, AP Invoice).
- [ ] Notifications: Channel preferences set for admin principal.
- [ ] Policies: Approval thresholds configured per role.

### 3.4 Verify Module Subscriptions

```sql
SELECT m.code, tms.status
FROM master.tenant_module_subscription tms
JOIN master.module m ON m.id = tms.module_id
WHERE tms.tenant_id = (SELECT id FROM master.tenant WHERE code = 'acme')
  AND tms.status = 'active'
ORDER BY m.code;
```

- [ ] All licensed modules listed as `active`.
- [ ] No modules with `status = 'suspended'` unless intentionally suspended.

### 3.5 Verify Blueprint Applications

```sql
SELECT blueprint_code, status, applied_at
FROM control.tenant_blueprint_application
WHERE tenant_id = (SELECT id FROM master.tenant WHERE code = 'acme')
  AND status = 'applied'
ORDER BY applied_at;
```

- [ ] `base` applied.
- [ ] A COA framework (`coa_ifrs` / `coa_gaap` / `coa_mfrs`) applied.
- [ ] `default_rules` applied.
- [ ] Industry pack applied if applicable.

### 3.6 Smoke Test API

```bash
# Should return 200 with entity list
curl -sf "$BASE_URL/api/relay/platform/entities" \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-Org: acme" \
  -H "X-Realm: athyper" | jq length

# Should return compiled descriptor for journal entity
curl -sf "$BASE_URL/api/relay/metadata/entities/journal_entry/compiled" \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-Org: acme" \
  -H "X-Realm: athyper" | jq .entity_code
```

- [ ] Entity list returns ≥ 1 entity.
- [ ] `journal_entry` compiled descriptor returns without error.

---

## Reference

| Resource | Location |
|----------|----------|
| Blueprint registry SQL | `server/db/sql/900_seed_data/020_blueprint/000_registry/000_blueprint_registry.sql` |
| Athyper tenant seed | `server/db/sql/900_seed_data/020_blueprint/000_tenant/000_athyper_tenant.sql` |
| Blueprint apply/unapply routes | `server/framework/runtime/services/platform/routes/platform.route.ts` (lines 939–1113) |
| Master tenant DDL | `server/db/sql/04_tables/003a_master_identity.sql` (lines 7–45) |
| Tenant module subscription DDL | `server/db/sql/04_tables/003a_master_identity.sql` (lines 805–829) |
| Blueprint UI | `apps/web/app/(shell)/(admin)/setup/blueprints/page.tsx` |
| KC import script | `server/framework/adapters/db/scripts/keycloak-import.sh` |
| Auth adapter | `server/framework/adapters/auth/src/keycloak/auth-adapter.ts` |
| Sprint 34 (blueprint wiring) | `docs/` → memory: project_sprint34.md |
