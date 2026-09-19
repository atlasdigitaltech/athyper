import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {hash, proposalHash} from './entity-authorization/named-role-review.mjs';
const read = path => JSON.parse(readFileSync(path));
const original = read('governance/policy/reviews/business-partner-operation-workflow.dev.json');
const currentPath = 'governance/policy/reports/business-partner-activation-publication.dev.json';
const current = read(currentPath);
if (proposalHash(current.base) !== proposalHash(original.source.base)) throw Error('IMPORT_REVIEW_ACTIVATION_HEAD_CHANGED');
if (hash(readFileSync('governance/policy/reviews/business-partner-operation-reviewers.dev.json')) !== original.nominationSha256) throw Error('IMPORT_REVIEW_NOMINATION_CHANGED');
const prior = original.rows.find(r => r.operation === 'import');
const implementationPaths = [
 'server/packages/services/master-data/src/business-partner-governed-import.ts',
 'server/packages/services/master-data/src/business-partner-request-service.ts',
 'server/packages/services/master-data/src/business-partner-request-validator.ts',
 'server/packages/contracts/master-data/src/business-partner-request-ports.ts',
 'server/apps/platform-host/src/composition/business-partner-import-runtime.ts',
];
const tests = [
 'server/packages/services/master-data/src/__tests__/business-partner-governed-import.test.ts',
 'server/apps/platform-host/src/composition/__tests__/business-partner-import-runtime.test.ts',
];
const proposal = {...prior.proposal,
 handler: {key: 'business_partner.import.governed_requests.v1', variant: 'supplier_request_drafts'},
 workflow: {...prior.proposal.workflow, requirements: [
  'Exact tenant import gateway plus separate existing entity_case.create authority at every proposed organization; validate active organization/company compatibility from stored catalog.',
  'Version 1 bounded JSON: 1–100 rows, at most 4 MiB, unique stable row keys; generic mutation modes and target record IDs are rejected.',
  'Validate every row with owning intake and current request rules before any draft is created; pin the checked published request schema.',
  'Refresh gateway, stored scope and row authority before each draft; stop on failure or revocation and report per-row outcomes without claiming batch rollback.',
  'Only new_partner supplier drafts with import source/integration mode; existing case owner controls idempotency, schema, audit and outbox.',
  'Stable tenant/principal/batch/row identity; payload changes under a used key are conflicts. Submission, approval, MFA, separation of duties and application remain separate.',
 ]},
 priorApproval: {packetRevision: original.packetRevision, proposalSha256: prior.proposalSha256},
 rationale: 'Replace the generic import placeholder with bounded governed supplier-request draft intake. Preserve the approved gateway scope; it never grants row creation or master mutation authority.',
 implementationEvidence: implementationPaths.map(path => ({path, sha256: hash(readFileSync(path))})),
 regressionEvidence: tests.map(path => ({path, sha256: hash(readFileSync(path)), test: 'Bounded intake, actual draft validation, scope and distinct gateway/row checks, replay and revocation'})),
 remainingEngineering: ['Select the reviewed handler in native bindings and expose its dedicated target API.', 'Qualify the exact signed release with explicitly authorized existing principals; no new gateway grants are implied.'],
 nativeCompilationEligible: false,
};
const {packetRevision: _revision, rows: _rows, source: _source, ...envelope} = original;
const body = {...envelope, source: {path: currentPath, sha256: hash(readFileSync(currentPath)), base: current.base, candidateHash: current.candidateHash},
 previousPacketRevision: original.packetRevision, revisionReason: 'Governed supplier-request import implementation and workflow review; original operation and case-correction approvals remain historical.',
 rows: [{operation: 'import', proposal, proposalSha256: proposalHash(proposal)}], grantChanges: [], activationAuthorized: false};
const packet = {...body, packetRevision: proposalHash(body)};
const path = 'governance/policy/reviews/business-partner-governed-import-workflow.dev.json';
const content = JSON.stringify(packet, null, 2) + '\n';
if (existsSync(path) && readFileSync(path, 'utf8') !== content) throw Error('Preserve the existing import proposal revision; author a new revision');
writeFileSync(path, content);
console.log({path, packetRevision: packet.packetRevision, operations: 1, approvals: 0, grantsChanged: false, activationAuthorized: false});
