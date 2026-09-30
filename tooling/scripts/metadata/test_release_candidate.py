"""Focused checks for scoped compiled release candidates."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
REPOSITORY = TOOLS.parents[2]
CANDIDATE = REPOSITORY / 'metadata/products/mdg/review/release-candidates/business-partner-collaboration-ca08.json'


class ReleaseCandidateTests(unittest.TestCase):
    def run_validator(self, *arguments):
        return subprocess.run(
            [sys.executable, str(TOOLS / 'validate.py'), '--release-candidate', str(CANDIDATE), *arguments],
            cwd=REPOSITORY, text=True, capture_output=True,
        )

    def test_validates_the_explicit_collaboration_closure(self):
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Scoped candidate business-partner-collaboration-ca08 carries 93 pinned baseline artifacts and compiles 95 runtime artifacts', result.stdout)

    def test_compiles_the_same_closure_through_the_real_compiler(self):
        result = subprocess.run(
            ['pnpm', 'exec', 'tsx', 'tooling/scripts/metadata/compile-release-candidate.mts', '--candidate', str(CANDIDATE)],
            cwd=REPOSITORY, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report['sourceArtifactCount'], 26)
        self.assertEqual(report['artifactCount'], 95)
        self.assertEqual(report['carriedForwardArtifactCount'], 88)
        self.assertIn('platform.attachments.v1', report['externalDependencyClosure'])
        self.assertIn('platform.comments.v1', report['externalDependencyClosure'])
        with tempfile.TemporaryDirectory() as directory:
            emitted = subprocess.run(
                ['pnpm', 'exec', 'tsx', 'tooling/scripts/metadata/compile-release-candidate.mts', '--candidate', str(CANDIDATE), '--output', directory, '--publication-projection', 'true'],
                cwd=REPOSITORY, text=True, capture_output=True,
            )
            self.assertEqual(emitted.returncode, 0, emitted.stderr)
            release = json.loads((Path(directory) / 'entities' / 'release.json').read_text())
            profile = next(entry for entry in release['artifacts'] if entry['artifactKey'] == 'platform/core-field-defaults.v1')
            self.assertEqual(profile['ref'], 'platform/core-field-defaults.v1.json')

    def test_release_ready_requires_only_signature_and_approval_after_local_qualification(self):
        result = self.run_validator('--release-ready')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('release is unsigned review-only', result.stderr)
        self.assertIn('release has not been approved', result.stderr)
        self.assertNotIn('release runtime compatibility is not qualified', result.stderr)
        self.assertNotIn('compiled artifacts have not been approved', result.stderr)
        self.assertNotIn('handler:platform.attachments.rename.v1', result.stderr)
        self.assertNotIn('business_partner_request/flow.', result.stderr)


if __name__ == '__main__':
    unittest.main()
