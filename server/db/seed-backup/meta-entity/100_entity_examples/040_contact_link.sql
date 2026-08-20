-- seed-pack-version: p2.7-v1
SELECT pg_temp.seed_meta_entity_graph(
    'contact_link',
    'business',
    pg_temp.meta_master_contract(
        'contact_link',
        $json$[
          {"field_key":"channel_type","description":"Contact channel: email, phone, SMS, WhatsApp, or website.","data_type":"string","type_config":{"kind":"string","min_length":3,"max_length":16},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"channel_type","validation_spec":{"schema_version":1,"rules":[{"code":"contact.channel.allowed","kind":"allowed_values","parameters":{"values":["email","phone","sms","whatsapp","website"]}}]}},
          {"field_key":"is_active","description":"Database-derived active-state projection.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"projected","write_mode":"read_only","storage_path":"is_active"},
          {"field_key":"is_primary","description":"Primary contact for this owner and purpose.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"is_primary","default_spec":{"kind":"static","value":false,"apply_on":["create"]}},
          {"field_key":"is_verified","description":"Whether channel ownership has been verified.","data_type":"boolean","type_config":{"kind":"boolean"},"cardinality":"one","value_origin":"stored","write_mode":"read_only","storage_path":"is_verified"},
          {"field_key":"owner_id","description":"Identifier of the polymorphic owner.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"owner_id"},
          {"field_key":"owner_type_id","description":"Canonical owner-type discriminator coordinate.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"owner_type_id"},
          {"field_key":"purpose","description":"Business purpose of the contact channel.","data_type":"string","type_config":{"kind":"string","min_length":2,"max_length":63,"pattern":"^[a-z][a-z0-9_]{1,62}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"purpose","default_spec":{"kind":"static","value":"default","apply_on":["create"]}},
          {"field_key":"role_qualifier","description":"Optional role qualifier within a purpose.","data_type":"string","type_config":{"kind":"string","max_length":128},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"write_once","storage_path":"role_qualifier"},
          {"field_key":"status","description":"Contact-channel lifecycle status.","data_type":"string","type_config":{"kind":"string","max_length":16},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"status","default_spec":{"kind":"static","value":"active","apply_on":["create"]},"validation_spec":{"schema_version":1,"rules":[{"code":"contact.status.allowed","kind":"allowed_values","parameters":{"values":["active","inactive","deprecated"]}}]}},
          {"field_key":"status_changed_at","description":"Timestamp of the last lifecycle transition.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"status_changed_at"},
          {"field_key":"status_changed_by","description":"Principal responsible for the last lifecycle transition.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"status_changed_by"},
          {"field_key":"value","description":"Canonical channel value; companion channel tables do not own this value.","data_type":"string","type_config":{"kind":"string","min_length":1,"max_length":2048},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"value"},
          {"field_key":"verified_at","description":"Timestamp of successful ownership verification.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"verified_at"}
        ]$json$::jsonb,
        $json$[
          {"key_key":"contact_link_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","fields":[{"field_key":"id","position":1}]}
        ]$json$::jsonb,
        $json$[
          {"search_key":"contact_lookup","search_kind":"hybrid","query_operator":"and","minimum_query_length":2,"language_code":null,"normalization_mode":"casefold","is_default":true,"fields":[
            {"field_key":"value","position":1,"match_mode":"contains","weight":10},
            {"field_key":"channel_type","position":2,"match_mode":"exact","weight":7},
            {"field_key":"purpose","position":3,"match_mode":"exact","weight":4},
            {"field_key":"role_qualifier","position":4,"match_mode":"contains","weight":2}
          ]}
        ]$json$::jsonb,
        $json$[
          {"relation_key":"owner","relation_kind":"many_to_one","resolution_kind":"polymorphic","ownership_mode":"shared","mutation_mode":"read_only","on_delete":"restrict","on_update":"restrict","inverse_relation_key":null,"targets":[
            {"relation_target_key":"business_partner","target_entity_code":"business_partner","target_key_key":"business_partner_pk","discriminator_value":null,"is_default":true,"fields":[{"source_field_key":"owner_id","target_field_key":"id","position":1}]},
            {"relation_target_key":"customer","target_entity_code":"customer","target_key_key":"customer_pk","discriminator_value":"customer","is_default":false,"fields":[{"source_field_key":"owner_id","target_field_key":"id","position":1}]},
            {"relation_target_key":"supplier","target_entity_code":"supplier","target_key_key":"supplier_pk","discriminator_value":"supplier","is_default":false,"fields":[{"source_field_key":"owner_id","target_field_key":"id","position":1}]}
          ]}
        ]$json$::jsonb
    )
);
