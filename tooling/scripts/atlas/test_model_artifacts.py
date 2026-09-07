import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('artifacts', Path(__file__).with_name('model-artifacts.py'))
artifacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifacts)


class ArtifactVerificationTests(unittest.TestCase):
    def test_digest_formats(self):
        value = 'a' * 64
        self.assertEqual(artifacts.digest(value), 'sha256:' + value)
        self.assertEqual(artifacts.digest('sha256:' + value), 'sha256:' + value)
        for invalid in ['abcd', 'sha256:abcd', '../blob', None]:
            with self.assertRaises(ValueError):
                artifacts.digest(invalid)

    def check_archive(self, mode):
        manifest, blob = b'manifest', b'weights'
        blob_digest = 'sha256:' + hashlib.sha256(blob).hexdigest()
        manifest_path = 'models/manifests/registry.ollama.ai/library/qwen3/8b'
        blob_path = 'models/blobs/' + blob_digest.replace(':', '-')
        lock = {'model': {'manifestPath': manifest_path,
                         'digest': 'sha256:' + hashlib.sha256(manifest).hexdigest(),
                         'manifest': {'config': {'digest': blob_digest}, 'layers': []}}}
        entries = [(manifest_path, manifest), (blob_path, blob)]
        if mode == 'corrupt':
            entries[-1] = (blob_path, b'changed')
        elif mode == 'missing':
            entries.pop()
        elif mode == 'traversal':
            entries.append(('../outside', b'bad'))
        elif mode == 'duplicate':
            entries.append(entries[-1])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'models.tar'
            with tarfile.open(path, 'w') as archive:
                for name, data in entries:
                    member = tarfile.TarInfo(name)
                    member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
            artifacts.verify_archive(path, lock)

    def test_valid_artifacts(self):
        self.check_archive('valid')

    def test_corruption_missing_and_unsafe_archives(self):
        for mode in ['corrupt', 'missing', 'traversal', 'duplicate']:
            with self.subTest(mode=mode), self.assertRaises(RuntimeError):
                self.check_archive(mode)


if __name__ == '__main__':
    unittest.main()
