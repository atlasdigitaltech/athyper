-- seed-pack-version: p2.7-v1
DO $assert_meta_entity_p2_7$
DECLARE
    v_codes constant text[] := ARRAY[
        'business_partner', 'supplier', 'customer',
        'business_partner_identifier', 'address', 'address_link', 'contact_link'
    ];
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM metadata.entity
     WHERE tenant_id IS NULL
       AND ownership_model = 'package'
       AND entity_code = ANY(v_codes);
    IF v_count <> 7 THEN
        RAISE EXCEPTION '[meta-entity P2.7] expected seven package Entity identities, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM metadata.entity_release AS release
      JOIN metadata.entity AS entity ON entity.id = release.entity_id
     WHERE entity.entity_code = ANY(v_codes)
       AND release.release_no = 1
       AND release.release_kind = 'publish'
       AND release.version_label = '1.0.0';
    IF v_count <> 7 THEN
        RAISE EXCEPTION '[meta-entity P2.7] expected seven published baselines, found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (VALUES
            ('address', 21),
            ('business_partner', 23),
            ('supplier', 14),
            ('customer', 15),
            ('business_partner_identifier', 21),
            ('address_link', 16),
            ('contact_link', 20)
          ) AS expected(entity_code, field_count)
          LEFT JOIN metadata.entity AS entity
            ON entity.tenant_id IS NULL
           AND entity.entity_code = expected.entity_code
          LEFT JOIN metadata.entity_change_set AS change_set
            ON change_set.entity_id = entity.id
           AND change_set.change_set_code = 'p2_7_baseline'
         WHERE (SELECT count(*) FROM metadata.entity_field
                 WHERE change_set_id = change_set.id) <> expected.field_count
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] physical field coverage count drift detected';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_change_set AS change_set
          JOIN metadata.entity AS entity ON entity.id = change_set.entity_id
         WHERE entity.entity_code = 'business_partner'
           AND change_set.change_set_code = 'p2_7_studio_draft'
           AND change_set.status = 'draft'
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] editable Business Partner Studio draft is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_key AS entity_key
          JOIN metadata.entity_change_set AS change_set ON change_set.id = entity_key.change_set_id
          JOIN metadata.entity AS entity ON entity.id = change_set.entity_id
         WHERE entity.entity_code = 'business_partner_identifier'
           AND change_set.change_set_code = 'p2_7_baseline'
           AND entity_key.key_key = 'business_partner_identifier_identity'
           AND (SELECT count(*) FROM metadata.entity_key_field
                 WHERE entity_key_id = entity_key.id) = 3
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] composite identifier key coverage is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_relation AS relation
          JOIN metadata.entity_change_set AS change_set ON change_set.id = relation.change_set_id
          JOIN metadata.entity AS entity ON entity.id = change_set.entity_id
         WHERE entity.entity_code = 'business_partner_identifier'
           AND change_set.change_set_code = 'p2_7_baseline'
           AND relation.ownership_mode = 'aggregate_child'
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] aggregate-child relation coverage is missing';
    END IF;

    SELECT count(*) INTO v_count
      FROM metadata.entity_relation_target AS target
      JOIN metadata.entity_relation AS relation ON relation.id = target.entity_relation_id
      JOIN metadata.entity_change_set AS change_set ON change_set.id = relation.change_set_id
      JOIN metadata.entity AS entity ON entity.id = change_set.entity_id
     WHERE entity.entity_code IN ('address_link', 'contact_link')
       AND change_set.change_set_code = 'p2_7_baseline'
       AND relation.relation_key = 'owner';
    IF v_count <> 6 THEN
        RAISE EXCEPTION '[meta-entity P2.7] expected six polymorphic owner variants, found %', v_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_search_field AS search_field
          JOIN metadata.entity_search_profile AS search_profile
            ON search_profile.id = search_field.entity_search_profile_id
          JOIN metadata.entity_change_set AS change_set ON change_set.id = search_profile.change_set_id
          JOIN metadata.entity AS entity ON entity.id = change_set.entity_id
         WHERE entity.entity_code = 'contact_link'
           AND change_set.change_set_code = 'p2_7_baseline'
           AND search_field.weight = 10
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] weighted contact search coverage is missing';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM snapshot.entity_contract_revision AS revision
          JOIN metadata.entity AS entity ON entity.id = revision.entity_id
         WHERE entity.entity_code = ANY(v_codes)
           AND (
             revision.validation_status <> 'valid'
             OR revision.contract_json::text ~ '"(id|entity_field_id|source_field_id)"[[:space:]]*:'
           )
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] release contracts are invalid or leak authoring row identifiers';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_temp.meta_entity_seed_source AS source
          JOIN metadata.entity AS entity
            ON entity.tenant_id IS NULL
           AND entity.entity_code = source.entity_code
          JOIN metadata.entity_change_set AS change_set
            ON change_set.entity_id = entity.id
           AND change_set.change_set_code = 'p2_7_baseline'
          JOIN snapshot.entity_contract_revision AS revision
            ON revision.change_set_id = change_set.id
           AND revision.revision_no = 1
         WHERE revision.contract_json
               IS DISTINCT FROM pg_temp.meta_entity_release_contract(source.contract_json)
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] immutable release contract drift detected';
    END IF;

    IF (SELECT count(*) FROM authz.permission
         WHERE canonical_code IN (
           'metadata.entity.view', 'metadata.entity.author',
           'metadata.entity.review', 'metadata.entity.publish',
           'metadata.entity.rollback', 'metadata.entity.retire'
         ) AND status = 'published') <> 6 THEN
        RAISE EXCEPTION '[meta-entity P2.7] six published exact permissions are required';
    END IF;
END
$assert_meta_entity_p2_7$;
