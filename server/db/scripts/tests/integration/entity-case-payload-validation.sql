\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
 contract jsonb:='{"type":"object","required":["name"],"additionalProperties":false,"properties":{"name":{"type":"string","minLength":1,"maxLength":4},"requestedRole":{"type":"string","enum":["supplier","customer"]},"version":{"type":"integer","minimum":1,"maximum":10}}}';
 probe record; actual text[];
BEGIN
 FOR probe IN SELECT * FROM (VALUES
  ('valid', '{"name":"R4","requestedRole":"supplier","version":1}'::jsonb, ARRAY[]::text[]),
  ('lifecycle has no role', '{"name":"R4","version":10}', ARRAY[]::text[]),
  ('enum', '{"name":"R4","requestedRole":"administrator"}', ARRAY['ENUM_MISMATCH:requestedRole']),
  ('minimum', '{"name":"R4","version":0}', ARRAY['MINIMUM:version']),
  ('maximum', '{"name":"R4","version":11}', ARRAY['MAXIMUM:version']),
  ('integer', '{"name":"R4","version":1.5}', ARRAY['TYPE_MISMATCH:version']),
  ('integer type', '{"name":"R4","version":"1"}', ARRAY['TYPE_MISMATCH:version']),
  ('minimum length', '{"name":""}', ARRAY['MIN_LENGTH:name']),
  ('maximum length', '{"name":"12345"}', ARRAY['MAX_LENGTH:name']),
  ('unicode length', '{"name":"é😀"}', ARRAY[]::text[]),
  ('required', '{}', ARRAY['MISSING_REQUIRED:name']),
  ('unknown property', '{"name":"R4","override":true}', ARRAY['UNKNOWN_PROPERTY:override']),
  ('null property', '{"name":null}', ARRAY['TYPE_MISMATCH:name'])
 ) AS tests(label,payload,expected) LOOP
  actual:=document.fn_validate_entity_case_payload(contract,probe.payload);
  IF actual IS DISTINCT FROM probe.expected THEN RAISE EXCEPTION '%: expected %, got %',probe.label,probe.expected,actual; END IF;
 END LOOP;
 IF document.fn_validate_entity_case_payload(NULL,'{}') IS DISTINCT FROM ARRAY['CONTRACT_SCHEMA_INVALID'] THEN RAISE EXCEPTION 'Missing contract accepted'; END IF;
 IF document.fn_validate_entity_case_payload(contract,'[]') IS DISTINCT FROM ARRAY['PAYLOAD_OBJECT_OR_SIZE_INVALID'] THEN RAISE EXCEPTION 'Array payload accepted'; END IF;
 IF document.fn_validate_entity_case_payload(jsonb_build_object('jsonSchema',contract),'{"name":"R4"}') IS DISTINCT FROM ARRAY[]::text[] THEN RAISE EXCEPTION 'Wrapped contract failed'; END IF;
 RAISE NOTICE 'PASS: 16 native case payload validation checks';
END $$;
ROLLBACK;
