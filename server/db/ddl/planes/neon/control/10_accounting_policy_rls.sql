DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'accounting_profile_policy',
        'accounting_profile_event',
        'accounting_profile_entry',
        'accounting_profile_assignment',
        'posting_role_account_assignment',
        'cross_book_posting_policy',
        'cross_book_account_assignment'
    ] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL USING '
            || '(tenant_id = shared.current_tenant_id_soft()) WITH CHECK '
            || '(tenant_id = shared.current_tenant_id())',
            v_table || '_tenant_access', v_table
        );
        EXECUTE format(
            'CREATE POLICY %I ON control.%I FOR ALL TO CURRENT_USER '
            || 'USING (true) WITH CHECK (true)',
            v_table || '_foundation_owner_access', v_table
        );
    END LOOP;
END;
$$;
