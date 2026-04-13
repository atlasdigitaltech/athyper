-- 09_triggers/003_master.sql
-- Depends on: 04_tables/003_master.sql, 08_functions (shared.trg_set_updated_at)
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.

-- updated_at
DROP TRIGGER IF EXISTS trg_tenant_updated_at ON master.tenant;
CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- status_changed_at
DROP TRIGGER IF EXISTS trg_tenant_status_changed ON master.tenant;
CREATE TRIGGER trg_tenant_status_changed BEFORE UPDATE ON master.tenant FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- status transition guard
DROP TRIGGER IF EXISTS trg_tenant_status_transition ON master.tenant;
CREATE TRIGGER trg_tenant_status_transition BEFORE UPDATE OF status ON master.tenant FOR EACH ROW EXECUTE FUNCTION master.trg_guard_tenant_status_transition();

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

-- tenant.status
DROP TRIGGER IF EXISTS trg_tenant_status_lookup ON master.tenant;
CREATE TRIGGER trg_tenant_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.tenant
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_status', 'status');

-- tenant.subscription
DROP TRIGGER IF EXISTS trg_tenant_subscription_lookup ON master.tenant;
CREATE TRIGGER trg_tenant_subscription_lookup
    BEFORE INSERT OR UPDATE OF subscription ON master.tenant
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.tenant_subscription', 'subscription');

-- principal.principal_type
DROP TRIGGER IF EXISTS trg_principal_type_lookup ON master.principal;
CREATE TRIGGER trg_principal_type_lookup
    BEFORE INSERT OR UPDATE OF principal_type ON master.principal
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_type', 'principal_type');

-- principal.status
DROP TRIGGER IF EXISTS trg_principal_status_lookup ON master.principal;
CREATE TRIGGER trg_principal_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.principal
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.principal_status', 'status');

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

-- lookup validation: status
DROP TRIGGER IF EXISTS trg_legal_entity_status_lookup ON master.legal_entity;
CREATE TRIGGER trg_legal_entity_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.legal_entity
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.legal_entity_status', 'status');

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

DROP TRIGGER IF EXISTS trg_company_code_status_lookup ON master.company_code;
CREATE TRIGGER trg_company_code_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.company_code
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_status', 'status');

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

DROP TRIGGER IF EXISTS trg_cc_status_lookup ON master.cost_center;
CREATE TRIGGER trg_cc_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.cost_center
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cost_center_status', 'status');

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

DROP TRIGGER IF EXISTS trg_pc_status_lookup ON master.profit_center;
CREATE TRIGGER trg_pc_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.profit_center
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.profit_center_status', 'status');

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

DROP TRIGGER IF EXISTS trg_site_status_lookup ON master.site;
CREATE TRIGGER trg_site_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.site
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.site_status', 'status');

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

DROP TRIGGER IF EXISTS trg_wh_status_lookup ON master.warehouse;
CREATE TRIGGER trg_wh_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.warehouse
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.warehouse_status', 'status');

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

DROP TRIGGER IF EXISTS trg_coa_status_lookup ON master.chart_of_account;
CREATE TRIGGER trg_coa_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.chart_of_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.chart_of_account_status', 'status');

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

DROP TRIGGER IF EXISTS trg_gla_status_lookup ON master.gl_account;
CREATE TRIGGER trg_gla_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.gl_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.gl_account_status', 'status');

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

DROP TRIGGER IF EXISTS trg_proj_status_lookup ON master.project;
CREATE TRIGGER trg_proj_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.project
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_status', 'status');

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

DROP TRIGGER IF EXISTS trg_pi_status_lookup ON master.project_item;
CREATE TRIGGER trg_pi_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.project_item
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.project_item_status', 'status');

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

DROP TRIGGER IF EXISTS trg_fp_status_lookup ON master.fiscal_period;
CREATE TRIGGER trg_fp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.fiscal_period
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.fiscal_period_status', 'status');

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

DROP TRIGGER IF EXISTS trg_lb_status_lookup ON master.ledger_book;
CREATE TRIGGER trg_lb_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.ledger_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.ledger_book_status', 'status');

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

DROP TRIGGER IF EXISTS trg_ba_status_lookup ON master.company_code_book_assignment;
CREATE TRIGGER trg_ba_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.company_code_book_assignment
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_book_assignment_status', 'status');

DROP TRIGGER IF EXISTS trg_ba_conflict_lookup ON master.company_code_book_assignment;
CREATE TRIGGER trg_ba_conflict_lookup
    BEFORE INSERT OR UPDATE OF conflict_strategy ON master.company_code_book_assignment
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_book_assignment_conflict', 'conflict_strategy');


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- =============================================================================

