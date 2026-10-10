-- Retire the unused Business Partner Studio publication/history path.
-- Native Entity publication remains the only active Entity source path.
DO $retire$
DECLARE relation text; populated boolean;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'publication.business_partner_case_contract_release_link',
    'publication.business_partner_definition_release_link',
    'snapshot.business_partner_case_contract_revision',
    'snapshot.business_partner_definition_revision'
  ] LOOP
    IF to_regclass(relation) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', relation);
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s)', relation) INTO populated;
      IF populated THEN
        RAISE EXCEPTION 'BUSINESS_PARTNER_STUDIO_RETIREMENT_REQUIRES_EMPTY_TABLE: %', relation;
      END IF;
    END IF;
  END LOOP;
END $retire$;

DROP TABLE IF EXISTS publication.business_partner_case_contract_release_link;
DROP TABLE IF EXISTS publication.business_partner_definition_release_link;
DROP TABLE IF EXISTS snapshot.business_partner_case_contract_revision;
DROP TABLE IF EXISTS snapshot.business_partner_definition_revision;
DROP FUNCTION IF EXISTS publication.trg_validate_business_partner_definition_release_link();
DROP FUNCTION IF EXISTS snapshot.trg_guard_business_partner_definition_revision();
DROP FUNCTION IF EXISTS snapshot.trg_reject_case_contract_mutation();
