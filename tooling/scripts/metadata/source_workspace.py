"""Python tooling bridge to the single offline JavaScript source resolver."""
import json
import subprocess
from pathlib import Path


def discover_workspace(metadata_root):
    result = subprocess.run(
        ['node', str(Path(__file__).with_name('source-workspace.mjs')), str(metadata_root)],
        text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise ValueError(result.stderr.strip())
    return json.loads(result.stdout)
