-- ============================================================================
-- shared/00_bootstrap.sql
-- Concept: UUID Factory — uuidv7() primary-key generator, must exist before all tables
-- Depends on: 01_schemas/001_schemas.sql
-- Must execute BEFORE 04_tables/ — every table uses DEFAULT shared.uuidv7().
-- PostgreSQL resolves DEFAULT expressions at CREATE TABLE time, so the function
-- must exist before any table that references it.
-- ============================================================================

CREATE OR REPLACE FUNCTION shared.uuidv7() RETURNS uuid
    LANGUAGE plpgsql VOLATILE
    SET search_path = shared
AS $$
DECLARE
    v_bytes bytea := uuid_send(gen_random_uuid());
BEGIN
    v_bytes := overlay(v_bytes
        PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6);
    v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & x'0f'::int) | x'70'::int);
    v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & x'3f'::int) | x'80'::int);
    RETURN encode(v_bytes, 'hex')::uuid;
END;
$$;

COMMENT ON FUNCTION shared.uuidv7() IS
    'Generates a UUIDv7 (RFC 9562) with millisecond-precision timestamp in the '
    'high 48 bits and cryptographic randomness in the remaining bits. Used as '
    'DEFAULT for every primary key column — must exist before any CREATE TABLE.';
