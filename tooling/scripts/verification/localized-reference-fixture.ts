import { readFileSync } from "node:fs";
import { parseSharedReferenceProduct, compileSharedReferenceProduct } from "../../../server/packages/planes/studio/meta-entity-authoring/src/authoring/product";
import { compileNativeRuntimeProjection } from "../../../server/packages/platform/metadata/src/native-runtime-projection";
import { parseEntityRuntimeDescriptor } from "../../../server/packages/platform/metadata/src/descriptor-parser";
import { createEntityListService } from "../../../server/packages/services/records/src/entity-list-service";
import type { VerifiedRequestContext } from "../../../server/packages/contracts/auth/src/index";
import { COMMON_REFERENCE_VIEW_PERMISSION } from "../../../server/packages/contracts/metadata/src/index";
import { compileGraph } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic";

export const referenceSource = () => JSON.parse(readFileSync(new URL("../../../metadata/entities/country/definition.json", import.meta.url), "utf8"));
export const referenceLocalization = () => JSON.parse(readFileSync(new URL("../../../metadata/entities/country/localization.json", import.meta.url), "utf8"));
export function compiledReference(input = referenceSource(), plane: "studio" | "neon" | "mesh" = "neon") {
  const product = parseSharedReferenceProduct(input, undefined, referenceLocalization());
  const compiled = compileSharedReferenceProduct(product, plane);
  // Surface layout JSON is also the persisted authoring representation. Recompile
  // its serialized graph to catch references accidentally kept only in memory.
  const persisted = compileGraph(JSON.parse(JSON.stringify(compiled.graph)));
  if (persisted.descriptorHash !== compiled.artifact.descriptorHash) throw Error("Authoring roundtrip changed the compiled identity");
  const projection = compileNativeRuntimeProjection({ native: persisted.descriptor,
    registration: { entityCode: product.definition.entityCode, plane, storage: {schema:"shared",object:product.definition.storageObject,idField:"id"}, columns:product.definition.fields.map(field=>field.key) },
    permissions:[{code:COMMON_REFERENCE_VIEW_PERMISSION,scopeKinds:["tenant"]}],
  });
  return parseEntityRuntimeDescriptor({entity_code:product.definition.entityCode,plane_code:plane,release_id:"00000000-0000-4000-8000-000000000001",release_no:1,entity_contract_hash:compiled.artifact.descriptorHash,compiled_hash:"a".repeat(64),compiled_json:JSON.parse(JSON.stringify(projection))});
}
/** Real compiler/parser and authorized browser projection, with in-memory admission only.
 * This fixture is not a signed or activated publication. */
export async function referenceDetail() {
  const {service,context}=referenceService();
  return service.detailDescriptor(context,"country");
}
export async function referenceList() {
  const {service,context}=referenceService();
  return service.descriptor(context,"country");
}
function referenceService() {
  const descriptor = compiledReference();
  const context: VerifiedRequestContext = {planeKey:"neon",realmKey:"athyper",tenantId:"tenant-1",principalId:"actor-1",authEpoch:1,profileHash:"profile",requestId:"test",
    permissions:{planeKey:"neon",tenantId:"tenant-1",principalId:"actor-1",principalFingerprint:"fixture",profileHash:"profile",schemaHash:"schema",resolvedAt:1,allowed:[COMMON_REFERENCE_VIEW_PERMISSION],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[]}};
  const service = createEntityListService({metadata:{getEntityDescriptor:async()=>descriptor},authorizer:{authorize:async()=>({allowed:true}),entityDescriptorSupported:()=>true},listExecutor:{} as never});
  return {service,context};
}
