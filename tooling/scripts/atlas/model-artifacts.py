#!/usr/bin/env python3
"""Acquire, lock, archive and verify local Atlas artifacts; never prune serving data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import uuid
from datetime import datetime, timezone

REPO = Path(__file__).resolve().parents[3]
CONFIG = REPO / 'deploy/config/atlas/local-inference.json'
LOCK = REPO / 'deploy/config/atlas/model-lock.json'
SERVICE = 'athyper-dev-atlas-atlas-inference-1'
API = 'athyper-dev-api-1'
NETWORK = 'athyper-dev-atlas_inference'


def run(*args, capture=False, **kwargs):
    return subprocess.run(list(args), check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, **kwargs).stdout


def docker(*args, **kwargs):
    return run('docker', *args, **kwargs)


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    # Preserve inode: the API bind-mounts the configuration file.
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def digest(value):
    if not re.fullmatch(r'(sha256:)?[a-f0-9]{64}', value or ''):
        raise ValueError('Full SHA-256 digest required')
    return 'sha256:' + value.removeprefix('sha256:')


def api(path, body=None, host='atlas-inference'):
    script = '''const [host,path,body]=process.argv.slice(1);
const r=await fetch(`http://${host}:11434${path}`,{signal:AbortSignal.timeout(180000),
...(body?{method:'POST',headers:{'Content-Type':'application/json'},body}: {})});
if(!r.ok)throw Error(`HTTP ${r.status}: ${await r.text()}`);
console.log(await r.text());'''
    return json.loads(docker('exec', API, 'node', '--input-type=module', '-e',
                             script, host, path, json.dumps(body) if body else '', capture=True))


def compose(bootstrap=False):
    config = read(CONFIG)
    args = ['compose', '-p', 'athyper-dev-atlas', '-f', str(REPO / 'deploy/compose/atlas/compose.yaml')]
    if bootstrap:
        args += ['-f', str(REPO / 'deploy/compose/atlas/compose.bootstrap.yaml')]
    docker(*args, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'atlas-inference',
           env={**os.environ, 'ATLAS_OLLAMA_IMAGE': config['engine']['image']})


def acquire():
    if LOCK.exists() or read(CONFIG)['model']['digest']:
        raise RuntimeError('Existing pin must not be silently replaced; review a model upgrade explicitly')
    try:
        compose(True)
        docker('exec', SERVICE, 'ollama', 'pull', read(CONFIG)['model']['upstream'])
        record()
    finally:
        compose(False)


def record():
    config = read(CONFIG)
    model = next(m for m in api('/api/tags')['models'] if m['name'] == config['model']['upstream'])
    full_digest = digest(model['digest'])
    if LOCK.exists() and read(LOCK)['model']['digest'] != full_digest:
        raise RuntimeError('Refusing to overwrite an existing model pin')
    if config['model']['digest'] and config['model']['digest'] != full_digest:
        raise RuntimeError('Installed artifact differs from configuration pin')
    if api('/api/version')['version'] != config['engine']['version']:
        raise RuntimeError('Engine version mismatch')
    show = api('/api/show', {'model': model['name']})
    details = show['details']
    if (details.get('family') != 'qwen3' or details.get('format') != 'gguf'
            or details.get('quantization_level') != 'Q4_K_M'
            or not 8 <= float(details.get('parameter_size', '0B').removesuffix('B')) < 9
            or not show.get('template') or not show.get('license')):
        raise RuntimeError('Unexpected model family, size, quantization, template or license')
    engine = json.loads(docker('image', 'inspect', config['engine']['image'], capture=True))[0]
    if config['engine']['image'] not in engine['RepoDigests']:
        raise RuntimeError('Engine digest mismatch')
    manifest_path = 'models/manifests/registry.ollama.ai/library/qwen3/8b'
    raw = docker('exec', SERVICE, 'cat', '/root/.ollama/' + manifest_path, capture=True)
    if 'sha256:' + hashlib.sha256(raw.encode()).hexdigest() != full_digest:
        raise RuntimeError('Manifest bytes do not match API digest')
    manifest = json.loads(raw)
    blobs = [manifest['config'], *manifest['layers']]
    for blob in blobs:
        expected = digest(blob['digest'])
        path = '/root/.ollama/models/blobs/' + expected.replace(':', '-')
        actual = docker('exec', SERVICE, 'sha256sum', path, capture=True).split()[0]
        if digest(actual) != expected:
            raise RuntimeError('Corrupt model blob: ' + expected)
    config['model']['digest'] = full_digest
    write(CONFIG, config)
    lock = {
        'schema': 'atlas-model-lock/1',
        'acquiredAt': datetime.now(timezone.utc).isoformat(),
        'configurationRevision': {
            'gitHead': run('git', '-C', str(REPO), 'rev-parse', 'HEAD', capture=True).strip(),
            'workingTreeDirty': bool(run('git', '-C', str(REPO), 'status', '--porcelain', capture=True).strip()),
            'configSha256': sha(CONFIG),
        },
        'engine': {**config['engine'], 'imageId': engine['Id'], 'platform': engine['Os'] + '/' + engine['Architecture']},
        'model': {**config['model'], 'sizeBytes': model['size'], 'details': show['details'],
                  'capabilities': show.get('capabilities', []), 'modelInfo': show.get('model_info', {}),
                  'manifestPath': manifest_path, 'manifest': manifest,
                  'template': show['template'], 'templateSha256': hashlib.sha256(show['template'].encode()).hexdigest(),
                  'licenseReference': 'https://huggingface.co/Qwen/Qwen3-8B/blob/main/LICENSE',
                  'license': show.get('license'), 'parameters': show.get('parameters')},
        'request': config['request'], 'cloudEnabled': False,
    }
    write(LOCK, lock)
    print(json.dumps({'modelDigest': full_digest, 'details': show['details'], 'blobsVerified': len(blobs)}))


def verify_archive(path, lock):
    """Hash every required artifact from the tar stream before it is restored."""
    model = lock['model']
    expected = {model['manifestPath']: model['digest']}
    for blob in [model['manifest']['config'], *model['manifest']['layers']]:
        expected['models/blobs/' + blob['digest'].replace(':', '-')] = digest(blob['digest'])
    seen = set()
    with tarfile.open(path, 'r|') as archive:
        for member in archive:
            name = member.name
            if name.startswith('/') or '..' in Path(name).parts or not (member.isfile() or member.isdir()):
                raise RuntimeError('Unsafe archive entry: ' + name)
            if name in expected:
                if name in seen:
                    raise RuntimeError('Duplicate artifact: ' + name)
                actual = 'sha256:' + hashlib.file_digest(archive.extractfile(member), 'sha256').hexdigest()
                if actual != expected[name]:
                    raise RuntimeError('Artifact checksum mismatch: ' + name)
                seen.add(name)
    if seen != set(expected):
        raise RuntimeError('Archive missing required model artifacts')


def backup(directory):
    target = Path(directory).expanduser().resolve()
    if target.is_relative_to(REPO):
        raise RuntimeError('Artifact backups must live outside Git')
    target.mkdir(parents=True, exist_ok=False, mode=0o700)
    config, lock = read(CONFIG), read(LOCK)
    if sha(CONFIG) != lock['configurationRevision']['configSha256']:
        raise RuntimeError('Configuration changed after locking')
    # Only models; exclude Ollama installation identity/private keys.
    with (target / 'models.tar').open('wb') as out:
        subprocess.run(['docker', 'exec', SERVICE, 'tar', '-C', '/root/.ollama', '-cf', '-', 'models'], stdout=out, check=True)
    verify_archive(target / 'models.tar', lock)
    docker('image', 'save', '-o', str(target / 'ollama-image.tar'), config['engine']['image'])
    for name, source in [('model-lock.json', LOCK), ('local-inference.json', CONFIG)]:
        (target / name).write_bytes(source.read_bytes())
    checks = {name: sha(target / name) for name in ['models.tar', 'ollama-image.tar', 'model-lock.json', 'local-inference.json']}
    write(target / 'checksums.json', checks)
    print('Backup verified: ' + str(target), flush=True)


def restore_test(directory):
    target = Path(directory).expanduser().resolve()
    checks = read(target / 'checksums.json')
    required = {'models.tar', 'ollama-image.tar', 'model-lock.json', 'local-inference.json'}
    if set(checks) != required:
        raise RuntimeError('Incomplete backup checksums')
    for name, expected in checks.items():
        if sha(target / name) != expected:
            raise RuntimeError('Backup checksum mismatch: ' + name)
    lock, config = read(target / 'model-lock.json'), read(target / 'local-inference.json')
    if sha(target / 'local-inference.json') != lock['configurationRevision']['configSha256']:
        raise RuntimeError('Backup config does not match lock')
    verify_archive(target / 'models.tar', lock)
    docker('image', 'load', '-i', str(target / 'ollama-image.tar'))
    image = lock['engine']['imageId']
    unique = 'atlas-restore-' + uuid.uuid4().hex[:12]
    volume = unique + '-models'
    docker('volume', 'create', volume)
    try:
        # Import has no network; serving joins only the existing internal network.
        with (target / 'models.tar').open('rb') as source:
            subprocess.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '-i',
                            '-v', volume + ':/restore', '--entrypoint', '/bin/tar', image,
                            '-C', '/restore', '-xf', '-'], stdin=source, check=True)
        docker('run', '-d', '--pull=never', '--name', unique, '--network', NETWORK,
               '--gpus', 'all', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
               '--memory', '10g', '--cpus', '4', '-v', volume + ':/root/.ollama',
               '-e', 'OLLAMA_NO_CLOUD=1', '-e', 'OLLAMA_CONTEXT_LENGTH=4096',
               '-e', 'OLLAMA_NUM_PARALLEL=1', '-e', 'OLLAMA_MAX_LOADED_MODELS=1', image)
        for _ in range(30):
            try:
                version = api('/api/version', host=unique)
                break
            except subprocess.CalledProcessError:
                time.sleep(1)
        else:
            raise RuntimeError('Restored engine did not start')
        if version['version'] != lock['engine']['version']:
            raise RuntimeError('Restored engine version mismatch')
        installed = next(m for m in api('/api/tags', host=unique)['models'] if m['name'] == config['model']['upstream'])
        if digest(installed['digest']) != lock['model']['digest']:
            raise RuntimeError('Restored model digest mismatch')
        body = {'model': config['model']['upstream'], 'stream': False, 'think': False,
                'messages': [{'role': 'user', 'content': 'What is 2 + 2? Reply with only the number.'}],
                'options': {'num_ctx': config['request']['num_ctx'], 'num_predict': config['request']['num_predict']},
                'keep_alive': 0}
        answer = api('/api/chat', body, unique)
        if not answer.get('done') or answer.get('model') != config['model']['upstream'] or answer.get('message', {}).get('content', '').strip() != '4' or answer.get('message', {}).get('thinking', '').strip():
            raise RuntimeError('Offline generation probe failed: ' + json.dumps(answer))
        container = json.loads(docker('inspect', unique, capture=True))[0]
        network = json.loads(docker('network', 'inspect', NETWORK, capture=True))[0]
        if not network['Internal'] or list(container['NetworkSettings']['Networks']) != [NETWORK] or container['HostConfig']['PortBindings']:
            raise RuntimeError('Restore isolation violated')
        receipt = {'verifiedAt': datetime.now(timezone.utc).isoformat(), 'modelDigest': digest(installed['digest']),
                   'imageId': container['Image'], 'engineVersion': version['version'],
                   'disposableVolume': volume, 'privateNetwork': NETWORK, 'internalNetwork': True,
                   'publishedPorts': False, 'imagePullPolicy': 'never', 'modelPullPerformed': False,
                   'request': body, 'response': answer, 'backupChecksums': checks}
        write(target / 'restore-receipt.json', receipt)
        print(json.dumps({'offlineRestorePassed': True, 'answer': answer['message']['content'], 'modelDigest': receipt['modelDigest']}))
    finally:
        subprocess.run(['docker', 'rm', '-f', unique], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        docker('volume', 'rm', volume)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['acquire', 'record', 'backup', 'restore-test'])
    parser.add_argument('directory', nargs='?')
    args = parser.parse_args()
    if args.command in ('backup', 'restore-test') and not args.directory:
        parser.error('directory required')
    {'acquire': acquire, 'record': record,
     'backup': lambda: backup(args.directory), 'restore-test': lambda: restore_test(args.directory)}[args.command]()


if __name__ == '__main__':
    main()
