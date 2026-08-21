DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'budget_transaction', 'budget_balance', 'planning_run', 'planning_output'
    ]
    LOOP
        EXECUTE format('ALTER TABLE ledger.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE ledger.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON ledger.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format(
            'CREATE POLICY seed_write ON ledger.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format(
                'CREATE POLICY admin_access ON ledger.%I FOR ALL TO athyperadmin '
                'USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE ledger.book_period_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.book_period_status FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON ledger.book_period_status
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON ledger.book_period_status
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cross_book_posting_execution','gl_balance','commitment_fulfillment','inventory_movement','inventory_balance',
        'inventory_valuation_layer','tax_calculation','tax_credit_movement',
        'asset_revaluation_reserve','fx_revaluation_line','ic_elimination_line'
    ] LOOP
        EXECUTE format('ALTER TABLE ledger.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE ledger.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON ledger.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON ledger.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;
