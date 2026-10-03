// Page-type fixtures for the application-wide visual baseline
// (tests/foundation-browser/ui-baseline.spec.ts). Each surface renders the real
// shared runtime with deterministic data; `?surface=` picks one.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ChoiceChips,
  ChoiceSelect,
  FilterChipGroup,
  FormField,
  Input,
  PanelContextRow,
  PanelFooter,
  PanelHeader,
  SearchField,
  SearchableSelect,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../packages/platform/foundation/ui/src/index";
import {
  FilterIcon,
  MoreVerticalIcon,
  PlusIcon,
} from "../../../packages/platform/foundation/icons/src/index";
import { createEntityReferenceMessages } from "../../../packages/platform/foundation/i18n/src/entity-reference-messages";
import { entityEnglishMessages } from "../../../packages/platform/foundation/i18n/src/entity-messages";
import { entityFallbackMessages, entityMessages } from "../../../packages/platform/foundation/i18n/src/entity-catalogs";
import { createEffectiveLocalization, mergeCatalogs } from "../../../packages/platform/foundation/i18n/src/index";
import { IntlProvider } from "../../../packages/platform/foundation/i18n/src/react";
import { shellEnglishMessages, shellMessages } from "../../../packages/platform/shell/shell/src/messages";
import { EntityListRuntime } from "../../../packages/platform/entity/runtime/list-view/src/index";
import {
  entityListDescriptorOperation,
  entityListOperation,
} from "../../../packages/platform/foundation/api-client/src/entity-list";
import { EntityRecordHeader } from "../../../packages/platform/entity/runtime/form-detail/src/record-header";
import { RelatedSection } from "../../../packages/platform/entity/runtime/form-detail/src/related-entity-section";
import { EntityDataSurface } from "../../../packages/platform/entity/runtime/form-detail/src/data-surface";
import { DataValidationProvider } from "../../../packages/platform/entity/runtime/form-detail/src/data-validation";
import {
  EntityPageLayout,
  useRecordPage,
} from "../../../packages/platform/shell/shell/src/entity-page-layout";
import { AtlasWorkspace } from "../../../packages/platform/shell/shell/src/atlas-workspace";
import { PlatformHome, ShellHomeIdentityProvider } from "../../../packages/platform/shell/shell/src/home";
import { AccessProvider } from "../../../packages/platform/shell/shell-runtime/src/index";
import { ApiClientProvider, ApplicationNavigationProvider, PermissionProvider, SessionIdentityProvider } from "../../../packages/platform/shell/app-foundation/src/index";
import { ModuleLanding, WorkspaceLanding } from "../../../packages/platform/shell/dashboard/src/workspace-page";
import { WorkspaceModuleTabs } from "../../../packages/platform/shell/dashboard/src/workspace-navigation";
import { quickAccessStorageKey } from "../../../packages/platform/shell/shell/src/quick-access";
import { PLATFORM_CATALOG_ROUTES } from "../../../packages/contracts/platform/navigation/src/generated-catalog";
import { AtlasAnswerProvider } from "../../../packages/platform/ai/agent-ui/src";
import { ShellPersonalizationScopeProvider } from "../../../packages/platform/shell/shell/src/personalization-scope";
import { ShellActivityCenter } from "../../../packages/platform/shell/shell/src/activity-center";
import { createHttpClient } from "../../../packages/platform/foundation/api-client/src/index";
import {
  ActivityCenterDataProvider,
  useActivityCenterDataSource,
} from "../../../packages/platform/shell/activity-center-data/src/index";
import { ActivityCenterPage } from "../../../packages/platform/shell/activity-center-data/src/page";

