#!/usr/bin/env python3
"""Repair the incomplete local foundation without replacing its newer source reader.

Normal deployments use the ordered Studio manifest. This repair requires the
already-installed local request reader and standing host identity. Default is a
rolled-back rehearsal; --apply commits the same transaction and migration hashes.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3] / 'server/db/migrations'
names = (root / 'manifests/studio.txt').read_text().splitlines()
selected = names[names.index('20261009_native_product_review.sql'):
                 names.index('20261009_native_identity_inheritance.sql')]
selected += [n for n in names if re.fullmatch(r'202610\d\d_local_(publication|rollback)_\w+\.sql', n)]
selected = [n for n in selected if n != '20261009_native_worker_source.sql']
selected.append('20261010_native_worker_component_installation.sql')


def sql(statement):
    result = subprocess.run(
        ['docker', 'exec', '-i', 'athyper-dev-db-1', 'psql', '-X', '-U',
         'postgres', '-d', 'athyper_studio', '-At', '-v', 'ON_ERROR_STOP=1'],
        input=statement, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])
    return result.stdout.strip()


preflight = """DO $$ BEGIN
 IF current_database() <> 'athyper_studio'
 OR NOT EXISTS(SELECT 1 FROM publication.local_publication_host WHERE singleton
   AND identity='{"environment":"local","instance":"dev","domainSuffix":"dev.athyper.test"}'::jsonb)
 OR strpos(pg_get_functiondef('publication.read_native_worker_source(uuid,integer)'::regprocedure),
   'LOCAL_SOURCE_MISMATCH')=0
 THEN RAISE EXCEPTION 'LOCAL_NATIVE_PUBLICATION_REPAIR_PRECONDITION'; END IF;
END $$;"""
sql(preflight)
done = dict(line.split('|') for line in sql(
    "SELECT migration_name,sha256 FROM public.athyper_schema_migration_v1 WHERE status='applied'").splitlines())
inventory = json.loads((root / 'inventory.json').read_text())['entries']
blocks, pending = [], []
for name in selected:
    entry = next(e for e in inventory if e['originalPath'] == 'migrations/' + name)
    source = (root.parent / entry['path']).read_text()
    digest = hashlib.sha256(source.encode()).hexdigest()
    if entry['sha256'] != digest or (name in done and done[name] != digest):
        raise RuntimeError('Migration checksum mismatch: ' + name)
    if name in done:
        continue
    if len(re.findall(r'^BEGIN;', source, re.M)) != 1 or not source.rstrip().endswith('COMMIT;'):
        raise RuntimeError('Expected transaction wrapper: ' + name)
    body = re.sub(r'^BEGIN;\s*', '', source, count=1, flags=re.M)
    body = re.sub(r'COMMIT;\s*$', '', body)
    blocks.append(body + f"""
INSERT INTO public.athyper_schema_migration_v1
(migration_name,sha256,status,runner_id,started_at,completed_at)
VALUES('{name}','{digest}','applied','native-publication-chain',now(),now());
""")
    pending.append(name)
batch = "BEGIN; SET LOCAL lock_timeout='5s';\n" + preflight + '\n'.join(blocks)
sql(batch + '\nROLLBACK;')
if args.apply:
    sql(batch + '\nCOMMIT;')
result = {'migrations': pending, 'rollbackRehearsed': True, 'applied': args.apply}
if args.output:
    args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
