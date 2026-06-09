# Seed Data — Execution Guide

## Folder Map

| Folder | Phase | Category | When |
|---|---|---|---|
| `platform/` | 2 | **Platform** | Once at install / upgrade. No tenant required. |
| `blueprints/universal/` | 3 | **Universal Blueprint** | Per-tenant — TIER 1 foundation + TIER 2a COA (always apply). |
| `blueprints/industry/` | 3 | **Industry Blueprint** | Per-tenant — TIER 2b industry packs. |
| `blueprints/modules/` | 3 | **Module Packs** | Per-tenant — TIER 3 optional subscription modules. |
| `../tenants/{client}/` | 3 | **Tenant Instance** | Per-client NEON tenant onboarding, after all blueprint tiers complete. |
| `../admin/` | 3 | **Admin Plane Seed** | ADMIN plane: platform staff + identity bindings. Runs after all NEON tenants. |
| `../mesh/` | 3 | **Mesh Plane Seed** | MESH plane: partner tenants + network memberships + groups. Runs after all NEON tenants. |

> **Adding a new client:** copy `../tenants/_template/` to `../tenants/{client_code}/`,
> fill in the placeholders, and run Phase 3 with `SET app.seed_tenant_id = '<uuid>'`.
>
> **Admin/MESH plane seeds** do not use `app.seed_tenant_id` — each file resolves its
> own tenant via `WHERE realm_key = 'admin'/'mesh' AND code = '...'`.

---

## Session Variable — Required for All Blueprint & Tenant Files

Every blueprint and tenant seed file reads the target tenant from a PostgreSQL session variable.
**Set this before running any Phase 3 file:**

