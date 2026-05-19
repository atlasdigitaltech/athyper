-- 20260518_zzy_entity_field_contract_hardening.sql
-- Development-mode contract hardening for control.entity_field.
--
-- Implements the cleanup phases:
--   1. expose runtime gaps through the compiled contract
--   2. keep validation validation-only
--   3. compact reference_config to target + overrides
--   4. shrink ui_hint to truly field-specific hints
--   5. move FK/relationship metadata out of field rows
--   6. convert inline enum shells to lookup domains
--   7. merge constraints into validation
--   8. publish a hardening audit view
--   9. normalize seed-generated reference hints
--  10. leave a clean removal-window audit

ALTER TABLE control.entity_field
    ALTER COLUMN fk_target_field DROP DEFAULT,
    ALTER COLUMN fk_on_delete DROP DEFAULT,
    ALTER COLUMN fk_on_update DROP DEFAULT;

-- One metadata naming repair discovered during the field audit:
-- master.entity_document_link stores link_kind, not link_type.
UPDATE control.entity_field ef
   SET name = 'link_kind',
       column_name = 'link_kind',
       label = 'Link Kind',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.tenant_id IS NULL
   AND COALESCE(e.entity_code, e.name) = 'entity_document_link'
   AND ef.name = 'link_type'
   AND NOT EXISTS (
       SELECT 1
         FROM control.entity_field existing
        WHERE existing.entity_version_id = ef.entity_version_id
          AND existing.name = 'link_kind'
   );

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.tenant_id IS NULL
  AND COALESCE(e.entity_code, e.name) = 'entity_document_link'
  AND ef.name = 'link_type'
  AND ef.column_name = 'link_type';

-- Canonical/template rows without an entity_version_id are not runtime
-- metadata and confused the field contract audit.
DELETE FROM control.entity_field ef
 WHERE ef.entity_version_id IS NULL;

-- Canonicalize data_type aliases before downstream UI inference.
UPDATE control.entity_field ef
   SET data_type = CASE ef.data_type
           WHEN 'string' THEN 'text'
           WHEN 'timestamp' THEN 'timestamptz'
           WHEN 'datetime' THEN 'timestamptz'
           WHEN 'text[]' THEN 'text_array'
           WHEN 'json' THEN 'jsonb'
           ELSE ef.data_type
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.data_type IN ('string', 'timestamp', 'datetime', 'text[]', 'json');

-- Lookup domain/value registry for the enum fields that were carrying only
-- an empty enum_config shell.
WITH domains(code, name, description) AS (
    VALUES
      ('master.asset_component.component_type', 'Asset Component Type', 'IAS 16 componentization role for an asset component.'),
      ('master.brand_profile.direction', 'Brand Text Direction', 'Text direction for tenant brand rendering.'),
      ('master.business_intent.domain', 'Business Intent Domain', 'Purpose/domain classification for business intents.'),
      ('master.business_intent.visibility', 'Business Intent Visibility', 'Visibility classification for business intents.'),
      ('master.company_code_intent_policy.mapping_mode', 'Intent Policy Mapping Mode', 'Allow/deny mapping mode for company intent policies.'),
      ('master.content_item_access_grant.access_level', 'Content Access Level', 'Access grant level for CMS content items.'),
      ('master.content_item_access_grant.subject_type', 'Content Access Subject Type', 'Subject type for CMS content grants.'),
      ('master.entity_document_link.link_kind', 'Entity Document Link Kind', 'Attachment link kind for entity document links.'),
      ('master.fiscal_period.status', 'Fiscal Period Status', 'Posting status for fiscal periods.'),
      ('master.principal_identity_binding.sync_status', 'Principal Identity Sync Status', 'IdP synchronization health for principal identity bindings.'),
      ('master.principal_profile.keycloak_sync_status', 'Principal Profile Keycloak Sync Status', 'Legacy Keycloak synchronization health on principal profiles.'),
      ('master.print_profile.color_mode', 'Print Color Mode', 'Output color mode for print profiles.'),
      ('master.print_profile.orientation', 'Print Orientation', 'Page orientation for print profiles.'),
      ('master.print_profile.output_format', 'Print Output Format', 'Rendered output format for print profiles.'),
      ('master.print_profile.paper_size', 'Print Paper Size', 'Paper size for print profiles.'),
      ('master.tenant_feature_entitlement.status', 'Tenant Feature Entitlement Status', 'Lifecycle status for tenant feature entitlements.'),
      ('master.tenant_module_subscription.status', 'Tenant Module Subscription Status', 'Lifecycle status for tenant module subscriptions.')
)
INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible, metadata, created_by
)
SELECT code, name, description, 'master', false, '{}'::jsonb,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM domains
ON CONFLICT (code) DO UPDATE
   SET name = EXCLUDED.name,
       description = EXCLUDED.description,
       source_schema = EXCLUDED.source_schema,
       is_extensible = EXCLUDED.is_extensible,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid;

