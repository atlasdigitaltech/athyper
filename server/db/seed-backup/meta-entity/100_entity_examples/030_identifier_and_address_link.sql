-- seed-pack-version: p2.7-v1
SELECT pg_temp.seed_meta_entity_graph(
    'business_partner_identifier',
    'business',
    pg_temp.meta_master_contract(
        'business_partner_identifier',
        $json$[
          {"field_key":"business_partner_id","description":"Owning business partner aggregate root.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"business_partner_id"},
          {"field_key":"effective_until","description":"Last date on which the identifier is effective.","data_type":"date","type_config":{"kind":"date"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"effective_until"},
          {"field_key":"identifier_value","description":"Identifier value within the selected scheme.","data_type":"string","type_config":{"kind":"string","min_length":1,"max_length":256},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"identifier_value"},
          {"field_key":"is_primary","description":"Whether this is the primary identifier for its scheme.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"is_primary","default_spec":{"kind":"static","value":false,"apply_on":["create"]}},
          {"field_key":"issued_at","description":"Identifier issue date.","data_type":"date","type_config":{"kind":"date"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"issued_at"},
          {"field_key":"issuing_authority","description":"Authority that issued the identifier.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"issuing_authority"},
          {"field_key":"issuing_country_code","description":"Country of the issuing authority.","data_type":"string","type_config":{"kind":"string","max_length":2,"pattern":"^[A-Z]{2}$"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"issuing_country_code"},
          {"field_key":"scheme_code","description":"Canonical identifier scheme.","data_type":"string","type_config":{"kind":"string","min_length":2,"max_length":63,"pattern":"^[a-z][a-z0-9_.-]{1,62}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"scheme_code"},
          {"field_key":"verified_at","description":"Timestamp of verification evidence.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"verified_at"},
          {"field_key":"verified_by","description":"Principal that verified the identifier.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"verified_by"}
        ]$json$::jsonb,
        $json$[
          {"key_key":"business_partner_identifier_identity","key_kind":"alternate","uniqueness_scope":"tenant","null_semantics":"not_allowed","fields":[
            {"field_key":"business_partner_id","position":1},
            {"field_key":"scheme_code","position":2},
            {"field_key":"identifier_value","position":3}
          ]},
          {"key_key":"business_partner_identifier_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        $json$[
          {"search_key":"identifier_lookup","search_kind":"keyword","query_operator":"and","minimum_query_length":2,"language_code":null,"normalization_mode":"casefold","is_default":true,"fields":[
            {"field_key":"identifier_value","position":1,"match_mode":"prefix","weight":10},
            {"field_key":"scheme_code","position":2,"match_mode":"exact","weight":6},
            {"field_key":"issuing_authority","position":3,"match_mode":"contains","weight":3}
          ]}
        ]$json$::jsonb,
        $json$[
          {"relation_key":"business_partner","relation_kind":"many_to_one","resolution_kind":"foreign_key","ownership_mode":"aggregate_child","mutation_mode":"source_owned","on_delete":"restrict","on_update":"restrict","inverse_relation_key":"identifiers","targets":[
            {"relation_target_key":"business_partner","target_entity_code":"business_partner","target_key_key":"business_partner_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"business_partner_id","target_field_key":"id","position":1}]}
          ]}
        ]$json$::jsonb,
        'master.partner_extension_status_d',
        'draft'
    )
);

SELECT pg_temp.seed_meta_entity_graph(
    'address_link',
    'business',
    pg_temp.meta_master_contract(
        'address_link',
        $json$[
          {"field_key":"address_id","description":"Linked canonical address.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"address_id"},
          {"field_key":"attention_line","description":"Addressee or attention line.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"attention_line"},
          {"field_key":"effective_from","description":"First effective date.","data_type":"date","type_config":{"kind":"date"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"effective_from","default_spec":{"kind":"current_date","apply_on":["create"]}},
          {"field_key":"effective_until","description":"Exclusive end date.","data_type":"date","type_config":{"kind":"date"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"effective_until"},
          {"field_key":"is_primary","description":"Primary address for this owner and purpose.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"is_primary","default_spec":{"kind":"static","value":false,"apply_on":["create"]}},
          {"field_key":"owner_id","description":"Identifier of the polymorphic owner.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"owner_id"},
          {"field_key":"owner_type_id","description":"Canonical owner-type discriminator coordinate.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"owner_type_id"},
          {"field_key":"purpose","description":"Business purpose of the address link.","data_type":"string","type_config":{"kind":"string","min_length":2,"max_length":63,"pattern":"^[a-z][a-z0-9_]{1,62}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"purpose","default_spec":{"kind":"static","value":"default","apply_on":["create"]}},
          {"field_key":"role_qualifier","description":"Optional role qualifier within a purpose.","data_type":"string","type_config":{"kind":"string","max_length":128},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"write_once","storage_path":"role_qualifier"}
        ]$json$::jsonb,
        $json$[
          {"key_key":"address_link_identity","key_kind":"alternate","uniqueness_scope":"tenant","null_semantics":"nulls_not_distinct","fields":[
            {"field_key":"owner_type_id","position":1},
            {"field_key":"owner_id","position":2},
            {"field_key":"purpose","position":3},
            {"field_key":"role_qualifier","position":4},
            {"field_key":"address_id","position":5}
          ]},
          {"key_key":"address_link_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        '[]'::jsonb,
        $json$[
          {"relation_key":"address","relation_kind":"many_to_one","resolution_kind":"foreign_key","ownership_mode":"shared","mutation_mode":"read_only","on_delete":"restrict","on_update":"restrict","inverse_relation_key":"address_links","targets":[
            {"relation_target_key":"address","target_entity_code":"address","target_key_key":"address_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"address_id","target_field_key":"id","position":1}]}
          ]},
          {"relation_key":"owner","relation_kind":"many_to_one","resolution_kind":"polymorphic","ownership_mode":"shared","mutation_mode":"read_only","on_delete":"restrict","on_update":"restrict","inverse_relation_key":null,"targets":[
            {"relation_target_key":"business_partner","target_entity_code":"business_partner","target_key_key":"business_partner_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"owner_id","target_field_key":"id","position":1}]},
            {"relation_target_key":"customer","target_entity_code":"customer","target_key_key":"customer_pk","discriminator_value":"customer","is_default":false,"fields":[{"source_field_key":"owner_id","target_field_key":"id","position":1}]},
            {"relation_target_key":"supplier","target_entity_code":"supplier","target_key_key":"supplier_pk","discriminator_value":"supplier","is_default":false,"fields":[{"source_field_key":"owner_id","target_field_key":"id","position":1}]}
          ]}
        ]$json$::jsonb
    )
);
