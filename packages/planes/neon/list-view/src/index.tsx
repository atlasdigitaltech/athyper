"use client";
import type { EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import { EntityListRuntime, ListScopeControl } from "@athyper/platform-entity-list-view";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useNeonOperatingOrganization, useNeonWorkContext } from "@athyper/product-neon-shell";
import { useEffect, useMemo, useState } from "react";

export function NeonEntityList({ entityCode }: { readonly entityCode: string }) {
  const client = useApiClient();
  if (entityCode !== "business_partner") return <EntityListRuntime client={client} entityCode={entityCode}/>;
  return <ScopedBusinessPartnerList client={client} entityCode={entityCode}/>;
}

function ScopedBusinessPartnerList({ client, entityCode }: { readonly client: ReturnType<typeof useApiClient>; readonly entityCode: string }) {
  const work = useNeonWorkContext();
  const operating = useNeonOperatingOrganization();
  const [organizationId, setOrganizationId] = useState<string>();
  const company = work.selection.mode === "company" ? work.selection : undefined;
  const compatible = useMemo(() => operating.organizations.filter((organization) => !company || organization.companyAssignments.some((assignment) => assignment.companyCodeId === company.companyCodeId)), [operating.organizations, company?.companyCodeId]);
  useEffect(() => {
    setOrganizationId((current) => {
      if (current && compatible.some((organization) => organization.id === current)) return current;
      return compatible.length === 1 ? compatible[0]!.id : undefined;
    });
  }, [compatible]);
  const coordinate = useMemo<EntityListScopeCoordinateV1 | undefined>(() => organizationId ? Object.freeze({ ...(company ? { companyCodeId: company.companyCodeId, legalEntityId: company.legalEntityId } : {}), operatingOrganizationId: organizationId }) : undefined, [company?.companyCodeId, company?.legalEntityId, organizationId]);
  const control = <ListScopeControl id="neon-list-operating-organization" label="Organization" value={organizationId} options={compatible.map((organization) => ({ value: organization.id, label: `${organization.code} · ${organization.displayName}` }))} status={operating.status} loadingLabel="Loading operating organizations…" emptyLabel="No compatible operating organizations" selectLabel="Select an operating organization" summaryLabel="Authorized operating organization" summaryDetails={company ? ["Company access is applied"] : undefined} accessLabel="Read-only access" onChange={setOrganizationId}/>;
  return <EntityListRuntime client={client} entityCode={entityCode} scopeCoordinate={coordinate} scopeControl={control}/>;
}