WITH lookup_values(domain_code, code, name, description, sort_order) AS (
    VALUES
      ('master.asset_component.component_type', 'major_component', 'Major Component', 'Material component tracked separately for depreciation.', 10),
      ('master.asset_component.component_type', 'replacement_component', 'Replacement Component', 'Replacement component linked to a parent asset.', 20),
      ('master.asset_component.component_type', 'inspection_component', 'Inspection Component', 'Inspection or overhaul component capitalized separately.', 30),
      ('master.asset_component.component_type', 'other', 'Other', 'Other asset component type.', 90),

      ('master.brand_profile.direction', 'ltr', 'Left to Right', 'Left-to-right text direction.', 10),
      ('master.brand_profile.direction', 'rtl', 'Right to Left', 'Right-to-left text direction.', 20),

      ('master.business_intent.domain', 'opex', 'Opex', 'Operating expenditure.', 10),
      ('master.business_intent.domain', 'capex', 'Capex', 'Capital expenditure.', 20),
      ('master.business_intent.domain', 'revenue', 'Revenue', 'Revenue intent.', 30),
      ('master.business_intent.domain', 'cost_of_sales', 'Cost Of Sales', 'Cost of sales intent.', 40),
      ('master.business_intent.domain', 'transfer', 'Transfer', 'Transfer intent.', 50),
      ('master.business_intent.domain', 'regulatory', 'Regulatory', 'Regulatory intent.', 60),
      ('master.business_intent.domain', 'admin', 'Admin', 'Administrative intent.', 70),
      ('master.business_intent.domain', 'deferred_revenue', 'Deferred Revenue', 'Deferred revenue intent.', 80),

      ('master.business_intent.visibility', 'standard', 'Standard', 'Standard visibility.', 10),
      ('master.business_intent.visibility', 'restricted', 'Restricted', 'Restricted visibility.', 20),
      ('master.business_intent.visibility', 'confidential', 'Confidential', 'Confidential visibility.', 30),

      ('master.company_code_intent_policy.mapping_mode', 'allow', 'Allow', 'Allow this mapping.', 10),
      ('master.company_code_intent_policy.mapping_mode', 'deny', 'Deny', 'Deny this mapping.', 20),

      ('master.content_item_access_grant.access_level', 'read', 'Read', 'Read access.', 10),
      ('master.content_item_access_grant.access_level', 'write', 'Write', 'Write access.', 20),
      ('master.content_item_access_grant.access_level', 'publish', 'Publish', 'Publish access.', 30),
      ('master.content_item_access_grant.access_level', 'admin', 'Admin', 'Administrative access.', 40),

      ('master.content_item_access_grant.subject_type', 'principal', 'Principal', 'Principal subject.', 10),
      ('master.content_item_access_grant.subject_type', 'role', 'Role', 'Role subject.', 20),
      ('master.content_item_access_grant.subject_type', 'group', 'Group', 'Group subject.', 30),
      ('master.content_item_access_grant.subject_type', 'public', 'Public', 'Public subject.', 40),

      ('master.entity_document_link.link_kind', 'primary', 'Primary', 'Primary attachment.', 10),
      ('master.entity_document_link.link_kind', 'related', 'Related', 'Related attachment.', 20),
      ('master.entity_document_link.link_kind', 'supporting', 'Supporting', 'Supporting attachment.', 30),
      ('master.entity_document_link.link_kind', 'compliance', 'Compliance', 'Compliance attachment.', 40),
      ('master.entity_document_link.link_kind', 'audit', 'Audit', 'Audit attachment.', 50),

      ('master.fiscal_period.status', 'future', 'Future', 'Future period.', 10),
      ('master.fiscal_period.status', 'open', 'Open', 'Open period.', 20),
      ('master.fiscal_period.status', 'soft_close', 'Soft Close', 'Soft-closed period.', 30),
      ('master.fiscal_period.status', 'hard_close', 'Hard Close', 'Hard-closed period.', 40),

      ('master.principal_identity_binding.sync_status', 'pending', 'Pending', 'Sync pending.', 10),
      ('master.principal_identity_binding.sync_status', 'synced', 'Synced', 'Sync completed.', 20),
      ('master.principal_identity_binding.sync_status', 'drift', 'Drift', 'Provider drift detected.', 30),
      ('master.principal_identity_binding.sync_status', 'error', 'Error', 'Sync error.', 40),
      ('master.principal_identity_binding.sync_status', 'disabled', 'Disabled', 'Provider identity disabled.', 50),

      ('master.principal_profile.keycloak_sync_status', 'pending', 'Pending', 'Sync pending.', 10),
      ('master.principal_profile.keycloak_sync_status', 'synced', 'Synced', 'Sync completed.', 20),
      ('master.principal_profile.keycloak_sync_status', 'drift', 'Drift', 'Provider drift detected.', 30),
      ('master.principal_profile.keycloak_sync_status', 'error', 'Error', 'Sync error.', 40),

      ('master.print_profile.color_mode', 'color', 'Color', 'Full color output.', 10),
      ('master.print_profile.color_mode', 'bw', 'Black And White', 'Black and white output.', 20),
      ('master.print_profile.color_mode', 'grayscale', 'Grayscale', 'Grayscale output.', 30),

      ('master.print_profile.orientation', 'portrait', 'Portrait', 'Portrait orientation.', 10),
      ('master.print_profile.orientation', 'landscape', 'Landscape', 'Landscape orientation.', 20),

      ('master.print_profile.output_format', 'pdf', 'PDF', 'PDF output.', 10),
      ('master.print_profile.output_format', 'html', 'HTML', 'HTML output.', 20),
      ('master.print_profile.output_format', 'png', 'PNG', 'PNG image output.', 30),

      ('master.print_profile.paper_size', 'a3', 'A3', 'A3 paper.', 10),
      ('master.print_profile.paper_size', 'a4', 'A4', 'A4 paper.', 20),
      ('master.print_profile.paper_size', 'a5', 'A5', 'A5 paper.', 30),
      ('master.print_profile.paper_size', 'b4', 'B4', 'B4 paper.', 40),
      ('master.print_profile.paper_size', 'letter', 'Letter', 'Letter paper.', 50),
      ('master.print_profile.paper_size', 'legal', 'Legal', 'Legal paper.', 60),

      ('master.tenant_feature_entitlement.status', 'active', 'Active', 'Active entitlement.', 10),
      ('master.tenant_feature_entitlement.status', 'suspended', 'Suspended', 'Suspended entitlement.', 20),
      ('master.tenant_feature_entitlement.status', 'trial', 'Trial', 'Trial entitlement.', 30),

      ('master.tenant_module_subscription.status', 'active', 'Active', 'Active subscription.', 10),
      ('master.tenant_module_subscription.status', 'suspended', 'Suspended', 'Suspended subscription.', 20),
      ('master.tenant_module_subscription.status', 'trial', 'Trial', 'Trial subscription.', 30)
)
INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, sort_order, is_system, metadata, created_by
)
SELECT NULL::uuid, code, name, domain_code, description, sort_order, true, '{}'::jsonb,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM lookup_values
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
   SET name = EXCLUDED.name,
       description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order,
       status = 'active',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid;

