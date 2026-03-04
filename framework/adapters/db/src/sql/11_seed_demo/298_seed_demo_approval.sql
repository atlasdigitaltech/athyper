/* ============================================================================
   Athyper v2.1 — Approval Templates Seed (Blueprint-Based)
   Tables: meta.approval_template, meta.approval_template_stage,
           meta.approval_template_rule
   Dependencies: core.tenant

   Approvals resolve to ROLE CODES (not user IDs). No HR org required.
   assign_to uses: {"role_code": "...", "scope": "..."}

   Template codes per blueprint:
     A: APPR-SOLO-1    (1 stage)
     B: APPR-SMALL-2   (2 stages)
     C: APPR-SME-3     (2-3 stages, conditional)
     D: APPR-ENT-3     (3 stages)
     E: APPR-BRANCH-2  (2 stages)
     F: APPR-ENTITY-3  (3 stages)

   Rules have NO unique constraint — use md5(conditions::text) guard
   for idempotency.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert approval template, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_appr_template(
    p_tenant uuid, p_code text, p_name text,
    p_behaviors jsonb DEFAULT '{}'::jsonb,
    p_escalation text DEFAULT 'LINEAR'
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO meta.approval_template (
        id, tenant_id, code, name, behaviors, escalation_style,
        version_no, is_active, created_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_code, p_name,
        p_behaviors, p_escalation, 1, true, 'seed'
    )
    ON CONFLICT (tenant_id, code, version_no) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert approval stage, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_appr_stage(
    p_tenant uuid, p_template_id uuid, p_stage_no int,
    p_name text, p_mode text DEFAULT 'serial'
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO meta.approval_template_stage (
        id, tenant_id, approval_template_id, stage_no, name, mode, created_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_template_id, p_stage_no, p_name, p_mode, 'seed'
    )
    ON CONFLICT (tenant_id, approval_template_id, stage_no) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: idempotent insert of approval rule (no unique constraint)
-- Uses md5 of conditions + assign_to + priority as identity signature
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_appr_rule(
    p_tenant uuid, p_template_id uuid, p_priority int,
    p_conditions jsonb, p_assign_to jsonb
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM meta.approval_template_rule
        WHERE tenant_id = p_tenant
          AND approval_template_id = p_template_id
          AND priority = p_priority
          AND md5(conditions::text) = md5(p_conditions::text)
    ) THEN
        INSERT INTO meta.approval_template_rule (
            id, tenant_id, approval_template_id, priority,
            conditions, assign_to, created_by
        ) VALUES (
            gen_random_uuid(), p_tenant, p_template_id, p_priority,
            p_conditions, p_assign_to, 'seed'
        );
    END IF;
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant  uuid;
    v_code    text;
    v_tmpl    uuid;
    v_stage   uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        CASE v_code

            -- ================================================================
            -- Blueprint A: APPR-SOLO-1 (1 stage: Owner self-approval)
            -- ================================================================
            WHEN 'demo_my', 'demo_in' THEN
                v_tmpl := pg_temp.upsert_appr_template(v_tenant,
                    'APPR-SOLO-1', 'Solo Owner Approval',
                    '{"auto_approve_below": 100}'::jsonb, 'LINEAR');

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 1, 'Owner Review');

                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 100,
                    '{}'::jsonb,
                    '{"role_code": "OWNER", "scope": "tenant"}'::jsonb);

            -- ================================================================
            -- Blueprint B: APPR-SMALL-2 (2 stages: Dept Head → Owner)
            -- ================================================================
            WHEN 'demo_sa', 'demo_qa' THEN
                v_tmpl := pg_temp.upsert_appr_template(v_tenant,
                    'APPR-SMALL-2', 'Small Business Approval',
                    '{"auto_approve_below": 500}'::jsonb, 'LINEAR');

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 1, 'Department Head');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 100,
                    '{}'::jsonb,
                    '{"role_code": "DEPT_HEAD", "scope": "ou"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 2, 'Owner Final');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 200,
                    '{"amount_gte": 1000}'::jsonb,
                    '{"role_code": "OWNER", "scope": "tenant"}'::jsonb);

            -- ================================================================
            -- Blueprint C: APPR-SME-3 (2-3 stages: Dept Head → Div Manager → CFO)
            -- ================================================================
            WHEN 'demo_fr', 'demo_de' THEN
                v_tmpl := pg_temp.upsert_appr_template(v_tenant,
                    'APPR-SME-3', 'SME Multi-Level Approval',
                    '{"auto_approve_below": 1000}'::jsonb, 'LINEAR');

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 1, 'Department Head');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 100,
                    '{}'::jsonb,
                    '{"role_code": "DEPT_HEAD", "scope": "ou"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 2, 'Division Manager');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 200,
                    '{"amount_gte": 5000}'::jsonb,
                    '{"role_code": "DIV_MANAGER", "scope": "division"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 3, 'CFO');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 300,
                    '{"amount_gte": 10000}'::jsonb,
                    '{"role_code": "CFO", "scope": "tenant"}'::jsonb);

            -- ================================================================
            -- Blueprint D: APPR-ENT-3 (3 stages: Dept Head → Controller → CFO)
            -- ================================================================
            WHEN 'demo_us' THEN
                v_tmpl := pg_temp.upsert_appr_template(v_tenant,
                    'APPR-ENT-3', 'Enterprise Approval',
                    '{"auto_approve_below": 2500}'::jsonb, 'LINEAR');

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 1, 'Department Head');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 100,
                    '{}'::jsonb,
                    '{"role_code": "DEPT_HEAD", "scope": "ou"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 2, 'Regional Controller');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 200,
                    '{"amount_gte": 10000}'::jsonb,
                    '{"role_code": "CONTROLLER", "scope": "region"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 3, 'CFO');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 300,
                    '{"amount_gte": 50000}'::jsonb,
                    '{"role_code": "CFO", "scope": "tenant"}'::jsonb);

            -- ================================================================
            -- Blueprint E: APPR-BRANCH-2 (2 stages: Branch Manager → Group CFO)
            -- ================================================================
            WHEN 'demo_ch' THEN
                v_tmpl := pg_temp.upsert_appr_template(v_tenant,
                    'APPR-BRANCH-2', 'Branch Approval',
                    '{"auto_approve_below": 2000}'::jsonb, 'LINEAR');

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 1, 'Branch Manager');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 100,
                    '{}'::jsonb,
                    '{"role_code": "BRANCH_MANAGER", "scope": "branch"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 2, 'Group CFO');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 200,
                    '{"amount_gte": 25000}'::jsonb,
                    '{"role_code": "GROUP_CFO", "scope": "tenant"}'::jsonb);

            -- ================================================================
            -- Blueprint F: APPR-ENTITY-3 (3 stages: Entity Controller → Group CFO → Board)
            -- ================================================================
            WHEN 'demo_ca' THEN
                v_tmpl := pg_temp.upsert_appr_template(v_tenant,
                    'APPR-ENTITY-3', 'Multi-Entity Approval',
                    '{"auto_approve_below": 5000}'::jsonb, 'LINEAR');

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 1, 'Entity Controller');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 100,
                    '{}'::jsonb,
                    '{"role_code": "ENTITY_CONTROLLER", "scope": "entity"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 2, 'Group CFO');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 200,
                    '{"amount_gte": 50000}'::jsonb,
                    '{"role_code": "GROUP_CFO", "scope": "tenant"}'::jsonb);

                v_stage := pg_temp.upsert_appr_stage(v_tenant, v_tmpl, 3, 'Board');
                PERFORM pg_temp.upsert_appr_rule(v_tenant, v_tmpl, 300,
                    '{"amount_gte": 100000}'::jsonb,
                    '{"role_code": "BOARD", "scope": "tenant"}'::jsonb);

            ELSE
                RAISE NOTICE 'Approvals: No blueprint mapping for tenant %', v_code;
        END CASE;

        RAISE NOTICE 'Approval templates seeded for tenant %', v_code;
    END LOOP;
END $$;
