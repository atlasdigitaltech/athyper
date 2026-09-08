-- Symbolic defaults are resolved against the current published collection on every request.
ALTER TABLE master.saved_view_default DROP CONSTRAINT IF EXISTS saved_view_default_view_id_check;
ALTER TABLE master.saved_view_default ADD CONSTRAINT saved_view_default_view_id_check CHECK (view_id='system' OR view_id ~ '^standard\.[a-z][a-z0-9_.-]{0,126}$' OR view_id ~ '^[0-9a-f-]{36}$');
