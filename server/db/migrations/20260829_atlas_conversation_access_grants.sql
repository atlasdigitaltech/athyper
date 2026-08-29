BEGIN;

DO $grant_repair$
BEGIN
  IF to_regprocedure('ai.fn_atlas_conversation_access(uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Atlas conversation access function is missing';
  END IF;
  REVOKE ALL ON FUNCTION ai.fn_atlas_conversation_access(uuid, uuid, boolean) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    GRANT EXECUTE ON FUNCTION ai.fn_atlas_conversation_access(uuid, uuid, boolean) TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION ai.fn_atlas_conversation_access(uuid, uuid, boolean) TO athyperadmin;
  END IF;
END
$grant_repair$;

DO $assertions$
BEGIN
  IF has_function_privilege('public', 'ai.fn_atlas_conversation_access(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute Atlas conversation access';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp')
     AND NOT has_function_privilege('athyperapp', 'ai.fn_atlas_conversation_access(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'athyperapp requires Atlas conversation access execution';
  END IF;
END
$assertions$;

COMMIT;
