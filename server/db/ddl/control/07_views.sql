-- ============================================================================
-- control/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "control"."v_acct_profile_full" AS
SELECT apc.id AS profile_config_id,
    apc.tenant_id,
    apc.accounting_profile_id,
    apc.version,
    apc.status,
    apc.direction,
    apc.profile_type,
    apc.subledger_type,
    apc.applicable_flow_codes,
    apc.applicable_doc_types,
    apc.recognition_timing,
    apc.deferral_schedule_type,
    apc.deferral_periods,
    apc.auto_reverse,
    apc.reversal_period_offset,
    apc.tax_treatment,
    apc.default_tax_code,
    apc.default_tax_group_id,
    tg.code AS default_tax_group_code,
    tg.name AS default_tax_group_name,
    apc.is_reverse_charge,
    apc.matching_type,
    apc.effective_from,
    apc.effective_to,
    apc.supersedes_id,
    apcc.creates_commitment,
    apcc.commitment_type,
    apcc.releases_commitment_on,
    apcc.encumbrance_behavior,
    apcc.multi_year_strategy,
    apcc.advance_pct,
    apcc.advance_recovery_method,
    apcc.retention_pct AS commitment_retention_pct,
    apcc.retention_release_event,
    aprc.revenue_recognition_method,
    aprc.variable_consideration,
    aprc.standalone_selling_price_method,
    aprc.paired_profile_id,
    aprc.fires_paired_on_event,
    aprc.deferral_account_code,
    aprc.unbilled_ar_account_code,
    apsc.settlement_method,
    apsc.settlement_tolerance,
    apsc.discount_model,
    apsc.discount_curve_type,
    apsc.discount_apr,
    apsc.discount_min_days,
    apsc.discount_min_amount,
    apsc.scf_financier_id,
    apsc.scf_split_pct,
    apcc.id IS NOT NULL AS has_commitment_config,
    aprc.id IS NOT NULL AS has_revenue_config,
    apsc.id IS NOT NULL AS has_settlement_config,
    apc.created_at,
    apc.updated_at
   FROM control.acct_profile_config apc
     LEFT JOIN control.tax_group tg ON tg.id = apc.default_tax_group_id AND tg.tenant_id = apc.tenant_id
     LEFT JOIN control.acct_profile_commitment_config apcc ON apcc.profile_config_id = apc.id
     LEFT JOIN control.acct_profile_revenue_config aprc ON aprc.profile_config_id = apc.id
     LEFT JOIN control.acct_profile_settlement_config apsc ON apsc.profile_config_id = apc.id
  WHERE apc.is_active = true;

COMMENT ON VIEW "control"."v_acct_profile_full" IS 'Engine 4.13: full profile configuration view. Core config (acct_profile_config) left-joined with optional children (commitment, revenue, settlement). Active profiles only. Now exposes default_tax_group_id + default_tax_group_code/name from control.tax_group. Legacy default_tax_code retained for backward compatibility. has_commitment_config / has_revenue_config / has_settlement_config derived flags.';

CREATE OR REPLACE VIEW "control"."v_active_flow_templates" AS
SELECT DISTINCT ON ((COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)), flow_code, event_code) id,
    tenant_id,
    flow_code,
    direction,
    event_code,
    event_name,
    event_seq,
    is_mandatory,
    creates_je,
    reverses_prior,
    commitment_action,
    description,
        CASE
            WHEN tenant_id IS NULL THEN 'PLATFORM'::text
            ELSE 'TENANT'::text
        END AS scope
   FROM control.transaction_flow_template t
  WHERE is_active = true
  ORDER BY (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)), flow_code, event_code, tenant_id;

COMMENT ON VIEW "control"."v_active_flow_templates" IS 'Engine 4.13: effective active flow template rows. Tenant overrides shadow platform-global rows on (flow_code, event_code). scope: PLATFORM (tenant_id IS NULL) | TENANT (tenant-specific override).';

CREATE OR REPLACE VIEW "control"."v_authorization_v2_deferred_constraints" WITH (security_invoker=true, security_barrier=true) AS
SELECT conrelid::regclass::text AS relation_name,
    conname AS constraint_name,
    convalidated AS is_validated
   FROM pg_constraint
  WHERE connamespace = 'control'::regnamespace::oid AND NOT convalidated;