-- =============================================================================
-- §P1  master.customer
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cust_updated_at ON master.customer;
CREATE TRIGGER trg_cust_updated_at BEFORE UPDATE ON master.customer
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cust_status_changed ON master.customer;
CREATE TRIGGER trg_cust_status_changed BEFORE UPDATE ON master.customer
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_cust_status_lookup ON master.customer;
CREATE TRIGGER trg_cust_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.customer
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.customer_status', 'status');

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

DROP TRIGGER IF EXISTS trg_supp_status_lookup ON master.supplier;
CREATE TRIGGER trg_supp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.supplier
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.supplier_status', 'status');

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

DROP TRIGGER IF EXISTS trg_emp_status_lookup ON master.employee;
CREATE TRIGGER trg_emp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.employee
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.employee_status', 'status');

DROP TRIGGER IF EXISTS trg_emp_type_lookup ON master.employee;
CREATE TRIGGER trg_emp_type_lookup
    BEFORE INSERT OR UPDATE OF employment_type ON master.employee
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.employment_type', 'employment_type');


-- =============================================================================
-- §P4  master.item_category
-- =============================================================================

DROP TRIGGER IF EXISTS trg_pcat_updated_at ON master.item_category;
CREATE TRIGGER trg_pcat_updated_at BEFORE UPDATE ON master.item_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pcat_status_changed ON master.item_category;
CREATE TRIGGER trg_pcat_status_changed BEFORE UPDATE ON master.item_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pcat_status_lookup ON master.item_category;
CREATE TRIGGER trg_pcat_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.item_category
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.item_category_status', 'status');


-- =============================================================================
-- §P5  master.product
-- =============================================================================

DROP TRIGGER IF EXISTS trg_prod_updated_at ON master.product;
CREATE TRIGGER trg_prod_updated_at BEFORE UPDATE ON master.product
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_prod_status_changed ON master.product;
CREATE TRIGGER trg_prod_status_changed BEFORE UPDATE ON master.product
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_prod_status_lookup ON master.product;
CREATE TRIGGER trg_prod_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.product
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.product_status', 'status');

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

DROP TRIGGER IF EXISTS trg_im_status_lookup ON master.item;
CREATE TRIGGER trg_im_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.item
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.item_status', 'status');

DROP TRIGGER IF EXISTS trg_im_valuation_lookup ON master.item;
CREATE TRIGGER trg_im_valuation_lookup
    BEFORE INSERT OR UPDATE OF valuation_method ON master.item
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.valuation_method', 'valuation_method');


-- =============================================================================
-- §P7  master.spend_category
-- =============================================================================

DROP TRIGGER IF EXISTS trg_sc_updated_at ON master.spend_category;
CREATE TRIGGER trg_sc_updated_at BEFORE UPDATE ON master.spend_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_sc_status_changed ON master.spend_category;
CREATE TRIGGER trg_sc_status_changed BEFORE UPDATE ON master.spend_category
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_sc_status_lookup ON master.spend_category;
CREATE TRIGGER trg_sc_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.spend_category
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.spend_category_status', 'status');

DROP TRIGGER IF EXISTS trg_sc_procurement_type_lookup ON master.spend_category;
CREATE TRIGGER trg_sc_procurement_type_lookup
    BEFORE INSERT OR UPDATE OF procurement_type ON master.spend_category
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.procurement_type', 'procurement_type');

DROP TRIGGER IF EXISTS trg_sc_visibility_lookup ON master.spend_category;
CREATE TRIGGER trg_sc_visibility_lookup
    BEFORE INSERT OR UPDATE OF visibility ON master.spend_category
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.spend_visibility', 'visibility');

DROP TRIGGER IF EXISTS trg_sc_depreciation_lookup ON master.spend_category;
DROP TRIGGER IF EXISTS trg_sc_domain_lookup ON master.spend_category;
DROP TRIGGER IF EXISTS trg_sc_maintain_root_category ON master.spend_category;
CREATE TRIGGER trg_sc_maintain_root_category
    BEFORE INSERT OR UPDATE OF parent_id ON master.spend_category
    FOR EACH ROW EXECUTE FUNCTION master.trg_sc_maintain_root_category();


-- =============================================================================
-- §P7b  master.company_code_spend_policy
-- =============================================================================

DROP TRIGGER IF EXISTS trg_scou_updated_at ON master.company_code_spend_policy;
CREATE TRIGGER trg_scou_updated_at BEFORE UPDATE ON master.company_code_spend_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_scou_status_changed ON master.company_code_spend_policy;
CREATE TRIGGER trg_scou_status_changed BEFORE UPDATE ON master.company_code_spend_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_scou_status_lookup ON master.company_code_spend_policy;
CREATE TRIGGER trg_scou_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.company_code_spend_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.company_code_spend_policy_status', 'status');

