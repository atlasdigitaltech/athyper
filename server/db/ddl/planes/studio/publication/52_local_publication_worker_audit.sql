-- Worker publication uses the canonical append-only audit function, not direct tables.
GRANT USAGE ON SCHEMA audit TO athyper_worker;
GRANT EXECUTE ON FUNCTION audit.append_event(text,audit.operation_d,text,uuid,audit.outcome_d,audit.event_severity_d,text,uuid,uuid,text,jsonb,jsonb,text[],jsonb,uuid,text,timestamptz) TO athyper_worker;
