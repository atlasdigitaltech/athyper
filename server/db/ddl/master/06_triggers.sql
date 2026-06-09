-- ============================================================================
-- master/06_triggers.sql
-- Concept: Identity Triggers — principal, tenant, contact, and auth cascade triggers
-- Depends on: 04_tables/003a–003f_master_*.sql, 08_functions/003_master.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================

-- updated_at
DROP TRIGGER IF EXISTS trg_tenant_updated_at ON master.tenant;
CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- status_changed_at
DROP TRIGGER IF EXISTS trg_tenant_status_changed ON master.tenant;
CREATE TRIGGER trg_tenant_status_changed BEFORE UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- status transition guard
DROP TRIGGER IF EXISTS trg_tenant_status_transition ON master.tenant;
CREATE TRIGGER trg_tenant_status_transition BEFORE UPDATE OF status ON master.tenant FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_status_transition();

-- tenant_admin_grant
DROP TRIGGER IF EXISTS trg_tenant_admin_grant_updated_at ON master.tenant_admin_grant;
CREATE TRIGGER trg_tenant_admin_grant_updated_at BEFORE UPDATE ON master.tenant_admin_grant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_admin_grant_status_changed ON master.tenant_admin_grant;
CREATE TRIGGER trg_tenant_admin_grant_status_changed BEFORE UPDATE OF status ON master.tenant_admin_grant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- principal
DROP TRIGGER IF EXISTS trg_principal_updated_at ON master.principal;
CREATE TRIGGER trg_principal_updated_at BEFORE UPDATE ON master.principal FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_principal_status_changed ON master.principal;
CREATE TRIGGER trg_principal_status_changed BEFORE UPDATE ON master.principal FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- principal_profile
DROP TRIGGER IF EXISTS trg_principal_profile_updated_at ON master.principal_profile;
CREATE TRIGGER trg_principal_profile_updated_at BEFORE UPDATE ON master.principal_profile FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- principal_profile: service_client guard (replaces invalid CHECK subquery)
DROP TRIGGER IF EXISTS trg_principal_profile_service_client ON master.principal_profile;
CREATE TRIGGER trg_principal_profile_service_client BEFORE INSERT OR UPDATE OF keycloak_service_client_id ON master.principal_profile FOR EACH ROW EXECUTE FUNCTION master.trg_guard_service_client();

-- contact_link
-- Value normalization — 'trg_a_' prefix ensures alphabetical firing BEFORE all
-- other contact_link BEFORE triggers (channel_type_lookup, owner_type_guard, etc.)
-- tenant_relationship
DROP TRIGGER IF EXISTS trg_tenant_relationship_updated_at ON master.tenant_relationship;
CREATE TRIGGER trg_tenant_relationship_updated_at BEFORE UPDATE ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_relationship_status_changed ON master.tenant_relationship;
CREATE TRIGGER trg_tenant_relationship_status_changed BEFORE UPDATE OF status ON master.tenant_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- principal_relationship
DROP TRIGGER IF EXISTS trg_principal_relationship_updated_at ON master.principal_relationship;
CREATE TRIGGER trg_principal_relationship_updated_at BEFORE UPDATE ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_principal_relationship_status_changed ON master.principal_relationship;
CREATE TRIGGER trg_principal_relationship_status_changed BEFORE UPDATE OF status ON master.principal_relationship FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_contact_link_a_normalize_value ON master.contact_link;
DROP TRIGGER IF EXISTS trg_a_contact_link_normalize ON master.contact_link;
CREATE TRIGGER trg_a_contact_link_normalize
    BEFORE INSERT OR UPDATE OF value, channel_type, purpose, code, name
    ON master.contact_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_contact_link_value();

DROP TRIGGER IF EXISTS trg_contact_link_updated_at ON master.contact_link;
CREATE TRIGGER trg_contact_link_updated_at BEFORE UPDATE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_contact_link_status_changed ON master.contact_link;
CREATE TRIGGER trg_contact_link_status_changed BEFORE UPDATE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- contact_link: sync login_email cache on principal (INSERT + UPDATE + DELETE)
DROP TRIGGER IF EXISTS trg_sync_principal_login_email ON master.contact_link;
DROP TRIGGER IF EXISTS trg_contact_link_sync_login_email ON master.contact_link;
CREATE TRIGGER trg_contact_link_sync_login_email AFTER INSERT OR UPDATE OR DELETE ON master.contact_link FOR EACH ROW EXECUTE FUNCTION master.fn_sync_principal_login_email();

-- contact_email
DROP TRIGGER IF EXISTS trg_contact_email_updated_at ON master.contact_email;
CREATE TRIGGER trg_contact_email_updated_at BEFORE UPDATE ON master.contact_email FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_contact_email_channel_guard ON master.contact_email;
CREATE TRIGGER trg_contact_email_channel_guard BEFORE INSERT OR UPDATE OF contact_link_id, tenant_id ON master.contact_email FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_email_channel();

-- contact_phone
DROP TRIGGER IF EXISTS trg_contact_phone_updated_at ON master.contact_phone;
CREATE TRIGGER trg_contact_phone_updated_at BEFORE UPDATE ON master.contact_phone FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_contact_phone_channel_guard ON master.contact_phone;
CREATE TRIGGER trg_contact_phone_channel_guard BEFORE INSERT OR UPDATE OF contact_link_id, tenant_id ON master.contact_phone FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_phone_channel();

-- label
DROP TRIGGER IF EXISTS trg_label_updated_at ON master.label;
CREATE TRIGGER trg_label_updated_at BEFORE UPDATE ON master.label FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_label_validate ON master.label;
CREATE TRIGGER trg_label_validate BEFORE INSERT OR UPDATE ON master.label FOR EACH ROW EXECUTE FUNCTION master.trg_label_validate();

-- label_entity_type
DROP TRIGGER IF EXISTS trg_label_entity_type_updated_at ON master.label_entity_type;
CREATE TRIGGER trg_label_entity_type_updated_at BEFORE UPDATE ON master.label_entity_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_label_entity_type_check ON master.label_entity_type;
CREATE TRIGGER trg_label_entity_type_check BEFORE INSERT OR UPDATE ON master.label_entity_type FOR EACH ROW EXECUTE FUNCTION master.trg_label_entity_type_validate();

-- owner_type
DROP TRIGGER IF EXISTS trg_owner_type_updated_at ON master.owner_type;
CREATE TRIGGER trg_owner_type_updated_at BEFORE UPDATE ON master.owner_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_owner_type_status_changed ON master.owner_type;
CREATE TRIGGER trg_owner_type_status_changed BEFORE UPDATE ON master.owner_type FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- owner_type: block DELETE/deprecation when active references exist
DROP TRIGGER IF EXISTS trg_owner_type_in_use_guard ON master.owner_type;
CREATE TRIGGER trg_owner_type_in_use_guard
    BEFORE DELETE OR UPDATE OF status ON master.owner_type
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_owner_type_in_use();

-- owner_type: block code renames (system codes always, tenant codes when referenced)
DROP TRIGGER IF EXISTS trg_owner_type_immutable_code ON master.owner_type;
CREATE TRIGGER trg_owner_type_immutable_code
    BEFORE UPDATE OF code ON master.owner_type
    FOR EACH ROW EXECUTE FUNCTION master.trg_immutable_owner_type_code();

-- owner_type: prevent tenant rows from shadowing system codes
DROP TRIGGER IF EXISTS trg_owner_type_no_shadow ON master.owner_type;
CREATE TRIGGER trg_owner_type_no_shadow
    BEFORE INSERT OR UPDATE OF code, tenant_id ON master.owner_type
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_owner_type_no_shadow();

-- owner_type: validate routing metadata against catalog
DROP TRIGGER IF EXISTS trg_owner_type_validate ON master.owner_type;
CREATE TRIGGER trg_owner_type_validate
    BEFORE INSERT OR UPDATE OF schema_name, table_name, pk_column,
                               is_tenant_scoped, tenant_column
    ON master.owner_type
    FOR EACH ROW EXECUTE FUNCTION master.trg_owner_type_validate();

-- address
DROP TRIGGER IF EXISTS trg_address_updated_at ON master.address;
CREATE TRIGGER trg_address_updated_at BEFORE UPDATE ON master.address FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_address_status_changed ON master.address;
CREATE TRIGGER trg_address_status_changed BEFORE UPDATE ON master.address FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- address_link
DROP TRIGGER IF EXISTS trg_address_link_updated_at ON master.address_link;
CREATE TRIGGER trg_address_link_updated_at BEFORE UPDATE ON master.address_link FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ============================================================================
-- Lookup domain validation triggers (replaces session-dependent CHECK constraints)
-- Uses control.trg_validate_lookup_columns(domain_code, column_name).
-- ============================================================================

-- tenant.subscription
DROP TRIGGER IF EXISTS trg_tenant_subscription_lookup ON master.tenant;
CREATE TRIGGER trg_tenant_subscription_lookup
    BEFORE INSERT OR UPDATE OF subscription ON master.tenant
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_subscription', 'subscription');

-- tenant.tenant_type
DROP TRIGGER IF EXISTS trg_tenant_type_lookup ON master.tenant;
CREATE TRIGGER trg_tenant_type_lookup
    BEFORE INSERT OR UPDATE OF tenant_type ON master.tenant
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_type', 'tenant_type');

-- principal.principal_type
DROP TRIGGER IF EXISTS trg_principal_type_lookup ON master.principal;
CREATE TRIGGER trg_principal_type_lookup
    BEFORE INSERT OR UPDATE OF principal_type ON master.principal
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_type', 'principal_type');

-- tenant_relationship
DROP TRIGGER IF EXISTS trg_tenant_relationship_type_lookup ON master.tenant_relationship;
CREATE TRIGGER trg_tenant_relationship_type_lookup
    BEFORE INSERT OR UPDATE OF relationship_type ON master.tenant_relationship
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_relationship_type', 'relationship_type');

DROP TRIGGER IF EXISTS trg_tenant_relationship_direction_lookup ON master.tenant_relationship;
CREATE TRIGGER trg_tenant_relationship_direction_lookup
    BEFORE INSERT OR UPDATE OF relationship_direction ON master.tenant_relationship
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_relationship_direction', 'relationship_direction');

DROP TRIGGER IF EXISTS trg_tenant_relationship_status_lookup ON master.tenant_relationship;
CREATE TRIGGER trg_tenant_relationship_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.tenant_relationship
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_relationship_status', 'status');

-- principal_relationship
DROP TRIGGER IF EXISTS trg_principal_relationship_type_lookup ON master.principal_relationship;
CREATE TRIGGER trg_principal_relationship_type_lookup
    BEFORE INSERT OR UPDATE OF relationship_type ON master.principal_relationship
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_relationship_type', 'relationship_type');

DROP TRIGGER IF EXISTS trg_principal_relationship_verification_status_lookup ON master.principal_relationship;
CREATE TRIGGER trg_principal_relationship_verification_status_lookup
    BEFORE INSERT OR UPDATE OF verification_status ON master.principal_relationship
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_relationship_verification_status', 'verification_status');

DROP TRIGGER IF EXISTS trg_principal_relationship_verified_method_lookup ON master.principal_relationship;
CREATE TRIGGER trg_principal_relationship_verified_method_lookup
    BEFORE INSERT OR UPDATE OF verified_method ON master.principal_relationship
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_relationship_verified_method', 'verified_method');

-- contact_link.channel_type
DROP TRIGGER IF EXISTS trg_contact_link_channel_type_lookup ON master.contact_link;
CREATE TRIGGER trg_contact_link_channel_type_lookup
    BEFORE INSERT OR UPDATE OF channel_type ON master.contact_link
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.contact_link_channel_type', 'channel_type');

-- contact_link.purpose (nullable — trg_validate_lookup_columns handles NULL)
DROP TRIGGER IF EXISTS trg_contact_link_purpose_lookup ON master.contact_link;
CREATE TRIGGER trg_contact_link_purpose_lookup
    BEFORE INSERT OR UPDATE OF purpose ON master.contact_link
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.contact_link_purpose', 'purpose');

-- address.address_type (nullable)
DROP TRIGGER IF EXISTS trg_address_type_lookup ON master.address;
CREATE TRIGGER trg_address_type_lookup
    BEFORE INSERT OR UPDATE OF address_type ON master.address
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.address_type', 'address_type');

-- address_link.purpose
DROP TRIGGER IF EXISTS trg_address_link_purpose_lookup ON master.address_link;
CREATE TRIGGER trg_address_link_purpose_lookup
    BEFORE INSERT OR UPDATE OF purpose ON master.address_link
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.address_purpose', 'purpose');

-- ============================================================================
-- Owner type validation triggers (replaces session-dependent CHECK constraints)
-- Function: master.trg_validate_owner_type() defined in 08_functions/003_master.sql.
-- ============================================================================

-- address_link.owner_type
DROP TRIGGER IF EXISTS trg_address_link_owner_type_guard ON master.address_link;
CREATE TRIGGER trg_address_link_owner_type_guard
    BEFORE INSERT OR UPDATE OF owner_type ON master.address_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

-- contact_link.owner_type
DROP TRIGGER IF EXISTS trg_contact_link_owner_type_guard ON master.contact_link;
CREATE TRIGGER trg_contact_link_owner_type_guard
    BEFORE INSERT OR UPDATE OF owner_type ON master.contact_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

-- ============================================================================
-- Owner reference validation triggers
-- Function: master.trg_validate_owner_ref() defined in 08_functions/003_master.sql.
-- Validates that owner_id exists in the backing table for owner_type.
-- ============================================================================

-- contact_link.owner_id — 'trg_z_' prefix ensures alphabetical firing AFTER
-- trg_contact_link_owner_type_guard so type validation runs first.
DROP TRIGGER IF EXISTS trg_contact_link_owner_ref ON master.contact_link;
DROP TRIGGER IF EXISTS trg_z_contact_link_owner_ref ON master.contact_link;
CREATE TRIGGER trg_z_contact_link_owner_ref
    BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.contact_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();

-- address_link.owner_id — 'trg_z_' prefix ensures alphabetical firing AFTER
-- trg_address_link_owner_type_guard so type validation runs first.
DROP TRIGGER IF EXISTS trg_address_link_owner_ref ON master.address_link;
DROP TRIGGER IF EXISTS trg_z_address_link_owner_ref ON master.address_link;
CREATE TRIGGER trg_z_address_link_owner_ref
    BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.address_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();


-- ============================================================================
-- RBAC Phase 2 triggers
-- ============================================================================

-- operating_unit triggers removed — table dropped in company_code migration.

-- tenant_module_subscription
DROP TRIGGER IF EXISTS trg_tms_updated_at ON master.tenant_module_subscription;
CREATE TRIGGER trg_tms_updated_at BEFORE UPDATE ON master.tenant_module_subscription FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ============================================================================
-- RBAC Phase 3 triggers
-- ============================================================================

-- role (shared.role)
DROP TRIGGER IF EXISTS trg_role_updated_at ON shared.role;
CREATE TRIGGER trg_role_updated_at BEFORE UPDATE ON shared.role FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_role_status_changed ON shared.role;
CREATE TRIGGER trg_role_status_changed BEFORE UPDATE ON shared.role FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- auth_group
DROP TRIGGER IF EXISTS trg_auth_group_updated_at ON master.auth_group;
CREATE TRIGGER trg_auth_group_updated_at BEFORE UPDATE ON master.auth_group FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_auth_group_status_changed ON master.auth_group;
CREATE TRIGGER trg_auth_group_status_changed BEFORE UPDATE ON master.auth_group FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- auth_group_role
DROP TRIGGER IF EXISTS trg_auth_group_role_updated_at ON master.auth_group_role;
CREATE TRIGGER trg_auth_group_role_updated_at BEFORE UPDATE ON master.auth_group_role FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- team
DROP TRIGGER IF EXISTS trg_team_updated_at ON master.team;
CREATE TRIGGER trg_team_updated_at BEFORE UPDATE ON master.team FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_team_status_changed ON master.team;
CREATE TRIGGER trg_team_status_changed BEFORE UPDATE ON master.team FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- RBAC Phase 5: Outbox triggers — fire KC sync events on RBAC mutations
-- All use topic='iam'. Worker filters: WHERE topic = 'iam'.
-- ============================================================================

-- auth_group_member → iam / auth_group_membership
DROP TRIGGER IF EXISTS trg_agm_iam_outbox ON master.auth_group_member;
CREATE TRIGGER trg_agm_iam_outbox
    AFTER INSERT OR DELETE ON master.auth_group_member
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'auth_group_membership');

-- auth_group_role → iam / role_assignment
DROP TRIGGER IF EXISTS trg_auth_group_role_iam_outbox ON master.auth_group_role;
CREATE TRIGGER trg_auth_group_role_iam_outbox
    AFTER INSERT OR UPDATE OR DELETE ON master.auth_group_role
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'role_assignment');

-- principal_persona → iam / persona_assignment
DROP TRIGGER IF EXISTS trg_principal_persona_iam_outbox ON master.principal_persona;
CREATE TRIGGER trg_principal_persona_iam_outbox
    AFTER INSERT OR UPDATE OR DELETE ON master.principal_persona
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'persona_assignment');

-- principal_profile (default_company_code_id change) → iam / company_code_assignment
DROP TRIGGER IF EXISTS trg_principal_profile_ou_iam_outbox ON master.principal_profile;
CREATE TRIGGER trg_principal_profile_ou_iam_outbox
    AFTER UPDATE OF default_company_code_id ON master.principal_profile
    FOR EACH ROW WHEN (OLD.default_company_code_id IS DISTINCT FROM NEW.default_company_code_id)
    EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'company_code_assignment');

