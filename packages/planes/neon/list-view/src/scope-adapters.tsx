"use client";

import type { EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import type { DirectoryFilterAdapter } from "@athyper/platform-entity-list-view";
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type BusinessPartnerRole = "supplier" | "customer";
type EligibleOperation = "order" | "invoice" | "payment";
type CompanyScopeIdentity = {
  readonly companyCodeId: string;
  readonly legalEntityId: string;
};

export interface NeonScopeAdapterValue {
  readonly coordinate?: EntityListScopeCoordinateV1;
  readonly directory: DirectoryFilterAdapter;
  readonly scopePending: boolean;
}

type ScopeAdapterProps = {
  readonly initialDirectoryQuery?: string;
  readonly children: (value: NeonScopeAdapterValue) => ReactNode;
};

/** Only published resolver identifiers in this registry may receive a context selector. */
const workContextResolvers = new Set([
  "platform.document_relationship.v1",
  "neon.business_partner.operating_organization.v1",
]);

export function supportsNeonWorkContextResolver(resolver: string) {
  return workContextResolvers.has(resolver);
}

export function businessPartnerRoleFromDirectoryQuery(
  query?: string,
): BusinessPartnerRole | undefined {
  const role = new URLSearchParams(query).get("role");
  return role === "supplier" || role === "customer" ? role : undefined;
}

/** Builds only the coordinates authorized by the current directory selection. */
export function businessPartnerScopeCoordinate({
  organizationIds,
  companyIds,
  partnerRole,
  eligibleOperation,
  companies,
}: {
  readonly organizationIds: readonly string[];
  readonly companyIds: readonly string[];
  readonly partnerRole?: BusinessPartnerRole;
  readonly eligibleOperation?: EligibleOperation;
  readonly companies: readonly CompanyScopeIdentity[];
}): EntityListScopeCoordinateV1 | undefined {
  if (!organizationIds.length && !companyIds.length && !partnerRole && !eligibleOperation)
    return undefined;
  const company =
    companyIds.length === 1
      ? companies.find((item) => item.companyCodeId === companyIds[0])
      : undefined;
  if (eligibleOperation && organizationIds.length === 1 && company && partnerRole)
    return {
      partnerRole,
      eligibleOperation,
      operatingOrganizationId: organizationIds[0],
      companyCodeId: company.companyCodeId,
      legalEntityId: company.legalEntityId,
    };
  return {
    ...(partnerRole ? { partnerRole } : {}),
    ...(organizationIds.length ? { operatingOrganizationIds: organizationIds } : {}),
    ...(companyIds.length ? { companyCodeIds: companyIds } : {}),
  };
}

/**
 * Domain adapters are selected by entity code. Unknown entities retain the
 * common organization/company adapter; an unknown required resolver is still
 * unavailable through supportsNeonWorkContextResolver, never made unscoped.
 */
export function NeonScopeAdapter({
  entityCode,
  initialDirectoryQuery,
  children,
}: ScopeAdapterProps & { readonly entityCode: string }) {
  if (entityCode === "business_partner")
    return (
      <BusinessPartnerScopeAdapter initialDirectoryQuery={initialDirectoryQuery}>
        {children}
      </BusinessPartnerScopeAdapter>
    );
  return <CommonScopeAdapter>{children}</CommonScopeAdapter>;
}

function useCommonDirectoryScope() {
  const work = useNeonWorkContext();
  const operating = useNeonOperatingOrganization();
  const [organizationIds, setOrganizationIds] = useState<readonly string[]>([]);
  const [companyIds, setCompanyIds] = useState<readonly string[]>([]);
  const directory = useMemo<DirectoryFilterAdapter>(
    () => ({
      value: {
        operatingOrganizationIds: organizationIds,
        companyCodeIds: companyIds,
      },
      organizations: operating.organizations,
      companies: work.companies,
      unavailable: work.status !== "ready" || operating.status !== "ready",
      apply: (value) => {
        setOrganizationIds(value.operatingOrganizationIds ?? []);
        setCompanyIds(value.companyCodeIds ?? []);
      },
    }),
    [companyIds, operating.organizations, organizationIds, operating.status, work.companies, work.status],
  );
  return {
    work,
    operating,
    organizationIds,
    companyIds,
    directory,
    scopePending: work.status === "loading" || operating.status === "loading",
  };
}

function CommonScopeAdapter({ children }: ScopeAdapterProps) {
  const scope = useCommonDirectoryScope();
  const coordinate = useMemo<EntityListScopeCoordinateV1 | undefined>(() => {
    if (!scope.organizationIds.length && !scope.companyIds.length) return undefined;
    return {
      ...(scope.organizationIds.length
        ? { operatingOrganizationIds: scope.organizationIds }
        : {}),
      ...(scope.companyIds.length ? { companyCodeIds: scope.companyIds } : {}),
    };
  }, [scope.companyIds, scope.organizationIds]);
  return children({ coordinate, directory: scope.directory, scopePending: scope.scopePending });
}

function BusinessPartnerScopeAdapter({ initialDirectoryQuery, children }: ScopeAdapterProps) {
  const scope = useCommonDirectoryScope();
  const initialRole = businessPartnerRoleFromDirectoryQuery(initialDirectoryQuery);
  const [partnerRole, setPartnerRole] = useState<BusinessPartnerRole | undefined>(initialRole);
  const [eligibleOperation, setEligibleOperation] = useState<EligibleOperation>();
  useEffect(() => {
    setPartnerRole(initialRole);
    setEligibleOperation(undefined);
  }, [initialRole]);
  const coordinate = useMemo(
    () =>
      businessPartnerScopeCoordinate({
        organizationIds: scope.organizationIds,
        companyIds: scope.companyIds,
        partnerRole,
        eligibleOperation,
        companies: scope.work.companies,
      }),
    [eligibleOperation, partnerRole, scope.companyIds, scope.organizationIds, scope.work.companies],
  );
  const directory = useMemo<DirectoryFilterAdapter>(
    () => ({
      ...scope.directory,
      value: {
        partnerRole,
        eligibleOperation,
        operatingOrganizationIds: scope.organizationIds,
        companyCodeIds: scope.companyIds,
      },
      apply: (value) => {
        scope.directory.apply(value);
        const selectionCompatible =
          value.operatingOrganizationIds?.length === 1 &&
          value.companyCodeIds?.length === 1 &&
          scope.operating.organizations
            .find((org) => org.id === value.operatingOrganizationIds?.[0])
            ?.companyAssignments.some(
              (item) => item.companyCodeId === value.companyCodeIds?.[0],
            );
        const role =
          value.partnerRole === "supplier" || value.partnerRole === "customer"
            ? value.partnerRole
            : undefined;
        setPartnerRole(role);
        setEligibleOperation(
          role && selectionCompatible &&
          (value.eligibleOperation === "order" ||
            value.eligibleOperation === "invoice" ||
            value.eligibleOperation === "payment")
            ? value.eligibleOperation
            : undefined,
        );
      },
    }),
    [eligibleOperation, partnerRole, scope.directory, scope.operating.organizations, scope.organizationIds],
  );
  return children({ coordinate, directory, scopePending: scope.scopePending });
}
