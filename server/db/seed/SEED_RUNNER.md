# Seed Data — Execution Guide

## Folder Map

| Folder | Phase | Category | When |
|---|---|---|---|
| `010_platform/` | 2 | **Platform** | Once at install / upgrade. No tenant required. |
| `020_universal/` | 3 | **Universal Blueprint** | Per-tenant — TIER 1 foundation + TIER 2a COA (always apply). |
| `030_industry/` | 3 | **Industry Blueprint** | Per-tenant — TIER 2b industry packs + TIER 3 module packs. |
| `040_tenants/{client}/` | 3 | **Tenant Instance** | Per-client onboarding, after all blueprint tiers complete. |

> **Adding a new client:** copy `040_tenants/_template/` to `040_tenants/{client_code}/`,
> fill in the placeholders, and run Phase 3 with `SET app.seed_tenant_id = '<uuid>'`.

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

### Phase 2 — Platform (010_platform/)

Run once on first deploy and again on upgrades that add new lookup values.
No tenant required — no `SET app.seed_tenant_id` needed.

Files sort alphabetically by subfolder prefix (numeric order):

```
010_platform/000_bootstrap/000_bootstrap.sql          ← MUST be first

010_platform/000_lookups/LookupDomain/000_lookup_domains.sql
010_platform/000_lookups/LookupDomain/control/*.sql
010_platform/000_lookups/LookupDomain/document/*.sql
010_platform/000_lookups/LookupDomain/event/*.sql
010_platform/000_lookups/LookupDomain/governance/*.sql
010_platform/000_lookups/LookupDomain/log/*.sql
010_platform/000_lookups/LookupDomain/master/*.sql
010_platform/000_lookups/LookupDomain/shared/*.sql

# Global reference data (countries, currencies, UoM, commodity/industry codes)
010_platform/001_global_reference/001_country.sql
010_platform/001_global_reference/002_state_region.sql
010_platform/001_global_reference/003_currency.sql
010_platform/001_global_reference/004_language.sql
010_platform/001_global_reference/005_locale.sql
010_platform/001_global_reference/006_timezone.sql
010_platform/001_global_reference/007_uom.sql
010_platform/001_global_reference/008a_commodity_code_unspsc.sql
010_platform/001_global_reference/008b_commodity_code_hs.sql
010_platform/001_global_reference/008c_commodity_crosswalk.sql
010_platform/001_global_reference/008d_commodity_code_keywords.sql
010_platform/001_global_reference/009b_industry_code_isic_groups_classes.sql
010_platform/001_global_reference/009c_industry_code_naics_subsectors.sql
010_platform/001_global_reference/009d_industry_crosswalk.sql
010_platform/001_global_reference/009e_industry_code_keywords.sql

# Permission model (personas, modules, permissions, roles)
010_platform/002_permission_model/010_persona.sql
010_platform/002_permission_model/011_workspace.sql
010_platform/002_permission_model/012_module.sql
010_platform/002_permission_model/013_enterprise_feature.sql
010_platform/002_permission_model/014_subscription_plan.sql
010_platform/002_permission_model/015_permission_category.sql
010_platform/002_permission_model/016_permission.sql
010_platform/002_permission_model/017_persona_permission.sql
010_platform/002_permission_model/018_role.sql
010_platform/002_permission_model/019_permission_return.sql
010_platform/002_permission_model/020_permission_platform_admin.sql
010_platform/002_permission_model/021_persona_permission_platform_admin.sql

010_platform/003_control/001_entity_class_profile.sql
010_platform/003_control/002_hook_actions.sql
010_platform/003_control/005_transaction_event_catalog.sql     ← 23 canonical lifecycle event codes
010_platform/003_control/007_upupr_entity_registration.sql
010_platform/003_control/008_upupr_lifecycle.sql
010_platform/003_control/009_upupr_workflow.sql
010_platform/003_control/010_transaction_flow_template.sql
010_platform/003_control/011_notification_routing_collab.sql   ← global collab routing rules (tenant_id=NULL)
010_platform/003_control/012_backfill_entity_code.sql          ← idempotent backfill; safe to re-run
010_platform/003_control/013_platform_cron_backup.sql          ← daily pg_dump backup cron schedule

010_platform/003_master/*.sql
010_platform/005_domain_registrations/100_master/*.sql
010_platform/005_domain_registrations/200_document/*.sql
010_platform/005_domain_registrations/900_operations/*.sql

# Entity Engine registry
010_platform/004_entity_engine/010_lifecycles/*.sql
010_platform/004_entity_engine/020_entities/*.sql
010_platform/004_entity_engine/025_entity_versions.sql
010_platform/004_entity_engine/030_canonical_fields/*.sql
010_platform/004_entity_engine/035_version_fields/*.sql
010_platform/004_entity_engine/002_field_groups.sql
010_platform/004_entity_engine/040_field_group_members.sql
010_platform/004_entity_engine/060_entity_operations/*.sql
010_platform/004_entity_engine/050_entity_lifecycles.sql
010_platform/004_entity_engine/070_entity_relations.sql

# Athyper system tenant (blueprint owner — platform-level singleton)
010_platform/006_system_tenant/000_athyper_tenant.sql
```

