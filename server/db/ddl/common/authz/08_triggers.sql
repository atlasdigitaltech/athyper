-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
CREATE TRIGGER trg_permission_10_normalize
BEFORE INSERT OR UPDATE OF canonical_code
ON authz.permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_permission_20_definition_guard
BEFORE UPDATE ON authz.permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_permission_definition();

CREATE TRIGGER trg_permission_30_status_transition
BEFORE UPDATE OF status ON authz.permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('catalog');

CREATE TRIGGER trg_permission_40_status_changed
BEFORE UPDATE OF status ON authz.permission
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_permission_50_updated_at
BEFORE UPDATE ON authz.permission
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_permission_scope_kind_50_updated_at
BEFORE UPDATE ON authz.permission_scope_kind
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_permission_publish_valid
AFTER INSERT OR UPDATE OF status ON authz.permission
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_permission_publish();


CREATE TRIGGER trg_plane_membership_10_normalize
BEFORE INSERT OR UPDATE OF source_ref ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_plane_membership_20_identity_guard
BEFORE UPDATE ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_plane_membership_21_natural_key_guard
BEFORE UPDATE ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_plane_membership_30_active_subject
BEFORE INSERT OR UPDATE OF principal_id, status, effective_from, effective_until
ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_active_subject();

CREATE TRIGGER trg_plane_membership_40_status_transition
BEFORE UPDATE OF status ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('membership');

CREATE TRIGGER trg_plane_membership_50_status_changed
BEFORE UPDATE OF status ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_plane_membership_60_updated_at
BEFORE UPDATE ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_scope_target_10_normalize
BEFORE INSERT OR UPDATE OF scope_key, display_name ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_scope_target_20_identity_cycle_guard
BEFORE INSERT OR UPDATE OF
    id, tenant_id, scope_kind, scope_key, target_id, parent_scope_target_id, status
ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_scope_target();

CREATE TRIGGER trg_scope_target_30_status_transition
BEFORE UPDATE OF status ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('scope');

CREATE TRIGGER trg_scope_target_40_status_changed
BEFORE UPDATE OF status ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_scope_target_50_updated_at
BEFORE UPDATE ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_role_10_normalize
BEFORE INSERT OR UPDATE OF code, name, description, source_ref ON authz.role
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_role_20_identity_guard
BEFORE UPDATE ON authz.role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_role_21_natural_key_guard
BEFORE UPDATE ON authz.role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_role_30_status_transition
BEFORE UPDATE OF status ON authz.role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('definition');

CREATE TRIGGER trg_role_40_status_changed
BEFORE UPDATE OF status ON authz.role
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_role_50_updated_at
BEFORE UPDATE ON authz.role
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_role_activation_valid
AFTER INSERT OR UPDATE OF status ON authz.role
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_role_activation();

CREATE TRIGGER trg_role_permission_10_identity_guard
BEFORE UPDATE ON authz.role_permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_role_permission_20_parent_guard
BEFORE INSERT OR UPDATE OR DELETE ON authz.role_permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_role_permission();

CREATE TRIGGER trg_role_permission_50_updated_at
BEFORE UPDATE ON authz.role_permission
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_principal_group_10_normalize
BEFORE INSERT OR UPDATE OF code, name, description, source_ref
ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_principal_group_20_identity_guard
BEFORE UPDATE ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_principal_group_21_natural_key_guard
BEFORE UPDATE ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_principal_group_30_status_transition
BEFORE UPDATE OF status ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('scope');

CREATE TRIGGER trg_principal_group_40_status_changed
BEFORE UPDATE OF status ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_principal_group_50_updated_at
BEFORE UPDATE ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_group_member_10_normalize
BEFORE INSERT OR UPDATE OF source_ref ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_group_member_20_identity_guard
BEFORE UPDATE ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_group_member_21_natural_key_guard
BEFORE UPDATE ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_group_member_30_validate
BEFORE INSERT OR UPDATE OF
    tenant_id, group_id, principal_id, source_type, source_ref,
    status, effective_from, effective_until
ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_group_member();

CREATE TRIGGER trg_group_member_40_status_transition
BEFORE UPDATE OF status ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('authority');

CREATE TRIGGER trg_group_member_50_status_changed
BEFORE UPDATE OF status ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_group_member_60_updated_at
BEFORE UPDATE ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_group_role_10_normalize
BEFORE INSERT OR UPDATE OF source_ref ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_group_role_20_identity_guard
BEFORE UPDATE ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_group_role_21_natural_key_guard
BEFORE UPDATE ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_group_role_30_validate
BEFORE INSERT OR UPDATE OF
    tenant_id, group_id, role_id, scope_target_id,
    status, effective_from, effective_until
ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_group_role();

