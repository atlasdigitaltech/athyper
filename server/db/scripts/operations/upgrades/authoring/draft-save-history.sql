-- Apply once to Studio before deploying history-enabled authoring. No historical versions fabricated.
BEGIN;
CREATE TABLE snapshot.entity_draft_save (
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id),
 lock_version bigint NOT NULL CHECK (lock_version >= 0),
 tenant_id uuid,
 graph jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
 graph_hash text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 captured_by uuid NOT NULL,
 capture_kind text NOT NULL CHECK (capture_kind IN ('saved', 'previous')),
 PRIMARY KEY (change_set_id, lock_version),
 FOREIGN KEY (tenant_id, change_set_id) REFERENCES metadata.entity_change_set(tenant_id, id)
);

CREATE FUNCTION snapshot.guard_entity_draft_save() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Draft save history is immutable'; END;
$$;

CREATE TRIGGER entity_draft_save_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_draft_save
FOR EACH ROW EXECUTE FUNCTION snapshot.guard_entity_draft_save();

ALTER TABLE snapshot.entity_draft_save ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.entity_draft_save FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_draft_save_read ON snapshot.entity_draft_save FOR SELECT TO athyperapp
USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY entity_draft_save_insert ON snapshot.entity_draft_save FOR INSERT TO athyperapp
WITH CHECK (tenant_id = shared.current_tenant_id() AND captured_by = master.current_principal_id_soft());

GRANT SELECT, INSERT ON snapshot.entity_draft_save TO athyperapp;

COMMIT;
