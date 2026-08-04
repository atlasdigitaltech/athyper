import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const source = resolve(db, "seed-migration/archive/wave5/asset-policies/341_asset_class_book_policy_templates.legacy.sql");
const target = resolve(db, "seed/blueprints/universal/040_assets/341_asset_class_book_policy_templates.sql");

async function main() {
  const legacy = await readFile(source, "utf8");
  const match = legacy.match(/FROM\s*\(VALUES([\s\S]*?)\)\s+AS\s+v\s*\(([\s\S]*?)\)\s*ON CONFLICT/i);
  if (!match) throw new Error("legacy IFRS asset-policy VALUES block not found");
  const values = match[1]!.trim();
  const columns = match[2]!.replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ").trim();
  const sql = `-- seed-contract-version: 1
-- seed-pack: neon.blueprint.asset-policies
-- seed-pack-version: 2.0.0
-- seed-dataset: control.asset-class-book-policy
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 5 IFRS asset-policy rewrite","publisher":"Athyper","source_version":"IFRS_DEFAULT-v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-natural-key: control.asset_class_book_policy(tenant_id,company_code_id,asset_class_id,ledger_book_id,effective_from)
-- seed-id-strategy: deterministic-uuid:athyper-wave5-asset-policy-v2
-- seed-expected-row-count: 12-per-active-assigned-statutory-or-management-book
-- seed-assertions: expected-count,orphan,uniqueness,semantic,idempotent-convergence
-- seed-demo-data: false

DO $seed$
DECLARE
  v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
  v_actor uuid := '00000000-0000-0000-0000-000000000000';
  v_expected integer;
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' OR v_tid IS NULL
     OR NOT EXISTS (SELECT 1 FROM master.tenant WHERE id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.asset-policy] active Neon tenant scope required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM master.company_code_book_assignment WHERE tenant_id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.asset-policy] at least one active company/book assignment required';
  END IF;

  WITH policy_template(${columns}) AS (VALUES
${values}
  ), currency_threshold(currency_code,base_threshold) AS (VALUES
    ('MYR'::character(3),5000::numeric),('SAR',5000),('AED',5000),('USD',1000),
    ('SGD',1500),('INR',50000),('CAD',1000),('EUR',1000),('TWD',30000),
    ('ZAR',10000),('GBP',1000),('JPY',100000),('PHP',50000)
  ), resolved AS (
    SELECT cc.id company_id, ac.id class_id, lb.id book_id,
      COALESCE(ba.override_currency_code,lb.base_currency_code) currency_code,
      COALESCE(ct.base_threshold,1000)*p.threshold_multiplier threshold,
      p.*
    FROM policy_template p
    JOIN master.asset_class ac ON ac.tenant_id=v_tid AND ac.code=p.asset_class_code AND ac.status='active'
    JOIN master.ledger_book lb ON lb.tenant_id=v_tid AND lb.category=p.book_category AND lb.status='active'
    JOIN master.company_code_book_assignment ba ON ba.tenant_id=v_tid AND ba.book_id=lb.id AND ba.status='active'
      AND ba.effective_from<=DATE '2025-01-01' AND (ba.effective_to IS NULL OR ba.effective_to>=DATE '2025-01-01')
    JOIN master.company_code cc ON cc.tenant_id=v_tid AND cc.id=ba.company_code_id AND cc.status='active'
    LEFT JOIN currency_threshold ct ON ct.currency_code=COALESCE(ba.override_currency_code,lb.base_currency_code)
  )
  INSERT INTO control.asset_class_book_policy(
    id,tenant_id,company_code_id,asset_class_id,ledger_book_id,capitalization_threshold,
    capitalization_currency,effective_from,depreciation_method,useful_life_months,
    residual_value_mode,residual_value_pct,convention,prorate_basis,depreciation_start_rule,
    method_params,allow_manual_life_override,allow_manual_residual_override,allow_manual_method_override,
    acquisition_posting_role_code,accum_depr_posting_role_code,depr_expense_posting_role_code,
    gain_loss_posting_role_code,impairment_expense_posting_role_code,impairment_reserve_posting_role_code,
    revaluation_surplus_posting_role_code,revaluation_loss_posting_role_code,cwip_posting_role_code,
    metadata,status,created_by)
  SELECT md5('wave5:asset-policy:'||v_tid||':'||company_id||':'||class_id||':'||book_id||':2025-01-01')::uuid,
    v_tid,company_id,class_id,book_id,threshold,CASE WHEN threshold=0 THEN NULL ELSE currency_code END,DATE '2025-01-01',
    depreciation_method,COALESCE(useful_life_months,0),residual_value_mode,residual_value_pct,convention,
    'monthly',depreciation_start_rule,method_params,is_depreciable,is_depreciable,false,
    acquisition_role,accum_depr_role,depr_expense_role,gain_loss_role,impairment_expense_role,
    impairment_reserve_role,revaluation_surplus_role,revaluation_loss_role,cwip_role,
    jsonb_build_object('_seed',jsonb_build_object('pack','asset-policies','version','2.0.0'),
      'framework','ifrs','source_note',source_note,'useful_life_min_months',useful_life_min_months,
      'useful_life_max_months',useful_life_max_months),'active',v_actor
  FROM resolved
  ON CONFLICT(tenant_id,company_code_id,asset_class_id,ledger_book_id,effective_from) DO UPDATE SET
    capitalization_threshold=excluded.capitalization_threshold,capitalization_currency=excluded.capitalization_currency,
    depreciation_method=excluded.depreciation_method,useful_life_months=excluded.useful_life_months,
    residual_value_mode=excluded.residual_value_mode,residual_value_pct=excluded.residual_value_pct,
    convention=excluded.convention,prorate_basis=excluded.prorate_basis,
    depreciation_start_rule=excluded.depreciation_start_rule,method_params=excluded.method_params,
    allow_manual_life_override=excluded.allow_manual_life_override,
    allow_manual_residual_override=excluded.allow_manual_residual_override,
    allow_manual_method_override=excluded.allow_manual_method_override,
    acquisition_posting_role_code=excluded.acquisition_posting_role_code,
    accum_depr_posting_role_code=excluded.accum_depr_posting_role_code,
    depr_expense_posting_role_code=excluded.depr_expense_posting_role_code,
    gain_loss_posting_role_code=excluded.gain_loss_posting_role_code,
    impairment_expense_posting_role_code=excluded.impairment_expense_posting_role_code,
    impairment_reserve_posting_role_code=excluded.impairment_reserve_posting_role_code,
    revaluation_surplus_posting_role_code=excluded.revaluation_surplus_posting_role_code,
    revaluation_loss_posting_role_code=excluded.revaluation_loss_posting_role_code,
    cwip_posting_role_code=excluded.cwip_posting_role_code,metadata=excluded.metadata,status='active',
    updated_at=now(),updated_by=v_actor
  WHERE (control.asset_class_book_policy.capitalization_threshold,
         control.asset_class_book_policy.capitalization_currency,
         control.asset_class_book_policy.depreciation_method,
         control.asset_class_book_policy.useful_life_months,
         control.asset_class_book_policy.residual_value_mode,
         control.asset_class_book_policy.residual_value_pct,
         control.asset_class_book_policy.convention,
         control.asset_class_book_policy.method_params,
         control.asset_class_book_policy.metadata,
         control.asset_class_book_policy.status)
    IS DISTINCT FROM
        (excluded.capitalization_threshold,excluded.capitalization_currency,
         excluded.depreciation_method,excluded.useful_life_months,
         excluded.residual_value_mode,excluded.residual_value_pct,excluded.convention,
         excluded.method_params,excluded.metadata,'active'::shared.active_inactive_d);

  SELECT count(*)*12 INTO v_expected FROM master.company_code_book_assignment ba
  JOIN master.ledger_book lb ON lb.tenant_id=ba.tenant_id AND lb.id=ba.book_id AND lb.status='active'
  WHERE ba.tenant_id=v_tid AND ba.status='active' AND lb.category IN ('statutory','management')
    AND ba.effective_from<=DATE '2025-01-01' AND (ba.effective_to IS NULL OR ba.effective_to>=DATE '2025-01-01');
  IF (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id=v_tid
      AND metadata->'_seed'->>'pack'='asset-policies') <> v_expected THEN
    RAISE EXCEPTION '[wave5.asset-policy] expected % effective policies',v_expected;
  END IF;
END $seed$;
`;
  await writeFile(target, sql);
  console.log("Wave 5 effective asset-policy payload materialized.");
}
main().catch((error)=>{ console.error(error); process.exitCode=1; });
