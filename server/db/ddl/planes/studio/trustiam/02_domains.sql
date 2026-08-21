CREATE DOMAIN trustiam.organization_status_d AS text
    CHECK (VALUE IN ('draft', 'provisioning', 'active', 'suspended', 'retiring', 'retired'));

CREATE DOMAIN trustiam.provider_protocol_d AS text
    CHECK (VALUE IN ('native', 'oidc', 'saml'));

CREATE DOMAIN trustiam.provider_status_d AS text
    CHECK (VALUE IN ('draft', 'provisioning', 'active', 'suspended', 'failed', 'retired'));

CREATE DOMAIN trustiam.projection_status_d AS text
    CHECK (VALUE IN ('draft', 'pending', 'provisioning', 'active', 'suspended', 'failed', 'retiring', 'retired'));

CREATE DOMAIN trustiam.reconciliation_status_d AS text
    CHECK (VALUE IN ('pending', 'in_sync', 'drifted', 'failed'));

CREATE DOMAIN trustiam.projection_scope_kind_d AS text
    CHECK (VALUE IN (
        'tenant',
        'workspace',
        'module',
        'legal_entity',
        'company_code',
        'operating_organization',
        'network_account'
    ));

CREATE DOMAIN trustiam.scope_ceiling_mode_d AS text
    CHECK (VALUE IN ('exact', 'subtree', 'member_companies'));

CREATE DOMAIN trustiam.network_role_ceiling_d AS text
    CHECK (VALUE IN ('buyer', 'supplier', 'both'));

COMMENT ON DOMAIN trustiam.organization_status_d IS
  'Lifecycle of the TrustIAM identity-administration boundary, independent of application tenancy.';
COMMENT ON DOMAIN trustiam.provider_protocol_d IS
  'Authentication protocol exposed through the TrustIAM provider adapter.';
COMMENT ON DOMAIN trustiam.projection_status_d IS
  'Desired application-projection lifecycle; active remains separate from plane membership and grants.';
COMMENT ON DOMAIN trustiam.projection_scope_kind_d IS
  'Closed set of business scope ceilings that TrustIAM may project to an application plane.';
