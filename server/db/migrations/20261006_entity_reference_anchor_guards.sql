BEGIN;
SET LOCAL lock_timeout='5s';
-- Native anchors may not invalidate retained normalized members.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['entity_surface','entity_operation','entity_surface_field_binding','entity_surface_operation'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER reference_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.reference_member_final_guard()',t);
END LOOP; END $$;
COMMIT;
