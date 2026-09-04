-- Inactive G6 surface migration. Apply only through the signed incremental-retirement runner.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM master.business_partner bp WHERE bp.aliases IS DISTINCT FROM COALESCE((SELECT array_agg(a.alias_name ORDER BY a.is_primary DESC,a.alias_name) FROM master.business_partner_alias a WHERE a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND(a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)),'{}'::text[])) THEN RAISE EXCEPTION 'aliases cache differs from normalized authority'; END IF;
END $$;
DO $$
DECLARE
  definition text;
  aliases_expression text := 'COALESCE((SELECT array_agg(retired_alias.alias_name ORDER BY retired_alias.is_primary DESC,retired_alias.alias_name) FROM master.business_partner_alias retired_alias WHERE retired_alias.tenant_id=bp.tenant_id AND retired_alias.business_partner_id=bp.id AND retired_alias.status=''active'' AND retired_alias.effective_from<=CURRENT_DATE AND(retired_alias.effective_until IS NULL OR retired_alias.effective_until>CURRENT_DATE)),''{}''::text[])';
BEGIN
  IF to_regclass('master.v_business_partner_app_index') IS NOT NULL THEN
    definition:=pg_get_viewdef('master.v_business_partner_app_index'::regclass,true);
    definition:=replace(definition,E'    bp.aliases,\n',E'    '||aliases_expression||E' AS aliases,\n');
    definition:=replace(definition,'array_to_string(bp.aliases, '' ''::text)','array_to_string('||aliases_expression||', '' ''::text)');
    IF position('bp.aliases' in definition)>0 THEN
      RAISE EXCEPTION 'application index could not be detached from aliases cache';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW master.v_business_partner_app_index WITH(security_invoker=true,security_barrier=true) AS '||definition;
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_business_partner_alias_cache_guard ON master.business_partner;
DROP TRIGGER IF EXISTS trg_business_partner_alias_cache_refresh ON master.business_partner_alias;
DROP FUNCTION IF EXISTS master.trg_guard_business_partner_alias_cache();
DROP FUNCTION IF EXISTS master.trg_refresh_business_partner_alias_cache();
ALTER TABLE master.business_partner DROP COLUMN aliases;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='master' AND table_name='business_partner' AND column_name='aliases') THEN RAISE EXCEPTION 'aliases cache retirement failed'; END IF; END $$;
