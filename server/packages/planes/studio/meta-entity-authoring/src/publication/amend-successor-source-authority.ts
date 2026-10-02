import type { MetaEntityGraph } from '@athyper/server-contract-meta-entity-authoring';

/** Bind a successor to a qualified source resolver without replacing the
 * predecessor's owner, permissions, fields, operations or storage. Installation
 * and target-plane support are checked separately at publication admission. */
export function amendSuccessorSourceAuthority(graph: MetaEntityGraph, key: string): MetaEntityGraph {
  if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(key))
    throw Error('SOURCE_AUTHORITY_KEY_INVALID');
  const owners = graph.surfaces?.filter(surface => surface.layoutConfig?.ownerAccess) ?? [];
  if (owners.length !== 1) throw Error('SOURCE_AUTHORITY_OWNER_REQUIRED');
  const surface = owners[0]!;
  const owner = surface.layoutConfig!.ownerAccess as Record<string, unknown>;
  if (owner.schemaVersion !== 1 || typeof owner.ownerField !== 'string' || !owner.ownerField.trim())
    throw Error('SOURCE_AUTHORITY_OWNER_INVALID');
  return {
    ...graph,
    surfaces: graph.surfaces!.map(candidate => candidate === surface ? {
      ...candidate,
      layoutConfig: {
        ...candidate.layoutConfig,
        ownerAccess: { ...owner, sourceAuthority: key },
      },
    } : candidate),
  };
}