const countries = [
  ["AF", "Afghanistan", "AFG", "Asia", "Southern Asia", "93"],
  ["AX", "Åland Islands", "ALA", "Europe", "Northern Europe", "358"],
  ["AL", "Albania", "ALB", "Europe", "Southern Europe", "355"],
  ["DZ", "Algeria", "DZA", "Africa", "Northern Africa", "213"],
  ["AD", "Andorra", "AND", "Europe", "Southern Europe", "376"],
  ["AO", "Angola", "AGO", "Africa", "Middle Africa", "244"],
  ["AR", "Argentina", "ARG", "Americas", "South America", "54"],
  ["AU", "Australia", "AUS", "Oceania", "Australia and New Zealand", "61"],
  ["AT", "Austria", "AUT", "Europe", "Western Europe", "43"],
  ["BD", "Bangladesh", "BGD", "Asia", "Southern Asia", "880"],
  ["BE", "Belgium", "BEL", "Europe", "Western Europe", "32"],
  ["BR", "Brazil", "BRA", "Americas", "South America", "55"],
] as const;

const referenceMessages = createEntityReferenceMessages(
  (key) => entityEnglishMessages[key],
);

function Kit() {
  const [layout, setLayout] = useState("table");
  const [statuses, setStatuses] = useState<readonly string[]>(["active"]);
  const [category, setCategory] = useState("all");
  const [country, setCountry] = useState("GB");
  const [query, setQuery] = useState("north");
  const [pageSize, setPageSize] = useState("25");
  const [period, setPeriod] = useState("last:7");
  return (
    <main className="ui-baseline-kit" aria-labelledby="kit-title">
      <h1 id="kit-title">Design system kit</h1>
      <section aria-labelledby="kit-actions">
        <h2 id="kit-actions">Actions</h2>
        <div className="ui-baseline-kit__row">
          <Button>Save</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Reset</Button>
          <Button variant="danger">Delete</Button>
          <Button size="small" variant="secondary">
            Small
          </Button>
          <Button disabled>Disabled</Button>
          <Button size="icon" variant="ghost" aria-label="More actions">
            <MoreVerticalIcon size={18} />
          </Button>
        </div>
      </section>
      <section aria-labelledby="kit-fields">
        <h2 id="kit-fields">Fields</h2>
        <div className="ui-baseline-kit__grid">
          <FormField label="Name" required hint="As shown on documents">
            {(control) => (
              <Input {...control} defaultValue="Northwind Industrial" />
            )}
          </FormField>
          <FormField label="Email" error="Enter a complete email address">
            {(control) => (
              <Input {...control} aria-invalid defaultValue="north@" />
            )}
          </FormField>
          <FormField label="Country">
            {(control) => (
              <SearchableSelect
                id={control.id}
                label="Country"
                value={country}
                onChange={setCountry}
                messages={referenceMessages}
                options={[
                  { value: "GB", label: "United Kingdom" },
                  { value: "MY", label: "Malaysia" },
                  { value: "AE", label: "United Arab Emirates" },
                ]}
              />
            )}
          </FormField>
          <SearchField
            label="Search countries"
            value={query}
            onValueChange={setQuery}
            onClear={() => setQuery("")}
          />
          <FormField label="Rows per page">
            {(control) => (
              <ChoiceSelect
                id={control.id}
                value={pageSize}
                onChange={setPageSize}
                options={["10", "25", "50", "100"].map((size) => ({
                  value: size,
                  label: size,
                }))}
              />
            )}
          </FormField>
          <FormField label="Period">
            {(control) => (
              <ChoiceSelect
                id={control.id}
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "today", label: "Today", group: "Days" },
                  { value: "last:7", label: "Last 7 days", group: "Days" },
                  { value: "this_week", label: "This week", group: "Weeks" },
                  { value: "this_month", label: "This month", group: "Months" },
                  {
                    value: "custom",
                    label: "Custom range",
                    group: "Custom",
                    disabled: true,
                  },
                ]}
              />
            )}
          </FormField>
        </div>
      </section>
      <section aria-labelledby="kit-choices">
        <h2 id="kit-choices">Choices</h2>
        <div className="ui-baseline-kit__stack">
          <SegmentedControl
            label="Layout"
            value={layout}
            onValueChange={setLayout}
            options={[
              { value: "table", label: "Table" },
              { value: "cards", label: "Cards" },
              { value: "compact", label: "Compact" },
            ]}
          />
          <ChoiceChips
            label="Status"
            multiple
            values={statuses}
            onValuesChange={setStatuses}
            items={[
              { value: "active", label: "Active" },
              { value: "draft", label: "Draft" },
              { value: "retired", label: "Retired" },
            ]}
          />
          <FilterChipGroup
            label="Category"
            value={category}
            onValueChange={setCategory}
            items={[
              { value: "all", label: "All", count: 24 },
              { value: "contracts", label: "Contracts", count: 9 },
              { value: "invoices", label: "Invoices", count: 15 },
            ]}
          />
          <label className="ui-baseline-kit__check">
            <Checkbox defaultChecked /> Include archived records
          </label>
        </div>
      </section>
      <section aria-labelledby="kit-navigation">
        <h2 id="kit-navigation">Navigation and status</h2>
        <Tabs defaultValue="overview">
          <TabsList aria-label="Record views">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="addresses">Addresses</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview content</TabsContent>
          <TabsContent value="addresses">Addresses content</TabsContent>
          <TabsContent value="activity">Activity content</TabsContent>
        </Tabs>
        <div className="ui-baseline-kit__row">
          <Badge>Draft</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Pending review</Badge>
          <Badge tone="danger">Blocked</Badge>
        </div>
      </section>
      <section aria-labelledby="kit-panel">
        <h2 id="kit-panel">Panel</h2>
        <Card className="ui-baseline-kit__panel">
          <PanelHeader
            icon={<FilterIcon size={18} />}
            title="Filters"
            subtitle="Countries"
          />
          <PanelContextRow
            scope={{
              kind: "record",
              label: "247 records",
              detail: "2 filters applied",
            }}
          />
          <p>Panel body content follows the shared panel anatomy.</p>
          <PanelFooter>
            <Button variant="ghost">Reset</Button>
            <Button>Apply filters</Button>
          </PanelFooter>
        </Card>
      </section>
    </main>
  );
}

