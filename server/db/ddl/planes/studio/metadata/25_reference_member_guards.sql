-- Stable catalogue, never an editable bag of draft lifecycle values.
CREATE TABLE metadata.entity_field_identity (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),entity_id uuid NOT NULL REFERENCES metadata.entity(id) ON DELETE RESTRICT,tenant_id uuid,
 field_key text NOT NULL CHECK(field_key ~ '^[a-z][a-z0-9_.-]{0,126}$'),
 parent_identity_id uuid REFERENCES metadata.entity_field_identity(id) ON DELETE RESTRICT,
 identity_status text NOT NULL CHECK(identity_status IN ('reserved','active','retired')),
 retired_at timestamptz,retired_by uuid,retirement_release_id uuid REFERENCES metadata.entity_release(id) ON DELETE RESTRICT,
 replacement_identity_id uuid REFERENCES metadata.entity_field_identity(id) ON DELETE RESTRICT,
 introduced_change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 first_release_id uuid REFERENCES metadata.entity_release(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 UNIQUE NULLS NOT DISTINCT(entity_id,tenant_id,parent_identity_id,field_key),
 CHECK((identity_status='reserved' AND first_release_id IS NULL) OR (identity_status IN ('active','retired') AND first_release_id IS NOT NULL)),
 CHECK((identity_status='retired' AND retired_at IS NOT NULL AND retired_by IS NOT NULL AND retirement_release_id IS NOT NULL) OR (identity_status<>'retired' AND num_nonnulls(retired_at,retired_by,retirement_release_id,replacement_identity_id)=0)),
 CHECK(replacement_identity_id IS DISTINCT FROM id)
);
ALTER TABLE metadata.entity_field ADD COLUMN field_identity_id uuid REFERENCES metadata.entity_field_identity(id) ON DELETE RESTRICT;
CREATE INDEX ON metadata.entity_field(field_identity_id);
ALTER TABLE metadata.entity_surface_section ADD COLUMN navigation_group_id uuid;
ALTER TABLE metadata.entity_surface_section ADD CONSTRAINT entity_surface_section_navigation_group_id_fk FOREIGN KEY(change_set_id,navigation_group_id) REFERENCES metadata.entity_surface_navigation_group(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;

CREATE FUNCTION metadata.guard_reference_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE; other metadata.entity_field_identity%ROWTYPE; r metadata.entity_release%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stable identities require governed disposal'; END IF;
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=NEW.introduced_change_set_id;
 IF cs.entity_id<>NEW.entity_id OR cs.tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Identity introduction scope mismatch'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.identity_status<>'reserved' OR cs.status NOT IN ('draft','rejected') OR current_setting('app.entity_change_set_write_token',true) IS DISTINCT FROM cs.id::text||':'||cs.lock_version::text THEN RAISE EXCEPTION 'Identity reservation requires the graph transaction'; END IF;
 ELSE
  RAISE EXCEPTION 'REFERENCE_IDENTITY_LIFECYCLE_NOT_QUALIFIED: reviewed lineage activation is not installed';

 END IF;
 IF NEW.parent_identity_id IS NOT NULL THEN
  SELECT * INTO STRICT other FROM metadata.entity_field_identity WHERE id=NEW.parent_identity_id;
  IF other.entity_id<>NEW.entity_id OR other.tenant_id IS DISTINCT FROM NEW.tenant_id OR other.id=NEW.id THEN RAISE EXCEPTION 'Identity parent scope mismatch'; END IF;
 END IF;
 IF NEW.first_release_id IS NOT NULL THEN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=NEW.first_release_id;
  IF r.entity_id<>NEW.entity_id OR r.tenant_id IS DISTINCT FROM NEW.tenant_id OR r.release_kind<>'publish' THEN RAISE EXCEPTION 'Identity first-release scope mismatch'; END IF;
 END IF;
 IF NEW.retirement_release_id IS NOT NULL THEN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=NEW.retirement_release_id;
  IF r.entity_id<>NEW.entity_id OR r.tenant_id IS DISTINCT FROM NEW.tenant_id OR r.release_kind<>'publish' THEN RAISE EXCEPTION 'Identity retirement scope mismatch'; END IF;
 END IF;
 IF NEW.replacement_identity_id IS NOT NULL THEN
  SELECT * INTO STRICT other FROM metadata.entity_field_identity WHERE id=NEW.replacement_identity_id;
  IF other.entity_id<>NEW.entity_id OR other.tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Identity replacement scope mismatch'; END IF;
  IF EXISTS(WITH RECURSIVE chain AS (SELECT id,replacement_identity_id,ARRAY[id] path FROM metadata.entity_field_identity WHERE id=NEW.replacement_identity_id UNION ALL SELECT n.id,n.replacement_identity_id,c.path||n.id FROM chain c JOIN metadata.entity_field_identity n ON n.id=c.replacement_identity_id WHERE NOT n.id=ANY(c.path)) SELECT 1 FROM chain WHERE id=NEW.id OR replacement_identity_id=ANY(path)) THEN RAISE EXCEPTION 'Identity replacement cycle'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_field_identity FOR EACH ROW EXECUTE FUNCTION metadata.guard_reference_identity();
CREATE FUNCTION metadata.guard_field_identity_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
DECLARE identity metadata.entity_field_identity%ROWTYPE;
BEGIN
 IF NEW.field_identity_id IS NOT NULL THEN
  SELECT * INTO STRICT identity FROM metadata.entity_field_identity WHERE id=NEW.field_identity_id;
  IF identity.entity_id<>NEW.entity_id OR identity.tenant_id IS DISTINCT FROM NEW.tenant_id OR identity.field_key<>NEW.field_key OR identity.identity_status='retired' THEN RAISE EXCEPTION 'Field identity binding scope/semantics mismatch'; END IF;
  IF identity.identity_status='reserved' AND identity.introduced_change_set_id<>NEW.change_set_id THEN RAISE EXCEPTION 'Unreconciled identity reservation'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.field_identity_id IS NOT NULL AND NEW.field_identity_id IS DISTINCT FROM OLD.field_identity_id THEN RAISE EXCEPTION 'Stable identity cannot be silently rebound'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER field_identity_guard BEFORE INSERT OR UPDATE ON metadata.entity_field FOR EACH ROW EXECUTE FUNCTION metadata.guard_field_identity_binding();
ALTER TABLE metadata.entity_field_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_field_identity FORCE ROW LEVEL SECURITY;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 GRANT SELECT,INSERT ON metadata.entity_field_identity TO athyperapp;
 CREATE POLICY tenant_read ON metadata.entity_field_identity FOR SELECT TO athyperapp USING(tenant_id=shared.current_tenant_id_soft());
 CREATE POLICY tenant_insert ON metadata.entity_field_identity FOR INSERT TO athyperapp WITH CHECK(tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft());
END IF; END $$;

-- Final graph semantics are checked once before snapshot capture and by deferred
-- guards for other writers. Domain implementations and remote evidence are not
-- guessed by SQL; publication additionally verifies installed contracts.
CREATE FUNCTION metadata.validate_reference_members(draft uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM metadata.entity_field_choice c JOIN metadata.entity_field f ON f.id=c.entity_field_id AND f.change_set_id=draft WHERE c.change_set_id=draft AND f.data_type::text<>'enum') THEN RAISE EXCEPTION 'Choices require an enum field'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_navigation_group g JOIN metadata.entity_surface s ON s.id=g.entity_surface_id WHERE g.change_set_id=draft AND s.surface_kind::text<>'detail') THEN RAISE EXCEPTION 'Navigation groups require detail surfaces'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_section s JOIN metadata.entity_surface_navigation_group g ON g.id=s.navigation_group_id WHERE s.change_set_id=draft AND s.entity_surface_id<>g.entity_surface_id) THEN RAISE EXCEPTION 'Section navigation scope mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_view v JOIN metadata.entity_surface s ON s.id=v.entity_surface_id WHERE v.change_set_id=draft AND s.surface_kind::text NOT IN ('list','embedded')) THEN RAISE EXCEPTION 'View surface is incompatible'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_view_field v JOIN metadata.entity_surface_view view ON view.id=v.view_id JOIN metadata.entity_surface_field_binding b ON b.id=v.field_binding_id JOIN metadata.entity_field f ON f.id=b.entity_field_id WHERE v.change_set_id=draft AND (b.entity_surface_id<>view.entity_surface_id OR (v.visible_position IS NOT NULL AND f.data_type::text='uuid'))) THEN RAISE EXCEPTION 'View field scope/readable presentation is invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field_access f WHERE f.change_set_id=draft AND (NOT EXISTS(SELECT 1 FROM metadata.entity_target t WHERE t.change_set_id=draft AND t.target_plane=f.target_plane) OR cardinality(f.query_uses)<>(SELECT count(DISTINCT x) FROM unnest(f.query_uses) x))) THEN RAISE EXCEPTION 'Field access target/query use invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_access_permission p WHERE p.change_set_id=draft AND NOT EXISTS(SELECT 1 FROM metadata.entity_target t WHERE t.change_set_id=draft AND t.target_plane=p.target_plane)) OR EXISTS(SELECT 1 FROM metadata.entity_authorization_profile p WHERE p.change_set_id=draft AND NOT EXISTS(SELECT 1 FROM metadata.entity_target t WHERE t.change_set_id=draft AND t.target_plane=p.target_plane)) THEN RAISE EXCEPTION 'Access plane is undeclared'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field_access f WHERE f.change_set_id=draft AND f.representation<>'omitted' AND (f.read_operation_id IS NULL OR f.read_operation_change_set_id IS DISTINCT FROM draft)) THEN RAISE EXCEPTION 'Field access operation source invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field_access f JOIN metadata.entity_operation o ON o.id=f.read_operation_id WHERE f.change_set_id=draft AND o.operation_kind::text NOT IN ('read','list')) THEN RAISE EXCEPTION 'Field read operation is incompatible'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_operation_field f JOIN metadata.entity_operation o ON o.id=f.entity_operation_id WHERE f.change_set_id=draft AND o.operation_kind::text IN ('read','list')) THEN RAISE EXCEPTION 'Read operations cannot enroll write fields'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p WHERE p.change_set_id=draft AND ((p.parent_predicate_id IS NULL AND ((p.purpose='list_filter' AND p.view_id IS NULL) OR (p.purpose='record_lock' AND p.authorization_profile_id IS NULL) OR (p.purpose='editability' AND p.field_binding_id IS NULL) OR (p.purpose='visibility' AND num_nonnulls(p.field_binding_id,p.surface_operation_id,p.surface_section_id,p.navigation_group_id)<>1))) OR (p.node_kind='group' AND (p.conjunction IS NULL OR num_nonnulls(p.entity_field_id,p.operator,p.value_kind,p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set,p.context_key,p.context_version)<>0)) OR (p.node_kind='condition' AND (p.conjunction IS NOT NULL OR p.entity_field_id IS NULL OR p.operator IS NULL OR p.value_kind IS NULL)))) THEN RAISE EXCEPTION 'Predicate owner/node shape invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p WHERE p.change_set_id=draft AND p.node_kind='condition' AND (
  (p.operator IN ('is_null','is_not_null')) IS DISTINCT FROM (p.value_kind='none') OR
  CASE p.value_kind
   WHEN 'none' THEN num_nonnulls(p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set,p.context_key,p.context_version)<>0
   WHEN 'context' THEN num_nonnulls(p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set)<>0 OR p.context_key IS NULL OR p.context_version IS NULL
   ELSE num_nonnulls(p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set)<>1 OR p.context_key IS NOT NULL OR p.context_version IS NOT NULL OR
    CASE p.value_kind WHEN 'text' THEN p.value_text IS NULL WHEN 'numeric' THEN p.value_numeric IS NULL WHEN 'boolean' THEN p.value_boolean IS NULL WHEN 'date' THEN p.value_date IS NULL WHEN 'datetime' THEN p.value_datetime IS NULL WHEN 'uuid' THEN p.value_uuid IS NULL
     WHEN 'text_set' THEN coalesce(cardinality(p.value_text_set),0)=0 WHEN 'numeric_set' THEN coalesce(cardinality(p.value_numeric_set),0)=0 WHEN 'uuid_set' THEN coalesce(cardinality(p.value_uuid_set),0)=0 WHEN 'date_set' THEN coalesce(cardinality(p.value_date_set),0)=0 WHEN 'datetime_set' THEN coalesce(cardinality(p.value_datetime_set),0)=0 ELSE true END OR
    (p.value_kind LIKE '%\_set' ESCAPE '\') IS DISTINCT FROM (p.operator IN ('in','not_in')) END
 )) THEN RAISE EXCEPTION 'Predicate payload/operator mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p JOIN metadata.entity_field f ON f.id=p.entity_field_id AND f.change_set_id=draft WHERE p.change_set_id=draft AND p.node_kind='condition' AND p.operator NOT IN ('is_null','is_not_null') AND p.value_kind<>'context' AND (
   regexp_replace(p.value_kind,'_set$','') IS DISTINCT FROM CASE f.data_type::text WHEN 'text' THEN 'text' WHEN 'enum' THEN 'text' WHEN 'integer' THEN 'numeric' WHEN 'decimal' THEN 'numeric' WHEN 'money' THEN 'numeric' WHEN 'boolean' THEN 'boolean' WHEN 'date' THEN 'date' WHEN 'datetime' THEN 'datetime' WHEN 'uuid' THEN 'uuid' END
   OR (p.operator IN ('gt','gte','lt','lte') AND f.data_type::text NOT IN ('integer','decimal','money','date','datetime'))
 )) THEN RAISE EXCEPTION 'Predicate field/value type invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_authorization_profile p JOIN metadata.entity_operation r ON r.id=p.record_read_operation_id JOIN metadata.entity_operation d ON d.id=p.directory_operation_id WHERE p.change_set_id=draft AND (r.operation_kind::text<>'read' OR d.operation_kind::text<>'read')) THEN RAISE EXCEPTION 'Authorization profile read operation invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p WHERE p.change_set_id=draft AND (
   p.value_numeric::text IN ('NaN','Infinity','-Infinity') OR EXISTS(SELECT 1 FROM unnest(p.value_numeric_set) n WHERE n::text IN ('NaN','Infinity','-Infinity')) OR
   EXISTS(SELECT 1 FROM unnest(p.value_text_set) t WHERE length(t) NOT BETWEEN 1 AND 4000 OR t !~ '[^[:space:]]')
 )) THEN RAISE EXCEPTION 'Predicate scalar/set payload invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p JOIN metadata.entity_predicate parent ON parent.id=p.parent_predicate_id WHERE p.change_set_id=draft AND (p.purpose<>parent.purpose OR parent.node_kind<>'group')) THEN RAISE EXCEPTION 'Predicate purpose/parent mismatch'; END IF;
 IF EXISTS(WITH RECURSIVE tree AS (SELECT id,parent_predicate_id,ARRAY[id] path,false cycle,1 depth FROM metadata.entity_predicate WHERE change_set_id=draft UNION ALL SELECT p.id,p.parent_predicate_id,t.path||p.id,p.id=ANY(t.path),t.depth+1 FROM tree t JOIN metadata.entity_predicate p ON p.id=t.parent_predicate_id WHERE NOT t.cycle AND t.depth<=32) SELECT 1 FROM tree WHERE cycle OR depth>32) THEN RAISE EXCEPTION 'Predicate cycle/depth limit'; END IF;
