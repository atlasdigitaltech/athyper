-- seed-contract-version: 1
-- seed-pack: neon.blueprint.governance
-- seed-pack-version: 2.0.0
-- seed-dataset: control.finance-close-governance-configuration
-- seed-data-class: production_reference
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- Immutable pack identity and application outcome are recorded by the Wave 5
-- manifest/receipt runner; this payload performs only post-application checks.

DO $assert$
DECLARE
  v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid;
  v_companies integer;
  v_types integer;
  v_phases integer;
  v_categories integer;
  v_templates integer;
  v_dependencies integer;
  v_cross_dependencies integer;
  v_rules integer;
BEGIN
  IF current_setting('app.database_plane',true)<>'neon' OR v_tid IS NULL THEN
    RAISE EXCEPTION '[wave5.governance] Neon tenant scope required';
  END IF;
  SELECT count(*) INTO v_companies FROM master.company_code
   WHERE tenant_id=v_tid AND status='active' AND length(code)<=20;
  SELECT count(*) INTO v_types FROM control.cycle_type
   WHERE tenant_id=v_tid AND code IN ('FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE')
     AND domain_code='finance_close' AND is_active;
  SELECT count(*) INTO v_phases FROM control.cycle_phase p JOIN control.cycle_type t
    ON t.tenant_id=p.tenant_id AND t.id=p.cycle_type_id
   WHERE p.tenant_id=v_tid AND t.code IN ('FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE') AND p.is_active;
  SELECT count(*) INTO v_categories FROM control.cycle_task_category c JOIN control.cycle_type t
    ON t.tenant_id=c.tenant_id AND t.id=c.cycle_type_id
   WHERE c.tenant_id=v_tid AND t.code IN ('FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE') AND c.is_active;
  SELECT count(*) INTO v_templates FROM control.cycle_task_template x JOIN control.cycle_type t
    ON t.tenant_id=x.tenant_id AND t.id=x.cycle_type_id
   WHERE x.tenant_id=v_tid AND t.code IN ('FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE') AND x.is_active;
  SELECT count(*) INTO v_dependencies FROM control.cycle_task_dependency x JOIN control.cycle_type t
    ON t.tenant_id=x.tenant_id AND t.id=x.cycle_type_id
   WHERE x.tenant_id=v_tid AND t.code IN ('FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE') AND x.status='active';
  SELECT count(*) INTO v_rules FROM control.cycle_carryforward_rule x JOIN control.cycle_type t
    ON t.tenant_id=x.tenant_id AND t.id=x.cycle_type_id
   WHERE x.tenant_id=v_tid AND t.code IN ('FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE') AND x.status='active';
  SELECT count(*) INTO v_cross_dependencies
    FROM control.cycle_cross_dependency x
    JOIN control.cycle_type predecessor_type
      ON predecessor_type.tenant_id=x.tenant_id AND predecessor_type.id=x.predecessor_type_id
    JOIN control.cycle_phase predecessor_phase
      ON predecessor_phase.tenant_id=x.tenant_id AND predecessor_phase.id=x.predecessor_phase_id
         AND predecessor_phase.cycle_type_id=predecessor_type.id
    JOIN control.cycle_type successor_type
      ON successor_type.tenant_id=x.tenant_id AND successor_type.id=x.successor_type_id
    JOIN control.cycle_phase successor_phase
      ON successor_phase.tenant_id=x.tenant_id AND successor_phase.id=x.successor_phase_id
         AND successor_phase.cycle_type_id=successor_type.id
   WHERE x.tenant_id=v_tid AND x.status='active'
     AND predecessor_type.code='MONTHLY_CLOSE' AND predecessor_phase.code='CERTIFICATION'
     AND successor_type.code='YEAR_END_CLOSE' AND successor_phase.code='YEAR_END_CERTIFICATION'
     AND x.is_hard;
  IF v_types<>4 OR v_phases<32 OR v_categories<56 OR v_rules<12 THEN
    RAISE EXCEPTION '[wave5.governance] configuration count mismatch types=% phases=% categories=% rules=%',v_types,v_phases,v_categories,v_rules;
  END IF;
  IF v_companies>0 AND (v_templates<>v_companies*84 OR v_dependencies<>v_companies*94) THEN
    RAISE EXCEPTION '[wave5.governance] company expansion mismatch companies=% templates=% dependencies=%',v_companies,v_templates,v_dependencies;
  END IF;
  IF v_cross_dependencies<>1 THEN
    RAISE EXCEPTION '[wave5.governance] expected one hard monthly-to-year-end certification dependency, got %',v_cross_dependencies;
  END IF;
  IF EXISTS(SELECT 1 FROM control.cycle_phase p LEFT JOIN control.cycle_type t
    ON t.tenant_id=p.tenant_id AND t.id=p.cycle_type_id WHERE p.tenant_id=v_tid AND t.id IS NULL) THEN
    RAISE EXCEPTION '[wave5.governance] orphan cycle phase';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM control.cycle_task_dependency d
      LEFT JOIN control.cycle_task_template predecessor
        ON predecessor.tenant_id=d.tenant_id AND predecessor.id=d.predecessor_template_id
      LEFT JOIN control.cycle_task_template successor
        ON successor.tenant_id=d.tenant_id AND successor.id=d.successor_template_id
     WHERE d.tenant_id=v_tid
       AND (predecessor.id IS NULL OR successor.id IS NULL
         OR predecessor.cycle_type_id<>d.cycle_type_id
         OR successor.cycle_type_id<>d.cycle_type_id
         OR predecessor.entity_code IS DISTINCT FROM successor.entity_code
         OR NOT EXISTS (
           SELECT 1 FROM master.company_code company
            WHERE company.tenant_id=v_tid AND company.code=predecessor.entity_code
              AND company.status='active'
         ))
  ) THEN
    RAISE EXCEPTION '[wave5.governance] orphan or cross-company task dependency';
  END IF;
END $assert$;