CREATE TRIGGER trg_group_role_40_status_transition
BEFORE UPDATE OF status ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('authority');

CREATE TRIGGER trg_group_role_50_status_changed
BEFORE UPDATE OF status ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_group_role_60_updated_at
BEFORE UPDATE ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_deny_rule_10_normalize
BEFORE INSERT OR UPDATE OF reason ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_deny_rule_20_identity_guard
BEFORE UPDATE ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_deny_rule_21_natural_key_guard
BEFORE UPDATE ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_deny_rule_30_validate_scope
BEFORE INSERT OR UPDATE OF tenant_id, permission_id, scope_target_id, status
ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_scoped_authority();

CREATE TRIGGER trg_deny_rule_40_status_transition
BEFORE UPDATE OF status ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('authority');

CREATE TRIGGER trg_deny_rule_50_status_changed
BEFORE UPDATE OF status ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_deny_rule_60_updated_at
BEFORE UPDATE ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_delegation_10_normalize
BEFORE INSERT OR UPDATE OF
    reason, approval_ticket, revocation_reason
ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_delegation_20_identity_guard
BEFORE UPDATE ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_delegation_21_natural_key_guard
BEFORE UPDATE ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_delegation_30_active_subject
BEFORE INSERT OR UPDATE OF
    tenant_id, delegator_id, delegate_id, status, effective_from, effective_until
ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_active_subject();

CREATE TRIGGER trg_delegation_40_status_transition
BEFORE UPDATE OF status ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('approval');

CREATE CONSTRAINT TRIGGER trg_delegation_activation_valid
AFTER INSERT OR UPDATE OF status ON authz.delegation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_delegation_activation();

CREATE TRIGGER trg_delegation_50_status_changed
BEFORE UPDATE OF status ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_delegation_60_updated_at
BEFORE UPDATE ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_delegation_grant_10_validate
BEFORE INSERT ON authz.delegation_grant
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_scoped_authority();

CREATE TRIGGER trg_delegation_grant_20_parent_guard
BEFORE INSERT OR UPDATE OR DELETE ON authz.delegation_grant
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_delegation_grant();

CREATE TRIGGER trg_override_10_normalize
BEFORE INSERT OR UPDATE OF reason, approval_ticket, revocation_reason
ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_override_20_identity_guard
BEFORE UPDATE ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_override_21_natural_key_guard
BEFORE UPDATE ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_override_30_validate_scope
BEFORE INSERT OR UPDATE OF tenant_id, permission_id, scope_target_id, status
ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_scoped_authority();

CREATE TRIGGER trg_override_31_active_subject
BEFORE INSERT OR UPDATE OF
    tenant_id, principal_id, status, effective_from, effective_until
ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_active_subject();

CREATE TRIGGER trg_override_40_status_transition
BEFORE UPDATE OF status ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('approval');

CREATE TRIGGER trg_override_50_status_changed
BEFORE UPDATE OF status ON authz.override
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_override_60_updated_at
BEFORE UPDATE ON authz.override
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_record_acl_10_normalize
BEFORE INSERT OR UPDATE OF resource_code, reason, revocation_reason
ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_codes();

CREATE TRIGGER trg_record_acl_20_identity_guard
BEFORE UPDATE ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_tenant_row_identity();

CREATE TRIGGER trg_record_acl_21_natural_key_guard
BEFORE UPDATE ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_natural_key();

CREATE TRIGGER trg_record_acl_30_validate_permission
BEFORE INSERT OR UPDATE OF resource_code, permission_id
ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_scoped_authority();

CREATE TRIGGER trg_record_acl_31_active_subject
BEFORE INSERT OR UPDATE OF
    tenant_id, subject_kind, principal_id, group_id, status,
    effective_from, effective_until
ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_active_subject();

CREATE TRIGGER trg_record_acl_40_status_transition
BEFORE UPDATE OF status ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_status_transition('acl');

CREATE TRIGGER trg_record_acl_50_status_changed
BEFORE UPDATE OF status ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_record_acl_60_updated_at
BEFORE UPDATE ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- Creation, lifecycle, approval, and revocation evidence is append-only.
CREATE TRIGGER trg_permission_35_audit_evidence
BEFORE UPDATE ON authz.permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_plane_membership_35_audit_evidence
BEFORE UPDATE ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_scope_target_35_audit_evidence
BEFORE UPDATE ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_role_35_audit_evidence
BEFORE UPDATE ON authz.role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_principal_group_35_audit_evidence
BEFORE UPDATE ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_group_member_35_audit_evidence
BEFORE UPDATE ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_group_role_35_audit_evidence
BEFORE UPDATE ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_deny_rule_35_audit_evidence
BEFORE UPDATE ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_delegation_35_audit_evidence
BEFORE UPDATE ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_override_35_audit_evidence
BEFORE UPDATE ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