-- role — shared.role is a platform-level reference table; no per-tenant outbox events.
DROP TRIGGER IF EXISTS trg_role_iam_outbox_insert ON shared.role;
DROP TRIGGER IF EXISTS trg_role_iam_outbox_update ON shared.role;

-- auth_group → iam / group_created | group_updated
DROP TRIGGER IF EXISTS trg_auth_group_iam_outbox_insert ON master.auth_group;
CREATE TRIGGER trg_auth_group_iam_outbox_insert
    AFTER INSERT ON master.auth_group
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'group_created');

DROP TRIGGER IF EXISTS trg_auth_group_iam_outbox_update ON master.auth_group;
CREATE TRIGGER trg_auth_group_iam_outbox_update
    AFTER UPDATE ON master.auth_group
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'group_updated');

-- access_grant — updated_at / status_changed_at lifecycle
DROP TRIGGER IF EXISTS trg_access_grant_updated_at ON master.access_grant;
CREATE TRIGGER trg_access_grant_updated_at
    BEFORE UPDATE ON master.access_grant
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_access_grant_status_changed ON master.access_grant;
CREATE TRIGGER trg_access_grant_status_changed
    BEFORE UPDATE OF status ON master.access_grant
    FOR EACH ROW EXECUTE FUNCTION master.trg_access_grant_status_changed();

-- access_grant → iam / access_grant_changed
DROP TRIGGER IF EXISTS trg_access_grant_iam_outbox ON master.access_grant;
CREATE TRIGGER trg_access_grant_iam_outbox
    AFTER INSERT OR UPDATE OR DELETE ON master.access_grant
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'access_grant_changed');

-- group_feature_grant / principal_feature_grant → iam / feature_grant_changed
DROP TRIGGER IF EXISTS trg_gfg_iam_outbox ON master.group_feature_grant;
CREATE TRIGGER trg_gfg_iam_outbox
    AFTER INSERT OR DELETE ON master.group_feature_grant
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'feature_grant_changed');

DROP TRIGGER IF EXISTS trg_pfg_iam_outbox ON master.principal_feature_grant;
CREATE TRIGGER trg_pfg_iam_outbox
    AFTER INSERT OR DELETE ON master.principal_feature_grant
    FOR EACH ROW EXECUTE FUNCTION master.trg_emit_outbox_event('iam', 'feature_grant_changed');


-- ============================================================================
-- §27  notification (per-recipient inbox)
-- ============================================================================

-- updated_at stamp (partitioned — fires on all children via parent trigger)
DROP TRIGGER IF EXISTS trg_notif_updated_at ON master.notification;
CREATE TRIGGER trg_notif_updated_at
    BEFORE UPDATE ON master.notification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- channel lookup validation
DROP TRIGGER IF EXISTS trg_notif_channel_lookup ON master.notification;
CREATE TRIGGER trg_notif_channel_lookup
    BEFORE INSERT OR UPDATE OF channel ON master.notification
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.channel', 'channel');

-- priority lookup validation
DROP TRIGGER IF EXISTS trg_notif_priority_lookup ON master.notification;
CREATE TRIGGER trg_notif_priority_lookup
    BEFORE INSERT OR UPDATE OF priority ON master.notification
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.priority', 'priority');

-- category lookup validation (nullable — trg_validate short-circuits on NULL)
DROP TRIGGER IF EXISTS trg_notif_category_lookup ON master.notification;
CREATE TRIGGER trg_notif_category_lookup
    BEFORE INSERT OR UPDATE OF category ON master.notification
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('notification.category', 'category');

-- 09_triggers/012_identity_sharing.sql
-- Triggers for master.tenant_profile and master.delegation_grant.
-- Depends on: 04_tables/012_identity_sharing.sql,
--             900_seed_data/012_identity_sharing/001_lookup_domains.sql,
--             08_functions/001_shared.sql (shared.trg_set_updated_at),
--             08_functions/002_control.sql (control.trg_validate_lookup_columns)


-- ============================================================================
-- A. UPDATED_AT STAMPS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_tp_updated_at ON master.tenant_profile;
CREATE TRIGGER trg_tp_updated_at
    BEFORE UPDATE ON master.tenant_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dg_updated_at ON master.delegation_grant;
CREATE TRIGGER trg_dg_updated_at
    BEFORE UPDATE ON master.delegation_grant
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ============================================================================
-- B. LOOKUP VALIDATION — delegation_grant.scope_type
-- ============================================================================

DROP TRIGGER IF EXISTS trg_dg_scope_type_lookup ON master.delegation_grant;
CREATE TRIGGER trg_dg_scope_type_lookup
    BEFORE INSERT OR UPDATE OF scope_type ON master.delegation_grant
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.delegation_scope', 'scope_type');


-- ============================================================================
-- C. DELEGATION_GRANT — permissions[] validator
-- ============================================================================
-- Validates every code in permissions[] exists in shared.permission.
-- Empty array is valid (means all delegator permissions within scope).

CREATE OR REPLACE FUNCTION master.trg_validate_delegation_permissions()
RETURNS trigger LANGUAGE plpgsql SET search_path = master, shared AS $$
DECLARE
    v_code text;
BEGIN
    IF NEW.permissions IS NOT NULL AND array_length(NEW.permissions, 1) > 0 THEN
        FOREACH v_code IN ARRAY NEW.permissions LOOP
            IF NOT EXISTS (
                SELECT 1 FROM shared.permission
                WHERE code = v_code AND status = 'active'
            ) THEN
                RAISE EXCEPTION
                    'master.delegation_grant.permissions: invalid permission code "%". '
                    'Must be an active shared.permission.code value.',
                    v_code
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_delegation_permissions() IS
    'Validates each code in delegation_grant.permissions[] against '
    'shared.permission.code where status=''active''. '
    'Empty array is valid — means all delegator permissions within scope.';

DROP TRIGGER IF EXISTS trg_dg_permissions_validate ON master.delegation_grant;
CREATE TRIGGER trg_dg_permissions_validate
    BEFORE INSERT OR UPDATE OF permissions ON master.delegation_grant
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_delegation_permissions();


-- ============================================================================
-- D. DELEGATION_GRANT — immutability guard on core columns after activation
-- ============================================================================
-- Core columns (delegator_id, delegate_id, scope_type, scope_ref, permissions,
-- request_id) are immutable after INSERT.
-- Only lifecycle columns (is_revoked, revoked_at, revoked_by, revoke_reason,
-- expires_at, updated_at, updated_by) may be updated.

CREATE OR REPLACE FUNCTION master.trg_guard_delegation_grant_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF OLD.delegator_id   IS DISTINCT FROM NEW.delegator_id
    OR OLD.delegate_id    IS DISTINCT FROM NEW.delegate_id
    OR OLD.scope_type     IS DISTINCT FROM NEW.scope_type
    OR OLD.scope_ref      IS DISTINCT FROM NEW.scope_ref
    OR OLD.permissions    IS DISTINCT FROM NEW.permissions
    OR OLD.request_id     IS DISTINCT FROM NEW.request_id
    OR OLD.tenant_id      IS DISTINCT FROM NEW.tenant_id
    OR OLD.created_at     IS DISTINCT FROM NEW.created_at
    OR OLD.created_by     IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'master.delegation_grant: core grant columns are immutable after creation. '
            'Only lifecycle columns (is_revoked, revoked_at, revoked_by, '
            'revoke_reason, expires_at) may be updated.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_guard_delegation_grant_mutation() IS
    'Immutability guard for master.delegation_grant core columns. '
    'Allows update of: is_revoked, revoked_at, revoked_by, revoke_reason, '
    'expires_at, updated_at, updated_by. '
    'Blocks change of: delegator_id, delegate_id, scope_type, scope_ref, '
    'permissions, request_id, tenant_id, created_at, created_by.';

DROP TRIGGER IF EXISTS trg_dg_mutation_guard ON master.delegation_grant;
CREATE TRIGGER trg_dg_mutation_guard
    BEFORE UPDATE ON master.delegation_grant
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_delegation_grant_mutation();

-- 09_triggers/013_collab.sql
-- Triggers for collaboration cluster — all 11 tables.
-- Depends on: 04_tables/013_collab.sql, 900_seed_data/013_collab/001_lookup_domains.sql,
--             08_functions/002_control.sql (control.trg_validate_lookup_columns),
--             08_functions/001_shared.sql (shared.trg_set_updated_at)


-- ============================================================================
-- A. UPDATED_AT STAMPS
-- ============================================================================
DROP TRIGGER IF EXISTS trg_attachment_updated_at       ON master.attachment;
DROP TRIGGER IF EXISTS trg_mpu_updated_at              ON master.multipart_upload;
DROP TRIGGER IF EXISTS trg_comment_updated_at          ON master.comment;
DROP TRIGGER IF EXISTS trg_comment_draft_updated_at    ON master.comment_draft;
DROP TRIGGER IF EXISTS trg_cp_updated_at               ON master.conversation_participant;
DROP TRIGGER IF EXISTS trg_conv_updated_at             ON master.conversation;
DROP TRIGGER IF EXISTS trg_cf_updated_at               ON event.comment_flag;
DROP TRIGGER IF EXISTS trg_gmod_updated_at             ON governance.comment_moderation;

CREATE TRIGGER trg_attachment_updated_at
    BEFORE UPDATE ON master.attachment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mpu_updated_at
    BEFORE UPDATE ON master.multipart_upload
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_comment_updated_at
    BEFORE UPDATE ON master.comment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_comment_draft_updated_at
    BEFORE UPDATE ON master.comment_draft
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_conv_updated_at
    BEFORE UPDATE ON master.conversation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cp_updated_at
    BEFORE UPDATE ON master.conversation_participant
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cf_updated_at
    BEFORE UPDATE ON event.comment_flag
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_gmod_updated_at
    BEFORE UPDATE ON governance.comment_moderation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ============================================================================
-- B. LOOKUP VALIDATION TRIGGERS
-- ============================================================================

-- master.comment_type — context_type on all 5 tables
DROP TRIGGER IF EXISTS trg_comment_context_type_lookup    ON master.comment;
DROP TRIGGER IF EXISTS trg_cd_context_type_lookup         ON master.comment_draft;
DROP TRIGGER IF EXISTS trg_cm_context_type_lookup         ON master.comment_mention;
DROP TRIGGER IF EXISTS trg_cr_context_type_lookup         ON master.comment_reaction;
DROP TRIGGER IF EXISTS trg_cf_context_type_lookup         ON event.comment_flag;
DROP TRIGGER IF EXISTS trg_gmod_context_type_lookup       ON governance.comment_moderation;

CREATE TRIGGER trg_comment_context_type_lookup
    BEFORE INSERT OR UPDATE OF context_type ON master.comment
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.comment_type', 'context_type');

CREATE TRIGGER trg_cd_context_type_lookup
    BEFORE INSERT OR UPDATE OF context_type ON master.comment_draft
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.comment_type', 'context_type');

CREATE TRIGGER trg_cm_context_type_lookup
    BEFORE INSERT OR UPDATE OF context_type ON master.comment_mention
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.comment_type', 'context_type');

CREATE TRIGGER trg_cr_context_type_lookup
    BEFORE INSERT OR UPDATE OF context_type ON master.comment_reaction
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.comment_type', 'context_type');

CREATE TRIGGER trg_cf_context_type_lookup
    BEFORE INSERT OR UPDATE OF context_type ON event.comment_flag
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.comment_type', 'context_type');

CREATE TRIGGER trg_gmod_context_type_lookup
    BEFORE INSERT OR UPDATE OF context_type ON governance.comment_moderation
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.comment_type', 'context_type');

-- master.reaction_type
DROP TRIGGER IF EXISTS trg_cr_reaction_type_lookup ON master.comment_reaction;
CREATE TRIGGER trg_cr_reaction_type_lookup
    BEFORE INSERT OR UPDATE OF reaction_type ON master.comment_reaction
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.reaction_type', 'reaction_type');

-- master.flag_reason
DROP TRIGGER IF EXISTS trg_cf_flag_reason_lookup ON event.comment_flag;
CREATE TRIGGER trg_cf_flag_reason_lookup
    BEFORE INSERT OR UPDATE OF flag_reason ON event.comment_flag
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.flag_reason', 'flag_reason');

-- master.conversation_type
DROP TRIGGER IF EXISTS trg_conv_type_lookup ON master.conversation;
CREATE TRIGGER trg_conv_type_lookup
    BEFORE INSERT OR UPDATE OF type ON master.conversation
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.conversation_type', 'type');

-- master.attachment_kind
DROP TRIGGER IF EXISTS trg_attachment_kind_lookup ON master.attachment;
CREATE TRIGGER trg_attachment_kind_lookup
    BEFORE INSERT OR UPDATE OF kind ON master.attachment
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.attachment_kind', 'kind');


-- ============================================================================
-- C. COMMENT HIERARCHY GUARD
-- ============================================================================
-- Enforces: parent comment must belong to same (tenant, context_type, entity_type, entity_id)
-- and thread_depth = parent.thread_depth + 1

CREATE OR REPLACE FUNCTION master.trg_comment_hierarchy_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_parent master.comment;
BEGIN
    IF NEW.parent_comment_id IS NULL THEN
        -- Root comment: depth must be 0
        IF NEW.thread_depth <> 0 THEN
            RAISE EXCEPTION 'master.comment: root comment (no parent) must have thread_depth=0, got %',
                NEW.thread_depth USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- Fetch parent — must be same tenant
    SELECT * INTO v_parent
      FROM master.comment
     WHERE id = NEW.parent_comment_id AND tenant_id = NEW.tenant_id;

    IF v_parent IS NULL THEN
        RAISE EXCEPTION 'master.comment: parent_comment_id % not found in tenant %',
            NEW.parent_comment_id, NEW.tenant_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Parent must be same context surface
    IF v_parent.context_type <> NEW.context_type
       OR v_parent.entity_type <> NEW.entity_type
       OR v_parent.entity_id   <> NEW.entity_id THEN
        RAISE EXCEPTION
            'master.comment: parent comment must belong to the same '
            '(context_type, entity_type, entity_id). '
            'Parent: (%,%,%), Child: (%,%,%)',
            v_parent.context_type, v_parent.entity_type, v_parent.entity_id,
            NEW.context_type, NEW.entity_type, NEW.entity_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Depth must be parent + 1
    IF NEW.thread_depth <> v_parent.thread_depth + 1 THEN
        RAISE EXCEPTION
            'master.comment: thread_depth must be parent.thread_depth+1 (%). Got %.',
            v_parent.thread_depth + 1, NEW.thread_depth
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_comment_hierarchy_guard() IS
    'Validates comment threading: parent must belong to same entity surface. '
    'thread_depth must equal parent.thread_depth + 1. '
    'Root comments must have thread_depth = 0.';

DROP TRIGGER IF EXISTS trg_comment_hierarchy_guard ON master.comment;
CREATE TRIGGER trg_comment_hierarchy_guard
    BEFORE INSERT OR UPDATE OF parent_comment_id, thread_depth,
                               context_type, entity_type, entity_id
    ON master.comment
    FOR EACH ROW EXECUTE FUNCTION master.trg_comment_hierarchy_guard();


-- ============================================================================
-- D. COMMENT MENTIONS JSONB VALIDATOR
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_comment_mentions()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.mentions IS NOT NULL THEN
        IF jsonb_typeof(NEW.mentions) <> 'array' THEN
            RAISE EXCEPTION 'master.comment.mentions must be a JSON array'
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.mentions) elem
            WHERE jsonb_typeof(elem) <> 'object' OR NOT (elem ? 'user_id')
        ) THEN
            RAISE EXCEPTION
                'master.comment.mentions: each element must be an object with user_id key'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_mentions_validate ON master.comment;
CREATE TRIGGER trg_comment_mentions_validate
    BEFORE INSERT OR UPDATE OF mentions ON master.comment
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_comment_mentions();


-- ============================================================================
-- E. MULTIPART UPLOAD PART_ETAGS VALIDATOR
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_part_etags()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.part_etags IS NOT NULL AND jsonb_typeof(NEW.part_etags) = 'array' THEN
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.part_etags) elem
            WHERE NOT (elem ? 'part_number') OR NOT (elem ? 'etag')
        ) THEN
            RAISE EXCEPTION
                'master.multipart_upload.part_etags: '
                'each element must have part_number and etag keys'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mpu_part_etags_validate ON master.multipart_upload;
CREATE TRIGGER trg_mpu_part_etags_validate
    BEFORE INSERT OR UPDATE OF part_etags ON master.multipart_upload
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_part_etags();


-- ============================================================================
-- F. COMMENT_MODERATION SYNC (flag actioned → set is_hidden)
-- ============================================================================

CREATE OR REPLACE FUNCTION event.trg_sync_comment_moderation()
RETURNS trigger LANGUAGE plpgsql SET search_path = event, governance, master AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- New flag: increment counter
        INSERT INTO governance.comment_moderation
            (tenant_id, context_type, comment_id, flag_count, last_flagged_at,
             created_at, created_by)
        VALUES
            (NEW.tenant_id, NEW.context_type, NEW.comment_id, 1, NEW.created_at,
             now(), NEW.created_by)
        ON CONFLICT (tenant_id, context_type, comment_id) DO UPDATE
            SET flag_count     = governance.comment_moderation.flag_count + 1,
                last_flagged_at = NEW.created_at,
                updated_at     = now();

    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'actioned'
          AND OLD.status <> 'actioned' THEN
        -- Flag actioned: hide the comment
        INSERT INTO governance.comment_moderation
            (tenant_id, context_type, comment_id, is_hidden, hidden_reason,
             hidden_at, hidden_by, flag_count, last_flagged_at,
             created_at, created_by)
        VALUES
            (NEW.tenant_id, NEW.context_type, NEW.comment_id,
             true, NEW.flag_reason, now(), NEW.reviewed_by,
             1, NEW.created_at, now(), NEW.reviewed_by)
        ON CONFLICT (tenant_id, context_type, comment_id) DO UPDATE
            SET is_hidden      = true,
                hidden_reason  = NEW.flag_reason,
                hidden_at      = now(),
                hidden_by      = NEW.reviewed_by,
                updated_at     = now();
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION event.trg_sync_comment_moderation() IS
    'Maintains governance.comment_moderation in sync with event.comment_flag. '
    'INSERT: increments flag_count. '
    'UPDATE status=actioned: sets is_hidden=true and records who hid it.';

