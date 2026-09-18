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
} from "@athyper/product-neon-shell";
import { type ReactNode } from "react";
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
