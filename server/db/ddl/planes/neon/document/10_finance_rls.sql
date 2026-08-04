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

