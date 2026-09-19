import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {EntityAuthorizationRuntimeRegistration} from "@athyper/server-contract-metadata";
import type {EntityAccessInput, EntityScopeAdapter, RecordTransferService} from "@athyper/server-service-records";

/** Export preflight shares the transfer owner's scope/projection preparation.
 * It neither authorizes recursively nor enqueues a job. Start, worker and result
 * retrieval retain their owning-service authorization and current grant checks. */
export function createBusinessPartnerExportRegistration(transfers: RecordTransferService, scopes: EntityScopeAdapter): EntityAuthorizationRuntimeRegistration {
  const check = async (input: EntityAccessInput) => {
    if (input.context.planeKey !== "neon" || input.operationKey !== "export") throw Error("BP_EXPORT_RUNTIME_COORDINATE_MISMATCH");
    if (input.historical) return "workflow_blocked" as const;
    await transfers.preflightExport(input.context, "business_partner", {...(input.coordinates ? {scopeCoordinate: input.coordinates} : {})});
    return "allowed" as const;
  };
  return {entityCode: "business_partner", planeKey: "neon",
    operation: {key: "export", permissionCode: "neon.relationship.bp_target.export", scope: "tenant.record.v1", target: "collection", effect: "read", requiresParentRead: false, requiresPreflight: true},
    handler: {key: "business_partner.export.v1", invoke: (context: VerifiedRequestContext, filter: Readonly<Record<string,unknown>>, requestId?: string) => {
      if (context.planeKey !== "neon") throw Error("BP_EXPORT_RUNTIME_COORDINATE_MISMATCH");
      return transfers.requestExport(context, "business_partner", filter, requestId);
    }},
    resolver: {key: "tenant.record.v1", resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
      if (input.entityCode !== "business_partner" || input.operationKey !== "export") throw Error("BP_EXPORT_RUNTIME_COORDINATE_MISMATCH");
      return scopes.resolve({...input, target: "collection", resolver: "tenant.record.v1"});
    }},
    preflight: {key: "business_partner.export.preflight.v1", check},
  };
}