CREATE TRIGGER trg_record_acl_35_audit_evidence
BEFORE UPDATE ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_audit_evidence();

-- Rows that have participated in an authorization decision are retained.
CREATE TRIGGER trg_permission_90_delete_guard
BEFORE DELETE ON authz.permission
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_plane_membership_90_delete_guard
BEFORE DELETE ON authz.plane_membership
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_scope_target_90_delete_guard
BEFORE DELETE ON authz.scope_target
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_role_90_delete_guard
BEFORE DELETE ON authz.role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_principal_group_90_delete_guard
BEFORE DELETE ON authz.principal_group
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_group_member_90_delete_guard
BEFORE DELETE ON authz.group_member
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_group_role_90_delete_guard
BEFORE DELETE ON authz.group_role
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_deny_rule_90_delete_guard
BEFORE DELETE ON authz.deny_rule
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_delegation_90_delete_guard
BEFORE DELETE ON authz.delegation
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_override_90_delete_guard
BEFORE DELETE ON authz.override
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_record_acl_90_delete_guard
BEFORE DELETE ON authz.record_acl
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_authority_delete();

CREATE TRIGGER trg_trusted_device_20_guard
BEFORE UPDATE ON authz.trusted_device
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_trusted_device();

-- Athyper-published and reconciled authorization projections.
DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['application_projection','projection_provider','projection_scope'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON authz.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table||'_updated_at',v_table); END LOOP; END $$;
CREATE TRIGGER application_projection_status_changed BEFORE UPDATE OF status ON authz.application_projection FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE OR REPLACE FUNCTION event.trg_capture_authorization_invalidation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = event, pg_catalog AS $$
DECLARE
    v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    v_tenant_id uuid;
    v_scope_kind text := 'global';
    v_plane_code text;
    v_key jsonb;
BEGIN
    BEGIN v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant_id := NULL; END;
    IF v_tenant_id IS NOT NULL THEN
      v_scope_kind := 'plane';
      v_plane_code := current_setting('app.database_plane', true);
    END IF;
    v_key := jsonb_strip_nulls(v_row - ARRAY['created_at','created_by','updated_at','updated_by','status_changed_at','status_changed_by']);
    IF v_key = '{}'::jsonb THEN v_key := jsonb_build_object('table', TG_TABLE_NAME); END IF;
    PERFORM event.fn_authorization_emit_invalidation(
      encode(public.digest(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || TG_OP || ':' || v_key::text || ':' || txid_current()::text, 'sha256'), 'hex'),
      v_scope_kind, v_tenant_id, v_plane_code, TG_TABLE_NAME, substr(TG_OP,1,1)::char(1), v_key);
    RETURN NULL;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
  FOR v_table IN SELECT tablename FROM pg_tables WHERE schemaname = 'authz'
  LOOP
    EXECUTE format('CREATE TRIGGER trg_authorization_invalidation_capture AFTER INSERT OR UPDATE OR DELETE ON authz.%I FOR EACH ROW EXECUTE FUNCTION event.trg_capture_authorization_invalidation()', v_table);
  END LOOP;
END;
$$;

CREATE TRIGGER entity_operation_binding_10_normalize BEFORE INSERT OR UPDATE ON authz.entity_operation_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_entity_operation_binding();
CREATE TRIGGER entity_operation_binding_20_guard BEFORE UPDATE ON authz.entity_operation_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_binding();
CREATE TRIGGER entity_operation_binding_30_validate BEFORE INSERT OR UPDATE ON authz.entity_operation_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_validate_entity_operation_binding();
CREATE TRIGGER entity_operation_binding_90_delete_guard BEFORE DELETE ON authz.entity_operation_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_binding_delete();

CREATE TRIGGER entity_operation_scope_binding_10_normalize BEFORE INSERT OR UPDATE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_normalize_entity_operation_scope_binding();
CREATE TRIGGER entity_operation_scope_binding_20_guard BEFORE UPDATE OR DELETE ON authz.entity_operation_scope_binding
FOR EACH ROW EXECUTE FUNCTION authz.trg_guard_entity_operation_scope_binding();

SELECT audit.install_schema_row_triggers('authz');
