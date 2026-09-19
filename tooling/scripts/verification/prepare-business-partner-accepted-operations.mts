import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseEntityRuntimeDescriptor } from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEntityAuthorizationProfile } from '../../../server/packages/contracts/metadata/src/entity-authorization.js';
// @ts-expect-error Local verification module is exercised by its independent Node tests.
import { selectAcceptedOperations } from './entity-authorization/accepted-operation-selection.mjs';
if (process.argv.length !== 2) throw Error('This DEV preparation command accepts no apply or grant options');
// The existing capture uses repeatable read and rechecks heads/catalog before returning.
execFileSync('pnpm', ['exec', 'tsx', 'tooling/scripts/verification/prepare-entity-authorization-publication.mts',
  'dev', '44444444-4444-4444-8444-444444444444',
  'packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json',
  'governance/config/governance/business-partner-authorization-bindings.v1.json',
  'governance/policy/reports/business-partner-activation-publication.dev.json'], { stdio:'inherit' });
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const packet = read('governance/policy/reviews/business-partner-operation-workflow.dev.json');
const nominationBytes = readFileSync('governance/policy/reviews/business-partner-operation-reviewers.dev.json');
if (createHash('sha256').update(nominationBytes).digest('hex') !== packet.nominationSha256)
  throw Error('REVIEWER_NOMINATION_CHANGED');
const selection = selectAcceptedOperations({
  packet,
  exported:read('governance/policy/reports/business-partner-operation-decisions.dev.json'),
  state:read(join(homedir(), '.athyper/instances/dev/deployments/bp-operation-review-20260910/review/output/state.json')),
  candidate:read('governance/policy/reports/business-partner-activation-publication.dev.json'),
});
parseEntityAuthorizationProfile(selection.descriptor.authorization, {
  entityCode:selection.descriptor.entityCode, planeKey:selection.descriptor.planeKey,
  fields:selection.descriptor.fields.map((f: {key:string}) => f.key), operations:selection.descriptor.operations,
});
// Validate the full native descriptor; this is schema validation, not signed compilation.
parseEntityRuntimeDescriptor({ entity_code:selection.base.entityCode, plane_code:selection.base.planeKey,
  release_id:selection.base.releaseId, release_no:selection.base.releaseNo,
  entity_contract_hash:selection.base.contractHash, compiled_hash:selection.selectionSha256,
  compiled_json:selection.descriptor });
const path = 'governance/policy/reports/business-partner-accepted-operations.dev.json';
writeFileSync(path, JSON.stringify(selection,null,2)+'\n');
// Preserve the historical accepted selection and prepare a separate corrected candidate.
execFileSync('pnpm',['exec','tsx','tooling/scripts/verification/prepare-business-partner-corrected-release.mts'],{stdio:'inherit'});
const corrected = read('governance/policy/reports/business-partner-case-target-check.dev.json');
const catalog = read('governance/policy/reports/business-partner-activation-publication.dev.snapshot.json');
const missingCatalogPermissions = selection.permissionDefinitions.filter((p: {canonicalCode:string}) =>
  !catalog.permissions.some((installed: {code:string;status:string}) => installed.code === p.canonicalCode && installed.status === 'published'))
  .map((p: {canonicalCode:string}) => p.canonicalCode);
writeFileSync('governance/policy/reports/business-partner-accepted-operation-readiness.dev.json', JSON.stringify({
  schemaVersion:1, selectionSha256:selection.selectionSha256, packetRevision:selection.packetRevision,
  catalogCapturedAt:catalog.capturedAt, base:selection.base, nativeDescriptorParsing:'passed',
  runtimeCandidatePath:'governance/policy/reports/business-partner-corrected-release.dev.json',
  runtimeCandidateHash:corrected.selectionSha256, owningCaseSemantics:corrected.owningCaseSemantics,
  correctionReview:corrected.correctionReview,
  missingCatalogPermissions, dependencyBlocks:selection.dependencyBlocks,
  callableRuntimeRegistration:'not_qualified', signedArtifact:null,
  sameReleaseAuthenticatedQualification:'not_complete', policyDifferenceAcceptance:'separate_gate',
  grantChanges:[], activationAuthorized:false, publicationEligible:false,
}, null, 2)+'\n');
console.log({ path, dedicatedPermissions:selection.permissionDefinitions.length, retainedBindings:selection.bindings.filter((b:{catalogAction:string})=>b.catalogAction==='retain_catalog_entry').length, deferred:selection.deferredOperations.length, publicationEligible:false, grantChanges:0 });
