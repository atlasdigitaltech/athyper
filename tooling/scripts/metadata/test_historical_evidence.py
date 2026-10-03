import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from historical_evidence import verify_evidence


class HistoricalEvidenceTests(unittest.TestCase):
    def test_current_and_removed_bytes_keep_original_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            def git(*args):
                return subprocess.run(['git', '-C', directory, *args], check=True, capture_output=True, text=True).stdout.strip()
            git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
            path = repo / 'captured.sql'; path.write_text('SELECT 1;\n')
            source = {'path': 'captured.sql', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            original = dict(source)
            self.assertEqual(verify_evidence(repo, source)['status'], 'current')
            git('add', 'captured.sql'); git('commit', '-m', 'Capture')
            revision = git('rev-parse', 'HEAD')
            path.unlink(); git('add', '-u'); git('commit', '-m', 'Retire')
            receipt = verify_evidence(repo, source)
            self.assertEqual(receipt['status'], 'historical_only')
            self.assertEqual(receipt['revision'], revision)
            self.assertEqual(source, original)
            self.assertFalse(path.exists())
            with self.assertRaisesRegex(AssertionError, 'hash unmatched'):
                verify_evidence(repo, {**source, 'sha256': '0' * 64})

    def test_rejects_escaping_and_non_sql_paths(self):
        for path in ['../captured.sql', '/captured.sql', 'captured.json']:
            with self.assertRaisesRegex(AssertionError, 'Invalid DDL evidence path'):
                verify_evidence('.', {'path': path, 'sha256': '0' * 64})

if __name__ == '__main__': unittest.main()
