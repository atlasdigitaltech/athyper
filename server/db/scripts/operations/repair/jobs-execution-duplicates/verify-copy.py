#!/usr/bin/env python3
"""Rehearse the audited repair only on an explicitly network-isolated disposable copy."""
import argparse
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', required=True)
    parser.add_argument('--plan-directory', required=True, type=Path)
    args = parser.parse_args()
    mode = subprocess.check_output(['docker','inspect','-f','{{.HostConfig.NetworkMode}}',args.container],text=True).strip()
    if mode != 'none' or not args.container.startswith('athyper-jobs-repair-copy-'):
        raise SystemExit('Tests require a network-isolated athyper-jobs-repair-copy-* container; source databases are prohibited')
    root = Path(__file__).parent
    sql = (root/'repair.sql').read_text()
    results = []
    for plane in ('studio','neon','mesh'):
        plan_path = args.plan_directory/f'{plane}-plan.json'
        plan = json.loads(plan_path.read_text())
        if not plan['rows']:
            continue
        command = ['docker','exec','-i',args.container,'psql','-XqAt','-U','postgres','-d',plan['database'],'-v','ON_ERROR_STOP=1',
            '-v',f"expected_database={plan['database']}",'-v',f"repair_id={plan['repair_id']}",'-v',f"repair_plan={json.dumps(plan['rows'])}",'-v','apply=false']
        duplicate = plan['rows'][0]['duplicate_id']
        canonical = plan['rows'][0]['canonical_id']
        probes = [
            ('referenced duplicate',f"INSERT INTO ops.job_execution_command(tenant_id,execution_id,command,reason,requested_by,status,applied_at) SELECT tenant_id,id,'cancel','copy-only refusal test',created_by,'applied',now() FROM ops.job_execution WHERE id='{duplicate}'::uuid;",'has evidence or inbound references'),
            ('changed canonical',f"UPDATE ops.job_execution SET status='running',completed_at=NULL,updated_by=created_by WHERE id='{canonical}'::uuid;",'changed since audit'),
            ('unknown inbound foreign key','CREATE TABLE public.jobs_repair_reference_probe (execution_id uuid REFERENCES ops.job_execution(id));','Unreviewed foreign key'),
        ]
        for label,fixture,expected in probes:
            outcome = subprocess.run(command,input=sql.replace('BEGIN;','BEGIN;\n'+fixture,1),text=True,capture_output=True)
            if outcome.returncode == 0 or expected not in outcome.stderr:
                raise AssertionError(f'{plane}: {label} was not safely refused: {outcome.stderr}')
            results.append({'plane':plane,'test':label,'passed':True})
        dry = subprocess.run([sys.executable,str(root/'run-repair.py'),'--container',args.container,'--plan',str(plan_path)],text=True,capture_output=True,check=True)
        receipt = json.loads(dry.stdout)
        assert receipt['archived_this_run'] == len(plan['rows']) and receipt['apply'] is False
        # Dry run and every refusal must have rolled back completely.
        unchanged = subprocess.run(command,input="SELECT to_regclass('ops.job_execution_duplicate_archive') IS NULL;",text=True,capture_output=True,check=True)
        assert unchanged.stdout.strip() == 't'
        results.append({'plane':plane,'test':'dry-run rollback','passed':True})
        first = subprocess.run([sys.executable,str(root/'run-repair.py'),'--container',args.container,'--plan',str(plan_path),'--apply'],text=True,capture_output=True,check=True)
        assert json.loads(first.stdout)['archived_this_run'] == len(plan['rows'])
        again = subprocess.run([sys.executable,str(root/'run-repair.py'),'--container',args.container,'--plan',str(plan_path),'--apply'],text=True,capture_output=True,check=True)
        assert json.loads(again.stdout)['archived_this_run'] == 0
        results.append({'plane':plane,'test':'commit and idempotent rerun','passed':True,'archived':len(plan['rows'])})
        immutable = subprocess.run(command,input="BEGIN; DELETE FROM ops.job_execution_duplicate_archive; COMMIT;",text=True,capture_output=True)
        assert immutable.returncode != 0 and 'append-only' in immutable.stderr
        results.append({'plane':plane,'test':'archive immutability','passed':True})
        # Reconstruct the exact original rows to prove rollback data is complete, then discard the rehearsal.
        restore = subprocess.run(command,input="""BEGIN;
          INSERT INTO ops.job_execution SELECT (jsonb_populate_record(NULL::ops.job_execution, original_row)).* FROM ops.job_execution_duplicate_archive;
          SELECT count(*) FROM ops.job_execution_duplicate_archive a JOIN ops.job_execution e ON e.id=a.execution_id WHERE to_jsonb(e)=a.original_row;
          ROLLBACK;""",text=True,capture_output=True,check=True)
        assert int(restore.stdout.strip()) == len(plan['rows'])
        results.append({'plane':plane,'test':'exact-row restoration and rollback','passed':True})
        audit = subprocess.run(command,input=(root/'audit.sql').read_text(),text=True,capture_output=True,check=True)
        assert json.loads(audit.stdout)['duplicate_groups'] == 0
        results.append({'plane':plane,'test':'post-repair zero duplicates','passed':True})
    print(json.dumps({'container':args.container,'tests':results,'passed':len(results)},indent=2))


if __name__ == '__main__':
    main()
