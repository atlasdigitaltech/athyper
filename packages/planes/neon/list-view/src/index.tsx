"use client";
import type {
  EntityListScopeCoordinateV1,
  EntityListDescriptorV1,
  ListDensity,
} from "@athyper/contract-platform-entity-list";
import {
  EntityListRuntime,
  EntityApplicationSection,
  useEntityApplication,
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
        scopeCoordinate={
          entityCode === app.descriptor.entity.code
            ? app.scopeCoordinate
            : undefined
        }
        renderScopeControl={app.renderScopeControl}
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
  initialPartnerRole,
}: {
  readonly initialPartnerRole?: "supplier" | "customer";
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
  const [partnerRole, setPartnerRole] = useState<
    "supplier" | "customer" | undefined
  >(initialPartnerRole);
  const [eligibleOperation, setEligibleOperation] = useState<
    "order" | "invoice" | "payment"
  >();
  useEffect(() => {
    setPartnerRole(initialPartnerRole);
    setEligibleOperation(undefined);
  }, [initialPartnerRole]);
  const coordinate = useMemo<EntityListScopeCoordinateV1 | undefined>(() => {
    if (
      !organizationIds.length &&
      !companyIds.length &&
      !partnerRole &&
      !eligibleOperation
    )
      return undefined;
    const company =
      companyIds.length === 1
        ? work.companies.find((item) => item.companyCodeId === companyIds[0])
        : undefined;
    if (
      eligibleOperation &&
      organizationIds.length === 1 &&
      company &&
      partnerRole
    )
      return {
        partnerRole,
        eligibleOperation,
        operatingOrganizationId: organizationIds[0],
        companyCodeId: company.companyCodeId,
        legalEntityId: company.legalEntityId,
      };
    return {
      ...(partnerRole ? { partnerRole } : {}),
      ...(organizationIds.length
        ? { operatingOrganizationIds: organizationIds }
        : {}),
      ...(companyIds.length ? { companyCodeIds: companyIds } : {}),
    };
  }, [
    organizationIds,
    companyIds,
    partnerRole,
    eligibleOperation,
    work.companies,
  ]);
  return (
    <DirectoryFilterContext.Provider
      value={{
        value: {
          partnerRole,
          eligibleOperation,
          operatingOrganizationIds: organizationIds,
          companyCodeIds: companyIds,
        },
        organizations: operating.organizations,
        companies: work.companies,
        unavailable: work.status !== "ready" || operating.status !== "ready",
        apply: (value) => {
          setOrganizationIds(value.operatingOrganizationIds ?? []);
          setCompanyIds(value.companyCodeIds ?? []);
          setPartnerRole(value.partnerRole === "supplier" || value.partnerRole === "customer" ? value.partnerRole : undefined);
          const compatible =
            value.operatingOrganizationIds?.length === 1 &&
            value.companyCodeIds?.length === 1 &&
            operating.organizations
              .find((org) => org.id === value.operatingOrganizationIds?.[0])
              ?.companyAssignments.some(
                (item) => item.companyCodeId === value.companyCodeIds?.[0],
              );
          setEligibleOperation(
            (value.partnerRole === "supplier" || value.partnerRole === "customer") && compatible &&
            (value.eligibleOperation === "order" || value.eligibleOperation === "invoice" || value.eligibleOperation === "payment")
              ? value.eligibleOperation : undefined,
          );
        },
      }}
    >
      <EntityListRuntime
        client={client}
        entityCode={entityCode}
        scopeCoordinate={coordinate}
        renderScopeControl={(input) =>
          input.scope.workContext ? <NeonRequiredContext {...input} /> : null
        }
        initialDensity={initialDensity}
        navigationOnly={navigationOnly}
        applicationOnly={applicationOnly}
        onNavigate={onNavigate}
        activePath={activePath}
        children={children}
        scopePending={
          work.status === "loading" || operating.status === "loading"
        }
      />
    </DirectoryFilterContext.Provider>
  );
}

export function NeonEntityApplication({
  entityCode,
  children,
  activePath,
  initialDirectoryQuery,
}: {
  readonly entityCode: string;
  readonly children: ReactNode;
  readonly initialDirectoryQuery?: string;
  readonly activePath?: string;
}) {
  const role = new URLSearchParams(initialDirectoryQuery).get("role");
  const initialPartnerRole = entityCode === "business_partner" && (role === "supplier" || role === "customer") ? role : undefined;
  const client = useApiClient(),
    navigation = useApplicationNavigation();
  return (
    <ScopedNeonEntityList
      client={client}
      entityCode={entityCode}
      applicationOnly
      onNavigate={navigation.push}
      initialPartnerRole={initialPartnerRole}
      activePath={activePath}
    >
      {children}
    </ScopedNeonEntityList>
  );
}
export { EntityApplicationSection as NeonEntityApplicationSection };

function NeonRequiredContext({
  scope,
  value,
  onChange,
}: {
  readonly scope: EntityListDescriptorV1["scope"];
  readonly value?: EntityListScopeCoordinateV1;
  readonly onChange: (value: EntityListScopeCoordinateV1 | undefined) => void;
}) {
  const operating = useNeonOperatingOrganization();
  const requirement = scope.workContext;
  if (!requirement) return null;
  // Registered readers currently require one organization. Unsupported contracts stay closed.
  if (
    ![
      "platform.document_relationship.v1",
      "neon.business_partner.operating_organization.v1",
    ].includes(requirement.resolver) ||
    requirement.requiredCoordinates.length !== 1 ||
    requirement.requiredCoordinates[0] !== "operatingOrganizationId"
  )
    return (
      <p role="status">
        This context selector is unavailable for the published requirements.
      </p>
    );
  return (
    <div className="a-entity-list__scope">
      <label>
        Operating organization
        <select
          aria-label="Work context organization"
          value={value?.operatingOrganizationId ?? ""}
          disabled={
            operating.status !== "ready" || !operating.organizations.length
          }
          onChange={(event) =>
            onChange(
              event.target.value
                ? { operatingOrganizationId: event.target.value }
                : undefined,
            )
          }
        >
          <option value="">
            {operating.status === "loading"
              ? "Loading organizations…"
              : operating.status === "error"
                ? "Organizations unavailable"
                : !operating.organizations.length
                  ? "No organizations available"
                  : "Select organization"}
          </option>
          {operating.organizations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
