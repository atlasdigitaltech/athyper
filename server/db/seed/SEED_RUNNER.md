# Seed Data â€” Execution Guide

## Folder Map

| Folder | Phase | Category | When |
|---|---|---|---|
| `platform/` | 2 | **Platform** | Once at install / upgrade. No tenant required. |
| `blueprints/universal/` | 3 | **Universal Blueprint** | Per-tenant â€” TIER 1 foundation + TIER 2a COA (always apply). |
| `blueprints/industry/` | 3 | **Industry Blueprint** | Per-tenant â€” TIER 2b industry packs. |
| `blueprints/modules/` | 3 | **Module Packs** | Per-tenant â€” TIER 3 optional subscription modules. |
| `../tenants/{client}/` | 3 | **Tenant Instance** | Per-client NEON tenant onboarding, after all blueprint tiers complete. |
| `../admin/` | 3 | **Admin Plane Seed** | ADMIN plane: platform staff + identity bindings. Runs after all NEON tenants. |
| `../mesh/` | 3 | **Mesh Plane Seed** | MESH plane: partner tenants + network memberships + groups. Runs after all NEON tenants. |

> **Adding a new client:** copy `../tenants/_template/` to `../tenants/{client_code}/`,
> fill in the placeholders, and run Phase 3 with `SET app.seed_tenant_id = '<uuid>'`.
>
> **Admin/MESH plane seeds** do not use `app.seed_tenant_id` â€” each file resolves its
> own tenant via `WHERE realm_key = 'admin'/'mesh' AND code = '...'`.

---

## Session Variable â€” Required for All Blueprint & Tenant Files

Every blueprint and tenant seed file reads the target tenant from a PostgreSQL session variable.
**Set this before running any Phase 3 file:**

```sql
SET app.seed_tenant_id = '<tenant_uuid>';
-- Example:
SET app.seed_tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

If the variable is not set, the file raises:
```
ERROR: [seed] app.seed_tenant_id not set â€” run: SET app.seed_tenant_id = '<uuid>'
```

---

## Blueprint Tier Model

Every new tenant runs blueprints in this fixed tier order:

```
TIER 1 â€” Foundation        (always apply, no selection)
  [1/6] base               universal spend taxonomy
  [2/6] foundation_tax     tax jurisdictions, types, rates, FX
  [3/6] foundation_pay     holiday calendars, payment terms
  [4/6] foundation_assets  asset class hierarchy
  [5/6] foundation_bank    bank format & payment rail rules
  [6/6] org_foundation     org units, cost centers, profit centers
                            post-company-code step

TIER 2a â€” COA Framework    (select exactly one)
  coa_ifrs                 IFRS chart of accounts
  coa_gaap                 US GAAP chart of accounts

TIER 2b â€” Industry Packs   (select one or more; additive)
  pack_utilities, pack_construction, pack_real_estate,
  pack_transport, pack_trading, pack_hospitality, pack_infocomm,
  pack_financial, pack_mfg_textile, pack_mfg_food_bev,
  pack_mfg_pharma, pack_mfg_electronics, pack_mining_petroleum,
  pack_agriculture, pack_education, pack_healthcare

TIER 3 â€” Module Packs      (optional; subscription-gated)
  pack_ap_non_po           Non-PO Accounts Payable cycle
  (future: pack_ar, pack_inventory, pack_payroll, â€¦)
```

---

## Execution Order

### Phase 2 â€” Platform (platform/)

Run once on first deploy and again on upgrades that add new lookup values.
No tenant required â€” no `SET app.seed_tenant_id` needed.

Files sort alphabetically by subfolder prefix (numeric order):

```
# System authority bootstrap is no longer a legacy platform seed phase. It is
# owned by the common DDL layer and executes first at layer 12 in all planes:
ddl/common/master/12_system_authority_reference_seed.sql

# Lookup domains moved to DDL layer-12 in Wave 3 and are owned by manifests:
# common/control/12_lookup_reference_entrypoint.sql
# athyper/control/12_lookup_reference_entrypoint.sql
# neon/control/12_lookup_reference_entrypoint.sql
# mesh/control/12_lookup_reference_entrypoint.sql

