-- Current bank master data. Same columns the consumers already read, minus any release concept.
CREATE VIEW shared.v_bank_institution WITH (security_invoker=true) AS
 SELECT i.id AS institution_id,i.name,i.country_code,i.institution_type,i.status,i.effective_from,i.effective_until
 FROM shared.bank_institution i;
CREATE VIEW shared.v_bank_branch WITH (security_invoker=true) AS
 SELECT b.id AS branch_id,b.institution_id,b.name,b.country_code,b.location,b.status,b.effective_from,b.effective_until
 FROM shared.bank_branch b;
-- One row per institution or branch. Routing identifiers remain scheme-qualified;
-- an ambiguous identifier is deliberately not selected for payment routing.
CREATE VIEW shared.v_bank_directory WITH (security_invoker=true) AS
 SELECT i.institution_id AS id,b.branch_id,i.name,COALESCE(b.country_code,i.country_code) AS country_code,i.institution_type,i.status,
 b.name AS branch_name,
 (SELECT CASE WHEN count(*)=1 THEN min(x.value) END FROM shared.bank_identifier x WHERE x.institution_id=i.institution_id AND x.branch_id IS NOT DISTINCT FROM b.branch_id AND x.scheme='bic' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS bic,
 (SELECT CASE WHEN count(*)=1 THEN min(x.value) END FROM shared.bank_identifier x WHERE x.institution_id=i.institution_id AND x.branch_id IS NOT DISTINCT FROM b.branch_id AND x.scheme='national_branch_code' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS branch_code,
 (SELECT CASE WHEN count(*)=1 THEN min(x.scheme_namespace) END FROM shared.bank_identifier x WHERE x.institution_id=i.institution_id AND x.branch_id IS NULL AND x.scheme='national_bank_code' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS national_bank_code_type,
 (SELECT CASE WHEN count(*)=1 THEN min(x.value) END FROM shared.bank_identifier x WHERE x.institution_id=i.institution_id AND x.branch_id IS NULL AND x.scheme='national_bank_code' AND x.effective_from<=CURRENT_DATE AND (x.effective_until IS NULL OR x.effective_until>CURRENT_DATE)) AS national_bank_code,
 NULL::boolean AS supports_swift,NULL::boolean AS supports_local_clearing,NULL::boolean AS supports_sepa,NULL::boolean AS supports_ach
 FROM shared.v_bank_institution i
 JOIN LATERAL (SELECT NULL::uuid AS branch_id,NULL::text AS name,NULL::character(2) AS country_code UNION ALL SELECT v.branch_id,v.name,v.country_code FROM shared.v_bank_branch v WHERE v.institution_id=i.institution_id) b ON true;
