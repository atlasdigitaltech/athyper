-- seed-pack-version: p2.7-v1
SELECT pg_temp.seed_meta_entity_graph(
    'address',
    'reference',
    pg_temp.meta_master_contract(
        'address',
        $json$[
          {"field_key":"address_type","description":"Business use classification for the address.","data_type":"string","type_config":{"kind":"string","max_length":63},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"address_type"},
          {"field_key":"city","description":"City or locality.","data_type":"string","type_config":{"kind":"string","max_length":240},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"city"},
          {"field_key":"country_code","description":"ISO 3166-1 alpha-2 country code.","data_type":"string","type_config":{"kind":"string","max_length":2,"pattern":"^[A-Z]{2}$"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"country_code"},
          {"field_key":"is_active","description":"Database-derived active-state projection.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"projected","write_mode":"read_only","storage_path":"is_active"},
          {"field_key":"latitude","description":"WGS84 latitude.","data_type":"decimal","type_config":{"kind":"decimal","minimum":-90,"maximum":90,"precision":9,"scale":6},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"latitude"},
          {"field_key":"line1","description":"Primary address line.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"line1"},
          {"field_key":"line2","description":"Secondary address line.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"line2"},
          {"field_key":"line3","description":"Additional address line.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"line3"},
          {"field_key":"longitude","description":"WGS84 longitude.","data_type":"decimal","type_config":{"kind":"decimal","minimum":-180,"maximum":180,"precision":9,"scale":6},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"longitude"},
          {"field_key":"postal_code","description":"Postal or ZIP code.","data_type":"string","type_config":{"kind":"string","max_length":64},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"postal_code"},
          {"field_key":"region","description":"State, province, or region.","data_type":"string","type_config":{"kind":"string","max_length":240},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"region"},
          {"field_key":"status","description":"Address lifecycle status.","data_type":"string","type_config":{"kind":"string","max_length":16},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"status","default_spec":{"kind":"static","value":"active","apply_on":["create"]},"validation_spec":{"schema_version":1,"rules":[{"code":"address.status.allowed","kind":"allowed_values","parameters":{"values":["active","deprecated"]}}]}},
          {"field_key":"status_changed_at","description":"Timestamp of the last lifecycle transition.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"status_changed_at"},
          {"field_key":"status_changed_by","description":"Principal responsible for the last lifecycle transition.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"status_changed_by"}
        ]$json$::jsonb,
        $json$[
          {"key_key":"address_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        $json$[
          {"search_key":"address_lookup","search_kind":"hybrid","query_operator":"or","minimum_query_length":2,"language_code":null,"normalization_mode":"casefold_unaccent","is_default":true,"fields":[
            {"field_key":"city","position":1,"match_mode":"prefix","weight":8},
            {"field_key":"postal_code","position":2,"match_mode":"prefix","weight":7},
            {"field_key":"line1","position":3,"match_mode":"contains","weight":6},
            {"field_key":"region","position":4,"match_mode":"prefix","weight":5},
            {"field_key":"country_code","position":5,"match_mode":"exact","weight":4}
          ]}
        ]$json$::jsonb,
        '[]'::jsonb
    )
);

SELECT pg_temp.seed_meta_entity_graph(
    'business_partner',
    'business',
    pg_temp.meta_master_contract(
        'business_partner',
        $json$[
          {"field_key":"aliases","description":"Alternate legal or trading names.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"many","value_origin":"stored","write_mode":"mutable","storage_path":"aliases","default_spec":{"kind":"static","value":[],"apply_on":["create"]}},
          {"field_key":"code","description":"Tenant-scoped natural business-partner code.","data_type":"string","type_config":{"kind":"string","min_length":2,"max_length":63,"pattern":"^[A-Z][A-Z0-9_.-]{1,62}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"code"},
          {"field_key":"description","description":"Business-partner description.","data_type":"text","type_config":{"kind":"text","max_length":4000},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"description"},
          {"field_key":"display_name","description":"Optional canonical user-facing name.","data_type":"string","type_config":{"kind":"string","max_length":240},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"display_name"},
          {"field_key":"incorporation_date","description":"Legal incorporation date.","data_type":"date","type_config":{"kind":"date"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"incorporation_date"},
          {"field_key":"legal_form","description":"Legal organization form.","data_type":"string","type_config":{"kind":"string","max_length":100},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"legal_form"},
          {"field_key":"legal_name","description":"Registered legal name.","data_type":"string","type_config":{"kind":"string","max_length":320},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"legal_name"},
          {"field_key":"name","description":"Canonical business-partner name.","data_type":"string","type_config":{"kind":"string","min_length":1,"max_length":240},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"name"},
          {"field_key":"parent_business_partner_id","description":"Optional parent business partner.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"parent_business_partner_id"},
          {"field_key":"partner_category","description":"Stable commercial identity category.","data_type":"enum","type_config":{"kind":"enum","domain_code":"master.business_partner_category_d"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"partner_category","default_spec":{"kind":"static","value":"organization","apply_on":["create"]}},
          {"field_key":"registration_country_code","description":"Country of registration.","data_type":"string","type_config":{"kind":"string","max_length":2,"pattern":"^[A-Z]{2}$"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"registration_country_code"},
          {"field_key":"website_url","description":"Canonical public website URL.","data_type":"string","type_config":{"kind":"string","max_length":2048,"pattern":"^https?://"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"mutable","storage_path":"website_url"}
        ]$json$::jsonb,
        $json$[
          {"key_key":"business_partner_code","key_kind":"natural","uniqueness_scope":"tenant","null_semantics":"not_allowed","fields":[{"field_key":"code","position":1}]},
          {"key_key":"business_partner_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        $json$[
          {"search_key":"business_partner_lookup","search_kind":"hybrid","query_operator":"or","minimum_query_length":2,"language_code":null,"normalization_mode":"casefold_unaccent","is_default":true,"fields":[
            {"field_key":"name","position":1,"match_mode":"full_text","weight":10},
            {"field_key":"display_name","position":2,"match_mode":"full_text","weight":8},
            {"field_key":"code","position":3,"match_mode":"prefix","weight":7},
            {"field_key":"legal_name","position":4,"match_mode":"full_text","weight":6}
          ]}
        ]$json$::jsonb,
        $json$[
          {"relation_key":"parent_business_partner","relation_kind":"many_to_one","resolution_kind":"foreign_key","ownership_mode":"reference","mutation_mode":"read_only","on_delete":"restrict","on_update":"restrict","inverse_relation_key":"child_business_partners","targets":[
            {"relation_target_key":"business_partner","target_entity_code":"business_partner","target_key_key":"business_partner_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"parent_business_partner_id","target_field_key":"id","position":1}]}
          ]}
        ]$json$::jsonb,
        'master.business_partner_status_d',
        'draft'
    )
);
