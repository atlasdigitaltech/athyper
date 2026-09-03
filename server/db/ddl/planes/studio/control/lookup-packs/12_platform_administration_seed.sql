-- seed-contract-version: 1
-- seed-pack: athyper.control.lookup.platform_administration
-- seed-pack-version: 1.0.0
-- seed-dataset: athyper.control.lookup.platform_administration
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:54
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/control/mfa_method_type.sql,server/db/seed/platform/000_lookups/LookupDomain/control/ownership_model.sql,server/db/seed/platform/000_lookups/LookupDomain/control/security_tier.sql,server/db/seed/platform/000_lookups/LookupDomain/log/security_event_category.sql,server/db/seed/platform/000_lookups/LookupDomain/master/idp_provider_type.sql,server/db/seed/platform/000_lookups/LookupDomain/master/principal_profile_keycloak_sync_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/principal_source.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tenant_feature_entitlement_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tenant_module_subscription_status.sql,server/db/seed/platform/000_lookups/LookupDomain/master/tenant_subscription.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_administration: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('control.mfa_method_type', 'MFA Method Type', 'Multi-factor authentication method classification. Determines contact_link_id requirement and Keycloak credential type.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity.ownership_model', 'Entity Ownership Model', 'Classifies who owns the entity definition.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entity.security_tier', 'Security Tier', 'Data sensitivity and security posture level.', 'control', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.security_event_category', 'Security Event Category', 'Top-level classification for security_event_log.event_category. Groups related event_type values. is_extensible=false — feeds SIEM integrations that depend on a stable closed vocabulary.', 'log', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.idp_provider_type', 'Identity Provider Type', 'Type of IdP bound to a principal via principal_identity_binding.provider_code. is_extensible=true — tenants may add custom SAML/OIDC providers.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.principal_profile.keycloak_sync_status', 'Principal Profile Keycloak Sync Status', 'Legacy Keycloak synchronization health on principal profiles (pending, synced, drift, error). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.principal_source', 'Principal Source', 'How the principal was originally provisioned (local, sso, scim, api, import). is_extensible=false — provisioning channels are platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tenant_feature_entitlement.status', 'Tenant Feature Entitlement Status', 'Lifecycle status for tenant feature entitlements (active, suspended, trial). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tenant_module_subscription.status', 'Tenant Module Subscription Status', 'Lifecycle status for tenant module subscriptions (active, suspended, trial). Platform-governed.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.tenant_subscription', 'Tenant Subscription Tier', 'Subscription plan tiers available to tenants. Controls feature access, quotas, and billing category.', 'master', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('email', 'Email OTP', 'control.mfa_method_type', 'One-time password delivered via email. Requires contact_link_id (channel_type=email).', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sms', 'SMS OTP', 'control.mfa_method_type', 'One-time password delivered via SMS. Requires contact_link_id (channel_type=sms).', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('totp', 'TOTP (Authenticator App)', 'control.mfa_method_type', 'Time-based one-time password via authenticator app. Secret stored in Keycloak only. No contact_link_id.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('webauthn', 'WebAuthn / FIDO2', 'control.mfa_method_type', 'Hardware security key or platform authenticator. Credential stored in Keycloak. No contact_link_id.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('backup', 'Backup / Recovery Codes', 'control.mfa_method_type', 'Single-use recovery codes for account access when primary MFA unavailable. Codes stored in Keycloak.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system', 'System', 'entity.ownership_model', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tenant', 'Tenant', 'entity.ownership_model', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('package', 'Package', 'entity.ownership_model', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('overlay', 'Overlay', 'entity.ownership_model', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('platform_critical', 'Platform Critical', 'entity.security_tier', NULL, NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tenant_critical', 'Tenant Critical', 'entity.security_tier', NULL, NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('operational', 'Operational', 'entity.security_tier', NULL, NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('config', 'Config', 'entity.security_tier', NULL, NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('authentication', 'Authentication', 'log.security_event_category', 'Login, logout, and credential verification events.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('authorisation', 'Authorisation', 'log.security_event_category', 'Access control checks, permission grants and denials.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('session', 'Session', 'log.security_event_category', 'Session creation, expiry, and revocation events.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('mfa', 'MFA', 'log.security_event_category', 'Multi-factor authentication challenges, verifications, lockouts.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('password', 'Password', 'log.security_event_category', 'Password change, reset, and expiry events.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('account', 'Account', 'log.security_event_category', 'Account lockout, unlock, device trust events.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('api_key', 'API Key', 'log.security_event_category', 'API key creation, rotation, and revocation events.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('suspicious', 'Suspicious Activity', 'log.security_event_category', 'Anomalous behaviour flagged by risk scoring (brute-force, impossible travel, etc.).', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('keycloak', 'Keycloak', 'master.idp_provider_type', 'Athyper built-in Keycloak IdP', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('google', 'Google', 'master.idp_provider_type', 'Google OIDC / Workspace', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('microsoft', 'Microsoft / Entra', 'master.idp_provider_type', 'Microsoft Entra ID (Azure AD) OIDC/SAML', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('okta', 'Okta', 'master.idp_provider_type', 'Okta OIDC/SAML federation', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('saml', 'Generic SAML', 'master.idp_provider_type', 'Generic SAML 2.0 identity provider', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ldap', 'LDAP / AD', 'master.idp_provider_type', 'LDAP or Active Directory directory service', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('github', 'GitHub', 'master.idp_provider_type', 'GitHub OAuth2 OIDC', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pending', 'Pending', 'master.principal_profile.keycloak_sync_status', 'Sync pending.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('synced', 'Synced', 'master.principal_profile.keycloak_sync_status', 'Sync completed.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('drift', 'Drift', 'master.principal_profile.keycloak_sync_status', 'Provider drift detected.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('error', 'Error', 'master.principal_profile.keycloak_sync_status', 'Sync error.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('internal', 'Internal', 'master.principal_source', 'Created directly by the platform or trusted internal workflow.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('oidc_jit', 'OIDC JIT', 'master.principal_source', 'Just-in-time principal provisioned from OIDC login.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('saml_jit', 'SAML JIT', 'master.principal_source', 'Just-in-time principal provisioned from SAML login.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('support_jit', 'Support JIT', 'master.principal_source', 'Tenant-local support principal provisioned for audited support access.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('invite_jit', 'Invite JIT', 'master.principal_source', 'Principal provisioned from invitation or supplier onboarding.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('scim', 'SCIM', 'master.principal_source', 'Provisioned via SCIM directory sync.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('api', 'API', 'master.principal_source', 'Provisioned programmatically via platform API.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('import', 'Import', 'master.principal_source', 'Bulk-imported from a file or migration tool.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('local', 'Local Legacy', 'master.principal_source', 'Legacy value for local user creation. Prefer internal.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('sso', 'SSO Legacy', 'master.principal_source', 'Legacy value for SSO provisioning. Prefer oidc_jit or saml_jit.', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('provisioned', 'Provisioned Legacy', 'master.principal_source', 'Legacy value for pre-provisioned setup. Prefer internal.', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('active', 'Active', 'master.tenant_feature_entitlement.status', 'Active entitlement.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('suspended', 'Suspended', 'master.tenant_feature_entitlement.status', 'Suspended entitlement.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('trial', 'Trial', 'master.tenant_feature_entitlement.status', 'Trial entitlement.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('active', 'Active', 'master.tenant_module_subscription.status', 'Active subscription.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('suspended', 'Suspended', 'master.tenant_module_subscription.status', 'Suspended subscription.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('trial', 'Trial', 'master.tenant_module_subscription.status', 'Trial subscription.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('trial', 'Trial', 'master.tenant_subscription', 'Time-limited free trial. Full feature access with reduced quotas. Converts to base or paid tier.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('base', 'Base', 'master.tenant_subscription', 'Default free or low-cost tier. Core platform features. Limited principals, storage, and API calls.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('starter', 'Starter', 'master.tenant_subscription', 'Entry-level paid tier. Increased quotas, email support, basic integrations.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('professional', 'Professional', 'master.tenant_subscription', 'Mid-market tier. Full feature set, higher quotas, SSO, priority support.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('enterprise', 'Enterprise', 'master.tenant_subscription', 'Enterprise tier. Unlimited principals, dedicated support, custom SLA, advanced compliance features.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.mfa_method_type', 'entity.ownership_model', 'entity.security_tier', 'log.security_event_category', 'master.idp_provider_type', 'master.principal_profile.keycloak_sync_status', 'master.principal_source', 'master.tenant_feature_entitlement.status', 'master.tenant_module_subscription.status', 'master.tenant_subscription'])) <> 54 THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_administration: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['control.mfa_method_type', 'entity.ownership_model', 'entity.security_tier', 'log.security_event_category', 'master.idp_provider_type', 'master.principal_profile.keycloak_sync_status', 'master.principal_source', 'master.tenant_feature_entitlement.status', 'master.tenant_module_subscription.status', 'master.tenant_subscription']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_administration: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.mfa_method_type', 'entity.ownership_model', 'entity.security_tier', 'log.security_event_category', 'master.idp_provider_type', 'master.principal_profile.keycloak_sync_status', 'master.principal_source', 'master.tenant_feature_entitlement.status', 'master.tenant_module_subscription.status', 'master.tenant_subscription']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_administration: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['control.mfa_method_type', 'entity.ownership_model', 'entity.security_tier', 'log.security_event_category', 'master.idp_provider_type', 'master.principal_profile.keycloak_sync_status', 'master.principal_source', 'master.tenant_feature_entitlement.status', 'master.tenant_module_subscription.status', 'master.tenant_subscription']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'athyper.control.lookup.platform_administration: semantic assertion failed';
  END IF;
END $assertions$;
