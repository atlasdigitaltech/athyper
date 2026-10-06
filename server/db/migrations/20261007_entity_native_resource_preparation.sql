BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Freeze authoring/publication history during the bounded schema preparation.
LOCK TABLE metadata.entity_change_set, metadata.entity_field,
 metadata.entity_runtime_profile, metadata.entity_surface,
 metadata.entity_surface_section, metadata.entity_surface_field_binding,
 metadata.entity_operation, metadata.entity_release, snapshot.entity_contract_revision,
 snapshot.entity_draft_save IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE entity_native_installation_history (
 table_name text PRIMARY KEY, column_names text[] NOT NULL, row_hash text NOT NULL
) ON COMMIT DROP;
DO $$ DECLARE table_name text; old_columns text[]; old_hash text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
 'metadata.entity_change_set','metadata.entity_field','metadata.entity_runtime_profile',
 'metadata.entity_surface','metadata.entity_surface_section','metadata.entity_surface_field_binding',
 'metadata.entity_operation','metadata.entity_release','snapshot.entity_contract_revision','snapshot.entity_draft_save'] LOOP
  SELECT array_agg(attname ORDER BY attnum) INTO old_columns FROM pg_attribute
   WHERE attrelid=table_name::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, %L)) FROM %s t','',table_name) INTO old_hash;
  INSERT INTO pg_temp.entity_native_installation_history VALUES(table_name,old_columns,old_hash);
 END LOOP;
END $$;
-- Install typed AI tables and dormant operation columns only. No canonical
-- conversion, constraint retirement, control initialization, grants or activation.
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN
 RAISE EXCEPTION 'Native authoring preparation requires the Studio database';
END IF; END $$;
-- GENERATED from contracts/meta-entity-authoring/native-ai-contract.ts; NOT a cutover migration.

-- Scoped anchors required by AI search/relation references; existing field/operation anchors are installed by the reference contract.

ALTER TABLE metadata.entity_search_profile ADD CONSTRAINT entity_search_profile_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_relation ADD CONSTRAINT entity_relation_draft_id_uq UNIQUE(change_set_id,id);

CREATE FUNCTION metadata.fn_native_ai_text_array_valid(values_ text[], maximum_length integer) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT (cardinality(values_)=0 OR (array_ndims(values_)=1 AND array_lower(values_,1)=1)) AND cardinality(values_)=(SELECT count(DISTINCT v) FROM unnest(values_) AS v) AND NOT EXISTS(SELECT 1 FROM unnest(values_) AS v WHERE v IS NULL OR length(v)<1 OR length(v)>maximum_length) $$;

