import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const planes = ['studio', 'neon', 'mesh'];
export const flagNames = ['ATLAS_AGENT_ENABLED', 'ATLAS_AGENT_TOOLS_ENABLED', 'ATLAS_AGENT_MUTATIONS_ENABLED', 'ATLAS_AGENT_GENERATION_ENABLED', 'ATLAS_CONVERSATION_PERSISTENCE_ENABLED'];

// Names only: catalogue comparison is deliberately not full SQL semantic parity.
export function declaredTables(sql) {
  return [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\."?([a-z_][a-z0-9_]*)"?\s*\(/gi)]
    .map(([, schema, table]) => `${schema}.${table}`).sort();
}

export function compareTables(expected, actual) {
  const names = new Set(actual.map(row => `${row.schema}.${row.table}`));
  const wanted = new Set(expected);
  return {
    comparison: 'table-presence-only; column/constraint/RLS fingerprints are inventoried separately',
    missing: [...wanted].filter(name => !names.has(name)).sort(),
    extra: [...names].filter(name => !wanted.has(name)).sort(),
  };
}

export function reconcileReceipt(receipt, apiImageId) {
  const ids = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (/image/i.test(key) && typeof item === 'string' && /^sha256:[a-f0-9]{64}$/.test(item)) ids.push(item);
      else if (item && typeof item === 'object') visit(item);
    }
  };
  visit(receipt);
  return {
    recordedImageIds: [...new Set(ids)],
    targetImageBinding: !ids.length ? 'not-bound-by-image-id' : ids.includes(apiImageId) ? 'image-id-present-revisions-and-coverage-still-require-review' : 'different-image',
    currentQualificationEstablished: false,
  };
}

export function buildCapabilityMatrix(factoryTools, profiles, invocations, since) {
  return factoryTools.map(tool => ({
    toolCode: tool.toolCode,
    access: tool.access,
    planes: tool.allowedPlanes,
    ownerRequirement: tool.ownerRequirement,
    deployedFactoryAvailable: true,
    liveProcessRegistry: 'not-observed; emitted factory construction is not process registration',
    profileReferences: profiles.flatMap(profile => (profile.agents ?? [])
      .filter(agent => agent.toolCodes?.includes(tool.toolCode))
      .map(agent => ({ scopeKey: profile.scopeKey, revision: profile.revision, agentCode: agent.code }))),
    observedInvocations: invocations.filter(row => row.toolCode === tool.toolCode),
    observationWindowStart: since,
    userAvailability: 'requires-current-context-and-authorization',
  }));
}

export function assessBaseline(checks, schemaComparisons) {
  const missingObservations = Object.entries(checks).filter(([, value]) => value.status !== 'captured').map(([key]) => key);
  const drift = Object.entries(schemaComparisons).filter(([, value]) => value.missing.length || value.extra.length).map(([key]) => key);
  return {
    inventoryStatus: missingObservations.length ? 'partial' : 'captured',
    missingObservations,
    schemaPresenceDifferences: drift,
    releaseQualified: false,
    liveProcessRegistryObserved: false,
    note: 'F0 records the baseline and known gaps; it does not certify runtime access, full DDL parity, browser behavior, or model quality.',
  };
}