CREATE OR REPLACE VIEW "control"."v_authorization_v2_operation_publication" WITH (security_invoker=true, security_barrier=true) AS
SELECT eo.id AS entity_operation_id,
    eo.tenant_id,
    eo.entity_id_v2,
    eo.operation_code_v2,
    eo.permission_id_v2,
    eo.v2_publication_status,
    p.plane_code,
    p.canonical_code AS permission_code_v2,
    p.plane_code AS permission_plane_code,
    p.status AS permission_status,
    eo.v2_publication_status = 'published'::text AND p.status = 'published'::text AND p.entity_id = eo.entity_id_v2 AND p.operation_code = eo.operation_code_v2 AS is_publishable
   FROM control.entity_operation eo
     LEFT JOIN control.auth_permission p ON p.id = eo.permission_id_v2;

CREATE OR REPLACE VIEW "control"."v_blueprint_catalogue" AS
SELECT code,
    name,
    category,
    industry_vertical,
    framework,
    base_version,
    status,
    dependencies,
    seed_files,
    description
   FROM control.blueprint_registry
  WHERE status = 'active'::text
  ORDER BY (
        CASE category
            WHEN 'base'::text THEN 1
            WHEN 'foundation'::text THEN 2
            WHEN 'coa_framework'::text THEN 3
            WHEN 'industry_pack'::text THEN 4
            WHEN 'module_pack'::text THEN 5
            ELSE NULL::integer
        END), code;

COMMENT ON VIEW "control"."v_blueprint_catalogue" IS 'Active blueprint packs ordered for the tenant provisioning wizard. Tier order: base → foundation → coa_framework → industry_pack → module_pack. R6: moved from seed file into main view bundle.';

CREATE OR REPLACE VIEW "control"."v_entity_field_contract_audit" AS
WITH base AS (
         SELECT e.table_schema,
            e.table_name,
            e.entity_code,
            e.tenant_id AS entity_tenant_id,
            ev.id AS entity_version_id,
            ev.version_no,
            ev.status AS version_status,
            ef.id AS field_id,
            ef.tenant_id AS field_tenant_id,
            ef.name AS field_name,
            ef.column_name,
            ef.origin,
            ef.data_type,
            ef.is_active,
            ef.is_required,
            ef.is_read_only,
            ef.is_computed,
            ef.is_write_once,
            ef.editability,
            ef.visibility,
            ef.ui_hint,
            ef.validation,
            ef.reference_config
           FROM control.entity_field ef
             JOIN control.entity_version ev ON ev.id = ef.entity_version_id
             JOIN control.entity e ON e.id = ev.entity_id
        )
 SELECT table_schema,
    table_name,
    entity_code,
    field_name,
    column_name,
    origin,
    data_type,
    is_active,
    is_computed,
    is_read_only,
        CASE
            WHEN editability IS NOT NULL AND editability ? 'editable_in_status'::text AND jsonb_array_length(editability -> 'editable_in_status'::text) > 0 THEN true
            ELSE false
        END AS has_editable_in_status,
        CASE
            WHEN COALESCE((ui_hint -> 'display'::text) -> 'visible_when'::text, visibility -> 'when'::text) IS NOT NULL THEN true
            ELSE false
        END AS has_visible_when,
        CASE
            WHEN visibility ? 'hideIn'::text OR visibility ? 'hide_in'::text OR (ui_hint -> 'display'::text) ? 'hide_in'::text THEN true
            ELSE false
        END AS has_hide_in,
        CASE
            WHEN is_active = true AND (origin = ANY (ARRAY['standard'::text, 'business'::text])) AND is_read_only = false AND COALESCE(is_computed, false) = false AND NOT (editability ? 'editable_in_status'::text AND jsonb_array_length(editability -> 'editable_in_status'::text) > 0) AND NOT (editability ? 'editable'::text AND ((editability ->> 'editable'::text)::boolean) = false) THEN true
            ELSE false
        END AS missing_field_rule,
        CASE
            WHEN visibility IS NOT NULL AND visibility <> '{}'::jsonb THEN true
            ELSE false
        END AS visibility_legacy_present,
        CASE
            WHEN validation ? 'ref_entity'::text THEN true
            ELSE false
        END AS validation_ref_entity_legacy,
        CASE
            WHEN COALESCE(is_computed, false) = false AND (field_name = ANY (ARRAY['gross_amount'::text, 'net_amount'::text, 'total_amount'::text, 'subtotal_amount'::text, 'payable_amount'::text, 'outstanding_amount'::text, 'tax_amount'::text, 'paid_amount'::text, 'distributed_amount'::text, 'line_count'::text, 'match_status'::text, 'matched_quantity'::text, 'budget_check_result'::text])) THEN true
            ELSE false
        END AS suspected_unflagged_computed,
        CASE
            WHEN field_tenant_id IS NOT NULL THEN true
            ELSE false
        END AS is_tenant_override,
    editability,
    visibility,
    ui_hint,
    entity_version_id,
    field_id
   FROM base
  WHERE version_status = 'EFFECTIVE'::text;

