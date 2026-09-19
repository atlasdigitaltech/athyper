CREATE VIEW shared.v_bank_institution WITH (security_invoker=true) AS
 SELECT i.* FROM shared.bank_institution_version i JOIN shared.bank_directory_activation a ON a.release_id=i.release_id;
CREATE VIEW shared.v_bank_branch WITH (security_invoker=true) AS
 SELECT b.* FROM shared.bank_branch_version b JOIN shared.bank_directory_activation a ON a.release_id=b.release_id;
-- One row per institution or branch. Routing identifiers remain scheme-qualified;
-- an ambiguous identifier is deliberately not selected for payment routing.
CREATE VIEW shared.v_bank_directory WITH (security_invoker=true) AS
 SELECT i.institution_id AS id,b.branch_id,i.release_id,i.name,COALESCE(b.country_code,i.country_code) AS country_code,i.institution_type,i.status,
 b.name AS branch_name,
 (SELECT CASE WHEN count(*)=1 THEN min(x.value) END FROM shared.bank_identifier x WHERE x.release_id=i.release_id AND x.institution_id=i.institution_id AND x.branch_id IS NOT DISTINCT FROM b.branch_id AND x.scheme='bic' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS bic,
 (SELECT CASE WHEN count(*)=1 THEN min(x.value) END FROM shared.bank_identifier x WHERE x.release_id=i.release_id AND x.institution_id=i.institution_id AND x.branch_id IS NOT DISTINCT FROM b.branch_id AND x.scheme='national_branch_code' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS branch_code,
 (SELECT CASE WHEN count(*)=1 THEN min(x.scheme_namespace) END FROM shared.bank_identifier x WHERE x.release_id=i.release_id AND x.institution_id=i.institution_id AND x.branch_id IS NULL AND x.scheme='national_bank_code' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS national_bank_code_type,
 (SELECT CASE WHEN count(*)=1 THEN min(x.value) END FROM shared.bank_identifier x WHERE x.release_id=i.release_id AND x.institution_id=i.institution_id AND x.branch_id IS NULL AND x.scheme='national_bank_code' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS national_bank_code,
 NULL::boolean AS supports_swift,NULL::boolean AS supports_local_clearing,NULL::boolean AS supports_sepa,NULL::boolean AS supports_ach
 FROM shared.v_bank_institution i
 JOIN LATERAL (SELECT NULL::uuid AS branch_id,NULL::text AS name,NULL::character(2) AS country_code UNION ALL SELECT v.branch_id,v.name,v.country_code FROM shared.v_bank_branch v WHERE v.institution_id=i.institution_id) b ON true;
