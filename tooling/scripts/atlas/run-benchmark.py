#!/usr/bin/env python3
"""Run synthetic GPU qualification; interrupts only the isolated inference service."""
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import threading
import time

REPO = Path(__file__).resolve().parents[3]
SERVICE = 'athyper-dev-atlas-atlas-inference-1'
API = 'athyper-dev-api-1'
CLIENT = Path(__file__).with_name('benchmark-client.mjs')


def command(args, timeout=15):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return {'exit': r.returncode, 'stdout': r.stdout.strip(), 'stderr': r.stderr.strip()[:500]}


def stamp():
    return datetime.now(timezone.utc).isoformat()


def snapshot():
    names = command(['docker', 'ps', '-a', '--format', '{{.Names}}'])['stdout'].splitlines()
    results = []
    for name in names:
        if not name.startswith('athyper-'):
            continue
        data = command(['docker', 'inspect', '--format', '{{json .State}}', name])
        state = json.loads(data['stdout'])
        # Do not capture configuration, secrets, or application logs.
        results.append({'name': name, 'status': state['Status'], 'oomKilled': state['OOMKilled'],
                        'health': state.get('Health', {}).get('Status'),
                        'startedAt': state['StartedAt']})
    return results


def monitor(output, stop, state):
    def readiness(plane, app):
        if app == 'api':
            script = 'const at=performance.now();try{const r=await fetch("http://127.0.0.1:4000/readyz",{signal:AbortSignal.timeout(4000)});console.log(JSON.stringify({status:r.status,ms:performance.now()-at}));}catch(e){console.log(JSON.stringify({status:0,ms:performance.now()-at,error:String(e)}));}'
            value = command(['docker', 'exec', f'athyper-{plane}-api-1', 'node', '--input-type=module', '-e', script])
            try:
                result = json.loads(value['stdout'])
            except ValueError:
                result = {'status': 0, 'error': value}
        else:
            # Development certificate is self-signed. This checks availability, not TLS trust.
            value = command(['curl', '-k', '-sS', '--resolve', f'{app}.{plane}.athyper.test:443:127.0.0.1', '--max-time', '4', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', f'https://{app}.{plane}.athyper.test/readyz'])
            fields = value['stdout'].split()
            result = {'status': int(fields[0]) if fields else 0, 'ms': float(fields[1])*1000 if len(fields)>1 else None}
        return plane + '-' + app, result
    with output.open('w') as f, concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        count = 0
        while not stop.is_set():
            at = time.monotonic()
            record = {'at': stamp(), 'phase': state['phase']}
            gpu = command(['/usr/lib/wsl/lib/nvidia-smi', '--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'])
            try:
                used, total, utilization = map(float, gpu['stdout'].split(','))
                record['gpu'] = {'usedMiB': used, 'totalMiB': total, 'utilizationPercent': utilization}
            except ValueError:
                record['gpuError'] = gpu
            memory = command(['docker', 'exec', SERVICE, 'sh', '-c', 'cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events'])
            if memory['exit'] == 0:
                lines = memory['stdout'].splitlines()
                record['containerMemory'] = {'currentBytes': int(lines[0]), 'peakBytes': int(lines[1]), 'events': dict((k, int(v)) for k,v in (x.split() for x in lines[2:]))}
            else:
                record['containerUnavailable'] = True
            record['hostMemoryKiB'] = {k:int(v.split()[0]) for k,v in (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines()) if k in ('MemTotal','MemAvailable')}
            if count % 2 == 0:
                jobs = [pool.submit(readiness, plane, app) for plane in ('dev','qa') for app in ('api','neon','mesh','studio')]
                record['readiness'] = dict(job.result() for job in jobs)
            f.write(json.dumps(record)+'\n'); f.flush()
            count += 1
            stop.wait(max(0, 1-(time.monotonic()-at)))


def main():
    target = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else Path.home()/'.athyper/instances/dev/receipts/atlas-benchmark'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target.mkdir(parents=True, exist_ok=False, mode=0o700)
    (target/'fixture-client.mjs').write_bytes(CLIENT.read_bytes())
    (target/'runner.py').write_bytes(Path(__file__).read_bytes())
    config = REPO/'deploy/config/atlas/local-inference.json'
    metadata = {'startedAt': stamp(), 'config':json.loads(config.read_text()),
                'clientSha256':hashlib.sha256(CLIENT.read_bytes()).hexdigest(),
                'configSha256':hashlib.sha256(config.read_bytes()).hexdigest(),
                'gitHead':command(['git','-C',str(REPO),'rev-parse','HEAD'])['stdout'],
                'gpu':command(['/usr/lib/wsl/lib/nvidia-smi','--query-gpu=name,driver_version,memory.total','--format=csv,noheader'])['stdout'],
                'coldDefinition':'Inference engine restarted and model unloaded; host filesystem and driver caches retained.',
                'readinessTls':'Local public readiness probes use curl -k for the self-signed certificate and --resolve to the existing localhost ingress, avoiding missing QA host aliases.',
                'before':snapshot()}
    (target/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    stop=threading.Event();state={'phase':'baseline'}
    def monitored():
        try:
            monitor(target/'monitor.jsonl', stop, state)
        except Exception as error:
            metadata['monitorError'] = str(error)
    thread=threading.Thread(target=monitored,daemon=True);thread.start()
    print('Results: '+str(target),flush=True)
    client=None
    try:
        time.sleep(15)
        state['phase']='cold-restart'
        restart=command(['docker','restart','--time','1',SERVICE],timeout=30)
        if restart['exit']:
            raise RuntimeError(restart)
        # Wait for process health, never warm the model here.
        for _ in range(60):
            r=command(['docker','exec',SERVICE,'ollama','list'])
            if r['exit']==0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Cold restart did not recover')
        state['phase']='benchmark'
        client=subprocess.Popen(['docker','exec','-i',API,'node','--input-type=module'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(target/'client-stderr.log').open('w'),text=True)
        client.stdin.write(CLIENT.read_text());client.stdin.close()
        with (target/'requests.jsonl').open('w') as f:
            for line in client.stdout:
                f.write(line);f.flush()
                event=json.loads(line)
                if event['type']=='interrupt-now':
                    state['phase']='intentional-inference-interruption'
                    stopped=command(['docker','stop','--time','1',SERVICE],timeout=30)
                    time.sleep(3)
                    started=command(['docker','start',SERVICE],timeout=30)
                    metadata['interruptionCommands']={'stop':stopped,'start':started}
                print(json.dumps({k:event[k] for k in ('type','id','category','ok','ttftMs','totalMs','qualityPassed','rejected','passed','error') if k in event}),flush=True)
                if event['type']=='interruption-process-recovery':
                    state['phase']='recovery'
        metadata['clientExit']=client.wait(timeout=30)
    finally:
        if client and client.poll() is None:
            client.terminate()
        # Restore the service after any interrupted run; preserve its volume.
        command(['docker','start',SERVICE],timeout=30)
        state['phase']='post-run'
        time.sleep(15)
        stop.set();thread.join(timeout=30)
        metadata['endedAt']=stamp();metadata['after']=snapshot()
        metadata['inferenceLogs']= 'inference.log'
        logs=command(['docker','logs','--since',metadata['startedAt'],SERVICE],timeout=20)
        (target/'inference.log').write_text(logs['stdout']+'\n'+subprocess.run(['docker','logs','--since',metadata['startedAt'],SERVICE],capture_output=True,text=True).stderr)
        (target/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    if metadata.get('clientExit')!=0:
        raise RuntimeError('Benchmark did not complete; review receipts')


if __name__=='__main__':
    main()
