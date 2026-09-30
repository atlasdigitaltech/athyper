#!/usr/bin/env python3
"""Summarize raw benchmark receipts without treating intentional faults as successes."""
import json
import math
from pathlib import Path
import re
import statistics
import sys


def percentile(values, p):
    ordered=sorted(v for v in values if v is not None)
    return ordered[max(0, math.ceil(len(ordered)*p)-1)] if ordered else None


def metrics(rows):
    good=[r for r in rows if r.get('ok')]
    rates=[r['throughput'] for r in good if r.get('throughput') is not None]
    ttfts=[r['ttftMs'] for r in good if r.get('ttftMs') is not None]
    return {'requests':len(rows),'successful':len(good),
            'qualityPassed':sum(r.get('qualityPassed',False) for r in rows),
            'ttftMedianMs':statistics.median(ttfts) if ttfts else None,
            'ttftP95Ms':percentile([r.get('ttftMs') for r in good],.95),
            'totalP50Ms':percentile([r['totalMs'] for r in good],.5),
            'totalP95Ms':percentile([r['totalMs'] for r in good],.95),
            'medianOutputTokensPerSecond':statistics.median(rates) if rates else None,
            'outputTokens':sum(r.get('terminal',{}).get('eval_count',0) for r in good)}


def summarize(directory):
    path=Path(directory)
    meta=json.loads((path/'metadata.json').read_text())
    events=[json.loads(x) for x in (path/'requests.jsonl').read_text().splitlines()]
    samples=[json.loads(x) for x in (path/'monitor.jsonl').read_text().splitlines()]
    requests=[r for r in events if r['type']=='request']
    categories=sorted({r['category'] for r in requests})
    groups={c:metrics([r for r in requests if r['category']==c]) for c in categories}
    normal=[r for r in requests if r['category'] in ('warm-short','business-summary','multi-turn','structured-json','input-scaling','output-limit','tool-call','tool-followup','tool-negative')]
    readiness={}
    for sample in samples:
        for name,r in sample.get('readiness',{}).items():
            bucket=readiness.setdefault(name,{'samples':0,'non200':0,'baselineNon200':0,'baselineLatencyMs':[],'activeLatencyMs':[],'postLatencyMs':[]})
            bucket['samples']+=1;bucket['non200']+=r['status']!=200
            if sample['phase']=='baseline':bucket['baselineNon200']+=r['status']!=200
            if r['status']==200 and r.get('ms') is not None:
                bucket['baselineLatencyMs' if sample['phase']=='baseline' else 'postLatencyMs' if sample['phase']=='post-run' else 'activeLatencyMs'].append(r['ms'])
    for value in readiness.values():
        for key in ('baselineLatencyMs','activeLatencyMs','postLatencyMs'):
            values=value.pop(key);value[key.replace('LatencyMs','P95Ms')]=percentile(values,.95)
    gpu=[s['gpu']['usedMiB'] for s in samples if 'gpu'in s]
    ram=[s['containerMemory']['currentBytes'] for s in samples if 'containerMemory'in s]
    cgroup_peak=[s['containerMemory']['peakBytes'] for s in samples if 'containerMemory'in s]
    oom=max((s['containerMemory']['events'].get('oom',0) for s in samples if 'containerMemory'in s),default=0)
    oomkill=max((s['containerMemory']['events'].get('oom_kill',0) for s in samples if 'containerMemory'in s),default=0)
    log=(path/'inference.log').read_text()
    offloads=[list(map(int,m)) for m in re.findall(r'offloaded (\d+)/(\d+) layers to GPU',log)]
    changes=[]
    after={x['name']:x for x in meta['after']}
    for old in meta['before']:
        if old['name']=='athyper-dev-atlas-atlas-inference-1':continue
        new=after.get(old['name'])
        if not new or any(new[k]!=old[k] for k in ('status','health','oomKilled','startedAt')):changes.append({'before':old,'after':new})
    cancel=[r for r in events if r['type']=='cancellation']
    warm=groups.get('warm-short',{})
    normal_metrics=metrics(normal)
    complete=meta.get('clientExit')==0 and any(r['type']=='complete' for r in events)
    gates={
      'warmShortTtft':warm.get('successful',0)>=30 and warm.get('ttftP95Ms',float('inf'))<=5000,
      'outputThroughput':(normal_metrics.get('medianOutputTokensPerSecond') or 0)>=15,
      'gpuOffload':bool(offloads) and all(a==b and b>0 for a,b in offloads),
      'noMemoryFailures':oom==0 and oomkill==0 and not any(x['oomKilled'] for x in meta['after']),
      'cancellation':len(cancel)>=3 and all(r.get('passed') for r in cancel),
      'existingReadiness':len(readiness)==8 and not meta.get('monitorError') and all(r['non200']==0 and r['samples']>=20 and r['baselineP95Ms'] is not None and r['postP95Ms'] is not None for r in readiness.values()) and not changes,
      'runComplete':complete,
    }
    output={'schema':'atlas-benchmark-summary/1','sourceDirectory':str(path),'startedAt':meta['startedAt'],'endedAt':meta['endedAt'],
            'config':meta['config'],'fixtureSha256':meta['clientSha256'],'gpu':meta['gpu'],'coldDefinition':meta['coldDefinition'],
            'percentileMethod':'nearest rank','groups':groups,'normal':normal_metrics,'gates':gates,
            'memory':{'sampleCount':len(samples),'devicePeakUsedMiB':max(gpu),'deviceBaselineUsedMiB':samples[0].get('gpu',{}).get('usedMiB'),
                      'containerPeakSampleBytes':max(ram),'containerCgroupPeakBytes':max(cgroup_peak),'oomMax':oom,'oomKillMax':oomkill,
                      'hostMinimumAvailableKiB':min(s['hostMemoryKiB']['MemAvailable'] for s in samples)},
            'offloadLayers':offloads,'loadedModelSamples':[r for r in events if r['type'] in ('gpu-offload','complete')],
            'readiness':readiness,'otherContainerChanges':changes,'cancellation':cancel,
            'faultTests':[r for r in events if r['type'] in ('queued-cancellation','saturation','cold-saturation','interrupted-stream','interruption-process-recovery')],
            'inputScaling':[{k:r.get(k) for k in ('id','inputChars','ttftMs','totalMs','terminal')} for r in requests if r['category']=='input-scaling'],
            'truncationLogLines':[line for line in log.splitlines() if 'truncat' in line.lower() and not 'truncated = 0' in line],
            'unexpectedRequestFailures':[r for r in requests if not r['ok']],
            'qualityFailures':[r['id'] for r in requests if not r.get('qualityPassed')],
            'qualification':'Conditional: suitable for local integration development only; enforce application queue admission and context budgets before enabling shared chat.'}
    (path/'summary.json').write_text(json.dumps(output,indent=2)+'\n')
    return output


if __name__=='__main__':
    summary=summarize(sys.argv[1]); print(json.dumps({k:summary[k] for k in ('sourceDirectory','gates','groups','memory','qualityFailures')},indent=2))
