-- Mesh worker identity context required by shared publication authorization.
BEGIN;
GRANT EXECUTE ON FUNCTION master.current_principal_id_soft() TO athyper_worker;
COMMIT;