WITH enum_targets(entity_code, field_name, domain_code, lookup_config) AS (
    VALUES
      ('asset_component', 'component_type', 'master.asset_component.component_type', NULL::jsonb),
      ('brand_profile', 'direction', 'master.brand_profile.direction', '{"value_case":"upper"}'::jsonb),
      ('business_intent', 'domain', 'master.business_intent.domain', '{"value_case":"upper"}'::jsonb),
      ('business_intent', 'visibility', 'master.business_intent.visibility', '{"value_case":"upper"}'::jsonb),
      ('company_code_intent_policy', 'mapping_mode', 'master.company_code_intent_policy.mapping_mode', '{"value_case":"upper"}'::jsonb),
      ('content_item_access_grant', 'access_level', 'master.content_item_access_grant.access_level', NULL::jsonb),
      ('content_item_access_grant', 'subject_type', 'master.content_item_access_grant.subject_type', NULL::jsonb),
      ('entity_document_link', 'link_kind', 'master.entity_document_link.link_kind', NULL::jsonb),
      ('fiscal_period', 'posting_status', 'master.fiscal_period.status', NULL::jsonb),
      ('principal_identity_binding', 'sync_status', 'master.principal_identity_binding.sync_status', NULL::jsonb),
      ('principal_profile', 'keycloak_sync_status', 'master.principal_profile.keycloak_sync_status', NULL::jsonb),
      ('print_profile', 'color_mode', 'master.print_profile.color_mode', NULL::jsonb),
      ('print_profile', 'orientation', 'master.print_profile.orientation', NULL::jsonb),
      ('print_profile', 'output_format', 'master.print_profile.output_format', NULL::jsonb),
      ('print_profile', 'paper_size', 'master.print_profile.paper_size',
       '{"value_map":{"a3":"A3","a4":"A4","a5":"A5","b4":"B4","letter":"Letter","legal":"Legal"}}'::jsonb),
      ('tenant_feature_entitlement', 'status', 'master.tenant_feature_entitlement.status', NULL::jsonb),
      ('tenant_module_subscription', 'status', 'master.tenant_module_subscription.status', NULL::jsonb)
)
UPDATE control.entity_field ef
   SET enum_domain_code = et.domain_code,
       enum_config = NULL,
       lookup_config = NULLIF(jsonb_strip_nulls(COALESCE(ef.lookup_config, '{}'::jsonb) || COALESCE(et.lookup_config, '{}'::jsonb)), '{}'::jsonb),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
  JOIN enum_targets et ON et.entity_code = COALESCE(e.entity_code, e.name)
 WHERE ef.entity_version_id = ev.id
   AND e.tenant_id IS NULL
   AND ef.name = et.field_name
   AND (
       ef.enum_domain_code IS DISTINCT FROM et.domain_code
       OR ef.enum_config IS NOT NULL
       OR COALESCE(ef.lookup_config, '{}'::jsonb) IS DISTINCT FROM NULLIF(jsonb_strip_nulls(COALESCE(ef.lookup_config, '{}'::jsonb) || COALESCE(et.lookup_config, '{}'::jsonb)), '{}'::jsonb)
   );

