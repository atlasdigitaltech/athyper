-- ============================================================================
-- control/00_bootstrap.sql
-- Pre-table schema types and sequences.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE TYPE "control"."auth_plane_code" AS ENUM (
  'neon',
  'admin',
  'all'
);