```sql
SET app.seed_tenant_id = '<tenant_uuid>';
-- Example:
SET app.seed_tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

If the variable is not set, the file raises:
```
ERROR: [seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = '<uuid>'
```

---

## Blueprint Tier Model

Every new tenant runs blueprints in this fixed tier order:

```
TIER 1 — Foundation        (always apply, no selection)
  [1/6] base               universal spend taxonomy
  [2/6] foundation_tax     tax jurisdictions, types, rates, FX
  [3/6] foundation_pay     holiday calendars, payment terms
  [4/6] foundation_assets  asset class hierarchy
  [5/6] foundation_bank    bank format & payment rail rules
  [6/6] org_foundation     org units, cost centers, profit centers
                            post-company-code step

TIER 2a — COA Framework    (select exactly one)
  coa_ifrs                 IFRS chart of accounts
  coa_gaap                 US GAAP chart of accounts

TIER 2b — Industry Packs   (select one or more; additive)
  pack_utilities, pack_construction, pack_real_estate,
  pack_transport, pack_trading, pack_hospitality, pack_infocomm,
  pack_financial, pack_mfg_textile, pack_mfg_food_bev,
  pack_mfg_pharma, pack_mfg_electronics, pack_mining_petroleum,
  pack_agriculture, pack_education, pack_healthcare

TIER 3 — Module Packs      (optional; subscription-gated)
  pack_ap_non_po           Non-PO Accounts Payable cycle
  (future: pack_ar, pack_inventory, pack_payroll, …)
```

---

## Execution Order

### Phase 2 — Platform (platform/)

Run once on first deploy and again on upgrades that add new lookup values.
No tenant required — no `SET app.seed_tenant_id` needed.

Files sort alphabetically by subfolder prefix (numeric order):

```
platform/000_bootstrap/000_bootstrap.sql          ← MUST be first

platform/000_lookups/LookupDomain/000_lookup_domains.sql
platform/000_lookups/LookupDomain/010_ai_lookup_domains.sql
platform/000_lookups/LookupDomain/control/*.sql
platform/000_lookups/LookupDomain/document/*.sql
platform/000_lookups/LookupDomain/event/*.sql
platform/000_lookups/LookupDomain/log/*.sql
platform/000_lookups/LookupDomain/master/*.sql
platform/000_lookups/LookupDomain/shared/*.sql

# Global reference data (countries, currencies, UoM, commodity/industry codes)
platform/001_global_reference/001_country.sql
platform/001_global_reference/002_state_region.sql
platform/001_global_reference/003_currency.sql
platform/001_global_reference/004_language.sql
platform/001_global_reference/005_locale.sql
platform/001_global_reference/006_timezone.sql
platform/001_global_reference/007_uom.sql
platform/001_global_reference/008a_commodity_code_unspsc.sql
platform/001_global_reference/008b_commodity_code_hs.sql
platform/001_global_reference/008c_commodity_crosswalk.sql
platform/001_global_reference/008d_commodity_code_keywords.sql
platform/001_global_reference/009b_industry_code_isic_groups_classes.sql
platform/001_global_reference/009c_industry_code_naics_subsectors.sql
platform/001_global_reference/009d_industry_crosswalk.sql
platform/001_global_reference/009e_industry_code_keywords.sql

# Permission model (personas, modules, permissions, roles)
platform/002_permission_model/010_persona.sql
platform/002_permission_model/011_workspace.sql
platform/002_permission_model/012_module.sql
platform/002_permission_model/013_enterprise_feature.sql
platform/002_permission_model/014_subscription_plan.sql
platform/002_permission_model/015_permission_category.sql
platform/002_permission_model/016_plan_module_access.sql
platform/002_permission_model/017_permission.sql
platform/002_permission_model/018_persona_permission.sql
platform/002_permission_model/019_role.sql

# Control tables
# One table-owned file per control table. Entity-engine, domain-registration,
# workflow, operation, and blueprint-registry control metadata lives here.
# Lookup domain/value seeds remain in 000_lookups/LookupDomain/*.
platform/003_control/010_entity_class_profile.sql
platform/003_control/020_field_group.sql
platform/003_control/030_lifecycle.sql
platform/003_control/040_entity.sql
platform/003_control/041_entity_version.sql
platform/003_control/042_entity_field.sql
platform/003_control/042b_field_group_member.sql
platform/003_control/043_entity_relation.sql
platform/003_control/044_entity_operation.sql
platform/003_control/044b_site_warehouse_metadata.sql
platform/003_control/045_entity_lifecycle.sql
platform/003_control/046_entity_flow.sql
platform/003_control/050_entity_numbering_config.sql
platform/003_control/060_workflow_template.sql
platform/003_control/070_hook_action_registry.sql
platform/003_control/080_transaction_event_catalog.sql
platform/003_control/081_transaction_flow_template.sql
platform/003_control/082_notification_template.sql
platform/003_control/083_notification_routing_rule.sql
platform/003_control/084_cron_schedule.sql
platform/003_control/085_parameter_definition.sql
platform/003_control/090_blueprint_registry.sql

platform/003_master/*.sql

# Athyper system tenant (blueprint owner — platform-level singleton)
platform/006_system_tenant/000_athyper_tenant.sql
```

---

### Phase 3 — Tenant Provisioning (per-tenant, in tier order)

**Before running any file in this phase:**
```sql
SET app.seed_tenant_id = '<tenant_uuid>';
```

#### Step 1 — Create Tenant Record

```
tenants/neon/{client}/000_tenant.sql
tenants/neon/{client}/001_tenant_profile.sql
tenants/neon/{client}/002_demo_tenants.sql    ← demo/staging only
```

#### Step 2 — TIER 1: Pre-company Foundation (always apply first)

```sql
SET app.seed_tenant_id = '<tenant_uuid>';

-- [1/6] base — universal spend taxonomy (prerequisite)
blueprints/universal/010_spend_taxonomy/019_pre_seed_foundation.sql       ← ALWAYS FIRST
blueprints/universal/010_spend_taxonomy/020_spend_categories.sql          ← Layer A: 17 universal roots (always)
blueprints/universal/010_spend_taxonomy/020b_spend_categories_direct_ops.sql ← Layer B: 13 direct-ops roots (opt-in)
blueprints/universal/010_spend_taxonomy/021_business_intents.sql
blueprints/universal/010_spend_taxonomy/022_spend_intent_link.sql
blueprints/universal/010_spend_taxonomy/027_commodity_bridge.sql
blueprints/universal/010_spend_taxonomy/028_commodity_category_model.sql  ← migrates spend_category roots → commodity_category
blueprints/universal/010_spend_taxonomy/024_routing_rules.sql
blueprints/universal/010_spend_taxonomy/026_base_intent_rules.sql

-- Commodity category policy validation (run after taxonomy seeds)
blueprints/universal/990_validation/900_commodity_category_policy_refresh.sql

-- [2/6] foundation_tax — tax jurisdictions, types, rates, FX
blueprints/universal/020_tax/320_tax_jurisdictions.sql
blueprints/universal/020_tax/321_tax_types.sql
blueprints/universal/020_tax/322_tax_rate_schedules.sql
blueprints/universal/020_tax/323_tax_groups.sql
blueprints/universal/020_tax/330_fx_rates.sql

-- [3/6] foundation_pay — holiday calendars, payment terms
blueprints/universal/030_payments/340_holiday_calendars.sql
blueprints/universal/030_payments/341_payment_terms.sql

-- [4/6] foundation_assets — asset class hierarchy
blueprints/universal/040_assets/340_asset_classes.sql

-- [5/6] foundation_bank — payment rail format rules
blueprints/universal/050_bank/001_bank_format_rule_defaults.sql
```

#### Step 3 — TIER 2a: COA Framework (select exactly one)

```
blueprints/universal/200_coa_frameworks/200_chart_catalog.sql
blueprints/universal/200_coa_frameworks/210_group_chart_accounts.sql      -- internal COA-GROUP reporting taxonomy
# selected framework:
blueprints/universal/200_coa_frameworks/211_framework_ifrs_accounts.sql  -- coa_ifrs
blueprints/universal/200_coa_frameworks/212_framework_gaap_accounts.sql  -- coa_gaap
```

#### Step 4 — TIER 2b: Industry Packs (select one or more, any order)

```
blueprints/industry/100_industry_packs/100_pack_utilities.sql
blueprints/industry/100_industry_packs/101_pack_construction.sql
blueprints/industry/100_industry_packs/102_pack_real_estate.sql
blueprints/industry/100_industry_packs/103_pack_transport.sql
blueprints/industry/100_industry_packs/104_pack_trading.sql
blueprints/industry/100_industry_packs/105_pack_hospitality.sql
blueprints/industry/100_industry_packs/106_pack_infocomm.sql
blueprints/industry/100_industry_packs/107_pack_financial.sql
blueprints/industry/100_industry_packs/108_pack_mfg_textile.sql
blueprints/industry/100_industry_packs/109_pack_mfg_food_bev.sql
blueprints/industry/100_industry_packs/110_pack_mfg_pharma.sql
blueprints/industry/100_industry_packs/111_pack_mfg_electronics.sql
blueprints/industry/100_industry_packs/112_pack_mining_petroleum.sql
blueprints/industry/100_industry_packs/113_pack_agriculture.sql
blueprints/industry/100_industry_packs/114_pack_education.sql
blueprints/industry/100_industry_packs/115_pack_healthcare.sql
```

#### Step 5 — Tenant Company Foundation and Org Structure

Order is strict. Tenant company-code seed files run first, then the shared
post-company org templates, then tenant-local operational data.

```
tenants/neon/{client}/100_org_structure/199_gl_preseed.sql*          ← legal entities + company codes
tenants/neon/{client}/100_org_structure/200*.sql                     ← optional tenant legal-entity overlays
tenants/neon/{client}/100_org_structure/201*.sql                     ← optional tenant company-code overlays
blueprints/universal/060_org_structure/300_org_units.sql                   ← universal org units
blueprints/universal/060_org_structure/301_cost_centers.sql                ← universal cost centers
blueprints/universal/060_org_structure/302_profit_centers.sql              ← universal profit centers
blueprints/industry/200_org_structure/000_industry_org_templates.sql       ← applies only tagged industry/company mappings
tenants/neon/{client}/100_org_structure/303_sites.sql
tenants/neon/{client}/100_org_structure/304_warehouses.sql
tenants/neon/{client}/100_org_structure/310_fiscal_periods.sql
tenants/neon/{client}/100_org_structure/311_ledger_books.sql
tenants/neon/{client}/200_finance/201_company_chart_assignments.sql
tenants/neon/{client}/800_subscriptions/001_demo_module_subscriptions.sql  ← demo/staging only
tenants/neon/{client}/900_principals/001_demo_principals.sql               ← demo/staging only
tenants/neon/{client}/900_principals/002_demo_principal_personas.sql       ← demo/staging only
tenants/neon/{client}/900_principals/003_demo_delegation_grants.sql        ← demo/staging only
tenants/neon/{client}/900_principals/004_athq_principals.sql
tenants/neon/{client}/900_principals/005_named_tenant_principals.sql
tenants/neon/{client}/900_principals/006_principal_users.sql
tenants/neon/{client}/950_rbac/001_demo_rbac.sql                          ← demo/staging only
tenants/neon/{client}/950_rbac/002_demo_group_members.sql                 ← demo/staging only
tenants/neon/{client}/200_finance/270_refresh_mv.sql          ← refresh MVs after all data loaded
tenants/neon/{client}/200_finance/280_validation_assertions.sql ← integrity checks; run before governance
tenants/neon/{client}/300_governance/*.sql                    ← optional: close-cycle templates (demo: 001_finance_close_cycle.sql)
tenants/neon/{client}/entity_engine/010_entity_policies.sql   ← MUST be last group
tenants/neon/{client}/entity_engine/020_field_security_policies.sql
```

#### Step 6 — TIER 3: Module Packs (if subscribed)

```sql
SET app.seed_tenant_id = '<tenant_uuid>';

-- AP Non-PO Cycle
blueprints/modules/ap_non_po/005_accounting_profile_ddl.sql
blueprints/modules/ap_non_po/010_posting_roles.sql
blueprints/modules/ap_non_po/020_accounting_profiles.sql
blueprints/modules/ap_non_po/030_acct_profile_configs.sql
blueprints/modules/ap_non_po/040_acct_profile_events.sql
blueprints/modules/ap_non_po/050_acct_profile_entry_templates.sql
blueprints/modules/ap_non_po/055_acct_profile_settlement_config.sql
blueprints/modules/ap_non_po/056_acct_profile_commitment_config.sql
blueprints/modules/ap_non_po/057_acct_profile_book_rule.sql
blueprints/modules/ap_non_po/058_acct_profile_dimension_rule.sql
blueprints/modules/ap_non_po/060_category_intent_rules.sql
blueprints/modules/ap_non_po/061_min_intake_rules.sql
blueprints/modules/ap_non_po/062_full_coverage_rules.sql
blueprints/modules/ap_non_po/070_intent_profile_rules.sql
blueprints/modules/ap_non_po/072_profile_domain_fallbacks.sql
blueprints/modules/ap_non_po/080_payment_settlement_rules.sql
blueprints/modules/ap_non_po/090_entity_operations_delta.sql
blueprints/modules/ap_non_po/099_apply.sql              ← records application receipt
```

---

## Blueprint Selection Rules

| Rule | Detail |
|---|---|
| Foundation always applied | Pre-company foundation runs first; `org_foundation` runs after tenant company codes exist. |
| One COA framework | Select exactly one operating COA: `coa_ifrs` or `coa_gaap`. `COA-GROUP` is internal reporting taxonomy, not a selectable COA. |
| Industry packs | Select one or more based on tenant's industries; additive post-provisioning |
| Module packs | Enabled per subscription tier; run 005→099_apply in order |

Query available blueprints:
```sql
SELECT code, name, category, framework, dependencies
FROM control.v_blueprint_catalogue
ORDER BY category, code;
```

Check what's applied to a tenant:
```sql
SELECT br.code, br.name, br.category, tba.applied_version, tba.applied_at, tba.status
FROM control.tenant_blueprint_application tba
JOIN control.blueprint_registry br ON br.code = tba.blueprint_code
WHERE tba.tenant_id = '<tenant_id>'
ORDER BY tba.applied_at;
```

---

## Adding a New Client Tenant

1. Copy `tenants/neon/_template/` → `tenants/neon/{client_code}/`
2. Fill in all `__PLACEHOLDER__` values in `000_tenant.sql` and `001_tenant_profile.sql`
3. Add org structure files under `100_org_structure/`, finance under `200_finance/`, etc.
4. Run Phase 3 with `SET app.seed_tenant_id = '<new_uuid>'`

---

## Adding a New Blueprint Pack

1. Add SQL files to the appropriate tier subfolder under `blueprints/universal/` (TIER 1/2a), `blueprints/industry/` (TIER 2b), or `blueprints/modules/` (TIER 3)
2. Register in `platform/003_control/090_blueprint_registry.sql`
3. Set `seed_files` paths relative to the seed root (e.g., `'blueprints/industry/100_industry_packs/116_pack_xxx.sql'`)
4. Ensure all SQL files use `current_setting('app.seed_tenant_id', true)::uuid` — no hardcoded tenant codes
5. Re-run the registry file — it is idempotent (`ON CONFLICT (code) DO UPDATE`)
6. The pack is immediately available for new tenant provisioning

## Adding a New COA Framework (e.g., GAAP, MFRS)

1. Add framework account files to `blueprints/universal/200_coa_frameworks/`
2. Register as `category = 'coa_framework'` with appropriate `framework` value
3. Update the provisioning wizard to present the new option