COMMENT ON VIEW "control"."v_entity_field_contract_audit" IS 'Field-contract audit: flags missing rules, legacy keys, and suspected unflagged computed fields. Filter WHERE missing_field_rule for next-sprint seed candidates; WHERE visibility_legacy_present for the ui_hint migration backlog; WHERE suspected_unflagged_computed to catch derivation drift.';

CREATE OR REPLACE VIEW "control"."v_entity_surface_contract_audit" AS
WITH field_legacy AS (
         SELECT ev.entity_id,
            count(*) FILTER (WHERE ef.visibility IS NOT NULL AND ef.visibility <> '{}'::jsonb) AS fields_with_legacy_visibility,
            count(*) FILTER (WHERE (ef.ui_hint -> 'display'::text) ? 'hide_in'::text) AS fields_with_ui_hint_hide_in,
            count(*) FILTER (WHERE ef.editability ? 'editable_in'::text) AS fields_with_editable_in
           FROM control.entity_version ev
             JOIN control.entity_field ef ON ef.entity_version_id = ev.id
          GROUP BY ev.entity_id
        ), surface_counts AS (
         SELECT es.entity_id,
            count(*) AS surface_count,
            count(*) FILTER (WHERE es.tenant_id IS NULL) AS platform_surface_count,
            count(*) FILTER (WHERE es.tenant_id IS NOT NULL) AS tenant_surface_count,
            count(*) FILTER (WHERE es.is_enabled = true) AS enabled_surface_count,
            count(*) FILTER (WHERE es.placement = ANY (ARRAY['action_only'::text, 'mount_only'::text])) AS non_visual_surface_count,
            count(*) FILTER (WHERE es.parent_surface_id IS NOT NULL) AS sidecar_surface_count,
            count(*) FILTER (WHERE es.kind = 'custom'::text AND es.renderer_key IS NULL) AS custom_without_renderer_count,
            count(*) FILTER (WHERE es.config ?| ARRAY['visible'::text, 'is_visible'::text, 'required'::text, 'readonly'::text, 'sort_order'::text, 'order'::text, 'span'::text, 'column_span'::text, 'density'::text, 'permissions'::text, 'required_permissions'::text]) AS surfaces_with_structural_config_keys
           FROM control.entity_surface es
          GROUP BY es.entity_id
        ), field_surface_counts AS (
         SELECT es.entity_id,
            count(*) AS field_surface_count,
            count(*) FILTER (WHERE efs.renderer_config ?| ARRAY['visible'::text, 'is_visible'::text, 'required'::text, 'readonly'::text, 'sort_order'::text, 'order'::text, 'span'::text, 'column_span'::text, 'density'::text]) AS field_surfaces_with_structural_config_keys
           FROM control.entity_surface es
             JOIN control.entity_field_surface efs ON efs.entity_surface_id = es.id
          GROUP BY es.entity_id
        )
 SELECT e.id AS entity_id,
    e.tenant_id,
    e.entity_code,
    e.name,
    e.entity_class,
    e.status,
    COALESCE(sc.surface_count, 0::bigint) AS surface_count,
    COALESCE(sc.platform_surface_count, 0::bigint) AS platform_surface_count,
    COALESCE(sc.tenant_surface_count, 0::bigint) AS tenant_surface_count,
    COALESCE(sc.enabled_surface_count, 0::bigint) AS enabled_surface_count,
    COALESCE(sc.non_visual_surface_count, 0::bigint) AS non_visual_surface_count,
    COALESCE(sc.sidecar_surface_count, 0::bigint) AS sidecar_surface_count,
    COALESCE(fsc.field_surface_count, 0::bigint) AS field_surface_count,
    (e.display_config -> 'document_runtime'::text) ? 'surfaces'::text AS legacy_document_surfaces_present,
    COALESCE(fl.fields_with_legacy_visibility, 0::bigint) AS fields_with_legacy_visibility,
    COALESCE(fl.fields_with_ui_hint_hide_in, 0::bigint) AS fields_with_ui_hint_hide_in,
    COALESCE(fl.fields_with_editable_in, 0::bigint) AS fields_with_editable_in,
    COALESCE(sc.custom_without_renderer_count, 0::bigint) AS custom_without_renderer_count,
    COALESCE(sc.surfaces_with_structural_config_keys, 0::bigint) AS surfaces_with_structural_config_keys,
    COALESCE(fsc.field_surfaces_with_structural_config_keys, 0::bigint) AS field_surfaces_with_structural_config_keys,
    array_remove(ARRAY[
        CASE
            WHEN COALESCE(sc.surface_count, 0::bigint) = 0 AND (e.status = ANY (ARRAY['ACTIVE'::text, 'DEPRECATED'::text])) THEN 'no_normalized_surfaces'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (e.display_config -> 'document_runtime'::text) ? 'surfaces'::text THEN 'legacy_document_runtime_surfaces'::text
            ELSE NULL::text
        END,
        CASE
            WHEN COALESCE(fl.fields_with_legacy_visibility, 0::bigint) > 0 THEN 'legacy_field_visibility'::text
            ELSE NULL::text
        END,
        CASE
            WHEN COALESCE(fl.fields_with_ui_hint_hide_in, 0::bigint) > 0 THEN 'legacy_ui_hint_hide_in'::text
            ELSE NULL::text
        END,
        CASE
            WHEN COALESCE(sc.custom_without_renderer_count, 0::bigint) > 0 THEN 'custom_surface_without_renderer'::text
            ELSE NULL::text
        END,
        CASE
            WHEN COALESCE(sc.surfaces_with_structural_config_keys, 0::bigint) > 0 OR COALESCE(fsc.field_surfaces_with_structural_config_keys, 0::bigint) > 0 THEN 'structural_keys_in_renderer_config'::text
            ELSE NULL::text
        END], NULL::text) AS audit_flags
   FROM control.entity e
     LEFT JOIN surface_counts sc ON sc.entity_id = e.id
     LEFT JOIN field_surface_counts fsc ON fsc.entity_id = e.id
     LEFT JOIN field_legacy fl ON fl.entity_id = e.id;

