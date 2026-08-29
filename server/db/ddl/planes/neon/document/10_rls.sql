ALTER TABLE document.attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_quota_reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_folder ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_folder FORCE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_link FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_draft FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_feed_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_feed_cursor FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_mention ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_mention FORCE ROW LEVEL SECURITY;
ALTER TABLE document.comment_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_reaction FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_item FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_link FORCE ROW LEVEL SECURITY;
ALTER TABLE document.conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.conversation FORCE ROW LEVEL SECURITY;
ALTER TABLE document.conversation_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.conversation_participant FORCE ROW LEVEL SECURITY;
ALTER TABLE document.multipart_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.multipart_upload FORCE ROW LEVEL SECURITY;
ALTER TABLE snapshot.content_item_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.content_item_version FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_access_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_item_access_grant FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.content_quota_reservation FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON document.attachment
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON document.attachment_quota_usage FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_quota_usage FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON document.attachment_quota_reservation FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_quota_reservation FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.attachment_folder
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_folder
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.attachment_link
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_link
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY comment_read ON document.comment
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            visibility <> 'private'
            OR commenter_id = master.current_principal_id_soft()
        )
    );
CREATE POLICY comment_insert ON document.comment
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND commenter_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY comment_update ON document.comment
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND commenter_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND commenter_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_access ON document.comment_draft
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_draft
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_access ON document.comment_feed_cursor
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_feed_cursor
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON document.comment_mention
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY author_write ON document.comment_mention
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND created_by = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_mention
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON document.comment_reaction
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY principal_write ON document.comment_reaction
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.comment_reaction
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.content_item
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.content_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON document.content_item_link
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.content_item_link
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_read ON document.conversation
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            created_by = master.current_principal_id_soft()
            OR EXISTS (
                SELECT 1
                  FROM document.conversation_participant cp
                 WHERE cp.tenant_id = conversation.tenant_id
                   AND cp.conversation_id = conversation.id
                   AND cp.principal_id = master.current_principal_id_soft()
                   AND cp.left_at IS NULL
            )
        )
    );
CREATE POLICY creator_insert ON document.conversation
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY owner_update ON document.conversation
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND (
            created_by = master.current_principal_id_soft()
            OR EXISTS (
                SELECT 1
                  FROM document.conversation_participant cp
                 WHERE cp.tenant_id = conversation.tenant_id
                   AND cp.conversation_id = conversation.id
                   AND cp.principal_id = master.current_principal_id_soft()
                   AND cp.role IN ('owner', 'admin')
                   AND cp.left_at IS NULL
            )
        )
    )
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.conversation
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_read ON document.conversation_participant
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY participant_insert ON document.conversation_participant
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY participant_update ON document.conversation_participant
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.conversation_participant
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY principal_access ON document.multipart_upload
    FOR ALL
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND initiated_by = master.current_principal_id_soft()
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND initiated_by = master.current_principal_id_soft()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.multipart_upload
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY tenant_read ON snapshot.content_item_version
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON snapshot.content_item_version
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND created_by = master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON snapshot.content_item_version
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'attachment', 'attachment_folder', 'attachment_link',
            'comment', 'comment_draft', 'comment_feed_cursor',
            'comment_mention', 'comment_reaction',
            'content_item', 'content_item_link',
            'conversation', 'conversation_participant', 'multipart_upload'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;

        CREATE POLICY admin_access ON snapshot.content_item_version
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END;
$$;