const listColumns = [
  "code",
  "name",
  "code3",
  "region",
  "subregion",
  "calling_code",
  "status",
];
const listLabels: Record<string, readonly [string, Record<string, unknown>?]> =
  {
    code: ["ISO alpha-2"],
    name: ["Name", { semanticRole: "title" }],
    code3: ["ISO alpha-3"],
    region: ["Region"],
    subregion: ["Subregion", { cardPriority: "primary" }],
    calling_code: ["Calling code"],
    status: [
      "Status",
      { semanticRole: "status", statusTones: { active: "success" } },
    ],
  };
const listDescriptor = {
  schemaVersion: 1,
  plane: "neon",
  entity: {
    code: "country",
    label: "Country",
    pluralLabel: "Countries",
    identityField: "code",
    detailRouteTemplate: "/countries/:recordId",
  },
  revision: {
    release: 1,
    descriptorHash: "a".repeat(64),
    surfaceHash: "b".repeat(64),
  },
  surface: {
    key: "list",
    title: "Countries",
    defaultState: {
      filters: [],
      sort: [{ field: "name", direction: "asc" }],
      columns: listColumns,
      density: "comfortable",
      mode: "table",
    },
    supportedModes: ["table", "compact"],
    search: { minimumQueryLength: 1 },
    filterPresentation: {
      quickFields: [{ field: "region", defaultOperator: "eq" }],
      source: "metadata",
      allowUserPinning: true,
    },
  },
  fields: [
    ...listColumns.map((key, index) => ({
      key,
      label: listLabels[key]![0],
      ...(listLabels[key]![1] ?? {}),
      valueKind: "string",
      defaultVisible: true,
      defaultOrder: index,
      filterOperators: ["contains", "eq"],
      sortable: true,
      groupable: false,
      aggregations: [],
    })),
    // Hidden technical fields, as real entities have: they appear only in pickers.
    ...[
      { key: "updated_at", label: "Updated at", valueKind: "datetime" },
      { key: "version", label: "Version", valueKind: "integer" },
    ].map((field, index) => ({
      ...field,
      defaultVisible: false,
      defaultOrder: listColumns.length + index,
      filterOperators: ["eq"],
      sortable: true,
      groupable: false,
      aggregations: [],
    })),
  ],
  actions: [],
  scope: {
    status: "ready",
    labels: [
      { key: "access", label: "Scope", value: "All permitted tenant records" },
    ],
    fingerprint: "c".repeat(64),
  },
  limits: {
    defaultPageSize: 25,
    allowedPageSizes: [25, 50],
    maxSortLevels: 3,
    countMode: "none",
  },
};
const listRows = countries.map(
  ([code, name, code3, region, subregion, calling_code], index) => ({
    id: `country-${index}`,
    values: {
      code,
      name,
      code3,
      region,
      subregion,
      calling_code,
      status: "active",
    },
  }),
);
const listClient = {
  request: async (operation: unknown) => {
    if (operation === entityListDescriptorOperation) return listDescriptor;
    if (operation === entityListOperation)
      return {
        schemaVersion: 1,
        descriptorHash: "a".repeat(64),
        scopeFingerprint: "c".repeat(64),
        queryHash: "d".repeat(64),
        rows: listRows,
        pagination: {
          pageSize: 25,
          hasNext: false,
          hasPrevious: false,
          countMode: "none",
        },
      };
    throw new Error("Unexpected fixture operation");
  },
};

