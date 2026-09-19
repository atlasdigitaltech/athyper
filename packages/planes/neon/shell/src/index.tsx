"use client";
import {
  Button,
  CompanyGroups,
  Dialog,
  DialogContent,
} from "@athyper/platform-ui";
import {
  NeonWorkContextController,
  contextPreferenceStore,
  legalEntities,
  type NeonLegalEntity,
  type WorkSelection,
} from "./work-context-state";
import { useDismissablePicker } from "./dismissable-picker";
export {
  createWorkspaceScopeController,
  coordinatesEqual,
  resolvedCoordinate,
  UNRESOLVED as UNRESOLVED_WORKSPACE_SCOPE,
  type WorkspaceScopeController,
  type WorkspaceScopeControllerOptions,
  type WorkspaceScopeCoordinate,
  type WorkspaceScopeState,
  type WorkspaceScopeSurface,
} from "./workspace-scope";
export {
  WorkspaceContextControl,
  useWorkspaceContextSummary,
  type WorkspaceContextControlHandle,
  type WorkspaceContextControlMessages,
  type WorkspaceContextControlProps,
} from "./workspace-context-control";
export {
  WorkspaceContextStatus,
  type WorkspaceContextStatusProps,
} from "./workspace-context-status";

import {
  ApiTransportError,
  neonOperatingOrganizationsOperation,
  neonWorkContextsOperation,
  type ExperienceBootstrap,
  type NeonOperatingOrganization,
  type NeonOperatingOrganizationCapability,
  type NeonOperatingOrganizationCatalog,
  type NeonWorkContextCompany,
  updatePrincipalLocaleOperation,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { CheckIcon } from "@athyper/platform-icons";
import {
  ActivityCenterDataProvider,
  useActivityCenterDataSource,
} from "@athyper/platform-shell-activity-center-data";
import { neonRoutes } from "@athyper/product-neon-navigation";
import {
  PlatformShell,
  ShellContextPickerPanel,
  ShellContextSelector,
  contextDepartureState,
  deriveShellNavigation,
  type NavigationDiagnostic,
} from "@athyper/platform-shell";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type NeonWorkContextSelection = Readonly<
  | { mode: "unresolved" }
  | { mode: "company"; companyCodeId: string; legalEntityId: string }
>;
export interface NeonWorkContextValue {
  readonly status: "loading" | "ready" | "error";
  readonly selection: NeonWorkContextSelection;
  /** Authorized catalog used only by the shared header picker. */
  readonly allCompanies: readonly NeonWorkContextCompany[];
  readonly companies: readonly NeonWorkContextCompany[];
  readonly legalEntities: readonly NeonLegalEntity[];
  readonly legalEntityId?: string;
  readonly generation: number;
  readonly switching: boolean;
  readonly requiresSelection: boolean;
  readonly switchError?: string;
  selectLegalEntity(
    legalEntityId: string,
    companyCodeId?: string,
  ): Promise<boolean>;
  readonly errorRequestId?: string;
  selectCompany(companyCodeId: string): Promise<boolean>;
  retry(): void;
}
export interface NeonWorkContextDiagnostic {
  readonly event:
    | "catalog_loaded"
    | "catalog_failed"
    | "selection_changed"
    | "selection_invalidated";
  readonly tenantId: string;
  readonly principalId: string;
  readonly companyCount?: number;
  readonly mode?: NeonWorkContextSelection["mode"];
  readonly reason?:
    "stored_not_permitted" | "tenant_mismatch" | "request_failed";
  readonly requestId?: string;
}

type OrganizationSelections = Readonly<
  Partial<Record<NeonOperatingOrganizationCapability, string>>
>;
export interface NeonOperatingOrganizationValue {
  readonly status: "loading" | "ready" | "error";
  readonly organizations: readonly NeonOperatingOrganization[];
  readonly selections: OrganizationSelections;
  readonly errorRequestId?: string;
  compatible(
    capability: NeonOperatingOrganizationCapability,
  ): readonly NeonOperatingOrganization[];
  selected(
    capability: NeonOperatingOrganizationCapability,
  ): NeonOperatingOrganization | undefined;
  select(
    capability: NeonOperatingOrganizationCapability,
    organizationId: string,
  ): void;
  clear(capability: NeonOperatingOrganizationCapability): void;
  retry(): void;
}
export interface NeonOperatingOrganizationDiagnostic {
  readonly event:
    | "catalog_loaded"
    | "catalog_failed"
    | "selection_changed"
    | "selection_invalidated";
  readonly tenantId: string;
  readonly principalId: string;
  readonly organizationCount?: number;
  readonly capability?: NeonOperatingOrganizationCapability;
  readonly reason?:
    | "stored_not_permitted"
    | "company_incompatible"
    | "tenant_mismatch"
    | "request_failed";
  readonly requestId?: string;
}

const WorkContext = createContext<NeonWorkContextValue | undefined>(undefined);
const OperatingOrganizationContext = createContext<
  NeonOperatingOrganizationValue | undefined
>(undefined);
const EN = {
  chooseLegalEntity: "Choose legal entity",
  loadingLegalEntities: "Loading legal entities",
  searchLegalEntities: "Search legal entities",
  noLegalEntities: "No operational legal entities available",
  chooseCompany: "Choose company",
  chooseRequiredContext:
    "Choose a legal entity and company to open this workspace.",
  contextHelp: "Select the legal entity you are working in.",
  companyMigrationHelp: "Choose the company for your current work.",
  applyContext: "Apply context",
  switchingContext: "Switching context…",
  finishCommand: "Finish the running command before switching context.",
  discardChanges: "Discard unsaved changes and switch work context?",
  confirmSwitch:
    "Switch work context and reset the current page? Save any unsaved work before continuing.",
  selectionUnavailable:
    "This context is no longer available. Choose an authorized context.",
  switchFailed: "Could not resolve the context. Try again.",
  company: "Company",
  loading: "Loading companies",
  all: "All companies",
  search: "Search companies",
  retry: "Try again",
  unavailable: "Company access is unavailable",
  none: "No companies available",
  noCompanyMatches: "No companies match your search",
  results: "companies available",
  legalEntity: "Legal entity",
  supportReference: "Support reference",
  operatingOrganization: "Operating organization",
  operatingOrganizationHelp:
    "Responsibility scope compatible with the selected company",
  loadingOrganizations: "Loading operating organizations",
  searchOrganizations: "Search operating organizations",
  organizationUnavailable: "Operating-organization access is unavailable",
  noOrganizations: "No compatible operating organizations",
  noOrganizationMatches: "No operating organizations match your search",
  organizationResults: "compatible operating organizations",
  clearOrganization: "All permitted organizations",
  profileNotConfigured: "Profile setup required",
} as const;
export type NeonShellMessages = Readonly<{ [K in keyof typeof EN]: string }>;

export function NeonShell({
  bootstrap,
  initialCollapsed,
  children,
  onNavigationDiagnostic,
  onWorkContextDiagnostic,
  onOperatingOrganizationDiagnostic,
  messages,
}: {
  readonly bootstrap: ExperienceBootstrap;
  readonly principalId?: string;
  readonly initialCollapsed?: boolean;
  readonly children: ReactNode;
  readonly onNavigationDiagnostic?: (event: NavigationDiagnostic) => void;
  readonly onWorkContextDiagnostic?: (event: NeonWorkContextDiagnostic) => void;
  readonly onOperatingOrganizationDiagnostic?: (
    event: NeonOperatingOrganizationDiagnostic,
  ) => void;
  readonly messages?: Partial<NeonShellMessages>;
}) {
  const client = useApiClient(),
    activity = useActivityCenterDataSource({
      client,
      locale: bootstrap.profile.localeCode,
    });
  const labels = { ...EN, ...messages };
  const navigationDiagnostic = useMemo(
    () => onNavigationDiagnostic ?? planeDiagnostic("neon"),
    [onNavigationDiagnostic],
  );
  const navigation = useMemo(
    () => deriveShellNavigation(neonRoutes, bootstrap, navigationDiagnostic),
    [bootstrap, navigationDiagnostic],
  );
  return (
    <NeonWorkContextProvider
      key={`${bootstrap.tenantId}:${bootstrap.principalId}`}
      bootstrap={bootstrap}
      labels={labels}
      onDiagnostic={onWorkContextDiagnostic ?? developmentWorkContextDiagnostic}
    >
      {(work) => (
        <NeonOperatingOrganizationProvider
          bootstrap={bootstrap}
          work={work}
          labels={labels}
          onDiagnostic={
            onOperatingOrganizationDiagnostic ??
            developmentOperatingOrganizationDiagnostic
          }
        >
          <PlatformShell
            localization={bootstrap.localization}
            localePolicy={bootstrap.localePolicy}
            onLocaleChange={(locale) => changeLocale(client, locale)}
            activity={activity}
            applicationName="Neon"
            planeDescriptor="Business Operating Platform"
            planeIconSrc="/brand/neon/app-icon.png"
            planeWordmarkSrc="/brand/neon/identity-lockup.svg"
            persistentDesktopBrand
            initialCollapsed={initialCollapsed}
            tenantId={bootstrap.tenantId}
            principalId={bootstrap.principalId}
            tenantLabel={bootstrap.tenant.displayName}
            tenantSecondaryLabel={bootstrap.tenant.code.toUpperCase()}
            tenantCountryCode={bootstrap.tenant.countryCode}
            tenantLogoAssetRef={bootstrap.tenant.logoAssetRef}
            contextLabel="Business context"
            showOrganizationContext={false}
            accountLabel={bootstrap.identity.displayName}
            accountInitials={bootstrap.identity.initials}
            accountLoginId={bootstrap.identity.secondaryLabel}
            accountEmail={
              bootstrap.identity.secondaryLabel?.includes("@")
                ? bootstrap.identity.secondaryLabel
                : undefined
            }
            transactionContext={neonTransactionContext(work, labels)}
            experienceState={bootstrap.state}
            workContextControl={
              <LegalEntitySelector
                value={work}
                locale={bootstrap.profile.localeCode}
                labels={labels}
              />
            }
            navigation={navigation}
          >
            <ActivityCenterDataProvider value={activity}>
              <NeonContextContent work={work} labels={labels}>
                {children}
              </NeonContextContent>
            </ActivityCenterDataProvider>
          </PlatformShell>
        </NeonOperatingOrganizationProvider>
      )}
    </NeonWorkContextProvider>
  );
}

function NeonWorkContextProvider({
  bootstrap,
  labels,
  onDiagnostic,
  children,
}: {
  readonly bootstrap: ExperienceBootstrap;
  readonly labels: NeonShellMessages;
  readonly onDiagnostic: (event: NeonWorkContextDiagnostic) => void;
  readonly children: (value: NeonWorkContextValue) => ReactNode;
}) {
  const client = useApiClient();
  const [departureError, setDepartureError] = useState<string>();
  const [departureRequest, setDepartureRequest] = useState<
    | {
        readonly target: WorkSelection;
        readonly resolve: (accepted: boolean) => void;
      }
    | undefined
  >();
  const requestDeparture = useCallback(
    (target: WorkSelection): boolean | Promise<boolean> => {
      const departure = contextDepartureState();
      if (departure.busy) {
        setDepartureError(labels.finishCommand);
        return false;
      }
      setDepartureError(undefined);
      if (!departure.dirty) return true;
      return new Promise<boolean>((resolve) =>
        setDepartureRequest({ target, resolve }),
      );
    },
    [labels.finishCommand],
  );
  const resolveDeparture = useCallback((accepted: boolean) => {
    setDepartureRequest((current) => {
      current?.resolve(accepted);
      return undefined;
    });
  }, []);
  useEffect(() => () => resolveDeparture(false), [resolveDeparture]);
  const controller = useMemo(
    () =>
      new NeonWorkContextController({
        tenantId: bootstrap.tenantId,
        load: (signal) => client.request(neonWorkContextsOperation, { signal }),
        preferences: contextPreferenceStore(
          bootstrap.tenantId,
          bootstrap.principalId,
        ),
        canLeave: requestDeparture,
      }),
    [client, bootstrap.tenantId, bootstrap.principalId, requestDeparture],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.refresh();
    return () => controller.dispose();
  }, [controller]);
  const selected =
    state.selection.mode === "legal_entity" ? state.selection : undefined;
  const selection: NeonWorkContextSelection = selected?.companyCodeId
    ? {
        mode: "company",
        companyCodeId: selected.companyCodeId,
        legalEntityId: selected.legalEntityId,
      }
    : { mode: "unresolved" };
  const entities = useMemo(
    () => legalEntities(state.catalog?.companies ?? []),
    [state.catalog],
  );
  const companies = useMemo(
    () =>
      state.catalog?.companies.filter(
        (row) => row.legalEntityId === selected?.legalEntityId,
      ) ?? [],
    [state.catalog, selected?.legalEntityId],
  );
  useEffect(() => {
    if (state.status === "loading") return;
    onDiagnostic({
      event: state.status === "error" ? "catalog_failed" : "catalog_loaded",
      tenantId: bootstrap.tenantId,
      principalId: bootstrap.principalId,
      companyCount: state.catalog?.companies.length ?? 0,
    });
  }, [
    state.catalog,
    state.status,
    bootstrap.tenantId,
    bootstrap.principalId,
    onDiagnostic,
  ]);
  const value: NeonWorkContextValue = {
    status: state.status,
    selection,
    allCompanies: state.catalog?.companies ?? [],
    companies,
    legalEntities: entities,
    legalEntityId: selected?.legalEntityId,
    generation: state.generation,
    switching: state.switching,
    requiresSelection:
      !!state.catalog?.companies.length && !selected?.companyCodeId,
    switchError:
      departureError ??
      (state.error === "invalid_selection"
        ? labels.selectionUnavailable
        : state.error
          ? labels.switchFailed
          : undefined),
    selectLegalEntity: (legalEntityId, companyCodeId) =>
      controller.select({
        mode: "legal_entity",
        legalEntityId,
        ...(companyCodeId ? { companyCodeId } : {}),
      }),
    selectCompany: (companyCodeId) => {
      const company = state.catalog?.companies.find(
        (row) => row.companyCodeId === companyCodeId,
      );
      return company
        ? controller.select({
            mode: "legal_entity",
            legalEntityId: company.legalEntityId,
            companyCodeId,
          })
        : Promise.resolve(false);
    },
    retry: () => {
      setDepartureError(undefined);
      void controller.refresh();
    },
  };
  return (
    <WorkContext.Provider value={value}>
      {children(value)}
      <ContextSwitchConfirmation
        request={departureRequest}
        catalog={state.catalog}
        onResolve={resolveDeparture}
      />
    </WorkContext.Provider>
  );
}