DROP TRIGGER IF EXISTS trg_cf_sync_moderation ON event.comment_flag;
CREATE TRIGGER trg_cf_sync_moderation
    AFTER INSERT OR UPDATE OF status ON event.comment_flag
    FOR EACH ROW EXECUTE FUNCTION event.trg_sync_comment_moderation();


-- =============================================================================
-- §12  DOCUMENT · PRINT · BRANDING  —  master triggers
-- =============================================================================

-- ── master.document ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_document_updated_at ON master.document;
CREATE TRIGGER trg_document_updated_at
    BEFORE UPDATE ON master.document
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── master.brand_profile ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_brand_profile_updated_at ON master.brand_profile;
CREATE TRIGGER trg_brand_profile_updated_at
    BEFORE UPDATE ON master.brand_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- Auto-clear prior default when new default is set
DROP TRIGGER IF EXISTS trg_brand_profile_single_default ON master.brand_profile;
CREATE TRIGGER trg_brand_profile_single_default
    BEFORE INSERT OR UPDATE OF is_default, is_active
    ON master.brand_profile
    FOR EACH ROW EXECUTE FUNCTION document.trg_enforce_single_default();

-- ── master.letterhead ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_letterhead_updated_at ON master.letterhead;
CREATE TRIGGER trg_letterhead_updated_at
    BEFORE UPDATE ON master.letterhead
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_letterhead_single_default ON master.letterhead;
CREATE TRIGGER trg_letterhead_single_default
    BEFORE INSERT OR UPDATE OF is_default, is_active
    ON master.letterhead
    FOR EACH ROW EXECUTE FUNCTION document.trg_enforce_single_default();

DROP TRIGGER IF EXISTS trg_letterhead_validate_margins ON master.letterhead;
CREATE TRIGGER trg_letterhead_validate_margins
    BEFORE INSERT OR UPDATE OF page_margins
    ON master.letterhead
    FOR EACH ROW EXECUTE FUNCTION document.trg_validate_page_margins();

-- ── master.template ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_template_updated_at ON master.template;
CREATE TRIGGER trg_template_updated_at
    BEFORE UPDATE ON master.template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── master.attachment_comment ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_att_comment_updated_at ON master.attachment_comment;
CREATE TRIGGER trg_att_comment_updated_at
    BEFORE UPDATE ON master.attachment_comment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- Thread integrity guard: parent must belong to same attachment + tenant
DROP TRIGGER IF EXISTS trg_att_comment_parent_guard ON master.attachment_comment;
CREATE TRIGGER trg_att_comment_parent_guard
    BEFORE INSERT OR UPDATE ON master.attachment_comment
    FOR EACH ROW EXECUTE FUNCTION document.trg_comment_parent_same_attachment();

-- Mentions JSONB structure validator
DROP TRIGGER IF EXISTS trg_att_comment_validate_mentions ON master.attachment_comment;
CREATE TRIGGER trg_att_comment_validate_mentions
    BEFORE INSERT OR UPDATE ON master.attachment_comment
    FOR EACH ROW EXECUTE FUNCTION document.trg_doc_validate_mentions();


-- ============================================================================
-- CORE FINANCE MASTER — TRIGGERS
-- ============================================================================

-- ── master.legal_entity ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_legal_entity_updated_at ON master.legal_entity;
CREATE TRIGGER trg_legal_entity_updated_at BEFORE UPDATE ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_legal_entity_status_changed ON master.legal_entity;
CREATE TRIGGER trg_legal_entity_status_changed BEFORE UPDATE ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- lookup validation: entity_type
DROP TRIGGER IF EXISTS trg_legal_entity_type_lookup ON master.legal_entity;
CREATE TRIGGER trg_legal_entity_type_lookup
    BEFORE INSERT OR UPDATE OF entity_type ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_type', 'entity_type');

-- lookup validation: consolidation_method
DROP TRIGGER IF EXISTS trg_legal_entity_consolidation_lookup ON master.legal_entity;
CREATE TRIGGER trg_legal_entity_consolidation_lookup
    BEFORE INSERT OR UPDATE OF consolidation_method ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_consolidation', 'consolidation_method');

-- lookup validation: regulatory_framework (nullable)
DROP TRIGGER IF EXISTS trg_legal_entity_framework_lookup ON master.legal_entity;
CREATE TRIGGER trg_legal_entity_framework_lookup
    BEFORE INSERT OR UPDATE OF regulatory_framework ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_framework', 'regulatory_framework');


-- ── master.company_code ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_company_code_updated_at ON master.company_code;
CREATE TRIGGER trg_company_code_updated_at BEFORE UPDATE ON master.company_code
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_company_code_status_changed ON master.company_code;
CREATE TRIGGER trg_company_code_status_changed BEFORE UPDATE ON master.company_code
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_company_code_fy_variant_lookup ON master.company_code;
CREATE TRIGGER trg_company_code_fy_variant_lookup
    BEFORE INSERT OR UPDATE OF fiscal_year_variant ON master.company_code
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_fy_variant', 'fiscal_year_variant');

DROP TRIGGER IF EXISTS trg_company_code_framework_lookup ON master.company_code;
CREATE TRIGGER trg_company_code_framework_lookup
    BEFORE INSERT OR UPDATE OF regulatory_framework ON master.company_code
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_framework', 'regulatory_framework');


-- ── master.cost_center ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cc_updated_at ON master.cost_center;
CREATE TRIGGER trg_cc_updated_at BEFORE UPDATE ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cc_status_changed ON master.cost_center;
CREATE TRIGGER trg_cc_status_changed BEFORE UPDATE ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_cc_parent_co ON master.cost_center;
CREATE TRIGGER trg_cc_parent_co BEFORE INSERT OR UPDATE ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

DROP TRIGGER IF EXISTS trg_cc_level ON master.cost_center;
CREATE TRIGGER trg_cc_level BEFORE INSERT OR UPDATE ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

DROP TRIGGER IF EXISTS trg_cc_cross_refs ON master.cost_center;
CREATE TRIGGER trg_cc_cross_refs BEFORE INSERT OR UPDATE ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION master.trg_cc_cross_refs_same_company();

DROP TRIGGER IF EXISTS trg_cc_category_lookup ON master.cost_center;
CREATE TRIGGER trg_cc_category_lookup
    BEFORE INSERT OR UPDATE OF cost_center_category ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cost_center_category', 'cost_center_category');

DROP TRIGGER IF EXISTS trg_cc_node_type_lookup ON master.cost_center;
CREATE TRIGGER trg_cc_node_type_lookup
    BEFORE INSERT OR UPDATE OF node_type ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cost_center_node_type', 'node_type');


-- ── master.profit_center ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pc_updated_at ON master.profit_center;
CREATE TRIGGER trg_pc_updated_at BEFORE UPDATE ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pc_status_changed ON master.profit_center;
CREATE TRIGGER trg_pc_status_changed BEFORE UPDATE ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pc_parent_co ON master.profit_center;
CREATE TRIGGER trg_pc_parent_co BEFORE INSERT OR UPDATE ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

DROP TRIGGER IF EXISTS trg_pc_level ON master.profit_center;
CREATE TRIGGER trg_pc_level BEFORE INSERT OR UPDATE ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

DROP TRIGGER IF EXISTS trg_pc_type_lookup ON master.profit_center;
CREATE TRIGGER trg_pc_type_lookup
    BEFORE INSERT OR UPDATE OF profit_center_type ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.profit_center_type', 'profit_center_type');

DROP TRIGGER IF EXISTS trg_pc_node_type_lookup ON master.profit_center;
CREATE TRIGGER trg_pc_node_type_lookup
    BEFORE INSERT OR UPDATE OF node_type ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.profit_center_node_type', 'node_type');


-- ── master.site ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_site_updated_at ON master.site;
CREATE TRIGGER trg_site_updated_at BEFORE UPDATE ON master.site
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_site_status_changed ON master.site;
CREATE TRIGGER trg_site_status_changed BEFORE UPDATE ON master.site
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_site_parent_co ON master.site;
CREATE TRIGGER trg_site_parent_co BEFORE INSERT OR UPDATE ON master.site
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

DROP TRIGGER IF EXISTS trg_site_level ON master.site;
CREATE TRIGGER trg_site_level BEFORE INSERT OR UPDATE ON master.site
    FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

DROP TRIGGER IF EXISTS trg_site_type_lookup ON master.site;
CREATE TRIGGER trg_site_type_lookup
    BEFORE INSERT OR UPDATE OF site_type ON master.site
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.site_type', 'site_type');


-- ── master.warehouse ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_wh_updated_at ON master.warehouse;
CREATE TRIGGER trg_wh_updated_at BEFORE UPDATE ON master.warehouse
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wh_status_changed ON master.warehouse;
CREATE TRIGGER trg_wh_status_changed BEFORE UPDATE ON master.warehouse
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_wh_type_lookup ON master.warehouse;
CREATE TRIGGER trg_wh_type_lookup
    BEFORE INSERT OR UPDATE OF warehouse_type ON master.warehouse
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.warehouse_type', 'warehouse_type');


-- ── master.chart_of_account ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_coa_updated_at ON master.chart_of_account;
CREATE TRIGGER trg_coa_updated_at BEFORE UPDATE ON master.chart_of_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_coa_status_changed ON master.chart_of_account;
CREATE TRIGGER trg_coa_status_changed BEFORE UPDATE ON master.chart_of_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_coa_framework_lookup ON master.chart_of_account;
CREATE TRIGGER trg_coa_framework_lookup
    BEFORE INSERT OR UPDATE OF framework ON master.chart_of_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.chart_of_account_framework', 'framework');


-- ── master.gl_account ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_gla_updated_at ON master.gl_account;
CREATE TRIGGER trg_gla_updated_at BEFORE UPDATE ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_gla_status_changed ON master.gl_account;
CREATE TRIGGER trg_gla_status_changed BEFORE UPDATE ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_gla_parent_class ON master.gl_account;
CREATE TRIGGER trg_gla_parent_class BEFORE INSERT OR UPDATE ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION master.trg_gl_account_parent_class_check();

DROP TRIGGER IF EXISTS trg_gla_class_lookup ON master.gl_account;
CREATE TRIGGER trg_gla_class_lookup
    BEFORE INSERT OR UPDATE OF account_class ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_class', 'account_class');

DROP TRIGGER IF EXISTS trg_gla_node_type_lookup ON master.gl_account;
CREATE TRIGGER trg_gla_node_type_lookup
    BEFORE INSERT OR UPDATE OF node_type ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_node_type', 'node_type');

DROP TRIGGER IF EXISTS trg_gla_balance_lookup ON master.gl_account;
CREATE TRIGGER trg_gla_balance_lookup
    BEFORE INSERT OR UPDATE OF normal_balance ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_balance', 'normal_balance');

DROP TRIGGER IF EXISTS trg_gla_subledger_lookup ON master.gl_account;
CREATE TRIGGER trg_gla_subledger_lookup
    BEFORE INSERT OR UPDATE OF subledger_type ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_subledger', 'subledger_type');


-- ── master.company_code_chart_assignment ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ccca_updated_at ON master.company_code_chart_assignment;
CREATE TRIGGER trg_ccca_updated_at BEFORE UPDATE ON master.company_code_chart_assignment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccca_status_changed ON master.company_code_chart_assignment;
CREATE TRIGGER trg_ccca_status_changed BEFORE UPDATE ON master.company_code_chart_assignment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_ccca_type_lookup ON master.company_code_chart_assignment;
CREATE TRIGGER trg_ccca_type_lookup
    BEFORE INSERT OR UPDATE OF assignment_type ON master.company_code_chart_assignment
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ccca_assignment_type', 'assignment_type');


-- ── master.company_code_gl_account ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ccga_updated_at ON master.company_code_gl_account;
CREATE TRIGGER trg_ccga_updated_at BEFORE UPDATE ON master.company_code_gl_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccga_status_changed ON master.company_code_gl_account;
CREATE TRIGGER trg_ccga_status_changed BEFORE UPDATE ON master.company_code_gl_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_ccga_defaults_company ON master.company_code_gl_account;
CREATE TRIGGER trg_ccga_defaults_company BEFORE INSERT OR UPDATE ON master.company_code_gl_account
    FOR EACH ROW EXECUTE FUNCTION master.trg_ccga_defaults_same_company();

DROP TRIGGER IF EXISTS trg_ccga_recon_lookup ON master.company_code_gl_account;
CREATE TRIGGER trg_ccga_recon_lookup
    BEFORE INSERT OR UPDATE OF reconciliation_type ON master.company_code_gl_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ccga_reconciliation_type', 'reconciliation_type');


-- ── master.project ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_proj_updated_at ON master.project;
CREATE TRIGGER trg_proj_updated_at BEFORE UPDATE ON master.project
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_proj_status_changed ON master.project;
CREATE TRIGGER trg_proj_status_changed BEFORE UPDATE ON master.project
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_proj_parent_co ON master.project;
CREATE TRIGGER trg_proj_parent_co BEFORE INSERT OR UPDATE ON master.project
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_parent_same_company();

DROP TRIGGER IF EXISTS trg_proj_level ON master.project;
CREATE TRIGGER trg_proj_level BEFORE INSERT OR UPDATE ON master.project
    FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

DROP TRIGGER IF EXISTS trg_proj_type_lookup ON master.project;
CREATE TRIGGER trg_proj_type_lookup
    BEFORE INSERT OR UPDATE OF project_type ON master.project
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_type', 'project_type');

DROP TRIGGER IF EXISTS trg_proj_settlement_lookup ON master.project;
CREATE TRIGGER trg_proj_settlement_lookup
    BEFORE INSERT OR UPDATE OF settlement_type ON master.project
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_settlement_type', 'settlement_type');


-- ── master.project_item ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pi_updated_at ON master.project_item;
CREATE TRIGGER trg_pi_updated_at BEFORE UPDATE ON master.project_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pi_status_changed ON master.project_item;
CREATE TRIGGER trg_pi_status_changed BEFORE UPDATE ON master.project_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pi_level ON master.project_item;
CREATE TRIGGER trg_pi_level BEFORE INSERT OR UPDATE ON master.project_item
    FOR EACH ROW EXECUTE FUNCTION master.trg_auto_set_level();

DROP TRIGGER IF EXISTS trg_pi_company ON master.project_item;
CREATE TRIGGER trg_pi_company BEFORE INSERT OR UPDATE ON master.project_item
    FOR EACH ROW EXECUTE FUNCTION master.trg_project_item_company_integrity();

DROP TRIGGER IF EXISTS trg_pi_type_lookup ON master.project_item;
CREATE TRIGGER trg_pi_type_lookup
    BEFORE INSERT OR UPDATE OF item_type ON master.project_item
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_item_type', 'item_type');


-- =============================================================================
-- §F13  master.dimension_set
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ds_updated_at ON master.dimension_set;
CREATE TRIGGER trg_ds_updated_at BEFORE UPDATE ON master.dimension_set
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ds_status_changed ON master.dimension_set;
CREATE TRIGGER trg_ds_status_changed BEFORE UPDATE ON master.dimension_set
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §F14  master.fiscal_period
-- =============================================================================

DROP TRIGGER IF EXISTS trg_fp_updated_at ON master.fiscal_period;
CREATE TRIGGER trg_fp_updated_at BEFORE UPDATE ON master.fiscal_period
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_fp_status_changed ON master.fiscal_period;
CREATE TRIGGER trg_fp_status_changed BEFORE UPDATE ON master.fiscal_period
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_fp_type_lookup ON master.fiscal_period;
CREATE TRIGGER trg_fp_type_lookup
    BEFORE INSERT OR UPDATE OF period_type ON master.fiscal_period
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.fiscal_period_type', 'period_type');


-- =============================================================================
-- §F15  master.ledger_book
-- =============================================================================

DROP TRIGGER IF EXISTS trg_lb_updated_at ON master.ledger_book;
CREATE TRIGGER trg_lb_updated_at BEFORE UPDATE ON master.ledger_book
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lb_status_changed ON master.ledger_book;
CREATE TRIGGER trg_lb_status_changed BEFORE UPDATE ON master.ledger_book
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_lb_category_lookup ON master.ledger_book;
CREATE TRIGGER trg_lb_category_lookup
    BEFORE INSERT OR UPDATE OF category ON master.ledger_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_category', 'category');

DROP TRIGGER IF EXISTS trg_lb_standard_lookup ON master.ledger_book;
CREATE TRIGGER trg_lb_standard_lookup
    BEFORE INSERT OR UPDATE OF reporting_standard ON master.ledger_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_standard', 'reporting_standard');

DROP TRIGGER IF EXISTS trg_lb_close_mode_lookup ON master.ledger_book;
CREATE TRIGGER trg_lb_close_mode_lookup
    BEFORE INSERT OR UPDATE OF close_mode ON master.ledger_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_close_mode', 'close_mode');