# Global reference data is no longer a legacy platform seed phase. It is owned
# by the common DDL layer and executes in Athyper, Neon, and Mesh through:
ddl/common/shared/12_reference_seed.sql
ddl/common/shared/reference-data/*.sql

# Permission model has been retired from legacy platform seed path.
# Platform catalog and authorization seed contracts are now DDL-layer owned:
# ddl/planes/athyper/master/12_platform_catalog_reference_seed.sql
# ddl/planes/neon/master/12_platform_catalog_reference_seed.sql
# ddl/planes/mesh/master/12_platform_catalog_reference_seed.sql

# Control tables
# Default layout is one table-owned file per control table. During development,
# tightly coupled domain contracts may be consolidated when that is clearer than
# patch-style fragments. Lookup domain/value seeds now execute from DDL lookup packs
# (Wave 3), not legacy platform files.
platform/003_control/005_control_entity_metadata_rebuild_contract.sql
platform/003_control/010_control_entity_class_profile_contract.sql
platform/003_control/020_control_field_group_contract.sql
platform/003_control/030_control_lifecycle_contract.sql
platform/003_control/031_lifecycle_state.sql
platform/003_control/032_lifecycle_transition.sql
platform/003_control/033_lifecycle_transition_gate.sql
platform/003_control/034_lifecycle_transition_hook.sql
platform/003_control/035_lifecycle_timer_policy.sql
platform/003_control/036_lifecycle_hook_override.sql
platform/003_control/040_control_entity_contract.sql
platform/003_control/040a_control_all_schema_entity_coverage_contract.sql
platform/003_control/041_control_entity_version_contract.sql
platform/003_control/042_control_entity_field_contract.sql
platform/003_control/042b_control_field_group_member_contract.sql
platform/003_control/042d_ap_purchase_invoice_contract.sql
platform/003_control/043_control_entity_relation_contract.sql
platform/003_control/044_control_entity_operation_contract.sql
platform/003_control/044b_site_warehouse_contract.sql
platform/003_control/045_control_entity_field_data_type_normalization_contract.sql
platform/003_control/045_control_entity_lifecycle_contract.sql
platform/003_control/046_control_entity_flow_contract.sql
platform/003_control/047_entity_flow_section.sql
platform/003_control/048_entity_flow_step.sql
platform/003_control/049_entity_flow_field.sql
platform/003_control/050_control_entity_numbering_config_contract.sql
platform/003_control/051_entity_numbering_counter.sql
platform/003_control/052_entity_policy.sql
platform/003_control/053_entity_publish_state.sql
platform/003_control/054_control_feature_flag_contract.sql
platform/003_control/055_field_security_policy.sql
platform/003_control/056_forecast_budget_bridge.sql
platform/003_control/057_forecast_line.sql
platform/003_control/058_formula_expression.sql
platform/003_control/059_formula_expression_version.sql
platform/003_control/060_workflow_template.sql
platform/003_control/061_workflow_template_stage.sql
platform/003_control/062_workflow_template_rule.sql
platform/003_control/063_workflow_sla_policy.sql
platform/003_control/064_workflow_definition.sql
platform/003_control/070_control_hook_action_registry_contract.sql
platform/003_control/080_control_transaction_event_contract.sql
platform/003_control/081_transaction_flow_template.sql
platform/003_control/082_notification_template.sql
platform/003_control/083_notification_routing_rule.sql
platform/003_control/084_control_cron_schedule_contract.sql
platform/003_control/085_control_parameter_definition_contract.sql
platform/003_control/090_control_blueprint_registry_contract.sql
platform/003_control/091_default_print_profile.sql
platform/003_control/092_entity_print_config.sql
platform/003_control/093_print_hide_fields.sql
platform/003_control/095_control_three_plane_runtime_contract.sql

# Legacy platform/003_master packs moved to plane-local/common DDL layer 12.

# The former platform/006_system_tenant copy was retired as duplicate demo
# onboarding data. Named demo tenants are owned only by tenants/<plane>/...
```

---

### Phase 3 â€” Tenant Provisioning (per-tenant, in tier order)

**Before running any file in this phase:**
```sql
SET app.seed_tenant_id = '<tenant_uuid>';
```

#### Step 1 â€” Create Tenant Record

```
tenants/neon/{client}/000_tenant.sql
tenants/neon/{client}/001_tenant_profile.sql
tenants/neon/{client}/002_demo_tenants.sql    â† demo/staging only
```

#### Step 2 â€” TIER 1: Pre-company Foundation (always apply first)

```sql
SET app.seed_tenant_id = '<tenant_uuid>';

-- [1/6] base â€” universal spend taxonomy (prerequisite)
blueprints/universal/010_spend_taxonomy/019_pre_seed_foundation.sql       â† ALWAYS FIRST
blueprints/universal/010_spend_taxonomy/020_spend_categories.sql          â† Layer A: 17 universal roots (always)
blueprints/universal/010_spend_taxonomy/020b_spend_categories_direct_ops.sql â† Layer B: 13 direct-ops roots (opt-in)
blueprints/universal/010_spend_taxonomy/021_business_intents.sql
blueprints/universal/010_spend_taxonomy/022_spend_intent_link.sql
blueprints/universal/010_spend_taxonomy/027_commodity_bridge.sql
blueprints/universal/010_spend_taxonomy/028_commodity_category_model.sql  â† migrates spend_category roots â†’ commodity_category
blueprints/universal/010_spend_taxonomy/024_routing_rules.sql
blueprints/universal/010_spend_taxonomy/026_base_intent_rules.sql

-- Commodity category policy validation (run after taxonomy seeds)
blueprints/universal/990_validation/900_commodity_category_policy_refresh.sql

-- [2/6] foundation_tax â€” tax jurisdictions, types, rates, FX
blueprints/universal/020_tax/320_tax_jurisdictions.sql
blueprints/universal/020_tax/321_tax_types.sql
blueprints/universal/020_tax/322_tax_rate_schedules.sql
blueprints/universal/020_tax/323_tax_groups.sql
blueprints/universal/020_tax/330_fx_rates.sql

-- [3/6] foundation_pay â€” holiday calendars, payment terms
blueprints/universal/030_payments/340_holiday_calendars.sql
blueprints/universal/030_payments/341_payment_terms.sql

-- [4/6] foundation_assets â€” asset class hierarchy
blueprints/universal/040_assets/340_asset_classes.sql

-- [5/6] foundation_bank â€” payment rail format rules
blueprints/universal/050_bank/001_bank_format_rule_defaults.sql
```

#### Step 3 â€” TIER 2a: COA Framework (select exactly one)

```
blueprints/universal/200_coa_frameworks/200_chart_catalog.sql
blueprints/universal/200_coa_frameworks/210_group_chart_accounts.sql      -- internal COA-GROUP reporting taxonomy
# selected framework:
blueprints/universal/200_coa_frameworks/211_framework_ifrs_accounts.sql  -- coa_ifrs
blueprints/universal/200_coa_frameworks/212_framework_gaap_accounts.sql  -- coa_gaap
```

#### Step 4 â€” TIER 2b: Industry Packs (select one or more, any order)

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

#### Step 5 â€” Tenant Company Foundation and Org Structure

Order is strict. Tenant company-code seed files run first, then the shared
post-company org templates, then tenant-local operational data.

```
tenants/neon/{client}/100_org_structure/199_gl_preseed.sql*          â† legal entities + company codes
tenants/neon/{client}/100_org_structure/200*.sql                     â† optional tenant legal-entity overlays
tenants/neon/{client}/100_org_structure/201*.sql                     â† optional tenant company-code overlays
blueprints/universal/060_org_structure/300_org_units.sql                   â† universal org units
blueprints/universal/060_org_structure/301_cost_centers.sql                â† universal cost centers
blueprints/universal/060_org_structure/302_profit_centers.sql              â† universal profit centers
blueprints/industry/200_org_structure/000_industry_org_templates.sql       â† applies only tagged industry/company mappings
tenants/neon/{client}/100_org_structure/303_sites.sql
tenants/neon/{client}/100_org_structure/304_warehouses.sql
tenants/neon/{client}/100_org_structure/310_fiscal_periods.sql
tenants/neon/{client}/100_org_structure/311_ledger_books.sql
tenants/neon/{client}/200_finance/201_company_chart_assignments.sql
tenants/neon/{client}/800_subscriptions/001_demo_module_subscriptions.sql  â† demo/staging only
tenants/neon/{client}/900_principals/001_demo_principals.sql               â† demo/staging only
tenants/neon/{client}/900_principals/002_demo_principal_personas.sql       â† demo/staging only
tenants/neon/{client}/900_principals/003_demo_delegation_grants.sql        â† demo/staging only
tenants/neon/{client}/900_principals/004_athq_principals.sql
tenants/neon/{client}/900_principals/005_named_tenant_principals.sql
tenants/neon/{client}/900_principals/006_principal_users.sql
tenants/neon/{client}/950_rbac/001_demo_rbac.sql                          â† demo/staging only
tenants/neon/{client}/950_rbac/002_demo_group_members.sql                 â† demo/staging only
tenants/neon/{client}/200_finance/270_refresh_mv.sql          â† refresh MVs after all data loaded
tenants/neon/{client}/200_finance/280_validation_assertions.sql â† integrity checks; run before governance
tenants/neon/{client}/300_governance/*.sql                    â† optional: close-cycle templates (demo: 001_finance_close_cycle.sql)
tenants/neon/{client}/entity_engine/010_entity_policies.sql   â† MUST be last group
tenants/neon/{client}/entity_engine/020_field_security_policies.sql
```

#### Step 6 â€” TIER 3: Module Packs (if subscribed)

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
blueprints/modules/ap_non_po/099_apply.sql              â† records application receipt
```

---

## Blueprint Selection Rules

| Rule | Detail |
|---|---|
| Foundation always applied | Pre-company foundation runs first; `org_foundation` runs after tenant company codes exist. |
| One COA framework | Select exactly one operating COA: `coa_ifrs` or `coa_gaap`. `COA-GROUP` is internal reporting taxonomy, not a selectable COA. |
| Industry packs | Select one or more based on tenant's industries; additive post-provisioning |
| Module packs | Enabled per subscription tier; run 005â†’099_apply in order |

Query available blueprints:
```sql
SELECT code, name, category, framework, dependencies
FROM control.v_blueprint_catalogue
ORDER BY category, code;
```

Check what's applied to a tenant:
```sql
SELECT br.code, br.name, br.category, tba.applied_version, tba.applied_at, tba.status
FROM control.blueprint_tenant_application tba
JOIN control.blueprint_registry br ON br.code = tba.blueprint_code
WHERE tba.tenant_id = '<tenant_id>'
ORDER BY tba.applied_at;
```

---

## Adding a New Client Tenant

1. Copy `tenants/neon/_template/` â†’ `tenants/neon/{client_code}/`
2. Fill in all `__PLACEHOLDER__` values in `000_tenant.sql` and `001_tenant_profile.sql`
3. Add org structure files under `100_org_structure/`, finance under `200_finance/`, etc.
4. Run Phase 3 with `SET app.seed_tenant_id = '<new_uuid>'`

---

## Adding a New Blueprint Pack

1. Add SQL files to the appropriate tier subfolder under `blueprints/universal/` (TIER 1/2a), `blueprints/industry/` (TIER 2b), or `blueprints/modules/` (TIER 3)
2. Register in `platform/003_control/090_control_blueprint_registry_contract.sql`
3. Set `seed_files` paths relative to the seed root (e.g., `'blueprints/industry/100_industry_packs/116_pack_xxx.sql'`)
4. Ensure all SQL files use `current_setting('app.seed_tenant_id', true)::uuid` â€” no hardcoded tenant codes
5. Re-run the registry file â€” it is idempotent (`ON CONFLICT (code) DO UPDATE`)
6. The pack is immediately available for new tenant provisioning

## Adding a New COA Framework (e.g., GAAP, MFRS)

1. Add framework account files to `blueprints/universal/200_coa_frameworks/`
2. Register as `category = 'coa_framework'` with appropriate `framework` value
3. Update the provisioning wizard to present the new option
