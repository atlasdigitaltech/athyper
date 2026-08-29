ALTER TABLE mesh.network_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_identifier FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_reference FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON mesh.network_account FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON mesh.network_account_identifier FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_identifier FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON mesh.network_account_reference FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_reference FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY participant_access ON mesh.network_relationship FOR ALL
    USING (
        buyer_tenant_id = shared.current_tenant_id_soft()
        OR supplier_tenant_id = shared.current_tenant_id_soft()
    )
    WITH CHECK (
        buyer_tenant_id = shared.current_tenant_id()
        OR supplier_tenant_id = shared.current_tenant_id()
    );
CREATE POLICY seed_write ON mesh.network_relationship FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE mesh.catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_identifier FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_classification FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_uom ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_uom FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_audience FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_price FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_availability FORCE ROW LEVEL SECURITY;

CREATE POLICY catalog_owner_manage ON mesh.catalog
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_publication_read ON mesh.catalog
    FOR SELECT
    USING (mesh.catalog_is_visible(id));
CREATE POLICY seed_write ON mesh.catalog
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_owner_manage ON mesh.catalog_item
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_publication_read ON mesh.catalog_item
    FOR SELECT
    USING (mesh.catalog_item_is_visible(id));
CREATE POLICY seed_write ON mesh.catalog_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_identifier_owner_manage
    ON mesh.catalog_item_identifier
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_identifier_publication_read
    ON mesh.catalog_item_identifier
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_item_identifier
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_classification_owner_manage
    ON mesh.catalog_item_classification
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_classification_publication_read
    ON mesh.catalog_item_classification
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_item_classification
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_uom_owner_manage ON mesh.catalog_item_uom
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_uom_publication_read ON mesh.catalog_item_uom
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_item_uom
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_audience_supplier_manage ON mesh.catalog_audience
    FOR ALL
    USING (supplier_tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (supplier_tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_audience_participant_read ON mesh.catalog_audience
    FOR SELECT
    USING (
        supplier_tenant_id = shared.current_tenant_id_soft()
        OR buyer_tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY seed_write ON mesh.catalog_audience
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_price_owner_manage ON mesh.catalog_price
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_price_publication_read ON mesh.catalog_price
    FOR SELECT
    USING (mesh.catalog_price_is_visible(id));
CREATE POLICY seed_write ON mesh.catalog_price
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_availability_owner_manage
    ON mesh.catalog_availability
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_availability_publication_read
    ON mesh.catalog_availability
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_availability
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE mesh.document_envelope ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_envelope FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_payload ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_payload FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_acknowledgement ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_acknowledgement FORCE ROW LEVEL SECURITY;

CREATE POLICY participant_access ON mesh.document_envelope FOR ALL
    USING (
        sender_tenant_id = shared.current_tenant_id_soft()
        OR receiver_tenant_id = shared.current_tenant_id_soft()
    )
    WITH CHECK (
        sender_tenant_id = shared.current_tenant_id()
        OR receiver_tenant_id = shared.current_tenant_id()
    );
CREATE POLICY seed_write ON mesh.document_envelope
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_access ON mesh.document_payload FOR ALL
    USING (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_payload.envelope_id
           AND shared.current_tenant_id_soft() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_payload.envelope_id
           AND shared.current_tenant_id() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ));
CREATE POLICY seed_write ON mesh.document_payload
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_access ON mesh.document_event FOR ALL
    USING (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_event.envelope_id
           AND shared.current_tenant_id_soft() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_event.envelope_id
           AND shared.current_tenant_id() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ));
CREATE POLICY seed_write ON mesh.document_event
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_access ON mesh.document_acknowledgement FOR ALL
    USING (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_acknowledgement.envelope_id
           AND shared.current_tenant_id_soft() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_acknowledgement.envelope_id
           AND shared.current_tenant_id() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ));
CREATE POLICY seed_write ON mesh.document_acknowledgement
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE mesh.network_account_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_commodity_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_commodity_capability FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_industry_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_industry_classification FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_tax_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_tax_registration FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_party ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_party FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_link FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.bank_account_disclosure_event FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON mesh.network_account_profile FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_profile FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON mesh.network_account_commodity_capability FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_commodity_capability FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON mesh.network_account_industry_classification FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_industry_classification FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY tenant_access ON mesh.network_account_tax_registration FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_tax_registration FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE mesh.network_account_profile_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_publication FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_publication_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_profile_publication_event FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_publication_participant_read ON mesh.network_account_profile_publication FOR SELECT USING(shared.current_tenant_id_soft() IN (owner_tenant_id,recipient_tenant_id));
CREATE POLICY profile_publication_owner_insert ON mesh.network_account_profile_publication FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_profile_publication FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY profile_publication_event_participant_read ON mesh.network_account_profile_publication_event FOR SELECT USING(shared.current_tenant_id_soft() IN (owner_tenant_id,recipient_tenant_id));
CREATE POLICY profile_publication_event_owner_insert ON mesh.network_account_profile_publication_event FOR INSERT WITH CHECK(owner_tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_profile_publication_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

CREATE POLICY tenant_access ON mesh.bank_party FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_party FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY owner_access ON mesh.bank_account FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY owner_access ON mesh.bank_account_link FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account_link FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

CREATE POLICY participant_read ON mesh.bank_account_disclosure FOR SELECT
    USING (
        owner_tenant_id = shared.current_tenant_id_soft()
        OR recipient_tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY owner_insert ON mesh.bank_account_disclosure FOR INSERT
    WITH CHECK (owner_tenant_id = shared.current_tenant_id());
CREATE POLICY owner_update ON mesh.bank_account_disclosure FOR UPDATE
    USING (owner_tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (owner_tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account_disclosure FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY participant_read ON mesh.bank_account_disclosure_event FOR SELECT
    USING(owner_tenant_id=shared.current_tenant_id_soft() OR recipient_tenant_id=shared.current_tenant_id_soft());
CREATE POLICY owner_insert ON mesh.bank_account_disclosure_event FOR INSERT
    WITH CHECK(owner_tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.bank_account_disclosure_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

ALTER TABLE mesh.certification_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification_type FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification FORCE ROW LEVEL SECURITY;

CREATE POLICY mesh_certification_type_admin
  ON mesh.certification_type FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY mesh_certification_type_read
  ON mesh.certification_type FOR SELECT TO PUBLIC
  USING (
    tenant_id IS NULL
    OR (
      shared.current_tenant_id_soft() IS NOT NULL
      AND tenant_id = shared.current_tenant_id_soft()
    )
  );
CREATE POLICY mesh_certification_type_write
  ON mesh.certification_type FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY mesh_certification_admin
  ON mesh.certification FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY mesh_certification_read
  ON mesh.certification FOR SELECT TO PUBLIC
  USING (
    shared.current_tenant_id_soft() IS NOT NULL
    AND tenant_id = shared.current_tenant_id_soft()
  );
CREATE POLICY mesh_certification_write
  ON mesh.certification FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());


ALTER TABLE mesh.network_lifecycle_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_lifecycle_event FORCE ROW LEVEL SECURITY;
CREATE POLICY network_lifecycle_participant_read ON mesh.network_lifecycle_event FOR SELECT USING(shared.current_tenant_id_soft() IN (owner_tenant_id,counterparty_tenant_id));
CREATE POLICY network_lifecycle_seed_owner ON mesh.network_lifecycle_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
