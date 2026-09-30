BEGIN;
-- Canonical payload encoding used by reviewed descriptor content hashes.
CREATE OR REPLACE FUNCTION publication.fn_successor_canonical_json(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,publication AS $$
 SELECT CASE jsonb_typeof(p)
 WHEN 'object' THEN '{'||COALESCE((SELECT string_agg(to_jsonb(key)::text||':'||publication.fn_successor_canonical_json(value),',' ORDER BY key COLLATE "C") FROM jsonb_each(p)),'')||'}'
 WHEN 'array' THEN '['||COALESCE((SELECT string_agg(publication.fn_successor_canonical_json(value),',' ORDER BY ord) FROM jsonb_array_elements(p) WITH ORDINALITY AS a(value,ord)),'')||']'
 ELSE p::text END
$$;
REVOKE ALL ON FUNCTION publication.fn_successor_canonical_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_successor_canonical_json(jsonb) TO athyperapp,athyperadmin;
COMMIT;
