"""Compatibility entry for the unchanged, hashed review release's gate command.

New callers use tooling/scripts/metadata/verify_live_schema.py directly.
This contains no metadata definitions and does not bypass the live schema gate.
"""
import runpy
from pathlib import Path

repository = next(p for p in Path(__file__).resolve().parents if (p / 'server/db/ddl').is_dir())
runpy.run_path(str(repository / 'tooling/scripts/metadata/verify_live_schema.py'), run_name='__main__')