CREATE TABLE metadata.entity_ai_profile (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),tenant_id uuid,entity_id uuid NOT NULL,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL CHECK((true) IS TRUE),
 description text CHECK(((length(description)<=1024 OR description IS NULL)) IS TRUE),
 aliases text[] NOT NULL CHECK((CASE WHEN cardinality(aliases)=0 OR (array_ndims(aliases)=1 AND array_lower(aliases,1)=1) THEN (array_position(aliases,NULL) IS NULL) ELSE false END) IS TRUE),
 context_kinds text[] NOT NULL CHECK((CASE WHEN cardinality(context_kinds)=0 OR (array_ndims(context_kinds)=1 AND array_lower(context_kinds,1)=1) THEN (array_position(context_kinds,NULL) IS NULL AND context_kinds<@ARRAY['manage','record']::text[]) ELSE false END) IS TRUE),
 search_profile_id uuid CHECK((true) IS TRUE),
 vocabulary_locale text CHECK(((vocabulary_locale='en' OR vocabulary_locale IS NULL)) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_ai_profile_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_ai_profile_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((cardinality(aliases)<=20 AND metadata.fn_native_ai_text_array_valid(aliases,80)) IS TRUE),
 CHECK((cardinality(context_kinds)<=2 AND metadata.fn_native_ai_text_array_valid(context_kinds,80) AND (NOT enabled OR cardinality(context_kinds)>0)) IS TRUE),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_ai_field (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),tenant_id uuid,entity_id uuid NOT NULL,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 ai_profile_id uuid NOT NULL CHECK((true) IS TRUE),
 entity_field_id uuid NOT NULL CHECK((true) IS TRUE),
 position integer NOT NULL CHECK((position BETWEEN 1 AND 2147483647) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_ai_field_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_ai_field_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,ai_profile_id,entity_field_id) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_ai_field_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,ai_profile_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_ai_binding (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),tenant_id uuid,entity_id uuid NOT NULL,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 ai_profile_id uuid NOT NULL CHECK((true) IS TRUE),
 binding_kind text NOT NULL CHECK(((binding_kind='insight_provider' OR binding_kind='action' OR binding_kind='presentation_profile')) IS TRUE),
 contract_key text NOT NULL CHECK((length(contract_key)>=1 AND length(contract_key)<=127) IS TRUE),
 contract_version integer NOT NULL CHECK((contract_version BETWEEN 1 AND 2147483647) IS TRUE),
 required boolean CHECK(((true OR required IS NULL)) IS TRUE),
 operation_id uuid CHECK((true) IS TRUE),
 position integer NOT NULL CHECK((position BETWEEN 1 AND 2147483647) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_ai_binding_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_ai_binding_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,ai_profile_id,binding_kind,contract_key) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_ai_binding_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,ai_profile_id,binding_kind,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK(((binding_kind='action')=(operation_id IS NOT NULL)) IS TRUE),
 CHECK((binding_kind='insight_provider' OR required IS NULL) IS TRUE),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_ai_reference (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),tenant_id uuid,entity_id uuid NOT NULL,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 ai_profile_id uuid NOT NULL CHECK((true) IS TRUE),
 reference_kind text NOT NULL CHECK(((reference_kind='entity_relation' OR reference_kind='registered_collection')) IS TRUE),
 relation_id uuid CHECK((true) IS TRUE),
 source_field_id uuid CHECK((true) IS TRUE),
 collection_contract_key text CHECK(((length(collection_contract_key)>=1 AND length(collection_contract_key)<=127 OR collection_contract_key IS NULL)) IS TRUE),
 collection_contract_version integer CHECK(((collection_contract_version BETWEEN 1 AND 2147483647 OR collection_contract_version IS NULL)) IS TRUE),
 position integer NOT NULL CHECK((position BETWEEN 1 AND 2147483647) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_ai_reference_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_ai_reference_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,ai_profile_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK(((reference_kind='entity_relation' AND relation_id IS NOT NULL AND source_field_id IS NOT NULL AND collection_contract_key IS NULL AND collection_contract_version IS NULL) OR (reference_kind='registered_collection' AND relation_id IS NULL AND source_field_id IS NULL AND collection_contract_key IS NOT NULL AND collection_contract_version IS NOT NULL)) IS TRUE),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_ai_term (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),tenant_id uuid,entity_id uuid NOT NULL,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 ai_profile_id uuid NOT NULL CHECK((true) IS TRUE),
 provider_binding_id uuid NOT NULL CHECK((true) IS TRUE),
 phrase text NOT NULL CHECK((length(phrase)>=1 AND length(phrase)<=80) IS TRUE),
 origin_kind text NOT NULL CHECK(((origin_kind='authored' OR origin_kind='learning_candidate')) IS TRUE),
 origin_plane text CHECK((((origin_plane='studio' OR origin_plane='neon' OR origin_plane='mesh') OR origin_plane IS NULL)) IS TRUE),
 origin_source_kind text CHECK((((origin_source_kind='platform' OR origin_source_kind='tenant') OR origin_source_kind IS NULL)) IS TRUE),
 origin_tenant_id uuid CHECK((true) IS TRUE),
 origin_candidate_id uuid CHECK((true) IS TRUE),
 origin_proposal_hash text CHECK(((origin_proposal_hash ~ '^[a-f0-9]{64}$' OR origin_proposal_hash IS NULL)) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_ai_term_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_ai_term_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,ai_profile_id,phrase,provider_binding_id) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK(((origin_kind='authored' AND num_nonnulls(origin_plane,origin_source_kind,origin_tenant_id,origin_candidate_id,origin_proposal_hash)=0) OR (origin_kind='learning_candidate' AND origin_plane IS NOT NULL AND origin_candidate_id IS NOT NULL AND origin_proposal_hash IS NOT NULL AND ((origin_source_kind='platform' AND origin_tenant_id IS NULL) OR (origin_source_kind='tenant' AND origin_tenant_id IS NOT NULL)))) IS TRUE),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

ALTER TABLE metadata.entity_ai_profile ADD CONSTRAINT entity_ai_profile_search_profile_id_fk FOREIGN KEY(change_set_id,search_profile_id) REFERENCES metadata.entity_search_profile(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_profile(change_set_id,search_profile_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_ai_profile FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();
ALTER TABLE metadata.entity_ai_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_ai_profile FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_ai_field ADD CONSTRAINT entity_ai_field_ai_profile_id_fk FOREIGN KEY(change_set_id,ai_profile_id) REFERENCES metadata.entity_ai_profile(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_field(change_set_id,ai_profile_id);

ALTER TABLE metadata.entity_ai_field ADD CONSTRAINT entity_ai_field_entity_field_id_fk FOREIGN KEY(change_set_id,entity_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_field(change_set_id,entity_field_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_ai_field FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();
ALTER TABLE metadata.entity_ai_field ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_ai_field FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_ai_binding ADD CONSTRAINT entity_ai_binding_ai_profile_id_fk FOREIGN KEY(change_set_id,ai_profile_id) REFERENCES metadata.entity_ai_profile(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_binding(change_set_id,ai_profile_id);

ALTER TABLE metadata.entity_ai_binding ADD CONSTRAINT entity_ai_binding_operation_id_fk FOREIGN KEY(change_set_id,operation_id) REFERENCES metadata.entity_operation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_binding(change_set_id,operation_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_ai_binding FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();
ALTER TABLE metadata.entity_ai_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_ai_binding FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_ai_reference ADD CONSTRAINT entity_ai_reference_ai_profile_id_fk FOREIGN KEY(change_set_id,ai_profile_id) REFERENCES metadata.entity_ai_profile(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_reference(change_set_id,ai_profile_id);

ALTER TABLE metadata.entity_ai_reference ADD CONSTRAINT entity_ai_reference_relation_id_fk FOREIGN KEY(change_set_id,relation_id) REFERENCES metadata.entity_relation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_reference(change_set_id,relation_id);

ALTER TABLE metadata.entity_ai_reference ADD CONSTRAINT entity_ai_reference_source_field_id_fk FOREIGN KEY(change_set_id,source_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_reference(change_set_id,source_field_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_ai_reference FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();
ALTER TABLE metadata.entity_ai_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_ai_reference FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_ai_term ADD CONSTRAINT entity_ai_term_ai_profile_id_fk FOREIGN KEY(change_set_id,ai_profile_id) REFERENCES metadata.entity_ai_profile(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_term(change_set_id,ai_profile_id);

ALTER TABLE metadata.entity_ai_term ADD CONSTRAINT entity_ai_term_provider_binding_id_fk FOREIGN KEY(change_set_id,provider_binding_id) REFERENCES metadata.entity_ai_binding(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_ai_term(change_set_id,provider_binding_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_ai_term FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();
ALTER TABLE metadata.entity_ai_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_ai_term FORCE ROW LEVEL SECURITY;

-- GENERATED target-only additive operation columns. NOT a cutover migration; legacy constraints remain.
ALTER TABLE metadata.entity_operation ADD COLUMN label_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN input_surface_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN result_surface_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN authorization_target text;
ALTER TABLE metadata.entity_operation ADD COLUMN authorization_effect text;
ALTER TABLE metadata.entity_operation ADD COLUMN requires_parent_read boolean;
ALTER TABLE metadata.entity_operation ADD COLUMN requires_preflight boolean;
ALTER TABLE metadata.entity_operation ADD COLUMN replacement_operation_id uuid;
ALTER TABLE metadata.entity_operation ADD COLUMN handler_version integer;
ALTER TABLE metadata.entity_operation ADD COLUMN preflight_key text;
ALTER TABLE metadata.entity_operation ADD COLUMN preflight_version integer;
ALTER TABLE metadata.entity_operation ADD COLUMN extension_field_mode text;
ALTER TABLE metadata.entity_operation ADD COLUMN export_formats text[];
ALTER TABLE metadata.entity_operation ADD COLUMN export_max_records bigint;
ALTER TABLE metadata.entity_operation ADD CONSTRAINT entity_operation_native_pending_ck CHECK(label_id IS NULL AND input_surface_id IS NULL AND result_surface_id IS NULL AND authorization_target IS NULL AND authorization_effect IS NULL AND requires_parent_read IS NULL AND requires_preflight IS NULL AND replacement_operation_id IS NULL AND handler_version IS NULL AND preflight_key IS NULL AND preflight_version IS NULL AND extension_field_mode IS NULL AND export_formats IS NULL AND export_max_records IS NULL);

-- Compare only the exact pre-installation columns; newly added NULL columns
-- cannot change canonical member values, attribution, roots, releases or history.
DO $$ DECLARE captured record; new_hash text;
BEGIN
 FOR captured IN SELECT * FROM pg_temp.entity_native_installation_history ORDER BY table_name LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(p.value ORDER BY p.value::text)::text, %L)) FROM %s t CROSS JOIN LATERAL (SELECT jsonb_object_agg(key,value) AS value FROM jsonb_each(to_jsonb(t)) WHERE key=ANY($1)) p','',captured.table_name)
   INTO new_hash USING captured.column_names;
  IF new_hash IS DISTINCT FROM captured.row_hash THEN
   RAISE EXCEPTION 'ENTITY_NATIVE_PREPARATION_HISTORY_CHANGED: %',captured.table_name;
  END IF;
 END LOOP;
END $$;
COMMIT;
