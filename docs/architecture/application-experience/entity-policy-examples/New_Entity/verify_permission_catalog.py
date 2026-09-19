"""Release gate: every descriptor permission must be published in target Neon."""
import json
import os
import subprocess
from pathlib import Path
from verify_live_schema import connection_environment

ROOT = Path(__file__).resolve().parent
URL = os.environ.get('NEON_SCHEMA_DATABASE_URL')
if not URL:
    raise SystemExit('NEON_SCHEMA_DATABASE_URL is required for the permission-catalog release gate')

def codes(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {'permissionCode', 'viewPermission', 'readPermissionCode'} and isinstance(item, str):
                yield item
            elif key == 'fieldPermissions' and isinstance(item, list):
                for code in item:
                    if not isinstance(code, str):
                        raise ValueError('fieldPermissions must contain strings')
                    yield code
            yield from codes(item)
    elif isinstance(value, list):
        for item in value:
            yield from codes(item)

expected = set()
for path in ROOT.rglob('*.json'):
    artifact = json.loads(path.read_text())
    if artifact.get('artifactType'):
        expected.update(codes(artifact))
sql = "SELECT canonical_code FROM authz.permission WHERE status='published' AND canonical_code = ANY(ARRAY[" + ','.join("'" + code.replace("'", "''") + "'" for code in sorted(expected)) + "])"
result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], env=connection_environment(URL), text=True, capture_output=True)
if result.returncode:
    raise SystemExit('Target permission catalog query failed; check database connectivity and catalog access.')
published = set(filter(None, result.stdout.splitlines()))
missing = sorted(expected - published)
if missing:
    raise SystemExit('Target permission catalog is incomplete: ' + ', '.join(missing))
print(f'PASS: {len(expected)} descriptor permissions are published in target Neon.')
