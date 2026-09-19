import {readFileSync,writeFileSync} from 'node:fs';
import {assessSuccessorDifferenceReview} from './entity-authorization/successor-difference-review.mjs';
const base='governance/policy/';
const proposal=JSON.parse(readFileSync(base+'reviews/business-partner-release-19-differences.proposal.dev.json'));
const acceptance=JSON.parse(readFileSync(base+'reviews/business-partner-release-19-differences.acceptance.dev.json'));
const report=assessSuccessorDifferenceReview({proposal,acceptance,readEvidence:path=>readFileSync(path)});
writeFileSync(base+'reports/business-partner-release-19-difference-acceptance.dev.json',JSON.stringify({...report,checkedAt:new Date().toISOString()},null,2)+'\n');
console.log({historicalRows:report.historicalRows,currentDifferenceGroups:report.currentDifferenceGroups,unresolvedReviewedDispositions:report.unresolvedReviewedDispositions,passed:report.reviewedDispositionGateSatisfied,errors:report.errors});
if(!report.reviewedDispositionGateSatisfied)process.exitCode=1;
