BEGIN;
SET LOCAL lock_timeout='5s';
-- Add remaining reference authoring members; no data conversion, product-write grants or host activation.
-- GENERATED from contracts/meta-entity-authoring/reference-member-contract.ts
ALTER TABLE metadata.entity_field ADD CONSTRAINT entity_field_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_surface ADD CONSTRAINT entity_surface_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_operation ADD CONSTRAINT entity_operation_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_surface_field_binding ADD CONSTRAINT entity_surface_field_binding_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_surface_operation ADD CONSTRAINT entity_surface_operation_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_surface_section ADD CONSTRAINT entity_surface_section_draft_id_uq UNIQUE(change_set_id,id);

ALTER TABLE metadata.entity_change_set ADD COLUMN reference_contract_version integer CHECK(reference_contract_version=1);

CREATE TABLE metadata.entity_target (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 target_plane text NOT NULL CHECK((target_plane='studio' OR target_plane='neon' OR target_plane='mesh')),
 requirement text NOT NULL CHECK((requirement='required' OR requirement='recommended' OR requirement='optional')),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 2147483647),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_target_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_target_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,target_plane) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_target_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_field_choice (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 entity_field_id uuid NOT NULL CHECK(true),
 value_text text NOT NULL CHECK(length(value_text)>=1 AND length(value_text)<=4000 AND value_text ~ '\S'),
 label_id uuid NOT NULL CHECK(true),
 tone text CHECK(((tone='neutral' OR tone='success' OR tone='warning' OR tone='danger') OR tone IS NULL)),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 2147483647),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_field_choice_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_field_choice_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_field_id,value_text) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_field_choice_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_field_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_navigation_group (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 entity_surface_id uuid NOT NULL CHECK(true),
 group_key text NOT NULL CHECK(group_key ~ '^[a-z][a-z0-9_.:-]{0,126}$'),
 label_id uuid CHECK((label_id IS NULL OR true)),
 icon_key text CHECK((icon_key ~ '^[a-z][a-z0-9_.:-]{0,126}$' OR icon_key IS NULL)),
 section_display text CHECK(((section_display='continuous' OR section_display='selected') OR section_display IS NULL)),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 2147483647),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_surface_navigation_group_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_surface_navigation_group_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_surface_id,group_key) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_surface_navigation_group_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_surface_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_view (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 entity_surface_id uuid NOT NULL CHECK(true),
 view_key text NOT NULL CHECK(view_key ~ '^[a-z][a-z0-9_.:-]{0,126}$'),
 view_kind text NOT NULL CHECK((view_kind='default' OR view_kind='published')),
 label_id uuid CHECK((label_id IS NULL OR true)),
 query_text text CHECK((length(query_text)<=500 OR query_text IS NULL)),
 density text NOT NULL CHECK((density='comfortable' OR density='compact' OR density='spacious')),
 mode text NOT NULL CHECK((mode='table')),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 2147483647),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_surface_view_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_surface_view_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_surface_id,view_key) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_surface_view_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_surface_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_surface_view_field (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 view_id uuid NOT NULL CHECK(true),
 field_binding_id uuid NOT NULL CHECK(true),
 visible_position integer CHECK((visible_position BETWEEN 1 AND 2147483647 OR visible_position IS NULL)),
 sort_position integer CHECK((sort_position BETWEEN 1 AND 2147483647 OR sort_position IS NULL)),
 sort_direction text CHECK(((sort_direction='asc' OR sort_direction='desc') OR sort_direction IS NULL)),
 grouped boolean NOT NULL CHECK(true),
 width_override integer CHECK((width_override BETWEEN 1 AND 2147483647 OR width_override IS NULL)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_surface_view_field_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_surface_view_field_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,view_id,field_binding_id) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_surface_view_field_logical_1_uq UNIQUE (change_set_id,view_id,visible_position) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_surface_view_field_logical_2_uq UNIQUE (change_set_id,view_id,sort_position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((sort_position IS NULL)=(sort_direction IS NULL)),
 CHECK(visible_position IS NOT NULL OR sort_position IS NOT NULL OR grouped),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_access_permission (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 entity_surface_id uuid CHECK((entity_surface_id IS NULL OR true)),
 capability_binding_id uuid CHECK((capability_binding_id IS NULL OR true)),
 target_plane text NOT NULL CHECK((target_plane='studio' OR target_plane='neon' OR target_plane='mesh')),
 permission_code text NOT NULL CHECK(permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'),
 permission_kind text NOT NULL CHECK((permission_kind='entity_operation' OR permission_kind='capability')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_access_permission_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_access_permission_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_surface_id,target_plane) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK(entity_surface_id IS NOT NULL),
 CHECK(capability_binding_id IS NULL),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_operation_field (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 entity_operation_id uuid NOT NULL CHECK(true),
 entity_field_id uuid NOT NULL CHECK(true),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 2147483647),
 operation_change_set_id uuid NOT NULL CHECK(true),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_operation_field_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_operation_field_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_operation_id,entity_field_id) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_operation_field_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_operation_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK(operation_change_set_id=change_set_id),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_authorization_profile (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 target_plane text NOT NULL CHECK((target_plane='studio' OR target_plane='neon' OR target_plane='mesh')),
 ownership_resolver_key text NOT NULL CHECK(ownership_resolver_key ~ '^[a-z][a-z0-9_.:-]{0,126}$'),
 ownership_resolver_version integer NOT NULL CHECK(ownership_resolver_version BETWEEN 1 AND 2147483647),
 record_read_operation_id uuid NOT NULL CHECK(true),
 directory_operation_id uuid NOT NULL CHECK(true),
 directory_population text NOT NULL CHECK((directory_population='tenant')),
 owner_field_id uuid CHECK((owner_field_id IS NULL OR true)),
 created_by_field_id uuid CHECK((created_by_field_id IS NULL OR true)),
 updated_by_field_id uuid CHECK((updated_by_field_id IS NULL OR true)),
 administer_permission_code text CHECK((administer_permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$' OR administer_permission_code IS NULL)),
 administer_permission_kind text CHECK(((administer_permission_kind='entity_operation' OR administer_permission_kind='capability') OR administer_permission_kind IS NULL)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_authorization_profile_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_authorization_profile_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,target_plane) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((administer_permission_code IS NULL)=(administer_permission_kind IS NULL)),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_field_access (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 entity_field_id uuid NOT NULL CHECK(true),
 target_plane text NOT NULL CHECK((target_plane='studio' OR target_plane='neon' OR target_plane='mesh')),
 read_operation_id uuid CHECK((read_operation_id IS NULL OR true)),
 representation text NOT NULL CHECK((representation='plain' OR representation='masked' OR representation='omitted')),
 query_uses text[] NOT NULL CHECK(array_position(query_uses,NULL) IS NULL AND query_uses<@ARRAY['search','filter','sort','group','condition']::text[]),
 read_operation_change_set_id uuid CHECK((read_operation_change_set_id IS NULL OR true)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_field_access_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_field_access_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,entity_field_id,target_plane) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((representation='omitted' AND read_operation_id IS NULL AND read_operation_change_set_id IS NULL AND cardinality(query_uses)=0) OR (representation IN ('plain','masked') AND read_operation_id IS NOT NULL AND read_operation_change_set_id=change_set_id)),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE metadata.entity_predicate (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 predicate_key text NOT NULL CHECK(predicate_key ~ '^[a-z][a-z0-9_.:-]{0,126}$'),
 parent_predicate_id uuid CHECK((parent_predicate_id IS NULL OR true)),
 node_kind text NOT NULL CHECK((node_kind='condition' OR node_kind='group')),
 conjunction text CHECK(((conjunction='all' OR conjunction='any') OR conjunction IS NULL)),
 purpose text NOT NULL CHECK((purpose='list_filter' OR purpose='record_lock' OR purpose='visibility' OR purpose='editability')),
 view_id uuid CHECK((view_id IS NULL OR true)),
 authorization_profile_id uuid CHECK((authorization_profile_id IS NULL OR true)),
 field_binding_id uuid CHECK((field_binding_id IS NULL OR true)),
 entity_field_id uuid CHECK((entity_field_id IS NULL OR true)),
 operator text CHECK(((operator='eq' OR operator='ne' OR operator='gt' OR operator='gte' OR operator='lt' OR operator='lte' OR operator='in' OR operator='not_in' OR operator='is_null' OR operator='is_not_null') OR operator IS NULL)),
 value_kind text CHECK(((value_kind='text' OR value_kind='numeric' OR value_kind='boolean' OR value_kind='date' OR value_kind='datetime' OR value_kind='uuid' OR value_kind='text_set' OR value_kind='numeric_set' OR value_kind='uuid_set' OR value_kind='date_set' OR value_kind='datetime_set' OR value_kind='context' OR value_kind='none') OR value_kind IS NULL)),
 value_text text CHECK((length(value_text)>=1 AND length(value_text)<=4000 AND value_text ~ '\S' OR value_text IS NULL)),
 value_numeric numeric CHECK((value_numeric IS NULL OR true)),
 value_boolean boolean CHECK((value_boolean IS NULL OR true)),
 value_date date CHECK((value_date IS NULL OR true)),
 value_datetime timestamptz CHECK((value_datetime IS NULL OR true)),
 value_uuid uuid CHECK((value_uuid IS NULL OR true)),
 value_text_set text[] CHECK((array_position(value_text_set,NULL) IS NULL OR value_text_set IS NULL)),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 2147483647),
 surface_operation_id uuid CHECK((surface_operation_id IS NULL OR true)),
 surface_section_id uuid CHECK((surface_section_id IS NULL OR true)),
 navigation_group_id uuid CHECK((navigation_group_id IS NULL OR true)),
 value_numeric_set numeric[] CHECK((array_position(value_numeric_set,NULL) IS NULL OR value_numeric_set IS NULL)),
 value_uuid_set uuid[] CHECK((array_position(value_uuid_set,NULL) IS NULL OR value_uuid_set IS NULL)),
 value_date_set date[] CHECK((array_position(value_date_set,NULL) IS NULL OR value_date_set IS NULL)),
 value_datetime_set timestamptz[] CHECK((array_position(value_datetime_set,NULL) IS NULL OR value_datetime_set IS NULL)),
 context_key text CHECK((context_key ~ '^[a-z][a-z0-9_.:-]{0,126}$' OR context_key IS NULL)),
 context_version integer CHECK((context_version BETWEEN 1 AND 2147483647 OR context_version IS NULL)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT entity_predicate_draft_id_uq UNIQUE(change_set_id,id),
 CONSTRAINT entity_predicate_logical_0_uq UNIQUE NULLS NOT DISTINCT (change_set_id,predicate_key) DEFERRABLE INITIALLY IMMEDIATE,
 CONSTRAINT entity_predicate_logical_1_uq UNIQUE NULLS NOT DISTINCT (change_set_id,purpose,parent_predicate_id,view_id,authorization_profile_id,field_binding_id,surface_operation_id,surface_section_id,navigation_group_id,position) DEFERRABLE INITIALLY IMMEDIATE,
 CHECK((parent_predicate_id IS NULL AND num_nonnulls(view_id,authorization_profile_id,field_binding_id,surface_operation_id,surface_section_id,navigation_group_id)=1) OR (parent_predicate_id IS NOT NULL AND num_nonnulls(view_id,authorization_profile_id,field_binding_id,surface_operation_id,surface_section_id,navigation_group_id)=0)),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_target FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row();

ALTER TABLE metadata.entity_target ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_target FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_field_choice ADD CONSTRAINT entity_field_choice_entity_field_id_fk FOREIGN KEY(change_set_id,entity_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_field_choice(change_set_id,entity_field_id);

ALTER TABLE metadata.entity_field_choice ADD CONSTRAINT entity_field_choice_label_id_fk FOREIGN KEY(change_set_id,label_id) REFERENCES metadata.entity_label(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_field_choice(change_set_id,label_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_field_choice FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_field_id','label_id');

ALTER TABLE metadata.entity_field_choice ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_field_choice FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_surface_navigation_group ADD CONSTRAINT entity_surface_navigation_group_entity_surface_id_fk FOREIGN KEY(change_set_id,entity_surface_id) REFERENCES metadata.entity_surface(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_surface_navigation_group(change_set_id,entity_surface_id);

ALTER TABLE metadata.entity_surface_navigation_group ADD CONSTRAINT entity_surface_navigation_group_label_id_fk FOREIGN KEY(change_set_id,label_id) REFERENCES metadata.entity_label(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_surface_navigation_group(change_set_id,label_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface_navigation_group FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_surface_id','group_key','label_id');

ALTER TABLE metadata.entity_surface_navigation_group ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_surface_navigation_group FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_surface_view ADD CONSTRAINT entity_surface_view_entity_surface_id_fk FOREIGN KEY(change_set_id,entity_surface_id) REFERENCES metadata.entity_surface(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_surface_view(change_set_id,entity_surface_id);

ALTER TABLE metadata.entity_surface_view ADD CONSTRAINT entity_surface_view_label_id_fk FOREIGN KEY(change_set_id,label_id) REFERENCES metadata.entity_label(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_surface_view(change_set_id,label_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface_view FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_surface_id','view_key','label_id');

ALTER TABLE metadata.entity_surface_view ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_surface_view FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_surface_view_field ADD CONSTRAINT entity_surface_view_field_view_id_fk FOREIGN KEY(change_set_id,view_id) REFERENCES metadata.entity_surface_view(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_surface_view_field(change_set_id,view_id);

ALTER TABLE metadata.entity_surface_view_field ADD CONSTRAINT entity_surface_view_field_field_binding_id_fk FOREIGN KEY(change_set_id,field_binding_id) REFERENCES metadata.entity_surface_field_binding(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_surface_view_field(change_set_id,field_binding_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_surface_view_field FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('view_id','field_binding_id');

ALTER TABLE metadata.entity_surface_view_field ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_surface_view_field FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_access_permission ADD CONSTRAINT entity_access_permission_entity_surface_id_fk FOREIGN KEY(change_set_id,entity_surface_id) REFERENCES metadata.entity_surface(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_access_permission(change_set_id,entity_surface_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_access_permission FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_surface_id');

ALTER TABLE metadata.entity_access_permission ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_access_permission FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_operation_field ADD CONSTRAINT entity_operation_field_entity_operation_id_fk FOREIGN KEY(change_set_id,entity_operation_id) REFERENCES metadata.entity_operation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_operation_field(change_set_id,entity_operation_id);

ALTER TABLE metadata.entity_operation_field ADD CONSTRAINT entity_operation_field_entity_field_id_fk FOREIGN KEY(change_set_id,entity_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_operation_field(change_set_id,entity_field_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_operation_field FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_operation_id','entity_field_id','operation_change_set_id');

ALTER TABLE metadata.entity_operation_field ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_operation_field FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_authorization_profile ADD CONSTRAINT entity_authorization_profile_record_read_operation_id_fk FOREIGN KEY(change_set_id,record_read_operation_id) REFERENCES metadata.entity_operation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_authorization_profile(change_set_id,record_read_operation_id);

ALTER TABLE metadata.entity_authorization_profile ADD CONSTRAINT entity_authorization_profile_directory_operation_id_fk FOREIGN KEY(change_set_id,directory_operation_id) REFERENCES metadata.entity_operation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_authorization_profile(change_set_id,directory_operation_id);

ALTER TABLE metadata.entity_authorization_profile ADD CONSTRAINT entity_authorization_profile_owner_field_id_fk FOREIGN KEY(change_set_id,owner_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_authorization_profile(change_set_id,owner_field_id);

ALTER TABLE metadata.entity_authorization_profile ADD CONSTRAINT entity_authorization_profile_created_by_field_id_fk FOREIGN KEY(change_set_id,created_by_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_authorization_profile(change_set_id,created_by_field_id);

ALTER TABLE metadata.entity_authorization_profile ADD CONSTRAINT entity_authorization_profile_updated_by_field_id_fk FOREIGN KEY(change_set_id,updated_by_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_authorization_profile(change_set_id,updated_by_field_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_authorization_profile FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('record_read_operation_id','directory_operation_id','owner_field_id','created_by_field_id','updated_by_field_id');

ALTER TABLE metadata.entity_authorization_profile ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_authorization_profile FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_field_access ADD CONSTRAINT entity_field_access_entity_field_id_fk FOREIGN KEY(change_set_id,entity_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_field_access(change_set_id,entity_field_id);

ALTER TABLE metadata.entity_field_access ADD CONSTRAINT entity_field_access_read_operation_id_fk FOREIGN KEY(change_set_id,read_operation_id) REFERENCES metadata.entity_operation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_field_access(change_set_id,read_operation_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_field_access FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_field_id','read_operation_id');

ALTER TABLE metadata.entity_field_access ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_field_access FORCE ROW LEVEL SECURITY;

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_parent_predicate_id_fk FOREIGN KEY(change_set_id,parent_predicate_id) REFERENCES metadata.entity_predicate(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,parent_predicate_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_view_id_fk FOREIGN KEY(change_set_id,view_id) REFERENCES metadata.entity_surface_view(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,view_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_authorization_profile_id_fk FOREIGN KEY(change_set_id,authorization_profile_id) REFERENCES metadata.entity_authorization_profile(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,authorization_profile_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_field_binding_id_fk FOREIGN KEY(change_set_id,field_binding_id) REFERENCES metadata.entity_surface_field_binding(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,field_binding_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_entity_field_id_fk FOREIGN KEY(change_set_id,entity_field_id) REFERENCES metadata.entity_field(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,entity_field_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_surface_operation_id_fk FOREIGN KEY(change_set_id,surface_operation_id) REFERENCES metadata.entity_surface_operation(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,surface_operation_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_surface_section_id_fk FOREIGN KEY(change_set_id,surface_section_id) REFERENCES metadata.entity_surface_section(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,surface_section_id);

ALTER TABLE metadata.entity_predicate ADD CONSTRAINT entity_predicate_navigation_group_id_fk FOREIGN KEY(change_set_id,navigation_group_id) REFERENCES metadata.entity_surface_navigation_group(change_set_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ON metadata.entity_predicate(change_set_id,navigation_group_id);

CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_predicate FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('predicate_key','parent_predicate_id','view_id','authorization_profile_id','field_binding_id','entity_field_id','surface_operation_id','surface_section_id','navigation_group_id');

ALTER TABLE metadata.entity_predicate ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_predicate FORCE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX entity_surface_view_default_uq ON metadata.entity_surface_view(change_set_id,entity_surface_id) WHERE view_kind='default';
CREATE UNIQUE INDEX entity_surface_view_field_group_uq ON metadata.entity_surface_view_field(change_set_id,view_id) WHERE grouped;

DO $$ DECLARE t text; BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN FOREACH t IN ARRAY ARRAY['entity_target','entity_field_choice','entity_surface_navigation_group','entity_surface_view','entity_surface_view_field','entity_access_permission','entity_operation_field','entity_authorization_profile','entity_field_access','entity_predicate'] LOOP
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.%I TO athyperapp',t);
 EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK(tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id() AND updated_by=master.current_principal_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
 END LOOP; END IF; END $$;

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

COMMIT;
