import { proposalHash } from './named-role-review.mjs';

/** Pure transformation of authenticated review evidence. Does not provision catalog or grants. */
export function selectAcceptedOperations({ packet, state, exported, candidate }) {
  const { packetRevision, ...body } = packet;
  const require = (condition, message) => { if (!condition) throw Error(message); };
  require(proposalHash(body) === packetRevision, 'PROPOSAL_REVISION_CHANGED');
  require(state.packetRevision === packetRevision && exported.packetRevision === packetRevision &&
    proposalHash(state.receipts) === proposalHash(exported.receipts), 'DURABLE_RECEIPTS_MISMATCH');
  require(proposalHash(candidate.candidate) === candidate.candidateHash && packet.source.candidateHash === candidate.candidateHash &&
    proposalHash(packet.source.base) === proposalHash(candidate.base), 'ACTIVATION_HEAD_OR_CANDIDATE_CHANGED');
  require(packet.activationAuthorized === false && packet.grantChanges.length === 0, 'UNEXPECTED_ACTIVATION_OR_GRANTS');
  require(packet.reviewers.length === 2 && new Set(packet.reviewers.map(r => r.principalId)).size === 2, 'TWO_REVIEWERS_REQUIRED');
  require(new Set(packet.rows.map(r => r.operation)).size === packet.rows.length, 'DUPLICATE_OPERATIONS');
  for (const row of packet.rows) {
    require(row.proposalSha256 === proposalHash(row.proposal) && row.operation === row.proposal.operation, 'PROPOSAL_HASH_CHANGED');
    require(['include', 'defer'].includes(row.proposal.disposition) && row.proposal.permission.grantAssignments.length === 0, 'INVALID_DISPOSITION_OR_GRANTS');
    for (const reviewer of packet.reviewers) {
      const receipts = state.receipts.filter(r => r.actor.reviewerId === reviewer.id && r.decisions.some(d => d.operation === row.operation));
      require(receipts.length === 1, 'MISSING_OR_AMBIGUOUS_APPROVAL');
      const receipt = receipts[0], decisions = receipt.decisions.filter(d => d.operation === row.operation);
      require(receipt.packetRevision === packetRevision && receipt.nominationSha256 === packet.nominationSha256 &&
        receipt.authenticatedReviewer === true && receipt.actor.assurance === 'elevated' &&
        receipt.actor.principalId === reviewer.principalId && receipt.actor.tenantId === reviewer.homeTenantId &&
        ['business','security'].every(d => receipt.domains.includes(d)) &&
        receipt.activationAuthorized === false && receipt.grantChanges.length === 0 &&
        decisions.length === 1 && decisions[0].proposalSha256 === row.proposalSha256 && decisions[0].decision === 'approve', 'EXACT_AUTHENTICATED_APPROVAL_REQUIRED');
    }
  }
  const descriptor = structuredClone(candidate.candidate.descriptorDraft);
  const proposals = new Map(packet.rows.map(r => [r.operation, r.proposal]));
  const deferred = packet.rows.filter(r => r.proposal.disposition === 'defer').map(r => r.operation).sort();
  const included = packet.rows.filter(r => r.proposal.disposition === 'include');
  require(Object.keys(descriptor.operations).length === proposals.size && Object.keys(descriptor.operations).every(k => proposals.has(k)), 'DESCRIPTOR_SELECTION_MISMATCH');
  for (const key of deferred) delete descriptor.operations[key];
  descriptor.authorization.deferredOperations = deferred;
  descriptor.authorization.operations = descriptor.authorization.operations.filter(op => !deferred.includes(op.key)).map(op => {
    const p = proposals.get(op.key);
    require(p && p.scope.resolver === op.scope && p.target === op.target && p.effect === op.effect &&
      p.workflow.requiresPreflight === op.requiresPreflight && p.requiresParentRead === op.requiresParentRead, 'PROFILE_SEMANTICS_CHANGED');
    descriptor.operations[op.key].permissionCode = p.permission.proposedCode;
    return { ...op, permissionCode: p.permission.proposedCode };
  });
  // Metadata hints must reference the same target capability and scope as the server operation.
  function presentation(value) {
    if (Array.isArray(value)) return value.filter(v => !v?.operationKey || !deferred.includes(v.operationKey)).map(presentation);
    if (!value || typeof value !== 'object') return value;
    const result = Object.fromEntries(Object.entries(value).map(([k,v]) => [k,presentation(v)]));
    if (result.operationKey) {
      require(!deferred.includes(result.operationKey), 'DEFERRED_PRESENTATION_REFERENCE');
      const p = proposals.get(result.operationKey);
      require(p, 'UNKNOWN_PRESENTATION_OPERATION');
      if ('permissions' in result) result.permissions = [{ plane: descriptor.planeKey, permissionCode: p.permission.proposedCode }];
      if ('scopes' in result) result.scopes = p.scope.bindings.map(b => ({ plane: descriptor.planeKey, scopeKind: b.scopeKind, coordinateSource: b.coordinateSource,
        ...(b.coordinateKey ? {coordinateKey:b.coordinateKey}:{}), ...(b.resolverKey ? {resolverKey:b.resolverKey}:{}),
        decisionMode: p.target === 'collection' ? 'collection' : 'entity_resource' }));
      if ('requiresPreflight' in result) result.requiresPreflight = p.workflow.requiresPreflight;
    }
    return result;
  }
  descriptor.listPresentation = presentation(descriptor.listPresentation);
  descriptor.recordPresentation = presentation(descriptor.recordPresentation);
  // All legacy bulk mutations depend on the deferred generic create/update semantics.
  const data = descriptor.listPresentation?.dataOperations;
  if (data && deferred.includes('create') && deferred.includes('update')) {
    data.importOperations = []; data.importFormats = []; data.importOperationPermissions = {};
    data.allowTemplateDownload = false; delete data.importAdapterKey;
  }
  descriptor.fields = descriptor.fields.map(field => ({ ...field, writableOn: [] }));
  const permissionDefinitions = included.filter(r => r.proposal.permission.catalogAction === 'create_dedicated_permission').map(({ operation, proposal: p, proposalSha256 }) => ({
    canonicalCode: p.permission.proposedCode, permissionKind: 'entity_operation', operation,
    scopeBindings: p.scope.bindings, propagationMode: 'exact', conditions: p.conditions,
    proposalSha256, grantAssignments: [], catalogOwner: 'plane_seed', status: 'prepared',
  }));
  const bindings = included.map(({ operation, proposal: p, proposalSha256 }) => ({ operationKey: operation,
    permissionCode: p.permission.proposedCode, permissionId: p.permission.proposedId,
    catalogAction: p.permission.catalogAction, scopeResolver: p.scope.resolver, scopeBindings: p.scope.bindings,
    target:p.target, effect:p.effect, requiresParentRead:p.requiresParentRead, requiresPreflight:p.workflow.requiresPreflight,
    handler:p.handler, workflow:p.workflow, proposalSha256, runtimeQualified:false }));
  const selection = { schemaVersion:1, kind:'accepted_bp_operation_selection', packetRevision,
    base:candidate.base, receiptsSha256:proposalHash(state.receipts), descriptor, permissionDefinitions, bindings,
    deferredOperations:deferred, grantChanges:[], activationAuthorized:false, publicationEligible:false,
    dependencyBlocks: data && data.importOperations.length === 0 ? [{ operation:'import', code:'NO_APPROVED_IMPORT_MUTATION_MODES', reason:'The approved gateway still requires per-mutation authorization. All existing bulk modes depend on deferred create/update; they remain unavailable. A governed-request import adapter requires a separately reviewed proposal.' }] : [],
    remainingGates:['plane_seed_catalog_installation','real_runtime_registration','native_signed_compilation','same_release_authenticated_qualification','policy_difference_acceptance','separate_enforcement_approval'] };
  return { ...selection, selectionSha256:proposalHash(selection) };
}
