/** Existing DEV only; session-local fixture tables, always rolled back. No publication or migration application. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const container = process.argv[2];
if (!container || process.argv.length !== 3) throw Error('Specify the existing DEV database container');
const inspection = JSON.parse(execFileSync('docker', ['inspect', container], {encoding:'utf8'}))[0];
if (inspection.Config.Labels['com.docker.compose.project'] !== 'athyper-dev') throw Error('Existing DEV container required');
const ddl = readFileSync(fileURLToPath(new URL('../../../ddl/planes/neon/master/37_partner_child_read_models.sql', import.meta.url)), 'utf8');
const queries = ddl.split('CREATE OR REPLACE VIEW ').slice(1).map(part => part.split(' AS\n')[1].split(';')[0]);
if (queries.length !== 3) throw Error('Unexpected read-model count');
const banking = queries[0].replaceAll('master.v_business_partner_bank_account', 'pg_temp.bank_source').replaceAll('master.payment_instrument', 'pg_temp.instrument');
const industry = queries[1].replaceAll('master.business_partner_industry_classification', 'pg_temp.assignment').replaceAll('shared.industry_code', 'pg_temp.industry');
const qualification = queries[2].replaceAll('control.business_partner_qualification', 'pg_temp.qualification').replaceAll('control.business_partner_decision_scope', 'pg_temp.decision_scope');
const sql = `BEGIN;
SET LOCAL statement_timeout='10s';
CREATE TEMP TABLE bank_source (id uuid, tenant_id uuid, business_partner_id uuid, bank_account_id uuid, bank_name text, branch_name text, branch_code text, bic text, account_holder_name text, account_last4 text, currency_code text, secret_value text);
CREATE TEMP TABLE instrument (id uuid, tenant_id uuid, status text);
CREATE TEMP TABLE assignment (id uuid, tenant_id uuid, business_partner_id uuid, industry_domain_code text, industry_code_id uuid, assignment_kind text, confidence smallint, source_system text, source_reference text, is_primary boolean, effective_from date, effective_until date, status text, verified_at timestamptz);
CREATE TEMP TABLE industry (id uuid, domain_code text, code text, name text);
INSERT INTO bank_source VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','Bank','Branch','BR','BIC','Holder','1234','USD','RAW_ACCOUNT_SENTINEL');
INSERT INTO instrument VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','active'),('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009','CROSS_TENANT_SENTINEL');
CREATE TEMP VIEW banking_read AS ${banking};
INSERT INTO industry VALUES ('00000000-0000-4000-8000-000000000005','sample','CODE','Readable industry');
INSERT INTO assignment (id,tenant_id,business_partner_id,industry_domain_code,industry_code_id,verified_at) VALUES
('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','sample','00000000-0000-4000-8000-000000000005',now()),
('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','different','00000000-0000-4000-8000-000000000005',null);
CREATE TEMP VIEW industry_read AS ${industry};
DO $$ BEGIN
 IF (SELECT count(*) FROM banking_read)<>1 OR (SELECT status FROM banking_read)<>'active' THEN RAISE EXCEPTION 'Bank tenant join failed'; END IF;
 IF EXISTS (SELECT 1 FROM banking_read WHERE reveal_link_id<>id OR account_last4<>'1234') THEN RAISE EXCEPTION 'Bank projection identity failed'; END IF;
 IF (SELECT row_to_json(b)::text FROM banking_read b) LIKE '%SENTINEL%' THEN RAISE EXCEPTION 'Protected source leaked'; END IF;
 IF EXISTS (SELECT 1 FROM banking_read WHERE business_partner_id='00000000-0000-4000-8000-000000000009') THEN RAISE EXCEPTION 'Parent predicate failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM industry_read WHERE verification_status='verified' AND industry_name='Readable industry') THEN RAISE EXCEPTION 'Industry label/status failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM industry_read WHERE verification_status='unverified' AND industry_name IS NULL) THEN RAISE EXCEPTION 'Industry domain mismatch leaked a label'; END IF;
END $$;
CREATE TEMP TABLE qualification (id uuid, tenant_id uuid, business_partner_id uuid, qualification_type_code text, context_kind text, context_id uuid, decision text, conditions jsonb, effective_from date, effective_until date, next_review_at date, decision_reason text);
CREATE TEMP TABLE decision_scope (id uuid, tenant_id uuid, qualification_id uuid, scope_group smallint, scope_mode text, scope_kind text, selection_mode text, commercial_capacity_code text, operating_organization_id uuid, company_code_id uuid, commodity_category_id uuid, country_code text, country_purpose text, commodity_classification_id uuid, tax_jurisdiction_id uuid, organization_unit_id uuid, hierarchy_version bigint);
INSERT INTO qualification VALUES
('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','sample','project','00000000-0000-4000-8000-000000000011','conditional',
 '[{"presentation":{"schema":"partner-condition-summary.v1","summary":"Stored summary"},"private":"PRIVATE_SENTINEL"},{"summary":"PRIVATE_SENTINEL"},{"presentation":{"schema":"other","summary":"PRIVATE_SENTINEL"}},{"presentation":{"schema":"partner-condition-summary.v1","summary":42}},{"presentation":{"schema":"partner-condition-summary.v1","summary":"  "}},null]',
 (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,null,null,'PRIVATE_SENTINEL');
INSERT INTO decision_scope (id,tenant_id,qualification_id,scope_group,scope_mode,scope_kind,selection_mode,country_code) VALUES
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',1,'include','country','selected','MY'),
('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010',1,'include','country','selected','CROSS_TENANT_SENTINEL'),
('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000009',1,'include','country','selected','CROSS_PARENT_SENTINEL');
CREATE TEMP VIEW qualification_read AS ${qualification};
DO $$ DECLARE result jsonb; BEGIN
 SELECT to_jsonb(q) INTO result FROM qualification_read q;
 IF result->'context_reference' <> '[{"name":null,"state":"unavailable"}]'::jsonb OR result ? 'context_id' THEN RAISE EXCEPTION 'Unavailable context contract failed'; END IF;
 IF result::text LIKE '%SENTINEL%' OR result ? 'conditions' OR result ? 'decision_reason' THEN RAISE EXCEPTION 'Private qualification input leaked'; END IF;
 IF jsonb_array_length(result->'coverage')<>1 OR result #>> '{coverage,0,country_code}'<>'MY' THEN RAISE EXCEPTION 'Coverage ownership failed'; END IF;
 IF result->>'recorded_condition_count'<>'6' OR result #>> '{condition_summaries,0,state}'<>'recorded_not_evaluated' OR result #>> '{condition_summaries,0,summary}'<>'Stored summary' THEN RAISE EXCEPTION 'Condition envelope failed'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(result->'condition_summaries') WITH ORDINALITY c(value,n) WHERE n>1 AND (value->>'state'<>'summary_unavailable' OR value->'summary'<>'null'::jsonb)) THEN RAISE EXCEPTION 'Malformed envelope accepted'; END IF;
 IF result->>'date_window'<>'within_window' THEN RAISE EXCEPTION 'Inclusive start failed'; END IF;
 UPDATE qualification SET effective_until=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
 IF (SELECT date_window FROM qualification_read)<>'ended' THEN RAISE EXCEPTION 'Exclusive end failed'; END IF;
 UPDATE qualification SET effective_from=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1,effective_until=null;
 IF (SELECT date_window FROM qualification_read)<>'scheduled' THEN RAISE EXCEPTION 'Future start failed'; END IF;
 UPDATE qualification SET effective_from=null,context_kind='standing',context_id=null,conditions='[]';
 IF NOT EXISTS (SELECT 1 FROM qualification_read WHERE date_window='unspecified' AND context_reference='[]'::jsonb AND condition_summaries='[]'::jsonb AND recorded_condition_count=0) THEN RAISE EXCEPTION 'Empty presentation failed'; END IF;
 UPDATE qualification SET conditions=(SELECT jsonb_agg(jsonb_build_object('presentation',jsonb_build_object('schema','partner-condition-summary.v1','summary',repeat('x',1001)))) FROM generate_series(1,101));
 IF NOT EXISTS (SELECT 1 FROM qualification_read WHERE recorded_condition_count=101 AND jsonb_array_length(condition_summaries)=100 AND condition_summaries->0->>'state'='summary_unavailable') THEN RAISE EXCEPTION 'Bounded summary projection failed'; END IF;
END $$;
ROLLBACK;
`;
execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','athyper_neon','-X','-q','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
console.log('Banking/industry/qualification read models: PostgreSQL fixture checks passed; all temporary work rolled back. Publication and RLS admission were not exercised.');