function ContextSwitchConfirmation({
  request,
  catalog,
  onResolve,
}: {
  readonly request?: {
    readonly target: WorkSelection;
    readonly resolve: (accepted: boolean) => void;
  };
  readonly catalog?: import("@athyper/platform-api-client").NeonWorkContextBootstrap;
  readonly onResolve: (accepted: boolean) => void;
}) {
  const target = request?.target;
  const companyCodeId =
    target?.mode === "legal_entity" ? target.companyCodeId : undefined;
  const company =
    companyCodeId
      ? catalog?.companies.find(
          (row) => row.companyCodeId === companyCodeId,
        )
      : undefined;
  const destination = company
    ? `${company.code.toUpperCase()} · ${company.displayName} (${company.legalEntityCode.toUpperCase()} · ${company.legalEntityName})`
    : "the selected work context";
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => !open && onResolve(false)}
    >
      <DialogContent
        title="Discard unsaved changes?"
        description={`Switch to ${destination}. Your unsaved changes will be lost.`}
      >
        <div className="neon-context-switch-dialog__actions">
          <Button variant="secondary" onClick={() => onResolve(false)}>
            Stay
          </Button>
          <Button onClick={() => onResolve(true)}>Discard and switch</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NeonContextContent({
  work,
  labels,
  children,
}: {
  work: NeonWorkContextValue;
  labels: NeonShellMessages;
  children: ReactNode;
}) {
  if (work.status === "loading")
    return <p role="status">{labels.loadingLegalEntities}</p>;
  if (work.status === "error")
    return (
      <p role="alert">
        {labels.unavailable}
        <button type="button" onClick={work.retry}>
          {labels.retry}
        </button>
      </p>
    );
  if (work.requiresSelection)
    return (
      <p role="status">
        {labels.chooseRequiredContext}{" "}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("athyper:work-context-request"),
            )
          }
        >
          {labels.chooseLegalEntity}
        </button>
      </p>
    );
  return (
    <div
      key={work.generation}
      inert={work.switching}
      aria-busy={work.switching || undefined}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}

