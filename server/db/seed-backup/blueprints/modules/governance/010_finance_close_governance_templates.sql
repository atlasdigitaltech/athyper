-- Finance close governance templates (cycle_type + phases + categories + task
-- templates + dependencies + carryforward rules) for two cycles:
--   MONTHLY_CLOSE   â€” open current month, soft-close prior month
--   YEAR_END_CLOSE  â€” final certification and hard-close lock
-- Task templates are expanded per active company_code (entity_code). Requires
-- SET app.seed_tenant_id = '<uuid>'.

DO $seed_finance_close_governance$
DECLARE
    v_tid             uuid;
    v_sys             uuid;
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
    v_sys := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    IF v_sys IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal
        WHERE tenant_id = v_tid AND id = v_sys AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[finance_close_governance] active tenant-local app.current_principal_id required';
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
                'monthly',
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
                'annual',
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
            ,(
                'OPENING_BALANCE',
                'Opening Balance Migration',
                'Governed source import, period-0 journal posting, reconciliation, certification, and hard close for opening balances.',
                'adhoc',
                jsonb_build_object(
                    'policy_code', 'OPENING_BALANCE_PERIOD_0',
                    'required_period_number', 0,
                    'source_correction_policy', 'correct_source_file_and_reupload',
                    'raw_row_staging_editable', false,
                    'journal_source_doc_type', 'opening_balance',
                    'posting_requires_fiscal_and_book_period_open', true,
                    'final_status', 'hard_close'
                ),
                jsonb_build_object(
                    'controller_certification_required', true,
                    'final_attestation_required', true,
                    'permitted_deviation_approval_role', 'FINANCE_CONTROLLER'
                ),
                jsonb_build_object(
                    'type', 'object',
                    'required', jsonb_build_array('company_code', 'migration_strategy', 'source_system', 'source_cutoff_date'),
                    'properties', jsonb_build_object(
                        'company_code', jsonb_build_object('type', 'string'),
                        'migration_strategy', jsonb_build_object('type', 'string'),
                        'source_system', jsonb_build_object('type', 'string'),
                        'source_cutoff_date', jsonb_build_object('type', 'string'),
                        'book_ids', jsonb_build_object('type', 'array'),
                        'import_request_ids', jsonb_build_object('type', 'array')
                    )
                ),
                NULL::jsonb
            ),
            (
                'FIN_SETUP_READINESS',
                'Finance Setup Posting Readiness',
                'Company-level governance of finance setup and posting readiness, ending in certified authority to post.',
                'adhoc',
                jsonb_build_object(
                    'policy_code', 'FINANCE_POSTING_READINESS',
                    'requires_opening_balance_certification', true,
                    'requires_successful_test_journal_reversal', true,
                    'final_certification_code', 'FINANCE_POSTING_READY'
                ),
                jsonb_build_object(
                    'controller_certification_required', true,
                    'critical_deviations_must_be_resolved', true
                ),
                jsonb_build_object(
                    'type', 'object',
                    'required', jsonb_build_array('company_code'),
                    'properties', jsonb_build_object(
                        'company_code', jsonb_build_object('type', 'string'),
                        'book_ids', jsonb_build_object('type', 'array'),
                        'opening_balance_cycle_run_id', jsonb_build_object('type', 'string')
                    )
                ),
                NULL::jsonb
            )
        ) AS t(code, name, description, frequency, clean_policy, approval_policy, run_schema, task_schema)
    LOOP
        INSERT INTO control.cycle_type (
            tenant_id, code, name, description, frequency, domain_code,
            clean_cycle_policy, approval_policy, run_data_schema, task_data_schema,
            status, created_by
        )
        VALUES (
            v_tid, v_type.code, v_type.name, v_type.description, v_type.frequency, 'finance_close',
            v_type.clean_policy, v_type.approval_policy, COALESCE(v_type.run_schema,'{}'::jsonb), COALESCE(v_type.task_schema,'{}'::jsonb),
            'active', v_sys
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name          = EXCLUDED.name,
            description        = EXCLUDED.description,
            frequency          = EXCLUDED.frequency,
            domain_code        = EXCLUDED.domain_code,
            clean_cycle_policy = EXCLUDED.clean_cycle_policy,
            approval_policy  = EXCLUDED.approval_policy,
            run_data_schema    = EXCLUDED.run_data_schema,
            task_data_schema   = EXCLUDED.task_data_schema,
            status          = 'active',
            updated_at         = now(),
            updated_by         = v_sys
        WHERE (control.cycle_type.name,control.cycle_type.description,control.cycle_type.frequency,
               control.cycle_type.domain_code,control.cycle_type.clean_cycle_policy,
               control.cycle_type.approval_policy,control.cycle_type.run_data_schema,
               control.cycle_type.task_data_schema,control.cycle_type.status)
          IS DISTINCT FROM
              (EXCLUDED.name,EXCLUDED.description,EXCLUDED.frequency,EXCLUDED.domain_code,
               EXCLUDED.clean_cycle_policy,EXCLUDED.approval_policy,EXCLUDED.run_data_schema,
               EXCLUDED.task_data_schema,EXCLUDED.status);
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
            ('YEAR_END_CLOSE','YEAR_END_ARCHIVE','Archive Year-End Pack',80,'Archive final year-end evidence and audit support pack.',false,NULL::numeric,288),

            ('OPENING_BALANCE','PREPARATION','Preparation',10,'Confirm company, fiscal year, period 0, books, migration strategy, and source cut-off.',true,100.00::numeric,24),
            ('OPENING_BALANCE','VALIDATION','Source Validation',20,'Upload and map source files; validate source data and correct failures by re-uploading the source file.',true,100.00::numeric,72),
            ('OPENING_BALANCE','REVIEW_APPROVAL','Review and Approval',30,'Review validation outcomes and approve draft period-0 journals.',true,100.00::numeric,96),
            ('OPENING_BALANCE','POSTING','Period-0 Posting',40,'Open fiscal and book period 0, then post approved journals idempotently.',true,100.00::numeric,120),
            ('OPENING_BALANCE','RECONCILIATION','Reconciliation',50,'Reconcile imported and posted totals, trial balance, subledgers, and suspense balances.',true,100.00::numeric,144),
            ('OPENING_BALANCE','CERTIFICATION','Certification and Attestation',60,'Generate evidence and complete component and final certifications.',true,100.00::numeric,168),
            ('OPENING_BALANCE','HARD_CLOSE','Period-0 Hard Close',70,'Hard-close fiscal and book period 0 after final certification.',true,100.00::numeric,172)
,
            ('FIN_SETUP_READINESS','ORGANIZATION','Organization',10,'Validate active company/legal entity and functional currency.',true,100.00::numeric,12),
            ('FIN_SETUP_READINESS','LEDGER','Ledger',20,'Validate primary book assignment and generated fiscal calendar/periods.',true,100.00::numeric,24),
            ('FIN_SETUP_READINESS','ACCOUNTING','Accounting',30,'Validate chart, active accounts, posting controls, and posting-role coverage.',true,100.00::numeric,48),
            ('FIN_SETUP_READINESS','BANKING','Banking',40,'Validate house banks and company bank-account links.',true,100.00::numeric,60),
            ('FIN_SETUP_READINESS','TAX_AND_PAYMENT','Tax and Payment',50,'Validate payment methods and tax groups/rates.',true,100.00::numeric,72),
            ('FIN_SETUP_READINESS','OPENING_BALANCE','Opening Balance',60,'Validate opening balance certification and period-0 close.',true,100.00::numeric,84),
            ('FIN_SETUP_READINESS','POSTING_TEST','Posting Test',70,'Post and reverse a test journal in the current open period.',true,100.00::numeric,96),
            ('FIN_SETUP_READINESS','CERTIFICATION','Certification',80,'Resolve critical deviations and certify finance posting readiness.',true,100.00::numeric,108)
        ) AS p(type_code, phase_code, phase_name, sort_order, description, gate_enforced, readiness_pct, target_hours)
    LOOP
        SELECT id INTO v_type_id
          FROM control.cycle_type
         WHERE tenant_id = v_tid
           AND code = v_phase.type_code;

        SELECT id, sort_order INTO v_phase_id, v_existing_sort
          FROM control.cycle_phase
         WHERE tenant_id = v_tid
           AND cycle_type_id = v_type_id
           AND code = v_phase.phase_code;

        IF v_phase_id IS NULL THEN
            v_sort := v_phase.sort_order;
            WHILE EXISTS (
                SELECT 1
                  FROM control.cycle_phase
                 WHERE tenant_id = v_tid
                   AND cycle_type_id = v_type_id
                   AND sort_order = v_sort
            ) LOOP
                v_sort := v_sort + 1;
            END LOOP;

            INSERT INTO control.cycle_phase (
                tenant_id, cycle_type_id, code, name, sort_order,
                description, is_gate_enforced, minimum_readiness_pct,
                target_hours_from_start, status, created_by
            )
            VALUES (
                v_tid, v_type_id, v_phase.phase_code, v_phase.phase_name, v_sort,
                v_phase.description, v_phase.gate_enforced, v_phase.readiness_pct,
                v_phase.target_hours, 'active', v_sys
            );
        ELSE
            v_sort := v_phase.sort_order;
            IF EXISTS (
                SELECT 1
                  FROM control.cycle_phase
                 WHERE tenant_id = v_tid
                   AND cycle_type_id = v_type_id
                   AND sort_order = v_sort
                   AND id <> v_phase_id
            ) THEN
                v_sort := v_existing_sort;
            END IF;

            UPDATE control.cycle_phase
               SET name                    = v_phase.phase_name,
                   sort_order              = v_sort,
                   description             = v_phase.description,
                   is_gate_enforced        = v_phase.gate_enforced,
                   minimum_readiness_pct       = v_phase.readiness_pct,
                   target_hours_from_start = v_phase.target_hours,
                   status                  = 'active',
                   updated_at              = now(),
                   updated_by              = v_sys
             WHERE id = v_phase_id
               AND (name,sort_order,description,is_gate_enforced,minimum_readiness_pct,
                    target_hours_from_start,status)
                 IS DISTINCT FROM
                   (v_phase.phase_name,v_sort,v_phase.description,v_phase.gate_enforced,
                    v_phase.readiness_pct,v_phase.target_hours,'active'::control.cycle_config_status_d);
        END IF;
    END LOOP;

    -- Year-end certification is blocked until the matching company/year/monthly
    -- close reaches certification. Optional TAX_CLOSE and SUBLEDGER_CLOSE
    -- cycles receive the same hard gate when those module packs are installed.
    INSERT INTO control.cycle_cross_dependency (
        tenant_id, predecessor_type_id, predecessor_phase_id,
        successor_type_id, successor_phase_id, is_hard, status,
        description, created_by
    )
    SELECT
        v_tid, predecessor_type.id, predecessor_phase.id,
        successor_type.id, successor_phase.id, true, 'active',
        'Year-end certification requires the corresponding upstream finance cycle to reach its certification/close phase.',
        v_sys
      FROM (VALUES
          ('MONTHLY_CLOSE',   'CERTIFICATION'),
          ('TAX_CLOSE',       'CERTIFICATION'),
          ('SUBLEDGER_CLOSE', 'CERTIFICATION')
      ) AS required_cycle(type_code, phase_code)
      JOIN control.cycle_type predecessor_type
        ON predecessor_type.tenant_id = v_tid
       AND predecessor_type.code = required_cycle.type_code
       AND predecessor_type.status = 'active'
      JOIN control.cycle_phase predecessor_phase
        ON predecessor_phase.tenant_id = v_tid
       AND predecessor_phase.cycle_type_id = predecessor_type.id
       AND predecessor_phase.code = required_cycle.phase_code
       AND predecessor_phase.status = 'active'
      JOIN control.cycle_type successor_type
        ON successor_type.tenant_id = v_tid
       AND successor_type.code = 'YEAR_END_CLOSE'
       AND successor_type.status = 'active'
      JOIN control.cycle_phase successor_phase
        ON successor_phase.tenant_id = v_tid
       AND successor_phase.cycle_type_id = successor_type.id
       AND successor_phase.code = 'YEAR_END_CERTIFICATION'
       AND successor_phase.status = 'active'
    ON CONFLICT (tenant_id, predecessor_type_id, predecessor_phase_id, successor_type_id, successor_phase_id)
    DO UPDATE SET
        is_hard = EXCLUDED.is_hard,
        status = 'active',
        description = EXCLUDED.description,
        updated_at = now(),
        updated_by = v_sys
    WHERE (control.cycle_cross_dependency.is_hard,control.cycle_cross_dependency.status,
           control.cycle_cross_dependency.description)
      IS DISTINCT FROM (EXCLUDED.is_hard,EXCLUDED.status,EXCLUDED.description);

    FOR v_type IN
        SELECT id, code
          FROM control.cycle_type
         WHERE tenant_id = v_tid
           AND code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE','OPENING_BALANCE','FIN_SETUP_READINESS')
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
                ('COMPLIANCE_AUDIT','Compliance and Audit',120,'#64748b'),
                ('OPENING_BALANCE','Opening Balance',130,'#0f766e'),
                ('FIN_SETUP_READINESS','Finance Setup Readiness',140,'#2563eb')
            ) AS c(code, name, sort_order, color_code)
        LOOP
            INSERT INTO control.cycle_task_category (
                tenant_id, cycle_type_id, code, name,
                sort_order, color_code, status, created_by
            )
            VALUES (
                v_tid, v_type.id, v_cat.code, v_cat.name,
                v_cat.sort_order, v_cat.color_code, 'active', v_sys
            )
            ON CONFLICT (tenant_id, cycle_type_id, code) DO UPDATE SET
                name = EXCLUDED.name,
                sort_order    = EXCLUDED.sort_order,
                color_code    = EXCLUDED.color_code,
                status        = 'active',
                updated_at    = now(),
                updated_by    = v_sys
            WHERE (control.cycle_task_category.name,control.cycle_task_category.sort_order,
                   control.cycle_task_category.color_code,control.cycle_task_category.status)
              IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.sort_order,EXCLUDED.color_code,EXCLUDED.status);
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
                ('MONTHLY_CLOSE','PERIOD_OPEN','CLOSE_CONTROL','OPEN_CURRENT_PERIOD','Open current fiscal month','Set current month fiscal/book periods to open for normal posting.','system','finance.period.open_current_month',true,false,'CRITICAL',10,4,20,1,'FINANCE_CONTROLLER',true,'period_gate'),
                ('MONTHLY_CLOSE','PERIOD_OPEN','CLOSE_CONTROL','VERIFY_PRIOR_PERIOD_READY','Verify prior period ready for close','Confirm the prior month is selected and ready to enter monthly close.','system','finance.period.prior_period_ready',true,false,'HIGH',20,4,15,1,'FINANCE_CONTROLLER',true,'period_gate'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','CLOSE_CONTROL','CALENDAR_LOCK_REVIEW','Review close calendar and owners','Confirm close calendar, owners, and target soft-close date.','manual',NULL::text,true,false,'MEDIUM',30,12,20,2,'FINANCE_MANAGER',false,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','SYSTEMS_DATA','MASTER_DATA_FREEZE','Confirm master data freeze','Confirm company, COA, tax, supplier, customer, and bank master changes are controlled for close.','hybrid','finance.master_data.freeze_check',true,true,'HIGH',40,24,30,4,'FINANCE_MANAGER',false,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','SYSTEMS_DATA','INTEGRATION_QUEUE_CLEAR','Clear finance integration queues','Verify posting interfaces, bank feeds, and subledger queues are complete or documented.','system','finance.integrations.queue_clear',true,false,'HIGH',50,24,20,4,'FINANCE_SYSTEMS',true,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','SYSTEMS_DATA','CROSS_BOOK_DERIVATIONS_COMPLETE','Confirm cross-book derivations complete','Verify all applicable book posting rules produced a completed or intentionally suppressed outcome with no failed or queued execution.','system','finance.cross_book.derivations_complete',true,false,'CRITICAL',55,24,20,4,'FINANCE_SYSTEMS',true,'readiness'),
                ('MONTHLY_CLOSE','PRE_CLOSE_READINESS','GL_ACCRUALS','UNPOSTED_BATCH_REVIEW','Review unposted batches','Resolve or document unposted journals, invoices, receipts, payments, and imports.','hybrid','finance.posting.unposted_batch_review',true,true,'HIGH',60,24,30,4,'FINANCE_MANAGER',false,'readiness'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','AP','AP_CUTOFF_REVIEW','Complete AP cut-off review','Review supplier invoices, accruals, holds, and unmatched AP items for period cut-off.','hybrid','finance.ap.cutoff_review',true,true,'HIGH',70,48,60,8,'AP_LEAD',false,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','AR','AR_REVENUE_CUTOFF','Complete AR and revenue cut-off','Review billing, revenue recognition, credit notes, receipts, and deferred revenue cut-off.','hybrid','finance.ar.revenue_cutoff',true,true,'HIGH',80,48,60,8,'AR_LEAD',false,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','BANK_CASH','BANK_FEEDS_IMPORTED','Confirm bank feeds imported','Confirm all bank statements and feeds through period end are imported.','system','finance.bank.statement_import_complete',true,false,'HIGH',90,48,20,8,'TREASURY_LEAD',true,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','INVENTORY','INVENTORY_VALUATION_REVIEW','Review inventory valuation','Complete inventory valuation, COGS, reserves, and stock movement review where applicable.','hybrid','finance.inventory.valuation_review',true,true,'HIGH',100,72,90,12,'INVENTORY_ACCOUNTING',false,'subledger'),
                ('MONTHLY_CLOSE','SUBLEDGER_CLOSE','FIXED_ASSETS','FIXED_ASSET_DEPRECIATION','Run depreciation and asset close','Run depreciation, review additions/disposals, and reconcile fixed asset subledger.','hybrid','finance.fixed_assets.depreciation_complete',true,true,'MEDIUM',110,72,60,12,'FIXED_ASSET_ACCOUNTING',false,'subledger'),
                ('MONTHLY_CLOSE','RECONCILIATION','BANK_CASH','BANK_RECON_COMPLETE','Complete bank reconciliations','Complete bank account reconciliations for all active cash accounts.','hybrid','finance.bank.reconciliation_complete',true,true,'HIGH',120,96,90,12,'TREASURY_LEAD',false,'reconciliation'),
                ('MONTHLY_CLOSE','RECONCILIATION','REPORTING','SUBLEDGER_GL_TIEOUT','Tie subledgers to GL','Tie AP, AR, inventory, fixed assets, and bank subledgers to GL control accounts.','system','finance.subledger.gl_tieout',true,false,'CRITICAL',130,96,30,12,'FINANCE_CONTROLLER',true,'reconciliation'),
                ('MONTHLY_CLOSE','RECONCILIATION','REPORTING','BALANCE_SHEET_RECON_COMPLETE','Complete balance sheet reconciliations','Complete and review required balance sheet reconciliations.','hybrid','finance.reconciliation.balance_sheet_complete',true,true,'CRITICAL',140,108,120,12,'FINANCE_MANAGER',false,'reconciliation'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','RECURRING_ACCRUALS_POSTED','Post recurring accruals and reversals','Post recurring accruals, prepayments, provisions, and planned reversals.','hybrid','finance.gl.recurring_accruals_posted',true,true,'HIGH',150,120,60,12,'GL_ACCOUNTANT',false,'gl_adjustments'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','FX_REVALUATION_RUN','Run FX revaluation','Run and review period-end foreign currency revaluation.','system','finance.gl.fx_revaluation_complete',true,true,'HIGH',160,120,30,12,'GL_ACCOUNTANT',true,'gl_adjustments'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','INTERCOMPANY','INTERCOMPANY_MATCHING','Complete intercompany matching','Match and resolve intercompany balances and eliminations where applicable.','hybrid','finance.intercompany.matching_complete',true,true,'HIGH',170,132,60,12,'GROUP_ACCOUNTING',false,'gl_adjustments'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','MANUAL_JOURNAL_REVIEW','Review manual journals','Review unusual, high-value, late, and manual journal entries.','hybrid','finance.gl.manual_journal_review',true,false,'HIGH',180,132,60,12,'FINANCE_CONTROLLER',false,'gl_adjustments'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','TRIAL_BALANCE_VALIDATED','Validate trial balance','Run trial balance validation and ensure debits equal credits with no blocked accounts.','system','finance.reporting.trial_balance_validated',true,false,'CRITICAL',190,144,20,12,'FINANCE_CONTROLLER',true,'review'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','PL_FLUX_ANALYSIS','Complete P&L flux analysis','Review month-over-month and budget-to-actual P&L variance explanations.','manual',NULL::text,true,true,'HIGH',200,156,90,12,'FPNA_LEAD',false,'review'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','BS_FLUX_ANALYSIS','Complete balance sheet flux analysis','Review balance sheet movement and material account explanations.','manual',NULL::text,true,true,'HIGH',210,156,90,12,'FINANCE_MANAGER',false,'review'),
                ('MONTHLY_CLOSE','REVIEW_ANALYTICS','REPORTING','MATERIAL_VARIANCE_REVIEW','Review material variances','Controller review of material variances and unusual balances.','manual',NULL::text,true,false,'HIGH',220,168,60,8,'FINANCE_CONTROLLER',false,'review'),
                ('MONTHLY_CLOSE','CERTIFICATION','COMPLIANCE_AUDIT','CRITICAL_DEVIATIONS_APPROVED','Approve critical deviations','Resolve, approve, or explicitly carry forward critical exceptions, overrides, and waivers.','hybrid','finance.close.critical_deviations_approved',true,false,'CRITICAL',230,168,30,4,'FINANCE_CONTROLLER',false,'certification'),
                ('MONTHLY_CLOSE','CERTIFICATION','COMPLIANCE_AUDIT','CONTROLLER_CERTIFICATION','Controller certification','Controller certifies the monthly close pack and approved exceptions.','manual',NULL::text,true,false,'CRITICAL',240,172,30,2,'FINANCE_CONTROLLER',false,'certification'),
                ('MONTHLY_CLOSE','PERIOD_SOFT_CLOSE','CLOSE_CONTROL','MOVE_PRIOR_PERIOD_SOFT_CLOSE','Move prior period to soft close','Move prior month fiscal and book periods to soft close.','hybrid','finance.period.move_prior_to_soft_close',true,false,'CRITICAL',250,176,20,1,'FINANCE_CONTROLLER',false,'period_gate'),
                ('MONTHLY_CLOSE','PERIOD_SOFT_CLOSE','CLOSE_CONTROL','VERIFY_SOFT_CLOSE_POSTING_CONTROL','Verify soft-close posting control','Verify prior-period postings now require reason code and approval.','system','finance.period.soft_close_controls_active',true,false,'CRITICAL',260,176,15,1,'FINANCE_SYSTEMS',true,'period_gate'),
                ('MONTHLY_CLOSE','POST_CLOSE','COMPLIANCE_AUDIT','CARRYFORWARD_REGISTER_UPDATED','Update carryforward register','Document approved exceptions that carry to the next close.','manual',NULL::text,true,true,'MEDIUM',270,188,30,4,'FINANCE_MANAGER',false,'post_close'),
                ('MONTHLY_CLOSE','POST_CLOSE','COMPLIANCE_AUDIT','CLOSE_PACK_ARCHIVED','Archive monthly close pack','Archive close evidence, reconciliations, reports, and certification snapshot.','hybrid','finance.close.archive_pack',true,false,'MEDIUM',280,192,20,4,'FINANCE_SYSTEMS',false,'post_close'),

                ('YEAR_END_CLOSE','YEAR_END_READINESS','CLOSE_CONTROL','YE_ADJUSTMENT_PERIODS_READY','Confirm adjustment periods ready','Confirm all monthly periods are soft closed and year-end adjustment periods are available as needed.','hybrid','finance.year_end.adjustment_periods_ready',true,false,'CRITICAL',10,24,30,4,'FINANCE_CONTROLLER',true,'year_end_readiness'),
                ('YEAR_END_CLOSE','FINAL_SUBLEDGER_LOCK','CLOSE_CONTROL','YE_FINAL_SUBLEDGER_LOCK','Final subledger lock','Lock final AP, AR, bank, inventory, fixed asset, and payroll subledger activity for the fiscal year.','hybrid','finance.year_end.subledger_lock_complete',true,false,'CRITICAL',20,72,90,12,'FINANCE_CONTROLLER',false,'year_end_subledger'),
                ('YEAR_END_CLOSE','FINAL_RECONCILIATION','REPORTING','YE_ALL_RECONS_COMPLETE','Complete final reconciliations','Complete final balance sheet, bank, subledger, intercompany, and consolidation reconciliations.','hybrid','finance.year_end.reconciliations_complete',true,false,'CRITICAL',30,120,120,12,'FINANCE_MANAGER',false,'year_end_recon'),
                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','COMPLIANCE_AUDIT','YE_AUDIT_ADJUSTMENTS_POSTED','Post audit adjustments','Post approved audit, management, reclassification, and consolidation adjustments.','hybrid','finance.year_end.audit_adjustments_posted',true,false,'CRITICAL',40,168,90,12,'FINANCE_CONTROLLER',false,'year_end_adjustments'),
                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','TAX','YE_TAX_STAT_PACK_READY','Complete tax and statutory packs','Complete tax provision, statutory schedules, and jurisdiction reporting support.','manual',NULL::text,true,true,'HIGH',50,180,120,12,'TAX_LEAD',false,'year_end_tax_stat'),
                ('YEAR_END_CLOSE','FINAL_REVIEW','REPORTING','YE_DISCLOSURE_REVIEW','Complete disclosure review','Review financial statements, notes, disclosure checklist, and management representation points.','manual',NULL::text,true,false,'HIGH',60,216,120,12,'FINANCE_CONTROLLER',false,'year_end_review'),
                ('YEAR_END_CLOSE','FINAL_REVIEW','REPORTING','YE_FINAL_TRIAL_BALANCE','Validate final trial balance','Validate final year-end trial balance after all approved adjustments.','system','finance.year_end.final_trial_balance_validated',true,false,'CRITICAL',70,216,20,4,'FINANCE_CONTROLLER',true,'year_end_review'),
                ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','COMPLIANCE_AUDIT','YE_DEVIATIONS_APPROVED','Approve year-end deviations','Resolve or approve all year-end exceptions, overrides, waivers, and management judgments.','hybrid','finance.year_end.deviations_approved',true,false,'CRITICAL',80,228,45,4,'FINANCE_CONTROLLER',false,'year_end_cert'),
                ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','COMPLIANCE_AUDIT','YE_CONTROLLER_CERTIFICATION','Controller year-end certification','Controller certifies final financial close and exception treatment.','manual',NULL::text,true,false,'CRITICAL',90,240,30,2,'FINANCE_CONTROLLER',false,'year_end_cert'),
                ('YEAR_END_CLOSE','YEAR_END_CERTIFICATION','COMPLIANCE_AUDIT','YE_CFO_ATTESTATION','CFO attestation','CFO or delegated finance executive attests final year-end close pack.','manual',NULL::text,true,false,'CRITICAL',100,240,30,2,'CFO',false,'year_end_cert'),
                ('YEAR_END_CLOSE','PERIOD_HARD_CLOSE','CLOSE_CONTROL','YE_MOVE_PERIODS_HARD_CLOSE','Move fiscal year to hard close','Move fiscal and book periods for the year to hard close after certification.','hybrid','finance.year_end.move_periods_hard_close',true,false,'CRITICAL',110,264,20,1,'FINANCE_CONTROLLER',false,'year_end_lock'),
                ('YEAR_END_CLOSE','PERIOD_HARD_CLOSE','CLOSE_CONTROL','YE_VERIFY_HARD_CLOSE_LOCK','Verify hard-close posting lock','Verify all hard-closed fiscal/book periods block posting.','system','finance.year_end.hard_close_lock_verified',true,false,'CRITICAL',120,264,15,1,'FINANCE_SYSTEMS',true,'year_end_lock'),
                ('YEAR_END_CLOSE','YEAR_END_ARCHIVE','COMPLIANCE_AUDIT','YE_AUDIT_PACK_ARCHIVE','Archive year-end audit pack','Archive final financial statements, audit schedules, certifications, and evidence pack.','hybrid','finance.year_end.archive_audit_pack',true,false,'HIGH',130,288,45,4,'FINANCE_SYSTEMS',false,'year_end_archive'),

                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','TAX_CALCULATIONS_COMPLETE','Complete tax calculations','Run and review monthly tax calculations; preserve resulting tax documents and journals in their existing domains.','hybrid','finance.tax.monthly_calculations_complete',true,true,'HIGH',185,132,30,12,'TAX_LEAD',false,'recurring_postings'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','REVENUE_RECOGNITION_COMPLETE','Complete revenue recognition','Run and review revenue recognition using existing documents and ledger entries.','hybrid','finance.revenue.recognition_complete',true,true,'HIGH',186,132,30,12,'AR_LEAD',false,'recurring_postings'),
                ('MONTHLY_CLOSE','GL_ADJUSTMENTS','GL_ACCRUALS','EXPENSE_DEFERRAL_COMPLETE','Complete expense deferral','Run and review expense deferrals using existing documents and ledger entries.','hybrid','finance.expense.deferral_complete',true,true,'HIGH',187,132,30,12,'GL_ACCOUNTANT',false,'recurring_postings'),

                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','GL_ACCRUALS','YE_TAX_ADJUSTMENTS_POSTED','Post tax adjustments','Post approved tax adjustments through existing tax documents and journals.','hybrid','finance.year_end.tax_adjustments_posted',true,false,'CRITICAL',45,180,45,12,'TAX_LEAD',false,'year_end_adjustments'),
                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','FIXED_ASSETS','YE_ASSET_IMPAIRMENT_REVALUATION','Complete asset impairment and revaluation','Complete approved fixed-asset impairment and revaluation using existing asset and journal records.','hybrid','finance.year_end.asset_impairment_revaluation_complete',true,true,'HIGH',46,180,60,12,'FIXED_ASSET_ACCOUNTING',false,'year_end_adjustments'),
                ('YEAR_END_CLOSE','AUDIT_TAX_STAT','INTERCOMPANY','YE_INTERCOMPANY_ELIMINATION','Complete intercompany elimination','Complete and post approved intercompany eliminations using existing journals.','hybrid','finance.year_end.intercompany_elimination_complete',true,false,'CRITICAL',47,180,60,12,'GROUP_ACCOUNTING',false,'year_end_adjustments'),
                ('YEAR_END_CLOSE','FINAL_REVIEW','GL_ACCRUALS','YE_RETAINED_EARNINGS_TRANSFER','Complete retained earnings transfer','Post and review the retained-earnings transfer using the journal lifecycle.','hybrid','finance.year_end.retained_earnings_transfer_complete',true,false,'CRITICAL',65,216,30,8,'FINANCE_CONTROLLER',false,'year_end_review'),
                ('YEAR_END_CLOSE','FINAL_REVIEW','REPORTING','YE_NEXT_YEAR_OPENING_CARRYFORWARD','Complete next-year opening carry-forward','Generate and verify next-year opening carry-forward using period-0 journals and ledger balances.','hybrid','finance.year_end.opening_carryforward_complete',true,false,'CRITICAL',66,216,30,8,'FINANCE_CONTROLLER',false,'year_end_review'),
                ('YEAR_END_CLOSE','YEAR_END_ARCHIVE','COMPLIANCE_AUDIT','YE_FINANCIAL_STATEMENT_EVIDENCE','Archive financial-statement evidence','Add final financial statements and supporting evidence to the report pack.','hybrid','finance.year_end.financial_statement_evidence_archived',true,false,'HIGH',125,288,45,4,'FINANCE_SYSTEMS',false,'year_end_archive'),

                ('OPENING_BALANCE','PREPARATION','OPENING_BALANCE','OB_CONFIRM_SCOPE','Confirm company, fiscal year, period 0, and books','Confirm company, fiscal year, generated opening period, selected ledger books, and migration strategy.','manual',NULL::text,true,false,'CRITICAL',10,24,30,4,'FINANCE_CONTROLLER',false,'preparation'),
                ('OPENING_BALANCE','PREPARATION','OPENING_BALANCE','OB_RECORD_SOURCE_CUTOFF','Record source system and cutoff','Record source system, extract cutoff date, source-file hashes, and preparer.','manual',NULL::text,true,false,'HIGH',20,24,20,4,'GL_ACCOUNTANT',false,'preparation'),
                ('OPENING_BALANCE','VALIDATION','OPENING_BALANCE','OB_UPLOAD_AND_MAP','Upload and map source trial balance','Upload via document.import_request and retain its mapping snapshot.','hybrid','finance.opening_balance.import_uploaded_and_mapped',true,false,'CRITICAL',30,48,30,8,'GL_ACCOUNTANT',true,'validation'),
                ('OPENING_BALANCE','VALIDATION','OPENING_BALANCE','OB_VALIDATE_SOURCE','Validate source data','Check structure, mandatory columns, account controls, balancing, currency, dimensions, duplicates, control accounts, subledgers, and period-0 availability.','system','finance.opening_balance.source_validated',true,false,'CRITICAL',40,72,45,8,'FINANCE_SYSTEMS',true,'validation'),
                ('OPENING_BALANCE','VALIDATION','OPENING_BALANCE','OB_RESOLVE_IMPORT_ERRORS','Correct failed rows and re-upload','Correct the source file and re-upload failed rows. Errors remain in import_request_chunk.errors_json; raw-row staging is not editable.','manual',NULL::text,true,false,'HIGH',50,72,60,8,'GL_ACCOUNTANT',false,'validation'),
                ('OPENING_BALANCE','REVIEW_APPROVAL','OPENING_BALANCE','OB_REVIEW_VALIDATION','Review validation results and warnings','Review evidence and resolve errors; govern permitted deviations through cycle_deviation.','hybrid','finance.opening_balance.validation_reviewed',true,false,'CRITICAL',60,96,45,8,'FINANCE_CONTROLLER',false,'review'),
                ('OPENING_BALANCE','REVIEW_APPROVAL','OPENING_BALANCE','OB_APPROVE_JOURNAL_PREVIEW','Approve draft period-0 journal preview','Approve normalized draft journal lines, the editable accounting representation after validation.','manual',NULL::text,true,false,'CRITICAL',70,96,45,8,'FINANCE_CONTROLLER',false,'review'),
                ('OPENING_BALANCE','REVIEW_APPROVAL','OPENING_BALANCE','OB_APPROVE_JOURNALS','Approve opening journals','Approve opening journals through the journal lifecycle or document workflow.','hybrid','finance.opening_balance.journals_approved',true,false,'CRITICAL',80,96,30,8,'FINANCE_CONTROLLER',false,'review'),
                ('OPENING_BALANCE','POSTING','OPENING_BALANCE','OB_CONFIRM_PERIOD_0_OPEN','Confirm fiscal and book period 0 open','Confirm master.fiscal_period and governance.book_period_status permit period-0 posting.','system','finance.opening_balance.period_0_open',true,false,'CRITICAL',90,120,15,4,'FINANCE_CONTROLLER',true,'posting'),
                ('OPENING_BALANCE','POSTING','OPENING_BALANCE','OB_POST_JOURNALS','Post opening journals','Post approved journals using idempotency keys and record journal IDs in task evidence.','system','finance.opening_balance.journals_posted',true,false,'CRITICAL',100,120,30,4,'FINANCE_SYSTEMS',true,'posting'),
                ('OPENING_BALANCE','RECONCILIATION','OPENING_BALANCE','OB_RECONCILE_GL','Reconcile GL and subledgers','Reconcile imported and posted totals, trial balance, AP, AR, fixed assets, inventory, bank, and suspense/unmapped accounts.','hybrid','finance.opening_balance.reconciliations_complete',true,false,'CRITICAL',110,144,90,12,'FINANCE_CONTROLLER',false,'reconciliation'),
                ('OPENING_BALANCE','CERTIFICATION','OPENING_BALANCE','OB_GENERATE_EVIDENCE_PACK','Generate opening-balance evidence pack','Generate report pack with source hashes, journals, totals, reconciliations, deviations, approvers, and content hashes.','system','finance.opening_balance.evidence_pack_generated',true,false,'CRITICAL',120,156,30,4,'FINANCE_SYSTEMS',true,'certification'),
                ('OPENING_BALANCE','CERTIFICATION','OPENING_BALANCE','OB_FINAL_CERTIFICATION','Certify and attest opening balances','Complete OPEN_BAL_GL, OPEN_BAL_AP, OPEN_BAL_AR, OPEN_BAL_ASSET, OPEN_BAL_INVENTORY, OPEN_BAL_BANK, and OPEN_BAL_FINAL certifications.','manual',NULL::text,true,false,'CRITICAL',130,168,45,2,'FINANCE_CONTROLLER',false,'certification'),
                ('OPENING_BALANCE','HARD_CLOSE','OPENING_BALANCE','OB_HARD_CLOSE_PERIOD_0','Hard-close period 0','Hard-close fiscal and selected book period 0 after final attestation.','hybrid','finance.opening_balance.period_0_hard_closed',true,false,'CRITICAL',140,172,20,1,'FINANCE_CONTROLLER',false,'hard_close'),

                ('FIN_SETUP_READINESS','ORGANIZATION','FIN_SETUP_READINESS','FSR_COMPANY_ACTIVE','Confirm company is active','Verify the company code is active.','system','finance.setup.company_active',true,false,'CRITICAL',10,12,5,2,'FINANCE_SYSTEMS',true,'organization'),
                ('FIN_SETUP_READINESS','ORGANIZATION','FIN_SETUP_READINESS','FSR_LEGAL_ENTITY_ACTIVE','Confirm legal entity is active','Verify the associated legal entity is active.','system','finance.setup.legal_entity_active',true,false,'CRITICAL',20,12,5,2,'FINANCE_SYSTEMS',true,'organization'),
                ('FIN_SETUP_READINESS','ORGANIZATION','FIN_SETUP_READINESS','FSR_CURRENCY_CONFIGURED','Confirm functional currency','Verify functional/base currency is configured for the company and primary book.','system','finance.setup.functional_currency_configured',true,false,'CRITICAL',30,12,5,2,'FINANCE_SYSTEMS',true,'organization'),
                ('FIN_SETUP_READINESS','LEDGER','FIN_SETUP_READINESS','FSR_PRIMARY_BOOK_ASSIGNED','Confirm primary ledger book','Verify an active primary ledger book is assigned to the company.','system','finance.setup.primary_book_assigned',true,false,'CRITICAL',40,24,5,2,'FINANCE_SYSTEMS',true,'ledger'),
                ('FIN_SETUP_READINESS','LEDGER','FIN_SETUP_READINESS','FSR_FISCAL_CALENDAR_GENERATED','Confirm fiscal calendar generated','Verify fiscal calendar and periods are generated.','system','finance.setup.fiscal_calendar_generated',true,false,'CRITICAL',50,24,5,2,'FINANCE_SYSTEMS',true,'ledger'),
                ('FIN_SETUP_READINESS','LEDGER','FIN_SETUP_READINESS','FSR_CURRENT_PERIOD_AVAILABLE','Confirm current periods available','Verify current fiscal periods and book-period statuses exist.','system','finance.setup.current_period_available',true,false,'CRITICAL',60,24,5,2,'FINANCE_SYSTEMS',true,'ledger'),
                ('FIN_SETUP_READINESS','ACCOUNTING','FIN_SETUP_READINESS','FSR_CHART_ASSIGNED','Confirm Chart of Accounts assigned','Verify an active operating chart is assigned to the company.','system','finance.setup.chart_assigned',true,false,'CRITICAL',70,48,5,4,'FINANCE_SYSTEMS',true,'accounting'),
                ('FIN_SETUP_READINESS','ACCOUNTING','FIN_SETUP_READINESS','FSR_GL_CONTROLS_COMPLETE','Confirm GL controls complete','Verify required GL accounts are active and company posting controls are complete.','system','finance.setup.gl_controls_complete',true,false,'CRITICAL',80,48,10,4,'FINANCE_SYSTEMS',true,'accounting'),
                ('FIN_SETUP_READINESS','ACCOUNTING','FIN_SETUP_READINESS','FSR_POSTING_ROLES_MAPPED','Confirm mandatory posting roles mapped','Verify every required posting role resolves to a postable account.','system','finance.setup.posting_roles_mapped',true,false,'CRITICAL',90,48,10,4,'FINANCE_SYSTEMS',true,'accounting'),
                ('FIN_SETUP_READINESS','BANKING','FIN_SETUP_READINESS','FSR_HOUSE_BANK_CONFIGURED','Confirm house bank configured','Verify an active house-bank configuration exists.','system','finance.setup.house_bank_configured',true,false,'HIGH',100,60,10,4,'FINANCE_SYSTEMS',true,'banking'),
                ('FIN_SETUP_READINESS','BANKING','FIN_SETUP_READINESS','FSR_BANK_ACCOUNT_LINKED','Confirm company bank account linked','Verify the house-bank account is actively linked to the company.','system','finance.setup.bank_account_linked',true,false,'HIGH',110,60,10,4,'FINANCE_SYSTEMS',true,'banking'),
                ('FIN_SETUP_READINESS','TAX_AND_PAYMENT','FIN_SETUP_READINESS','FSR_PAYMENT_METHODS_CONFIGURED','Confirm payment methods configured','Verify the company has active payment methods and policies.','system','finance.setup.payment_methods_configured',true,false,'HIGH',120,72,10,4,'FINANCE_SYSTEMS',true,'tax_payment'),
                ('FIN_SETUP_READINESS','TAX_AND_PAYMENT','FIN_SETUP_READINESS','FSR_TAX_GROUPS_VALID','Confirm tax groups and rates valid','Verify active tax groups have currently effective valid rates.','system','finance.setup.tax_groups_valid',true,false,'HIGH',130,72,10,4,'FINANCE_SYSTEMS',true,'tax_payment'),
                ('FIN_SETUP_READINESS','OPENING_BALANCE','FIN_SETUP_READINESS','FSR_OPENING_BALANCE_CERTIFIED','Confirm opening balance certified','Verify the OPEN_BAL_FINAL certification is attested.','system','finance.setup.opening_balance_certified',true,false,'CRITICAL',140,84,10,4,'FINANCE_SYSTEMS',true,'opening_balance'),
                ('FIN_SETUP_READINESS','OPENING_BALANCE','FIN_SETUP_READINESS','FSR_PERIOD_0_CLOSED','Confirm period 0 appropriately closed','Verify fiscal and book period 0 are closed at the required level.','system','finance.setup.period_0_closed',true,false,'CRITICAL',150,84,10,4,'FINANCE_SYSTEMS',true,'opening_balance'),
                ('FIN_SETUP_READINESS','POSTING_TEST','FIN_SETUP_READINESS','FSR_CURRENT_PERIOD_OPEN','Confirm current posting period open','Verify the current fiscal and book period are open for normal posting.','system','finance.setup.current_period_open',true,false,'CRITICAL',160,96,5,2,'FINANCE_SYSTEMS',true,'posting_test'),
                ('FIN_SETUP_READINESS','POSTING_TEST','FIN_SETUP_READINESS','FSR_TEST_JOURNAL_POSTED_REVERSED','Post and reverse test journal','Post and reverse an approved test journal and record both journal IDs as task evidence.','hybrid','finance.setup.test_journal_posted_reversed',true,false,'CRITICAL',170,96,20,2,'FINANCE_CONTROLLER',false,'posting_test'),
                ('FIN_SETUP_READINESS','CERTIFICATION','FIN_SETUP_READINESS','FSR_NO_CRITICAL_DEVIATIONS','Confirm no critical readiness deviations','Resolve or reject all critical readiness deviations.','system','finance.setup.no_critical_deviations',true,false,'CRITICAL',180,108,10,2,'FINANCE_SYSTEMS',true,'certification'),
                ('FIN_SETUP_READINESS','CERTIFICATION','FIN_SETUP_READINESS','FSR_FINAL_CERTIFICATION','Certify finance posting readiness','Create and attest FINANCE_POSTING_READY certification.','manual',NULL::text,true,false,'CRITICAL',190,108,20,1,'FINANCE_CONTROLLER',false,'certification')
            ) AS t(type_code, phase_code, category_code, task_code, task_name, description, completion_mode, system_handler, mandatory, waivable, severity_code, sort_order, sla_hours, duration_min, reminder_hours, owner_role, auto_start, orchestration_group)
        LOOP
            SELECT id INTO v_type_id
              FROM control.cycle_type
             WHERE tenant_id = v_tid
               AND code = v_task.type_code;

            SELECT id INTO v_phase_id
              FROM control.cycle_phase
             WHERE tenant_id = v_tid
               AND cycle_type_id = v_type_id
               AND code = v_task.phase_code;

            SELECT id INTO v_category_id
              FROM control.cycle_task_category
             WHERE tenant_id = v_tid
               AND cycle_type_id = v_type_id
               AND code = v_task.category_code;

            IF v_type_id IS NULL OR v_phase_id IS NULL OR v_category_id IS NULL THEN
                RAISE WARNING '[finance_close_governance] skipping task %, missing type/phase/category', v_task.task_code;
                CONTINUE;
            END IF;

            INSERT INTO control.cycle_task_template (
                tenant_id, entity_code, cycle_type_id, phase_id, category_id,
                code, name, description, completion_mode,
                system_check_handler, is_mandatory, is_waivable, severity_code,
                sort_order, sla_hours, estimated_duration_min, reminder_lead_hours,
                default_owner_role_code, auto_start_when_ready, orchestration_group,
                status, created_by
            )
            VALUES (
                v_tid, v_cc.code, v_type_id, v_phase_id, v_category_id,
                v_task.task_code, v_task.task_name, v_task.description, v_task.completion_mode,
                v_task.system_handler, v_task.mandatory, v_task.waivable, v_task.severity_code,
                v_task.sort_order, v_task.sla_hours, v_task.duration_min, v_task.reminder_hours,
                v_task.owner_role, v_task.auto_start, v_task.orchestration_group,
                'active', v_sys
            )
            ON CONFLICT (tenant_id, entity_code, cycle_type_id, code) DO UPDATE SET
                phase_id                   = EXCLUDED.phase_id,
                category_id                = EXCLUDED.category_id,
                name                  = EXCLUDED.name,
                description                = EXCLUDED.description,
                completion_mode            = EXCLUDED.completion_mode,
                system_check_handler       = EXCLUDED.system_check_handler,
                is_mandatory               = EXCLUDED.is_mandatory,
                is_waivable                = EXCLUDED.is_waivable,
                severity_code                   = EXCLUDED.severity_code,
                sort_order                 = EXCLUDED.sort_order,
                sla_hours                  = EXCLUDED.sla_hours,
                estimated_duration_min     = EXCLUDED.estimated_duration_min,
                reminder_lead_hours        = EXCLUDED.reminder_lead_hours,
                default_owner_role_code         = EXCLUDED.default_owner_role_code,
                auto_start_when_ready   = EXCLUDED.auto_start_when_ready,
                orchestration_group        = EXCLUDED.orchestration_group,
                status                     = 'active',
                updated_at                 = now(),
                updated_by                 = v_sys
            WHERE (control.cycle_task_template.phase_id,control.cycle_task_template.category_id,
                   control.cycle_task_template.name,control.cycle_task_template.description,
                   control.cycle_task_template.completion_mode,control.cycle_task_template.system_check_handler,
                   control.cycle_task_template.is_mandatory,control.cycle_task_template.is_waivable,
                   control.cycle_task_template.severity_code,control.cycle_task_template.sort_order,
                   control.cycle_task_template.sla_hours,control.cycle_task_template.estimated_duration_min,
                   control.cycle_task_template.reminder_lead_hours,control.cycle_task_template.default_owner_role_code,
                   control.cycle_task_template.auto_start_when_ready,control.cycle_task_template.orchestration_group,
                   control.cycle_task_template.status)
              IS DISTINCT FROM
                  (EXCLUDED.phase_id,EXCLUDED.category_id,EXCLUDED.name,EXCLUDED.description,
                   EXCLUDED.completion_mode,EXCLUDED.system_check_handler,EXCLUDED.is_mandatory,
                   EXCLUDED.is_waivable,EXCLUDED.severity_code,EXCLUDED.sort_order,EXCLUDED.sla_hours,
                   EXCLUDED.estimated_duration_min,EXCLUDED.reminder_lead_hours,
                   EXCLUDED.default_owner_role_code,EXCLUDED.auto_start_when_ready,
                   EXCLUDED.orchestration_group,EXCLUDED.status);
        END LOOP;

        FOR v_dep IN
            SELECT *
            FROM (VALUES
                ('MONTHLY_CLOSE','OPEN_CURRENT_PERIOD','VERIFY_PRIOR_PERIOD_READY'),
                ('MONTHLY_CLOSE','VERIFY_PRIOR_PERIOD_READY','CALENDAR_LOCK_REVIEW'),
                ('MONTHLY_CLOSE','VERIFY_PRIOR_PERIOD_READY','MASTER_DATA_FREEZE'),
                ('MONTHLY_CLOSE','VERIFY_PRIOR_PERIOD_READY','INTEGRATION_QUEUE_CLEAR'),
                ('MONTHLY_CLOSE','INTEGRATION_QUEUE_CLEAR','CROSS_BOOK_DERIVATIONS_COMPLETE'),
                ('MONTHLY_CLOSE','CROSS_BOOK_DERIVATIONS_COMPLETE','AP_CUTOFF_REVIEW'),
                ('MONTHLY_CLOSE','CROSS_BOOK_DERIVATIONS_COMPLETE','AR_REVENUE_CUTOFF'),
                ('MONTHLY_CLOSE','CROSS_BOOK_DERIVATIONS_COMPLETE','BANK_FEEDS_IMPORTED'),
                ('MONTHLY_CLOSE','CROSS_BOOK_DERIVATIONS_COMPLETE','INVENTORY_VALUATION_REVIEW'),
                ('MONTHLY_CLOSE','CROSS_BOOK_DERIVATIONS_COMPLETE','FIXED_ASSET_DEPRECIATION'),
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
                ('MONTHLY_CLOSE','MANUAL_JOURNAL_REVIEW','TAX_CALCULATIONS_COMPLETE'),
                ('MONTHLY_CLOSE','MANUAL_JOURNAL_REVIEW','REVENUE_RECOGNITION_COMPLETE'),
                ('MONTHLY_CLOSE','MANUAL_JOURNAL_REVIEW','EXPENSE_DEFERRAL_COMPLETE'),
                ('MONTHLY_CLOSE','TAX_CALCULATIONS_COMPLETE','TRIAL_BALANCE_VALIDATED'),
                ('MONTHLY_CLOSE','REVENUE_RECOGNITION_COMPLETE','TRIAL_BALANCE_VALIDATED'),
                ('MONTHLY_CLOSE','EXPENSE_DEFERRAL_COMPLETE','TRIAL_BALANCE_VALIDATED'),
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
                ('YEAR_END_CLOSE','YE_AUDIT_ADJUSTMENTS_POSTED','YE_TAX_ADJUSTMENTS_POSTED'),
                ('YEAR_END_CLOSE','YE_AUDIT_ADJUSTMENTS_POSTED','YE_ASSET_IMPAIRMENT_REVALUATION'),
                ('YEAR_END_CLOSE','YE_AUDIT_ADJUSTMENTS_POSTED','YE_INTERCOMPANY_ELIMINATION'),
                ('YEAR_END_CLOSE','YE_TAX_ADJUSTMENTS_POSTED','YE_TAX_STAT_PACK_READY'),
                ('YEAR_END_CLOSE','YE_ASSET_IMPAIRMENT_REVALUATION','YE_TAX_STAT_PACK_READY'),
                ('YEAR_END_CLOSE','YE_INTERCOMPANY_ELIMINATION','YE_TAX_STAT_PACK_READY'),
                ('YEAR_END_CLOSE','YE_TAX_STAT_PACK_READY','YE_DISCLOSURE_REVIEW'),
                ('YEAR_END_CLOSE','YE_DISCLOSURE_REVIEW','YE_RETAINED_EARNINGS_TRANSFER'),
                ('YEAR_END_CLOSE','YE_RETAINED_EARNINGS_TRANSFER','YE_NEXT_YEAR_OPENING_CARRYFORWARD'),
                ('YEAR_END_CLOSE','YE_NEXT_YEAR_OPENING_CARRYFORWARD','YE_FINAL_TRIAL_BALANCE'),
                ('YEAR_END_CLOSE','YE_FINAL_TRIAL_BALANCE','YE_DEVIATIONS_APPROVED'),
                ('YEAR_END_CLOSE','YE_DEVIATIONS_APPROVED','YE_CONTROLLER_CERTIFICATION'),
                ('YEAR_END_CLOSE','YE_CONTROLLER_CERTIFICATION','YE_CFO_ATTESTATION'),
                ('YEAR_END_CLOSE','YE_CFO_ATTESTATION','YE_MOVE_PERIODS_HARD_CLOSE'),
                ('YEAR_END_CLOSE','YE_MOVE_PERIODS_HARD_CLOSE','YE_VERIFY_HARD_CLOSE_LOCK'),
                ('YEAR_END_CLOSE','YE_VERIFY_HARD_CLOSE_LOCK','YE_FINANCIAL_STATEMENT_EVIDENCE'),
                ('YEAR_END_CLOSE','YE_FINANCIAL_STATEMENT_EVIDENCE','YE_AUDIT_PACK_ARCHIVE'),

                ('OPENING_BALANCE','OB_CONFIRM_SCOPE','OB_RECORD_SOURCE_CUTOFF'),
                ('OPENING_BALANCE','OB_RECORD_SOURCE_CUTOFF','OB_UPLOAD_AND_MAP'),
                ('OPENING_BALANCE','OB_UPLOAD_AND_MAP','OB_VALIDATE_SOURCE'),
                ('OPENING_BALANCE','OB_VALIDATE_SOURCE','OB_RESOLVE_IMPORT_ERRORS'),
                ('OPENING_BALANCE','OB_RESOLVE_IMPORT_ERRORS','OB_REVIEW_VALIDATION'),
                ('OPENING_BALANCE','OB_REVIEW_VALIDATION','OB_APPROVE_JOURNAL_PREVIEW'),
                ('OPENING_BALANCE','OB_APPROVE_JOURNAL_PREVIEW','OB_APPROVE_JOURNALS'),
                ('OPENING_BALANCE','OB_APPROVE_JOURNALS','OB_CONFIRM_PERIOD_0_OPEN'),
                ('OPENING_BALANCE','OB_CONFIRM_PERIOD_0_OPEN','OB_POST_JOURNALS'),
                ('OPENING_BALANCE','OB_POST_JOURNALS','OB_RECONCILE_GL'),
                ('OPENING_BALANCE','OB_RECONCILE_GL','OB_GENERATE_EVIDENCE_PACK'),
                ('OPENING_BALANCE','OB_GENERATE_EVIDENCE_PACK','OB_FINAL_CERTIFICATION'),
                ('OPENING_BALANCE','OB_FINAL_CERTIFICATION','OB_HARD_CLOSE_PERIOD_0'),

                ('FIN_SETUP_READINESS','FSR_COMPANY_ACTIVE','FSR_LEGAL_ENTITY_ACTIVE'),
                ('FIN_SETUP_READINESS','FSR_LEGAL_ENTITY_ACTIVE','FSR_CURRENCY_CONFIGURED'),
                ('FIN_SETUP_READINESS','FSR_CURRENCY_CONFIGURED','FSR_PRIMARY_BOOK_ASSIGNED'),
                ('FIN_SETUP_READINESS','FSR_PRIMARY_BOOK_ASSIGNED','FSR_FISCAL_CALENDAR_GENERATED'),
                ('FIN_SETUP_READINESS','FSR_FISCAL_CALENDAR_GENERATED','FSR_CURRENT_PERIOD_AVAILABLE'),
                ('FIN_SETUP_READINESS','FSR_CURRENT_PERIOD_AVAILABLE','FSR_CHART_ASSIGNED'),
                ('FIN_SETUP_READINESS','FSR_CHART_ASSIGNED','FSR_GL_CONTROLS_COMPLETE'),
                ('FIN_SETUP_READINESS','FSR_GL_CONTROLS_COMPLETE','FSR_POSTING_ROLES_MAPPED'),
                ('FIN_SETUP_READINESS','FSR_POSTING_ROLES_MAPPED','FSR_HOUSE_BANK_CONFIGURED'),
                ('FIN_SETUP_READINESS','FSR_HOUSE_BANK_CONFIGURED','FSR_BANK_ACCOUNT_LINKED'),
                ('FIN_SETUP_READINESS','FSR_BANK_ACCOUNT_LINKED','FSR_PAYMENT_METHODS_CONFIGURED'),
                ('FIN_SETUP_READINESS','FSR_PAYMENT_METHODS_CONFIGURED','FSR_TAX_GROUPS_VALID'),
                ('FIN_SETUP_READINESS','FSR_TAX_GROUPS_VALID','FSR_OPENING_BALANCE_CERTIFIED'),
                ('FIN_SETUP_READINESS','FSR_OPENING_BALANCE_CERTIFIED','FSR_PERIOD_0_CLOSED'),
                ('FIN_SETUP_READINESS','FSR_PERIOD_0_CLOSED','FSR_CURRENT_PERIOD_OPEN'),
                ('FIN_SETUP_READINESS','FSR_CURRENT_PERIOD_OPEN','FSR_TEST_JOURNAL_POSTED_REVERSED'),
                ('FIN_SETUP_READINESS','FSR_TEST_JOURNAL_POSTED_REVERSED','FSR_NO_CRITICAL_DEVIATIONS'),
                ('FIN_SETUP_READINESS','FSR_NO_CRITICAL_DEVIATIONS','FSR_FINAL_CERTIFICATION')
            ) AS d(type_code, predecessor_code, successor_code)
        LOOP
            SELECT id INTO v_type_id
              FROM control.cycle_type
             WHERE tenant_id = v_tid
               AND code = v_dep.type_code;

            SELECT id INTO v_pred_id
              FROM control.cycle_task_template
             WHERE tenant_id = v_tid
               AND entity_code = v_cc.code
               AND cycle_type_id = v_type_id
               AND code = v_dep.predecessor_code;

            SELECT id INTO v_succ_id
              FROM control.cycle_task_template
             WHERE tenant_id = v_tid
               AND entity_code = v_cc.code
               AND cycle_type_id = v_type_id
               AND code = v_dep.successor_code;

            IF v_pred_id IS NULL OR v_succ_id IS NULL THEN
                CONTINUE;
            END IF;

            INSERT INTO control.cycle_task_dependency (
                tenant_id, cycle_type_id,
                predecessor_template_id, successor_template_id,
                dependency_type, is_hard, status, created_by
            )
            VALUES (
                v_tid, v_type_id,
                v_pred_id, v_succ_id,
                'finish_to_start', true, 'active', v_sys
            )
            ON CONFLICT (tenant_id, cycle_type_id, predecessor_template_id, successor_template_id)
            DO UPDATE SET
                dependency_type = EXCLUDED.dependency_type,
                is_hard         = EXCLUDED.is_hard,
                status          = 'active',
                updated_at      = now(),
                updated_by      = v_sys
            WHERE (control.cycle_task_dependency.dependency_type,
                   control.cycle_task_dependency.is_hard,control.cycle_task_dependency.status)
              IS DISTINCT FROM (EXCLUDED.dependency_type,EXCLUDED.is_hard,EXCLUDED.status);
        END LOOP;
    END LOOP;

    FOR v_type IN
        SELECT id, code
          FROM control.cycle_type
         WHERE tenant_id = v_tid
           AND code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE','OPENING_BALANCE','FIN_SETUP_READINESS')
    LOOP
        IF v_type.code = 'MONTHLY_CLOSE' THEN
            INSERT INTO control.cycle_carryforward_rule (
                tenant_id, cycle_type_id, deviation_type, action,
                maximum_carry_count, escalate_after_carries, description,
                status, created_by
            )
            VALUES
                (v_tid, v_type.id, 'exception', 'auto_carry', 1, 1, 'Monthly exceptions may carry once with controller approval, then escalate.', 'active', v_sys),
                (v_tid, v_type.id, 'waiver',    'expire',     NULL, NULL, 'Waivers expire at close and must be re-approved in the next period.', 'active', v_sys),
                (v_tid, v_type.id, 'override',  'force_close',NULL, NULL, 'Overrides must be explicitly approved before the monthly soft close.', 'active', v_sys)
            ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO UPDATE SET
                action                 = EXCLUDED.action,
                maximum_carry_count        = EXCLUDED.maximum_carry_count,
                escalate_after_carries = EXCLUDED.escalate_after_carries,
                description            = EXCLUDED.description,
                status                 = 'active',
                updated_at             = now(),
                updated_by             = v_sys
            WHERE (control.cycle_carryforward_rule.action,control.cycle_carryforward_rule.maximum_carry_count,
                   control.cycle_carryforward_rule.escalate_after_carries,control.cycle_carryforward_rule.description,
                   control.cycle_carryforward_rule.status)
              IS DISTINCT FROM (EXCLUDED.action,EXCLUDED.maximum_carry_count,EXCLUDED.escalate_after_carries,
                                EXCLUDED.description,EXCLUDED.status);
        ELSIF v_type.code = 'YEAR_END_CLOSE' THEN
            INSERT INTO control.cycle_carryforward_rule (
                tenant_id, cycle_type_id, deviation_type, action,
                maximum_carry_count, escalate_after_carries, description,
                status, created_by
            )
            VALUES
                (v_tid, v_type.id, 'exception', 'force_close', NULL, NULL, 'Year-end exceptions require resolution or approved final treatment before hard close.', 'active', v_sys),
                (v_tid, v_type.id, 'waiver',    'expire',      NULL, NULL, 'Year-end waivers expire after final certification.', 'active', v_sys),
                (v_tid, v_type.id, 'override',  'force_close', NULL, NULL, 'Year-end overrides require controller and CFO approval before hard close.', 'active', v_sys)
            ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO UPDATE SET
                action                 = EXCLUDED.action,
                maximum_carry_count        = EXCLUDED.maximum_carry_count,
                escalate_after_carries = EXCLUDED.escalate_after_carries,
                description            = EXCLUDED.description,
                status                 = 'active',
                updated_at             = now(),
                updated_by             = v_sys
            WHERE (control.cycle_carryforward_rule.action,control.cycle_carryforward_rule.maximum_carry_count,
                   control.cycle_carryforward_rule.escalate_after_carries,control.cycle_carryforward_rule.description,
                   control.cycle_carryforward_rule.status)
              IS DISTINCT FROM (EXCLUDED.action,EXCLUDED.maximum_carry_count,EXCLUDED.escalate_after_carries,
                                EXCLUDED.description,EXCLUDED.status);
        ELSIF v_type.code = 'OPENING_BALANCE' THEN
            INSERT INTO control.cycle_carryforward_rule (
                tenant_id, cycle_type_id, deviation_type, action,
                maximum_carry_count, escalate_after_carries, description,
                status, created_by
            )
            VALUES
                (v_tid, v_type.id, 'exception', 'force_close', NULL, NULL, 'Opening-balance exceptions require resolution or approved final treatment before period 0 can hard close.', 'active', v_sys),
                (v_tid, v_type.id, 'waiver',    'expire',      NULL, NULL, 'Opening-balance waivers expire at final certification and cannot carry into normal periods.', 'active', v_sys),
                (v_tid, v_type.id, 'override',  'force_close', NULL, NULL, 'Opening-balance overrides require controller approval before final certification.', 'active', v_sys)
            ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO UPDATE SET
                action                 = EXCLUDED.action,
                maximum_carry_count        = EXCLUDED.maximum_carry_count,
                escalate_after_carries = EXCLUDED.escalate_after_carries,
                description            = EXCLUDED.description,
                status                 = 'active',
                updated_at             = now(),
                updated_by             = v_sys
            WHERE (control.cycle_carryforward_rule.action,control.cycle_carryforward_rule.maximum_carry_count,
                   control.cycle_carryforward_rule.escalate_after_carries,control.cycle_carryforward_rule.description,
                   control.cycle_carryforward_rule.status)
              IS DISTINCT FROM (EXCLUDED.action,EXCLUDED.maximum_carry_count,EXCLUDED.escalate_after_carries,
                                EXCLUDED.description,EXCLUDED.status);
        ELSE
            INSERT INTO control.cycle_carryforward_rule (
                tenant_id, cycle_type_id, deviation_type, action,
                maximum_carry_count, escalate_after_carries, description,
                status, created_by
            )
            VALUES
                (v_tid, v_type.id, 'exception', 'force_close', NULL, NULL, 'Posting-readiness exceptions must be resolved or rejected before certification.', 'active', v_sys),
                (v_tid, v_type.id, 'waiver',    'expire',      NULL, NULL, 'Posting-readiness waivers expire when the readiness cycle is completed.', 'active', v_sys),
                (v_tid, v_type.id, 'override',  'force_close', NULL, NULL, 'Posting-readiness overrides require controller approval before final certification.', 'active', v_sys)
            ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO UPDATE SET
                action                 = EXCLUDED.action,
                maximum_carry_count        = EXCLUDED.maximum_carry_count,
                escalate_after_carries = EXCLUDED.escalate_after_carries,
                description            = EXCLUDED.description,
                status                 = 'active',
                updated_at             = now(),
                updated_by             = v_sys
            WHERE (control.cycle_carryforward_rule.action,control.cycle_carryforward_rule.maximum_carry_count,
                   control.cycle_carryforward_rule.escalate_after_carries,control.cycle_carryforward_rule.description,
                   control.cycle_carryforward_rule.status)
              IS DISTINCT FROM (EXCLUDED.action,EXCLUDED.maximum_carry_count,EXCLUDED.escalate_after_carries,
                                EXCLUDED.description,EXCLUDED.status);
        END IF;
    END LOOP;

    RAISE NOTICE '[finance_close_governance] Seeded Finance Setup Readiness, Opening Balance, Monthly Close, and Year-End Close governance templates for tenant %, companies=%', v_tid, v_company_count;
END $seed_finance_close_governance$;






