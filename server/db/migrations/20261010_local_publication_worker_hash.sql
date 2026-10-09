-- Pure JSONB ledger hash verification; no snapshot data access.
GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_hash(jsonb) TO athyper_worker;
