-- Idempotent upgrade for databases created before fiscal calendar Stage 1.
ALTER TABLE master.fiscal_period
    ADD COLUMN IF NOT EXISTS fiscal_calendar_config_id uuid,
    ADD COLUMN IF NOT EXISTS calendar_version_no integer,
    ADD COLUMN IF NOT EXISTS generation_key text,
    ADD COLUMN IF NOT EXISTS generated_at timestamptz;

DO $$
DECLARE
    v_expression text;
BEGIN
    SELECT pg_get_expr(ad.adbin, ad.adrelid)
      INTO v_expression
      FROM pg_attribute a
      JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE a.attrelid = 'master.fiscal_period'::regclass
       AND a.attname = 'is_adjustment';

    IF v_expression IS DISTINCT FROM '(period_type = ''adjustment''::text)' THEN
        ALTER TABLE master.fiscal_period DROP COLUMN is_adjustment;
        ALTER TABLE master.fiscal_period
            ADD COLUMN is_adjustment boolean
            GENERATED ALWAYS AS (period_type = 'adjustment') STORED;
    END IF;
END $$;