function NeonOperatingOrganizationProvider({
  bootstrap,
  work,
  labels,
  onDiagnostic,
  children,
}: {
  readonly bootstrap: ExperienceBootstrap;
  readonly work: NeonWorkContextValue;
  readonly labels: NeonShellMessages;
  readonly onDiagnostic: (event: NeonOperatingOrganizationDiagnostic) => void;
  readonly children: ReactNode;
}) {
  const client = useApiClient(),
    [catalog, setCatalog] = useState<NeonOperatingOrganizationCatalog>(),
    [error, setError] = useState<ApiTransportError>(),
    [attempt, setAttempt] = useState(0),
    [selections, setSelections] = useState<OrganizationSelections>({});
  const key = `athyper.neon.operating-organization.v2:${bootstrap.tenantId}:${bootstrap.principalId}:${work.legalEntityId ?? "unresolved"}`;
  const selectedCompanyId =
    work.selection.mode === "company"
      ? work.selection.companyCodeId
      : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(undefined);
    setError(undefined);
    client
      .request(neonOperatingOrganizationsOperation, {
        signal: controller.signal,
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value.tenantId !== bootstrap.tenantId) {
          onDiagnostic({
            event: "catalog_failed",
            tenantId: bootstrap.tenantId,
            principalId: bootstrap.principalId,
            reason: "tenant_mismatch",
          });
          throw new Error(
            "Operating-organization response does not match the active tenant",
          );
        }
        setCatalog(value);
        const restored: Partial<
          Record<NeonOperatingOrganizationCapability, string>
        > = {};
        try {
          const parsed = JSON.parse(readTabPreference(key) ?? "{}") as Record<
            string,
            unknown
          >;
          for (const capability of CAPABILITIES) {
            const id = parsed[capability];
            if (typeof id !== "string") continue;
            const organization = value.organizations.find(
              (item) =>
                item.id === id && item.capabilities.includes(capability),
            );
            if (organization) restored[capability] = id;
            else
              onDiagnostic({
                event: "selection_invalidated",
                tenantId: bootstrap.tenantId,
                principalId: bootstrap.principalId,
                capability,
                reason: "stored_not_permitted",
              });
          }
        } catch {
          writeTabPreference(key, "{}");
        }
        setSelections(Object.freeze(restored));
        onDiagnostic({
          event: "catalog_loaded",
          tenantId: bootstrap.tenantId,
          principalId: bootstrap.principalId,
          organizationCount: value.organizations.length,
        });
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const transport =
          cause instanceof ApiTransportError
            ? cause
            : new ApiTransportError("parse", labels.organizationUnavailable);
        setError(transport);
        onDiagnostic({
          event: "catalog_failed",
          tenantId: bootstrap.tenantId,
          principalId: bootstrap.principalId,
          reason: "request_failed",
          ...(transport.requestId ? { requestId: transport.requestId } : {}),
        });
      });
    return () => controller.abort();
  }, [
    client,
    bootstrap.tenantId,
    bootstrap.principalId,
    key,
    attempt,
    labels.organizationUnavailable,
    onDiagnostic,
  ]);
  useEffect(() => {
    if (!catalog || !selectedCompanyId) return;
    setSelections((current) => {
      let changed = false;
      const next = { ...current };
      for (const capability of CAPABILITIES) {
        const id = current[capability],
          organization = id
            ? catalog.organizations.find((item) => item.id === id)
            : undefined;
        if (
          organization &&
          !organization.companyAssignments.some(
            (assignment) => assignment.companyCodeId === selectedCompanyId,
          )
        ) {
          delete next[capability];
          changed = true;
          onDiagnostic({
            event: "selection_invalidated",
            tenantId: bootstrap.tenantId,
            principalId: bootstrap.principalId,
            capability,
            reason: "company_incompatible",
          });
        }
      }
      if (changed) writeTabPreference(key, JSON.stringify(next));
      return changed ? Object.freeze(next) : current;
    });
  }, [
    catalog,
    selectedCompanyId,
    key,
    bootstrap.tenantId,
    bootstrap.principalId,
    onDiagnostic,
  ]);
  const compatible = useCallback(
    (capability: NeonOperatingOrganizationCapability) => {
      const rows =
        catalog?.organizations.filter((organization) =>
          organization.capabilities.includes(capability),
        ) ?? [];
      return selectedCompanyId
        ? rows.filter((organization) =>
            organization.companyAssignments.some(
              (assignment) => assignment.companyCodeId === selectedCompanyId,
            ),
          )
        : rows;
    },
    [catalog, selectedCompanyId],
  );
  const commit = useCallback(
    (
      capability: NeonOperatingOrganizationCapability,
      organizationId?: string,
    ) => {
      setSelections((current) => {
        const next = { ...current };
        if (organizationId) next[capability] = organizationId;
        else delete next[capability];
        writeTabPreference(key, JSON.stringify(next));
        return Object.freeze(next);
      });
      onDiagnostic({
        event: "selection_changed",
        tenantId: bootstrap.tenantId,
        principalId: bootstrap.principalId,
        capability,
      });
    },
    [key, bootstrap.tenantId, bootstrap.principalId, onDiagnostic],
  );
  const value = useMemo<NeonOperatingOrganizationValue>(
    () => ({
      status: error ? "error" : catalog ? "ready" : "loading",
      organizations: catalog?.organizations ?? [],
      selections,
      ...(error?.requestId ? { errorRequestId: error.requestId } : {}),
      compatible,
      selected: (capability) => {
        const id = selections[capability];
        return id
          ? compatible(capability).find(
              (organization) => organization.id === id,
            )
          : undefined;
      },
      select: (capability, organizationId) => {
        if (
          compatible(capability).some(
            (organization) => organization.id === organizationId,
          )
        )
          commit(capability, organizationId);
      },
      clear: (capability) => commit(capability),
      retry: () => setAttempt((value) => value + 1),
    }),
    [catalog, error, selections, compatible, commit],
  );
  return (
    <OperatingOrganizationContext.Provider value={value}>
      {children}
    </OperatingOrganizationContext.Provider>
  );
}