ALTER TABLE document.supplier_registration_invitation_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.supplier_registration_invitation_legacy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.supplier_registration_invitation_legacy
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.supplier_registration_invitation_legacy
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- supplier_registration_invitation FORCE ROW LEVEL SECURITY compatibility is
-- provided by its security-invoker view over this forced-RLS base relation.
ALTER TABLE document.business_partner_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation FORCE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation_applicant_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation_applicant_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_invitation_recovery FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_invitation FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_write ON document.business_partner_invitation_applicant_policy FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id() AND applicant_principal_id=master.current_principal_id_soft());
CREATE POLICY tenant_update ON document.business_partner_invitation_applicant_policy FOR UPDATE USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY applicant_owned_read ON document.business_partner_invitation_applicant_policy FOR SELECT USING(tenant_id=shared.current_tenant_id_soft() AND applicant_principal_id=master.current_principal_id_soft());
CREATE POLICY tenant_access ON document.business_partner_invitation_recovery FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_invitation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY seed_write ON document.business_partner_invitation_applicant_policy FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY seed_write ON document.business_partner_invitation_recovery FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

ALTER TABLE document.business_partner_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_request
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_request
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE document.business_partner_request_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.business_partner_request_evidence
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.business_partner_request_evidence
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_request_evidence
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE document.business_partner_request_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request_validation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.business_partner_request_validation
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.business_partner_request_validation
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_request_validation
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'workflow_request','workflow_stage',
        'commitment','commitment_line','commitment_release_allocation',
        'purchase_invoice','purchase_invoice_line','invoice_match_case',
        'accounting_distribution','payment_term_application',
        'payment_entry','payment_entry_allocation',
        'journal_entry','journal_line','journal_line_reference'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END $$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'purchase_requisition','purchase_requisition_line',
        'purchase_order_confirmation','purchase_order_confirmation_line',
        'delivery_note','delivery_note_line',
        'receipt','receipt_line','service_sheet','service_sheet_line'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format('CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END $$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['pricing_component','schedule_line'] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END $$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'catalog_import', 'catalog_import_line',
        'punchout_cart', 'punchout_cart_line',
        'production_order', 'production_order_component',
        'sales_order', 'sales_order_line'
    ]
    LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'catalog_import', 'catalog_import_line',
            'punchout_cart', 'punchout_cart_line',
            'production_order', 'production_order_component',
            'sales_order', 'sales_order_line'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'stocktake', 'stocktake_line',
        'sales_opportunity', 'sales_opportunity_company',
        'sales_quotation', 'sales_quotation_company',
        'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table
        );
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'stocktake', 'stocktake_line',
            'sales_opportunity', 'sales_opportunity_company',
            'sales_quotation', 'sales_quotation_company',
            'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
        ] LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table
            );
        END LOOP;
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case','bank_recon_case_line',
        'depreciation_run','depreciation_run_line','depreciation_schedule'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id=shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id=shared.current_tenant_id())',v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',v_table
        );
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'bank_statement','bank_statement_line','bank_recon_case','bank_recon_case_line',
            'depreciation_run','depreciation_run_line','depreciation_schedule'
        ] LOOP
            EXECUTE format('CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',v_table);
        END LOOP;
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'sourcing_event','sourcing_event_company','sourcing_event_demand',
        'sourcing_event_award','sourcing_event_award_allocation',
        'sourcing_event_intercompany_allocation'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id=shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id=shared.current_tenant_id())',v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',v_table
        );
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'sourcing_event','sourcing_event_company','sourcing_event_demand',
            'sourcing_event_award','sourcing_event_award_allocation',
            'sourcing_event_intercompany_allocation'
        ] LOOP
            EXECUTE format('CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',v_table);
        END LOOP;
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
        'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
        'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
        'payroll_result','payroll_result_line'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
        EXECUTE format('CREATE POLICY tenant_access ON document.%I FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id())',v_table);
        EXECUTE format('CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true)',v_table);
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'shift_assignment','time_punch','attendance_day','attendance_adjustment_request','compensation_change',
            'employee_tax_declaration','employee_tax_declaration_line','leave_request','leave_balance_entry','people_request',
            'hr_case','onboarding_case','offboarding_case','payroll_period','payroll_run','payroll_run_employee',
            'payroll_result','payroll_result_line'
        ] LOOP EXECUTE format('CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING(true) WITH CHECK(true)',v_table); END LOOP;
    END IF;
END;
$$;

