CREATE OR REPLACE FUNCTION master.guard_organization_tax_registration_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.company_code_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.company_code company
         WHERE company.tenant_id=NEW.tenant_id AND company.id=NEW.company_code_id
           AND company.legal_entity_id=NEW.legal_entity_id
    ) THEN
        RAISE EXCEPTION 'Organization Tax Registration Company must belong to its Legal Entity and Tenant'
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $$;

