-- seed-pack-version: p2.7-v1
-- One intentionally editable graph lets Studio exercise optimistic save,
-- validation, checkpoint, review, and publication without mutating the seeded
-- release baseline.
SELECT pg_temp.seed_meta_entity_graph(
    'business_partner',
    'business',
    (SELECT contract_json
       FROM pg_temp.meta_entity_seed_source
      WHERE entity_code = 'business_partner'),
    'p2_7_studio_draft',
    false
);