ALTER TABLE document.policy_acknowledgment ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.policy_acknowledgment FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON document.policy_acknowledgment FOR SELECT
    USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY principal_insert ON document.policy_acknowledgment FOR INSERT
    WITH CHECK(
        tenant_id=shared.current_tenant_id()
        AND acknowledged_by=master.current_principal_id_soft()
        AND created_by=master.current_principal_id_soft()
    );
CREATE POLICY seed_write ON document.policy_acknowledgment FOR ALL TO CURRENT_USER
    USING(true) WITH CHECK(true);

DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        EXECUTE 'CREATE POLICY admin_access ON document.policy_acknowledgment FOR ALL TO athyperadmin USING(true) WITH CHECK(true)';
    END IF;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'project_task', 'project_task_requirement', 'budget_profile', 'budget_allocation'
    ]
    LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE document.planning_scenario ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.planning_scenario FORCE ROW LEVEL SECURITY;
ALTER TABLE document.planning_scenario_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.planning_scenario_line FORCE ROW LEVEL SECURITY;

CREATE POLICY planning_scenario_tenant_access
    ON document.planning_scenario FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY planning_scenario_seed_write
    ON document.planning_scenario FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY planning_scenario_line_tenant_access
    ON document.planning_scenario_line FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY planning_scenario_line_seed_write
    ON document.planning_scenario_line FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_transaction','fx_revaluation_run','ic_elimination','match_exception',
        'netting_batch','obligation_horizon','payment_remittance_output',
        'payment_term_discount_result','wht_certificate','import_request',
        'import_request_chunk','intercompany_agreement','intercompany_transaction','render_output',
        'user_profile_update_request'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY',v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY',v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON document.%I FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END $$;

ALTER TABLE document.attachment_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_series FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.attachment_series
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_series
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Legal hold: no DELETE policy for application role
ALTER TABLE document.attachment_legal_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_legal_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.attachment_legal_hold
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.attachment_legal_hold
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.attachment_legal_hold
    FOR UPDATE
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_legal_hold
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Legal hold event: append-only
ALTER TABLE document.attachment_legal_hold_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_legal_hold_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.attachment_legal_hold_event
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.attachment_legal_hold_event
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_legal_hold_event
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE document.attachment_derivative ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.attachment_derivative FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.attachment_derivative
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.attachment_derivative
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Multipart upload part: append-only per tenant
ALTER TABLE document.multipart_upload_part ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.multipart_upload_part FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.multipart_upload_part
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.multipart_upload_part
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.multipart_upload_part
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY[
            'attachment_series', 'attachment_legal_hold', 'attachment_legal_hold_event',
            'attachment_derivative', 'multipart_upload_part'
        ]
        LOOP
            EXECUTE format(
                'CREATE POLICY admin_access ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)',
                v_table
            );
        END LOOP;
    END IF;
END;
$$;
CREATE POLICY tenant_access ON document.content_item_access_grant FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_access ON document.content_quota_usage FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_access ON document.content_quota_reservation FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
ALTER TABLE document.mesh_business_partner_match ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.mesh_business_partner_match FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.mesh_business_partner_match FOR SELECT USING (tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.mesh_business_partner_match FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.mesh_business_partner_match FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
ALTER TABLE document.mesh_business_partner_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.mesh_business_partner_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.mesh_business_partner_acceptance FOR SELECT USING (tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.mesh_business_partner_acceptance FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.mesh_business_partner_acceptance FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
ALTER TABLE document.mesh_business_partner_acceptance_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.mesh_business_partner_acceptance_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.mesh_business_partner_acceptance_event FOR SELECT USING (tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.mesh_business_partner_acceptance_event FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.mesh_business_partner_acceptance_event FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
ALTER TABLE document.business_partner_bank_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_bank_verification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_bank_verification USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_bank_verification FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.business_partner_duplicate_resolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_duplicate_resolution FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_duplicate_resolution USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_duplicate_resolution FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.supplier_activation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.supplier_activation_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.supplier_activation_evidence USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.supplier_activation_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.supplier_registration_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.supplier_registration_recovery FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.supplier_registration_recovery USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.supplier_registration_recovery FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
