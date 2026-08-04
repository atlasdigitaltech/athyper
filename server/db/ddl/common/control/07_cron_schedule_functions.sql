CREATE OR REPLACE FUNCTION control.fn_cron_schedules_for_scheduler()
RETURNS SETOF control.cron_schedule
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
    SELECT * FROM control.cron_schedule
    WHERE is_enabled
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_until IS NULL OR effective_until > now())
    ORDER BY tenant_id NULLS FIRST, code
$$;
