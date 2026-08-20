-- seed-pack-version: p2.7-v1
-- Insert every stable identity before graph construction so polymorphic and
-- normal relation targets resolve without ordering tricks.
DO $seed_meta_entity_identities$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_module_id uuid;
BEGIN
    SELECT id INTO v_module_id FROM control.module WHERE lower(code) = 'meta';
    IF v_module_id IS NULL THEN
        RAISE EXCEPTION '[meta-entity P2.7] prerequisite control.module META is missing';
    END IF;

    INSERT INTO metadata.entity (
        id, tenant_id, module_id, entity_code, entity_class,
        ownership_model, status, created_by
    )
    SELECT
        pg_temp.meta_entity_seed_id('entity:' || seed.entity_code),
        NULL, v_module_id, seed.entity_code, seed.entity_class::metadata.entity_class_d,
        'package', 'draft', v_actor
    FROM (VALUES
        ('address', 'reference'),
        ('business_partner', 'business'),
        ('supplier', 'business'),
        ('customer', 'business'),
        ('business_partner_identifier', 'business'),
        ('address_link', 'business'),
        ('contact_link', 'business')
    ) AS seed(entity_code, entity_class)
    ON CONFLICT (tenant_id, entity_code) DO NOTHING;

    IF (SELECT count(*) FROM metadata.entity
         WHERE tenant_id IS NULL
           AND ownership_model = 'package'
           AND entity_code IN (
             'address', 'business_partner', 'supplier', 'customer',
             'business_partner_identifier', 'address_link', 'contact_link'
           )) <> 7 THEN
        RAISE EXCEPTION '[meta-entity P2.7] canonical example identity graph is incomplete';
    END IF;
END
$seed_meta_entity_identities$;