-- =============================================================================
-- §F16  master.company_code_book_assignment
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ba_updated_at ON master.company_code_book_assignment;
CREATE TRIGGER trg_ba_updated_at BEFORE UPDATE ON master.company_code_book_assignment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ba_status_changed ON master.company_code_book_assignment;
CREATE TRIGGER trg_ba_status_changed BEFORE UPDATE ON master.company_code_book_assignment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_ba_conflict_lookup ON master.company_code_book_assignment;
CREATE TRIGGER trg_ba_conflict_lookup
    BEFORE INSERT OR UPDATE OF conflict_strategy ON master.company_code_book_assignment
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_book_assignment_conflict', 'conflict_strategy');


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- =============================================================================

-- =============================================================================
-- §BP0  master.business_partner (§BP1 — commercial identity root)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bp_updated_at ON master.business_partner;
CREATE TRIGGER trg_bp_updated_at BEFORE UPDATE ON master.business_partner
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bp_status_changed ON master.business_partner;
CREATE TRIGGER trg_bp_status_changed BEFORE UPDATE ON master.business_partner
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- partner_category uses an inline CHECK constraint — no lookup trigger needed.
-- registration_country_code / tax_residence_country_code validated by FK to shared.country.


-- =============================================================================
-- §P1  master.customer
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cust_updated_at ON master.customer;
CREATE TRIGGER trg_cust_updated_at BEFORE UPDATE ON master.customer
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cust_status_changed ON master.customer;
CREATE TRIGGER trg_cust_status_changed BEFORE UPDATE ON master.customer
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_cust_type_lookup ON master.customer;
CREATE TRIGGER trg_cust_type_lookup
    BEFORE INSERT OR UPDATE OF customer_type ON master.customer
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.customer_type', 'customer_type');

-- NOTE: payment_terms removed from customer — moved to company_code_customer_profile


-- =============================================================================
-- §P2  master.supplier
-- =============================================================================

DROP TRIGGER IF EXISTS trg_supp_updated_at ON master.supplier;
CREATE TRIGGER trg_supp_updated_at BEFORE UPDATE ON master.supplier
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_supp_status_changed ON master.supplier;
CREATE TRIGGER trg_supp_status_changed BEFORE UPDATE ON master.supplier
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_supp_type_lookup ON master.supplier;
CREATE TRIGGER trg_supp_type_lookup
    BEFORE INSERT OR UPDATE OF supplier_type ON master.supplier
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.supplier_type', 'supplier_type');

-- NOTE: payment_terms, payment_method, bank_* removed from supplier — moved to company_code_supplier_profile


-- =============================================================================
-- §P3  master.employee
-- =============================================================================

DROP TRIGGER IF EXISTS trg_emp_updated_at ON master.employee;
CREATE TRIGGER trg_emp_updated_at BEFORE UPDATE ON master.employee
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_emp_status_changed ON master.employee;
CREATE TRIGGER trg_emp_status_changed BEFORE UPDATE ON master.employee
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_emp_type_lookup ON master.employee;
CREATE TRIGGER trg_emp_type_lookup
    BEFORE INSERT OR UPDATE OF employment_type ON master.employee
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.employment_type', 'employment_type');


-- =============================================================================
-- §P4  master.commodity_category
-- =============================================================================

-- Commodity category
DROP TRIGGER IF EXISTS trg_ccat_updated_at ON master.commodity_category;
CREATE TRIGGER trg_ccat_updated_at BEFORE UPDATE ON master.commodity_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccat_status_changed ON master.commodity_category;
CREATE TRIGGER trg_ccat_status_changed BEFORE UPDATE ON master.commodity_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_ccat_maintain_root_category ON master.commodity_category;
CREATE TRIGGER trg_ccat_maintain_root_category
    BEFORE INSERT OR UPDATE OF parent_id ON master.commodity_category
    FOR EACH ROW EXECUTE FUNCTION master.trg_ccat_maintain_root_category();

