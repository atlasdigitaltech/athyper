-- Additive authoring storage only. Does not publish or modify existing bindings.
BEGIN;
ALTER TABLE metadata.entity_capability
  ADD COLUMN IF NOT EXISTS profile jsonb CHECK(profile IS NULL OR jsonb_typeof(profile)='object'),
  ADD COLUMN IF NOT EXISTS profile_definition jsonb CHECK(profile_definition IS NULL OR jsonb_typeof(profile_definition)='object'),
  ADD COLUMN IF NOT EXISTS overrides jsonb CHECK(overrides IS NULL OR jsonb_typeof(overrides)='object');
COMMIT;
