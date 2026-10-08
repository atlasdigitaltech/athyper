-- Existing shared scope evaluator used by read-only permission resolution.
GRANT EXECUTE ON FUNCTION authz.fn_scope_assignment_covers_target(uuid,uuid,uuid,authz.propagation_mode_d) TO athyper_publication_service;
