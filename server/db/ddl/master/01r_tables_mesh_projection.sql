-- ============================================================================
-- master/01r_tables_mesh_projection.sql
-- Neon-side Mesh projection columns.
--
-- Neon owns local business meaning. Mesh owns network account, invitation,
-- connection, and document-exchange truth. These columns let Neon projections
-- store Mesh identifiers and replay cursors without reintroducing cross-DB FKs.
-- ============================================================================

ALTER TABLE master.legal_entity_network_account
    ADD COLUMN IF NOT EXISTS mesh_account_id uuid;

COMMENT ON COLUMN master.legal_entity_network_account.account_code IS
    'External account/address code. For Athyper Mesh this is the canonical BNA-* account_code from mesh.network_account.';

COMMENT ON COLUMN master.legal_entity_network_account.mesh_account_id IS
    'Optional Mesh network_account.id captured by projection/backfill. Not a database FK because Mesh is physically separate.';

COMMENT ON COLUMN master.legal_entity_network_account.mesh_account_ref IS
    'Deprecated. Do not write new data. Use account_code for the BNA code and mesh_account_id for the Mesh UUID reference.';

CREATE INDEX IF NOT EXISTS lena_mesh_account_id_idx
    ON master.legal_entity_network_account (mesh_account_id)
    WHERE mesh_account_id IS NOT NULL;

ALTER TABLE master.business_partner_network_link
    ADD COLUMN IF NOT EXISTS mesh_connection_code text,
    ADD COLUMN IF NOT EXISTS last_projected_at timestamptz,
    ADD COLUMN IF NOT EXISTS projection_sequence_no bigint;

COMMENT ON COLUMN master.business_partner_network_link.mesh_connection_code IS
    'Optional Mesh network_connection.connection_code captured by projection/backfill. Not a database FK because Mesh is physically separate.';

COMMENT ON COLUMN master.business_partner_network_link.last_projected_at IS
    'Timestamp of the latest Mesh event projected into this Neon network-link shadow row.';

COMMENT ON COLUMN master.business_partner_network_link.projection_sequence_no IS
    'Latest mesh.network_event.sequence_no applied to this row. Used for replay drift detection.';

COMMENT ON COLUMN master.business_partner_network_link.connection_status IS
    'For provider_code=athyper_mesh this is a Mesh projection field, not Neon-owned connection truth.';

COMMENT ON COLUMN master.business_partner_network_link.invitation_token IS
    'Deprecated for Mesh invitations. Mesh owns token generation/storage; Neon must not store plaintext invitation tokens after cutover.';

COMMENT ON COLUMN master.business_partner_network_link.invitation_expires_at IS
    'Deprecated for Mesh invitations. Mesh.network_invitation owns expiry after cutover.';

COMMENT ON COLUMN master.business_partner_network_link.invitation_message IS
    'Deprecated for Mesh invitations. Mesh.network_invitation owns invitation message after cutover.';

CREATE INDEX IF NOT EXISTS bpnl_mesh_connection_code_idx
    ON master.business_partner_network_link (mesh_connection_code)
    WHERE mesh_connection_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS bpnl_projection_sequence_idx
    ON master.business_partner_network_link (tenant_id, projection_sequence_no)
    WHERE projection_sequence_no IS NOT NULL;
