"""Blocking read-only schema gate. Requires psql and NEON_SCHEMA_DATABASE_URL."""
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
QUERY = """
SELECT coalesce(json_agg(json_build_object(
 'table', i.table_schema||'.'||i.table_name, 'column', i.column_name,
 'type', format_type(a.atttypid,a.atttypmod),
 'baseType', format_type(CASE WHEN t.typtype='d' THEN t.typbasetype ELSE t.oid END,NULL),
 'nullable', i.is_nullable='YES')), '[]'::json)
FROM information_schema.columns i
JOIN pg_namespace n ON n.nspname=i.table_schema
JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=i.table_name
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=i.column_name
JOIN pg_type t ON t.oid=a.atttypid
WHERE i.table_schema IN ('master','document','control','shared');
"""
INDEX_QUERY = """
SELECT coalesce(json_agg(json_build_object(
 'table', n.nspname||'.'||t.relname, 'name', i.relname,
 'unique', x.indisunique, 'valid', x.indisvalid, 'ready', x.indisready,
 'predicate', coalesce(pg_get_expr(x.indpred, x.indrelid), ''),
 'keyExpressions', (SELECT coalesce(json_agg(pg_get_indexdef(x.indexrelid, position + 1, true) ORDER BY position), '[]'::json)
                    FROM generate_subscripts(x.indkey, 1) AS position),
 'opclasses', (SELECT coalesce(json_agg(opc.opcname ORDER BY position), '[]'::json)
               FROM generate_subscripts(x.indkey, 1) AS position, pg_opclass opc
               WHERE opc.oid = x.indclass[position])
) ORDER BY n.nspname, t.relname, i.relname), '[]'::json)
FROM pg_index x
JOIN pg_class t ON t.oid=x.indrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
JOIN pg_class i ON i.oid=x.indexrelid
WHERE n.nspname IN ('master','document','control','shared');
"""

def connection_environment(url):
    parsed = urlparse(url)
    if parsed.scheme not in {'postgres', 'postgresql'} or not parsed.path.lstrip('/'):
        raise ValueError('NEON_SCHEMA_DATABASE_URL must be a PostgreSQL URL')
    query = parse_qs(parsed.query, keep_blank_values=True)
    supported_parameters = {'sslmode', 'sslrootcert', 'sslcert', 'sslkey'}
    unknown_parameters = set(query) - supported_parameters
    if unknown_parameters:
        raise ValueError('NEON_SCHEMA_DATABASE_URL contains unsupported connection parameters: ' + ', '.join(sorted(unknown_parameters)))
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    environment.update({
        'PGHOST': parsed.hostname or '',
        'PGPORT': str(parsed.port or 5432),
        'PGDATABASE': unquote(parsed.path.lstrip('/')),
        'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=30000',
        'PGCONNECT_TIMEOUT': '10',
    })
    if parsed.username: environment['PGUSER'] = unquote(parsed.username)
    if parsed.password: environment['PGPASSWORD'] = unquote(parsed.password)
    for source, target in {'sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT','sslcert':'PGSSLCERT','sslkey':'PGSSLKEY'}.items():
        if query.get(source): environment[target] = query[source][0]
    return environment

def query_live(url, query):
    result = subprocess.run(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query], env=connection_environment(url), capture_output=True, text=True)
    if result.returncode:
        sys.exit('BLOCKED: live schema query failed; check database connectivity and catalog access.')
    return json.loads(result.stdout)

def compare(expected, actual):
    live = {(r['table'], r['column']): r for r in actual}
    errors = []
    for row in expected:
        key = row['table'], row['column']
        found = live.get(key)
        if found is None:
            errors.append(f'{key[0]}.{key[1]}: missing or inaccessible')
        else:
            for prop in ('type', 'baseType', 'nullable'):
                if row[prop] != found[prop]:
                    errors.append(f'{key[0]}.{key[1]}: {prop}: expected {row[prop]!r}, got {found[prop]!r}')
    # Compare complete column sets for catalogued objects, including unbound columns.
    scope = {r['table'] for r in expected}
    known = {(r['table'], r['column']) for r in expected}
    errors.extend(f'{t}.{c}: uncatalogued live column' for t,c in live if t in scope and (t,c) not in known)
    return errors

def main():
    url = os.environ.get('NEON_SCHEMA_DATABASE_URL')
    if not url:
        sys.exit('BLOCKED: NEON_SCHEMA_DATABASE_URL is required; offline catalog validation is not a release gate.')
    environment = connection_environment(url)
    catalog_document = json.loads((ROOT/'review/storage-catalog.json').read_text())
    identity = query_live(url, "SELECT json_build_object('database', current_database())")
    expected_database = catalog_document['source']['database']
    if identity['database'] != expected_database or environment['PGDATABASE'] != expected_database:
        sys.exit('BLOCKED: PostgreSQL connection database does not match reviewed catalog evidence.')
    expected = catalog_document['columns']
    errors = compare(expected, query_live(url, QUERY))
    expected_indexes = json.loads((ROOT/'review/index-catalog.json').read_text())['indexes']
    live_indexes = {(row['table'], row['name']): row for row in query_live(url, INDEX_QUERY)}
    for index in expected_indexes:
        actual = live_indexes.get((index['table'], index['name']))
        if actual is None:
            errors.append(f"{index['table']}.{index['name']}: missing or inaccessible index")
            continue
        if actual['unique'] != index.get('unique', False):
            errors.append(f"{index['table']}.{index['name']}: uniqueness differs from reviewed index evidence")
        if actual['valid'] is not True or actual['ready'] is not True:
            errors.append(f"{index['table']}.{index['name']}: index is not valid and ready for planner use")
        if actual['predicate'].replace(' ', '') != index.get('predicate', '').replace(' ', ''):
            errors.append(f"{index['table']}.{index['name']}: predicate differs from reviewed index evidence")
        expected_parts = index.get('keyParts', [])
        actual_parts = actual['keyExpressions']
        if len(expected_parts) != len(actual_parts):
            errors.append(f"{index['table']}.{index['name']}: key count differs from reviewed index evidence")
            continue
        for position, part in enumerate(expected_parts):
            expected_expression = part.get('expression') if part['kind'] == 'expression' else part['column']
            if actual_parts[position].replace(' ', '') != expected_expression.replace(' ', ''):
                errors.append(f"{index['table']}.{index['name']}: key {position + 1} differs from reviewed index evidence")
            opclass = part.get('opclass')
            if opclass and actual['opclasses'][position] != opclass:
                errors.append(f"{index['table']}.{index['name']}: key {position + 1} opclass differs from reviewed index evidence")
    if errors:
        print('\n'.join(errors))
        sys.exit('BLOCKED: live Neon schema differs from reviewed catalog; no release permitted.')
    print(f"PASS: {len(expected)} catalog columns and {len(expected_indexes)} reviewed indexes match {environment['PGHOST']}/{environment['PGDATABASE']}.")

if __name__ == '__main__': main()