DROP TRIGGER IF EXISTS trg_scou_visibility_lookup ON master.company_code_spend_policy;
CREATE TRIGGER trg_scou_visibility_lookup
    BEFORE INSERT OR UPDATE OF override_visibility ON master.company_code_spend_policy
    FOR EACH ROW
    WHEN (NEW.override_visibility IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns('master.spend_visibility', 'override_visibility');


-- =============================================================================
-- §P8  master.commodity_classification
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cc_updated_at ON master.commodity_classification;
CREATE TRIGGER trg_cc_updated_at BEFORE UPDATE ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cc_status_changed ON master.commodity_classification;
CREATE TRIGGER trg_cc_status_changed BEFORE UPDATE ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_cc_status_lookup ON master.commodity_classification;
CREATE TRIGGER trg_cc_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.commodity_classification
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.cc_status', 'status');

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

DROP TRIGGER IF EXISTS trg_ccp_status_lookup ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.customer_status', 'status');

DROP TRIGGER IF EXISTS trg_ccp_payment_terms_lookup ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_payment_terms_lookup
    BEFORE INSERT OR UPDATE OF payment_terms ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.party_payment_terms', 'payment_terms');

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

DROP TRIGGER IF EXISTS trg_scp_status_lookup ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.supplier_status', 'status');

DROP TRIGGER IF EXISTS trg_scp_payment_terms_lookup ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_payment_terms_lookup
    BEFORE INSERT OR UPDATE OF payment_terms ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.party_payment_terms', 'payment_terms');

DROP TRIGGER IF EXISTS trg_scp_payment_method_lookup ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_payment_method_lookup
    BEFORE INSERT OR UPDATE OF payment_method ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.supplier_payment_method', 'payment_method');


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

DROP TRIGGER IF EXISTS trg_ac_status_lookup ON master.asset_class;
CREATE TRIGGER trg_ac_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.asset_class
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_class_status', 'status');

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

DROP TRIGGER IF EXISTS trg_asset_status_lookup ON master.asset;
CREATE TRIGGER trg_asset_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.asset
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_status', 'status');

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

DROP TRIGGER IF EXISTS trg_ab_status_lookup ON master.asset_book;
CREATE TRIGGER trg_ab_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.asset_book
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_status', 'status');

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

DROP TRIGGER IF EXISTS trg_acomp_status_lookup ON master.asset_component;
CREATE TRIGGER trg_acomp_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.asset_component
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_component_status', 'status');


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

-- Lookup validation: dimension_type.status via domain master.dimension_type_status
DROP TRIGGER IF EXISTS trg_dt_status_lookup ON master.dimension_type;
CREATE TRIGGER trg_dt_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.dimension_type
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.dimension_type_status', 'status');

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

-- Lookup validation: dimension_value.status via domain master.dimension_value_status
DROP TRIGGER IF EXISTS trg_dv_status_lookup ON master.dimension_value;
CREATE TRIGGER trg_dv_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.dimension_value
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.dimension_value_status', 'status');

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

DROP TRIGGER IF EXISTS trg_oim_updated_at ON master.company_code_intent_policy;
CREATE TRIGGER trg_oim_updated_at
    BEFORE UPDATE ON master.company_code_intent_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_oim_status_changed ON master.company_code_intent_policy;
CREATE TRIGGER trg_oim_status_changed
    BEFORE UPDATE OF status ON master.company_code_intent_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


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

DROP TRIGGER IF EXISTS trg_bank_party_status_lookup ON master.bank_party;
CREATE TRIGGER trg_bank_party_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.bank_party
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_party_status', 'status');

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

DROP TRIGGER IF EXISTS trg_bank_account_status_lookup ON master.bank_account;
CREATE TRIGGER trg_bank_account_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.bank_account
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_status', 'status');

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

DROP TRIGGER IF EXISTS trg_bahc_status_lookup ON master.bank_account_house_config;
CREATE TRIGGER trg_bahc_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.bank_account_house_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_house_config_status', 'status');

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

DROP TRIGGER IF EXISTS trg_pm_status_lookup ON master.payment_method;
CREATE TRIGGER trg_pm_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.payment_method
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_status', 'status');

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

-- ── customer.tax_id_type lookup validation ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_cust_tax_id_type_lookup ON master.customer;
CREATE TRIGGER trg_cust_tax_id_type_lookup
    BEFORE INSERT OR UPDATE OF tax_id_type ON master.customer
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.tax_id_type', 'tax_id_type');

-- ── supplier.tax_id_type lookup validation ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_supp_tax_id_type_lookup ON master.supplier;
CREATE TRIGGER trg_supp_tax_id_type_lookup
    BEFORE INSERT OR UPDATE OF tax_id_type ON master.supplier
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.tax_id_type', 'tax_id_type');

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