DROP TRIGGER IF EXISTS trg_ccat_valuation_lookup ON master.commodity_category;
CREATE TRIGGER trg_ccat_valuation_lookup
    BEFORE INSERT OR UPDATE OF default_valuation_method ON master.commodity_category
    FOR EACH ROW
    WHEN (NEW.default_valuation_method IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns('master.valuation_method', 'default_valuation_method');


-- =============================================================================
-- §P5  master.product
-- =============================================================================

DROP TRIGGER IF EXISTS trg_prod_updated_at ON master.product;
CREATE TRIGGER trg_prod_updated_at BEFORE UPDATE ON master.product
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_prod_status_changed ON master.product;
CREATE TRIGGER trg_prod_status_changed BEFORE UPDATE ON master.product
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_prod_type_lookup ON master.product;
CREATE TRIGGER trg_prod_type_lookup
    BEFORE INSERT OR UPDATE OF product_type ON master.product
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.product_type', 'product_type');


-- =============================================================================
-- §P6  master.item
-- =============================================================================

DROP TRIGGER IF EXISTS trg_im_updated_at ON master.item;
CREATE TRIGGER trg_im_updated_at BEFORE UPDATE ON master.item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_im_status_changed ON master.item;
CREATE TRIGGER trg_im_status_changed BEFORE UPDATE ON master.item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_im_valuation_lookup ON master.item;
CREATE TRIGGER trg_im_valuation_lookup
    BEFORE INSERT OR UPDATE OF valuation_method ON master.item
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.valuation_method', 'valuation_method');


-- =============================================================================
-- §P7 legacy spend-category triggers retired
-- =============================================================================

DROP FUNCTION IF EXISTS master.trg_sc_maintain_root_category();

-- =============================================================================
-- §P8  master.commodity_classification
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cc_updated_at ON master.commodity_classification;
CREATE TRIGGER trg_cc_updated_at BEFORE UPDATE ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cc_status_changed ON master.commodity_classification;
CREATE TRIGGER trg_cc_status_changed BEFORE UPDATE ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_cc_owner_type_lookup ON master.commodity_classification;
CREATE TRIGGER trg_cc_owner_type_lookup
    BEFORE INSERT OR UPDATE OF owner_type ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_owner_type', 'owner_type');

DROP TRIGGER IF EXISTS trg_cc_classification_type_lookup ON master.commodity_classification;
CREATE TRIGGER trg_cc_classification_type_lookup
    BEFORE INSERT OR UPDATE OF classification_type ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_classification_type', 'classification_type');

DROP TRIGGER IF EXISTS trg_cc_domain_code_lookup ON master.commodity_classification;
CREATE TRIGGER trg_cc_domain_code_lookup
    BEFORE INSERT OR UPDATE OF domain_code ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_domain_code', 'domain_code');

DROP TRIGGER IF EXISTS trg_cc_mapping_type_lookup ON master.commodity_classification;
CREATE TRIGGER trg_cc_mapping_type_lookup
    BEFORE INSERT OR UPDATE OF mapping_type ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_mapping_type', 'mapping_type');

DROP TRIGGER IF EXISTS trg_cc_provenance_lookup ON master.commodity_classification;
CREATE TRIGGER trg_cc_provenance_lookup
    BEFORE INSERT OR UPDATE OF provenance ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_provenance', 'provenance');

-- Polymorphic owner validation
DROP TRIGGER IF EXISTS trg_cc_validate_owner ON master.commodity_classification;
CREATE TRIGGER trg_cc_validate_owner
    BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION master.trg_cc_validate_owner();

-- Polymorphic code + domain validation
DROP TRIGGER IF EXISTS trg_cc_validate_code ON master.commodity_classification;
CREATE TRIGGER trg_cc_validate_code
    BEFORE INSERT OR UPDATE OF classification_type, domain_code, code_id ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION master.trg_cc_validate_code();

-- Owner-type registry cross-validation (TIGHTEN-3)
DROP TRIGGER IF EXISTS trg_cc_owner_type ON master.commodity_classification;
CREATE TRIGGER trg_cc_owner_type
    BEFORE INSERT OR UPDATE OF owner_type ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION master.trg_cc_validate_owner_type();


-- =============================================================================
-- §P9  master.company_code_customer_profile
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ccp_updated_at ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_updated_at BEFORE UPDATE ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccp_status_changed ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_status_changed BEFORE UPDATE ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- trg_ccp_payment_terms_lookup removed: deprecated payment_terms text column gone from BP-first rewrite.
-- payment_term_id FK (→ master.payment_term) enforces validity declaratively.

DROP TRIGGER IF EXISTS trg_ccp_payment_terms_lookup ON master.company_code_customer_profile;

DROP TRIGGER IF EXISTS trg_ccp_credit_rating_lookup ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_credit_rating_lookup
    BEFORE INSERT OR UPDATE OF credit_rating ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.credit_rating', 'credit_rating');


-- =============================================================================
-- §P10  master.company_code_supplier_profile
-- =============================================================================

DROP TRIGGER IF EXISTS trg_scp_updated_at ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_updated_at BEFORE UPDATE ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_scp_status_changed ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_status_changed BEFORE UPDATE ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- trg_scp_payment_terms_lookup + trg_scp_payment_method_lookup removed:
-- deprecated payment_terms text + payment_method text columns gone in BP-first rewrite.
-- payment_term_id and payment_method_id FKs enforce validity declaratively.

DROP TRIGGER IF EXISTS trg_scp_payment_terms_lookup ON master.company_code_supplier_profile;
DROP TRIGGER IF EXISTS trg_scp_payment_method_lookup ON master.company_code_supplier_profile;


-- =============================================================================
-- =============================================================================
-- ASSET MANAGEMENT MODULE — Triggers
-- =============================================================================
-- =============================================================================


-- =============================================================================
-- §AM1  master.asset_class
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ac_updated_at ON master.asset_class;
CREATE TRIGGER trg_ac_updated_at BEFORE UPDATE ON master.asset_class
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ac_status_changed ON master.asset_class;
CREATE TRIGGER trg_ac_status_changed BEFORE UPDATE ON master.asset_class
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- v3: asset_nature lookup
DROP TRIGGER IF EXISTS trg_ac_nature_lookup ON master.asset_class;
CREATE TRIGGER trg_ac_nature_lookup
    BEFORE INSERT OR UPDATE OF asset_nature ON master.asset_class
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_nature', 'asset_nature');

-- v3: useful_life_override_policy lookup
DROP TRIGGER IF EXISTS trg_ac_life_policy_lookup ON master.asset_class;
CREATE TRIGGER trg_ac_life_policy_lookup
    BEFORE INSERT OR UPDATE OF useful_life_override_policy ON master.asset_class
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_life_override_policy', 'useful_life_override_policy');


-- =============================================================================
-- §AM2  master.asset
-- =============================================================================

DROP TRIGGER IF EXISTS trg_asset_updated_at ON master.asset;
CREATE TRIGGER trg_asset_updated_at BEFORE UPDATE ON master.asset
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_asset_status_changed ON master.asset;
CREATE TRIGGER trg_asset_status_changed BEFORE UPDATE ON master.asset
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_asset_retirement_type_lookup ON master.asset;
CREATE TRIGGER trg_asset_retirement_type_lookup
    BEFORE INSERT OR UPDATE OF retirement_type ON master.asset
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_retirement_type', 'retirement_type');


-- =============================================================================
-- §AM3  master.asset_book
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ab_updated_at ON master.asset_book;
CREATE TRIGGER trg_ab_updated_at BEFORE UPDATE ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ab_status_changed ON master.asset_book;
CREATE TRIGGER trg_ab_status_changed BEFORE UPDATE ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_ab_book_type_immutable ON master.asset_book;
CREATE TRIGGER trg_ab_book_type_immutable
    BEFORE UPDATE OF book_type ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION master.trg_asset_book_type_immutable();

DROP TRIGGER IF EXISTS trg_ab_book_type_lookup ON master.asset_book;
CREATE TRIGGER trg_ab_book_type_lookup
    BEFORE INSERT OR UPDATE OF book_type ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');

DROP TRIGGER IF EXISTS trg_ab_depr_method_lookup ON master.asset_book;
CREATE TRIGGER trg_ab_depr_method_lookup
    BEFORE INSERT OR UPDATE OF depreciation_method ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_method', 'depreciation_method');

DROP TRIGGER IF EXISTS trg_ab_convention_lookup ON master.asset_book;
CREATE TRIGGER trg_ab_convention_lookup
    BEFORE INSERT OR UPDATE OF convention ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.depreciation_convention', 'convention');

DROP TRIGGER IF EXISTS trg_ab_prorate_basis_lookup ON master.asset_book;
CREATE TRIGGER trg_ab_prorate_basis_lookup
    BEFORE INSERT OR UPDATE OF prorate_basis ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_prorate_basis', 'prorate_basis');


-- =============================================================================
-- §AM4  master.asset_component
-- =============================================================================

DROP TRIGGER IF EXISTS trg_acomp_updated_at ON master.asset_component;
CREATE TRIGGER trg_acomp_updated_at BEFORE UPDATE ON master.asset_component
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_acomp_status_changed ON master.asset_component;
CREATE TRIGGER trg_acomp_status_changed BEFORE UPDATE ON master.asset_component
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- =============================================================================
-- §AM5  master.asset_assignment_history
-- =============================================================================

DROP TRIGGER IF EXISTS trg_aah_updated_at ON master.asset_assignment_history;
CREATE TRIGGER trg_aah_updated_at BEFORE UPDATE ON master.asset_assignment_history
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_aah_assignment_type_lookup ON master.asset_assignment_history;
CREATE TRIGGER trg_aah_assignment_type_lookup
    BEFORE INSERT OR UPDATE OF assignment_type ON master.asset_assignment_history
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_assignment_type', 'assignment_type');


-- =============================================================================
-- §DIM1  master.dimension_type
-- Trigger naming: trg_dt_{purpose}
-- Function naming: master.trg_dt_{purpose}() — defined in 08_functions/003_master.sql
-- =============================================================================

DROP TRIGGER IF EXISTS trg_dt_updated_at ON master.dimension_type;
CREATE TRIGGER trg_dt_updated_at
    BEFORE UPDATE ON master.dimension_type
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dt_status_changed ON master.dimension_type;
CREATE TRIGGER trg_dt_status_changed
    BEFORE UPDATE ON master.dimension_type
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Lookup validation: dimension_type.category via domain master.dimension_type_category
DROP TRIGGER IF EXISTS trg_dt_category_lookup ON master.dimension_type;
CREATE TRIGGER trg_dt_category_lookup
    BEFORE INSERT OR UPDATE OF category ON master.dimension_type
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.dimension_type_category', 'category');

-- Deactivation guard: block status transitions when active values still reference this type
DROP TRIGGER IF EXISTS trg_dt_deactivation_guard ON master.dimension_type;
CREATE TRIGGER trg_dt_deactivation_guard
    BEFORE UPDATE OF status ON master.dimension_type
    FOR EACH ROW EXECUTE FUNCTION master.trg_dt_deactivation_guard();


-- =============================================================================
-- §DIM2  master.dimension_value
-- Trigger naming: trg_dv_{purpose}
-- Function naming: master.trg_dv_{purpose}() — defined in 08_functions/003_master.sql
-- =============================================================================

DROP TRIGGER IF EXISTS trg_dv_updated_at ON master.dimension_value;
CREATE TRIGGER trg_dv_updated_at
    BEFORE UPDATE ON master.dimension_value
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dv_status_changed ON master.dimension_value;
CREATE TRIGGER trg_dv_status_changed
    BEFORE UPDATE ON master.dimension_value
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Parent-child validation: same tenant, same type, compatible company scope
DROP TRIGGER IF EXISTS trg_dv_parent_guard ON master.dimension_value;
CREATE TRIGGER trg_dv_parent_guard
    BEFORE INSERT OR UPDATE OF parent_id, dimension_type_id, company_code_id
    ON master.dimension_value
    FOR EACH ROW EXECUTE FUNCTION master.trg_dv_parent_guard();

-- Company scope validation: company_code_id only allowed when type permits it
DROP TRIGGER IF EXISTS trg_dv_company_scope_guard ON master.dimension_value;
CREATE TRIGGER trg_dv_company_scope_guard
    BEFORE INSERT OR UPDATE OF company_code_id ON master.dimension_value
    FOR EACH ROW EXECUTE FUNCTION master.trg_dv_company_scope_guard();


-- =============================================================================
-- §DIM3  master.dimension_set_item
-- Trigger naming: trg_dsi_{purpose}
-- Function naming: master.trg_dsi_{purpose}() — defined in 08_functions/003_master.sql
-- =============================================================================

-- Type-value consistency: value must belong to the declared type
DROP TRIGGER IF EXISTS trg_dsi_type_value_consistency ON master.dimension_set_item;
CREATE TRIGGER trg_dsi_type_value_consistency
    BEFORE INSERT ON master.dimension_set_item
    FOR EACH ROW EXECUTE FUNCTION master.trg_dsi_type_value_consistency();

-- Immutability: block UPDATE and DELETE on set items
DROP TRIGGER IF EXISTS trg_dsi_no_update ON master.dimension_set_item;
CREATE TRIGGER trg_dsi_no_update
    BEFORE UPDATE ON master.dimension_set_item
    FOR EACH ROW EXECUTE FUNCTION master.trg_dsi_immutable();

DROP TRIGGER IF EXISTS trg_dsi_no_delete ON master.dimension_set_item;
CREATE TRIGGER trg_dsi_no_delete
    BEFORE DELETE ON master.dimension_set_item
    FOR EACH ROW EXECUTE FUNCTION master.trg_dsi_immutable();


-- =============================================================================
-- OU + INTENT + CLASSIFICATION ENGINE — triggers
-- Trigger naming: trg_<table_abbr>_<purpose>
-- Function refs: master.trg_<purpose>() in 08_functions/003_master.sql
--                shared.trg_set_updated_at() / shared.trg_set_status_changed()
-- =============================================================================

-- =============================================================================
-- §BI  master.business_intent
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bi_updated_at ON master.business_intent;
CREATE TRIGGER trg_bi_updated_at
    BEFORE UPDATE ON master.business_intent
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bi_status_changed ON master.business_intent;
CREATE TRIGGER trg_bi_status_changed
    BEFORE UPDATE OF status ON master.business_intent
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Parent guard: validates same-tenant, same-domain, parent existence
DROP TRIGGER IF EXISTS trg_bi_parent_guard ON master.business_intent;
CREATE TRIGGER trg_bi_parent_guard
    BEFORE INSERT OR UPDATE OF parent_id, domain ON master.business_intent
    FOR EACH ROW EXECUTE FUNCTION master.trg_bi_parent_guard();


-- =============================================================================
-- §OIM  master.company_code_intent_policy
-- =============================================================================

-- =============================================================================
-- §ODD  master.company_code_dimension_default
-- =============================================================================

DROP TRIGGER IF EXISTS trg_odd_updated_at ON master.company_code_dimension_default;
CREATE TRIGGER trg_odd_updated_at
    BEFORE UPDATE ON master.company_code_dimension_default
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_odd_status_changed ON master.company_code_dimension_default;
CREATE TRIGGER trg_odd_status_changed
    BEFORE UPDATE OF status ON master.company_code_dimension_default
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Scope guard: rejects dimension values whose company scope does not match
-- the company_code_id of this default row. Global values (NULL) always pass.
DROP TRIGGER IF EXISTS trg_odd_scope_guard ON master.company_code_dimension_default;
CREATE TRIGGER trg_odd_scope_guard
    BEFORE INSERT OR UPDATE OF dimension_value_id, company_code_id ON master.company_code_dimension_default
    FOR EACH ROW EXECUTE FUNCTION master.trg_odd_scope_guard();


-- ── §BK1 bank_party ─────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bank_party_updated_at ON master.bank_party;
CREATE TRIGGER trg_bank_party_updated_at BEFORE UPDATE ON master.bank_party
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_party_status_changed ON master.bank_party;
CREATE TRIGGER trg_bank_party_status_changed BEFORE UPDATE ON master.bank_party
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bank_party_institution_type_lookup ON master.bank_party;
CREATE TRIGGER trg_bank_party_institution_type_lookup
    BEFORE INSERT OR UPDATE OF institution_type ON master.bank_party
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_party_institution_type', 'institution_type');

DROP TRIGGER IF EXISTS trg_bank_party_nat_code_type_lookup ON master.bank_party;
CREATE TRIGGER trg_bank_party_nat_code_type_lookup
    BEFORE INSERT OR UPDATE OF national_bank_code_type ON master.bank_party
    FOR EACH ROW WHEN (NEW.national_bank_code_type IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_party_national_bank_code_type', 'national_bank_code_type');

-- ── §BK2 bank_account ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bank_account_updated_at ON master.bank_account;
CREATE TRIGGER trg_bank_account_updated_at BEFORE UPDATE ON master.bank_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_account_status_changed ON master.bank_account;
CREATE TRIGGER trg_bank_account_status_changed BEFORE UPDATE ON master.bank_account
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bank_account_id_type_lookup ON master.bank_account;
CREATE TRIGGER trg_bank_account_id_type_lookup
    BEFORE INSERT OR UPDATE OF account_id_type ON master.bank_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_id_type', 'account_id_type');

DROP TRIGGER IF EXISTS trg_bank_account_verification_method_lookup ON master.bank_account;
CREATE TRIGGER trg_bank_account_verification_method_lookup
    BEFORE INSERT OR UPDATE OF verification_method ON master.bank_account
    FOR EACH ROW WHEN (NEW.verification_method IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_verification_method', 'verification_method');

DROP TRIGGER IF EXISTS trg_bank_account_nature_lookup ON master.bank_account;
CREATE TRIGGER trg_bank_account_nature_lookup
    BEFORE INSERT OR UPDATE OF account_nature ON master.bank_account
    FOR EACH ROW WHEN (NEW.account_nature IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_nature', 'account_nature');

-- ── §BK3 bank_account_link ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bal_updated_at ON master.bank_account_link;
CREATE TRIGGER trg_bal_updated_at BEFORE UPDATE ON master.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bal_purpose_lookup ON master.bank_account_link;
CREATE TRIGGER trg_bal_purpose_lookup
    BEFORE INSERT OR UPDATE OF purpose ON master.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_link_purpose', 'purpose');

DROP TRIGGER IF EXISTS trg_bal_validate_owner_type ON master.bank_account_link;
CREATE TRIGGER trg_bal_validate_owner_type
    BEFORE INSERT OR UPDATE OF owner_type ON master.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_type();

DROP TRIGGER IF EXISTS trg_bal_validate_owner_ref ON master.bank_account_link;
DROP TRIGGER IF EXISTS trg_z_bal_validate_owner_ref ON master.bank_account_link;
CREATE TRIGGER trg_z_bal_validate_owner_ref
    BEFORE INSERT OR UPDATE OF owner_type, owner_id ON master.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_owner_ref();

DROP TRIGGER IF EXISTS trg_bal_recheck_default_on_date_change ON master.bank_account_link;
CREATE TRIGGER trg_bal_recheck_default_on_date_change
    BEFORE UPDATE OF effective_from, effective_until ON master.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_bal_recheck_default_on_date_change();

DROP TRIGGER IF EXISTS trg_bal_guard_owner_change_with_config ON master.bank_account_link;
CREATE TRIGGER trg_bal_guard_owner_change_with_config
    BEFORE UPDATE OF owner_type, owner_id ON master.bank_account_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_bal_guard_owner_change_with_config();

-- ── §BK4 bank_account_house_config ──────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bahc_updated_at ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_updated_at BEFORE UPDATE ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bahc_status_changed ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_status_changed BEFORE UPDATE ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bahc_usage_type_lookup ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_usage_type_lookup
    BEFORE INSERT OR UPDATE OF usage_type ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_usage_type', 'usage_type');

DROP TRIGGER IF EXISTS trg_bahc_local_type_lookup ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_local_type_lookup
    BEFORE INSERT OR UPDATE OF local_account_type ON master.bank_account_house_config
    FOR EACH ROW WHEN (NEW.local_account_type IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_local_type', 'local_account_type');

DROP TRIGGER IF EXISTS trg_bahc_recon_mode_lookup ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_recon_mode_lookup
    BEFORE INSERT OR UPDATE OF reconciliation_mode ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_reconciliation_mode', 'reconciliation_mode');

DROP TRIGGER IF EXISTS trg_bahc_owner_guard ON master.bank_account_house_config;
DROP TRIGGER IF EXISTS trg_a_bahc_owner_guard ON master.bank_account_house_config;
CREATE TRIGGER trg_a_bahc_owner_guard
    BEFORE INSERT OR UPDATE OF bank_account_link_id ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_house_config_owner();

DROP TRIGGER IF EXISTS trg_bahc_gl_postable ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_gl_postable
    BEFORE INSERT OR UPDATE OF gl_account_id, bank_account_link_id ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION master.trg_house_config_gl_postable();

DROP TRIGGER IF EXISTS trg_bahc_default_unique ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_default_unique
    BEFORE INSERT OR UPDATE OF is_default_disbursement, is_default_collection ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION master.trg_house_config_default_unique();


-- ── §PM1 payment_method ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_pm_updated_at ON master.payment_method;
CREATE TRIGGER trg_pm_updated_at BEFORE UPDATE ON master.payment_method
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_status_changed ON master.payment_method;
CREATE TRIGGER trg_pm_status_changed BEFORE UPDATE ON master.payment_method
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pm_direction_lookup ON master.payment_method;
CREATE TRIGGER trg_pm_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON master.payment_method
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_pm_instrument_mode_lookup ON master.payment_method;
CREATE TRIGGER trg_pm_instrument_mode_lookup
    BEFORE INSERT OR UPDATE OF instrument_mode ON master.payment_method
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_instrument_mode', 'instrument_mode');


-- ############################################################################
--  PROFILE EXTENSION — Triggers
-- ############################################################################

-- ── tenant_profile: weekend_days normalization ─────────────────────────────
DROP TRIGGER IF EXISTS trg_tp_normalize_weekend_days ON master.tenant_profile;
CREATE TRIGGER trg_tp_normalize_weekend_days
    BEFORE INSERT OR UPDATE OF weekend_days ON master.tenant_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_weekend_days();

-- tax_id_type moved to master.business_partner (via party_identifier scheme in BP-first rewrite).
-- Triggers for customer.tax_id_type and supplier.tax_id_type removed; DROP guards kept for safety.
DROP TRIGGER IF EXISTS trg_cust_tax_id_type_lookup ON master.customer;
DROP TRIGGER IF EXISTS trg_supp_tax_id_type_lookup ON master.supplier;

-- ── company_code_customer_profile: statement_cycle_code lookup validation ───────
DROP TRIGGER IF EXISTS trg_ccp_statement_cycle_lookup ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_statement_cycle_lookup
    BEFORE INSERT OR UPDATE OF statement_cycle_code ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.statement_cycle', 'statement_cycle_code');

-- ── company_code_customer_profile: receipt method direction guard ────────────────
DROP TRIGGER IF EXISTS trg_ccp_receipt_method_direction ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_receipt_method_direction
    BEFORE INSERT OR UPDATE OF default_receipt_method_id ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_ccp_validate_receipt_method_direction();

-- ── company_code_supplier_profile: payment method direction guard ───────────────
DROP TRIGGER IF EXISTS trg_scp_payment_method_direction ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_payment_method_direction
    BEFORE INSERT OR UPDATE OF payment_method_id ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_scp_validate_payment_method_direction();

-- ── company_code_supplier_profile: remittance bank link guard ───────────────────
DROP TRIGGER IF EXISTS trg_scp_remittance_bank_link ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_remittance_bank_link
    BEFORE INSERT OR UPDATE OF preferred_remittance_bank_link_id ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_scp_validate_remittance_bank_link();

-- ── principal_identity_binding: updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pib_updated_at ON master.principal_identity_binding;
CREATE TRIGGER trg_pib_updated_at
    BEFORE UPDATE ON master.principal_identity_binding
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── principal_identity_binding: service_client_id guard ────────────────────────
DROP TRIGGER IF EXISTS trg_pib_service_client ON master.principal_identity_binding;
CREATE TRIGGER trg_pib_service_client
    BEFORE INSERT OR UPDATE OF service_client_id ON master.principal_identity_binding
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_auth_binding_service_client();


-- ============================================================================
-- RBAC Phase 6: Assignment scope validation triggers
-- ============================================================================

-- auth_group_role: validate assignment_scope_ref_id points to the correct table/tenant
DROP TRIGGER IF EXISTS trg_bi_bu_validate_assignment_scope ON master.auth_group_role;
CREATE TRIGGER trg_bi_bu_validate_assignment_scope
    BEFORE INSERT OR UPDATE OF assignment_scope_type, assignment_scope_ref_id
    ON master.auth_group_role
    FOR EACH ROW
    EXECUTE FUNCTION master.trg_validate_assignment_scope('auth_group_role');

-- access_grant: validate assignment_scope_ref_id points to the correct table/tenant
DROP TRIGGER IF EXISTS trg_bi_bu_validate_assignment_scope ON master.access_grant;
CREATE TRIGGER trg_bi_bu_validate_assignment_scope
    BEFORE INSERT OR UPDATE OF assignment_scope_type, assignment_scope_ref_id
    ON master.access_grant
    FOR EACH ROW
    EXECUTE FUNCTION master.trg_validate_assignment_scope('access_grant');

-- company_code_access: entity_type lookup validation (replaces inline CHECK constraint)
DROP TRIGGER IF EXISTS trg_cca_entity_type_lookup ON master.company_code_access;
CREATE TRIGGER trg_cca_entity_type_lookup
    BEFORE INSERT OR UPDATE OF entity_type ON master.company_code_access
    FOR EACH ROW
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.company_code_access_entity_type', 'entity_type'
    );


-- ============================================================================
-- §  auth_epoch increment triggers
-- ============================================================================
-- auth_epoch on master.principal is a monotonically increasing security cache
-- epoch. When it changes the session service detects a cache stale condition
-- and forces immediate re-resolution, bypassing the 5-minute TTL.
--
-- Increment on:
--   A) master.principal.is_locked changed (any direction)
--   B) master.access_grant: effect=deny row inserted, revoked, or deleted
--      (principal-targeted only per schema rule; no risk_level filter here —
--       any deny change is security-relevant)
--   C) master.delegation_grant.is_revoked set to true (revocation only)
--
-- Each trigger calls the same shared function master.fn_bump_auth_epoch().
-- ============================================================================

-- ── Trigger function ─────────────────────────────────────────────────────────
-- Resolves the target principal_id from NEW (or OLD on DELETE) and bumps epoch.
-- Also emits an IAM outbox event so the outbox worker can bust frontend sessions.

CREATE OR REPLACE FUNCTION master.fn_bump_auth_epoch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, event, pg_catalog
AS $$
DECLARE
    v_principal_id  uuid;
    v_tenant_id     uuid;
    v_auth_epoch    integer;
BEGIN
    -- ── Determine the target principal ────────────────────────────────────
    IF TG_TABLE_NAME = 'principal' THEN
        v_principal_id := NEW.id;
        v_tenant_id    := NEW.tenant_id;

    ELSIF TG_TABLE_NAME = 'access_grant' THEN
        -- access_grant.principal_id may be NULL (role/group grants).
        -- auth_epoch only applies to direct-principal deny grants.
        IF TG_OP = 'DELETE' THEN
            v_principal_id := OLD.principal_id;
            v_tenant_id    := OLD.tenant_id;
        ELSE
            v_principal_id := NEW.principal_id;
            v_tenant_id    := NEW.tenant_id;
        END IF;
        IF v_principal_id IS NULL THEN
            RETURN COALESCE(NEW, OLD);
        END IF;

    ELSIF TG_TABLE_NAME = 'delegation_grant' THEN
        -- Bump delegate's epoch (they lose the delegated permissions on revoke).
        v_principal_id := NEW.delegate_id;
        v_tenant_id    := NEW.tenant_id;
    END IF;

    -- ── Increment auth_epoch ──────────────────────────────────────────────
    UPDATE master.principal
    SET    auth_epoch = auth_epoch + 1
    WHERE  id        = v_principal_id
      AND  tenant_id = v_tenant_id
    RETURNING auth_epoch INTO v_auth_epoch;

    -- ── Emit IAM outbox event ─────────────────────────────────────────────
    -- The IAM outbox worker picks this up and invalidates frontend/BFF sessions.
    -- ON CONFLICT DO NOTHING: if the principal was just deleted, skip gracefully.
    INSERT INTO event.outbox (
        tenant_id, topic, event_type, entity_type, entity_id, payload
    ) VALUES (
        v_tenant_id,
        'iam',
        'auth_epoch_changed',
        'principal',
        v_principal_id,
        jsonb_build_object(
            'principal_id', v_principal_id,
            'auth_epoch',   v_auth_epoch,
            'trigger_table', TG_TABLE_NAME,
            'trigger_op',    TG_OP
        )
    )
    ON CONFLICT DO NOTHING;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION master.fn_bump_auth_epoch IS
    'Increments master.principal.auth_epoch and emits an IAM outbox event. '
    'Called by auth_epoch triggers on principal (is_locked), '
    'access_grant (deny, principal-targeted), and delegation_grant (revocation). '
    'The session service compares the cached epoch with the DB on every cache hit; '
    'a mismatch forces immediate cache invalidation and session re-resolution.';

-- ── Trigger A: principal.is_locked toggled ────────────────────────────────────

DROP TRIGGER IF EXISTS trg_principal_bump_auth_epoch ON master.principal;
CREATE TRIGGER trg_principal_bump_auth_epoch
    AFTER UPDATE OF is_locked
    ON master.principal
    FOR EACH ROW
    WHEN (OLD.is_locked IS DISTINCT FROM NEW.is_locked)
    EXECUTE FUNCTION master.fn_bump_auth_epoch();

-- ── Trigger B: deny access_grant inserted or revoked (status change) ─────────
-- NOTE: DELETE is handled by a separate trigger (trg_access_grant_delete_bump_auth_epoch)
-- because PostgreSQL does not allow WHEN conditions to reference NEW in DELETE triggers.

-- INSERT: cannot reference OLD in WHEN clause — use NEW only
DROP TRIGGER IF EXISTS trg_access_grant_insert_bump_auth_epoch ON master.access_grant;
CREATE TRIGGER trg_access_grant_insert_bump_auth_epoch
    AFTER INSERT
    ON master.access_grant
    FOR EACH ROW
    WHEN (
        NEW.effect = 'deny'
        AND NEW.principal_id IS NOT NULL
    )
    EXECUTE FUNCTION master.fn_bump_auth_epoch();

-- UPDATE: can reference both OLD and NEW in WHEN clause
DROP TRIGGER IF EXISTS trg_access_grant_bump_auth_epoch ON master.access_grant;
CREATE TRIGGER trg_access_grant_bump_auth_epoch
    AFTER UPDATE OF status
    ON master.access_grant
    FOR EACH ROW
    WHEN (
        COALESCE(NEW.effect, OLD.effect) = 'deny'
        AND COALESCE(NEW.principal_id, OLD.principal_id) IS NOT NULL
    )
    EXECUTE FUNCTION master.fn_bump_auth_epoch();

-- ── Trigger B2: deny access_grant deleted ────────────────────────────────────

DROP TRIGGER IF EXISTS trg_access_grant_delete_bump_auth_epoch ON master.access_grant;
CREATE TRIGGER trg_access_grant_delete_bump_auth_epoch
    AFTER DELETE
    ON master.access_grant
    FOR EACH ROW
    WHEN (
        OLD.effect = 'deny'
        AND OLD.principal_id IS NOT NULL
    )
    EXECUTE FUNCTION master.fn_bump_auth_epoch();

-- ── Trigger C: delegation_grant revoked ──────────────────────────────────────

DROP TRIGGER IF EXISTS trg_delegation_grant_bump_auth_epoch ON master.delegation_grant;
CREATE TRIGGER trg_delegation_grant_bump_auth_epoch
    AFTER UPDATE OF is_revoked
    ON master.delegation_grant
    FOR EACH ROW
    WHEN (OLD.is_revoked = false AND NEW.is_revoked = true)
    EXECUTE FUNCTION master.fn_bump_auth_epoch();


-- ============================================================================
-- master.content_item — auto-maintenance triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trg_content_item_updated_at ON master.content_item;
CREATE TRIGGER trg_content_item_updated_at
    BEFORE UPDATE ON master.content_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_content_item_status_changed ON master.content_item;
CREATE TRIGGER trg_content_item_status_changed
    BEFORE UPDATE ON master.content_item
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- content_item.kind — extensible, governed by master.content_item_kind lookup
DROP TRIGGER IF EXISTS trg_content_item_kind_lookup ON master.content_item;
CREATE TRIGGER trg_content_item_kind_lookup
    BEFORE INSERT OR UPDATE OF kind ON master.content_item
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns('master.content_item_kind', 'kind');

-- content_item_link.relation_type — extensible
DROP TRIGGER IF EXISTS trg_cil_relation_type_lookup ON master.content_item_link;
CREATE TRIGGER trg_cil_relation_type_lookup
    BEFORE INSERT OR UPDATE OF relation_type ON master.content_item_link
    FOR EACH ROW EXECUTE FUNCTION
    control.trg_validate_lookup_columns(
        'master.content_item_link_relation_type', 'relation_type');


-- ============================================================================
-- UI principal tables: saved_view, dashboard, dashboard_widget,
-- principal_ui_profile, principal_ui_preference
-- ============================================================================
--                                             trg_validate_lookup_columns)
-- Convention: DROP TRIGGER IF EXISTS before CREATE for idempotency.
--             BEFORE triggers fire in alphabetical name order per PostgreSQL spec.

