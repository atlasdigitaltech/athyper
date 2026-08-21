-- Mesh network-plane identity.

DO $$
BEGIN
    IF current_database() <> 'athyper_mesh' THEN
        RAISE EXCEPTION
            'Mesh plane must target database athyper_mesh; connected to %',
            current_database();
    END IF;

END;
$$;

ALTER DATABASE athyper_mesh SET timezone TO 'UTC';
ALTER DATABASE athyper_mesh SET app.database_plane TO 'mesh';