function LegalEntitySelector({
  value,
  labels,
}: {
  readonly value: NeonWorkContextValue;
  readonly locale: string;
  readonly labels: NeonShellMessages;
}) {
  const [query, setQuery] = useState("");
  const selected = value.legalEntities.find(
    (row) => row.id === value.legalEntityId,
  );
  const selectedCompanyId =
    value.selection.mode === "company" ? value.selection.companyCodeId : "";
  const name = selected
    ? `${selected.code.toUpperCase()} · ${selected.displayName}`
    : labels.chooseLegalEntity;
  const logoAssetRef = value.companies.find(
    (row) => row.companyCodeId === selectedCompanyId,
  )?.logoAssetRef;
  const choices = value.allCompanies.map((company) => ({
    ...company,
    legalEntityLogoUrl: company.logoAssetRef,
  }));
  if (value.status === "loading")
    return <span role="status">{labels.loadingLegalEntities}</span>;
  if (value.status === "error")
    return (
      <span role="alert">
        {labels.unavailable}
        <button type="button" onClick={value.retry}>
          {labels.retry}
        </button>
      </span>
    );
  if (!value.legalEntities.length)
    return <span role="status">{labels.noLegalEntities}</span>;
  return (
    <ShellContextSelector
      ariaLabel={`${labels.legalEntity}: ${name}`}
      name={name}
      logoAssetRef={logoAssetRef}
      logoOrName
      interactive={
        value.legalEntities.length > 1 ||
        value.companies.length > 1 ||
        value.requiresSelection
      }
      respondToWorkContextRequest
      hoverLines={
        selected ? [`${selected.code} · ${selected.displayName}`] : []
      }
      selectionRevision={value.generation}
      onClose={() => setQuery("")}
    >
      <ShellContextPickerPanel
        className="neon-company-picker__panel"
        title={labels.chooseLegalEntity}
        description="Choose a company within an authorized legal entity."
      >
        <CompanyGroups
          companies={choices}
          selectedId={selectedCompanyId || undefined}
          query={query}
          onQueryChange={setQuery}
          searchLabel={labels.search}
          showAll={false}
          onSelect={(companyCodeId) => {
            if (companyCodeId) void value.selectCompany(companyCodeId);
          }}
        />
        {value.switching ? (
          <p role="status">{labels.switchingContext}</p>
        ) : null}
        {value.switchError ? <p role="alert">{value.switchError}</p> : null}
      </ShellContextPickerPanel>
    </ShellContextSelector>
  );
}