const recordHeader = {
  title: "Northwind Industrial Supplies Ltd",
  entityLabel: "Business Partner",
  iconKey: "contact",
  code: "CATL-BP-001",
  badges: [
    { label: "Supplier", tone: "neutral" },
    { label: "Active", tone: "success" },
  ],
  context: [
    { key: "organization", label: "Organization", value: "CirrusAtlantic UK" },
    { key: "as-of", label: "As of", value: "2026-09-08" },
  ],
  actions: [
    {
      key: "change",
      label: "Propose change",
      placement: "primary",
      href: "#change",
    },
    {
      key: "role",
      label: "Add supplier role",
      placement: "overflow",
      href: "#role",
    },
  ],
  sections: [
    "Overview",
    "Identity",
    "Contacts",
    "Addresses",
    "Banking",
    "Activity",
  ].map((label, index) => ({
    key: label.toLowerCase(),
    label,
    placement: index < 4 ? "direct" : "overflow",
    count: index === 0 ? undefined : index,
  })),
} as const;
const field = (
  key: string,
  label: string,
  widget: string,
  columnSpan: number,
  extra: Record<string, unknown> = {},
) => ({
  control: "input",
  key,
  valueKey: key,
  label,
  widget,
  required: false,
  columnSpan,
  ...extra,
});
const recordSurface = {
  schemaVersion: 1,
  key: "details",
  title: "Details",
  sections: [
    {
      key: "identity",
      title: "Identity",
      columns: 12,
      fields: [
        field("legal_name", "Legal name", "text", 6, { required: true }),
        field("trading_name", "Trading name", "text", 6),
        field("registration", "Registration number", "text", 4),
        field("incorporated", "Incorporated on", "date", 4),
        field("employees", "Employees", "integer", 4),
        field("summary", "Summary", "textarea", 12),
        field("preferred", "Preferred supplier", "checkbox", 12),
      ],
    },
    {
      key: "contact",
      title: "Contact",
      columns: 12,
      fields: [
        field("email", "Email", "text", 6),
        field("website", "Website", "url", 6),
      ],
    },
  ],
};
const recordAnswers = {
  legal_name: "Northwind Industrial Supplies Ltd",
  trading_name: "Northwind",
  registration: "08234519",
  incorporated: "2011-04-12",
  employees: 240,
  summary:
    "Industrial fasteners and maintenance supplies for manufacturing sites across the UK.",
  preferred: true,
  email: "accounts@northwind.example",
  website: "https://northwind.example",
};

function RecordPage() {
  useRecordPage();
  const [section, setSection] = useState("overview");
  const [answers, setAnswers] =
    useState<Record<string, unknown>>(recordAnswers);
  return (
    <>
      <EntityRecordHeader
        header={recordHeader as never}
        activeSection={section}
        onSelectSection={setSection}
      />
      <DataValidationProvider>
        <EntityDataSurface
          surface={recordSurface as never}
          surfaces={[recordSurface as never]}
          answers={answers as never}
          onChange={setAnswers as never}
        />
      </DataValidationProvider>
    </>
  );
}

