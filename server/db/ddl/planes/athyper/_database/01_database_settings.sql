-- Athyper platform-plane identity.

DO $$
BEGIN
    IF current_database() <> 'athyper_platform' THEN
        RAISE EXCEPTION
            'Athyper plane must target database athyper_platform; connected to %',
            current_database();
    END IF;

END;
$$;

ALTER DATABASE athyper_platform SET timezone TO 'UTC';
ALTER DATABASE athyper_platform SET app.database_plane TO 'athyper';
