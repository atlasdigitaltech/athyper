-- The conversation participant guards call both helpers as the runtime role.
-- These functions enforce transaction-local tenant, principal and plane scope.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
    GRANT EXECUTE ON FUNCTION ai.fn_atlas_conversation_access(uuid,uuid,boolean) TO athyper_runtime;
    GRANT EXECUTE ON FUNCTION ai.fn_is_atlas_conversation(uuid,uuid) TO athyper_runtime;
  END IF;
END $$;