---

### Phase 3 — Blueprint Registry (020_universal/000_registry/)

Run once at system install; re-run when new packs are added.

```
020_universal/000_registry/000_blueprint_registry.sql   ← all foundation + COA + industry packs
020_universal/000_registry/001_ap_non_po_registry.sql   ← module pack registration
```

---

### Phase 3 — Tenant Provisioning (per-tenant, in tier order)

**Before running any file in this phase:**
```sql
SET app.seed_tenant_id = '<tenant_uuid>';
```

#### Step 1 — Create Tenant Record

```
040_tenants/{client}/000_tenant.sql
040_tenants/{client}/001_tenant_profile.sql
040_tenants/{client}/002_demo_tenants.sql    ← demo/staging only
```

#### Step 2 — TIER 1: Pre-company Foundation (always apply first)

```sql
SET app.seed_tenant_id = '<tenant_uuid>';

-- [1/6] base — universal spend taxonomy (prerequisite)
020_universal/010_spend_taxonomy/019_pre_seed_foundation.sql       ← ALWAYS FIRST
020_universal/010_spend_taxonomy/020_spend_categories.sql          ← Layer A: 17 universal roots (always)
020_universal/010_spend_taxonomy/020b_spend_categories_direct_ops.sql ← Layer B: 13 direct-ops roots (opt-in)
020_universal/010_spend_taxonomy/021_business_intents.sql
020_universal/010_spend_taxonomy/025_base_item_categories.sql
020_universal/010_spend_taxonomy/022_spend_intent_link.sql
020_universal/010_spend_taxonomy/027_commodity_bridge.sql
020_universal/010_spend_taxonomy/024_routing_rules.sql
020_universal/010_spend_taxonomy/026_base_intent_rules.sql

-- [2/6] foundation_tax — tax jurisdictions, types, rates, FX
020_universal/020_tax/320_tax_jurisdictions.sql
020_universal/020_tax/321_tax_types.sql
020_universal/020_tax/322_tax_rate_schedules.sql
020_universal/020_tax/323_tax_groups.sql
020_universal/020_tax/330_fx_rates.sql

-- [3/6] foundation_pay — holiday calendars, payment terms
020_universal/030_payments/340_holiday_calendars.sql
020_universal/030_payments/341_payment_terms.sql

-- [4/6] foundation_assets — asset class hierarchy
020_universal/040_assets/340_asset_classes.sql

-- [5/6] foundation_bank — payment rail format rules
020_universal/050_bank/001_bank_format_rule_defaults.sql
```

#### Step 3 — TIER 2a: COA Framework (select exactly one)

```
020_universal/200_coa_frameworks/200_chart_catalog.sql
020_universal/200_coa_frameworks/210_group_chart_accounts.sql      -- internal COA-GROUP reporting taxonomy
# selected framework:
020_universal/200_coa_frameworks/211_framework_ifrs_accounts.sql  -- coa_ifrs
020_universal/200_coa_frameworks/212_framework_gaap_accounts.sql  -- coa_gaap
```

#### Step 4 — TIER 2b: Industry Packs (select one or more, any order)

```
030_industry/100_industry_packs/100_pack_utilities.sql
030_industry/100_industry_packs/101_pack_construction.sql
030_industry/100_industry_packs/102_pack_real_estate.sql
030_industry/100_industry_packs/103_pack_transport.sql
030_industry/100_industry_packs/104_pack_trading.sql
030_industry/100_industry_packs/105_pack_hospitality.sql
030_industry/100_industry_packs/106_pack_infocomm.sql
030_industry/100_industry_packs/107_pack_financial.sql
030_industry/100_industry_packs/108_pack_mfg_textile.sql
030_industry/100_industry_packs/109_pack_mfg_food_bev.sql
030_industry/100_industry_packs/110_pack_mfg_pharma.sql
030_industry/100_industry_packs/111_pack_mfg_electronics.sql
030_industry/100_industry_packs/112_pack_mining_petroleum.sql
030_industry/100_industry_packs/113_pack_agriculture.sql
030_industry/100_industry_packs/114_pack_education.sql
030_industry/100_industry_packs/115_pack_healthcare.sql
```

#### Step 5 — Tenant Company Foundation and Org Structure

Order is strict. Tenant company-code seed files run first, then the shared
post-company org templates, then tenant-local operational data.

