"""Prove clean-to-upgrade type and reviewed-index parity before recording evidence.

URLs come only from CLEAN_DATABASE_URL and UPGRADE_DATABASE_URL.  The script is
read-only unless --write-evidence is explicitly supplied after every comparison
has passed.
"""
import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from verify_live_schema import INDEX_QUERY, QUERY, connection_environment

ROOT = Path(__file__).resolve().parent

def query(url, sql):
    result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], env=connection_environment(url), text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('Migration parity query failed; check database connectivity and catalog access.')
    return json.loads(result.stdout)

def columns(url, expected):
    live = {(row['table'], row['column']): (row['type'], row['baseType'], row['nullable']) for row in query(url, QUERY)}
    return {key: live.get(key) for key in expected}

def indexes(url, expected):
    live = {(row['table'], row['name']): row for row in query(url, INDEX_QUERY)}
    actual = {}
    for item in expected:
        row = live.get((item['table'], item['name']))
        actual[item['table'], item['name']] = None if row is None else {
            'unique': row['unique'], 'valid': row['valid'], 'ready': row['ready'],
            'predicate': row['predicate'].replace(' ', ''),
            'keyExpressions': [key.replace(' ', '') for key in row['keyExpressions']],
            'opclasses': row['opclasses'],
        }
    return actual

def expected_indexes(items):
    return {
        (item['table'], item['name']): {
            'unique': item.get('unique', False), 'valid': True, 'ready': True,
            'predicate': item.get('predicate', '').replace(' ', ''),
            'keyExpressions': [(part.get('expression') if part['kind'] == 'expression' else part['column']).replace(' ', '') for part in item['keyParts']],
            'opclasses': [part.get('opclass') for part in item['keyParts']],
        }
        for item in items
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write-evidence', action='store_true')
    args = parser.parse_args()
    clean_url, upgrade_url = os.environ.get('CLEAN_DATABASE_URL'), os.environ.get('UPGRADE_DATABASE_URL')
    if not clean_url or not upgrade_url:
        raise SystemExit('CLEAN_DATABASE_URL and UPGRADE_DATABASE_URL are required')
    clean_target, upgrade_target = connection_environment(clean_url), connection_environment(upgrade_url)
    identity = lambda e: (e['PGHOST'], e['PGPORT'], e['PGDATABASE'])
    if identity(clean_target) == identity(upgrade_target):
        raise SystemExit('CLEAN_DATABASE_URL and UPGRADE_DATABASE_URL must name different databases')
    storage = json.loads((ROOT/'review/storage-catalog.json').read_text())
    expected_columns = {(row['table'], row['column']): (row['type'], row['baseType'], row['nullable']) for row in storage['columns']}
    reviewed_indexes = json.loads((ROOT/'review/index-catalog.json').read_text())['indexes']
    expected_index_map = expected_indexes(reviewed_indexes)
    clean_columns, upgrade_columns = columns(clean_url, expected_columns), columns(upgrade_url, expected_columns)
    clean_indexes, upgrade_indexes = indexes(clean_url, reviewed_indexes), indexes(upgrade_url, reviewed_indexes)
    failures = []
    for name, actual, expected in [('clean columns', clean_columns, expected_columns), ('upgraded columns', upgrade_columns, expected_columns), ('clean indexes', clean_indexes, expected_index_map), ('upgraded indexes', upgrade_indexes, expected_index_map), ('clean-to-upgraded columns', clean_columns, upgrade_columns), ('clean-to-upgraded indexes', clean_indexes, upgrade_indexes)]:
        if actual != expected:
            failures.append(name)
    if failures:
        raise SystemExit('BLOCKED: migration parity failed: ' + ', '.join(failures))
    if args.write_evidence:
        storage['source']['sourceMigrationParityVerified'] = True
        storage['source']['sourceMigrationParityVerifiedAt'] = datetime.now(timezone.utc).isoformat()
        storage['source']['sourceMigrationParityMethod'] = 'clean_and_upgraded_catalog_columns_and_reviewed_indexes'
        (ROOT/'review/storage-catalog.json').write_text(json.dumps(storage, indent=2) + '\n')
    print(f'PASS: clean and upgraded databases match {len(expected_columns)} reviewed columns and {len(reviewed_indexes)} reviewed indexes.')

if __name__ == '__main__':
    main()
