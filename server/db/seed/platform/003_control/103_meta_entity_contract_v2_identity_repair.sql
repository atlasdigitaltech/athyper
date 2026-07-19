-- Repair the Journal Entry v2 display identity for databases that already ran
-- 102_meta_entity_contract_v2_pilots.sql before the canonical header ordering
-- was corrected.  The contract owns this mapping; runtime adapters only
-- project it into their delivery shape.
UPDATE control.entity_version_contract c
   SET identity_config = jsonb_set(
         jsonb_set(
           c.identity_config,
           '{display_identity,title_field}',
           to_jsonb('code'::text),
           true
         ),
         '{display_identity,subtitle_field}',
         to_jsonb('name'::text),
         true
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE c.entity_version_id = ev.id
   AND c.tenant_id IS NULL
   AND ev.tenant_id IS NULL
   AND ev.version_no = 1
   AND ev.entity_id = e.id
   AND e.tenant_id IS NULL
   AND e.entity_code = 'journal_entry';