-- Seed target-level picker profiles for referenced entities. The profile
-- defaults to code + name where both exist, and falls back to document/number
-- fields for transactional targets.
WITH target_entities AS (
    SELECT DISTINCT target.id
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity owner ON owner.id = ev.entity_id
      LEFT JOIN control.entity fk_target ON fk_target.id = ef.fk_target_entity_id
      JOIN control.entity target ON target.tenant_id IS NULL
       AND target.is_active = true
       AND (
           COALESCE(target.entity_code, target.name) = COALESCE(
               NULLIF(ef.reference_config->>'target_entity', ''),
               NULLIF(ef.reference_config->>'ref_entity', ''),
               NULLIF(ef.validation->>'ref_entity', ''),
               NULLIF(ef.validation->>'ref_hint', ''),
               COALESCE(fk_target.entity_code, fk_target.name),
               CASE
                   WHEN ef.name LIKE '%\_id' ESCAPE '\' THEN regexp_replace(ef.name, '_id$', '')
                   WHEN ef.column_name LIKE '%\_id' ESCAPE '\' THEN regexp_replace(ef.column_name, '_id$', '')
                   ELSE NULL
               END
           )
       )
     WHERE owner.tenant_id IS NULL
       AND ef.is_active = true
), field_sets AS (
    SELECT
        e.id,
        COALESCE(e.entity_code, e.name) AS entity_code,
        jsonb_object_agg(ef.name, true) FILTER (WHERE ef.name IS NOT NULL) AS fields
    FROM control.entity e
    JOIN target_entities te ON te.id = e.id
    LEFT JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
    LEFT JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.is_active = true
    WHERE e.tenant_id IS NULL
    GROUP BY e.id, COALESCE(e.entity_code, e.name)
), profiles AS (
    SELECT
        fs.id,
        fs.entity_code,
        fs.fields,
        CASE
            WHEN fs.fields ? (fs.entity_code || '_name') THEN fs.entity_code || '_name'
            WHEN fs.fields ? 'name' THEN 'name'
            WHEN fs.fields ? 'display_name' THEN 'display_name'
            WHEN fs.fields ? 'business_title' THEN 'business_title'
            WHEN fs.fields ? 'label' THEN 'label'
            WHEN fs.fields ? 'title' THEN 'title'
            WHEN fs.fields ? 'subject' THEN 'subject'
            WHEN fs.fields ? 'original_filename' THEN 'original_filename'
            WHEN fs.fields ? 'file_name' THEN 'file_name'
            WHEN fs.fields ? 'contact_name' THEN 'contact_name'
            WHEN fs.fields ? 'event_name' THEN 'event_name'
            WHEN fs.fields ? 'rule_name' THEN 'rule_name'
            WHEN fs.fields ? 'assumption_name' THEN 'assumption_name'
            WHEN fs.fields ? 'version_label' THEN 'version_label'
            WHEN fs.fields ? 'item_description' THEN 'item_description'
            WHEN fs.fields ? 'service_description' THEN 'service_description'
            WHEN fs.fields ? 'document_no' THEN 'document_no'
            WHEN fs.fields ? 'document_number' THEN 'document_number'
            WHEN fs.fields ? 'statement_ref' THEN 'statement_ref'
            WHEN fs.fields ? 'case_number' THEN 'case_number'
            WHEN fs.fields ? 'description' THEN 'description'
            WHEN fs.fields ? 'summary' THEN 'summary'
            WHEN fs.fields ? 'body' THEN 'body'
            WHEN fs.fields ? 'content' THEN 'content'
            WHEN fs.fields ? 'entity_identifier' THEN 'entity_identifier'
            WHEN fs.fields ? 'entity_name' THEN 'entity_name'
            WHEN fs.fields ? 'model_identifier' THEN 'model_identifier'
            WHEN fs.fields ? 'assessment_context' THEN 'assessment_context'
            WHEN fs.fields ? 'workflow_type' THEN 'workflow_type'
            WHEN fs.fields ? 'operation_code' THEN 'operation_code'
            WHEN fs.fields ? 'rule_code' THEN 'rule_code'
            WHEN fs.fields ? 'event_code' THEN 'event_code'
            WHEN fs.fields ? 'clause_code' THEN 'clause_code'
            WHEN fs.fields ? 'component_code' THEN 'component_code'
            WHEN fs.fields ? 'model_code' THEN 'model_code'
            WHEN fs.fields ? 'dimension_code' THEN 'dimension_code'
            WHEN fs.fields ? 'action' THEN 'action'
            WHEN fs.fields ? 'profile_type' THEN 'profile_type'
            WHEN fs.fields ? 'subledger_type' THEN 'subledger_type'
            WHEN fs.fields ? 'direction' THEN 'direction'
            WHEN fs.fields ? 'number_field' THEN 'number_field'
            WHEN fs.fields ? 'prefix' THEN 'prefix'
            WHEN fs.fields ? 'version_no' THEN 'version_no'
            WHEN fs.fields ? 'expression_language' THEN 'expression_language'
            WHEN fs.fields ? 'match_type' THEN 'match_type'
            WHEN fs.fields ? 'match_result' THEN 'match_result'
            WHEN fs.fields ? 'attendance_date' THEN 'attendance_date'
            WHEN fs.fields ? 'line_status' THEN 'line_status'
            WHEN fs.fields ? 'purpose' THEN 'purpose'
            WHEN fs.fields ? 'timing' THEN 'timing'
            WHEN fs.fields ? 'priority' THEN 'priority'
            WHEN fs.fields ? 'inclusion_reason' THEN 'inclusion_reason'
            WHEN fs.fields ? 'exclusion_reason' THEN 'exclusion_reason'
            WHEN fs.fields ? 'line_no' THEN 'line_no'
            WHEN fs.fields ? 'stage_no' THEN 'stage_no'
            WHEN fs.fields ? 'sequence_no' THEN 'sequence_no'
            WHEN fs.fields ? 'status' THEN 'status'
            ELSE NULL::text
        END AS label_field,
        CASE
            WHEN fs.fields ? (fs.entity_code || '_code') THEN fs.entity_code || '_code'
            WHEN fs.fields ? 'code' THEN 'code'
            WHEN fs.fields ? 'entity_code' THEN 'entity_code'
            WHEN fs.fields ? 'document_no' THEN 'document_no'
            WHEN fs.fields ? 'document_number' THEN 'document_number'
            WHEN fs.fields ? 'number' THEN 'number'
            WHEN fs.fields ? 'case_number' THEN 'case_number'
            WHEN fs.fields ? 'statement_ref' THEN 'statement_ref'
            WHEN fs.fields ? 'reference_number' THEN 'reference_number'
            WHEN fs.fields ? 'correlation_id' THEN 'correlation_id'
            WHEN fs.fields ? 'rule_code' THEN 'rule_code'
            WHEN fs.fields ? 'event_code' THEN 'event_code'
            WHEN fs.fields ? 'clause_code' THEN 'clause_code'
            WHEN fs.fields ? 'component_code' THEN 'component_code'
            WHEN fs.fields ? 'action_code' THEN 'action_code'
            WHEN fs.fields ? 'source_code' THEN 'source_code'
            WHEN fs.fields ? 'operation_code' THEN 'operation_code'
            WHEN fs.fields ? 'model_code' THEN 'model_code'
            WHEN fs.fields ? 'dimension_code' THEN 'dimension_code'
            WHEN fs.fields ? 'workflow_type' THEN 'workflow_type'
            WHEN fs.fields ? 'profile_type' THEN 'profile_type'
            WHEN fs.fields ? 'number_field' THEN 'number_field'
            WHEN fs.fields ? 'version_number' THEN 'version_number'
            WHEN fs.fields ? 'version_no' THEN 'version_no'
            WHEN fs.fields ? 'match_type' THEN 'match_type'
            WHEN fs.fields ? 'timing' THEN 'timing'
            WHEN fs.fields ? 'priority' THEN 'priority'
            WHEN fs.fields ? 'line_no' THEN 'line_no'
            WHEN fs.fields ? 'stage_no' THEN 'stage_no'
            WHEN fs.fields ? 'sequence_no' THEN 'sequence_no'
            ELSE NULL::text
        END AS code_field,
        CASE
            WHEN fs.fields ? 'description' THEN 'description'
            WHEN fs.fields ? 'summary' THEN 'summary'
            WHEN fs.fields ? 'notes' THEN 'notes'
            WHEN fs.fields ? 'reason' THEN 'reason'
            WHEN fs.fields ? 'error_summary' THEN 'error_summary'
            ELSE NULL::text
        END AS description_field
    FROM field_sets fs
)
UPDATE control.entity e
   SET display_config = jsonb_set(
           COALESCE(e.display_config, '{}'::jsonb),
           '{reference_picker}',
           jsonb_strip_nulls(jsonb_build_object(
               'label_field', p.label_field,
               'code_field', p.code_field,
               'navigation_field', 'id',
               'description_field', CASE WHEN p.description_field <> p.label_field THEN p.description_field ELSE NULL::text END,
               'show_code', p.code_field IS NOT NULL AND p.code_field <> p.label_field,
               'show_description', p.description_field IS NOT NULL,
               'show_view_action', true
           )
           || CASE
               WHEN p.entity_code = 'company_code'
               THEN jsonb_build_object('label_template', '{name} - {code}', 'show_code', false)
               ELSE '{}'::jsonb
              END),
           true
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM profiles p
 WHERE e.id = p.id
   AND (p.label_field IS NOT NULL OR p.code_field IS NOT NULL OR p.description_field IS NOT NULL)
   AND (
       NOT (COALESCE(e.display_config, '{}'::jsonb) ? 'reference_picker')
       OR COALESCE(e.display_config->'reference_picker'->>'label_field', '') IN ('', 'id')
       OR COALESCE(e.display_config->'reference_picker'->>'code_field', '') = 'id'
       OR (
           COALESCE(e.display_config->'reference_picker'->>'label_field', '') <> ''
           AND NOT (p.fields ? (e.display_config->'reference_picker'->>'label_field'))
       )
       OR (
           COALESCE(e.display_config->'reference_picker'->>'code_field', '') NOT IN ('', 'id')
           AND NOT (p.fields ? (e.display_config->'reference_picker'->>'code_field'))
       )
   );

-- Move legacy validation.ref_* and seed-generated validation.ref_hint into
-- reference_config.target_entity. This is intentionally broad in local dev:
-- UUID *_id fields get a target when a matching entity exists.
WITH raw_reference AS (
    SELECT
        ef.id,
        COALESCE(owner.entity_code, owner.name) AS owner_entity_code,
        COALESCE(
            NULLIF(ef.reference_config->>'target_entity', ''),
            NULLIF(ef.reference_config->>'ref_entity', ''),
            NULLIF(ef.validation->>'ref_entity', ''),
            NULLIF(ef.validation->>'ref_hint', ''),
            COALESCE(fk_target.entity_code, fk_target.name),
            CASE
                WHEN ef.name LIKE '%\_id' ESCAPE '\' THEN regexp_replace(ef.name, '_id$', '')
                WHEN ef.column_name LIKE '%\_id' ESCAPE '\' THEN regexp_replace(ef.column_name, '_id$', '')
                ELSE NULL
            END
        ) AS raw_target,
        NULLIF(COALESCE(ef.reference_config->>'target_field', ef.validation->>'target_field'), '') AS target_field,
        NULLIF(COALESCE(ef.reference_config->>'display_field', ef.validation->>'display_field'), '') AS display_field
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity owner ON owner.id = ev.entity_id
    LEFT JOIN control.entity fk_target ON fk_target.id = ef.fk_target_entity_id
    WHERE owner.tenant_id IS NULL
      AND ef.is_active = true
      AND (
          ef.reference_config IS NOT NULL
          OR ef.validation ?| ARRAY['ref_entity','ref_hint','target_field','display_field']
          OR ef.fk_target_entity_id IS NOT NULL
          OR ef.data_type = 'reference'
          OR ef.ui_type IN ('reference', 'entity_chooser')
          OR (ef.data_type = 'uuid' AND (ef.name LIKE '%\_id' ESCAPE '\' OR ef.column_name LIKE '%\_id' ESCAPE '\'))
      )
), aliased_reference AS (
    SELECT
        id,
        target_field,
        display_field,
        CASE
            WHEN raw_target IS NULL THEN NULL
            WHEN raw_target IN ('ap_je', 'je', 'journal') THEN 'journal_entry'
            WHEN raw_target IN ('created_by', 'updated_by', 'deleted_by', 'status_changed_by',
                                'approved_by', 'rejected_by', 'reviewed_by', 'verified_by',
                                'requested_by', 'submitted_by', 'assigned_to', 'owner',
                                'owner_principal', 'actor_principal', 'principal_id') THEN 'principal'
            WHEN raw_target IN ('default_company_code', 'company') THEN 'company_code'
            WHEN raw_target IN ('default_cost_center') THEN 'cost_center'
            WHEN raw_target IN ('default_profit_center') THEN 'profit_center'
            WHEN raw_target IN ('default_project') THEN 'project'
            WHEN raw_target IN ('default_dimension_set') THEN 'dimension_set'
            WHEN raw_target IN ('default_budget_allocation') THEN 'budget_allocation'
            WHEN raw_target IN ('parent', 'parent_record') THEN owner_entity_code
            WHEN raw_target = 'reversal_of' THEN owner_entity_code
            WHEN raw_target IN ('parent_asset', 'component_asset') THEN 'asset'
            WHEN raw_target IN ('parent_project') THEN 'project'
            WHEN raw_target IN ('parent_intent', 'intent') THEN 'business_intent'
            ELSE raw_target
        END AS target_hint
    FROM raw_reference
), matched_reference AS (
    SELECT DISTINCT ON (ar.id)
        ar.id,
        COALESCE(target.entity_code, target.name) AS target_entity,
        ar.target_field,
        ar.display_field
    FROM aliased_reference ar
    JOIN control.entity target
      ON target.tenant_id IS NULL
     AND target.is_active = true
     AND (
         target.entity_code = ar.target_hint
         OR target.name = ar.target_hint
         OR target.slug = replace(ar.target_hint, '_', '-')
     )
    WHERE ar.target_hint IS NOT NULL
    ORDER BY ar.id,
        CASE
            WHEN target.entity_code = ar.target_hint THEN 0
            WHEN target.name = ar.target_hint THEN 1
            ELSE 2
        END
)
UPDATE control.entity_field ef
   SET reference_config = jsonb_strip_nulls(
           (COALESCE(ef.reference_config, '{}'::jsonb) - 'ref_entity' - 'ref_hint')
           || jsonb_build_object('target_entity', mr.target_entity)
           || CASE
                WHEN mr.target_field IS NOT NULL AND mr.target_field <> 'id'
                THEN jsonb_build_object('target_field', mr.target_field)
                ELSE '{}'::jsonb
              END
           || CASE
                WHEN mr.display_field IS NOT NULL
                THEN jsonb_build_object('display_field', mr.display_field)
                ELSE '{}'::jsonb
              END
       ),
       ui_type = CASE
           WHEN ef.ui_type IS NULL AND ef.data_type = 'uuid' THEN 'reference'
           ELSE ef.ui_type
       END,
       label = CASE
           WHEN ef.label ~* '\s+id$' THEN regexp_replace(ef.label, '\s+id$', '', 'i')
           ELSE ef.label
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM matched_reference mr
 WHERE ef.id = mr.id
   AND (
       ef.reference_config IS NULL
       OR ef.reference_config->>'target_entity' IS DISTINCT FROM mr.target_entity
       OR ef.reference_config ? 'ref_entity'
       OR ef.validation ?| ARRAY['ref_entity','ref_hint','target_field','display_field']
       OR ef.label ~* '\s+id$'
   );

-- Database FK constraints are the strongest source for generated metadata.
-- Use them to repair broad coverage rows such as created_by, group_id, book_id,
-- and other fields where the seed only inferred "uuid/reference".
WITH fk_reference AS (
    SELECT DISTINCT ON (ef.id)
        ef.id,
        COALESCE(target_entity.entity_code, target_entity.name) AS target_entity
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity owner ON owner.id = ev.entity_id
    JOIN pg_namespace owner_ns ON owner_ns.nspname = owner.table_schema
    JOIN pg_class owner_rel ON owner_rel.relnamespace = owner_ns.oid
     AND owner_rel.relname = owner.table_name
    JOIN pg_constraint con ON con.conrelid = owner_rel.oid
     AND con.contype = 'f'
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS src(attnum, ord) ON true
    JOIN pg_attribute src_att ON src_att.attrelid = owner_rel.oid
     AND src_att.attnum = src.attnum
     AND src_att.attname = ef.column_name
    JOIN pg_class target_rel ON target_rel.oid = con.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid = target_rel.relnamespace
    JOIN control.entity target_entity ON target_entity.tenant_id IS NULL
     AND target_entity.is_active = true
     AND target_entity.table_schema = target_ns.nspname
     AND target_entity.table_name = target_rel.relname
    WHERE owner.tenant_id IS NULL
      AND ef.is_active = true
      AND (ef.reference_config IS NULL OR COALESCE(ef.reference_config->>'target_entity', '') = '')
    ORDER BY ef.id, con.conname
)
UPDATE control.entity_field ef
   SET reference_config = jsonb_strip_nulls(
           COALESCE(ef.reference_config, '{}'::jsonb)
           || jsonb_build_object('target_entity', fr.target_entity)
       ),
       ui_type = CASE
           WHEN ef.ui_type IS NULL AND ef.data_type = 'uuid' THEN 'reference'
           ELSE ef.ui_type
       END,
       label = CASE
           WHEN ef.label ~* '\s+id$' THEN regexp_replace(ef.label, '\s+id$', '', 'i')
           ELSE ef.label
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM fk_reference fr
 WHERE ef.id = fr.id;

-- Code references store a stable code, not a target row UUID. Give the UI an
-- explicit semantic renderer instead of leaving these as accidental text.
UPDATE control.entity_field ef
   SET ui_type = CASE ef.reference_config->>'target_entity'
           WHEN 'currency' THEN 'currency'
           WHEN 'country' THEN 'country'
           WHEN 'language' THEN 'language'
           WHEN 'timezone' THEN 'timezone'
           WHEN 'uom' THEN 'uom'
           ELSE ef.ui_type
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.reference_config->>'target_entity' IN ('currency', 'country', 'language', 'timezone', 'uom')
   AND ef.data_type IN ('text', 'enum')
   AND ef.ui_type IS DISTINCT FROM CASE ef.reference_config->>'target_entity'
           WHEN 'currency' THEN 'currency'
           WHEN 'country' THEN 'country'
           WHEN 'language' THEN 'language'
           WHEN 'timezone' THEN 'timezone'
           WHEN 'uom' THEN 'uom'
           ELSE ef.ui_type
       END;

-- UUID references must resolve through the reference renderer unless explicitly
-- hidden. Otherwise list/detail cells show raw UUIDs.
UPDATE control.entity_field ef
   SET ui_type = 'reference',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.data_type = 'uuid'
   AND COALESCE(ef.reference_config->>'target_entity', '') <> ''
   AND ef.ui_type IS DISTINCT FROM 'reference'
   AND ef.ui_type IS DISTINCT FROM 'hidden';

-- Remove stale id-based field-level picker overrides when the target entity now
-- has a better reference_picker profile.
UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - 'picker' - 'display_field'), '{}'::jsonb),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.entity target
 WHERE ef.reference_config ? 'picker'
   AND target.tenant_id IS NULL
   AND target.is_active = true
   AND COALESCE(target.entity_code, target.name) = ef.reference_config->>'target_entity'
   AND COALESCE(target.display_config->'reference_picker'->>'label_field', '') NOT IN ('', 'id')
   AND (
       COALESCE(ef.reference_config->'picker'->>'label_field', ef.reference_config->>'display_field') = 'id'
       OR COALESCE(ef.reference_config->'picker'->>'navigation_field', '') = 'id'
       OR COALESCE(ef.reference_config->>'display_field', '') = 'id'
   );

-- If an override points at a field that no longer exists on the target profile,
-- fall back to the target-level reference_picker.
WITH target_fields AS (
    SELECT
        COALESCE(e.entity_code, e.name) AS target_entity,
        jsonb_object_agg(ef.name, true) FILTER (WHERE ef.name IS NOT NULL) AS fields
    FROM control.entity e
    LEFT JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
    LEFT JOIN control.entity_field ef ON ef.entity_version_id = ev.id AND ef.is_active = true
    WHERE e.tenant_id IS NULL
      AND e.is_active = true
    GROUP BY COALESCE(e.entity_code, e.name)
)
UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - 'picker' - 'display_field'), '{}'::jsonb),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM target_fields tf
 WHERE ef.reference_config ? 'picker'
   AND tf.target_entity = ef.reference_config->>'target_entity'
   AND COALESCE(ef.reference_config->'picker'->>'label_field', ef.reference_config->>'display_field', '') <> ''
   AND NOT (COALESCE(tf.fields, '{}'::jsonb) ? COALESCE(ef.reference_config->'picker'->>'label_field', ef.reference_config->>'display_field'));

