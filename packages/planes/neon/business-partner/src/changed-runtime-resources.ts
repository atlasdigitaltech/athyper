import {useCallback} from "react";
import {useSessionIdentity} from "@athyper/platform-shell-app-foundation";
import {invalidateEntityRuntimeRecord} from "@athyper/platform-entity-form-detail";

export function useChangedRuntimeResources() {
  const {scope} = useSessionIdentity();
  return useCallback((value: unknown, partnerId?: string) => {
    if (!scope) return;
    const ids = new Set<string>(partnerId ? [partnerId] : []);
    for (const item of Array.isArray(value) ? value : []) {
      if (item && typeof item === "object" && item.entityCode === "business_partner" && typeof item.recordId === "string") ids.add(item.recordId);
    }
    for (const recordId of ids) invalidateEntityRuntimeRecord({tenantId:scope.tenantId,principalId:scope.principalId,authEpoch:scope.authEpoch,entityCode:"business_partner",recordId});
  }, [scope?.tenantId,scope?.principalId,scope?.authEpoch]);
}
