-- Late-bound cross-schema FKs for shared lookup references.
-- Added after all schema bootstrap/DDL to avoid phase-order race against
-- control.lookup_domain creation and unique-key registration.

DO $$
DECLARE
  v_code_attnum int;
BEGIN
  IF to_regclass('control.lookup_domain'::text) IS NULL THEN
    RAISE EXCEPTION 'control.lookup_domain table not yet available for shared lookup-domain FK creation';
  END IF;

  SELECT attnum
    INTO v_code_attnum
    FROM pg_attribute
   WHERE attrelid = 'control.lookup_domain'::regclass
     AND attname = 'code'
     AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'control.lookup_domain'::regclass
       AND c.contype = 'u'
       AND c.conkey = ARRAY[v_code_attnum]
  ) THEN
    RAISE EXCEPTION 'control.lookup_domain does not yet have UNIQUE(code); cannot enforce shared lookup-domain FKs';
  END IF;

  ALTER TABLE shared.commodity_code
    ADD CONSTRAINT fk_commodity_code_domain
    FOREIGN KEY (domain_code)
    REFERENCES control.lookup_domain (code)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
  v_code_attnum int;
BEGIN
  IF to_regclass('control.lookup_domain'::text) IS NULL THEN
    RAISE EXCEPTION 'control.lookup_domain table not yet available for shared lookup-domain FK creation';
  END IF;

  SELECT attnum
    INTO v_code_attnum
    FROM pg_attribute
   WHERE attrelid = 'control.lookup_domain'::regclass
     AND attname = 'code'
     AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'control.lookup_domain'::regclass
       AND c.contype = 'u'
       AND c.conkey = ARRAY[v_code_attnum]
  ) THEN
    RAISE EXCEPTION 'control.lookup_domain does not yet have UNIQUE(code); cannot enforce shared lookup-domain FKs';
  END IF;

  ALTER TABLE shared.industry_code
    ADD CONSTRAINT fk_industry_code_domain
    FOREIGN KEY (domain_code)
    REFERENCES control.lookup_domain (code)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
