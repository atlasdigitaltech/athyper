-- Neon ERP-plane identity.

DO $$
BEGIN
    IF current_database() <> 'athyper_neon' THEN
        RAISE EXCEPTION
            'Neon plane must target database athyper_neon; connected to %',
            current_database();
    END IF;

END;
$$;

ALTER DATABASE athyper_neon SET timezone TO 'UTC';
ALTER DATABASE athyper_neon SET app.database_plane TO 'neon';
