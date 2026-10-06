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

CREATE UNIQUE INDEX entity_predicate_root_view_id_uq ON metadata.entity_predicate(change_set_id,purpose,view_id) WHERE parent_predicate_id IS NULL AND view_id IS NOT NULL;

CREATE UNIQUE INDEX entity_predicate_root_authorization_profile_id_uq ON metadata.entity_predicate(change_set_id,purpose,authorization_profile_id) WHERE parent_predicate_id IS NULL AND authorization_profile_id IS NOT NULL;

CREATE UNIQUE INDEX entity_predicate_root_field_binding_id_uq ON metadata.entity_predicate(change_set_id,purpose,field_binding_id) WHERE parent_predicate_id IS NULL AND field_binding_id IS NOT NULL;

CREATE UNIQUE INDEX entity_predicate_root_surface_operation_id_uq ON metadata.entity_predicate(change_set_id,purpose,surface_operation_id) WHERE parent_predicate_id IS NULL AND surface_operation_id IS NOT NULL;

CREATE UNIQUE INDEX entity_predicate_root_surface_section_id_uq ON metadata.entity_predicate(change_set_id,purpose,surface_section_id) WHERE parent_predicate_id IS NULL AND surface_section_id IS NOT NULL;

CREATE UNIQUE INDEX entity_predicate_root_navigation_group_id_uq ON metadata.entity_predicate(change_set_id,purpose,navigation_group_id) WHERE parent_predicate_id IS NULL AND navigation_group_id IS NOT NULL;

DO $$ DECLARE t text; BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN FOREACH t IN ARRAY ARRAY['entity_target','entity_field_choice','entity_surface_navigation_group','entity_surface_view','entity_surface_view_field','entity_access_permission','entity_operation_field','entity_authorization_profile','entity_field_access','entity_predicate'] LOOP
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.%I TO athyperapp',t);
 EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK(tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id() AND updated_by=master.current_principal_id_soft())',t);
 EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
 END LOOP; END IF; END $$;
