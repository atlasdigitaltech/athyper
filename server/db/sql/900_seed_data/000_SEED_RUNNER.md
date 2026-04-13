# Seed Data — Execution Guide

## Categories & When to Run

| Folder | Category | When |
|---|---|---|
| `010_system/` | **System** | Once at install / migration. No tenant required. |
| `020_blueprint/` | **Blueprint** | During tenant provisioning. User selects packs. |
| `030_tenant/` | **Tenant** | During tenant provisioning, after blueprint applied. |
| `040_demo/` | Demo | Optional, for demo/staging environments only. |

---

## Execution Order

### Phase 1 — System (010_system/)

Run once on first deploy and again on upgrades that add new lookup values.

```
010_system/000_public/000_bootstrap.sql          ← MUST be first

010_system/000_lookups/LookupDomain/000_lookup_domains.sql  ← master registry
010_system/000_lookups/LookupDomain/control/*.sql           ← all control lookups
010_system/000_lookups/LookupDomain/document/*.sql
010_system/000_lookups/LookupDomain/event/*.sql
010_system/000_lookups/LookupDomain/governance/*.sql
010_system/000_lookups/LookupDomain/log/*.sql
010_system/000_lookups/LookupDomain/master/*.sql
010_system/000_lookups/LookupDomain/shared/*.sql

010_system/001_shared/001_country.sql
010_system/001_shared/002_state_region.sql
010_system/001_shared/003_currency.sql
010_system/001_shared/004_language.sql
010_system/001_shared/005_locale.sql
010_system/001_shared/006_timezone.sql
010_system/001_shared/007_uom.sql
010_system/001_shared/008a_commodity_code_unspsc.sql
010_system/001_shared/008b_commodity_code_hs.sql
010_system/001_shared/008c_commodity_crosswalk.sql
010_system/001_shared/008d_commodity_code_keywords.sql
010_system/001_shared/009b_industry_code_isic_groups_classes.sql
010_system/001_shared/009c_industry_code_naics_subsectors.sql
010_system/001_shared/009d_industry_crosswalk.sql
010_system/001_shared/009e_industry_code_keywords.sql
010_system/001_shared/010_persona.sql
010_system/001_shared/011_workspace.sql
010_system/001_shared/012_module.sql
010_system/001_shared/013_enterprise_feature.sql
010_system/001_shared/014_subscription_plan.sql
010_system/001_shared/015_permission_category.sql
010_system/001_shared/016_permission.sql
010_system/001_shared/017_persona_permission.sql
010_system/001_shared/018_role.sql
010_system/001_shared/019_permission_return.sql

010_system/002_control/001_entity_class_profile.sql
010_system/002_control/002_hook_actions.sql
010_system/002_control/007_upupr_entity_registration.sql
010_system/002_control/008_upupr_lifecycle.sql
010_system/002_control/009_upupr_workflow.sql
010_system/002_control/010_transaction_flow_template.sql

010_system/003_master/*.sql
010_system/004_document/*.sql
010_system/005_ledger/*.sql
010_system/006_log/*.sql
010_system/007_event/*.sql
010_system/008_governance/*.sql
010_system/009_snapshot/*.sql
010_system/010_aggregate/*.sql

010_system/100_finance/100_master/*.sql
010_system/100_finance/200_document/*.sql
010_system/100_finance/900_operations/*.sql
```

### Phase 2 — Blueprint Registry (020_blueprint/000_registry/)

Run once at system install (creates DDL) and re-run when new packs are added.

```
020_blueprint/000_registry/000_blueprint_registry.sql
```

#### Step 2a — Blueprint Tenant Record (020_blueprint/000_tenant/)

```
020_blueprint/000_tenant/000_athyper_tenant.sql
```

### Phase 3 — Tenant Provisioning (per-tenant)

#### Step 3a — Create Tenant Record

```
030_tenant/000_tenant/000_athyper_tenant.sql
030_tenant/000_tenant/002_demo_tenants.sql         ← demo/staging only
```

#### Step 3b — Apply Blueprint (user-selected packs)

Always apply in this order:

