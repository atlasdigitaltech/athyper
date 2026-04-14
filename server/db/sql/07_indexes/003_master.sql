-- 07_indexes/003_master.sql
-- Depends on: 04_tables/003_master.sql
-- Naming: <table>_<cols>_idx | _uq (unique) | _pidx (partial WHERE).

-- tenant
CREATE INDEX IF NOT EXISTS tenant_active_pidx ON master.tenant (code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS tenant_subscription_idx ON master.tenant (subscription);

-- Auth lookup regardless of status (suspended tenants still log in to see error)
CREATE INDEX IF NOT EXISTS tenant_realm_code_all_idx ON master.tenant (realm_key, code);

-- principal
CREATE INDEX IF NOT EXISTS principal_tenant_type_idx ON master.principal (tenant_id, principal_type);
CREATE INDEX IF NOT EXISTS principal_tenant_active_pidx ON master.principal (tenant_id, principal_type) WHERE is_active = true AND is_locked = false;
CREATE INDEX IF NOT EXISTS principal_login_email_idx ON master.principal (tenant_id, login_email) WHERE login_email IS NOT NULL;

-- principal_profile
CREATE INDEX IF NOT EXISTS principal_profile_principal_idx ON master.principal_profile (tenant_id, principal_id);
-- principal_profile_keycloak_idx REMOVED — redundant with
-- principal_profile_keycloak_uq UNIQUE NULLS NOT DISTINCT on the table.
CREATE INDEX IF NOT EXISTS principal_profile_sync_drift_pidx ON master.principal_profile (tenant_id) WHERE keycloak_sync_status IN ('pending', 'drift', 'error');
CREATE INDEX IF NOT EXISTS principal_profile_required_actions_pidx ON master.principal_profile (tenant_id) WHERE array_length(keycloak_required_actions, 1) > 0;

-- contact_link
-- Purpose-scoped primary uniqueness: at most one is_primary=true per (owner, channel, purpose).
-- purpose is nullable — NULLS NOT DISTINCT ensures NULL purpose is treated as a single bucket.
DROP INDEX IF EXISTS master.ux_contact_link_one_primary;
CREATE UNIQUE INDEX IF NOT EXISTS ux_contact_link_one_primary
    ON master.contact_link (tenant_id, owner_type, owner_id, channel_type, purpose)
    NULLS NOT DISTINCT
    WHERE is_primary = true;

-- Value-level dedup: prevents duplicate (owner, channel, value, purpose) rows regardless of is_primary.
-- Used by fn_upsert_contact_link ON CONFLICT for true upsert semantics.
CREATE UNIQUE INDEX IF NOT EXISTS contact_link_value_uq
    ON master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose)
    NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_contact_link_principal_login ON master.contact_link (tenant_id, lower(value)) WHERE owner_type = 'principal' AND channel_type = 'email' AND purpose = 'login' AND is_verified = true AND is_primary = true;
