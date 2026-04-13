-- Case-insensitive text type for email, username, and other case-insensitive comparisons
CREATE EXTENSION IF NOT EXISTS citext;

-- Cryptographic functions for UUID generation (gen_random_uuid) and hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- GiST index support for exclusion constraints on range and scalar types
CREATE EXTENSION IF NOT EXISTS btree_gist;