```
040_tenants/{client}/100_org_structure/199_gl_preseed.sql*          ← legal entities + company codes
040_tenants/{client}/100_org_structure/200*.sql                     ← optional tenant legal-entity overlays
040_tenants/{client}/100_org_structure/201*.sql                     ← optional tenant company-code overlays
020_universal/060_org_structure/300_org_units.sql                   ← universal org units
020_universal/060_org_structure/301_cost_centers.sql                ← universal cost centers
020_universal/060_org_structure/302_profit_centers.sql              ← universal profit centers
030_industry/200_org_structure/000_industry_org_templates.sql       ← applies only tagged industry/company mappings
040_tenants/{client}/100_org_structure/300_operating_units.sql      ← retired no-op compatibility placeholder
040_tenants/{client}/100_org_structure/301_cost_centers.sql         ← retired no-op compatibility placeholder
040_tenants/{client}/100_org_structure/302_profit_centers.sql       ← retired no-op compatibility placeholder
040_tenants/{client}/100_org_structure/303_sites.sql
040_tenants/{client}/100_org_structure/304_warehouses.sql
040_tenants/{client}/100_org_structure/310_fiscal_periods.sql
040_tenants/{client}/100_org_structure/311_ledger_books.sql
040_tenants/{client}/200_finance/201_company_chart_assignments.sql
040_tenants/{client}/800_subscriptions/001_demo_module_subscriptions.sql  ← demo/staging only
040_tenants/{client}/900_principals/001_demo_principals.sql               ← demo/staging only
040_tenants/{client}/900_principals/002_demo_principal_personas.sql       ← demo/staging only
040_tenants/{client}/900_principals/003_demo_delegation_grants.sql        ← demo/staging only
040_tenants/{client}/900_principals/004_athq_principals.sql
040_tenants/{client}/900_principals/005_named_tenant_principals.sql
040_tenants/{client}/900_principals/006_principal_users.sql
040_tenants/{client}/950_rbac/001_demo_rbac.sql                          ← demo/staging only
040_tenants/{client}/950_rbac/002_demo_group_members.sql                 ← demo/staging only
040_tenants/{client}/200_finance/270_refresh_mv.sql          ← refresh MVs after all data loaded
040_tenants/{client}/200_finance/280_validation_assertions.sql ← integrity checks; run before governance
040_tenants/{client}/300_governance/*.sql                    ← optional: close-cycle templates (demo: 001_finance_close_cycle.sql)
040_tenants/{client}/entity_engine/010_entity_policies.sql   ← MUST be last group
040_tenants/{client}/entity_engine/020_field_security_policies.sql
```

#### Step 6 — TIER 3: Module Packs (if subscribed)

```sql
SET app.seed_tenant_id = '<tenant_uuid>';

-- AP Non-PO Cycle
030_industry/600_modules/ap_non_po/005_accounting_profile_ddl.sql
030_industry/600_modules/ap_non_po/010_posting_roles.sql
030_industry/600_modules/ap_non_po/020_accounting_profiles.sql
030_industry/600_modules/ap_non_po/030_acct_profile_configs.sql
030_industry/600_modules/ap_non_po/040_acct_profile_events.sql
030_industry/600_modules/ap_non_po/050_acct_profile_entry_templates.sql
030_industry/600_modules/ap_non_po/060_category_intent_rules.sql
030_industry/600_modules/ap_non_po/070_intent_profile_rules.sql
030_industry/600_modules/ap_non_po/080_payment_settlement_rules.sql
030_industry/600_modules/ap_non_po/090_entity_operations_delta.sql
030_industry/600_modules/ap_non_po/099_apply.sql              ← records application receipt
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

1. Copy `040_tenants/_template/` → `040_tenants/{client_code}/`
2. Fill in all `__PLACEHOLDER__` values in `000_tenant.sql` and `001_tenant_profile.sql`
3. Add org structure files under `100_org_structure/`, finance under `200_finance/`, etc.
4. Run Phase 3 with `SET app.seed_tenant_id = '<new_uuid>'`

---

## Adding a New Blueprint Pack

1. Add SQL files to the appropriate tier subfolder under `020_universal/` (TIER 1/2a) or `030_industry/` (TIER 2b/3)
2. Register in `020_universal/000_registry/000_blueprint_registry.sql` (or a new `00N_*_registry.sql` for module packs)
3. Set `seed_files` paths relative to `900_seed_data/` root (e.g., `'030_industry/100_industry_packs/116_pack_xxx.sql'`)
4. Ensure all SQL files use `current_setting('app.seed_tenant_id', true)::uuid` — no hardcoded tenant codes
5. Re-run the registry file — it is idempotent (`ON CONFLICT (code) DO UPDATE`)
6. The pack is immediately available for new tenant provisioning

## Adding a New COA Framework (e.g., GAAP, MFRS)

1. Add framework account files to `020_universal/200_coa_frameworks/`
2. Register as `category = 'coa_framework'` with appropriate `framework` value
3. Update the provisioning wizard to present the new option
