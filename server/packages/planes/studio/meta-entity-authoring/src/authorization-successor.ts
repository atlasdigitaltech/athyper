import {AuthoringPolicyError} from '@athyper/server-contract-meta-entity-authoring';
import {baselineJsonHash} from './baseline-publication.js';

type Json = Record<string, any>;
const fail = (code: string): never => {throw new AuthoringPolicyError(code, 'Combined successor does not match its approved source and native contract');};
const same = (a: unknown, b: unknown) => baselineJsonHash(a ?? null) === baselineJsonHash(b ?? null);
/** Payload construction gate. Inputs must come from immutable publication storage
 * and the approved native snapshot, never an HTTP body's claimed approval.
 * This verifies content only; current head, revocation, independent approval,
 * catalog qualification and release review remain transaction/signing gates.
 */
export function compileAuthorizationSuccessorDescriptor(input: {
  nativeDescriptor: Json;
  predecessor: {releaseId: string; releaseNo: number; publicationKey: string; descriptor: Json; authoredContract: Json};
  proposedDescriptor: Json;
}): Json {
  const {nativeDescriptor: native, predecessor: source, proposedDescriptor: proposed} = input;
  const carriers = Array.isArray(native.surfaces) ? native.surfaces.filter((s: Json) => s.layoutConfig?.authorizationSuccessor) : [];
  if(carriers.length !== 1) fail('SUCCESSOR_MARKER_REQUIRED');
  const layout = carriers[0].layoutConfig, marker = layout.authorizationSuccessor;
  if(marker.schemaVersion !== 1 || marker.publicationEligible !== false ||
    !same(marker.predecessor, {releaseId: source.releaseId, releaseNo: source.releaseNo,
      publicationKey: source.publicationKey, descriptorHash: baselineJsonHash(source.descriptor),
      authoredContractHash: baselineJsonHash(source.authoredContract)})) fail('SUCCESSOR_PREDECESSOR_MISMATCH');
  if(!/^[a-f0-9]{64}$/.test(marker.authorizationSelectionSha256 ?? '') ||
    marker.combinedDescriptorHash !== baselineJsonHash(proposed) ||
    layout.baselineImport?.descriptorHash !== marker.combinedDescriptorHash) fail('SUCCESSOR_PAYLOAD_MISMATCH');
  if(proposed.schema !== 'athyper.entity-runtime-descriptor/1.0' || proposed.entityCode !== source.descriptor.entityCode ||
    proposed.planeKey !== source.descriptor.planeKey) fail('SUCCESSOR_IDENTITY_MISMATCH');
  const mutable = new Set(['fields','operations','listPresentation','authorization','authorizationRuntime','operation_scope_bindings']);
  for(const key of new Set([...Object.keys(source.descriptor), ...Object.keys(proposed)])) {
    if(!mutable.has(key) && !same(proposed[key], source.descriptor[key])) fail('SUCCESSOR_UNREVIEWED_DELTA');
  }
  if(marker.preservedAtlasHash !== baselineJsonHash(source.descriptor.ai) || !same(native.ai, proposed.ai)) fail('SUCCESSOR_ATLAS_MISMATCH');
  if(!proposed.authorization || !proposed.authorizationRuntime ||
    !same(layout.authorization, proposed.authorization) || !same(native.authorization, proposed.authorization)) fail('SUCCESSOR_AUTHORIZATION_MISMATCH');
  // Native compilation normalizes binding order; order alone is not a semantic delta.
  const normalize = (runtime: Json) => ({...runtime, bindings: [...runtime.bindings].sort((a: Json,b: Json) => a.operation.localeCompare(b.operation))});
  if(!Array.isArray(proposed.authorizationRuntime.bindings) || !Array.isArray(native.authorizationRuntime?.bindings) ||
    !same(normalize(native.authorizationRuntime), normalize(proposed.authorizationRuntime))) fail('SUCCESSOR_RUNTIME_MISMATCH');
  if(!Array.isArray(proposed.operation_scope_bindings) || proposed.operation_scope_bindings.length) fail('SUCCESSOR_LEGACY_BINDINGS_FORBIDDEN');
  return structuredClone(proposed);
}