function Record() {
  return (
    <EntityPageLayout
      collectionHeader={<h1>Business Partners</h1>}
      collectionNavigation={<nav aria-label="Business Partners">Manage</nav>}
    >
      <RecordPage />
    </EntityPageLayout>
  );
}

// Sample Atlas history, relative to the fixed baseline clock (2026-09-30T09:30Z).
const atlasThreads = [
  { threadId: "t1", title: "Explain the saved information on Northwind Industrial and what changed this week", updatedAt: "2026-09-30T08:10:00Z", rowVersion: 1, status: "active" },
  { threadId: "t2", title: "Compare snapshots of Acme Trading", updatedAt: "2026-09-29T15:00:00Z", rowVersion: 1, status: "active" },
  { threadId: "t3", title: "Which suppliers are waiting for approval?", updatedAt: "2026-09-21T10:00:00Z", rowVersion: 1, status: "active" },
];
const atlasAction = (proposalId: string, summary: string, status: string, createdAt: string) => ({
  proposalId, threadId: "t2", runId: "r", toolCode: "entity.snapshot.compare", toolVersion: "1", summary,
  access: "read", risk: "low", autonomyDecision: "assist", affectedEntityType: "business_partner",
  policyRevision: "p1", profileRevision: "1", authorizationEpoch: 1, confirmationRequired: false,
  status, createdAt, evidenceRefs: [],
});
// One conversation as Atlas returns it: deterministic text, typed results and citations.
const citation = { entityCode: "country", recordId: "AF", revision: "r3", descriptorHash: "h", toolCode: "entity_read_comments" };
const atlasMessages = [
  { messageId: "m1", threadId: "t2", sequence: 1, role: "user", status: "completed", text: "Show the saved comments on Afghanistan", results: [], runId: null, createdAt: "2026-09-30T08:14:00Z", terminalAt: null },
  {
    messageId: "m2", threadId: "t2", sequence: 2, role: "assistant", status: "completed", runId: "run-1", createdAt: "2026-09-30T08:15:00Z", terminalAt: null,
    text: "Saved comments — 0 authorized root comments returned.\n\nNo visible saved root comments were returned on this page.\n\nNo further page was returned within this scope.\n\nOnly saved comments visible to the current user are included. Read reply threads separately.",
    results: [{ coverage: "authorized_root_comments", items: [], hasMore: false, note: "Only saved comments visible to the current user are included." }],
    answer: {
      text: "", threadId: "t2", publicModelId: "fixture", attachmentCitations: [], actions: [],
      citations: [citation, { ...citation, revision: "r2" }, { ...citation, revision: "r1" }],
      envelope: { schemaVersion: 1, kind: "brief", summary: "Saved comments — 0 authorized root comments returned.\n\nNo visible saved root comments were returned on this page.", findingIds: [], evidenceIds: ["record:0", "record:1", "record:2"] },
    },
  },
  { messageId: "m5", threadId: "t2", sequence: 3, role: "user", status: "completed", text: "Is Afghanistan's calling code correct?", results: [], runId: null, createdAt: "2026-09-30T08:25:00Z", terminalAt: null },
  {
    // Mixed answer: a workspace record and an external source, statement by statement.
    messageId: "m6", threadId: "t2", sequence: 4, role: "assistant", status: "completed", runId: "run-3", createdAt: "2026-09-30T08:26:00Z", terminalAt: null,
    text: "The record's calling code is 93, which matches the published ITU assignment.", results: [],
    answer: {
      text: "", threadId: "t2", publicModelId: "fixture", attachmentCitations: [], actions: [],
      citations: [{ ...citation, toolCode: "entity_read_record" }],
      externalCitations: [{ sourceId: "itu", title: "ITU-T E.164 country codes", url: "https://www.itu.int/en/ITU-T/inr/Pages/default.aspx", publisher: "ITU", retrievedAt: "2026-09-30T08:00:00Z" }],
      envelope: {
        schemaVersion: 1, kind: "brief", summary: "The record's calling code is 93, which matches the published ITU assignment.", findingIds: [], evidenceIds: ["record:0", "external:0"],
        statements: [
          { text: "Afghanistan's saved calling code is 93.", evidenceIds: ["record:0"] },
          { text: "That matches the code ITU assigns to Afghanistan.", evidenceIds: ["external:0"] },
        ],
      },
    },
  },
  { messageId: "m3", threadId: "t2", sequence: 5, role: "user", status: "completed", text: "Compare the last two snapshots", results: [], runId: null, createdAt: "2026-09-30T08:30:00Z", terminalAt: null },
  {
    messageId: "m4", threadId: "t2", sequence: 6, role: "assistant", status: "completed", runId: "run-2", createdAt: "2026-09-30T08:31:00Z", terminalAt: null,
    text: "Snapshot comparison: s1 → s2.",
    results: [{
      coverage: "currently_authorized_captured_root_fields", from: "2026-09-20T10:00:00Z", to: "2026-09-29T10:00:00Z",
      fields: [
        { key: "name", label: "Name", changed: false, before: { state: "value", value: "Afghanistan" }, after: { state: "value", value: "Afghanistan" } },
        { key: "region", label: "Region", changed: true, before: { state: "value", value: "Asia" }, after: { state: "value", value: "Southern Asia" } },
        { key: "calling_code", label: "Calling code", changed: false, before: { state: "uncaptured" }, after: { state: "value", value: "93" } },
      ],
    }],
  },
];
function Atlas() {
  const client = {
    messages: async () => ({ items: atlasMessages, nextCursor: null }),
    experience: async () => null,
    threads: async (_status?: string, _signal?: AbortSignal, query?: string) => ({
      items: query
        ? atlasThreads.filter((thread) => thread.title.toLowerCase().includes(query.toLowerCase()))
        : atlasThreads,
    }),
    actionHistory: async () => [
      atlasAction("a1b2c3d4-0000", "Compared record snapshots", "failed", "2026-09-30T08:36:00Z"),
      atlasAction("b2c3d4e5-0000", "Compared record snapshots", "completed", "2026-09-30T08:35:00Z"),
      atlasAction("c3d4e5f6-0000", "Read business partner record", "completed", "2026-09-29T12:00:00Z"),
    ],
  };
  return (
    <AtlasAnswerProvider options={{ client } as never}>
      <ShellPersonalizationScopeProvider
        plane="neon"
        tenantId="tenant"
        principalId="user"
      >
        <AtlasWorkspace
          mode={new URLSearchParams(location.search).has("full") ? "fullscreen" : "dock"}
          planeName="Neon"
          currentPath="/app/entity/country"
          pinned={false}
          onPinnedChange={() => {}}
          onClose={() => {
            const counted = window as unknown as { atlasClosed?: number };
            counted.atlasClosed = (counted.atlasClosed ?? 0) + 1;
          }}
        />
      </ShellPersonalizationScopeProvider>
    </AtlasAnswerProvider>
  );
}

