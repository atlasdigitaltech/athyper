CREATE SCHEMA metadata;

COMMENT ON SCHEMA metadata IS
  'Athyper-only authority for Entity authoring, validation, and release metadata. Runtime planes receive immutable runtime_meta projections instead.';