END $$;
CREATE FUNCTION metadata.reference_member_final_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$ BEGIN PERFORM metadata.validate_reference_members((to_jsonb(COALESCE(NEW,OLD))->>'change_set_id')::uuid); RETURN NULL; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['entity_target','entity_field_choice','entity_surface_navigation_group','entity_surface_view','entity_surface_view_field','entity_access_permission','entity_operation_field','entity_authorization_profile','entity_field_access','entity_predicate','entity_surface_section','entity_field'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER reference_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.reference_member_final_guard()',t);
END LOOP; END $$;

CREATE FUNCTION metadata.guard_reference_contract_marker() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.reference_contract_version IS DISTINCT FROM OLD.reference_contract_version AND (OLD.reference_contract_version IS NOT NULL OR OLD.status NOT IN ('draft','rejected') OR current_setting('app.entity_change_set_write_token',true) IS DISTINCT FROM NEW.id::text||':'||NEW.lock_version::text) THEN RAISE EXCEPTION 'Reference contract enrollment requires graph transaction'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER reference_contract_marker_guard BEFORE UPDATE ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION metadata.guard_reference_contract_marker();
-- Rows may not be invisible to the versioned graph loader/compiler.
CREATE FUNCTION metadata.guard_reference_member_enrollment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE;
BEGIN
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=(to_jsonb(COALESCE(NEW,OLD))->>'change_set_id')::uuid;
 IF cs.reference_contract_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'REFERENCE_CONTRACT_ENROLLMENT_REQUIRED'; END IF;
 IF cs.tenant_id IS NOT NULL AND cs.base_release_id IS NOT NULL AND EXISTS(SELECT 1 FROM metadata.entity_release r WHERE r.id=cs.base_release_id AND r.tenant_id IS NULL) THEN RAISE EXCEPTION 'REFERENCE_EXTENSION_ADAPTER_NOT_QUALIFIED'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['entity_target','entity_field_choice','entity_surface_navigation_group','entity_surface_view','entity_surface_view_field','entity_access_permission','entity_operation_field','entity_authorization_profile','entity_field_access','entity_predicate'] LOOP
 EXECUTE format('CREATE TRIGGER reference_enrollment_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.%I FOR EACH ROW EXECUTE FUNCTION metadata.guard_reference_member_enrollment()',t);
END LOOP; END $$;

-- Native anchors may not invalidate retained normalized members.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['entity_surface','entity_operation','entity_surface_field_binding','entity_surface_operation'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER reference_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.reference_member_final_guard()',t);
END LOOP; END $$;