const homeAccess = {
  sessionState: "authenticated",
  contextAvailable: true,
  entitledModules: new Set<string>(),
  permissions: new Set(["atlas.use"]),
  features: {},
  knownModules: new Set<string>(),
} as const;
/** Home as a plane renders it: suggestions, search, quick actions and workspaces. */
function Home() {
  const client = {
    messages: async () => ({ items: [], nextCursor: null }),
    experience: async () => null,
    threads: async () => ({ items: atlasThreads }),
    actionHistory: async () => [],
  };
  const workspaces = [
    { name: "Procurement", description: "Connect to 4 authorized collaboration modules.", href: "/procurement", status: "Available workspace", modules: ["Suppliers", "Purchase orders", "Contracts", "Approvals"] },
    { name: "Finance", description: "Connect to 3 authorized collaboration modules.", href: "/finance", status: "Available workspace", modules: ["Invoices", "Payments", "Ledgers"] },
    { name: "Master data", description: "Connect to 2 authorized collaboration modules.", href: "/master-data", status: "Available workspace", modules: ["Countries", "Currencies"] },
  ];
  return (
    <AccessProvider snapshot={homeAccess}>
    <AtlasAnswerProvider options={{ client } as never}>
      <ShellPersonalizationScopeProvider plane="neon" tenantId="tenant" principalId="user">
        <ShellHomeIdentityProvider displayName="User One" timeZone="UTC">
          <PlatformHome
            suggestions={["Review my priorities", "Plan today’s work", "Review pending approvals"]}
            quickActions={workspaces.map((workspace) => ({ label: `Open ${workspace.modules[0]}`, description: `Continue work in ${workspace.name}`, href: workspace.href }))}
            searchItems={workspaces.map((workspace) => ({ title: workspace.name, description: "Open workspace overview", href: workspace.href, category: "Workspace", keywords: [] }))}
            workspaces={workspaces}
          />
        </ShellHomeIdentityProvider>
      </ShellPersonalizationScopeProvider>
    </AtlasAnswerProvider>
    </AccessProvider>
  );
}

