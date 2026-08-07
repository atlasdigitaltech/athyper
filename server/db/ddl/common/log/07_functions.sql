CREATE OR REPLACE FUNCTION log.trg_guard_notification_delivery_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'log.notification_delivery_attempt is append-mostly; use purge_after for retention' USING ERRCODE = '55000';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['is_redacted','redaction_version','purge_after'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['is_redacted','redaction_version','purge_after']) THEN
        RAISE EXCEPTION 'only notification delivery redaction fields may be updated' USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION log.trg_guard_notification_dlq()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'log.notification_dlq is append-mostly' USING ERRCODE = '55000';
    END IF;
    IF OLD.retried_at IS NOT NULL
       OR (to_jsonb(NEW) - ARRAY['retried_at','retried_job_id'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['retried_at','retried_job_id']) THEN
        RAISE EXCEPTION 'only the initial notification DLQ retry marker may be updated' USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;