export function NeonOperatingOrganizationSelector({
  capability,
  locale = "en",
  messages,
}: {
  readonly capability: NeonOperatingOrganizationCapability;
  readonly locale?: string;
  readonly messages?: Partial<NeonShellMessages>;
}) {
  const value = useNeonOperatingOrganization(),
    labels = { ...EN, ...messages },
    [query, setQuery] = useState(""),
    details = useRef<HTMLDetailsElement>(null),
    search = useRef<HTMLInputElement>(null);
  useDismissablePicker(details, search, () => setQuery(""));
  const resolvedLocale = useMemo(() => safeLocale(locale), [locale]),
    collator = useMemo(
      () =>
        new Intl.Collator(resolvedLocale, {
          usage: "search",
          sensitivity: "base",
        }),
      [resolvedLocale],
    );
  const selected = value.selected(capability),
    compatible = value.compatible(capability),
    soleOrganizationId =
      compatible.length === 1 ? compatible[0]!.id : undefined;
  useEffect(() => {
    if (value.status === "ready" && !selected && soleOrganizationId)
      value.select(capability, soleOrganizationId);
  }, [value, capability, selected, soleOrganizationId]);
  const resolvedSelected =
      selected ?? (soleOrganizationId ? compatible[0] : undefined),
    normalized = query.trim().toLocaleLowerCase(resolvedLocale),
    organizations = compatible
      .filter(
        (organization) =>
          !normalized ||
          [
            organization.code,
            organization.displayName,
            organization.organizationKind,
            ...organization.path,
          ].some((candidate) =>
            candidate.toLocaleLowerCase(resolvedLocale).includes(normalized),
          ),
      )
      .sort((left, right) =>
        collator.compare(left.displayName, right.displayName),
      );
  const choose = (action: () => void) => {
    action();
    setQuery("");
    if (details.current) details.current.open = false;
  };
  if (value.status === "loading")
    return (
      <span
        className="neon-organization-context"
        role="status"
        aria-live="polite"
      >
        {labels.loadingOrganizations}
      </span>
    );
  if (value.status === "error")
    return (
      <span className="neon-organization-context neon-organization-context--error">
        <span>{labels.organizationUnavailable}</span>
        <button type="button" onClick={value.retry}>
          {labels.retry}
        </button>
        {value.errorRequestId ? (
          <small>
            {labels.supportReference}: {value.errorRequestId}
          </small>
        ) : null}
      </span>
    );
  if (!organizations.length)
    return (
      <span className="neon-organization-context" role="status">
        {labels.noOrganizations}
      </span>
    );
  return (
    <details ref={details} className="neon-organization-picker">
      <summary
        aria-label={`${labels.operatingOrganization}: ${resolvedSelected?.displayName ?? labels.clearOrganization}`}
      >
        {labels.operatingOrganization}:{" "}
        <strong>
          {resolvedSelected?.displayName ?? labels.clearOrganization}
        </strong>
        {soleOrganizationId ? <small>Automatically resolved</small> : null}
      </summary>
      <div className="neon-organization-picker__panel">
        <p className="neon-organization-picker__help">
          {labels.operatingOrganizationHelp}
        </p>
        <label>
          {labels.searchOrganizations}
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            autoComplete="off"
          />
        </label>
        <p aria-live="polite">
          {organizations.length} {labels.organizationResults}
        </p>
        <ul>
          {compatible.length > 1 ? (
            <li>
              <button
                type="button"
                aria-pressed={!resolvedSelected}
                onClick={() => choose(() => value.clear(capability))}
              >
                <span>
                  {!resolvedSelected ? <CheckIcon size={14} /> : null}
                  {labels.clearOrganization}
                </span>
              </button>
            </li>
          ) : null}
          {organizations.map((organization) => (
            <li key={organization.id}>
              <button
                type="button"
                aria-pressed={resolvedSelected?.id === organization.id}
                onClick={() =>
                  choose(() => value.select(capability, organization.id))
                }
              >
                <strong>
                  {resolvedSelected?.id === organization.id ? (
                    <CheckIcon size={14} />
                  ) : null}
                  {organization.displayName}
                </strong>
                <span>
                  {organization.code} · {organization.path.join(" / ")}
                </span>
                {capability === "procurement" &&
                !organization.procurementProfileConfigured ? (
                  <small>{labels.profileNotConfigured}</small>
                ) : null}
                {capability === "sales" &&
                !organization.salesProfileConfigured ? (
                  <small>{labels.profileNotConfigured}</small>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {!organizations.length ? (
          <p role="status">{labels.noOrganizationMatches}</p>
        ) : null}
      </div>
    </details>
  );
}

export function useNeonWorkContext(): NeonWorkContextValue {
  const value = useContext(WorkContext);
  if (!value)
    throw new Error("useNeonWorkContext must be used inside NeonShell");
  return value;
}
export function useNeonOperatingOrganization(): NeonOperatingOrganizationValue {
  const value = useContext(OperatingOrganizationContext);
  if (!value)
    throw new Error(
      "useNeonOperatingOrganization must be used inside NeonShell",
    );
  return value;
}
const CAPABILITIES = Object.freeze([
  "finance",
  "procurement",
  "people",
  "sales",
  "operations",
  "warehouse",
  "projects",
] as const satisfies readonly NeonOperatingOrganizationCapability[]);
function planeDiagnostic(plane: string) {
  return (event: NavigationDiagnostic) => {
    const production =
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV === "production";
    (production ? console.error : console.warn)(
      production ? "[navigation-telemetry]" : "[navigation-warning]",
      { plane, ...event },
    );
  };
}
function developmentWorkContextDiagnostic(event: NeonWorkContextDiagnostic) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("athyper:telemetry", {
      detail: { ...event, event: `neon.work_context.${event.event}` },
    }),
  );
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname.endsWith(".local")
  )
    console.info("[neon/work-context]", event);
}
function developmentOperatingOrganizationDiagnostic(
  event: NeonOperatingOrganizationDiagnostic,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("athyper:telemetry", {
      detail: { ...event, event: `neon.operating_context.${event.event}` },
    }),
  );
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname.endsWith(".local")
  )
    console.info("[neon/operating-context]", event);
}
function safeLocale(value: string): string {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? "en";
  } catch {
    return "en";
  }
}
async function changeLocale(
  client: ReturnType<typeof useApiClient>,
  localeCode: import("@athyper/platform-i18n").SupportedLocale,
) {
  await client.request(updatePrincipalLocaleOperation, {
    body: { localeCode },
  });
  document.cookie = `athyper_locale=${localeCode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
}
function neonTransactionContext(
  value: NeonWorkContextValue,
  labels: NeonShellMessages,
) {
  const selection = value.selection;
  const selected =
    selection.mode === "company"
      ? value.companies.find(
          (item) => item.companyCodeId === selection.companyCodeId,
        )
      : undefined;
  const entity = value.legalEntities.find(
    (row) => row.id === value.legalEntityId,
  );
  return {
    label: labels.legalEntity,
    value:
      value.status === "loading"
        ? labels.loadingLegalEntities
        : value.status === "error"
          ? labels.unavailable
          : entity
            ? `${entity.code} · ${entity.displayName}`
            : labels.chooseLegalEntity,
    ...(selected
      ? {
          secondaryLabel: `${labels.company}: ${selected.code} · ${selected.displayName}`,
        }
      : { secondaryLabel: labels.chooseCompany }),
    changeable:
      value.status === "ready" &&
      (value.legalEntities.length > 1 ||
        value.companies.length > 1 ||
        value.requiresSelection),
  };
}
function readTabPreference(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeTabPreference(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* Optional persistence. */
  }
}