-- Fill remaining null UI types from the canonical runtime type.
UPDATE control.entity_field ef
   SET ui_type = CASE
           WHEN COALESCE(ef.reference_config->>'target_entity', '') <> '' THEN
               CASE
                   WHEN ef.data_type = 'uuid' THEN 'reference'
                   WHEN ef.reference_config->>'target_entity' = 'currency' THEN 'currency'
                   WHEN ef.reference_config->>'target_entity' = 'country' THEN 'country'
                   WHEN ef.reference_config->>'target_entity' = 'language' THEN 'language'
                   WHEN ef.reference_config->>'target_entity' = 'timezone' THEN 'timezone'
                   WHEN ef.reference_config->>'target_entity' = 'uom' THEN 'uom'
                   ELSE 'reference'
               END
           WHEN ef.data_type = 'reference' THEN 'reference'
           WHEN ef.data_type IN ('enum', 'enum[]') THEN 'select'
           WHEN ef.data_type = 'lifecycle_state' THEN 'status'
           WHEN ef.data_type = 'boolean' THEN 'checkbox'
           WHEN ef.data_type = 'date' THEN 'date'
           WHEN ef.data_type IN ('timestamptz', 'timestamp') THEN 'datetime'
           WHEN ef.data_type IN ('integer', 'bigint', 'decimal') THEN 'number'
           WHEN ef.data_type = 'money' THEN 'money'
           WHEN ef.data_type IN ('jsonb', 'text_array', 'uuid_array', 'int_array') THEN 'json'
           WHEN ef.data_type = 'uuid' THEN 'hidden'
           WHEN ef.name ~* '(description|notes|body|summary|reason)$' THEN 'textarea'
           ELSE 'text'
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.ui_type IS NULL;

