-- ============================================================================
-- 00_platform/001_extensions.sql
-- Concept: PostgreSQL Extensions — citext, pgcrypto, btree_gist
-- Depends on: (none — runs immediately after 000_roles.sql)
-- ============================================================================

-- Case-insensitive text type for email, username, and other case-insensitive comparisons
CREATE EXTENSION IF NOT EXISTS citext;

-- Cryptographic functions for UUID generation (gen_random_uuid) and hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- GiST index support for exclusion constraints on range and scalar types
CREATE EXTENSION IF NOT EXISTS btree_gist;
