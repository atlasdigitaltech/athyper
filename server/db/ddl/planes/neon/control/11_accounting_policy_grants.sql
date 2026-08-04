REVOKE ALL ON
    control.accounting_profile_policy,
    control.accounting_profile_event,
    control.accounting_profile_entry,
    control.accounting_profile_assignment,
    control.posting_role_account_assignment,
    control.cross_book_posting_policy,
    control.cross_book_account_assignment
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    control.trg_guard_accounting_policy_row(),
    control.trg_validate_accounting_profile_policy(),
    control.trg_guard_accounting_profile_event(),
    control.trg_guard_accounting_profile_entry(),
    control.trg_validate_accounting_profile_assignment(),
    control.trg_validate_posting_role_account_assignment(),
    control.trg_validate_cross_book_posting_policy(),
    control.trg_guard_cross_book_account_assignment(),
    control.resolve_accounting_profile_policy(uuid, uuid, text, text, date),
    control.resolve_posting_role_account(uuid, uuid, text, date)
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.accounting_profile_policy,
            control.accounting_profile_event,
            control.accounting_profile_entry,
            control.accounting_profile_assignment,
            control.posting_role_account_assignment,
            control.cross_book_posting_policy,
            control.cross_book_account_assignment
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            control.resolve_accounting_profile_policy(uuid, uuid, text, text, date),
            control.resolve_posting_role_account(uuid, uuid, text, date)
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.accounting_profile_policy,
            control.accounting_profile_event,
            control.accounting_profile_entry,
            control.accounting_profile_assignment,
            control.posting_role_account_assignment,
            control.cross_book_posting_policy,
            control.cross_book_account_assignment
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            control.resolve_accounting_profile_policy(uuid, uuid, text, text, date),
            control.resolve_posting_role_account(uuid, uuid, text, date)
        TO athyperadmin;
    END IF;
END;
$$;
