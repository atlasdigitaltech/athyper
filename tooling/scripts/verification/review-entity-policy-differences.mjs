import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assessDifferences,sha256} from './entity-authorization/policy-differences.mjs';
const [ledgerPath,output,...flags]=process.argv.slice(2);
if(!ledgerPath||!output)throw Error('Usage: review-entity-policy-differences.mjs <ledger.json> <report.json> [--require-resolved]');
if(flags.some(f=>f!=='--require-resolved'))throw Error('Unknown option');
const read=path=>readFileSync(path,'utf8'), ledger=JSON.parse(read(ledgerPath));
const syntheticBytes=read(ledger.sources.synthetic),liveBytes=read(ledger.sources.live);
if([ledgerPath,...Object.values(ledger.sources)].some(p=>resolve(p)===resolve(output)))throw Error('Output must not overwrite review/source evidence');
const regressionHashes={};
for(const d of ledger.dispositions)for(const r of d.regressions??[])try{regressionHashes[r.path]=sha256(read(r.path));}catch{/* Missing evidence keeps gate closed. */}
const report=assessDifferences({synthetic:JSON.parse(syntheticBytes),live:JSON.parse(liveBytes),ledger,sourceHashes:{synthetic:sha256(syntheticBytes),live:sha256(liveBytes)},regressionHashes});
writeFileSync(output,JSON.stringify({...report,generatedAt:new Date().toISOString(),sources:ledger.sources},null,2)+'\n');
console.log(JSON.stringify({output,rawDifferenceGroups:report.rawDifferenceGroups,unresolvedDifferences:report.unresolvedDifferences,policyDifferenceGateSatisfied:report.policyDifferenceGateSatisfied,activationEligible:false}));
if(flags.includes('--require-resolved')&&!report.policyDifferenceGateSatisfied)process.exitCode=2;
