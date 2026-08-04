-- ============================================================================
-- document/00_bootstrap.sql
-- Pre-table schema types and sequences.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE SEQUENCE "document"."upupr_code_seq"
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 9223372036854775807
  CACHE 1
  NO CYCLE;