COMMENT ON VIEW "control"."v_entity_surface_contract_audit" IS 'Audits normalized runtime surface adoption. Flags legacy document_runtime.surfaces, legacy field visibility/editability hints, missing normalized surfaces, custom surfaces without renderer_key, and structural keys placed in renderer config JSON.';

CREATE OR REPLACE VIEW "control"."v_meta_entity_contract_audit" AS
WITH base AS (
         SELECT entity.id AS entity_id,
            entity.entity_code,
            entity.tenant_id,
            state.published_version_id,
            state.current_draft_version_id,
            published.status AS published_status,
            draft.status AS draft_status,
            published.contract_schema_version,
            published.contract_hash,
            state.contract_hash AS publish_contract_hash,
            published.projection_hash,
            state.materialized_hash,
            state.admin_compiled_hash,
            state.neon_compiled_hash,
            state.mesh_compiled_hash,
            state.readiness_status,
            state.readiness_diagnostics,
            published.contract_document,
            COALESCE(jsonb_array_length(
                CASE
                    WHEN jsonb_typeof(published.contract_document -> 'relations'::text) = 'array'::text THEN published.contract_document -> 'relations'::text
                    ELSE '[]'::jsonb
                END), 0) AS expected_relations,
            COALESCE(jsonb_array_length(
                CASE
                    WHEN jsonb_typeof(published.contract_document -> 'operations'::text) = 'array'::text THEN published.contract_document -> 'operations'::text
                    ELSE '[]'::jsonb
                END), 0) AS expected_operations,
            COALESCE(jsonb_array_length(
                CASE
                    WHEN jsonb_typeof(published.contract_document #> '{numbering,configurations}'::text[]) = 'array'::text THEN published.contract_document #> '{numbering,configurations}'::text[]
                    ELSE '[]'::jsonb
                END), 0) AS expected_numbering,
            COALESCE(jsonb_array_length(
                CASE
                    WHEN jsonb_typeof(published.contract_document -> 'flows'::text) = 'array'::text THEN published.contract_document -> 'flows'::text
                    ELSE '[]'::jsonb
                END), 0) AS expected_flows,
            ( SELECT count(*) AS count
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(published.contract_document -> 'operations'::text) = 'array'::text THEN published.contract_document -> 'operations'::text
                            ELSE '[]'::jsonb
                        END) operation(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(operation.value -> 'action_rules'::text) = 'array'::text THEN operation.value -> 'action_rules'::text
                            ELSE '[]'::jsonb
                        END) action_rule(value)) AS expected_action_rules,
            ( SELECT count(*) AS count
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(published.contract_document #> '{lifecycle,states}'::text[]) = 'array'::text THEN published.contract_document #> '{lifecycle,states}'::text[]
                            ELSE '[]'::jsonb
                        END) lifecycle_state(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(lifecycle_state.value -> 'masks'::text) = 'array'::text THEN lifecycle_state.value -> 'masks'::text
                            ELSE '[]'::jsonb
                        END) lifecycle_mask(value)) AS expected_lifecycle_masks,
            ( SELECT count(*) AS count
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(published.contract_document -> 'flows'::text) = 'array'::text THEN published.contract_document -> 'flows'::text
                            ELSE '[]'::jsonb
                        END) flow(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(flow.value -> 'steps'::text) = 'array'::text THEN flow.value -> 'steps'::text
                            ELSE '[]'::jsonb
                        END) step(value)) AS expected_flow_steps,
            ( SELECT count(*) AS count
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(published.contract_document -> 'flows'::text) = 'array'::text THEN published.contract_document -> 'flows'::text
                            ELSE '[]'::jsonb
                        END) flow(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(flow.value -> 'steps'::text) = 'array'::text THEN flow.value -> 'steps'::text
                            ELSE '[]'::jsonb
                        END) step(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(step.value -> 'sections'::text) = 'array'::text THEN step.value -> 'sections'::text
                            ELSE '[]'::jsonb
                        END) section(value)) AS expected_flow_sections,
            ( SELECT count(*) AS count
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(published.contract_document -> 'flows'::text) = 'array'::text THEN published.contract_document -> 'flows'::text
                            ELSE '[]'::jsonb
                        END) flow(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(flow.value -> 'steps'::text) = 'array'::text THEN flow.value -> 'steps'::text
                            ELSE '[]'::jsonb
                        END) step(value)
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(step.value -> 'fields'::text) = 'array'::text THEN step.value -> 'fields'::text
                            ELSE '[]'::jsonb
                        END) field_binding(value)) AS expected_flow_fields,
            ( SELECT count(*) AS count
                   FROM control.entity_relation "row"
                  WHERE "row".entity_version_id = state.published_version_id) AS actual_relations,
            ( SELECT count(*) AS count
                   FROM control.entity_operation "row"
                  WHERE "row".entity_version_id = state.published_version_id) AS actual_operations,
            ( SELECT count(*) AS count
                   FROM control.entity_numbering_config "row"
                  WHERE "row".entity_version_id = state.published_version_id) AS actual_numbering,
            ( SELECT count(*) AS count
                   FROM control.entity_lifecycle_state_mask "row"
                  WHERE "row".entity_version_id = state.published_version_id) AS actual_lifecycle_masks,
            ( SELECT count(*) AS count
                   FROM control.entity_action_rule "row"
                  WHERE "row".entity_version_id = state.published_version_id) AS actual_action_rules,
            ( SELECT count(*) AS count
                   FROM control.entity_flow "row"
                  WHERE "row".entity_version_id = state.published_version_id) AS actual_flows,
            ( SELECT count(*) AS count
                   FROM control.entity_flow flow
                     JOIN control.entity_flow_step step ON step.flow_id = flow.id
                  WHERE flow.entity_version_id = state.published_version_id) AS actual_flow_steps,
            ( SELECT count(*) AS count
                   FROM control.entity_flow flow
                     JOIN control.entity_flow_step step ON step.flow_id = flow.id
                     JOIN control.entity_flow_section section ON section.flow_step_id = step.id
                  WHERE flow.entity_version_id = state.published_version_id) AS actual_flow_sections,
            ( SELECT count(*) AS count
                   FROM control.entity_flow flow
                     JOIN control.entity_flow_step step ON step.flow_id = flow.id
                     JOIN control.entity_flow_field field_binding ON field_binding.flow_step_id = step.id
                  WHERE flow.entity_version_id = state.published_version_id) AS actual_flow_fields,
            ( SELECT count(*) AS count
                   FROM control.entity_numbering_counter counter
                     JOIN control.entity_numbering_config numbering_config ON numbering_config.id = counter.config_id
                  WHERE numbering_config.entity_id = entity.id AND NOT counter.tenant_id IS DISTINCT FROM entity.tenant_id) AS runtime_counter_count,
            ( SELECT count(*) AS count
                   FROM snapshot.entity_plane_compiled artifact
                  WHERE artifact.entity_version_id = state.published_version_id AND NOT artifact.tenant_id IS DISTINCT FROM state.tenant_id) AS plane_artifact_count,
            ( SELECT count(*) AS count
                   FROM snapshot.entity_plane_compiled artifact
                  WHERE artifact.entity_version_id = state.published_version_id AND NOT artifact.tenant_id IS DISTINCT FROM state.tenant_id AND (artifact.contract_hash IS DISTINCT FROM state.contract_hash OR artifact.materialized_hash IS DISTINCT FROM state.materialized_hash OR artifact.compiled_hash IS DISTINCT FROM
                        CASE artifact.plane_key
                            WHEN 'admin'::text THEN state.admin_compiled_hash
                            WHEN 'neon'::text THEN state.neon_compiled_hash
                            WHEN 'mesh'::text THEN state.mesh_compiled_hash
                            ELSE NULL::text
                        END)) AS plane_artifact_hash_mismatches,
            COALESCE((published.contract_document #>> '{catalog,enabled}'::text[])::boolean, false) AS catalog_enabled,
            COALESCE((published.contract_document #>> '{runtime,catalog_enabled}'::text[])::boolean, false) AS runtime_catalog_enabled,
            COALESCE((published.contract_document #>> '{runtime,runtime_enabled}'::text[])::boolean, false) AS runtime_enabled,
            published.contract_document #>> '{runtime,api_exposure}'::text[] AS api_exposure,
            ARRAY( SELECT jsonb_array_elements_text(
                        CASE
                            WHEN jsonb_typeof(published.contract_document #> '{catalog,plane_eligibility}'::text[]) = 'array'::text THEN published.contract_document #> '{catalog,plane_eligibility}'::text[]
                            ELSE '[]'::jsonb
                        END) AS jsonb_array_elements_text) AS plane_eligibility,
            rls.rls_table_count,
            rls.forced_rls_table_count,
            fk.version_owner_fk_count
           FROM control.entity entity
             LEFT JOIN control.entity_publish_state state ON state.entity_id = entity.id AND NOT state.tenant_id IS DISTINCT FROM entity.tenant_id
             LEFT JOIN control.entity_version published ON published.id = state.published_version_id
             LEFT JOIN control.entity_version draft ON draft.id = state.current_draft_version_id
             CROSS JOIN LATERAL ( SELECT count(*) FILTER (WHERE class.relrowsecurity) AS rls_table_count,
                    count(*) FILTER (WHERE class.relforcerowsecurity) AS forced_rls_table_count
                   FROM pg_class class
                     JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
                  WHERE namespace.nspname = 'control'::name AND (class.relname = ANY (ARRAY['entity_flow'::text, 'entity_flow_step'::text, 'entity_flow_section'::text, 'entity_flow_field'::text, 'entity_lifecycle_state_mask'::text, 'entity_numbering_config'::text, 'entity_numbering_counter'::text]))) rls
             CROSS JOIN LATERAL ( SELECT count(*) AS version_owner_fk_count
                   FROM pg_constraint constraint_record
                     JOIN pg_class class ON class.oid = constraint_record.conrelid
                     JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
                  WHERE namespace.nspname = 'control'::name AND constraint_record.contype = 'f'::"char" AND (class.relname = ANY (ARRAY['entity_field'::text, 'entity_relation'::text, 'entity_surface'::text, 'entity_operation'::text, 'entity_action_rule'::text, 'entity_lifecycle'::text, 'entity_lifecycle_state_mask'::text, 'entity_numbering_config'::text, 'entity_flow'::text])) AND pg_get_constraintdef(constraint_record.oid) ~~ '%entity_version%'::text) fk
        ), classified AS (
         SELECT base.entity_id,
            base.entity_code,
            base.tenant_id,
            base.published_version_id,
            base.current_draft_version_id,
            base.published_status,
            base.draft_status,
            base.contract_schema_version,
            base.contract_hash,
            base.publish_contract_hash,
            base.projection_hash,
            base.materialized_hash,
            base.admin_compiled_hash,
            base.neon_compiled_hash,
            base.mesh_compiled_hash,
            base.readiness_status,
            base.readiness_diagnostics,
            base.contract_document,
            base.expected_relations,
            base.expected_operations,
            base.expected_numbering,
            base.expected_flows,
            base.expected_action_rules,
            base.expected_lifecycle_masks,
            base.expected_flow_steps,
            base.expected_flow_sections,
            base.expected_flow_fields,
            base.actual_relations,
            base.actual_operations,
            base.actual_numbering,
            base.actual_lifecycle_masks,
            base.actual_action_rules,
            base.actual_flows,
            base.actual_flow_steps,
            base.actual_flow_sections,
            base.actual_flow_fields,
            base.runtime_counter_count,
            base.plane_artifact_count,
            base.plane_artifact_hash_mismatches,
            base.catalog_enabled,
            base.runtime_catalog_enabled,
            base.runtime_enabled,
            base.api_exposure,
            base.plane_eligibility,
            base.rls_table_count,
            base.forced_rls_table_count,
            base.version_owner_fk_count,
            base.published_version_id IS NOT NULL AND base.published_status IS DISTINCT FROM 'EFFECTIVE'::text AS partial_publication,
            base.published_version_id IS NOT NULL AND (base.readiness_status IS DISTINCT FROM 'READY'::text OR base.contract_hash IS NULL OR base.publish_contract_hash IS DISTINCT FROM base.contract_hash OR base.projection_hash IS DISTINCT FROM base.materialized_hash OR base.plane_artifact_count <> 3 OR base.plane_artifact_hash_mismatches <> 0) AS hash_or_readiness_drift,
            base.expected_relations <> base.actual_relations OR base.expected_operations <> base.actual_operations OR base.expected_numbering <> base.actual_numbering OR base.expected_flows <> base.actual_flows OR base.expected_action_rules <> base.actual_action_rules OR base.expected_lifecycle_masks <> base.actual_lifecycle_masks OR base.expected_flow_steps <> base.actual_flow_steps OR base.expected_flow_sections <> base.actual_flow_sections OR base.expected_flow_fields <> base.actual_flow_fields AS relational_drift,
            base.rls_table_count <> 7 OR base.forced_rls_table_count <> 7 OR base.version_owner_fk_count < 9 AS security_posture_drift
           FROM base
        )
 SELECT entity_id,
    entity_code,
    tenant_id,
    published_version_id,
    current_draft_version_id,
    published_status,
    draft_status,
    contract_schema_version,
    contract_hash,
    publish_contract_hash,
    projection_hash,
    materialized_hash,
    admin_compiled_hash,
    neon_compiled_hash,
    mesh_compiled_hash,
    readiness_status,
    readiness_diagnostics,
    contract_document,
    expected_relations,
    expected_operations,
    expected_numbering,
    expected_flows,
    expected_action_rules,
    expected_lifecycle_masks,
    expected_flow_steps,
    expected_flow_sections,
    expected_flow_fields,
    actual_relations,
    actual_operations,
    actual_numbering,
    actual_lifecycle_masks,
    actual_action_rules,
    actual_flows,
    actual_flow_steps,
    actual_flow_sections,
    actual_flow_fields,
    runtime_counter_count,
    plane_artifact_count,
    plane_artifact_hash_mismatches,
    catalog_enabled,
    runtime_catalog_enabled,
    runtime_enabled,
    api_exposure,
    plane_eligibility,
    rls_table_count,
    forced_rls_table_count,
    version_owner_fk_count,
    partial_publication,
    hash_or_readiness_drift,
    relational_drift,
    security_posture_drift,
        CASE
            WHEN partial_publication THEN 'CRITICAL'::text
            WHEN hash_or_readiness_drift THEN 'CRITICAL'::text
            WHEN relational_drift THEN 'HIGH'::text
            WHEN security_posture_drift THEN 'HIGH'::text
            WHEN published_version_id IS NULL THEN 'WARN'::text
            WHEN contract_schema_version IS DISTINCT FROM '2.1'::text THEN 'WARN'::text
            ELSE 'INFO'::text
        END AS severity,
        CASE
            WHEN partial_publication THEN 'Atomically repoint to the previous immutable version; preserve transition evidence.'::text
            WHEN hash_or_readiness_drift THEN 'Stop cohort rollout, re-run validation/materialization/compile, and invalidate caches.'::text
            WHEN relational_drift THEN 'Quarantine migration; reconcile Contract owner arrays with version-owned projections.'::text
            WHEN security_posture_drift THEN 'Repair and FORCE RLS plus entity-version ownership foreign keys before rollout.'::text
            WHEN published_version_id IS NULL THEN 'Export legacy graph and create a reviewed v2.1 publication candidate.'::text
            WHEN contract_schema_version IS DISTINCT FROM '2.1'::text THEN 'Run deterministic v2.0 to v2.1 migration and review hydration diagnostics.'::text
            ELSE 'No remediation required.'::text
        END AS remediation_guidance
   FROM classified;

COMMENT ON VIEW "control"."v_meta_entity_contract_audit" IS 'M7 unified audit: pointers, Contract/projection/compiled drift, governed child coverage, plane exposure, runtime counter count, and RLS/FK posture.';

CREATE OR REPLACE VIEW "control"."v_entity_field_rule_coverage" AS
SELECT table_schema,
    table_name,
    entity_code,
    count(*) AS total_fields,
    count(*) FILTER (WHERE is_active) AS active_fields,
    count(*) FILTER (WHERE has_editable_in_status) AS fields_with_editable_gate,
    count(*) FILTER (WHERE has_visible_when) AS fields_with_visible_when,
    count(*) FILTER (WHERE is_computed) AS fields_flagged_computed,
    count(*) FILTER (WHERE missing_field_rule) AS fields_missing_rule,
    count(*) FILTER (WHERE visibility_legacy_present) AS fields_legacy_visibility,
    count(*) FILTER (WHERE suspected_unflagged_computed) AS fields_suspected_unflagged
   FROM control.v_entity_field_contract_audit
  GROUP BY table_schema, table_name, entity_code
  ORDER BY table_schema, table_name;

COMMENT ON VIEW "control"."v_entity_field_rule_coverage" IS 'Per-entity counts of field-rule coverage. Run after seed execution to verify editable_in_status / visible_when / is_computed rules landed for the targeted entities. fields_missing_rule and fields_suspected_unflagged should trend toward 0 for AP entities.';
