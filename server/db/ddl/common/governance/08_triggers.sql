DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'comment_moderation','cycle_run','cycle_task','legal_hold','report_pack'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON governance.%I '
            'FOR EACH ROW EXECUTE FUNCTION governance.trg_guard_identity()',
            v_table || '_identity_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON governance.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['comment_moderation','cycle_run','cycle_task','legal_hold']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON governance.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER channel_consent_projection_guard
BEFORE UPDATE ON governance.channel_consent
FOR EACH ROW EXECUTE FUNCTION governance.trg_guard_channel_consent_projection();
