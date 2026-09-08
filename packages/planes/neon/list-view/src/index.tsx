"use client";
import type {
  EntityListScopeCoordinateV1,
  ListDensity,
} from "@athyper/contract-platform-entity-list";
import {
  EntityListRuntime,
  EntityApplicationSection,
  useEntityApplication,
  ListScopeControl,
  DirectoryFilterContext,
} from "@athyper/platform-entity-list-view";
import {
  useApiClient,
  useApplicationNavigation,
} from "@athyper/platform-shell-app-foundation";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export function NeonEntityList({
  entityCode,
  initialDensity,
  navigationOnly,
}: {
  readonly entityCode: string;
  readonly navigationOnly?: boolean;
  readonly initialDensity?: ListDensity;
}) {
  const client = useApiClient();
  const app = useEntityApplication();
  if (app)
    return (
      <EntityListRuntime
        client={client}
        entityCode={entityCode}
        scopeCoordinate={app.scopeCoordinate}
        scopeControl={app.scopeControl}
        contentOnly
        initialDensity={initialDensity}
      />
    );
  return (
    <ScopedNeonEntityList
      client={client}
      entityCode={entityCode}
      initialDensity={initialDensity}
      navigationOnly={navigationOnly}
    />
  );
}

function ScopedNeonEntityList({
  client,
  entityCode,
  initialDensity,
  navigationOnly,
  applicationOnly,
  children,
  onNavigate,
  activePath,
}: {
  readonly activePath?: string;
  readonly onNavigate?: (href: string) => void;
  readonly applicationOnly?: boolean;
  readonly children?: ReactNode;
  readonly client: ReturnType<typeof useApiClient>;
  readonly entityCode: string;
  readonly navigationOnly?: boolean;
  readonly initialDensity?: ListDensity;
}) {
  const work = useNeonWorkContext();
  const operating = useNeonOperatingOrganization();
  const [organizationIds, setOrganizationIds] = useState<readonly string[]>([]);
  const [companyIds, setCompanyIds] = useState<readonly string[]>([]);
  const [partnerRole, setPartnerRole] = useState<"supplier" | "customer">();
  const [eligibleOperation, setEligibleOperation] = useState<"order" | "invoice" | "payment">();
  const coordinate = useMemo<EntityListScopeCoordinateV1 | undefined>(() => {
    if (!organizationIds.length && !companyIds.length && !partnerRole && !eligibleOperation) return undefined;
    const company = companyIds.length === 1 ? work.companies.find(item => item.companyCodeId === companyIds[0]) : undefined;
    if (eligibleOperation && organizationIds.length === 1 && company && partnerRole) return {partnerRole, eligibleOperation, operatingOrganizationId:organizationIds[0], companyCodeId:company.companyCodeId, legalEntityId:company.legalEntityId};
    return {
      ...(partnerRole ? {partnerRole} : {}),
      ...(organizationIds.length ? { operatingOrganizationIds: organizationIds } : {}),
      ...(companyIds.length ? { companyCodeIds: companyIds } : {}),
    };
  }, [organizationIds, companyIds, partnerRole, eligibleOperation, work.companies]);
  return (
    <DirectoryFilterContext.Provider value={{
      value: { partnerRole, eligibleOperation, operatingOrganizationIds: organizationIds, companyCodeIds: companyIds },
      organizations: operating.organizations, companies: work.companies,
      unavailable: work.status !== "ready" || operating.status !== "ready",
      apply: value => { setOrganizationIds(value.operatingOrganizationIds ?? []); setCompanyIds(value.companyCodeIds ?? []); setPartnerRole(value.partnerRole);
        const compatible = value.operatingOrganizationIds?.length === 1 && value.companyCodeIds?.length === 1 && operating.organizations.find(org => org.id === value.operatingOrganizationIds?.[0])?.companyAssignments.some(item => item.companyCodeId === value.companyCodeIds?.[0]);
        setEligibleOperation(value.partnerRole && compatible ? value.eligibleOperation : undefined); },
    }}><EntityListRuntime
      client={client}
      entityCode={entityCode}
      scopeCoordinate={coordinate}
      initialDensity={initialDensity}
      navigationOnly={navigationOnly}
      applicationOnly={applicationOnly}
      onNavigate={onNavigate}
      activePath={activePath}
      children={children}
      scopePending={work.status === "loading" || operating.status === "loading"}
    /></DirectoryFilterContext.Provider>
  );
}

export function NeonEntityApplication({
  entityCode,
  children,
  activePath,
}: {
  readonly entityCode: string;
  readonly children: ReactNode;
  readonly activePath?: string;
}) {
  const client = useApiClient(),
    navigation = useApplicationNavigation();
  return <ScopedNeonEntityList client={client} entityCode={entityCode} applicationOnly onNavigate={navigation.push} activePath={activePath}>{children}</ScopedNeonEntityList>;
}
export { EntityApplicationSection as NeonEntityApplicationSection };
