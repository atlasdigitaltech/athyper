-- Allow the append-only validation command to finalize its review summaries
-- while the aggregate is in its transient validating state.
DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef('document.trg_guard_business_partner_request()'::regprocedure)
    INTO v_definition;
  v_updated := replace(
    v_definition,
    'OLD.status NOT IN (''draft'', ''validation_failed'', ''returned'')',
    'OLD.status NOT IN (''draft'', ''validating'', ''validation_failed'', ''returned'')'
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Business Partner request guard did not contain the expected pre-validation immutability clause';
  END IF;
  EXECUTE v_updated;
END
$migration$;

DO $assertion$
BEGIN
  IF position(
    'OLD.status NOT IN (''draft'', ''validating'', ''validation_failed'', ''returned'')'
    IN pg_get_functiondef('document.trg_guard_business_partner_request()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'Business Partner validation transition guard was not installed';
  END IF;
END
$assertion$;
