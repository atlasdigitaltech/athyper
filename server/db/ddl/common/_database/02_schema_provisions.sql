-- Provisioning ledger used by the existing manual/seed tooling.
-- The foundation runner proves the target database is empty before this
-- intentional desired-state CREATE.

CREATE TABLE public.schema_provisions (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plane             text        NOT NULL,
    manifest_checksum text        NOT NULL,
    manifest_ordinal  integer     NOT NULL,
    file_name         text        NOT NULL UNIQUE,
    checksum          text        NOT NULL,
    executed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT schema_provisions_plane_chk
        CHECK (plane IN ('studio', 'neon', 'mesh')),
    CONSTRAINT schema_provisions_manifest_checksum_chk
        CHECK (manifest_checksum ~ '^[0-9a-f]{64}$'),
    CONSTRAINT schema_provisions_checksum_chk
        CHECK (checksum ~ '^[0-9a-f]{64}$'),
    CONSTRAINT schema_provisions_manifest_ordinal_chk
        CHECK (manifest_ordinal > 0),
    CONSTRAINT schema_provisions_manifest_coordinate_uq
        UNIQUE (plane, manifest_checksum, manifest_ordinal)
);

REVOKE ALL ON TABLE public.schema_provisions FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.schema_provisions_id_seq FROM PUBLIC;
