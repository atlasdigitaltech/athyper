#!/usr/bin/env python3
"""Execute the audited SQL plan through a Docker PostgreSQL client; defaults to rollback."""
import argparse
import json
from pathlib import Path
import subprocess
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', required=True)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    if plan['database'] not in ('athyper_studio', 'athyper_neon', 'athyper_mesh'):
        raise ValueError('Plan must name a physical application database')
    for row in plan['rows']:
        uuid.UUID(row['duplicate_id'])
        uuid.UUID(row['canonical_id'])
        for key in ('duplicate_fingerprint', 'canonical_fingerprint'):
            if len(row[key]) != 32 or any(c not in '0123456789abcdef' for c in row[key]):
                raise ValueError('Invalid audited row fingerprint')
    sql = Path(__file__).with_name('repair.sql').read_text()
    result = subprocess.run([
        'docker', 'exec', '-i', args.container, 'psql', '-XqAt', '-U', 'postgres', '-d', plan['database'],
        '-v', 'ON_ERROR_STOP=1', '-v', f"expected_database={plan['database']}", '-v', f"repair_id={plan['repair_id']}",
        '-v', f"repair_plan={json.dumps(plan['rows'], separators=(',', ':'))}", '-v', f"apply={'true' if args.apply else 'false'}",
    ], input=sql, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr)
    # Output only a successfully completed transaction's receipt, never snapshots or credentials.
    print(result.stdout.strip())


if __name__ == '__main__':
    main()