-- Remaining uuid/reference rows without a target are ambiguous/polymorphic.
-- They should not render as clickable entity references until a target or
-- resolver profile is explicitly authored.
UPDATE control.entity_field ef
   SET data_type = CASE WHEN ef.data_type = 'reference' THEN 'uuid' ELSE ef.data_type END,
       ui_type = NULL,
       label = CASE
           WHEN ef.label ~* '\s+id$' THEN regexp_replace(ef.label, '\s+id$', '', 'i')
           ELSE ef.label
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE (ef.reference_config IS NULL OR COALESCE(ef.reference_config->>'target_entity', '') = '')
   AND (
       ef.data_type = 'reference'
       OR ef.ui_type IN ('reference', 'entity_chooser')
   );

-- Validation is now validation-only.
UPDATE control.entity_field ef
   SET validation = NULLIF(
           jsonb_strip_nulls(
               COALESCE(ef.validation, '{}'::jsonb)
               - ARRAY[
                   'ref_entity',
                   'ref_hint',
                   'target_field',
                   'display_field',
                   'picker',
                   'label_field',
                   'code_field',
                   'description_field',
                   'navigation_field',
                   'record_id_field',
                   'show_code',
                   'show_description',
                   'show_view_action'
               ]
           ),
           '{}'::jsonb
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.validation ?| ARRAY[
       'ref_entity',
       'ref_hint',
       'target_field',
       'display_field',
       'picker',
       'label_field',
       'code_field',
       'description_field',
       'navigation_field',
       'record_id_field',
       'show_code',
       'show_description',
       'show_view_action'
   ];

-- Constraints collapse into validation, then constraints becomes reserved.
UPDATE control.entity_field ef
   SET validation = NULLIF(jsonb_strip_nulls(COALESCE(ef.validation, '{}'::jsonb) || COALESCE(ef.constraints, '{}'::jsonb)), '{}'::jsonb),
       constraints = NULL,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.constraints IS NOT NULL;

-- Compact reference_config: target-level picker profiles live on control.entity.display_config.reference_picker.
UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - 'ref_entity' - 'ref_hint'), '{}'::jsonb)
 WHERE ef.reference_config ?| ARRAY['ref_entity', 'ref_hint'];

UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - 'target_field'), '{}'::jsonb)
 WHERE ef.reference_config->>'target_field' = 'id';

UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - 'picker'), '{}'::jsonb)
  FROM control.entity target
 WHERE ef.reference_config ? 'picker'
   AND target.tenant_id IS NULL
   AND target.is_active = true
   AND COALESCE(target.entity_code, target.name) = ef.reference_config->>'target_entity'
   AND ef.reference_config->'picker' = COALESCE(target.display_config, '{}'::jsonb)->'reference_picker';

UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - 'display_field'), '{}'::jsonb)
  FROM control.entity target
 WHERE ef.reference_config ? 'display_field'
   AND target.tenant_id IS NULL
   AND target.is_active = true
   AND COALESCE(target.entity_code, target.name) = ef.reference_config->>'target_entity'
   AND ef.reference_config->>'display_field' = COALESCE(target.display_config, '{}'::jsonb)->'reference_picker'->>'label_field';

UPDATE control.entity_field ef
   SET reference_config = NULLIF(jsonb_strip_nulls(ef.reference_config - key_name), '{}'::jsonb)
  FROM control.entity target
  CROSS JOIN LATERAL (
      VALUES
        ('label_field'),
        ('code_field'),
        ('description_field'),
        ('navigation_field'),
        ('record_id_field'),
        ('show_code'),
        ('show_description'),
        ('show_view_action')
  ) AS k(key_name)
 WHERE ef.reference_config ? k.key_name
   AND target.tenant_id IS NULL
   AND target.is_active = true
   AND COALESCE(target.entity_code, target.name) = ef.reference_config->>'target_entity'
   AND ef.reference_config->k.key_name = COALESCE(target.display_config, '{}'::jsonb)->'reference_picker'->k.key_name;

