-- seed-pack-version: p2.7-v1
SELECT pg_temp.seed_meta_entity_graph(
    'supplier',
    'business',
    pg_temp.meta_master_contract(
        'supplier',
        $json$[
          {"field_key":"business_partner_id","description":"Canonical commercial identity for this supplier role.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"business_partner_id"},
          {"field_key":"supplier_code","description":"Tenant-scoped supplier role code.","data_type":"string","type_config":{"kind":"string","min_length":2,"max_length":63,"pattern":"^[A-Z][A-Z0-9_.-]{1,62}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"supplier_code"},
          {"field_key":"supplier_type","description":"Supplier role classification.","data_type":"enum","type_config":{"kind":"enum","domain_code":"master.supplier_type_d"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"supplier_type","default_spec":{"kind":"static","value":"general","apply_on":["create"]}}
        ]$json$::jsonb,
        $json$[
          {"key_key":"supplier_business_partner","key_kind":"alternate","uniqueness_scope":"tenant","null_semantics":"not_allowed","fields":[{"field_key":"business_partner_id","position":1}]},
          {"key_key":"supplier_code","key_kind":"natural","uniqueness_scope":"tenant","null_semantics":"not_allowed","fields":[{"field_key":"supplier_code","position":1}]},
          {"key_key":"supplier_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        $json$[
          {"search_key":"supplier_lookup","search_kind":"keyword","query_operator":"or","minimum_query_length":2,"language_code":null,"normalization_mode":"casefold","is_default":true,"fields":[
            {"field_key":"supplier_code","position":1,"match_mode":"prefix","weight":10},
            {"field_key":"supplier_type","position":2,"match_mode":"exact","weight":3}
          ]}
        ]$json$::jsonb,
        $json$[
          {"relation_key":"business_partner","relation_kind":"many_to_one","resolution_kind":"foreign_key","ownership_mode":"reference","mutation_mode":"read_only","on_delete":"restrict","on_update":"restrict","inverse_relation_key":"supplier_role","targets":[
            {"relation_target_key":"business_partner","target_entity_code":"business_partner","target_key_key":"business_partner_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"business_partner_id","target_field_key":"id","position":1}]}
          ]}
        ]$json$::jsonb,
        'master.supplier_status_d',
        'onboarding'
    )
);

SELECT pg_temp.seed_meta_entity_graph(
    'customer',
    'business',
    pg_temp.meta_master_contract(
        'customer',
        $json$[
          {"field_key":"business_partner_id","description":"Canonical commercial identity for this customer role.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"business_partner_id"},
          {"field_key":"customer_code","description":"Tenant-scoped customer role code.","data_type":"string","type_config":{"kind":"string","min_length":2,"max_length":63,"pattern":"^[A-Z][A-Z0-9_.-]{1,62}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"customer_code"},
          {"field_key":"customer_type","description":"Customer role classification.","data_type":"enum","type_config":{"kind":"enum","domain_code":"master.customer_type_d"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"customer_type","default_spec":{"kind":"static","value":"corporate","apply_on":["create"]}},
          {"field_key":"is_key_account","description":"Tenant-wide strategic-account designation.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"is_key_account","default_spec":{"kind":"static","value":false,"apply_on":["create"]}}
        ]$json$::jsonb,
        $json$[
          {"key_key":"customer_business_partner","key_kind":"alternate","uniqueness_scope":"tenant","null_semantics":"not_allowed","fields":[{"field_key":"business_partner_id","position":1}]},
          {"key_key":"customer_code","key_kind":"natural","uniqueness_scope":"tenant","null_semantics":"not_allowed","fields":[{"field_key":"customer_code","position":1}]},
          {"key_key":"customer_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        $json$[
          {"search_key":"customer_lookup","search_kind":"keyword","query_operator":"or","minimum_query_length":1,"language_code":null,"normalization_mode":"casefold","is_default":true,"fields":[
            {"field_key":"customer_code","position":1,"match_mode":"prefix","weight":10},
            {"field_key":"customer_type","position":2,"match_mode":"exact","weight":4},
            {"field_key":"is_key_account","position":3,"match_mode":"exact","weight":2}
          ]}
        ]$json$::jsonb,
        $json$[
          {"relation_key":"business_partner","relation_kind":"many_to_one","resolution_kind":"foreign_key","ownership_mode":"reference","mutation_mode":"read_only","on_delete":"restrict","on_update":"restrict","inverse_relation_key":"customer_role","targets":[
            {"relation_target_key":"business_partner","target_entity_code":"business_partner","target_key_key":"business_partner_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"business_partner_id","target_field_key":"id","position":1}]}
          ]}
        ]$json$::jsonb,
        'master.customer_status_d',
        'prospect'
    )
);