CREATE INDEX IF NOT EXISTS contact_link_owner_idx ON master.contact_link (tenant_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS contact_link_verified_pidx ON master.contact_link (tenant_id, owner_type, owner_id, channel_type) WHERE is_verified = true;

-- Per-purpose primary lookup: supports fn_sync_principal_login_email and equivalent resolvers
CREATE INDEX IF NOT EXISTS contact_link_primary_purpose_idx
    ON master.contact_link (tenant_id, owner_type, owner_id, channel_type, purpose)
    WHERE is_primary = true AND is_verified = true AND status = 'active';

-- contact_email
CREATE INDEX IF NOT EXISTS contact_email_domain_idx ON master.contact_email (tenant_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_email_bounced_pidx ON master.contact_email (tenant_id) WHERE bounce_count > 0;
CREATE INDEX IF NOT EXISTS contact_email_disposable_pidx ON master.contact_email (tenant_id) WHERE is_disposable = true;

-- contact_phone
CREATE INDEX IF NOT EXISTS contact_phone_e164_idx ON master.contact_phone (tenant_id, e164) WHERE e164 IS NOT NULL;

-- label
CREATE INDEX IF NOT EXISTS label_active_pidx
    ON master.label (entity, code, locale_code)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS label_tenant_pidx
    ON master.label (tenant_id, entity, code)
    WHERE tenant_id IS NOT NULL;

-- owner_type
-- Per-namespace uniqueness: system codes globally unique, tenant codes unique per tenant.
-- These partial unique indexes replace the old PK(code) which forced a single global namespace.
-- P4-FIX: Pattern B split partial indexes.
--   System codes (tenant_id IS NULL): unique on (code) globally.
--   Tenant codes (tenant_id IS NOT NULL): unique on (tenant_id, code).
--   A single NULLS NOT DISTINCT constraint would block tenants from shadowing system codes,
--   which is explicitly supported (tenants can extend system owner types with same code).
DROP INDEX IF EXISTS master.owner_type_system_pidx;
DROP INDEX IF EXISTS master.owner_type_tenant_pidx;

CREATE UNIQUE INDEX IF NOT EXISTS owner_type_system_code_uq
    ON master.owner_type (code)
    WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS owner_type_tenant_code_uq
    ON master.owner_type (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS owner_type_category_idx
    ON master.owner_type (category, sort_order)
    WHERE status = 'active';

-- address
-- Content-addressable dedup: prevents duplicate active addresses with the same
-- postal fingerprint within a tenant. Used by fn_create_owner_contact_address
-- ON CONFLICT to reuse existing address rows instead of minting duplicates.
-- Partial: only deduplicates rows where line1 and postal_code are populated
-- and the address is active. Incomplete or deprecated addresses are excluded.
-- Note: no NULLS NOT DISTINCT — addresses with country_code IS NULL or city IS
-- NULL are not deduped (standard NULL != NULL in unique indexes). This is
-- acceptable: country-less addresses are edge cases and ON CONFLICT inference
-- cannot match NULLS NOT DISTINCT partial indexes by column list.
CREATE UNIQUE INDEX IF NOT EXISTS address_dedup_uq
    ON master.address (tenant_id, country_code, postal_code, line1, city)
    WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS address_tenant_idx
    ON master.address (tenant_id);

CREATE INDEX IF NOT EXISTS address_country_idx
    ON master.address (tenant_id, country_code)
    WHERE country_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS address_active_pidx
    ON master.address (tenant_id)
    WHERE status = 'active';

-- address_link
CREATE INDEX IF NOT EXISTS address_link_owner_idx
    ON master.address_link (tenant_id, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS address_link_owner_purpose_idx
    ON master.address_link (tenant_id, owner_type, owner_id, purpose);

CREATE INDEX IF NOT EXISTS address_link_active_pidx
    ON master.address_link (tenant_id, owner_type, owner_id, purpose)
    WHERE effective_until IS NULL;

CREATE INDEX IF NOT EXISTS address_link_primary_pidx
    ON master.address_link (tenant_id, owner_type, owner_id, purpose)
    WHERE is_primary = true AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS address_link_default_pidx
    ON master.address_link (tenant_id, owner_type, owner_id)
    WHERE purpose = 'default' AND is_primary = true AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS address_link_address_idx
    ON master.address_link (tenant_id, address_id);

-- ── RBAC Phase 2 indexes ────────────────────────────────────

-- operating_unit indexes removed — table dropped in company_code migration.

-- principal_profile (supervisor lookups)
CREATE INDEX IF NOT EXISTS principal_profile_supervisor_idx
    ON master.principal_profile (tenant_id, supervisor_id)
    WHERE supervisor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS principal_profile_default_cc_idx
    ON master.principal_profile (tenant_id, default_company_code_id)
    WHERE default_company_code_id IS NOT NULL;

-- tenant_module_subscription
CREATE INDEX IF NOT EXISTS tms_tenant_active_pidx
    ON master.tenant_module_subscription (tenant_id)
    WHERE status = 'active';

-- tenant_feature_entitlement
CREATE INDEX IF NOT EXISTS tfe_tenant_active_pidx
    ON master.tenant_feature_entitlement (tenant_id)
    WHERE status = 'active';

-- tenant_permission_override
CREATE INDEX IF NOT EXISTS tpo_tenant_perm_pidx
    ON master.tenant_permission_override (tenant_id, permission_id)
    WHERE is_granted = true;

-- company_code_access
CREATE INDEX IF NOT EXISTS cca_entity_idx
    ON master.company_code_access (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS cca_cc_idx
    ON master.company_code_access (tenant_id, company_code_id);

-- ── RBAC Phase 3 indexes ────────────────────────────────────

-- role (shared.role — no tenant_id)
CREATE INDEX IF NOT EXISTS shared_role_persona_idx ON shared.role (persona_id);
CREATE INDEX IF NOT EXISTS shared_role_module_pidx ON shared.role (module_id) WHERE module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_role_active_pidx ON shared.role (id) WHERE status = 'active';

-- auth_group
CREATE INDEX IF NOT EXISTS aug_tenant_active_pidx ON master.auth_group (tenant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_aug_self_service_eligible ON master.auth_group (tenant_id) WHERE is_self_service_eligible = true AND status = 'active';

-- auth_group_role
CREATE INDEX IF NOT EXISTS agr_group_active_pidx ON master.auth_group_role (tenant_id, group_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS agr_role_idx ON master.auth_group_role (tenant_id, role_id);
CREATE INDEX IF NOT EXISTS agr_assignment_scope_idx
    ON master.auth_group_role (tenant_id, assignment_scope_type, assignment_scope_ref_id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS agr_assignment_le_idx
    ON master.auth_group_role (tenant_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'legal_entity' AND status = 'active';
CREATE INDEX IF NOT EXISTS agr_assignment_cc_idx
    ON master.auth_group_role (tenant_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'company_code' AND status = 'active';

-- auth_group_member
CREATE INDEX IF NOT EXISTS agm_principal_idx ON master.auth_group_member (tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS agm_group_idx ON master.auth_group_member (tenant_id, group_id);

-- principal_persona
CREATE INDEX IF NOT EXISTS pp_persona_idx ON master.principal_persona (tenant_id, persona_id);

-- team
CREATE INDEX IF NOT EXISTS team_tenant_active_pidx ON master.team (tenant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS team_leader_idx ON master.team (tenant_id, leader_id);

-- team_member
-- Patch 001 Fix 2: replaces team_member_active_uq table constraint.
-- Partial unique: only active memberships (left_at IS NULL) must be unique per team.
-- Historical rows (left_at IS NOT NULL) are unrestricted — allows re-joining after leaving.
DROP INDEX IF EXISTS master.tm_principal_active_pidx;
CREATE UNIQUE INDEX IF NOT EXISTS team_member_active_uidx
    ON master.team_member (tenant_id, team_id, principal_id)
    WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS tm_team_idx ON master.team_member (tenant_id, team_id);

-- access_grant
CREATE INDEX IF NOT EXISTS ag_principal_perm_pidx ON master.access_grant (tenant_id, principal_id, permission_id)
    WHERE status = 'active' AND principal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ag_role_perm_pidx ON master.access_grant (tenant_id, role_id, permission_id)
    WHERE status = 'active' AND role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ag_group_perm_pidx ON master.access_grant (tenant_id, group_id, permission_id)
    WHERE status = 'active' AND group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ag_assignment_scope_idx
    ON master.access_grant (tenant_id, permission_id, assignment_scope_type)
    WHERE status = 'active' AND effect = 'allow';
CREATE INDEX IF NOT EXISTS ag_assignment_cc_idx
    ON master.access_grant (tenant_id, permission_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'company_code' AND status = 'active' AND effect = 'allow';
CREATE INDEX IF NOT EXISTS ag_assignment_le_idx
    ON master.access_grant (tenant_id, permission_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'legal_entity' AND status = 'active' AND effect = 'allow';

-- group_feature_grant
CREATE INDEX IF NOT EXISTS gfg_group_idx ON master.group_feature_grant (tenant_id, group_id);

-- principal_feature_grant
CREATE INDEX IF NOT EXISTS pfg_principal_idx ON master.principal_feature_grant (tenant_id, principal_id);


-- ————————————————————————————————————————————————————————————————————————————
-- §27  notification (per-recipient inbox)
-- ————————————————————————————————————————————————————————————————————————————

-- Inbox: unread notifications for a recipient (the primary inbox query)
CREATE INDEX IF NOT EXISTS notif_recipient_unread_pidx
    ON master.notification (tenant_id, recipient_id, created_at DESC)
    WHERE is_read = false AND is_dismissed = false;

-- Full recipient notification history
CREATE INDEX IF NOT EXISTS notif_recipient_idx
    ON master.notification (tenant_id, recipient_id, created_at DESC);

-- Entity notification history
CREATE INDEX IF NOT EXISTS notif_entity_pidx
    ON master.notification (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL;

-- Category-scoped inbox (category panel filtering)
CREATE INDEX IF NOT EXISTS notif_category_unread_pidx
    ON master.notification (tenant_id, recipient_id, category, created_at DESC)
    WHERE is_read = false AND category IS NOT NULL;

-- Expiry sweep
CREATE INDEX IF NOT EXISTS notif_expiry_pidx
    ON master.notification (expires_at)
    WHERE expires_at IS NOT NULL;

-- Patch 001 Fix 3: partition-compatible dedup unique index.
-- created_at is required in unique index by PG partitioned table rules.
-- Prevents same-partition duplicate notifications per (message, recipient, channel).
-- Cross-partition dedup requires application-level idempotency check (ON CONFLICT DO NOTHING).
-- Partial (message_id IS NOT NULL): system notifications without a source message are not deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS notif_msg_recipient_channel_uidx
    ON master.notification (tenant_id, message_id, recipient_id, channel, created_at)
    WHERE message_id IS NOT NULL;

-- 07_indexes/012_identity_sharing.sql
-- Indexes for master.tenant_profile and master.delegation_grant.

-- —— master.tenant_profile ———————————————————————————————————————————————
-- Lookup by tenant (UNIQUE constraint covers this, but explicit index aids
-- planner on JOIN-heavy queries)
CREATE INDEX IF NOT EXISTS tp_tenant_idx
    ON master.tenant_profile (tenant_id);

-- Tenants in a given country/currency (admin dashboards)
CREATE INDEX IF NOT EXISTS tp_country_idx
    ON master.tenant_profile (country_code)
    WHERE country_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS tp_currency_idx
    ON master.tenant_profile (currency_code)
    WHERE currency_code IS NOT NULL;


-- —— master.delegation_grant —————————————————————————————————————————————
-- Primary: active grants where I am the delegate (what can I do on behalf of others?)
CREATE INDEX IF NOT EXISTS dg_delegate_active_idx
    ON master.delegation_grant (tenant_id, delegate_id, expires_at DESC)
    WHERE is_revoked = false;

-- Active grants where I am the delegator (what have I delegated?)
CREATE INDEX IF NOT EXISTS dg_delegator_active_idx
    ON master.delegation_grant (tenant_id, delegator_id, expires_at DESC)
    WHERE is_revoked = false;

-- Expiry sweep: grants expiring soon or already expired
CREATE INDEX IF NOT EXISTS dg_expiry_idx
    ON master.delegation_grant (expires_at ASC)
    WHERE is_revoked = false;

-- Scope lookup: find active grants covering a specific scope
CREATE INDEX IF NOT EXISTS dg_scope_active_idx
    ON master.delegation_grant (tenant_id, scope_type, scope_ref)
    WHERE is_revoked = false AND scope_ref IS NOT NULL;

-- Revocation history
CREATE INDEX IF NOT EXISTS dg_revoked_pidx
    ON master.delegation_grant (tenant_id, delegator_id, revoked_at DESC)
    WHERE is_revoked = true;

-- Request cross-reference
CREATE INDEX IF NOT EXISTS dg_request_pidx
    ON master.delegation_grant (request_id)
    WHERE request_id IS NOT NULL;

-- 07_indexes/013_collab.sql
-- Indexes for collaboration cluster — all 11 tables.
-- Naming: {abbrev}_{columns}_{idx|pidx}

-- —— §1  master.attachment ———————————————————————————————————————————————
-- Active file lookup
CREATE INDEX IF NOT EXISTS att_tenant_active_idx
    ON master.attachment (tenant_id, created_at DESC)
    WHERE is_active = true AND is_current = true;
-- Content-addressable dedup
CREATE INDEX IF NOT EXISTS att_sha256_idx
    ON master.attachment (tenant_id, sha256)
    WHERE sha256 IS NOT NULL;
-- Versioning chain
CREATE INDEX IF NOT EXISTS att_parent_idx
    ON master.attachment (tenant_id, parent_attachment_id)
    WHERE parent_attachment_id IS NOT NULL;
-- Expiry sweep
CREATE INDEX IF NOT EXISTS att_expiry_pidx
    ON master.attachment (expires_at)
    WHERE expires_at IS NOT NULL AND is_auto_delete_on_expiry = true;
-- Preview generation queue
CREATE INDEX IF NOT EXISTS att_preview_pending_pidx
    ON master.attachment (tenant_id, created_at)
    WHERE is_virus_scanned = true
      AND preview_key IS NULL
      AND is_preview_generation_failed = false
      AND is_active = true;

-- —— §2  master.multipart_upload —————————————————————————————————————————
-- In-flight uploads for a tenant (cleanup sweep + status dashboard)
CREATE INDEX IF NOT EXISTS mpu_tenant_status_idx
    ON master.multipart_upload (tenant_id, status, created_at DESC);
-- Expiry sweep (abort stale uploads)
CREATE INDEX IF NOT EXISTS mpu_expiry_pidx
    ON master.multipart_upload (expires_at)
    WHERE status IN ('initiated', 'uploading');

-- —— §3  master.attachment_acl ———————————————————————————————————————————
-- ACL lookup: can principal P access attachment A?
CREATE INDEX IF NOT EXISTS acl_attachment_principal_idx
    ON master.attachment_acl (tenant_id, attachment_id, principal_id)
    WHERE principal_id IS NOT NULL AND is_granted = true;
-- Role-based ACL lookup
CREATE INDEX IF NOT EXISTS acl_attachment_role_idx
    ON master.attachment_acl (tenant_id, attachment_id, role_id)
    WHERE role_id IS NOT NULL AND is_granted = true;
-- Expiry sweep
CREATE INDEX IF NOT EXISTS acl_expiry_pidx
    ON master.attachment_acl (expires_at)
    WHERE expires_at IS NOT NULL;

-- —— §4  master.comment —————————————————————————————————————————————————
-- Entity comment thread (primary query)
CREATE INDEX IF NOT EXISTS comment_entity_idx
    ON master.comment (tenant_id, context_type, entity_type, entity_id,
                       created_at DESC)
    WHERE deleted_at IS NULL;
-- Root comments only (thread entry points)
CREATE INDEX IF NOT EXISTS comment_root_pidx
    ON master.comment (tenant_id, entity_type, entity_id, created_at DESC)
    WHERE parent_comment_id IS NULL AND deleted_at IS NULL;
-- Thread replies under a parent
CREATE INDEX IF NOT EXISTS comment_thread_idx
    ON master.comment (tenant_id, parent_comment_id, created_at ASC)
    WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;
-- Commenter activity feed
CREATE INDEX IF NOT EXISTS comment_commenter_idx
    ON master.comment (tenant_id, commenter_id, created_at DESC)
    WHERE deleted_at IS NULL;
-- Retention / archival sweep
CREATE INDEX IF NOT EXISTS comment_retention_pidx
    ON master.comment (tenant_id, retention_until)
    WHERE retention_until IS NOT NULL AND deleted_at IS NULL;
-- FTS: full-text search on comment_text
CREATE INDEX IF NOT EXISTS comment_fts_idx
    ON master.comment USING GIN (to_tsvector('english', comment_text))
    WHERE deleted_at IS NULL;

-- —— §5  master.comment_draft ———————————————————————————————————————————
-- Draft lookup: find user's draft for a specific entity target
CREATE INDEX IF NOT EXISTS cd_principal_entity_idx
    ON master.comment_draft (tenant_id, principal_id, entity_type, entity_id);
-- Auto-save recency
CREATE INDEX IF NOT EXISTS cd_principal_recent_idx
    ON master.comment_draft (tenant_id, principal_id, updated_at DESC);

-- —— §6  master.comment_mention —————————————————————————————————————————
-- "You were mentioned" notification query
CREATE INDEX IF NOT EXISTS cm_mentioned_idx
    ON master.comment_mention (tenant_id, mentioned_id, created_at DESC);
-- All mentions in a comment
CREATE INDEX IF NOT EXISTS cm_comment_idx
    ON master.comment_mention (tenant_id, context_type, comment_id);

-- —— §7  master.comment_reaction ————————————————————————————————————————
-- All reactions on a comment (reaction summary)
CREATE INDEX IF NOT EXISTS cr_comment_idx
    ON master.comment_reaction (tenant_id, context_type, comment_id, reaction_type);
-- Principal's reactions (to show "you reacted with X")
CREATE INDEX IF NOT EXISTS cr_principal_idx
    ON master.comment_reaction (tenant_id, principal_id, created_at DESC);

-- —— §8  master.conversation ————————————————————————————————————————————
-- Tenant conversation list
CREATE INDEX IF NOT EXISTS conv_tenant_active_idx
    ON master.conversation (tenant_id, created_at DESC)
    WHERE status = 'active' AND deleted_at IS NULL;
-- Entity-anchored conversations
CREATE INDEX IF NOT EXISTS conv_entity_pidx
    ON master.conversation (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL AND status = 'active';

-- —— §9  master.conversation_participant ————————————————————————————————
-- Active memberships for a principal (conversation list)
CREATE INDEX IF NOT EXISTS cp_principal_active_idx
    ON master.conversation_participant (tenant_id, principal_id, joined_at DESC)
    WHERE left_at IS NULL;
-- All active participants of a conversation
CREATE INDEX IF NOT EXISTS cp_conversation_idx
    ON master.conversation_participant (tenant_id, conversation_id)
    WHERE left_at IS NULL;
-- Unread count: participants whose last_read_at is behind latest message
CREATE INDEX IF NOT EXISTS cp_read_cursor_pidx
    ON master.conversation_participant (tenant_id, conversation_id,
                                        last_read_at DESC NULLS LAST)
    WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS lts_entity_scheduled_idx
    ON event.lifecycle_timer_schedule (tenant_id, entity_name, entity_id, state_id)
    WHERE status = 'scheduled';

-- ── master.lifecycle_instance ────────────────────────────────────────────────
-- Current state of an entity (primary operational query)
CREATE INDEX IF NOT EXISTS li_entity_idx
    ON master.lifecycle_instance (tenant_id, entity_name, entity_id);


-- =============================================================================
-- §12  DOCUMENT · PRINT · BRANDING  —  master indexes
-- =============================================================================

-- ── master.document ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS document_tenant_idx
    ON master.document (tenant_id);
CREATE INDEX IF NOT EXISTS document_active_pidx
    ON master.document (tenant_id)
    WHERE status = 'active';

-- ── master.brand_profile ───────────────────────────────────────────────────
-- Single active default per tenant (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS brand_profile_default_uq
    ON master.brand_profile (tenant_id)
    WHERE is_default = true AND is_active = true;
CREATE INDEX IF NOT EXISTS brand_profile_active_pidx
    ON master.brand_profile (tenant_id)
    WHERE is_active = true;

-- ── master.letterhead ──────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS letterhead_default_uq
    ON master.letterhead (tenant_id)
    WHERE is_default = true AND is_active = true;
CREATE INDEX IF NOT EXISTS letterhead_cc_idx
    ON master.letterhead (company_code_id)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS letterhead_active_pidx
    ON master.letterhead (tenant_id)
    WHERE is_active = true;

-- ── master.template ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS template_kind_idx
    ON master.template (tenant_id, kind);
CREATE INDEX IF NOT EXISTS template_published_pidx
    ON master.template (tenant_id, kind)
    WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS template_current_version_idx
    ON master.template (current_version_id)
    WHERE current_version_id IS NOT NULL;

-- ── master.attachment_comment ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS att_comment_attachment_idx
    ON master.attachment_comment (tenant_id, attachment_id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS att_comment_author_idx
    ON master.attachment_comment (tenant_id, author_id)
    WHERE deleted_at IS NULL;

-- ── master.template_binding ────────────────────────────────────────────────
-- Unique active binding per (template, entity, operation, variant)
CREATE UNIQUE INDEX IF NOT EXISTS template_binding_active_uq
    ON master.template_binding
    (tenant_id, template_id, entity_name, operation, variant)
    WHERE is_active = true;
-- Priority-ordered resolution scan for resolve_template_binding()
CREATE INDEX IF NOT EXISTS template_binding_priority_idx
    ON master.template_binding
    (tenant_id, entity_name, operation, variant, priority DESC)
    WHERE is_active = true;

-- ── master.entity_document_link ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS edl_entity_idx
    ON master.entity_document_link (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS edl_attachment_idx
    ON master.entity_document_link (tenant_id, attachment_id);


-- ============================================================================
-- CORE FINANCE MASTER — INDEXES
-- ============================================================================

-- ── master.legal_entity ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS le_tenant_idx   ON master.legal_entity (tenant_id);
CREATE INDEX IF NOT EXISTS le_parent_idx   ON master.legal_entity (tenant_id, parent_entity_id) WHERE parent_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS le_active_pidx  ON master.legal_entity (tenant_id) WHERE is_active = true;

-- ── master.company_code ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cc_tenant_idx        ON master.company_code (tenant_id);
CREATE INDEX IF NOT EXISTS cc_legal_entity_idx  ON master.company_code (tenant_id, legal_entity_id);
CREATE INDEX IF NOT EXISTS cc_active_pidx       ON master.company_code (tenant_id) WHERE is_active = true;

-- ── master.cost_center ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cc_tenant_company_idx ON master.cost_center (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS cc_parent_idx         ON master.cost_center (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cc_category_idx       ON master.cost_center (tenant_id, company_code_id, cost_center_category);
CREATE INDEX IF NOT EXISTS cc_postable_pidx      ON master.cost_center (tenant_id, company_code_id)
    WHERE is_active = true AND node_type = 'posting';

-- ── master.profit_center ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pc_tenant_company_idx ON master.profit_center (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS pc_parent_idx         ON master.profit_center (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pc_segment_idx        ON master.profit_center (tenant_id, segment_code) WHERE segment_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS pc_postable_pidx      ON master.profit_center (tenant_id, company_code_id)
    WHERE is_active = true AND node_type = 'posting';

-- ── master.site ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS site_tenant_company_idx ON master.site (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS site_parent_idx         ON master.site (tenant_id, parent_site_id) WHERE parent_site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS site_type_idx           ON master.site (tenant_id, company_code_id, site_type);
CREATE INDEX IF NOT EXISTS site_active_pidx        ON master.site (tenant_id, company_code_id) WHERE is_active = true;

-- ── master.warehouse ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS wh_site_idx    ON master.warehouse (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS wh_type_idx    ON master.warehouse (tenant_id, warehouse_type);
CREATE INDEX IF NOT EXISTS wh_active_pidx ON master.warehouse (tenant_id, site_id) WHERE is_active = true;

-- ── master.chart_of_account ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS coa_tenant_idx  ON master.chart_of_account (tenant_id);
CREATE INDEX IF NOT EXISTS coa_active_pidx ON master.chart_of_account (tenant_id) WHERE is_active = true;

-- ── master.gl_account ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS gla_chart_idx     ON master.gl_account (tenant_id, chart_of_account_id);
CREATE INDEX IF NOT EXISTS gla_parent_idx    ON master.gl_account (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gla_class_idx     ON master.gl_account (tenant_id, chart_of_account_id, account_class);
CREATE INDEX IF NOT EXISTS gla_postable_pidx ON master.gl_account (tenant_id, chart_of_account_id, account_class)
    WHERE is_active = true AND node_type = 'posting';

-- ── master.company_code_chart_assignment ────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ccca_primary_uq ON master.company_code_chart_assignment
    (tenant_id, company_code_id, assignment_type) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS ccca_company_idx ON master.company_code_chart_assignment (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ccca_chart_idx   ON master.company_code_chart_assignment (tenant_id, chart_of_account_id);

-- ── master.company_code_gl_account ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ccga_company_idx ON master.company_code_gl_account (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ccga_account_idx ON master.company_code_gl_account (tenant_id, gl_account_id);

-- ── master.project ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS proj_tenant_company_idx ON master.project (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS proj_parent_idx         ON master.project (tenant_id, parent_project_id) WHERE parent_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proj_type_idx           ON master.project (tenant_id, project_type);
CREATE INDEX IF NOT EXISTS proj_active_pidx        ON master.project (tenant_id, company_code_id) WHERE is_active = true;

-- ── master.project_item ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pi_project_idx    ON master.project_item (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS pi_parent_idx     ON master.project_item (tenant_id, parent_item_id) WHERE parent_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pi_type_idx       ON master.project_item (tenant_id, project_id, item_type);
CREATE INDEX IF NOT EXISTS pi_active_pidx    ON master.project_item (tenant_id, project_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS pi_milestone_pidx ON master.project_item (tenant_id, project_id, milestone_date)
    WHERE milestone_date IS NOT NULL;


-- ── master.dimension_set ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ds_tenant_idx ON master.dimension_set (tenant_id);

-- ── master.fiscal_period ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS fp_tenant_company_idx ON master.fiscal_period (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS fp_status_idx         ON master.fiscal_period (tenant_id, company_code_id, status);
CREATE INDEX IF NOT EXISTS fp_open_pidx          ON master.fiscal_period (tenant_id, company_code_id)
    WHERE status IN ('open', 'soft_close');
CREATE INDEX IF NOT EXISTS fp_dates_idx          ON master.fiscal_period (tenant_id, start_date, end_date);

-- ── master.ledger_book ───────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ledger_book_primary_uq ON master.ledger_book (tenant_id) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS ledger_book_tenant_idx        ON master.ledger_book (tenant_id);
CREATE INDEX IF NOT EXISTS ledger_book_active_pidx       ON master.ledger_book (tenant_id) WHERE is_active = true;

-- ── master.company_code_book_assignment ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ba_company_idx   ON master.company_code_book_assignment (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ba_book_idx      ON master.company_code_book_assignment (tenant_id, book_id);
CREATE INDEX IF NOT EXISTS ba_active_pidx   ON master.company_code_book_assignment (tenant_id, company_code_id) WHERE is_active = true;


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- =============================================================================

-- ── master.customer (pure tenant master) ───────────────────────────────────
CREATE INDEX IF NOT EXISTS cust_tenant_idx    ON master.customer (tenant_id);
CREATE INDEX IF NOT EXISTS cust_active_pidx   ON master.customer (tenant_id, code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS cust_type_idx      ON master.customer (tenant_id, customer_type);

-- ── master.supplier (pure tenant master) ───────────────────────────────────
CREATE INDEX IF NOT EXISTS supp_tenant_idx    ON master.supplier (tenant_id);
CREATE INDEX IF NOT EXISTS supp_active_pidx   ON master.supplier (tenant_id, code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS supp_type_idx      ON master.supplier (tenant_id, supplier_type);

-- ── master.employee ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS emp_tenant_idx      ON master.employee (tenant_id);
CREATE INDEX IF NOT EXISTS emp_active_pidx     ON master.employee (tenant_id, status, termination_date)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS emp_principal_idx   ON master.employee (tenant_id, principal_id) WHERE principal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emp_manager_idx     ON master.employee (tenant_id, manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emp_cc_idx          ON master.employee (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;

-- ── master.item_category ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pcat_tenant_idx     ON master.item_category (tenant_id);
CREATE INDEX IF NOT EXISTS pcat_parent_idx     ON master.item_category (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pcat_active_pidx    ON master.item_category (tenant_id) WHERE is_active = true;

-- ── master.product ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS prod_tenant_idx       ON master.product (tenant_id);
CREATE INDEX IF NOT EXISTS prod_active_pidx      ON master.product (tenant_id, code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS prod_category_idx     ON master.product (tenant_id, category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prod_spend_cat_idx    ON master.product (tenant_id, spend_category_id) WHERE spend_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prod_type_idx         ON master.product (tenant_id, product_type);

-- ── master.item ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS im_tenant_idx         ON master.item (tenant_id);
CREATE INDEX IF NOT EXISTS im_company_product_idx ON master.item (tenant_id, company_code_id, product_id)
    WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS im_product_idx        ON master.item (tenant_id, product_id)
    WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS im_reorder_pidx       ON master.item (tenant_id, company_code_id)
    WHERE reorder_point IS NOT NULL;

-- Items by category (item-centric path)
CREATE INDEX IF NOT EXISTS im_category_pidx
    ON master.item (tenant_id, category_id)
    WHERE category_id IS NOT NULL AND is_active = true;

-- Items without product (item-centric path admin view)
CREATE INDEX IF NOT EXISTS im_no_product_pidx
    ON master.item (tenant_id, company_code_id)
    WHERE product_id IS NULL AND is_active = true;

-- ── master.spend_category ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sc_tenant_idx         ON master.spend_category (tenant_id);
CREATE INDEX IF NOT EXISTS sc_parent_idx         ON master.spend_category (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sc_root_cat_idx       ON master.spend_category (tenant_id, root_category_id);
CREATE INDEX IF NOT EXISTS sc_active_pidx        ON master.spend_category (tenant_id) WHERE is_active = true;

-- ── master.company_code_spend_policy ────────────────────────────────────
-- Note: (tenant_id, company_code_id, spend_category_id) is already covered by UNIQUE constraint.
CREATE INDEX IF NOT EXISTS sccp_tenant_idx       ON master.company_code_spend_policy (tenant_id);
CREATE INDEX IF NOT EXISTS sccp_category_idx     ON master.company_code_spend_policy (tenant_id, spend_category_id);
CREATE INDEX IF NOT EXISTS sccp_cc_idx           ON master.company_code_spend_policy (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS sccp_active_pidx      ON master.company_code_spend_policy (tenant_id, company_code_id)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS sccp_asset_class_idx  ON master.company_code_spend_policy (tenant_id, asset_class_id)
    WHERE asset_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sccp_default_pidx     ON master.company_code_spend_policy (tenant_id, company_code_id, spend_category_id)
    WHERE is_default = true;

-- ── master.commodity_classification ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cc_owner_idx          ON master.commodity_classification (tenant_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS cc_owner_domain_pidx  ON master.commodity_classification
    (tenant_id, owner_type, owner_id, classification_type, domain_code)
    WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS cc_code_idx           ON master.commodity_classification (code_id, owner_type);
CREATE INDEX IF NOT EXISTS ccl_active_pidx       ON master.commodity_classification (tenant_id, owner_type)
    WHERE is_active = true;

-- ── master.company_code_customer_profile ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ccp_customer_idx    ON master.company_code_customer_profile (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS ccp_company_idx     ON master.company_code_customer_profile (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ccp_active_pidx     ON master.company_code_customer_profile (tenant_id, company_code_id)
    WHERE is_active = true;

-- ── master.company_code_supplier_profile ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS scp_supplier_idx    ON master.company_code_supplier_profile (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS scp_company_idx     ON master.company_code_supplier_profile (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS scp_active_pidx     ON master.company_code_supplier_profile (tenant_id, company_code_id)
    WHERE is_active = true;

-- ── master.item (spend_category override) ───────────────────────────
CREATE INDEX IF NOT EXISTS im_spend_category_idx ON master.item (tenant_id, spend_category_id)
    WHERE spend_category_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET MANAGEMENT MODULE — Indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── master.asset_class ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ac_company_idx        ON master.asset_class (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ac_parent_idx         ON master.asset_class (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ac_active_pidx        ON master.asset_class (tenant_id, company_code_id)
    WHERE is_active = true;
-- v3: asset_nature for class-type queries
CREATE INDEX IF NOT EXISTS ac_nature_idx         ON master.asset_class (tenant_id, asset_nature)
    WHERE is_active = true;

-- ── control.asset_class_book_policy ────────────────────────────────────────
-- Resolution index: resolver picks latest effective_from <= as_of_date
CREATE INDEX IF NOT EXISTS acbp_resolution_idx
    ON control.asset_class_book_policy
    (tenant_id, company_code_id, asset_class_id, book_code, effective_from DESC)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS acbp_company_idx
    ON control.asset_class_book_policy (tenant_id, company_code_id)
    WHERE is_active = true;

-- ── master.asset ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS asset_company_idx     ON master.asset (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS asset_class_idx       ON master.asset (tenant_id, asset_class_id);
CREATE INDEX IF NOT EXISTS asset_status_idx      ON master.asset (tenant_id, company_code_id, status);
CREATE INDEX IF NOT EXISTS asset_active_pidx     ON master.asset (tenant_id, company_code_id)
    WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS asset_cc_idx          ON master.asset (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_cc_idx          ON master.asset (tenant_id, cost_center_id)
    WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_pc_idx          ON master.asset (tenant_id, profit_center_id)
    WHERE profit_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_project_idx     ON master.asset (tenant_id, project_id)
    WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_vendor_idx      ON master.asset (tenant_id, vendor_id)
    WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_custodian_idx   ON master.asset (tenant_id, custodian_id)
    WHERE custodian_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS asset_barcode_uq
    ON master.asset (tenant_id, barcode)
    WHERE barcode IS NOT NULL AND retired_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS asset_serial_number_uq
    ON master.asset (tenant_id, serial_number)
    WHERE serial_number IS NOT NULL AND retired_at IS NULL;

-- ── master.asset_book ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ab_asset_idx          ON master.asset_book (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS ab_book_type_idx      ON master.asset_book (tenant_id, book_type);
CREATE INDEX IF NOT EXISTS ab_company_idx        ON master.asset_book (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS ab_next_depr_pidx     ON master.asset_book (tenant_id, book_type, next_depreciation_date)
    WHERE next_depreciation_date IS NOT NULL;

-- ── master.asset_component ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS acomp_parent_idx      ON master.asset_component (tenant_id, parent_asset_id);
CREATE INDEX IF NOT EXISTS acomp_child_idx       ON master.asset_component (tenant_id, component_asset_id);
CREATE INDEX IF NOT EXISTS acomp_active_pidx     ON master.asset_component (tenant_id, parent_asset_id)
    WHERE is_active = true;

-- ── master.asset_assignment_history ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS aah_asset_idx         ON master.asset_assignment_history (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS aah_type_idx          ON master.asset_assignment_history (tenant_id, asset_id, assignment_type);
CREATE INDEX IF NOT EXISTS aah_effective_idx     ON master.asset_assignment_history (tenant_id, asset_id, assignment_type, effective_from);

-- ── master.dimension_type ────────────────────────────────────────────────────
-- Active types by sort order — used by UI/API dimension catalog endpoints
CREATE INDEX IF NOT EXISTS dt_tenant_active_pidx ON master.dimension_type (tenant_id, sort_order)
    WHERE is_active = true;
-- Filter by category (SYSTEM/STANDARD/CUSTOM)
CREATE INDEX IF NOT EXISTS dt_category_idx       ON master.dimension_type (tenant_id, category)
    WHERE is_active = true;

-- ── master.dimension_value ───────────────────────────────────────────────────
-- Dual partial unique indexes replace a single UNIQUE constraint because the
-- uniqueness key differs for global values (NULL company) vs company-scoped values.

-- Global values: unique code per (tenant, type) where company_code_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS dv_global_code_uq
    ON master.dimension_value (tenant_id, dimension_type_id, code)
    WHERE company_code_id IS NULL;

-- Company-scoped values: unique code per (tenant, type, company)
CREATE UNIQUE INDEX IF NOT EXISTS dv_company_code_uq
    ON master.dimension_value (tenant_id, dimension_type_id, company_code_id, code)
    WHERE company_code_id IS NOT NULL;

-- Active values for a type — primary lookup path
CREATE INDEX IF NOT EXISTS dv_type_idx           ON master.dimension_value (tenant_id, dimension_type_id)
    WHERE is_active = true;
-- Hierarchy navigation — find children of a parent
CREATE INDEX IF NOT EXISTS dv_parent_idx         ON master.dimension_value (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;
-- Postable values — used by posting engine validation
CREATE INDEX IF NOT EXISTS dv_postable_pidx      ON master.dimension_value (tenant_id, dimension_type_id)
    WHERE status = 'active' AND is_posting_allowed = true;
-- Company-scoped value lookup
CREATE INDEX IF NOT EXISTS dv_company_idx        ON master.dimension_value (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;
-- Source record lookup — used when syncing values from first-class master tables
CREATE INDEX IF NOT EXISTS dv_source_idx         ON master.dimension_value (source_record_id)
    WHERE source_record_id IS NOT NULL;

-- ── master.dimension_set_item ────────────────────────────────────────────────
-- All items for a set — used when resolving/expanding a dimension_set_id
CREATE INDEX IF NOT EXISTS dsi_set_idx           ON master.dimension_set_item (dimension_set_id);
-- Reverse lookup — which sets contain a given value
CREATE INDEX IF NOT EXISTS dsi_value_idx         ON master.dimension_set_item (dimension_value_id);


-- =============================================================================
-- OU + INTENT + CLASSIFICATION ENGINE — indexes
-- =============================================================================

-- ── §BI  master.business_intent ──────────────────────────────────────────────
-- Active intents per tenant, filtered by domain (most common query axis)
CREATE INDEX IF NOT EXISTS bi_tenant_domain_pidx
    ON master.business_intent (tenant_id, domain)
    WHERE is_active = true;

-- Hierarchy traversal: children of a given parent within tenant
CREATE INDEX IF NOT EXISTS bi_parent_pidx
    ON master.business_intent (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;

-- Visibility filtering (RESTRICTED / CONFIDENTIAL access checks)
CREATE INDEX IF NOT EXISTS bi_visibility_pidx
    ON master.business_intent (tenant_id, visibility)
    WHERE is_active = true;


-- ── §CCIP  master.company_code_intent_policy ─────────────────────────────────
-- One default ALLOW mapping per company code per tenant
CREATE UNIQUE INDEX IF NOT EXISTS ccip_default_per_cc_uq
    ON master.company_code_intent_policy (tenant_id, company_code_id)
    WHERE is_default = true AND is_active = true AND mapping_mode = 'ALLOW';

-- All active mappings for a company code (availability check)
CREATE INDEX IF NOT EXISTS ccip_cc_pidx
    ON master.company_code_intent_policy (tenant_id, company_code_id)
    WHERE is_active = true;

-- All active mappings for an intent (propagation check)
CREATE INDEX IF NOT EXISTS ccip_intent_pidx
    ON master.company_code_intent_policy (tenant_id, intent_id)
    WHERE is_active = true;

-- Fast DENY lookup for blocking check
CREATE INDEX IF NOT EXISTS ccip_deny_pidx
    ON master.company_code_intent_policy (tenant_id, company_code_id, intent_id)
    WHERE mapping_mode = 'DENY' AND is_active = true;


-- ── §CCDD  master.company_code_dimension_default ──────────────────────────────
-- All active defaults for a company code (expand dimension context)
CREATE INDEX IF NOT EXISTS ccdd_cc_pidx
    ON master.company_code_dimension_default (tenant_id, company_code_id)
    WHERE is_active = true;

-- Point-in-time default lookup: company code + type + date
CREATE INDEX IF NOT EXISTS ccdd_cc_type_active_pidx
    ON master.company_code_dimension_default (tenant_id, company_code_id, dimension_type_id)
    WHERE is_active = true;


-- ── master.tax_jurisdiction ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tj_country_pidx
    ON master.tax_jurisdiction (tenant_id, country_code)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS tj_parent_idx
    ON master.tax_jurisdiction (tenant_id, parent_id)
    WHERE parent_id IS NOT NULL;

-- ── master.fx_rate ───────────────────────────────────────────────────────────
-- Unique: one active rate per (pair, type, date, time)
CREATE UNIQUE INDEX IF NOT EXISTS fxr_pair_date_uq
    ON master.fx_rate (
        tenant_id, from_currency, to_currency, rate_type, effective_date,
        COALESCE(effective_time, '00:00:00'::time)
    ) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS fxr_pair_idx
    ON master.fx_rate (tenant_id, from_currency, to_currency, effective_date DESC)
    WHERE is_active = true;

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Master indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── master.budget_profile ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bp_tenant          ON master.budget_profile (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bp_company         ON master.budget_profile (company_code_id);
CREATE INDEX IF NOT EXISTS idx_bp_fiscal          ON master.budget_profile (tenant_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_bp_status          ON master.budget_profile (tenant_id, status)
    WHERE status NOT IN ('closed','cancelled');
CREATE INDEX IF NOT EXISTS idx_bp_parent          ON master.budget_profile (parent_profile_id)
    WHERE parent_profile_id IS NOT NULL;

-- ── master.budget_allocation ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ba_tenant          ON master.budget_allocation (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ba_profile         ON master.budget_allocation (budget_profile_id);
CREATE INDEX IF NOT EXISTS idx_ba_company_fiscal  ON master.budget_allocation (company_code_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_ba_status          ON master.budget_allocation (tenant_id, status)
    WHERE status NOT IN ('closed','cancelled','exhausted');
CREATE INDEX IF NOT EXISTS idx_ba_cost_center     ON master.budget_allocation (cost_center_id)
    WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ba_project         ON master.budget_allocation (project_id)
    WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ba_gl_account      ON master.budget_allocation (gl_account_id)
    WHERE gl_account_id IS NOT NULL;

-- ── master.planning_model ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pm_tenant          ON master.planning_model (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_company         ON master.planning_model (company_code_id);
CREATE INDEX IF NOT EXISTS idx_pm_status          ON master.planning_model (tenant_id, status)
    WHERE status NOT IN ('archived','cancelled');
CREATE INDEX IF NOT EXISTS idx_pm_fiscal          ON master.planning_model (tenant_id, fiscal_year_from);
CREATE INDEX IF NOT EXISTS idx_pm_current         ON master.planning_model (tenant_id, is_current)
    WHERE is_current = true;


-- ── §BK1 bank_party ─────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS bank_party_bic_uq
    ON master.bank_party (tenant_id, country_code, bic)
    WHERE bic IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS bank_party_nat_code_uq
    ON master.bank_party (tenant_id, country_code, national_bank_code_type, national_bank_code, branch_code)
    WHERE national_bank_code IS NOT NULL AND status = 'active';

-- ── §BK2 bank_account ───────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS bank_account_dedup_uq
    ON master.bank_account (
        tenant_id,
        account_id_type,
        COALESCE(bank_party_id, '00000000-0000-0000-0000-000000000000'::uuid),
        account_id_value,
        currency_code
    )
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS bank_account_tenant_idx
    ON master.bank_account (tenant_id);

CREATE INDEX IF NOT EXISTS bank_account_bank_party_idx
    ON master.bank_account (tenant_id, bank_party_id)
    WHERE bank_party_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_account_unverified_pidx
    ON master.bank_account (tenant_id)
    WHERE is_verified = false AND status = 'active';

CREATE INDEX IF NOT EXISTS bank_account_correspondent_idx
    ON master.bank_account (tenant_id, correspondent_bank_party_id)
    WHERE correspondent_bank_party_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_account_provider_ref_idx
    ON master.bank_account (tenant_id, provider_account_ref)
    WHERE provider_account_ref IS NOT NULL;

-- ── §BK3 bank_account_link ──────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS bal_owner_account_purpose_uq
    ON master.bank_account_link (
        tenant_id, owner_type, owner_id, purpose, bank_account_id,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS bal_owner_idx
    ON master.bank_account_link (tenant_id, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS bal_owner_purpose_idx
    ON master.bank_account_link (tenant_id, owner_type, owner_id, purpose);

CREATE INDEX IF NOT EXISTS bal_active_pidx
    ON master.bank_account_link (tenant_id, owner_type, owner_id, purpose)
    WHERE effective_until IS NULL;

CREATE INDEX IF NOT EXISTS bal_primary_pidx
    ON master.bank_account_link (tenant_id, owner_type, owner_id, purpose)
    WHERE is_primary = true AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS bal_bank_account_idx
    ON master.bank_account_link (tenant_id, bank_account_id);

CREATE INDEX IF NOT EXISTS bal_company_idx
    ON master.bank_account_link (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;

-- ── §BK4 bank_account_house_config ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS bahc_gl_account_idx
    ON master.bank_account_house_config (tenant_id, gl_account_id);


-- ── §PAB principal_identity_binding ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS pib_principal_idx
    ON master.principal_identity_binding (tenant_id, principal_id);

CREATE INDEX IF NOT EXISTS pib_sync_status_pidx
    ON master.principal_identity_binding (tenant_id, sync_status)
    WHERE sync_status IN ('pending', 'drift', 'error');

-- ── Profile extension indexes ──────────────────────────────────────────────

-- principal_profile working-context defaults
CREATE INDEX IF NOT EXISTS pp_default_company_idx
    ON master.principal_profile (tenant_id, default_company_code_id)
    WHERE default_company_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pp_employee_idx
    ON master.principal_profile (tenant_id, employee_id)
    WHERE employee_id IS NOT NULL;

-- customer hierarchy + external ref (unique indexes created in 06_constraints)
CREATE INDEX IF NOT EXISTS customer_parent_idx
    ON master.customer (tenant_id, parent_customer_id)
    WHERE parent_customer_id IS NOT NULL;

-- supplier hierarchy + external ref (unique indexes created in 06_constraints)
CREATE INDEX IF NOT EXISTS supplier_parent_idx
    ON master.supplier (tenant_id, parent_supplier_id)
    WHERE parent_supplier_id IS NOT NULL;

-- company_code_customer_profile extended
CREATE INDEX IF NOT EXISTS ccp_accounting_profile_idx
    ON master.company_code_customer_profile (tenant_id, default_accounting_profile_id)
    WHERE default_accounting_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ccp_receipt_method_idx
    ON master.company_code_customer_profile (tenant_id, default_receipt_method_id)
    WHERE default_receipt_method_id IS NOT NULL;

-- company_code_supplier_profile extended
CREATE INDEX IF NOT EXISTS scp_accounting_profile_idx
    ON master.company_code_supplier_profile (tenant_id, default_accounting_profile_id)
    WHERE default_accounting_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS scp_payment_method_id_idx
    ON master.company_code_supplier_profile (tenant_id, payment_method_id)
    WHERE payment_method_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS scp_remittance_bank_link_idx
    ON master.company_code_supplier_profile (tenant_id, preferred_remittance_bank_link_id)
    WHERE preferred_remittance_bank_link_id IS NOT NULL;


-- ── §PM1 payment_method ─────────────────────────────────────────────────────
-- (indexes are table-level: payment_method_tenant_code_uq via UNIQUE constraint)


-- =============================================================================
-- §CMS  master.content_item / content_item_link / content_item_access_grant
-- =============================================================================

-- content_item
CREATE INDEX IF NOT EXISTS content_item_tenant_status_kind_idx
    ON master.content_item (tenant_id, status, kind);

CREATE INDEX IF NOT EXISTS content_item_tenant_parent_idx
    ON master.content_item (tenant_id, parent_id);

CREATE INDEX IF NOT EXISTS content_item_tenant_locale_slug_idx
    ON master.content_item (tenant_id, locale_code, slug);

CREATE INDEX IF NOT EXISTS content_item_published_pidx
    ON master.content_item (tenant_id, kind, locale_code)
    WHERE status = 'PUBLISHED';

-- content_item_link
CREATE INDEX IF NOT EXISTS cil_source_idx
    ON master.content_item_link (source_content_item_id);

CREATE INDEX IF NOT EXISTS cil_target_idx
    ON master.content_item_link (target_content_item_id);

-- content_item_access_grant
CREATE INDEX IF NOT EXISTS ciag_item_subject_idx
    ON master.content_item_access_grant (content_item_id, subject_type, subject_id);

-- Partial index for non-expiring grants only (volatile now() cannot be used in predicates)
CREATE INDEX IF NOT EXISTS ciag_item_level_perpetual_pidx
    ON master.content_item_access_grant (content_item_id, access_level)
    WHERE expires_at IS NULL;


-- ============================================================================
-- Payment terms tables
-- ============================================================================

-- ============================================================================
-- Holiday Calendar indexes
-- ============================================================================

-- hc: active calendars per tenant (partial)
CREATE INDEX IF NOT EXISTS hc_tenant_pidx
    ON master.holiday_calendar (tenant_id)
    WHERE status = 'active';

-- hcd: calendar + year lookup (covers "all holidays for calendar in year")
CREATE INDEX IF NOT EXISTS hcd_calendar_year_idx
    ON master.holiday_calendar_day (holiday_calendar_id, calendar_year);

-- hcd: date lookup (covers "is this date a holiday?")
CREATE INDEX IF NOT EXISTS hcd_date_idx
    ON master.holiday_calendar_day (holiday_calendar_id, holiday_date);


-- ============================================================================
-- Payment Term indexes
-- ============================================================================

-- pt: active terms per tenant (partial)
CREATE INDEX IF NOT EXISTS pt_tenant_active_pidx
    ON master.payment_term (tenant_id)
    WHERE status = 'active';

-- ptc: clauses for a given term
CREATE INDEX IF NOT EXISTS ptc_term_idx
    ON master.payment_term_clause (payment_term_id);

-- ptdt: discount tiers for a given term
CREATE INDEX IF NOT EXISTS ptdt_term_idx
    ON master.payment_term_discount_tier (payment_term_id);