/** Workspace and module homes: real catalog routes (with metadata placements),
 * the directory API stubbed in activity-data.ts, recent records seeded in storage. */
const workspaceRoute = PLATFORM_CATALOG_ROUTES.neon.find((workspace) => workspace.code === "mdg")!;
function seedRecent() {
  const now = "2026-09-30T08:00:00Z";
  try {
    localStorage.setItem(quickAccessStorageKey("Neon", "tenant", "user"), JSON.stringify({ favourites: [], recent: [
      { id: "/app/entity/country/AF", href: "/app/entity/country/01a0d433-806b-7874-862d-49a9b955f6a1", label: "Afghanistan", kind: "record", visitedAt: now },
      { id: "/app/entity/currency/MYR", href: "/app/entity/currency/02b0d433-806b-7874-862d-49a9b955f6a2", label: "Malaysian Ringgit", kind: "record", visitedAt: now },
      { id: "/app/entity/business_partner/x", href: "/app/entity/business_partner/03c0d433-806b-7874-862d-49a9b955f6a3", label: "Northwind Industrial", kind: "record", visitedAt: now },
    ] }));
  } catch { /* Storage may be unavailable. */ }
}
function WorkspaceSurface({ module }: { readonly module?: string }) {
  seedRecent();
  const [pinned, setPinned] = useState<readonly string[]>(["org"]);
  const ordered = ["org", ...workspaceRoute.modules.map((item) => item.code).filter((code) => code !== "org")];
  const active = module ? workspaceRoute.modules.find((item) => item.code === module) : undefined;
  const tabs = <WorkspaceModuleTabs workspace={workspaceRoute} workspaceName="Master Data Governance" orderedModuleCodes={ordered} pinnedModuleCodes={pinned} activeModuleCode={active?.code} badges={{ bp: "3" }} onTogglePinned={(code) => setPinned((value) => value.includes(code) ? value.filter((item) => item !== code) : [...value, code])}/>;
  return (
    <Localized>
      <ApiClientProvider client={activityClient}>
        <SessionIdentityProvider identity={{ state: "authenticated", scope: { plane: "neon", tenantId: "tenant", principalId: "user", authEpoch: 1 } as never }}>
          <ApplicationNavigationProvider navigation={{ push() {}, replace() {}, refresh() {} } as never}>
            {active ? (
              <ModuleLanding displayName="Neon" workspace={workspaceRoute} module={active} description="Maintain organizations, hierarchies, classifications, and shared reference data." navigation={tabs}/>
            ) : (
              <WorkspaceLanding displayName="Neon" workspace={workspaceRoute} workspaceName="Master Data Governance" description="Create, validate, approve, and maintain trusted enterprise master data." moduleDescriptions={{ bp: "Create and govern supplier, customer, and partner master data.", org: "Maintain organizations, hierarchies, classifications, and shared reference data.", loc: "Govern addresses, locations, and geographic reference data.", finmd: "Govern accounts, cost objects, payment terms, and financial reference data." }} orderedModuleCodes={ordered} pinnedModuleCodes={pinned} badges={{ bp: "3" }} onTogglePinned={(code) => setPinned((value) => value.includes(code) ? value.filter((item) => item !== code) : [...value, code])} navigation={tabs}/>
            )}
          </ApplicationNavigationProvider>
        </SessionIdentityProvider>
      </ApiClientProvider>
    </Localized>
  );
}

