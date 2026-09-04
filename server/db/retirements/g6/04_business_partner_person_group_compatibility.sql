-- Inactive G6 surface migration. Apply only through the signed incremental-retirement runner.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM master.business_partner WHERE partner_category IN('person','group')) THEN RAISE EXCEPTION 'historical person/group Business Partners remain'; END IF;IF EXISTS(SELECT 1 FROM master.person_business_partner_legacy_link) THEN RAISE EXCEPTION 'legacy Person/Business Partner coordinates remain'; END IF;END $$;
DROP TABLE master.person_business_partner_legacy_link;
DROP FUNCTION IF EXISTS master.trg_reject_person_business_partner_legacy_link_mutation();
ALTER DOMAIN master.business_partner_category_d DROP CONSTRAINT business_partner_category_d_check;
ALTER DOMAIN master.business_partner_category_d ADD CONSTRAINT business_partner_category_d_check CHECK(VALUE='organization');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM master.business_partner WHERE partner_category<>'organization') THEN RAISE EXCEPTION 'organization-only authority validation failed'; END IF;END $$;