-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_profile
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_puip_enforce_created_by ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

-- updated_at / updated_by — shared stamp trigger (defined in supplementary)
DROP TRIGGER IF EXISTS trg_puip_updated_at ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_updated_at
    BEFORE UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_preference
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_puipref_enforce_created_by ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_puipref_updated_at ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_updated_at
    BEFORE UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- master.saved_view
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_sv_enforce_created_by ON master.saved_view;
CREATE TRIGGER trg_sv_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_sv_updated_at ON master.saved_view;
CREATE TRIGGER trg_sv_updated_at
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_saved_view_status_changed ON master.saved_view;
CREATE TRIGGER trg_saved_view_status_changed
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dash_enforce_created_by ON master.dashboard;
CREATE TRIGGER trg_dash_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_dash_updated_at ON master.dashboard;
CREATE TRIGGER trg_dash_updated_at
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_dashboard_status_changed ON master.dashboard;
CREATE TRIGGER trg_dashboard_status_changed
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard_widget
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dw_enforce_created_by ON master.dashboard_widget;
CREATE TRIGGER trg_dw_enforce_created_by
    BEFORE INSERT OR UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_created_by();

DROP TRIGGER IF EXISTS trg_dashboard_widget_updated_at ON master.dashboard_widget;
CREATE TRIGGER trg_dashboard_widget_updated_at
    BEFORE UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- §  TRIGGER EXECUTION ORDER (BEFORE triggers, alphabetical per table)
-- ════════════════════════════════════════════════════════════════════════════
--
-- master.principal_ui_profile — INSERT:
--   trg_puip_enforce_created_by     stamps created_by from session
--   [supplementary lookup triggers] validate locale_code etc.
--
-- master.principal_ui_profile — UPDATE:
--   trg_puip_enforce_created_by     blocks created_by mutation
--   trg_puip_updated_at             stamps updated_at / updated_by
--   [supplementary lookup triggers] validate locale_code etc.
--
-- master.principal_ui_preference — INSERT:
--   trg_puipref_enforce_created_by  stamps created_by from session
--   [supplementary lookup triggers] validate preference_code / surface_code
--
-- master.principal_ui_preference — UPDATE:
--   trg_puipref_enforce_created_by  blocks created_by mutation
--   trg_puipref_updated_at          stamps updated_at / updated_by
--   [supplementary lookup triggers] validate preference_code / surface_code
--
-- master.saved_view — INSERT:
--   trg_sv_enforce_created_by       stamps created_by from session
--   [supplementary: trg_sv_scope, trg_sv_surface_code]
--
-- master.saved_view — UPDATE:
--   trg_saved_view_status_changed   stamps status_changed_at / by
--   trg_sv_enforce_created_by       blocks created_by mutation
--   trg_sv_updated_at               stamps updated_at / updated_by
--   [supplementary: trg_sv_guard_scope_owner, trg_sv_immutable_code,
--                   trg_sv_scope, trg_sv_surface_code,
--                   trg_sv_sync_deleted_at]
--
-- master.dashboard — INSERT:
--   trg_dash_enforce_created_by     stamps created_by from session
--   [supplementary: trg_dash_scope, trg_dash_surface_code]
--
-- master.dashboard — UPDATE:
--   trg_dash_enforce_created_by     blocks created_by mutation
--   trg_dash_updated_at             stamps updated_at / updated_by
--   trg_dashboard_status_changed    stamps status_changed_at / by
--   [supplementary: trg_dash_guard_scope_owner, trg_dash_immutable_code,
--                   trg_dash_scope, trg_dash_surface_code,
--                   trg_dash_sync_deleted_at]
--
-- master.dashboard_widget — INSERT:
--   [supplementary: trg_dw_breakpoint]
--   trg_dw_enforce_created_by       stamps created_by from session
--   [supplementary: trg_dw_widget_type]
--
-- master.dashboard_widget — UPDATE:
--   trg_dashboard_widget_updated_at stamps updated_at / updated_by
--   [supplementary: trg_dw_breakpoint]
--   trg_dw_enforce_created_by       blocks created_by mutation
--   [supplementary: trg_dw_widget_type]
--
-- No ordering conflicts. Guard/enforcement triggers examine independent columns.


-- ============================================================================
-- UI principal supplementary triggers (scope/owner immutability, deleted_at sync)
-- ============================================================================
--             BEFORE triggers fire in alphabetical name order per PostgreSQL spec.
--
-- Lookup domain prerequisites (must be seeded before these triggers fire at runtime):
--   ui.view_scope, ui.dashboard_scope, ui.surface_code, ui.preference_code,
--   ui.breakpoint, ui.widget_type, ui.density, ui.appearance_mode
-- (Seeded in 900_seed_data/010_system/000_lookups/LookupDomain/master/)


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_profile — supplementary lookup validators
-- ════════════════════════════════════════════════════════════════════════════
-- locale_code / language_code / timezone_code validators are deferred —
-- those reference i18n lookup domains not yet seeded in this release.

DROP TRIGGER IF EXISTS trg_puip_appearance_mode ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_appearance_mode
    BEFORE INSERT OR UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.appearance_mode', 'appearance_mode');

DROP TRIGGER IF EXISTS trg_puip_density ON master.principal_ui_profile;
CREATE TRIGGER trg_puip_density
    BEFORE INSERT OR UPDATE ON master.principal_ui_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.density', 'density_code');


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_preference — supplementary lookup validators
-- ════════════════════════════════════════════════════════════════════════════
-- trg_validate_lookup_columns returns NEW when value IS NULL → safe for nullable surface_code.

DROP TRIGGER IF EXISTS trg_puipref_preference_code ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_preference_code
    BEFORE INSERT OR UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.preference_code', 'preference_code');

DROP TRIGGER IF EXISTS trg_puipref_surface_code ON master.principal_ui_preference;
CREATE TRIGGER trg_puipref_surface_code
    BEFORE INSERT OR UPDATE ON master.principal_ui_preference
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');


-- ════════════════════════════════════════════════════════════════════════════
-- master.saved_view — supplementary
-- ════════════════════════════════════════════════════════════════════════════

-- Immutable code (machine-stable key used by front-end routing / deep links)
DROP TRIGGER IF EXISTS trg_sv_immutable_code ON master.saved_view;
CREATE TRIGGER trg_sv_immutable_code
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

-- Scope/owner guard (immutable after INSERT — blocks escalation/transfer)
DROP TRIGGER IF EXISTS trg_sv_guard_scope_owner ON master.saved_view;
CREATE TRIGGER trg_sv_guard_scope_owner
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_scope_owner_immutable();

-- Lookup validators
-- Column is 'scope', domain is 'ui.view_scope' (separate from dashboard scope)
DROP TRIGGER IF EXISTS trg_sv_scope ON master.saved_view;
CREATE TRIGGER trg_sv_scope
    BEFORE INSERT OR UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.view_scope', 'scope');

DROP TRIGGER IF EXISTS trg_sv_surface_code ON master.saved_view;
CREATE TRIGGER trg_sv_surface_code
    BEFORE INSERT OR UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

-- deleted_at ↔ status sync
DROP TRIGGER IF EXISTS trg_sv_sync_deleted_at ON master.saved_view;
CREATE TRIGGER trg_sv_sync_deleted_at
    BEFORE UPDATE ON master.saved_view
    FOR EACH ROW EXECUTE FUNCTION master.trg_sync_deleted_at_with_status();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard — supplementary
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dash_immutable_code ON master.dashboard;
CREATE TRIGGER trg_dash_immutable_code
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION shared.trg_immutable_code();

DROP TRIGGER IF EXISTS trg_dash_guard_scope_owner ON master.dashboard;
CREATE TRIGGER trg_dash_guard_scope_owner
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION master.trg_guard_scope_owner_immutable();

-- Column is 'scope', domain is 'ui.dashboard_scope' (separate from saved_view scope)
DROP TRIGGER IF EXISTS trg_dash_scope ON master.dashboard;
CREATE TRIGGER trg_dash_scope
    BEFORE INSERT OR UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.dashboard_scope', 'scope');

DROP TRIGGER IF EXISTS trg_dash_surface_code ON master.dashboard;
CREATE TRIGGER trg_dash_surface_code
    BEFORE INSERT OR UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.surface_code', 'surface_code');

DROP TRIGGER IF EXISTS trg_dash_sync_deleted_at ON master.dashboard;
CREATE TRIGGER trg_dash_sync_deleted_at
    BEFORE UPDATE ON master.dashboard
    FOR EACH ROW EXECUTE FUNCTION master.trg_sync_deleted_at_with_status();


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard_widget — supplementary
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_dw_breakpoint ON master.dashboard_widget;
CREATE TRIGGER trg_dw_breakpoint
    BEFORE INSERT OR UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.breakpoint', 'breakpoint_code');

DROP TRIGGER IF EXISTS trg_dw_widget_type ON master.dashboard_widget;
CREATE TRIGGER trg_dw_widget_type
    BEFORE INSERT OR UPDATE ON master.dashboard_widget
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('ui.widget_type', 'widget_type_code');


-- ════════════════════════════════════════════════════════════════════════════
-- §  COMPLETE TRIGGER EXECUTION ORDER (BEFORE triggers, alphabetical per table)
-- ════════════════════════════════════════════════════════════════════════════
-- Combines 003b (core) and 003c (supplementary) for a full picture.
--
-- master.principal_ui_profile — INSERT:
--   trg_puip_appearance_mode        validates appearance_mode → ui.appearance_mode
--   trg_puip_density                validates density_code    → ui.density
--   trg_puip_enforce_created_by     stamps created_by from session
--
-- master.principal_ui_profile — UPDATE:
--   trg_puip_appearance_mode        validates appearance_mode
--   trg_puip_density                validates density_code
--   trg_puip_enforce_created_by     blocks created_by mutation
--   trg_puip_updated_at             stamps updated_at / updated_by
--
-- master.principal_ui_preference — INSERT:
--   trg_puipref_enforce_created_by  stamps created_by from session
--   trg_puipref_preference_code     validates preference_code → ui.preference_code
--   trg_puipref_surface_code        validates surface_code    → ui.surface_code (nullable)
--
-- master.principal_ui_preference — UPDATE:
--   trg_puipref_enforce_created_by  blocks created_by mutation
--   trg_puipref_preference_code     validates preference_code
--   trg_puipref_surface_code        validates surface_code
--   trg_puipref_updated_at          stamps updated_at / updated_by
--
-- master.saved_view — INSERT:
--   trg_sv_enforce_created_by       stamps created_by from session
--   trg_sv_scope                    validates scope → ui.view_scope
--   trg_sv_surface_code             validates surface_code → ui.surface_code
--
-- master.saved_view — UPDATE:
--   trg_saved_view_status_changed   stamps status_changed_at / by
--   trg_sv_enforce_created_by       blocks created_by mutation
--   trg_sv_guard_scope_owner        blocks scope / owner_principal_id mutation
--   trg_sv_immutable_code           blocks code mutation
--   trg_sv_scope                    validates scope → ui.view_scope
--   trg_sv_surface_code             validates surface_code → ui.surface_code
--   trg_sv_sync_deleted_at          syncs deleted_at with status
--   trg_sv_updated_at               stamps updated_at / updated_by
--
-- master.dashboard — INSERT:
--   trg_dash_enforce_created_by     stamps created_by from session
--   trg_dash_scope                  validates scope → ui.dashboard_scope
--   trg_dash_surface_code           validates surface_code → ui.surface_code (nullable)
--
-- master.dashboard — UPDATE:
--   trg_dash_enforce_created_by     blocks created_by mutation
--   trg_dash_guard_scope_owner      blocks scope / owner_principal_id mutation
--   trg_dash_immutable_code         blocks code mutation
--   trg_dash_scope                  validates scope → ui.dashboard_scope
--   trg_dash_surface_code           validates surface_code → ui.surface_code
--   trg_dash_sync_deleted_at        syncs deleted_at with status
--   trg_dash_updated_at             stamps updated_at / updated_by
--   trg_dashboard_status_changed    stamps status_changed_at / by
--
-- master.dashboard_widget — INSERT:
--   trg_dw_breakpoint               validates breakpoint_code → ui.breakpoint (nullable)
--   trg_dw_enforce_created_by       stamps created_by from session
--   trg_dw_widget_type              validates widget_type_code → ui.widget_type
--
-- master.dashboard_widget — UPDATE:
--   trg_dashboard_widget_updated_at stamps updated_at / updated_by
--   trg_dw_breakpoint               validates breakpoint_code
--   trg_dw_enforce_created_by       blocks created_by mutation
--   trg_dw_widget_type              validates widget_type_code
--
-- No ordering conflicts. Guard/enforcement/validation triggers examine
-- independent columns with no cross-dependencies.


-- ============================================================================
-- Payment terms tables
-- ============================================================================
-- Functions: CREATE OR REPLACE for idempotency.


-- ============================================================================
-- PART G — updated_at triggers
-- ============================================================================

-- holiday_calendar
DROP TRIGGER IF EXISTS trg_hc_updated_at ON master.holiday_calendar;
CREATE TRIGGER trg_hc_updated_at BEFORE UPDATE ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- holiday_calendar_day
DROP TRIGGER IF EXISTS trg_hcd_updated_at ON master.holiday_calendar_day;
CREATE TRIGGER trg_hcd_updated_at BEFORE UPDATE ON master.holiday_calendar_day
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- payment_term
DROP TRIGGER IF EXISTS trg_pt_updated_at ON master.payment_term;
CREATE TRIGGER trg_pt_updated_at BEFORE UPDATE ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- payment_term_clause
DROP TRIGGER IF EXISTS trg_ptc_updated_at ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_updated_at BEFORE UPDATE ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- payment_term_discount_tier
DROP TRIGGER IF EXISTS trg_ptdt_updated_at ON master.payment_term_discount_tier;
CREATE TRIGGER trg_ptdt_updated_at BEFORE UPDATE ON master.payment_term_discount_tier
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ============================================================================
-- PART G — status_changed triggers
-- ============================================================================

-- holiday_calendar
DROP TRIGGER IF EXISTS trg_hc_status_changed ON master.holiday_calendar;
CREATE TRIGGER trg_hc_status_changed BEFORE UPDATE ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- payment_term
DROP TRIGGER IF EXISTS trg_pt_status_changed ON master.payment_term;
CREATE TRIGGER trg_pt_status_changed BEFORE UPDATE ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- PART G — hc_single_default: enforce at most one is_default per tenant (FIX-8)
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_enforce_single_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE master.holiday_calendar
           SET is_default = false,
               updated_at = now()
         WHERE tenant_id = NEW.tenant_id
           AND id <> NEW.id
           AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hc_single_default ON master.holiday_calendar;
CREATE TRIGGER trg_hc_single_default
    BEFORE INSERT OR UPDATE OF is_default ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_single_default();