// Notifications and Inbox run the real activity data source against the
// stubbed activity API (tests/foundation-browser/fixtures/activity-data.ts).
const activityClient = createHttpClient({ csrfToken: () => "fixture" });
/** `?locale=ar` renders the activity surfaces as the shell does: merged shell
 * and entity catalogs, with the document direction from the locale. */
const surfaceLocale = new URLSearchParams(location.search).get("locale");
function Localized({ children }: { readonly children: React.ReactNode }) {
  if (!surfaceLocale) return <>{children}</>;
  const localization = createEffectiveLocalization({ uiLocale: surfaceLocale });
  return (
    <IntlProvider
      localization={localization}
      messages={mergeCatalogs(shellMessages(localization.catalogLocale), entityMessages(localization.catalogLocale))}
      fallbackMessages={mergeCatalogs(shellEnglishMessages, entityFallbackMessages)}
    >
      {children}
    </IntlProvider>
  );
}
function Activity({ view }: { readonly view: "panel" | "notifications" | "inbox" }) {
  return (
    <Localized>
      <ActivitySurface view={view} />
    </Localized>
  );
}
function ActivitySurface({ view }: { readonly view: "panel" | "notifications" | "inbox" }) {
  const data = useActivityCenterDataSource({ client: activityClient, notificationLimit: 25, ...(surfaceLocale ? { locale: surfaceLocale } : {}) });
  const [tab, setTab] = useState<"notifications" | "inbox">("notifications");
  if (view === "panel")
    return <ShellActivityCenter activeTab={tab} onTabChange={setTab} onClose={() => {}} dataSource={data} />;
  return (
    <ActivityCenterDataProvider value={data}>
      <ActivityCenterPage kind={view} />
    </ActivityCenterDataProvider>
  );
}

/** A child list inside a record section: one card, the section owns title, count and action. */
function SectionList() {
  const [summary, setSummary] = useState<{ total?: number; constrained: boolean }>();
  return (
    <EntityPageLayout collectionHeader={<h1>Business Partners</h1>}>
      <Card className="a-record-detail-content">
        <h2>Countries</h2>
        <RelatedSection
          {...(summary?.total !== undefined ? { count: summary.total } : {})}
          actions={<Button size="small"><PlusIcon size={16} aria-hidden="true" />Add country</Button>}
        >
          <EntityListRuntime client={listClient as never} entityCode="country" contentOnly section={{ onSummary: setSummary }} />
        </RelatedSection>
      </Card>
    </EntityPageLayout>
  );
}

const surfaces: Record<string, () => React.ReactElement> = {
  kit: () => <Kit />,
  list: () => (
    <EntityListRuntime client={listClient as never} entityCode="country" />
  ),
  record: () => <Record />,
  "section-list": () => <SectionList />,
  atlas: () => <Atlas />,
  home: () => <Home />,
  "activity-panel": () => <Activity view="panel" />,
  "activity-page": () => <Activity view="notifications" />,
  "activity-inbox": () => <Activity view="inbox" />,
  workspace: () => <WorkspaceSurface />,
  "workspace-module": () => <WorkspaceSurface module="org" />,
  // Notification preferences need the API client and the delivery permissions.
  "notification-preferences": () => (
    <ApiClientProvider client={activityClient}>
      <PermissionProvider permissions={["notifications.delivery.read", "notifications.delivery.replay"]}>
        <Activity view="notifications" />
      </PermissionProvider>
    </ApiClientProvider>
  ),
};
const surface = new URLSearchParams(location.search).get("surface") ?? "kit";
createRoot(document.getElementById("root")!).render(surfaces[surface]!());
