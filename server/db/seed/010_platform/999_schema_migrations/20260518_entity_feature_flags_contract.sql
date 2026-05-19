-- Entity feature_flags V1 contract cleanup.
--
-- feature_flags now owns only entity capabilities and runtime guard switches.
-- Identity/search/presentation routing is moved to the matching owner column:
--   * identity_config: identity_via, list_entity_code, parent_*, duplicate_check
--   * search_config: search_fields/search behavior
--   * display_config: line_entity_code and other presentation/renderer config
--
-- This pass is intentionally conservative: it canonicalizes known aliases and
-- removes known legacy/moved keys, but keeps unknown domain flags for review.

WITH current_entity AS (
    SELECT
        e.id,
        COALESCE(e.feature_flags, '{}'::jsonb) AS ff,
        COALESCE(e.display_config, '{}'::jsonb) AS dc
    FROM control.entity e
),
normalized AS (
    SELECT
        id,
        CASE
            WHEN ff ? 'line_entity_code' AND NOT (dc ? 'line_entity_code')
            THEN jsonb_set(dc, '{line_entity_code}', to_jsonb(ff->>'line_entity_code'), true)
            ELSE dc
        END AS next_display_config,
        jsonb_strip_nulls(
            (
                ff
                -- Legacy aliases now emitted under canonical names below.
                - 'approval_workflow'
                - 'workflow_enabled'
                - 'allow_attachments'
                - 'allow_attachment'
                - 'allow_export'
                - 'export_enabled'
                - 'allow_import'
                - 'import_enabled'
                - 'allow_bulk_edit'
                - 'bulk_edit_enabled'
                - 'has_comments'
                - 'comments'
                - 'has_events'
                - 'has_event_history'
                - 'audit_history'
                - 'has_versions'
                - 'versioning'
                - 'has_line_items'
                - 'accounting_distribution'
                - 'has_distributions'
                - 'readonly'
                - 'readOnly'
                - 'read_only'
                -- Moved owners.
                - 'line_entity_code'
                - 'identity_via'
                - 'list_entity_code'
                - 'parent_entity'
                - 'parent_fk'
                - 'parent_scope'
                - 'duplicate_check'
                - 'replacement_entity'
                - 'search_fields'
                - 'code_field'
                - 'title_field'
                - 'subtitle_field'
                - 'detail_renderer'
                - 'list_columns'
            )
            || jsonb_build_object(
                'is_approvable', COALESCE(ff->'is_approvable', ff->'approval_workflow'),
                'has_workflow', COALESCE(ff->'has_workflow', ff->'workflow_enabled', ff->'is_approvable', ff->'approval_workflow'),
                'has_attachments', COALESCE(ff->'has_attachments', ff->'allow_attachments', ff->'allow_attachment'),
                'is_exportable', COALESCE(ff->'is_exportable', ff->'allow_export', ff->'export_enabled'),
                'is_importable', COALESCE(ff->'is_importable', ff->'allow_import', ff->'import_enabled'),
                'is_bulk_editable', COALESCE(ff->'is_bulk_editable', ff->'allow_bulk_edit', ff->'bulk_edit_enabled'),
                'comments_enabled', COALESCE(ff->'comments_enabled', ff->'has_comments', ff->'comments'),
                'event_history', COALESCE(ff->'event_history', ff->'has_events', ff->'has_event_history', ff->'audit_history'),
                'version_control', COALESCE(ff->'version_control', ff->'has_versions', ff->'versioning'),
                'has_lines', COALESCE(ff->'has_lines', ff->'has_line_items', ff->'line_editor'),
                'has_accounting_distribution', COALESCE(ff->'has_accounting_distribution', ff->'accounting_distribution', ff->'has_distributions'),
                'is_readonly', COALESCE(ff->'is_readonly', ff->'readonly', ff->'readOnly', ff->'read_only')
            )
        ) AS next_feature_flags
    FROM current_entity
)
UPDATE control.entity e
SET
    feature_flags = n.next_feature_flags,
    display_config = n.next_display_config,
    updated_at = now()
FROM normalized n
WHERE n.id = e.id
  AND (
      e.feature_flags IS DISTINCT FROM n.next_feature_flags
      OR e.display_config IS DISTINCT FROM n.next_display_config
  );
