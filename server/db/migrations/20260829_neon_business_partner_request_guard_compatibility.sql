-- Normalize the historical compact function body so the immutable validation
-- transition migration can perform its checksum-preserved semantic upgrade.
DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef('document.trg_guard_business_partner_request()'::regprocedure)
    INTO v_definition;

  IF position(
    'OLD.status NOT IN (''draft'', ''validating'', ''validation_failed'', ''returned'')'
    IN v_definition
  ) > 0 THEN
    RETURN;
  END IF;

  v_updated := replace(
    v_definition,
    'OLD.status NOT IN(''draft'',''validation_failed'',''returned'')',
    'OLD.status NOT IN (''draft'', ''validation_failed'', ''returned'')'
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Business Partner request guard has no supported pre-validation compatibility clause';
  END IF;
  EXECUTE v_updated;
END
$migration$;

DO $assertion$
DECLARE
  v_definition text := pg_get_functiondef('document.trg_guard_business_partner_request()'::regprocedure);
BEGIN
  IF position('OLD.status NOT IN (''draft'', ''validation_failed'', ''returned'')' IN v_definition) = 0
     AND position('OLD.status NOT IN (''draft'', ''validating'', ''validation_failed'', ''returned'')' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Business Partner request guard compatibility normalization was not installed';
  END IF;
END
$assertion$;
