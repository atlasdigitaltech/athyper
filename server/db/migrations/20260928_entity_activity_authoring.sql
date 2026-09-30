-- Extend existing Meta Entity member storage; no release or runtime activation.
BEGIN;
DO $$ BEGIN
 IF current_setting('app.database_plane',true) IS DISTINCT FROM 'studio' THEN
  RAISE EXCEPTION 'Activity authoring upgrade requires Studio';
 END IF;
END $$;
ALTER TABLE metadata.entity_capability DROP CONSTRAINT entity_capability_capability_key_check;
ALTER TABLE metadata.entity_capability ADD CONSTRAINT entity_capability_capability_key_check
 CHECK (capability_key IN ('comments','attachments','activity'));
COMMIT;
