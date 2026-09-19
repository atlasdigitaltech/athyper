import type {Authorizer, VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {BusinessPartnerRequestService} from "@athyper/server-contract-master-data";
import {parseEntityAuthorizationProfile, parseEntityAuthorizationRuntime, type MetadataReader, type EntityAuthorizationRuntimeRegistration} from "@athyper/server-contract-metadata";
import {entityAuthorizationProfileHash, type EntityAccessInput, type EntityScopeAdapter} from "@athyper/server-service-records";
import {businessPartnerGovernedImportVersion, parseBusinessPartnerGovernedImport, MasterDataError} from "@athyper/server-service-master-data";
import {createBusinessPartnerImportRuntime} from "./business-partner-import-runtime.js";

export interface BusinessPartnerImportRelease {readonly releaseId: string; readonly compiledHash: string}
const operation = Object.freeze({key: "import", permissionCode: "neon.relationship.bp_target.import", scope: "tenant.record.v1" as const, target: "proposed" as const, effect: "write" as const, discoveryOperation: "enter", requiresParentRead: false, requiresPreflight: true});
const preflightKey = "business_partner.import.preflight.v1";
const unavailable = () => new MasterDataError(503, "BP_GOVERNED_IMPORT_UNAVAILABLE", "The governed import release is unavailable");
export function createBusinessPartnerBoundImport(options: {
  readonly requests: BusinessPartnerRequestService; readonly metadata: MetadataReader;
  readonly authorizer: Authorizer; readonly scopes: EntityScopeAdapter;
  readonly refreshContext: (context: VerifiedRequestContext) => Promise<VerifiedRequestContext>;
}) {
  async function selected(context: VerifiedRequestContext, expected?: BusinessPartnerImportRelease): Promise<BusinessPartnerImportRelease> {
    if (context.planeKey !== "neon" || !options.requests.preflightCreate) throw unavailable();
    const descriptor = await options.metadata.getEntityDescriptor(context, "business_partner");
    if (!descriptor || descriptor.entityCode !== "business_partner" || descriptor.planeKey !== "neon" || !descriptor.authorization || !descriptor.authorizationRuntime) throw unavailable();
    const profile = parseEntityAuthorizationProfile(descriptor.authorization);
    const runtime = parseEntityAuthorizationRuntime(descriptor.authorizationRuntime, profile);
    const actual = profile.operations.find(o => o.key === "import"), binding = runtime.bindings.find(b => b.operation === "import");
    if (profile.deferredOperations?.includes("import") || !actual ||
      Object.keys(operation).some(key => Reflect.get(operation, key) !== Reflect.get(actual, key)) ||
      Object.keys(actual).some(key => Reflect.get(actual, key) !== Reflect.get(operation, key)) ||
      binding?.handler !== businessPartnerGovernedImportVersion || binding.resolver !== operation.scope || binding.preflight !== preflightKey ||
      descriptor.operations["import"]?.permissionCode !== operation.permissionCode ||
      options.authorizer.enforcedEntityProfile?.("neon", "business_partner") !== entityAuthorizationProfileHash(profile)) throw unavailable();
    if (expected && (descriptor.releaseId !== expected.releaseId || descriptor.compiledHash !== expected.compiledHash))
      throw new MasterDataError(409, "BP_GOVERNED_IMPORT_RELEASE_CHANGED", "Reload the governed import release");
    return {releaseId: descriptor.releaseId, compiledHash: descriptor.compiledHash};
  }
  const service = {
    async preflight(input: EntityAccessInput): Promise<"allowed" | "workflow_blocked" | "not_applicable"> {
      if (input.operationKey !== "import") return "not_applicable";
      if (input.historical) return "workflow_blocked";
      // Read-only availability check; actual row/schema validation runs in the
      // approved intake owner before any draft writes. Do not recurse into auth.
      await selected(input.context);
      return "allowed";
    },
    async execute(context: VerifiedRequestContext, expected: BusinessPartnerImportRelease, raw: unknown) {
      if (!expected || Object.keys(expected).some(k => !["releaseId", "compiledHash"].includes(k)) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(expected.releaseId) || !/^[a-f0-9]{64}$/.test(expected.compiledHash))
        throw new MasterDataError(400, "BP_GOVERNED_IMPORT_RELEASE_INVALID", "An exact import release is required");
      const pinned = {...expected}, batch = parseBusinessPartnerGovernedImport(raw);
      await selected(context, pinned);
      const owner = createBusinessPartnerImportRuntime({...options, refreshContext: async initial => {
        const current = await options.refreshContext(initial);
        if (current.principalId !== initial.principalId || current.tenantId !== initial.tenantId || current.planeKey !== initial.planeKey) throw unavailable();
        await selected(current, pinned);
        return current;
      }});
      return {release: pinned, ...await owner.execute(context, batch)};
    },
  };
  return service;
}

export function createBusinessPartnerImportRegistration(service: ReturnType<typeof createBusinessPartnerBoundImport>, scopes: EntityScopeAdapter): EntityAuthorizationRuntimeRegistration {
  return {entityCode: "business_partner", planeKey: "neon", operation,
    handler: {key: businessPartnerGovernedImportVersion, invoke: service.execute.bind(service)},
    resolver: {key: operation.scope, resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
      if (input.entityCode !== "business_partner" || input.operationKey !== "import") throw unavailable();
      return scopes.resolve({...input, resolver: operation.scope, target: operation.target});
    }},
    preflight: {key: preflightKey, check: service.preflight.bind(service)},
  };
}
