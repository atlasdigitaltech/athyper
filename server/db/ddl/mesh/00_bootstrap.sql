-- ============================================================================
-- mesh/00_bootstrap.sql
-- Minimal bootstrap for the standalone athyper_mesh database.
--
-- Keep this file intentionally small. The Mesh database owns the local shared
-- reference snapshot schema, the mesh exchange schema, the separate mesh_log
-- audit/telemetry schema, and the mesh_control runtime control schema. It must
-- not create Neon master/control/document/ledger schemas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS mesh;