```
1. 020_blueprint/010_base/019_pre_seed_foundation.sql    ← always first
2. 020_blueprint/010_base/020_spend_categories.sql
3. 020_blueprint/010_base/021_business_intents.sql
4. 020_blueprint/010_base/025_base_item_categories.sql
5. 020_blueprint/010_base/022_spend_intent_link.sql
6. 020_blueprint/010_base/027_commodity_bridge.sql
7. 020_blueprint/010_base/024_routing_rules.sql
8. 020_blueprint/010_base/026_base_intent_rules.sql
9. [selected industry packs] — any order, after base above
   020_blueprint/100_industry_packs/100_pack_utilities.sql
   020_blueprint/100_industry_packs/101_pack_construction.sql
   020_blueprint/100_industry_packs/102_pack_real_estate.sql
   020_blueprint/100_industry_packs/103_pack_transport.sql
   020_blueprint/100_industry_packs/104_pack_trading.sql
   020_blueprint/100_industry_packs/105_pack_hospitality.sql
   020_blueprint/100_industry_packs/106_pack_infocomm.sql
   020_blueprint/100_industry_packs/107_pack_financial.sql
   020_blueprint/100_industry_packs/108_pack_mfg_textile.sql
   020_blueprint/100_industry_packs/109_pack_mfg_food_bev.sql
   020_blueprint/100_industry_packs/110_pack_mfg_pharma.sql
   020_blueprint/100_industry_packs/111_pack_mfg_electronics.sql
   020_blueprint/100_industry_packs/112_pack_mining_petroleum.sql
   020_blueprint/100_industry_packs/113_pack_agriculture.sql
   020_blueprint/100_industry_packs/114_pack_education.sql
   020_blueprint/100_industry_packs/115_pack_healthcare.sql
10. [selected COA framework] — one of:
    020_blueprint/200_coa_frameworks/200_chart_catalog.sql
    020_blueprint/200_coa_frameworks/210_group_chart_accounts.sql
    020_blueprint/200_coa_frameworks/211_framework_ifrs_accounts.sql
11. 020_blueprint/300_defaults/001_bank_format_rule_defaults.sql
```

#### Step 3c — Tenant Instance Data

Runs after all blueprint files are applied. Order is strict.

```
030_tenant/100_org_structure/199_gl_preseed.sql*   ← legal entities + company codes
030_tenant/200_finance/201_company_chart_assignments.sql
030_tenant/100_org_structure/300_operating_units.sql
030_tenant/100_org_structure/301_cost_centers.sql
030_tenant/100_org_structure/302_profit_centers.sql
030_tenant/100_org_structure/303_sites.sql
030_tenant/100_org_structure/304_warehouses.sql
030_tenant/100_org_structure/310_fiscal_periods.sql
030_tenant/100_org_structure/311_ledger_books.sql
030_tenant/300_tax/320_tax_jurisdictions.sql
030_tenant/300_tax/321_tax_types.sql
030_tenant/300_tax/322_tax_rate_schedules.sql
030_tenant/300_tax/323_tax_groups.sql
030_tenant/300_tax/330_fx_rates.sql
030_tenant/400_payments/340_holiday_calendars.sql
030_tenant/400_payments/341_payment_terms.sql
030_tenant/500_asset/340_asset_classes.sql
030_tenant/800_subscriptions/001_demo_module_subscriptions.sql  ← demo/staging only
030_tenant/900_principals/001_demo_principals.sql               ← demo/staging only
030_tenant/900_principals/002_demo_principal_personas.sql       ← demo/staging only
030_tenant/900_principals/003_demo_delegation_grants.sql        ← demo/staging only
030_tenant/900_principals/004_athq_principals.sql
030_tenant/950_rbac/001_demo_rbac.sql                          ← demo/staging only
030_tenant/950_rbac/002_demo_group_members.sql                  ← demo/staging only
030_tenant/200_finance/270_refresh_mv.sql          ← refresh MVs after all data loaded
030_tenant/200_finance/280_validation_assertions.sql ← run last to verify integrity
```

---

## Blueprint Selection Rules

| Rule | Detail |
|---|---|
| `base` always required | Every tenant provisioning MUST apply the `base` pack first |
| One COA framework | Select exactly one: `coa_ifrs` (more frameworks to be added) |
| Industry packs | Select one or more based on tenant's industries; can be added incrementally |
| `default_rules` | Recommended; skip only if tenant fully overrides bank rules |

Query available blueprints:
```sql
SELECT code, name, category, framework, dependencies
FROM control.v_blueprint_catalogue
ORDER BY category, code;
```

Check what's applied to a tenant:
```sql
SELECT br.code, br.name, tba.applied_version, tba.applied_at, tba.status
FROM control.tenant_blueprint_application tba
JOIN control.blueprint_registry br ON br.code = tba.blueprint_code
WHERE tba.tenant_id = '<tenant_id>'
ORDER BY tba.applied_at;
```

---

## Adding a New Blueprint Pack

1. Add the SQL file to the appropriate subfolder under `020_blueprint/`
2. Add a row to `000_blueprint_registry.sql` and re-run it (idempotent)
3. The new pack is immediately available for tenant provisioning

## Adding a New COA Framework (e.g., GAAP, MFRS)

1. Add framework account files to `020_blueprint/200_coa_frameworks/`
2. Register as `category = 'coa_framework'` with `framework = 'GAAP'` in the registry
3. Update the provisioning wizard to offer the new framework option
