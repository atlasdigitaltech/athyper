REVOKE ALL ON FUNCTION governance.command_link_business_partner_onboarding_subject(uuid,uuid,text,uuid,text,boolean,uuid) FROM PUBLIC;
DO $grant$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT EXECUTE ON FUNCTION governance.command_link_business_partner_onboarding_subject(uuid,uuid,text,uuid,text,boolean,uuid) TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION governance.command_link_business_partner_onboarding_subject(uuid,uuid,text,uuid,text,boolean,uuid) TO athyperadmin;
  END IF;
END $grant$;
REVOKE ALL ON FUNCTION governance.command_link_supplier_onboarding_work(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.command_link_supplier_onboarding_work(uuid,uuid,uuid,uuid) TO athyperapp,athyperadmin;