-- ============================================================================
-- PART G — weekend_days validation (FIX-8)
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_weekend_days()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- CUSTOM requires weekend_days with at least one element
    IF NEW.weekend_pattern = 'CUSTOM' THEN
        IF NEW.weekend_days IS NULL OR array_length(NEW.weekend_days, 1) IS NULL THEN
            RAISE EXCEPTION 'holiday_calendar: weekend_pattern=CUSTOM requires non-empty weekend_days array';
        END IF;
    END IF;

    -- Non-CUSTOM must not have weekend_days
    IF NEW.weekend_pattern <> 'CUSTOM' AND NEW.weekend_days IS NOT NULL THEN
        RAISE EXCEPTION 'holiday_calendar: weekend_days must be NULL when weekend_pattern is not CUSTOM';
    END IF;

    -- All elements must be 1..7 (ISO day-of-week)
    IF NEW.weekend_days IS NOT NULL THEN
        IF NOT (NEW.weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]) THEN
            RAISE EXCEPTION 'holiday_calendar: weekend_days elements must be 1-7 (ISO day-of-week)';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hc_validate_weekend_days ON master.holiday_calendar;
CREATE TRIGGER trg_hc_validate_weekend_days
    BEFORE INSERT OR UPDATE OF weekend_pattern, weekend_days ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_weekend_days();


-- ============================================================================
-- PART I — Lookup validation triggers
-- ============================================================================

-- payment_term.term_category
DROP TRIGGER IF EXISTS trg_pt_category_lookup ON master.payment_term;
CREATE TRIGGER trg_pt_category_lookup
    BEFORE INSERT OR UPDATE OF term_category ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_category', 'term_category');

-- payment_term_clause.trigger_event
DROP TRIGGER IF EXISTS trg_ptc_trigger_event_lookup ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_trigger_event_lookup
    BEFORE INSERT OR UPDATE OF trigger_event ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_trigger_event', 'trigger_event');

-- payment_term_clause.release_event
DROP TRIGGER IF EXISTS trg_ptc_release_event_lookup ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_release_event_lookup
    BEFORE INSERT OR UPDATE OF release_event ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_release_event', 'release_event');

-- payment_term_clause.recovery_method
DROP TRIGGER IF EXISTS trg_ptc_recovery_method_lookup ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_recovery_method_lookup
    BEFORE INSERT OR UPDATE OF recovery_method ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_recovery_method', 'recovery_method');


-- ============================================================================
-- PART G — settles_clause_code pairing validation (FIX-4)
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_settles_clause()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_target_type text;
BEGIN
    -- Only applies when settles_clause_code is set
    IF NEW.settles_clause_code IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve the clause_type of the referenced (settled) clause
    SELECT clause_type INTO v_target_type
      FROM master.payment_term_clause
     WHERE payment_term_id = NEW.payment_term_id
       AND clause_code     = NEW.settles_clause_code;

    IF v_target_type IS NULL THEN
        RAISE EXCEPTION 'payment_term_clause: settles_clause_code "%" not found within the same payment term',
            NEW.settles_clause_code;
    END IF;

    -- ADVANCE_RECOVERY must settle ADVANCE
    IF NEW.clause_type = 'ADVANCE_RECOVERY' AND v_target_type <> 'ADVANCE' THEN
        RAISE EXCEPTION 'payment_term_clause: ADVANCE_RECOVERY clause must settle an ADVANCE clause, found %',
            v_target_type;
    END IF;

    -- RETENTION_RELEASE must settle RETENTION
    IF NEW.clause_type = 'RETENTION_RELEASE' AND v_target_type <> 'RETENTION' THEN
        RAISE EXCEPTION 'payment_term_clause: RETENTION_RELEASE clause must settle a RETENTION clause, found %',
            v_target_type;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptc_validate_settles ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_validate_settles
    BEFORE INSERT OR UPDATE OF settles_clause_code, clause_type ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_settles_clause();


-- ============================================================================
-- PART G — Validate current payment term on supplier/customer profiles
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_current_payment_term()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_is_current boolean;
    v_status     text;
BEGIN
    -- Only validate when payment_term_id is set
    IF NEW.payment_term_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_current_version, status
      INTO v_is_current, v_status
      FROM master.payment_term
     WHERE id = NEW.payment_term_id
       AND tenant_id = NEW.tenant_id;

    IF v_is_current IS NULL THEN
        RAISE EXCEPTION '% payment_term_id not found in tenant',
            TG_TABLE_NAME;
    END IF;

    IF v_is_current <> true THEN
        RAISE EXCEPTION '% payment_term_id must reference the current version of a payment term',
            TG_TABLE_NAME;
    END IF;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION '% payment_term_id must reference an active payment term, found status=%',
            TG_TABLE_NAME, v_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scp_validate_payment_term ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_validate_payment_term
    BEFORE INSERT OR UPDATE OF payment_term_id ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_current_payment_term();

DROP TRIGGER IF EXISTS trg_ccp_validate_payment_term ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_validate_payment_term
    BEFORE INSERT OR UPDATE OF payment_term_id ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_current_payment_term();


-- ============================================================================
-- PART G — Payment term immutability (FIX-7)
-- Prevents mutation of business-critical columns once status leaves 'draft'.
-- Lifecycle columns (status, is_current_version, updated_at, updated_by,
-- status_changed_at, status_changed_by) are always allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_payment_term_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Only enforce once term leaves draft
    IF OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.code,  NEW.name,  NEW.description,  NEW.applicable_to,
        NEW.base_event,  NEW.due_rule_type,  NEW.due_days,  NEW.due_day_of_month,
        NEW.grace_days,  NEW.due_date_flexibility,  NEW.business_day_convention,
        NEW.holiday_calendar_id,  NEW.month_offset,  NEW.term_category,
        NEW.installment_count,  NEW.version,  NEW.supersedes_payment_term_id,
        NEW.effective_from,  NEW.effective_to,  NEW.sort_order,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.code,  OLD.name,  OLD.description,  OLD.applicable_to,
        OLD.base_event,  OLD.due_rule_type,  OLD.due_days,  OLD.due_day_of_month,
        OLD.grace_days,  OLD.due_date_flexibility,  OLD.business_day_convention,
        OLD.holiday_calendar_id,  OLD.month_offset,  OLD.term_category,
        OLD.installment_count,  OLD.version,  OLD.supersedes_payment_term_id,
        OLD.effective_from,  OLD.effective_to,  OLD.sort_order,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term: business columns are immutable once status is not draft (current status=%)',
            OLD.status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pt_immutable ON master.payment_term;
CREATE TRIGGER trg_pt_immutable
    BEFORE UPDATE ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_immutable();


-- ============================================================================
-- PART G — Payment term clause immutability (FIX-7)
-- Prevents mutation once parent term is not in draft.
-- Lifecycle columns (is_active, updated_at, updated_by) are allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_payment_term_clause_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_term_status text;
BEGIN
    SELECT status INTO v_term_status
      FROM master.payment_term
     WHERE id = OLD.payment_term_id
       AND tenant_id = OLD.tenant_id;

    -- Allow all changes while parent term is draft
    IF v_term_status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.clause_code,  NEW.clause_type,  NEW.sequence_no,
        NEW.settles_clause_code,  NEW.application_scope,  NEW.basis_amount_mode,
        NEW.calc_mode,  NEW.default_pct,  NEW.default_amount,  NEW.currency_code,
        NEW.flexibility_mode,  NEW.min_pct,  NEW.max_pct,  NEW.min_amount,  NEW.max_amount,
        NEW.cumulative_cap_pct,  NEW.cumulative_cap_amount,
        NEW.trigger_event,  NEW.release_event,  NEW.release_delay_days,
        NEW.recovery_start_after_pct,  NEW.recovery_end_before_pct,
        NEW.recovery_method,  NEW.partial_release_pct,  NEW.partial_release_event,
        NEW.rounding_method,  NEW.rounding_scale,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.clause_code,  OLD.clause_type,  OLD.sequence_no,
        OLD.settles_clause_code,  OLD.application_scope,  OLD.basis_amount_mode,
        OLD.calc_mode,  OLD.default_pct,  OLD.default_amount,  OLD.currency_code,
        OLD.flexibility_mode,  OLD.min_pct,  OLD.max_pct,  OLD.min_amount,  OLD.max_amount,
        OLD.cumulative_cap_pct,  OLD.cumulative_cap_amount,
        OLD.trigger_event,  OLD.release_event,  OLD.release_delay_days,
        OLD.recovery_start_after_pct,  OLD.recovery_end_before_pct,
        OLD.recovery_method,  OLD.partial_release_pct,  OLD.partial_release_event,
        OLD.rounding_method,  OLD.rounding_scale,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term_clause: business columns are immutable once parent term status is not draft (term status=%)',
            v_term_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptc_immutable ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_immutable
    BEFORE UPDATE ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_clause_immutable();


-- ============================================================================
-- PART G — Payment term discount tier immutability (FIX-7)
-- Prevents mutation once parent term is not in draft.
-- Lifecycle columns (updated_at, updated_by) are allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_payment_term_discount_tier_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_term_status text;
BEGIN
    SELECT status INTO v_term_status
      FROM master.payment_term
     WHERE id = OLD.payment_term_id
       AND tenant_id = OLD.tenant_id;

    -- Allow all changes while parent term is draft
    IF v_term_status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.tier_no,  NEW.qualify_within_days,  NEW.discount_pct,
        NEW.discount_fixed,  NEW.currency_code,  NEW.discount_basis_mode,
        NEW.min_invoice_amount,  NEW.is_best_only,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.tier_no,  OLD.qualify_within_days,  OLD.discount_pct,
        OLD.discount_fixed,  OLD.currency_code,  OLD.discount_basis_mode,
        OLD.min_invoice_amount,  OLD.is_best_only,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term_discount_tier: business columns are immutable once parent term status is not draft (term status=%)',
            v_term_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptdt_immutable ON master.payment_term_discount_tier;
CREATE TRIGGER trg_ptdt_immutable
    BEFORE UPDATE ON master.payment_term_discount_tier
    FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_discount_tier_immutable();


-- ── Phase 2 IAM: keycloak column freeze ─────────────────────────────────────
-- Write-freeze trigger for principal_profile.keycloak_* columns.
-- Enable by: ALTER DATABASE <db> SET app.iam_profile_kc_frozen = 'true';
-- While unset or 'false' the trigger is a no-op — safe to deploy pre-migration.

CREATE OR REPLACE FUNCTION master.trg_fn_freeze_keycloak_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master
AS $$
BEGIN
    IF current_setting('app.iam_profile_kc_frozen', true) <> 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.keycloak_id               IS DISTINCT FROM OLD.keycloak_id
        OR NEW.keycloak_username      IS DISTINCT FROM OLD.keycloak_username
        OR NEW.keycloak_sync_status   IS DISTINCT FROM OLD.keycloak_sync_status
        OR NEW.keycloak_synced_at     IS DISTINCT FROM OLD.keycloak_synced_at
        OR NEW.keycloak_federation_link    IS DISTINCT FROM OLD.keycloak_federation_link
        OR NEW.keycloak_not_before         IS DISTINCT FROM OLD.keycloak_not_before
        OR NEW.keycloak_created_at_millis  IS DISTINCT FROM OLD.keycloak_created_at_millis
        OR NEW.keycloak_required_actions   IS DISTINCT FROM OLD.keycloak_required_actions
        OR NEW.keycloak_service_client_id  IS DISTINCT FROM OLD.keycloak_service_client_id
    ) THEN
        RAISE EXCEPTION
            'principal_profile.keycloak_* columns are frozen — write to master.principal_identity_binding instead. '
            'To disable this guard: SET app.iam_profile_kc_frozen = ''false'''
            USING ERRCODE = 'check_violation',
                  HINT    = 'Run SELECT * FROM master.fn_migrate_principal_identity_bindings(false) to backfill bindings, then verify no code paths write keycloak_* before enabling the freeze.';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_fn_freeze_keycloak_profile_columns IS
    'Phase 2 IAM freeze guard. Raises check_violation when app.iam_profile_kc_frozen = ''true'' '
    'and an UPDATE tries to modify any keycloak_* column on principal_profile. '
    'Enable by setting the GUC after all write paths are migrated to principal_identity_binding.';

DROP TRIGGER IF EXISTS trg_freeze_keycloak_profile_columns ON master.principal_profile;

CREATE TRIGGER trg_freeze_keycloak_profile_columns
    BEFORE UPDATE ON master.principal_profile
    FOR EACH ROW
    EXECUTE FUNCTION master.trg_fn_freeze_keycloak_profile_columns();

COMMENT ON TRIGGER trg_freeze_keycloak_profile_columns ON master.principal_profile IS
    'Phase 2 IAM: no-op while app.iam_profile_kc_frozen is unset/false. '
    'Becomes a write guard once the GUC is set to ''true''. '
    'See fn_migrate_principal_identity_bindings() for activation instructions.';


-- =============================================================================
-- §PQ  Party qualification + IAM binding + network link triggers
--      (01i_tables_party_master.sql)
-- =============================================================================

-- ── master.supplier_qualification ────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sq_updated_at ON master.supplier_qualification;
CREATE TRIGGER trg_sq_updated_at BEFORE UPDATE ON master.supplier_qualification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── master.customer_qualification ────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cq_updated_at ON master.customer_qualification;
CREATE TRIGGER trg_cq_updated_at BEFORE UPDATE ON master.customer_qualification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── master.business_partner_network_link ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_bpnl_updated_at ON master.business_partner_network_link;
CREATE TRIGGER trg_bpnl_updated_at BEFORE UPDATE ON master.business_partner_network_link
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ── master.business_network ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_bn_updated_at ON master.business_network;
CREATE TRIGGER trg_bn_updated_at BEFORE UPDATE ON master.business_network
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bn_status_changed ON master.business_network;
CREATE TRIGGER trg_bn_status_changed BEFORE UPDATE OF status ON master.business_network
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- ── master.business_network_membership ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_bnm_updated_at ON master.business_network_membership;
CREATE TRIGGER trg_bnm_updated_at BEFORE UPDATE ON master.business_network_membership
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bnm_status_changed ON master.business_network_membership;
CREATE TRIGGER trg_bnm_status_changed BEFORE UPDATE OF status ON master.business_network_membership
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bnm_validate ON master.business_network_membership;
CREATE TRIGGER trg_bnm_validate
    BEFORE INSERT OR UPDATE OF network_id, participant_tenant_id, owner_business_partner_id, tenant_relationship_id, network_link_id
    ON master.business_network_membership
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_business_network_membership();

-- ── master.business_network_membership_role ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_bnmrole_updated_at ON master.business_network_membership_role;
CREATE TRIGGER trg_bnmrole_updated_at BEFORE UPDATE ON master.business_network_membership_role
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bnmrole_status_changed ON master.business_network_membership_role;
CREATE TRIGGER trg_bnmrole_status_changed BEFORE UPDATE OF status ON master.business_network_membership_role
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- ── master.legal_entity_identity_binding ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_leib_updated_at ON master.legal_entity_identity_binding;
CREATE TRIGGER trg_leib_updated_at BEFORE UPDATE ON master.legal_entity_identity_binding
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §CCSX  Supplier company-code extension triggers
--        (01h_tables_business_partner.sql — §BP6 / §BP7 / §BP8)
-- =============================================================================

-- ── master.company_code_supplier_spend_policy ────────────────────────────────
-- ── master.legal_entity_business_partner_link ────────────────────────────────
DROP TRIGGER IF EXISTS trg_lebpl_updated_at ON master.legal_entity_business_partner_link;
CREATE TRIGGER trg_lebpl_updated_at BEFORE UPDATE ON master.legal_entity_business_partner_link
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lebpl_status_changed ON master.legal_entity_business_partner_link;
CREATE TRIGGER trg_lebpl_status_changed BEFORE UPDATE ON master.legal_entity_business_partner_link
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Guard: when relationship_type = 'self_bp', the linked BP must have partner_category = 'internal'.
CREATE OR REPLACE FUNCTION master.trg_lebpl_self_bp_guard_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_category text;
BEGIN
    IF NEW.relationship_type = 'self_bp' THEN
        SELECT partner_category INTO v_category
        FROM master.business_partner
        WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

        IF v_category IS DISTINCT FROM 'internal' THEN
            RAISE EXCEPTION
                'legal_entity_business_partner_link: self_bp requires partner_category = ''internal'', got ''%'' for business_partner_id=%',
                v_category, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lebpl_self_bp_guard ON master.legal_entity_business_partner_link;
CREATE TRIGGER trg_lebpl_self_bp_guard
    BEFORE INSERT OR UPDATE OF relationship_type, business_partner_id
    ON master.legal_entity_business_partner_link
    FOR EACH ROW EXECUTE FUNCTION master.trg_lebpl_self_bp_guard_fn();


-- ── master.intercompany_trading_pair ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ictp_updated_at ON master.intercompany_trading_pair;
CREATE TRIGGER trg_ictp_updated_at BEFORE UPDATE ON master.intercompany_trading_pair
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ictp_status_changed ON master.intercompany_trading_pair;
CREATE TRIGGER trg_ictp_status_changed BEFORE UPDATE ON master.intercompany_trading_pair
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Guard: both company codes in a trading pair must have is_intercompany_enabled = true.
CREATE OR REPLACE FUNCTION master.trg_ictp_ic_enabled_guard_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_src_enabled  boolean;
    v_cpty_enabled boolean;
