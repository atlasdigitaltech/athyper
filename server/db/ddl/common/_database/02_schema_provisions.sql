-- Provisioning ledger used by the existing manual/seed tooling.
-- The foundation runner proves the target database is empty before this
-- intentional desired-state CREATE.

CREATE TABLE public.schema_provisions (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name   text        NOT NULL UNIQUE,
    checksum    text        NOT NULL,
    executed_at timestamptz NOT NULL DEFAULT now()
);
