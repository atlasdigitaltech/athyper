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
import { getPlaneBrand } from "@athyper/platform-brand";
import {
  useApiClient,
  useApplicationNavigation,
} from "@athyper/platform-shell-app-foundation";

const NEON_APPLICATION_NAME = getPlaneBrand("neon").applicationName;
import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
  useWorkspaceContextSummary,
  WorkspaceContextControl,
} from "@athyper/product-neon-shell";
import { useDirectoryFilters } from "@athyper/platform-entity-list-view";
import { useState, type ReactNode } from "react";
import {
  NeonScopeAdapter,
  supportsNeonWorkContextResolver,
} from "./scope-adapters";

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
        applicationName={NEON_APPLICATION_NAME}
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
  initialDirectoryQuery,
}: {
  readonly initialDirectoryQuery?: string;
  readonly activePath?: string;
  readonly onNavigate?: (href: string) => void;
  readonly applicationOnly?: boolean;
  readonly children?: ReactNode;
  readonly client: ReturnType<typeof useApiClient>;
  readonly entityCode: string;
  readonly navigationOnly?: boolean;
  readonly initialDensity?: ListDensity;
}) {
  return (
    <NeonScopeAdapter entityCode={entityCode} initialDirectoryQuery={initialDirectoryQuery}>
      {({ coordinate, directory, scopePending }) => (
        <DirectoryFilterContext.Provider value={directory}>
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
            scopePending={scopePending}
            applicationName={NEON_APPLICATION_NAME}
          />
        </DirectoryFilterContext.Provider>
      )}
    </NeonScopeAdapter>
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
  const client = useApiClient(),
    navigation = useApplicationNavigation();
  return (
    <ScopedNeonEntityList
      client={client}
      entityCode={entityCode}
      applicationOnly
      onNavigate={navigation.push}
      initialDirectoryQuery={initialDirectoryQuery}
      activePath={activePath}
    >
      {children}
    </ScopedNeonEntityList>
  );
}
export { EntityApplicationSection as NeonEntityApplicationSection };

/** Nav-band scope control for entities that publish a workContext requirement (design doc §10.1). Stages Company Code / Operating Organization locally and commits both the shared directory adapter and the list's scope coordinate together on Apply. */
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
  const work = useNeonWorkContext();
  const directory = useDirectoryFilters();
  const requirement = scope.workContext;
  const committedCompanyCodeId = directory?.value.companyCodeIds?.[0];
  const committedOrganizationId = value?.operatingOrganizationId;
  const [pendingCompanyCodeId, setPendingCompanyCodeId] = useState<string>();
  const [pendingOrganizationId, setPendingOrganizationId] = useState<string>();
  const effectiveCompanyCodeId = pendingCompanyCodeId ?? committedCompanyCodeId;
  const effectiveOrganizationId = pendingOrganizationId ?? committedOrganizationId;
  const status =
    operating.status === "loading" || work.status === "loading"
      ? "resolving"
      : operating.status === "error"
        ? "error"
        : "ready";
  const organizationLabel = operating.organizations.find(
    (item) => item.id === effectiveOrganizationId,
  )?.displayName;
  const companyLabel = work.companies.find(
    (item) => item.companyCodeId === effectiveCompanyCodeId,
  )?.code;
  const summary = useWorkspaceContextSummary({
    companyLabel,
    organizationLabel,
    required: true,
  });
  if (!requirement) return null;
  // Registered readers currently require one organization. Unsupported contracts stay closed.
  if (
    !supportsNeonWorkContextResolver(requirement.resolver) ||
    requirement.requiredCoordinates.length !== 1 ||
    requirement.requiredCoordinates[0] !== "operatingOrganizationId"
  )
    return (
      <p role="status">
        This context selector is unavailable for the published requirements.
      </p>
    );
  return (
    <WorkspaceContextControl
      mode="editable"
      status={status}
      summary={summary}
      pendingCompanyCodeId={effectiveCompanyCodeId}
      pendingOperatingOrganizationId={effectiveOrganizationId}
      companies={work.companies}
      organizations={operating.organizations}
      onOpenChange={(open) => {
        setPendingCompanyCodeId(open ? committedCompanyCodeId : undefined);
        setPendingOrganizationId(open ? committedOrganizationId : undefined);
      }}
      onPendingChange={({ companyCodeId, operatingOrganizationId }) => {
        setPendingCompanyCodeId(companyCodeId);
        setPendingOrganizationId(operatingOrganizationId);
      }}
      onApply={() => {
        const organizationId = pendingOrganizationId;
        const organization = organizationId
          ? operating.organizations.find((item) => item.id === organizationId)
          : undefined;
        const nextCompany =
          organization?.companyAssignments.length === 1
            ? organization.companyAssignments[0]?.companyCodeId
            : pendingCompanyCodeId;
        directory?.apply({
          ...(directory?.value ?? {}),
          operatingOrganizationIds: organizationId ? [organizationId] : [],
          companyCodeIds: nextCompany ? [nextCompany] : [],
        });
        onChange(organizationId ? { operatingOrganizationId: organizationId } : undefined);
        setPendingCompanyCodeId(undefined);
        setPendingOrganizationId(undefined);
      }}
      error={
        operating.status === "error"
          ? "Operating-organization access is unavailable"
          : undefined
      }
      retry={operating.retry}
    />
  );
}