BEGIN
    SELECT is_intercompany_enabled INTO v_src_enabled
    FROM master.company_code
    WHERE tenant_id = NEW.tenant_id AND id = NEW.source_company_code_id;

    SELECT is_intercompany_enabled INTO v_cpty_enabled
    FROM master.company_code
    WHERE tenant_id = NEW.tenant_id AND id = NEW.counterparty_company_code_id;

    IF NOT COALESCE(v_src_enabled, false) THEN
        RAISE EXCEPTION
            'intercompany_trading_pair: source company code % does not have is_intercompany_enabled = true',
            NEW.source_company_code_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NOT COALESCE(v_cpty_enabled, false) THEN
        RAISE EXCEPTION
            'intercompany_trading_pair: counterparty company code % does not have is_intercompany_enabled = true',
            NEW.counterparty_company_code_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ictp_ic_enabled_guard ON master.intercompany_trading_pair;
CREATE TRIGGER trg_ictp_ic_enabled_guard
    BEFORE INSERT OR UPDATE OF source_company_code_id, counterparty_company_code_id
    ON master.intercompany_trading_pair
    FOR EACH ROW EXECUTE FUNCTION master.trg_ictp_ic_enabled_guard_fn();


-- ============================================================================
-- §RK  master.party_risk_* — triggers (01j_tables_party_risk.sql)
-- ============================================================================

-- ── updated_at maintenance ────────────────────────────────────────────────────
-- party_risk_review_event is fully immutable (no updated_at column); excluded.

DROP TRIGGER IF EXISTS trg_pre_updated_at  ON master.party_risk_evidence;
CREATE TRIGGER trg_pre_updated_at  BEFORE UPDATE ON master.party_risk_evidence
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pra_updated_at  ON master.party_risk_assessment;
CREATE TRIGGER trg_pra_updated_at  BEFORE UPDATE ON master.party_risk_assessment
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_prds_updated_at ON master.party_risk_dimension_score;
CREATE TRIGGER trg_prds_updated_at BEFORE UPDATE ON master.party_risk_dimension_score
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_prd_updated_at  ON master.party_risk_driver;
-- party_risk_driver has no updated_at column; only created_at — skip.

DROP TRIGGER IF EXISTS trg_prm_updated_at  ON master.party_risk_mitigation;
CREATE TRIGGER trg_prm_updated_at  BEFORE UPDATE ON master.party_risk_mitigation
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- ── immutability: party_risk_evidence core identity / source / classification ─
-- Evidence is append-only. Once a row is inserted the fields that identify
-- WHAT was received, FROM WHOM, ABOUT WHOM, and WHEN it arrived are locked.
-- Allowed changes: status, normalized_payload, tags, summary, title,
--   valid_until (expiry extension), superseded_by, confidence_score,
--   updated_at, updated_by.

CREATE OR REPLACE FUNCTION master.trg_pre_core_immutable_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF (
        OLD.tenant_id           IS DISTINCT FROM NEW.tenant_id           OR
        OLD.subject_type        IS DISTINCT FROM NEW.subject_type        OR
        OLD.subject_id          IS DISTINCT FROM NEW.subject_id          OR
        OLD.business_partner_id IS DISTINCT FROM NEW.business_partner_id OR
        OLD.source_code         IS DISTINCT FROM NEW.source_code         OR
        OLD.source_reference    IS DISTINCT FROM NEW.source_reference    OR
        OLD.evidence_type       IS DISTINCT FROM NEW.evidence_type       OR
        OLD.evidence_date       IS DISTINCT FROM NEW.evidence_date       OR
        OLD.received_at         IS DISTINCT FROM NEW.received_at         OR
        OLD.valid_from          IS DISTINCT FROM NEW.valid_from          OR
        OLD.ingested_by         IS DISTINCT FROM NEW.ingested_by         OR
        OLD.ingested_via        IS DISTINCT FROM NEW.ingested_via        OR
        OLD.created_at          IS DISTINCT FROM NEW.created_at          OR
        OLD.created_by          IS DISTINCT FROM NEW.created_by
    ) THEN
        RAISE EXCEPTION
            'party_risk_evidence: identity, source, and classification columns are '
            'immutable after insert. Immutable: tenant_id, subject_*, '
            'business_partner_id, source_code, source_reference, evidence_type, '
            'evidence_date, received_at, valid_from, ingested_by/via, created_at/by. '
            'Allowed: status, normalized_payload, confidence_score, tags, summary, '
            'title, valid_until, superseded_by, updated_at/by.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION master.trg_pre_core_immutable_fn() IS
    'Core immutability guard for party_risk_evidence. '
    'Immutable after insert: all identity, source, and classification fields. '
    'raw_payload has a dedicated guard (trg_pre_raw_payload_immutable). '
    'Mutable: status transitions, normalized_payload re-processing, tags, '
    'summary/title corrections, valid_until extension, superseded_by linkage.';

DROP TRIGGER IF EXISTS trg_pre_core_immutable ON master.party_risk_evidence;
CREATE TRIGGER trg_pre_core_immutable
    BEFORE UPDATE ON master.party_risk_evidence
    FOR EACH ROW EXECUTE FUNCTION master.trg_pre_core_immutable_fn();


-- ── immutability: party_risk_evidence.raw_payload ────────────────────────────
-- raw_payload is the verbatim provider response and must never change after
-- the first non-null write. normalized_payload, status, tags, and audit
-- columns may be updated freely.

CREATE OR REPLACE FUNCTION master.trg_pre_raw_payload_immutable_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF OLD.raw_payload IS NOT NULL
       AND OLD.raw_payload IS DISTINCT FROM NEW.raw_payload THEN
        RAISE EXCEPTION
            'party_risk_evidence: raw_payload is immutable once written. '
            'Update normalized_payload for re-processed interpretations.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION master.trg_pre_raw_payload_immutable_fn() IS
    'Blocks changes to raw_payload after it is first set. '
    'Allowed: normalized_payload, status, tags, updated_at/by, valid_until, summary. '
    'Blocked: raw_payload (exact provider response must be preserved as received).';

DROP TRIGGER IF EXISTS trg_pre_raw_payload_immutable ON master.party_risk_evidence;
CREATE TRIGGER trg_pre_raw_payload_immutable
    BEFORE UPDATE OF raw_payload ON master.party_risk_evidence
    FOR EACH ROW EXECUTE FUNCTION master.trg_pre_raw_payload_immutable_fn();


-- ── immutability: party_risk_review_event — no updates permitted ──────────────

CREATE OR REPLACE FUNCTION master.trg_prre_no_update_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    RAISE EXCEPTION
        'party_risk_review_event: rows are immutable after insert. '
        'The review event log is an append-only audit trail.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    RETURN NULL;
END $$;

COMMENT ON FUNCTION master.trg_prre_no_update_fn() IS
    'Blocks all UPDATE operations on party_risk_review_event. '
    'The table is an append-only audit trail — correct errors by inserting '
    'a new event with a correction note, not by modifying existing rows.';

DROP TRIGGER IF EXISTS trg_prre_no_update ON master.party_risk_review_event;
CREATE TRIGGER trg_prre_no_update
    BEFORE UPDATE ON master.party_risk_review_event
    FOR EACH ROW EXECUTE FUNCTION master.trg_prre_no_update_fn();


-- ── subject binding validation ────────────────────────────────────────────────
-- DB-enforced proof that subject_id + business_partner_id are consistent:
--   business_partner → subject_id = business_partner_id (same row)
--   supplier         → supplier.business_partner_id = evidence.business_partner_id
--   customer         → customer.business_partner_id = evidence.business_partner_id
-- project_engagement subjects are validated at application layer (no FK table here).

CREATE OR REPLACE FUNCTION master.trg_risk_subject_binding_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_bp_id uuid;
BEGIN
    IF NEW.subject_type = 'business_partner' THEN
        IF NEW.subject_id <> NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject binding: subject_type=business_partner requires '
                'subject_id = business_partner_id (got % vs %)',
                NEW.subject_id, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

    ELSIF NEW.subject_type = 'supplier' THEN
        SELECT business_partner_id INTO v_bp_id
        FROM master.supplier
        WHERE tenant_id = NEW.tenant_id AND id = NEW.subject_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'risk subject binding: supplier % not found for tenant %',
                NEW.subject_id, NEW.tenant_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF v_bp_id <> NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject binding: supplier %.business_partner_id = % '
                'does not match provided business_partner_id %',
                NEW.subject_id, v_bp_id, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

    ELSIF NEW.subject_type = 'customer' THEN
        SELECT business_partner_id INTO v_bp_id
        FROM master.customer
        WHERE tenant_id = NEW.tenant_id AND id = NEW.subject_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'risk subject binding: customer % not found for tenant %',
                NEW.subject_id, NEW.tenant_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF v_bp_id <> NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject binding: customer %.business_partner_id = % '
                'does not match provided business_partner_id %',
                NEW.subject_id, v_bp_id, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    -- project_engagement: validated at application layer.

    RETURN NEW;
END $$;

COMMENT ON FUNCTION master.trg_risk_subject_binding_fn() IS
    'Validates that subject_id + business_partner_id are consistent for '
    'business_partner, supplier, and customer subject types. '
    'business_partner: subject_id must equal business_partner_id. '
    'supplier/customer: looks up the role row and checks its business_partner_id FK. '
    'project_engagement: validated at application layer (no direct table here).';

DROP TRIGGER IF EXISTS trg_pre_subject_binding ON master.party_risk_evidence;
CREATE TRIGGER trg_pre_subject_binding
    BEFORE INSERT OR UPDATE OF subject_type, subject_id, business_partner_id
    ON master.party_risk_evidence
    FOR EACH ROW EXECUTE FUNCTION master.trg_risk_subject_binding_fn();

DROP TRIGGER IF EXISTS trg_pra_subject_binding ON master.party_risk_assessment;
CREATE TRIGGER trg_pra_subject_binding
    BEFORE INSERT OR UPDATE OF subject_type, subject_id, business_partner_id
    ON master.party_risk_assessment
    FOR EACH ROW EXECUTE FUNCTION master.trg_risk_subject_binding_fn();


-- ── qualification snapshot sync ───────────────────────────────────────────────
-- When a supplier_role assessment is approved, denormalize risk_band into
-- supplier_qualification.risk_tier so AP screens can read it without joining
-- back through the full risk stack.
-- Only supplier_role context is synced here; customer credit_status has
-- independent business semantics and is managed by the credit workflow.

CREATE OR REPLACE FUNCTION master.trg_pra_sync_qualification_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    -- Guard: pra_approved_band_chk prevents approved+unknown at the DB level,
    -- but NULLIF is kept here as a defensive fallback so the sync never writes
    -- a value that violates supplier_qualification.sq_risk_tier_chk.
    IF NEW.status = 'approved' AND NEW.assessment_context = 'supplier_role' THEN
        UPDATE master.supplier_qualification
        SET
            risk_tier        = NULLIF(NEW.risk_band, 'unknown'),
            next_review_date = NEW.next_review_at,
            last_review_date = COALESCE(NEW.approved_at::date, CURRENT_DATE),
            updated_at       = now(),
            updated_by       = COALESCE(NEW.approved_by, NEW.assessed_by)
        WHERE tenant_id   = NEW.tenant_id
          AND supplier_id = NEW.subject_id;
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION master.trg_pra_sync_qualification_fn() IS
    'Denormalizes approved supplier_role risk_band into '
    'supplier_qualification.risk_tier + next_review_date + last_review_date. '
    'Fires on INSERT and on UPDATE OF status, risk_band, next_review_at, approved_at, approved_by. '
    'NULLIF maps unknown → NULL defensively (pra_approved_band_chk should prevent it reaching here). '
    'Customer qualification credit_status is NOT synced — managed by the credit review workflow.';

DROP TRIGGER IF EXISTS trg_pra_sync_qualification ON master.party_risk_assessment;
-- Fire on status change AND on any field that feeds the qualification snapshot,
-- so an approved assessment updated via manual override stays in sync.
CREATE TRIGGER trg_pra_sync_qualification
    AFTER INSERT OR UPDATE OF status, risk_band, next_review_at, approved_at, approved_by
    ON master.party_risk_assessment
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND NEW.assessment_context = 'supplier_role')
    EXECUTE FUNCTION master.trg_pra_sync_qualification_fn();


-- ── approved assessment structural immutability guard ─────────────────────────
-- Once an assessment is approved, its identity and scoring columns are locked.
-- Changes to risk_band (manual overrides), notes, next_review_at, and lifecycle
-- columns (status, approved_at/by, superseded_by, updated_at/by) are still allowed.

CREATE OR REPLACE FUNCTION master.trg_pra_approved_immutable_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF OLD.status = 'approved' THEN

        -- Block structural identity / scoring columns.
        IF (
            OLD.subject_type         IS DISTINCT FROM NEW.subject_type         OR
            OLD.subject_id           IS DISTINCT FROM NEW.subject_id           OR
            OLD.business_partner_id  IS DISTINCT FROM NEW.business_partner_id  OR
            OLD.assessment_context   IS DISTINCT FROM NEW.assessment_context   OR
            OLD.model_code           IS DISTINCT FROM NEW.model_code           OR
            OLD.model_version        IS DISTINCT FROM NEW.model_version        OR
            OLD.overall_score        IS DISTINCT FROM NEW.overall_score
        ) THEN
            RAISE EXCEPTION
                'party_risk_assessment: structural columns are immutable once status=approved. '
                'Blocked: subject_type, subject_id, business_partner_id, assessment_context, '
                'model_code, model_version, overall_score. '
                'To change scoring, create a new assessment and supersede this one.'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        -- If risk_band changes on an approved assessment, it must be a declared
        -- manual override: is_override=true and override_reason set.
        IF OLD.risk_band IS DISTINCT FROM NEW.risk_band THEN
            IF NOT NEW.is_override OR NEW.override_reason IS NULL THEN
                RAISE EXCEPTION
                    'party_risk_assessment: changing risk_band on an approved assessment '
                    'requires is_override=true and a non-null override_reason. '
                    'Set is_override=true, provide override_reason, and set override_score '
                    'to document the basis for the manual band change.'
                    USING ERRCODE = 'object_not_in_prerequisite_state';
            END IF;
        END IF;

    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION master.trg_pra_approved_immutable_fn() IS
    'Two-part guard on approved party_risk_assessment rows. '
    'Part 1 — structural lock: blocks changes to subject_type, subject_id, '
    'business_partner_id, assessment_context, model_code, model_version, overall_score. '
    'Part 2 — override gate: if risk_band changes while status=approved, '
    'is_override must be true and override_reason must be non-null. '
    'Mutable without restriction: notes, next_review_at, review_frequency, '
    'status, approved_at/by, assessed_at/by, superseded_by, updated_at/by.';

DROP TRIGGER IF EXISTS trg_pra_approved_immutable ON master.party_risk_assessment;
CREATE TRIGGER trg_pra_approved_immutable
    BEFORE UPDATE ON master.party_risk_assessment
    FOR EACH ROW EXECUTE FUNCTION master.trg_pra_approved_immutable_fn();


-- ── driver child-consistency: dimension_score_id must belong to same assessment ──
-- Composite FK (tenant_id, dimension_score_id) prevents cross-tenant refs,
-- but cannot enforce cross-assessment consistency. This trigger does.

CREATE OR REPLACE FUNCTION master.trg_prd_child_consistency_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_score_assessment_id   uuid;
    v_assessment_bp_id      uuid;
    v_evidence_bp_id        uuid;
BEGIN
    -- Check 1: dimension_score_id must belong to the same assessment.
    IF NEW.dimension_score_id IS NOT NULL THEN
        SELECT assessment_id INTO v_score_assessment_id
        FROM master.party_risk_dimension_score
        WHERE tenant_id = NEW.tenant_id AND id = NEW.dimension_score_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'party_risk_driver: dimension_score_id % not found for tenant %',
                NEW.dimension_score_id, NEW.tenant_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

        IF v_score_assessment_id <> NEW.assessment_id THEN
            RAISE EXCEPTION
                'party_risk_driver: dimension_score % belongs to assessment % '
                'but driver references assessment %',
                NEW.dimension_score_id, v_score_assessment_id, NEW.assessment_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    -- Check 2: evidence_id (when set) must belong to the same business partner
    -- as the assessment. Cross-BP evidence attachment is not allowed.
    IF NEW.evidence_id IS NOT NULL THEN
        SELECT business_partner_id INTO v_assessment_bp_id
        FROM master.party_risk_assessment
        WHERE tenant_id = NEW.tenant_id AND id = NEW.assessment_id;

        SELECT business_partner_id INTO v_evidence_bp_id
        FROM master.party_risk_evidence
        WHERE tenant_id = NEW.tenant_id AND id = NEW.evidence_id;

        IF v_evidence_bp_id IS NULL OR v_evidence_bp_id <> v_assessment_bp_id THEN
            RAISE EXCEPTION
                'party_risk_driver: evidence % has business_partner_id % '
                'which does not match assessment % business_partner_id %',
                NEW.evidence_id, v_evidence_bp_id,
                NEW.assessment_id, v_assessment_bp_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END $$;

COMMENT ON FUNCTION master.trg_prd_child_consistency_fn() IS
    'Two-check consistency guard for party_risk_driver children. '
    'Check 1: dimension_score_id (when set) must belong to the same assessment_id. '
    'Check 2: evidence_id (when set) must have the same business_partner_id '
    'as the assessment — prevents cross-BP evidence attachment. '
    'Composite FKs handle tenant isolation; this trigger handles cross-record '
    'consistency within the same tenant.';

DROP TRIGGER IF EXISTS trg_prd_child_consistency ON master.party_risk_driver;
CREATE TRIGGER trg_prd_child_consistency
    BEFORE INSERT OR UPDATE OF dimension_score_id, assessment_id, evidence_id
    ON master.party_risk_driver
    FOR EACH ROW EXECUTE FUNCTION master.trg_prd_child_consistency_fn();
