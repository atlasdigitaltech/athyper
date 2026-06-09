-- ============================================================================
-- mesh/03_constraints.sql
-- Mesh foundation FK constraints.
--
-- IMPORTANT: Mesh DDL must not reference Neon master.* tables. Cross-plane
-- correlation uses mesh.external_reference and API/projection events instead.
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE mesh.network_account
        ADD CONSTRAINT mesh_network_account_provider_fk
        FOREIGN KEY (provider_code) REFERENCES mesh.network_provider (code)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- mesh_network_account_participant_fk removed — participant table dropped.

DO $$ BEGIN
    ALTER TABLE mesh.account_grant
        ADD CONSTRAINT mesh_account_grant_account_fk
        FOREIGN KEY (account_id) REFERENCES mesh.network_account (id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.account_grant
        ADD CONSTRAINT mesh_account_grant_principal_fk
        FOREIGN KEY (principal_id) REFERENCES mesh.principal (id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.document_envelope
        ADD CONSTRAINT mesh_document_envelope_document_type_fk
        FOREIGN KEY (document_type_id) REFERENCES mesh.network_document_type (id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- mesh_participant_profile_account_fk removed — participant_profile dropped.

DO $$ BEGIN
    ALTER TABLE mesh.network_account_identifier
        ADD CONSTRAINT mesh_network_account_identifier_account_fk
        FOREIGN KEY (account_code) REFERENCES mesh.network_account (account_code)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.principal_identity_binding
        ADD CONSTRAINT mesh_pib_principal_fk
        FOREIGN KEY (principal_id) REFERENCES mesh.principal (id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


DO $$ BEGIN
    ALTER TABLE mesh.network_invitation
        ADD CONSTRAINT mesh_network_invitation_inviter_account_fk
        FOREIGN KEY (inviter_account_code) REFERENCES mesh.network_account (account_code)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.network_invitation
        ADD CONSTRAINT mesh_network_invitation_invitee_account_fk
        FOREIGN KEY (invitee_account_code) REFERENCES mesh.network_account (account_code)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.connection_request
        ADD CONSTRAINT mesh_connection_request_buyer_fk
        FOREIGN KEY (buyer_account_code) REFERENCES mesh.network_account (account_code)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.connection_request
        ADD CONSTRAINT mesh_connection_request_supplier_fk
        FOREIGN KEY (supplier_account_code) REFERENCES mesh.network_account (account_code)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.connection_request
        ADD CONSTRAINT mesh_connection_request_invitation_fk
        FOREIGN KEY (invitation_id) REFERENCES mesh.network_invitation (id)
        ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.connection_acceptance
        ADD CONSTRAINT mesh_connection_acceptance_request_fk
        FOREIGN KEY (request_id) REFERENCES mesh.connection_request (id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.connection_acceptance
        ADD CONSTRAINT mesh_connection_acceptance_connection_fk
        FOREIGN KEY (connection_id) REFERENCES mesh.network_relationship (id)
        ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.connection_acceptance
        ADD CONSTRAINT mesh_connection_acceptance_actor_account_fk
        FOREIGN KEY (accepted_by_account_code) REFERENCES mesh.network_account (account_code)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.document_payload
        ADD CONSTRAINT mesh_document_payload_envelope_fk
        FOREIGN KEY (envelope_id) REFERENCES mesh.document_envelope (id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mesh.document_acknowledgement
        ADD CONSTRAINT mesh_document_acknowledgement_envelope_fk
        FOREIGN KEY (envelope_id) REFERENCES mesh.document_envelope (id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
