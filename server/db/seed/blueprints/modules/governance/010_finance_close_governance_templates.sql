-- Finance close governance templates (cycle_type + phases + categories + task
-- templates + dependencies + carryforward rules) for two cycles:
--   MONTHLY_CLOSE   — open current month, soft-close prior month
--   YEAR_END_CLOSE  — final certification and hard-close lock
-- Task templates are expanded per active company_code (entity_code). Requires
-- SET app.seed_tenant_id = '<uuid>'.

DO $seed_finance_close_governance$
DECLARE
    v_tid             uuid;
    v_sys             uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_version         text := '1.0.0';
    v_type            record;
    v_phase           record;
    v_cat             record;
    v_task            record;
    v_dep             record;
    v_cc              record;
    v_type_id         uuid;
    v_phase_id        uuid;
    v_category_id     uuid;
    v_template_id     uuid;
    v_pred_id         uuid;
    v_succ_id         uuid;
    v_existing_sort   smallint;
    v_sort            smallint;
    v_company_count   integer;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active') THEN
        RAISE EXCEPTION '[finance_close_governance] active tenant % not found', v_tid;
    END IF;

    SELECT count(*) INTO v_company_count
      FROM master.company_code
     WHERE tenant_id = v_tid
       AND status = 'active';

    FOR v_type IN
        SELECT *
        FROM (VALUES
            (
                'MONTHLY_CLOSE',
                'Monthly Finance Close',
                'Monthly finance close governance: open current month, complete prior-month controls, then move the prior month to soft close.',
                'MONTHLY',
                jsonb_build_object(
                    'policy_code', 'OPEN_CURRENT_SOFT_CLOSE_PRIOR_HARD_CLOSE_YEAR_END',
                    'period_model', jsonb_build_object(
                        'future', 'Future months are not postable.',
                        'open', 'Current month is open for normal posting.',
                        'soft_close', 'Prior months in the current fiscal year allow controlled adjustment postings only.',
                        'hard_close', 'Final locked periods do not allow posting.'
                    ),
                    'monthly_target_status', 'soft_close',
                    'year_end_target_status', 'hard_close',
                    'soft_close_posting_control', jsonb_build_object(
                        'requires_reason_code', true,
                        'requires_approval', true,
                        'allowed_journal_types', jsonb_build_array('ADJUSTMENT','ACCRUAL_REVERSAL','AUDIT_ADJUSTMENT')
                    ),
                    'hard_close_rule', jsonb_build_object(
                        'allowed_only_after_year_end_certification', true,
                        'blocks_all_postings', true
                    )
                ),
                jsonb_build_object(
                    'controller_certification_required', true,
                    'cfo_certification_required_at_year_end', true,
                    'critical_deviation_approval_role', 'FINANCE_CONTROLLER',
                    'soft_close_adjustment_approval_role', 'FINANCE_CONTROLLER'
                ),
                jsonb_build_object(
                    'type', 'object',
                    'properties', jsonb_build_object(
                        'company_code', jsonb_build_object('type', 'string'),
                        'prior_period_status_target', jsonb_build_object('type', 'string'),
                        'current_period_status_target', jsonb_build_object('type', 'string')
                    )
                ),
                NULL::jsonb
            ),
            (
                'YEAR_END_CLOSE',
                'Year-End Finance Close',
                'Annual finance close governance: complete statutory, tax, audit, and management certification before hard-closing fiscal and book periods.',
                'ANNUAL',
                jsonb_build_object(
                    'policy_code', 'YEAR_END_HARD_CLOSE',
                    'target_status', 'hard_close',
                    'requires_all_months_soft_closed', true,
                    'requires_adjustment_period_review', true,
                    'blocks_all_postings_after_close', true
                ),
                jsonb_build_object(
                    'controller_certification_required', true,
                    'cfo_attestation_required', true,
                    'audit_adjustment_approval_role', 'FINANCE_CONTROLLER',
                    'hard_close_approval_role', 'CFO'
                ),
                jsonb_build_object(
                    'type', 'object',
                    'properties', jsonb_build_object(
                        'company_code', jsonb_build_object('type', 'string'),
                        'fiscal_year', jsonb_build_object('type', 'integer'),
                        'hard_close_scope', jsonb_build_object('type', 'string')
                    )
                ),
                NULL::jsonb
            )
        ) AS t(type_code, type_name, description, frequency, clean_policy, approval_policy, run_schema, task_schema)
    LOOP
        INSERT INTO governance.cycle_type (
            tenant_id, type_code, type_name, description, frequency, domain,
            clean_cycle_policy, approval_policies, run_data_schema, task_data_schema,
            is_active, created_by
        )
        VALUES (
            v_tid, v_type.type_code, v_type.type_name, v_type.description, v_type.frequency, 'FINANCE',
            v_type.clean_policy, v_type.approval_policy, v_type.run_schema, v_type.task_schema,
            true, v_sys
        )
        ON CONFLICT (tenant_id, type_code) DO UPDATE SET
            type_name          = EXCLUDED.type_name,
            description        = EXCLUDED.description,
            frequency          = EXCLUDED.frequency,
            domain             = EXCLUDED.domain,
            clean_cycle_policy = EXCLUDED.clean_cycle_policy,
            approval_policies  = EXCLUDED.approval_policies,
            run_data_schema    = EXCLUDED.run_data_schema,
            task_data_schema   = EXCLUDED.task_data_schema,
            is_active          = true,
            updated_at         = now(),
            updated_by         = v_sys;
    END LOOP;

    FOR v_phase IN
        SELECT *
        FROM (VALUES
            ('MONTHLY_CLOSE','PERIOD_OPEN','Open Current Month',10,'Open the current month for normal posting and confirm the prior month is ready to close.',true,100.00::numeric,4),
            ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','Pre-Close Readiness',20,'Validate calendars, integrations, master data, and unposted transaction queues.',true,100.00::numeric,24),
            ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','Subledger Close',30,'Complete AP, AR, bank, inventory, fixed asset, and other subledger cut-off controls.',true,100.00::numeric,72),
            ('MONTHLY_CLOSE','RECONCILIATION','Reconciliation',40,'Complete bank, subledger-to-GL, and balance sheet reconciliations.',true,100.00::numeric,96),
            ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL Adjustments',50,'Post accruals, reversals, FX revaluation, intercompany, and reviewed manual journals.',true,100.00::numeric,120),
            ('MONTHLY_CLOSE','REVIEW_ANALYTICS','Review and Analytics',60,'Validate trial balance, flux analysis, material variances, and close analytics.',true,100.00::numeric,144),
            ('MONTHLY_CLOSE','CERTIFICATION','Certification',70,'Approve deviations and obtain controller close certification.',true,100.00::numeric,168),
            ('MONTHLY_CLOSE','PERIOD_SOFT_CLOSE','Prior Month Soft Close',80,'Move prior month fiscal and book periods to soft close with controlled adjustment rules.',true,100.00::numeric,176),
            ('MONTHLY_CLOSE','POST_CLOSE','Post-Close Evidence',90,'Archive the close pack and carry forward approved open items.',false,NULL::numeric,192),

            ('YEAR_END_CLOSE','YEAR_END_READINESS','Year-End Readiness',10,'Confirm all monthly periods are soft-closed and year-end adjustment periods are ready.',true,100.00::numeric,24),
            ('YEAR_END_CLOSE','FINAL_SUBLEDGER_LOCK','Final Subledger Lock',20,'Confirm final subledger lock, cut-off, and subledger-to-GL tie-out.',true,100.00::numeric,72),
            ('YEAR_END_CLOSE','FINAL_RECONCILIATION','Final Reconciliation',30,'Complete final balance sheet, bank, intercompany, and consolidation reconciliations.',true,100.00::numeric,120),
            ('YEAR_END_CLOSE','AUDIT_TAX_STAT','Audit Tax Statutory',40,'Post audit adjustments and complete statutory/tax reporting packs.',true,100.00::numeric,168),
            ('YEAR_END_CLOSE','FINAL_REVIEW','Final Financial Review',50,'Complete final statements, disclosures, and management analytical review.',true,100.00::numeric,216),
            ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','Year-End Certification',60,'Approve all exceptions and complete controller and CFO certification.',true,100.00::numeric,240),
            ('YEAR_END_CLOSE','PERIOD_HARD_CLOSE','Fiscal Year Hard Close',70,'Move fiscal and book periods to hard close and verify posting lock.',true,100.00::numeric,264),
            ('YEAR_END_CLOSE','YEAR_END_ARCHIVE','Archive Year-End Pack',80,'Archive final year-end evidence and audit support pack.',false,NULL::numeric,288)
        ) AS p(type_code, phase_code, phase_name, sort_order, description, gate_enforced, readiness_pct, target_hours)
    LOOP
        SELECT id INTO v_type_id
          FROM governance.cycle_type
         WHERE tenant_id = v_tid
           AND type_code = v_phase.type_code;

        SELECT id, sort_order INTO v_phase_id, v_existing_sort
          FROM governance.cycle_phase
         WHERE tenant_id = v_tid
           AND cycle_type_id = v_type_id
           AND phase_code = v_phase.phase_code;

        IF v_phase_id IS NULL THEN
            v_sort := v_phase.sort_order;
            WHILE EXISTS (
                SELECT 1
                  FROM governance.cycle_phase
                 WHERE tenant_id = v_tid
                   AND cycle_type_id = v_type_id
                   AND sort_order = v_sort
            ) LOOP
                v_sort := v_sort + 1;
            END LOOP;

            INSERT INTO governance.cycle_phase (
                tenant_id, cycle_type_id, phase_code, phase_name, sort_order,
                description, is_gate_enforced, min_readiness_pct,
                target_hours_from_start, is_active, created_by
            )
            VALUES (
                v_tid, v_type_id, v_phase.phase_code, v_phase.phase_name, v_sort,
                v_phase.description, v_phase.gate_enforced, v_phase.readiness_pct,
                v_phase.target_hours, true, v_sys
            );
        ELSE
            v_sort := v_phase.sort_order;
            IF EXISTS (
                SELECT 1
                  FROM governance.cycle_phase
                 WHERE tenant_id = v_tid
                   AND cycle_type_id = v_type_id
                   AND sort_order = v_sort
                   AND id <> v_phase_id
            ) THEN
                v_sort := v_existing_sort;
            END IF;

            UPDATE governance.cycle_phase
               SET phase_name              = v_phase.phase_name,
                   sort_order              = v_sort,
                   description             = v_phase.description,
                   is_gate_enforced        = v_phase.gate_enforced,
                   min_readiness_pct       = v_phase.readiness_pct,
                   target_hours_from_start = v_phase.target_hours,
                   is_active               = true,
                   updated_at              = now(),
                   updated_by              = v_sys
             WHERE id = v_phase_id;
        END IF;
    END LOOP;

    FOR v_type IN
        SELECT id, type_code
          FROM governance.cycle_type
         WHERE tenant_id = v_tid
           AND type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
    LOOP
        FOR v_cat IN
            SELECT *
            FROM (VALUES
                ('CLOSE_CONTROL','Close Control',10,'#0f766e'),
                ('SYSTEMS_DATA','Systems and Data',20,'#2563eb'),
                ('AP','Accounts Payable',30,'#7c3aed'),
                ('AR','Accounts Receivable',40,'#0891b2'),
                ('BANK_CASH','Bank and Cash',50,'#16a34a'),
                ('INVENTORY','Inventory',60,'#ca8a04'),
                ('FIXED_ASSETS','Fixed Assets',70,'#9333ea'),
                ('GL_ACCRUALS','GL and Accruals',80,'#dc2626'),
                ('INTERCOMPANY','Intercompany',90,'#4f46e5'),
                ('TAX','Tax',100,'#ea580c'),
                ('REPORTING','Reporting',110,'#0d9488'),
                ('COMPLIANCE_AUDIT','Compliance and Audit',120,'#64748b')
            ) AS c(category_code, category_name, sort_order, color_code)
        LOOP
            INSERT INTO governance.cycle_task_category (
                tenant_id, cycle_type_id, category_code, category_name,
                sort_order, color_code, is_active, created_by
            )
            VALUES (
                v_tid, v_type.id, v_cat.category_code, v_cat.category_name,
                v_cat.sort_order, v_cat.color_code, true, v_sys
            )
            ON CONFLICT (tenant_id, cycle_type_id, category_code) DO UPDATE SET
                category_name = EXCLUDED.category_name,
                sort_order    = EXCLUDED.sort_order,
                color_code    = EXCLUDED.color_code,
                is_active     = true,
                updated_at    = now(),
                updated_by    = v_sys;
        END LOOP;
    END LOOP;

    -- Task templates are expanded per active company_code (entity_code FK).
    IF v_company_count = 0 THEN
        RAISE WARNING '[finance_close_governance] No active company codes for tenant %. Seeded cycle types only.', v_tid;
    END IF;

    FOR v_cc IN
        SELECT code
          FROM master.company_code
         WHERE tenant_id = v_tid
           AND status = 'active'
         ORDER BY code
    LOOP
        IF length(v_cc.code) > 20 THEN
            RAISE WARNING '[finance_close_governance] Skipping company code %, exceeds governance.entity_code length 20', v_cc.code;
            CONTINUE;
        END IF;

        FOR v_task IN
            SELECT *
            FROM (VALUES
                ('MONTHLY_CLOSE','PERIOD_OPEN','CLOSE_CONTROL','OPEN_CURRENT_PERIOD','Open current fiscal month','Set current month fiscal/book periods to open for normal posting.','SYSTEM','finance.period.open_current_month',true,false,'CRITICAL',10,4,20,1,'FINANCE_CONTROLLER',true,'period_gate'),
                ('MONTHLY_CLOSE','PERIOD_OPEN','CLOSE_CONTROL','VERIFY_PRIOR_PERIOD_READY','Verify prior period ready for close','Confirm the prior month is selected and ready to enter monthly close.','SYSTEM','finance.period.prior_period_ready',true,false,'HIGH',20,4,15,1,'FINANCE_CONTROLLER',true,'period_gate'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','CLOSE_CONTROL','CALENDAR_LOCK_REVIEW','Review close calendar and owners','Confirm close calendar, owners, and target soft-close date.','MANUAL',NULL::text,true,false,'MEDIUM',30,12,20,2,'FINANCE_MANAGER',false,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','SYSTEMS_DATA','MASTER_DATA_FREEZE','Confirm master data freeze','Confirm company, COA, tax, supplier, customer, and bank master changes are controlled for close.','HYBRID','finance.master_data.freeze_check',true,true,'HIGH',40,24,30,4,'FINANCE_MANAGER',false,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','SYSTEMS_DATA','INTEGRATION_QUEUE_CLEAR','Clear finance integration queues','Verify posting interfaces, bank feeds, and subledger queues are complete or documented.','SYSTEM','finance.integrations.queue_clear',true,false,'HIGH',50,24,20,4,'FINANCE_SYSTEMS',true,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','GL_ACCRUALS','UNPOSTED_BATCH_REVIEW','Review unposted batches','Resolve or document unposted journals, invoices, receipts, payments, and imports.','HYBRID','finance.posting.unposted_batch_review',true,true,'HIGH',60,24,30,4,'FINANCE_MANAGER',false,'readiness'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','AP','AP_CUTOFF_REVIEW','Complete AP cut-off review','Review supplier invoices, accruals, holds, and unmatched AP items for period cut-off.','HYBRID','finance.ap.cutoff_review',true,true,'HIGH',70,48,60,8,'AP_LEAD',false,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','AR','AR_REVENUE_CUTOFF','Complete AR and revenue cut-off','Review billing, revenue recognition, credit notes, receipts, and deferred revenue cut-off.','HYBRID','finance.ar.revenue_cutoff',true,true,'HIGH',80,48,60,8,'AR_LEAD',false,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','BANK_CASH','BANK_FEEDS_IMPORTED','Confirm bank feeds imported','Confirm all bank statements and feeds through period end are imported.','SYSTEM','finance.bank.statement_import_complete',true,false,'HIGH',90,48,20,8,'TREASURY_LEAD',true,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','INVENTORY','INVENTORY_VALUATION_REVIEW','Review inventory valuation','Complete inventory valuation, COGS, reserves, and stock movement review where applicable.','HYBRID','finance.inventory.valuation_review',true,true,'HIGH',100,72,90,12,'INVENTORY_ACCOUNTING',false,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','FIXED_ASSETS','FIXED_ASSET_DEPRECIATION','Run depreciation and asset close','Run depreciation, review additions/disposals, and reconcile fixed asset subledger.','HYBRID','finance.fixed_assets.depreciation_complete',true,true,'MEDIUM',110,72,60,12,'FIXED_ASSET_ACCOUNTING',false,'subledger'),
                ('MONTHLY_CLOSE','RECONCILIATION','BANK_CASH','BANK_RECON_COMPLETE','Complete bank reconciliations','Complete bank account reconciliations for all active cash accounts.','HYBRID','finance.bank.reconciliation_complete',true,true,'HIGH',120,96,90,12,'TREASURY_LEAD',false,'reconciliation'),
                ('MONTHLY_CLOSE','RECONCILIATION','REPORTING','SUBLEDGER_GL_TIEOUT','Tie subledgers to GL','Tie AP, AR, inventory, fixed assets, and bank subledgers to GL control accounts.','SYSTEM','finance.subledger.gl_tieout',true,false,'CRITICAL',130,96,30,12,'FINANCE_CONTROLLER',true,'reconciliation'),
                ('MONTHLY_CLOSE','RECONCILIATION','REPORTING','BALANCE_SHEET_RECON_COMPLETE','Complete balance sheet reconciliations','Complete and review required balance sheet reconciliations.','HYBRID','finance.reconciliation.balance_sheet_complete',true,true,'CRITICAL',140,108,120,12,'FINANCE_MANAGER',false,'reconciliation'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','RECURRING_ACCRUALS_POSTED','Post recurring accruals and reversals','Post recurring accruals, prepayments, provisions, and planned reversals.','HYBRID','finance.gl.recurring_accruals_posted',true,true,'HIGH',150,120,60,12,'GL_ACCOUNTANT',false,'gl_adjustments'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','FX_REVALUATION_RUN','Run FX revaluation','Run and review period-end foreign currency revaluation.','SYSTEM','finance.gl.fx_revaluation_complete',true,true,'HIGH',160,120,30,12,'GL_ACCOUNTANT',true,'gl_adjustments'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','INTERCOMPANY','INTERCOMPANY_MATCHING','Complete intercompany matching','Match and resolve intercompany balances and eliminations where applicable.','HYBRID','finance.intercompany.matching_complete',true,true,'HIGH',170,132,60,12,'GROUP_ACCOUNTING',false,'gl_adjustments'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','MANUAL_JOURNAL_REVIEW','Review manual journals','Review unusual, high-value, late, and manual journal entries.','HYBRID','finance.gl.manual_journal_review',true,false,'HIGH',180,132,60,12,'FINANCE_CONTROLLER',false,'gl_adjustments'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','TRIAL_BALANCE_VALIDATED','Validate trial balance','Run trial balance validation and ensure debits equal credits with no blocked accounts.','SYSTEM','finance.reporting.trial_balance_validated',true,false,'CRITICAL',190,144,20,12,'FINANCE_CONTROLLER',true,'review'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','PL_FLUX_ANALYSIS','Complete P&L flux analysis','Review month-over-month and budget-to-actual P&L variance explanations.','MANUAL',NULL::text,true,true,'HIGH',200,156,90,12,'FPNA_LEAD',false,'review'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','BS_FLUX_ANALYSIS','Complete balance sheet flux analysis','Review balance sheet movement and material account explanations.','MANUAL',NULL::text,true,true,'HIGH',210,156,90,12,'FINANCE_MANAGER',false,'review'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','MATERIAL_VARIANCE_REVIEW','Review material variances','Controller review of material variances and unusual balances.','MANUAL',NULL::text,true,false,'HIGH',220,168,60,8,'FINANCE_CONTROLLER',false,'review'),
                ('MONTHLY_CLOSE','CERTIFICATION','COMPLIANCE_AUDIT','CRITICAL_DEVIATIONS_APPROVED','Approve critical deviations','Resolve, approve, or explicitly carry forward critical exceptions, overrides, and waivers.','HYBRID','finance.close.critical_deviations_approved',true,false,'CRITICAL',230,168,30,4,'FINANCE_CONTROLLER',false,'certification'),
                ('MONTHLY_CLOSE','CERTIFICATION','COMPLIANCE_AUDIT','CONTROLLER_CERTIFICATION','Controller certification','Controller certifies the monthly close pack and approved exceptions.','MANUAL',NULL::text,true,false,'CRITICAL',240,172,30,2,'FINANCE_CONTROLLER',false,'certification'),
                ('MONTHLY_CLOSE','PERIOD_SOFT_CLOSE','CLOSE_CONTROL','MOVE_PRIOR_PERIOD_SOFT_CLOSE','Move prior period to soft close','Move prior month fiscal and book periods to soft close.','HYBRID','finance.period.move_prior_to_soft_close',true,false,'CRITICAL',250,176,20,1,'FINANCE_CONTROLLER',false,'period_gate'),
                ('MONTHLY_CLOSE','PERIOD_SOFT_CLOSE','CLOSE_CONTROL','VERIFY_SOFT_CLOSE_POSTING_CONTROL','Verify soft-close posting control','Verify prior-period postings now require reason code and approval.','SYSTEM','finance.period.soft_close_controls_active',true,false,'CRITICAL',260,176,15,1,'FINANCE_SYSTEMS',true,'period_gate'),
                ('MONTHLY_CLOSE','POST_CLOSE','COMPLIANCE_AUDIT','CARRYFORWARD_REGISTER_UPDATED','Update carryforward register','Document approved exceptions that carry to the next close.','MANUAL',NULL::text,true,true,'MEDIUM',270,188,30,4,'FINANCE_MANAGER',false,'post_close'),
                ('MONTHLY_CLOSE','POST_CLOSE','COMPLIANCE_AUDIT','CLOSE_PACK_ARCHIVED','Archive monthly close pack','Archive close evidence, reconciliations, reports, and certification snapshot.','HYBRID','finance.close.archive_pack',true,false,'MEDIUM',280,192,20,4,'FINANCE_SYSTEMS',false,'post_close'),

                ('YEAR_END_CLOSE','YEAR_END_READINESS','CLOSE_CONTROL','YE_ADJUSTMENT_PERIODS_READY','Confirm adjustment periods ready','Confirm all monthly periods are soft closed and year-end adjustment periods are available as needed.','HYBRID','finance.year_end.adjustment_periods_ready',true,false,'CRITICAL',10,24,30,4,'FINANCE_CONTROLLER',true,'year_end_readiness'),
                ('YEAR_END_CLOSE','FINAL_SUBLEDGER_LOCK','CLOSE_CONTROL','YE_FINAL_SUBLEDGER_LOCK','Final subledger lock','Lock final AP, AR, bank, inventory, fixed asset, and payroll subledger activity for the fiscal year.','HYBRID','finance.year_end.subledger_lock_complete',true,false,'CRITICAL',20,72,90,12,'FINANCE_CONTROLLER',false,'year_end_subledger'),
                ('YEAR_END_CLOSE','FINAL_RECONCILIATION','REPORTING','YE_ALL_RECONS_COMPLETE','Complete final reconciliations','Complete final balance sheet, bank, subledger, intercompany, and consolidation reconciliations.','HYBRID','finance.year_end.reconciliations_complete',true,false,'CRITICAL',30,120,120,12,'FINANCE_MANAGER',false,'year_end_recon'),
                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','COMPLIANCE_AUDIT','YE_AUDIT_ADJUSTMENTS_POSTED','Post audit adjustments','Post approved audit, management, reclassification, and consolidation adjustments.','HYBRID','finance.year_end.audit_adjustments_posted',true,false,'CRITICAL',40,168,90,12,'FINANCE_CONTROLLER',false,'year_end_adjustments'),
                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','TAX','YE_TAX_STAT_PACK_READY','Complete tax and statutory packs','Complete tax provision, statutory schedules, and jurisdiction reporting support.','MANUAL',NULL::text,true,true,'HIGH',50,180,120,12,'TAX_LEAD',false,'year_end_tax_stat'),
                ('YEAR_END_CLOSE','FINAL_REVIEW','REPORTING','YE_DISCLOSURE_REVIEW','Complete disclosure review','Review financial statements, notes, disclosure checklist, and management representation points.','MANUAL',NULL::text,true,false,'HIGH',60,216,120,12,'FINANCE_CONTROLLER',false,'year_end_review'),
                ('YEAR_END_CLOSE','FINAL_REVIEW','REPORTING','YE_FINAL_TRIAL_BALANCE','Validate final trial balance','Validate final year-end trial balance after all approved adjustments.','SYSTEM','finance.year_end.final_trial_balance_validated',true,false,'CRITICAL',70,216,20,4,'FINANCE_CONTROLLER',true,'year_end_review'),
                ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','COMPLIANCE_AUDIT','YE_DEVIATIONS_APPROVED','Approve year-end deviations','Resolve or approve all year-end exceptions, overrides, waivers, and management judgments.','HYBRID','finance.year_end.deviations_approved',true,false,'CRITICAL',80,228,45,4,'FINANCE_CONTROLLER',false,'year_end_cert'),
                ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','COMPLIANCE_AUDIT','YE_CONTROLLER_CERTIFICATION','Controller year-end certification','Controller certifies final financial close and exception treatment.','MANUAL',NULL::text,true,false,'CRITICAL',90,240,30,2,'FINANCE_CONTROLLER',false,'year_end_cert'),
                ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','COMPLIANCE_AUDIT','YE_CFO_ATTESTATION','CFO attestation','CFO or delegated finance executive attests final year-end close pack.','MANUAL',NULL::text,true,false,'CRITICAL',100,240,30,2,'CFO',false,'year_end_cert'),
                ('YEAR_END_CLOSE','PERIOD_HARD_CLOSE','CLOSE_CONTROL','YE_MOVE_PERIODS_HARD_CLOSE','Move fiscal year to hard close','Move fiscal and book periods for the year to hard close after certification.','HYBRID','finance.year_end.move_periods_hard_close',true,false,'CRITICAL',110,264,20,1,'FINANCE_CONTROLLER',false,'year_end_lock'),
                ('YEAR_END_CLOSE','PERIOD_HARD_CLOSE','CLOSE_CONTROL','YE_VERIFY_HARD_CLOSE_LOCK','Verify hard-close posting lock','Verify all hard-closed fiscal/book periods block posting.','SYSTEM','finance.year_end.hard_close_lock_verified',true,false,'CRITICAL',120,264,15,1,'FINANCE_SYSTEMS',true,'year_end_lock'),
                ('YEAR_END_CLOSE','YEAR_END_ARCHIVE','COMPLIANCE_AUDIT','YE_AUDIT_PACK_ARCHIVE','Archive year-end audit pack','Archive final financial statements, audit schedules, certifications, and evidence pack.','HYBRID','finance.year_end.archive_audit_pack',true,false,'HIGH',130,288,45,4,'FINANCE_SYSTEMS',false,'year_end_archive')
            ) AS t(type_code, phase_code, category_code, task_code, task_name, description, completion_mode, system_handler, mandatory, waivable, severity, sort_order, sla_hours, duration_min, reminder_hours, owner_role, auto_start, orchestration_group)
        LOOP
            SELECT id INTO v_type_id
              FROM governance.cycle_type
             WHERE tenant_id = v_tid
               AND type_code = v_task.type_code;

            SELECT id INTO v_phase_id
              FROM governance.cycle_phase
             WHERE tenant_id = v_tid
               AND cycle_type_id = v_type_id
               AND phase_code = v_task.phase_code;

            SELECT id INTO v_category_id
              FROM governance.cycle_task_category
             WHERE tenant_id = v_tid
               AND cycle_type_id = v_type_id
               AND category_code = v_task.category_code;

            IF v_type_id IS NULL OR v_phase_id IS NULL OR v_category_id IS NULL THEN
                RAISE WARNING '[finance_close_governance] skipping task %, missing type/phase/category', v_task.task_code;
                CONTINUE;
            END IF;

            INSERT INTO governance.cycle_task_template (
                tenant_id, entity_code, cycle_type_id, phase_id, category_id,
                task_code, task_name, description, completion_mode,
                system_check_handler, is_mandatory, is_waivable, severity,
                sort_order, sla_hours, estimated_duration_min, reminder_lead_hours,
                default_owner_role, is_auto_start_when_ready, orchestration_group,
                is_active, created_by
            )
            VALUES (
                v_tid, v_cc.code, v_type_id, v_phase_id, v_category_id,
                v_task.task_code, v_task.task_name, v_task.description, v_task.completion_mode,
                v_task.system_handler, v_task.mandatory, v_task.waivable, v_task.severity,
                v_task.sort_order, v_task.sla_hours, v_task.duration_min, v_task.reminder_hours,
                v_task.owner_role, v_task.auto_start, v_task.orchestration_group,
                true, v_sys
            )
            ON CONFLICT (tenant_id, entity_code, cycle_type_id, task_code) DO UPDATE SET
                phase_id                   = EXCLUDED.phase_id,
                category_id                = EXCLUDED.category_id,
                task_name                  = EXCLUDED.task_name,
                description                = EXCLUDED.description,
                completion_mode            = EXCLUDED.completion_mode,
                system_check_handler       = EXCLUDED.system_check_handler,
                is_mandatory               = EXCLUDED.is_mandatory,
                is_waivable                = EXCLUDED.is_waivable,
                severity                   = EXCLUDED.severity,
                sort_order                 = EXCLUDED.sort_order,
                sla_hours                  = EXCLUDED.sla_hours,
                estimated_duration_min     = EXCLUDED.estimated_duration_min,
                reminder_lead_hours        = EXCLUDED.reminder_lead_hours,
                default_owner_role         = EXCLUDED.default_owner_role,
                is_auto_start_when_ready   = EXCLUDED.is_auto_start_when_ready,
                orchestration_group        = EXCLUDED.orchestration_group,
                is_active                  = true,
                updated_at                 = now(),
                updated_by                 = v_sys;
        END LOOP;

        FOR v_dep IN
            SELECT *
            FROM (VALUES
                ('MONTHLY_CLOSE','OPEN_CURRENT_PERIOD','VERIFY_PRIOR_PERIOD_READY'),
                ('MONTHLY_CLOSE','VERIFY_PRIOR_PERIOD_READY','CALENDAR_LOCK_REVIEW'),
                ('MONTHLY_CLOSE','VERIFY_PRIOR_PERIOD_READY','MASTER_DATA_FREEZE'),
                ('MONTHLY_CLOSE','VERIFY_PRIOR_PERIOD_READY','INTEGRATION_QUEUE_CLEAR'),
                ('MONTHLY_CLOSE','INTEGRATION_QUEUE_CLEAR','AP_CUTOFF_REVIEW'),
                ('MONTHLY_CLOSE','INTEGRATION_QUEUE_CLEAR','AR_REVENUE_CUTOFF'),
                ('MONTHLY_CLOSE','INTEGRATION_QUEUE_CLEAR','BANK_FEEDS_IMPORTED'),
                ('MONTHLY_CLOSE','INTEGRATION_QUEUE_CLEAR','INVENTORY_VALUATION_REVIEW'),
                ('MONTHLY_CLOSE','INTEGRATION_QUEUE_CLEAR','FIXED_ASSET_DEPRECIATION'),
                ('MONTHLY_CLOSE','AP_CUTOFF_REVIEW','SUBLEDGER_GL_TIEOUT'),
                ('MONTHLY_CLOSE','AR_REVENUE_CUTOFF','SUBLEDGER_GL_TIEOUT'),
                ('MONTHLY_CLOSE','BANK_FEEDS_IMPORTED','BANK_RECON_COMPLETE'),
                ('MONTHLY_CLOSE','BANK_RECON_COMPLETE','SUBLEDGER_GL_TIEOUT'),
                ('MONTHLY_CLOSE','INVENTORY_VALUATION_REVIEW','SUBLEDGER_GL_TIEOUT'),
                ('MONTHLY_CLOSE','FIXED_ASSET_DEPRECIATION','SUBLEDGER_GL_TIEOUT'),
                ('MONTHLY_CLOSE','SUBLEDGER_GL_TIEOUT','BALANCE_SHEET_RECON_COMPLETE'),
                ('MONTHLY_CLOSE','BALANCE_SHEET_RECON_COMPLETE','RECURRING_ACCRUALS_POSTED'),
                ('MONTHLY_CLOSE','RECURRING_ACCRUALS_POSTED','FX_REVALUATION_RUN'),
                ('MONTHLY_CLOSE','FX_REVALUATION_RUN','INTERCOMPANY_MATCHING'),
                ('MONTHLY_CLOSE','INTERCOMPANY_MATCHING','MANUAL_JOURNAL_REVIEW'),
                ('MONTHLY_CLOSE','MANUAL_JOURNAL_REVIEW','TRIAL_BALANCE_VALIDATED'),
                ('MONTHLY_CLOSE','TRIAL_BALANCE_VALIDATED','PL_FLUX_ANALYSIS'),
                ('MONTHLY_CLOSE','TRIAL_BALANCE_VALIDATED','BS_FLUX_ANALYSIS'),
                ('MONTHLY_CLOSE','PL_FLUX_ANALYSIS','MATERIAL_VARIANCE_REVIEW'),
                ('MONTHLY_CLOSE','BS_FLUX_ANALYSIS','MATERIAL_VARIANCE_REVIEW'),
                ('MONTHLY_CLOSE','MATERIAL_VARIANCE_REVIEW','CRITICAL_DEVIATIONS_APPROVED'),
                ('MONTHLY_CLOSE','CRITICAL_DEVIATIONS_APPROVED','CONTROLLER_CERTIFICATION'),
                ('MONTHLY_CLOSE','CONTROLLER_CERTIFICATION','MOVE_PRIOR_PERIOD_SOFT_CLOSE'),
                ('MONTHLY_CLOSE','MOVE_PRIOR_PERIOD_SOFT_CLOSE','VERIFY_SOFT_CLOSE_POSTING_CONTROL'),
                ('MONTHLY_CLOSE','VERIFY_SOFT_CLOSE_POSTING_CONTROL','CARRYFORWARD_REGISTER_UPDATED'),
                ('MONTHLY_CLOSE','CARRYFORWARD_REGISTER_UPDATED','CLOSE_PACK_ARCHIVED'),

                ('YEAR_END_CLOSE','YE_ADJUSTMENT_PERIODS_READY','YE_FINAL_SUBLEDGER_LOCK'),
                ('YEAR_END_CLOSE','YE_FINAL_SUBLEDGER_LOCK','YE_ALL_RECONS_COMPLETE'),
                ('YEAR_END_CLOSE','YE_ALL_RECONS_COMPLETE','YE_AUDIT_ADJUSTMENTS_POSTED'),
                ('YEAR_END_CLOSE','YE_AUDIT_ADJUSTMENTS_POSTED','YE_TAX_STAT_PACK_READY'),
                ('YEAR_END_CLOSE','YE_TAX_STAT_PACK_READY','YE_DISCLOSURE_REVIEW'),
                ('YEAR_END_CLOSE','YE_DISCLOSURE_REVIEW','YE_FINAL_TRIAL_BALANCE'),
                ('YEAR_END_CLOSE','YE_FINAL_TRIAL_BALANCE','YE_DEVIATIONS_APPROVED'),
                ('YEAR_END_CLOSE','YE_DEVIATIONS_APPROVED','YE_CONTROLLER_CERTIFICATION'),
                ('YEAR_END_CLOSE','YE_CONTROLLER_CERTIFICATION','YE_CFO_ATTESTATION'),
                ('YEAR_END_CLOSE','YE_CFO_ATTESTATION','YE_MOVE_PERIODS_HARD_CLOSE'),
                ('YEAR_END_CLOSE','YE_MOVE_PERIODS_HARD_CLOSE','YE_VERIFY_HARD_CLOSE_LOCK'),
                ('YEAR_END_CLOSE','YE_VERIFY_HARD_CLOSE_LOCK','YE_AUDIT_PACK_ARCHIVE')
            ) AS d(type_code, predecessor_code, successor_code)
        LOOP
            SELECT id INTO v_type_id
              FROM governance.cycle_type
             WHERE tenant_id = v_tid
               AND type_code = v_dep.type_code;

            SELECT id INTO v_pred_id
              FROM governance.cycle_task_template
             WHERE tenant_id = v_tid
               AND entity_code = v_cc.code
               AND cycle_type_id = v_type_id
               AND task_code = v_dep.predecessor_code;

            SELECT id INTO v_succ_id
              FROM governance.cycle_task_template
             WHERE tenant_id = v_tid
               AND entity_code = v_cc.code
               AND cycle_type_id = v_type_id
               AND task_code = v_dep.successor_code;

            IF v_pred_id IS NULL OR v_succ_id IS NULL THEN
                CONTINUE;
            END IF;

            INSERT INTO governance.cycle_task_dependency (
                tenant_id, cycle_type_id, entity_code,
                predecessor_template_id, successor_template_id,
                dependency_type, is_hard, is_active, created_by
            )
            VALUES (
                v_tid, v_type_id, v_cc.code,
                v_pred_id, v_succ_id,
                'FINISH_TO_START', true, true, v_sys
            )
            ON CONFLICT (tenant_id, cycle_type_id, entity_code, predecessor_template_id, successor_template_id)
            DO UPDATE SET
                dependency_type = EXCLUDED.dependency_type,
                is_hard         = EXCLUDED.is_hard,
                is_active       = true,
                updated_at      = now(),
                updated_by      = v_sys;
        END LOOP;
    END LOOP;

    FOR v_type IN
        SELECT id, type_code
          FROM governance.cycle_type
         WHERE tenant_id = v_tid
           AND type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
    LOOP
        IF v_type.type_code = 'MONTHLY_CLOSE' THEN
            INSERT INTO governance.cycle_carryforward_rule (
                tenant_id, cycle_type_id, deviation_type, action,
                max_carry_count, escalate_after_carries, description,
                is_active, created_by
            )
            VALUES
                (v_tid, v_type.id, 'EXCEPTION', 'AUTO_CARRY', 1, 1, 'Monthly exceptions may carry once with controller approval, then escalate.', true, v_sys),
                (v_tid, v_type.id, 'WAIVER',    'EXPIRE',     NULL, NULL, 'Waivers expire at close and must be re-approved in the next period.', true, v_sys),
                (v_tid, v_type.id, 'OVERRIDE',  'FORCE_CLOSE',NULL, NULL, 'Overrides must be explicitly approved before the monthly soft close.', true, v_sys)
            ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO UPDATE SET
                action                 = EXCLUDED.action,
                max_carry_count        = EXCLUDED.max_carry_count,
                escalate_after_carries = EXCLUDED.escalate_after_carries,
                description            = EXCLUDED.description,
                is_active              = true,
                updated_at             = now(),
                updated_by             = v_sys;
        ELSE
            INSERT INTO governance.cycle_carryforward_rule (
                tenant_id, cycle_type_id, deviation_type, action,
                max_carry_count, escalate_after_carries, description,
                is_active, created_by
            )
            VALUES
                (v_tid, v_type.id, 'EXCEPTION', 'FORCE_CLOSE', NULL, NULL, 'Year-end exceptions require resolution or approved final treatment before hard close.', true, v_sys),
                (v_tid, v_type.id, 'WAIVER',    'EXPIRE',      NULL, NULL, 'Year-end waivers expire after final certification.', true, v_sys),
                (v_tid, v_type.id, 'OVERRIDE',  'FORCE_CLOSE', NULL, NULL, 'Year-end overrides require controller and CFO approval before hard close.', true, v_sys)
            ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO UPDATE SET
                action                 = EXCLUDED.action,
                max_carry_count        = EXCLUDED.max_carry_count,
                escalate_after_carries = EXCLUDED.escalate_after_carries,
                description            = EXCLUDED.description,
                is_active              = true,
                updated_at             = now(),
                updated_by             = v_sys;
        END IF;
    END LOOP;

    RAISE NOTICE '[finance_close_governance] Seeded Monthly Close and Year-End Close governance templates for tenant %, companies=%', v_tid, v_company_count;
END $seed_finance_close_governance$;