-- ui_hint only keeps genuinely field-specific hints.
UPDATE control.entity_field ef
   SET ui_hint = NULLIF(
           jsonb_strip_nulls(
               COALESCE(ef.ui_hint, '{}'::jsonb)
               - ARRAY['group_key','filter','picker','reference_picker','readOnly','read_only']
           ),
           '{}'::jsonb
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE ef.ui_hint ?| ARRAY['group_key','filter','picker','reference_picker','readOnly','read_only'];

-- Relationship and FK metadata is represented by reference_config plus
-- control.entity_relation, not by runtime field rows.
UPDATE control.entity_field ef
   SET fk_target_entity_id = NULL,
       fk_target_field = NULL,
       fk_on_delete = NULL,
       fk_on_update = NULL,
       fk_relationship_class = NULL,
       child_entity_name = NULL,
       child_fk_field = NULL,
       collection_behavior = NULL,
       lookup_profile = NULL,
       datetime_config = NULL,
       enum_kind = NULL,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE fk_target_entity_id IS NOT NULL
    OR fk_target_field IS NOT NULL
    OR fk_on_delete IS NOT NULL
    OR fk_on_update IS NOT NULL
    OR fk_relationship_class IS NOT NULL
    OR child_entity_name IS NOT NULL
    OR child_fk_field IS NOT NULL
    OR collection_behavior IS NOT NULL
    OR lookup_profile IS NOT NULL
    OR datetime_config IS NOT NULL
    OR enum_kind IS NOT NULL;

CREATE OR REPLACE VIEW control.v_entity_field_contract_audit AS
WITH field_context AS (
    SELECT
        COALESCE(e.entity_code, e.name, '<canonical>') AS entity_code,
        ef.entity_version_id,
        ev.version_no,
        ef.id AS entity_field_id,
        ef.name AS field_name,
        ef.column_name,
        ef.label,
        ef.data_type,
        ef.ui_type,
        ef.cardinality,
        ef.origin,
        ef.reference_config,
        ef.validation,
        ef.ui_hint,
        ef.lookup_profile,
        ef.datetime_config,
        ef.collection_behavior,
        ef.child_entity_name,
        ef.child_fk_field,
        ef.enum_kind,
        ef.enum_config,
        ef.fk_target_entity_id,
        ef.fk_target_field,
        ef.fk_on_delete,
        ef.fk_on_update,
        ef.fk_relationship_class,
        ef.constraints
    FROM control.entity_field ef
    LEFT JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    LEFT JOIN control.entity e ON e.id = ev.entity_id
    WHERE ef.is_active = true
), reference_targets AS (
    SELECT
        fc.*,
        target.display_config AS referenced_entity_display_config
    FROM field_context fc
    LEFT JOIN control.entity target
      ON target.tenant_id IS NULL
     AND target.is_active = true
     AND COALESCE(target.entity_code, target.name) = COALESCE(
         fc.reference_config->>'target_entity',
         fc.reference_config->>'ref_entity',
         fc.validation->>'ref_entity',
         fc.validation->>'ref_hint'
     )
)
SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'legacy_validation_reference_metadata'::text AS issue_code,
    'error'::text AS severity,
    validation AS details
FROM reference_targets
WHERE validation ?| ARRAY[
    'ref_entity','ref_hint','target_field','display_field','picker',
    'label_field','code_field','description_field','navigation_field',
    'record_id_field','show_code','show_description','show_view_action'
]

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'legacy_reference_config_reference_metadata'::text AS issue_code,
    'error'::text AS severity,
    reference_config AS details
FROM reference_targets
WHERE reference_config ?| ARRAY['ref_entity', 'ref_hint']

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'reference_without_target'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('data_type', data_type, 'ui_type', ui_type) AS details
FROM reference_targets
WHERE (
        data_type = 'reference'
        OR ui_type IN ('reference', 'entity_chooser')
      )
  AND COALESCE(reference_config->>'target_entity', '') = ''
  AND field_name NOT IN ('id')

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'orphan_entity_field'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('entity_version_id', entity_version_id) AS details
FROM reference_targets
WHERE entity_version_id IS NULL

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'null_ui_type'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('data_type', data_type, 'reference_config', reference_config) AS details
FROM reference_targets
WHERE ui_type IS NULL

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'noncanonical_data_type_alias'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('data_type', data_type) AS details
FROM reference_targets
WHERE data_type IN ('string', 'timestamp', 'datetime', 'text[]', 'json')

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'uuid_reference_non_reference_ui'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object(
        'target_entity', reference_config->>'target_entity',
        'data_type', data_type,
        'ui_type', ui_type
    ) AS details
FROM reference_targets
WHERE data_type = 'uuid'
  AND COALESCE(reference_config->>'target_entity', '') <> ''
  AND ui_type NOT IN ('reference', 'hidden')

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'semantic_code_reference_wrong_ui'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object(
        'target_entity', reference_config->>'target_entity',
        'expected_ui_type', CASE reference_config->>'target_entity'
            WHEN 'currency' THEN 'currency'
            WHEN 'country' THEN 'country'
            WHEN 'language' THEN 'language'
            WHEN 'timezone' THEN 'timezone'
            WHEN 'uom' THEN 'uom'
            ELSE NULL
        END,
        'actual_ui_type', ui_type
    ) AS details
FROM reference_targets
WHERE reference_config->>'target_entity' IN ('currency', 'country', 'language', 'timezone', 'uom')
  AND data_type IN ('text', 'enum')
  AND ui_type IS DISTINCT FROM CASE reference_config->>'target_entity'
        WHEN 'currency' THEN 'currency'
        WHEN 'country' THEN 'country'
        WHEN 'language' THEN 'language'
        WHEN 'timezone' THEN 'timezone'
        WHEN 'uom' THEN 'uom'
        ELSE ui_type
      END

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'id_based_reference_picker_override'::text AS issue_code,
    'warning'::text AS severity,
    reference_config AS details
FROM reference_targets
WHERE reference_config ? 'picker'
  AND (
      COALESCE(reference_config->'picker'->>'label_field', reference_config->>'display_field') = 'id'
      OR COALESCE(reference_config->'picker'->>'navigation_field', '') = 'id'
      OR COALESCE(reference_config->>'display_field', '') = 'id'
  )

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'many_cardinality_non_collection_type'::text AS issue_code,
    'warning'::text AS severity,
    jsonb_build_object('data_type', data_type, 'ui_type', ui_type, 'cardinality', cardinality) AS details
FROM reference_targets
WHERE cardinality = 'many'
  AND data_type NOT IN ('text_array', 'uuid_array', 'int_array', 'enum[]', 'jsonb')
  AND NOT (data_type = 'enum' AND ui_type = 'select')

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'repeated_reference_picker_blob'::text AS issue_code,
    'warning'::text AS severity,
    jsonb_build_object('target_entity', reference_config->>'target_entity') AS details
FROM reference_targets
WHERE reference_config ? 'picker'
  AND COALESCE(referenced_entity_display_config, '{}'::jsonb) ? 'reference_picker'
  AND reference_config->'picker' = COALESCE(referenced_entity_display_config, '{}'::jsonb)->'reference_picker'

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'ui_hint_runtime_duplicate'::text AS issue_code,
    'warning'::text AS severity,
    jsonb_strip_nulls(jsonb_build_object(
        'group_key', ui_hint->'group_key',
        'filter', ui_hint->'filter',
        'picker', ui_hint->'picker',
        'reference_picker', ui_hint->'reference_picker',
        'readOnly', ui_hint->'readOnly',
        'read_only', ui_hint->'read_only'
    )) AS details
FROM reference_targets
WHERE ui_hint ?| ARRAY['group_key','filter','picker','reference_picker','readOnly','read_only']

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'reserved_authoring_column_non_null'::text AS issue_code,
    'info'::text AS severity,
    jsonb_strip_nulls(jsonb_build_object(
        'lookup_profile', lookup_profile,
        'datetime_config', datetime_config,
        'collection_behavior', collection_behavior,
        'child_entity_name', child_entity_name,
        'child_fk_field', child_fk_field,
        'enum_kind', enum_kind,
        'fk_target_entity_id', fk_target_entity_id,
        'fk_target_field', fk_target_field,
        'fk_on_delete', fk_on_delete,
        'fk_on_update', fk_on_update,
        'fk_relationship_class', fk_relationship_class
    )) AS details
FROM reference_targets
WHERE jsonb_strip_nulls(jsonb_build_object(
        'lookup_profile', lookup_profile,
        'datetime_config', datetime_config,
        'collection_behavior', collection_behavior,
        'child_entity_name', child_entity_name,
        'child_fk_field', child_fk_field,
        'enum_kind', enum_kind,
        'fk_target_entity_id', fk_target_entity_id,
        'fk_target_field', fk_target_field,
        'fk_on_delete', fk_on_delete,
        'fk_on_update', fk_on_update,
        'fk_relationship_class', fk_relationship_class
    )) <> '{}'::jsonb

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'inline_enum_config'::text AS issue_code,
    'warning'::text AS severity,
    enum_config AS details
FROM reference_targets
WHERE enum_config IS NOT NULL

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'constraints_json_non_null'::text AS issue_code,
    'warning'::text AS severity,
    constraints AS details
FROM reference_targets
WHERE constraints IS NOT NULL;

COMMENT ON VIEW control.v_entity_field_contract_audit IS
    'Development audit for control.entity_field contract cleanup. Error rows block the runtime contract removal window.';

DO $$
DECLARE
    v_errors integer := 0;
    v_warnings integer := 0;
    v_info integer := 0;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE severity = 'error'),
        COUNT(*) FILTER (WHERE severity = 'warning'),
        COUNT(*) FILTER (WHERE severity = 'info')
      INTO v_errors, v_warnings, v_info
      FROM control.v_entity_field_contract_audit;

    IF v_errors > 0 OR v_warnings > 0 THEN
        RAISE WARNING 'entity_field contract audit: % error(s), % warning(s), % info row(s). Inspect control.v_entity_field_contract_audit.', v_errors, v_warnings, v_info;
    ELSE
        RAISE NOTICE 'entity_field contract audit clean (% info row(s))', v_info;
    END IF;
END $$;
