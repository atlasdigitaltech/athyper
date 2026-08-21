-- Athyper studio-plane identity.

DO $$
BEGIN
    IF current_database() <> 'athyper_studio' THEN
        RAISE EXCEPTION
            'Studio plane must target database athyper_studio; connected to %',
            current_database();
    END IF;

END;
$$;

ALTER DATABASE athyper_studio SET timezone TO 'UTC';
ALTER DATABASE athyper_studio SET app.database_plane TO 'studio';
