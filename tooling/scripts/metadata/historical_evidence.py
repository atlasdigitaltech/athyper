"""Verify frozen bytes without recreating removed SQL or modifying its receipt."""
import hashlib
import subprocess
from pathlib import Path


def verify_evidence(repository, source):
    repository = Path(repository).resolve()
    path = source['path']
    parts = Path(path).parts
    if not parts or Path(path).is_absolute() or '..' in parts or not path.endswith('.sql'):
        raise AssertionError('Invalid DDL evidence path')
    current = repository / path
    if not current.resolve().is_relative_to(repository):
        raise AssertionError('Escaping DDL evidence path')
    expected = source['sha256']
    if current.is_file() and hashlib.sha256(current.read_bytes()).hexdigest() == expected:
        return {'path': path, 'sha256': expected, 'status': 'current'}
    commits = subprocess.run(['git', '-C', str(repository), 'log', '--all', '--format=%H', '--', path], capture_output=True, text=True, check=True).stdout.splitlines()
    for commit in commits:
        for revision in [commit, commit + '^']:
            result = subprocess.run(['git', '-C', str(repository), 'show', revision + ':' + path], capture_output=True)
            if result.returncode == 0 and hashlib.sha256(result.stdout).hexdigest() == expected:
                pinned = subprocess.run(['git', '-C', str(repository), 'rev-parse', revision], capture_output=True, text=True, check=True).stdout.strip()
                return {'path': path, 'sha256': expected, 'status': 'historical_only', 'revision': pinned}
    raise AssertionError(f'DDL evidence unavailable or hash unmatched: {path}; recapture reviewed current evidence')
