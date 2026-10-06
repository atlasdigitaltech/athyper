-- First normalized authoring family. No legacy source is converted implicitly.
ALTER TABLE metadata.entity_change_set ADD COLUMN default_locale text;
ALTER TABLE metadata.entity_change_set ADD COLUMN required_locales text[];
ALTER TABLE metadata.entity_change_set ADD CONSTRAINT entity_change_set_locales_ck CHECK (
  (default_locale IS NULL AND required_locales IS NULL) OR
  (default_locale IS NOT NULL AND length(btrim(default_locale)) > 0 AND required_locales IS NOT NULL
   AND cardinality(required_locales)>0 AND default_locale=ANY(required_locales) AND array_position(required_locales,NULL) IS NULL));

CREATE TABLE metadata.entity_label (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 label_key text NOT NULL CHECK(label_key ~ '^[a-z][a-z0-9_.-]{0,126}$'),
 default_text text NOT NULL CHECK(length(default_text) BETWEEN 1 AND 500 AND default_text ~ '[^[:space:]]'),
 source_kind text NOT NULL CHECK(source_kind='owned'),
 shared_label_key text CHECK(shared_label_key IS NULL), shared_resource_key text CHECK(shared_resource_key IS NULL),
 shared_resource_version text CHECK(shared_resource_version IS NULL), shared_resource_hash text CHECK(shared_resource_hash IS NULL),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 CONSTRAINT entity_label_scope_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_label_key_uq UNIQUE(change_set_id,label_key) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE metadata.entity_label_translation (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 label_id uuid NOT NULL, locale_code text NOT NULL CHECK(length(btrim(locale_code))>0),
 text text NOT NULL CHECK(length(text) BETWEEN 1 AND 500 AND text ~ '[^[:space:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 FOREIGN KEY(change_set_id,label_id) REFERENCES metadata.entity_label(change_set_id,id) ON DELETE RESTRICT,
 UNIQUE(change_set_id,label_id,locale_code), CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE TABLE metadata.entity_authoring_command_receipt (
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 tenant_id uuid, actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 expected_revision bigint NOT NULL CHECK(expected_revision>=0), revision bigint NOT NULL,
 changed boolean NOT NULL, identities jsonb NOT NULL CHECK(jsonb_typeof(identities)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(change_set_id,idempotency_key),
 CHECK(revision=expected_revision+CASE WHEN changed THEN 1 ELSE 0 END)
);
-- Receipt JSON is a derived command result, never structural authoring state.
CREATE FUNCTION metadata.guard_authoring_command_receipt() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,metadata AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Authoring command receipts are immutable'; END IF;
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=NEW.change_set_id;
 IF cs.tenant_id IS DISTINCT FROM NEW.tenant_id OR cs.lock_version<>NEW.revision OR cs.status NOT IN ('draft','rejected') THEN
  RAISE EXCEPTION 'Authoring command receipt scope/revision mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_authoring_command_receipt
 FOR EACH ROW EXECUTE FUNCTION metadata.guard_authoring_command_receipt();
CREATE TRIGGER label_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_label
 FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();
CREATE TRIGGER translation_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_label_translation
 FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('label_id','locale_code');
CREATE FUNCTION metadata.guard_entity_label_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
BEGIN
 IF ROW(NEW.default_locale,NEW.required_locales) IS DISTINCT FROM ROW(OLD.default_locale,OLD.required_locales) THEN
  IF NEW.status NOT IN ('draft','rejected') OR current_setting('app.entity_change_set_write_token',true) IS DISTINCT FROM NEW.id::text||':'||NEW.lock_version::text THEN
   RAISE EXCEPTION 'Label settings require the locked graph mutation protocol';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER label_settings_guard BEFORE UPDATE ON metadata.entity_change_set
 FOR EACH ROW EXECUTE FUNCTION metadata.guard_entity_label_settings();
CREATE FUNCTION metadata.validate_entity_label_locales() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
DECLARE draft uuid; cs metadata.entity_change_set%ROWTYPE;
BEGIN
 draft := (to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='entity_change_set' THEN 'id' ELSE 'change_set_id' END)::uuid;
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=draft;
 IF cs.required_locales IS NOT NULL AND cardinality(cs.required_locales)<>(SELECT count(DISTINCT x) FROM unnest(cs.required_locales) x) THEN
  RAISE EXCEPTION 'Duplicate required locale';
 END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_label_translation t WHERE t.change_set_id=draft
    AND (cs.default_locale IS NULL OR t.locale_code=cs.default_locale OR NOT t.locale_code=ANY(cs.required_locales)))
    OR (cs.default_locale IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_label WHERE change_set_id=draft)) THEN
  RAISE EXCEPTION 'Label locale settings are inconsistent';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER label_locale_check AFTER INSERT OR UPDATE ON metadata.entity_label
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.validate_entity_label_locales();
CREATE CONSTRAINT TRIGGER translation_locale_check AFTER INSERT OR UPDATE ON metadata.entity_label_translation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.validate_entity_label_locales();
CREATE CONSTRAINT TRIGGER settings_locale_check AFTER UPDATE ON metadata.entity_change_set
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.validate_entity_label_locales();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['entity_label','entity_label_translation','entity_authoring_command_receipt'] LOOP
  EXECUTE format('ALTER TABLE metadata.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE metadata.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
 -- Existing tenant authority only. Product NULL-tenant writes remain unavailable.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  FOREACH t IN ARRAY ARRAY['entity_label','entity_label_translation'] LOOP
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.%I TO athyperapp',t);
   EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING (tenant_id=shared.current_tenant_id_soft())',t);
   EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK (tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft())',t);
   EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id() AND updated_by=master.current_principal_id_soft())',t);
   EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING (tenant_id=shared.current_tenant_id_soft())',t);
  END LOOP;
  GRANT SELECT,INSERT ON metadata.entity_authoring_command_receipt TO athyperapp;
  CREATE POLICY tenant_read ON metadata.entity_authoring_command_receipt FOR SELECT TO athyperapp
   USING(tenant_id=shared.current_tenant_id_soft());
  CREATE POLICY tenant_insert ON metadata.entity_authoring_command_receipt FOR INSERT TO athyperapp
   WITH CHECK(tenant_id=shared.current_tenant_id() AND actor_id=master.current_principal_id_soft());
 END IF;
END $$;
