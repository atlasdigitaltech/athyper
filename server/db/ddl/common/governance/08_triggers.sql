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

CREATE TRIGGER cycle_certification_approved_guard
BEFORE UPDATE OR DELETE ON governance.cycle_certification
FOR EACH ROW EXECUTE FUNCTION governance.trg_guard_approved_certification();

CREATE TRIGGER cycle_task_dependency_immutable
BEFORE UPDATE OR DELETE ON governance.cycle_task_dependency
FOR EACH ROW EXECUTE FUNCTION governance.trg_reject_cycle_dependency_mutation();

SELECT audit.install_schema_row_triggers('governance');

CREATE TRIGGER process_selection_evidence_immutable
BEFORE UPDATE OR DELETE ON governance.process_selection_evidence
FOR EACH ROW EXECUTE FUNCTION governance.trg_reject_process_selection_mutation();

CREATE TRIGGER process_attempt_immutable BEFORE UPDATE OR DELETE ON governance.process_attempt
 FOR EACH ROW EXECUTE FUNCTION governance.trg_reject_process_selection_mutation();
CREATE TRIGGER process_task_document_gate BEFORE INSERT OR UPDATE ON governance.cycle_task
 FOR EACH ROW EXECUTE FUNCTION governance.trg_process_task_document_gate();
CREATE TRIGGER process_attempt_coordinate BEFORE INSERT ON governance.process_attempt
 FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_process_attempt();

CREATE TRIGGER process_document_intent_binding BEFORE INSERT ON governance.process_document_job
 FOR EACH ROW EXECUTE FUNCTION governance.trg_validate_process_document_intent();
CREATE TRIGGER cycle_completion_structure BEFORE UPDATE OF status ON governance.cycle_run FOR EACH ROW EXECUTE FUNCTION governance.trg_cycle_completion_structure();
