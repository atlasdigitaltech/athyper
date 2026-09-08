import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
} from "@athyper/contract-platform-entity-list";
import {
  entityViewsOperation,
  entityViewCommandOperation,
  entityApplicationDescriptorOperation,
  entityListDescriptorOperation,
  recordBookmarkMembershipOperation,
  recordBookmarksOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
import { DirectoryFilterContext, EntityListRuntime, EntityApplicationSection } from "../../packages/platform/entity/runtime/list-view/src/index";

const digest = (value: string) => value.repeat(64).slice(0, 64);
function descriptor(scopeFingerprint: string): EntityListDescriptorV1 {
  const enabled = {
    state: "enabled" as const,
    requiresPreflight: false,
    requiresApproval: false,
  };
  const hidden = {
    state: "hidden" as const,
    requiresPreflight: false,
    requiresApproval: false,
  };
  return {
    schemaVersion: 1,
    plane: "neon",
    entity: {
      code: "business_partner",
      label: "Business Partner",
      pluralLabel: "Business Partners",
      identityField: "code",
      detailRouteTemplate: "/mdg/business-partner/:recordId",
    },
    revision: {
      release: 2,
      descriptorHash: digest("a"),
      surfaceHash: digest("b"),
    },
    surface: {
      key: "default_list",
      title: "Business Partners",
      header: { title: { defaultLocale: "ms", values: { ms: "Rakan Perniagaan", en: "Business Partners" } }, description: { defaultLocale: "ms", values: { ms: "Direktori rakan yang dibenarkan." } } },
      description: "Scoped partners",
      defaultState: {
        filters: [],
        sort: [{ field: "code", direction: "asc" }],
        columns: ["code", "name", "status"],
        density: "comfortable",
        mode: "table",
      },
      supportedModes: ["table", "compact"],
      search: { minimumQueryLength: 1 },
      filterPresentation: {
        quickFields: [{ field: "status", defaultOperator: "eq" }],
        source: "metadata",
        allowUserPinning: true,
      },
    },
    fields: [
      {
        key: "code",
        label: "Business Partner Code",
        valueKind: "string",
        semanticRole: "identity",
        defaultVisible: true,
        defaultOrder: 0,
        filterOperators: ["contains", "eq"],
        sortable: true,
        groupable: false,
        aggregations: [],
      },
      {
        key: "name",
        label: "Display Name",
        valueKind: "string",
        semanticRole: "title",
        defaultVisible: true,
        defaultOrder: 1,
        filterOperators: ["contains"],
        sortable: true,
        groupable: false,
        aggregations: [],
      },
      {
        key: "status",
        label: "Status",
        valueKind: "enum",
        semanticRole: "status",
        filterOptions: [
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
        ],
        defaultVisible: true,
        defaultOrder: 2,
        filterOperators: ["eq", "in"],
        sortable: true,
        groupable: true,
        aggregations: [],
      },
    ],
    actions: [
      { key: "create_request", label: "Legacy label", localizedLabel: { defaultLocale: "ms", values: { ms: "Permohonan baharu" } }, placement: "primary", selection: "none", execution: "navigate", state: "enabled", href: "/requests/new", requiresPreflight: false, supportsAllMatching: false },
      { key: "restricted", label: "Restricted action", placement: "secondary", selection: "none", execution: "navigate", state: "hidden", requiresPreflight: false, supportsAllMatching: false },
      { key: "context_action", label: "Select context", placement: "secondary", selection: "none", execution: "navigate", state: "disabled", disabledReason: { code: "context_required", messageKey: "entity.action.context_required" }, disabledMessage: { defaultLocale: "en", values: { en: "Choose an organization first." } }, requiresPreflight: false, supportsAllMatching: false }
    ],
    dataOperations: {
      export: {
        currentPage: enabled,
        selected: enabled,
        filtered: hidden,
        all: hidden,
        formats: ["csv", "json", "ndjson"],
        defaultFormat: "csv",
        exportableFields: ["code", "name", "status"],
        asynchronousThreshold: 5000,
      },
      import: {
        create: hidden,
        update: hidden,
        upsert: hidden,
        downloadTemplate: hidden,
        formats: ["csv", "json"],
        defaultFormat: "csv",
        importableFields: [],
        maxFileBytes: 1024,
        maxRows: 100,
        draftOnly: false,
      },
    },
    scope: {
      status: "ready",
      labels: [
        {
          key: "organization",
          label: "Operating organization",
          value: "Operations",
        },
      ],
      fingerprint: scopeFingerprint,
    },
    limits: {
      defaultPageSize: 10,
      allowedPageSizes: [10, 25],
      maxSortLevels: 1,
      countMode: "none",
    },
  };
}
function page(scopeFingerprint: string, code: string): EntityListResultV1 {
  return {
    schemaVersion: 1,
    descriptorHash: digest("a"),
    scopeFingerprint,
    queryHash: digest("d"),
    rows: [
      {
        id: `${code}-id`,
        values: { code, name: `${code} Partner`, status: "active" },
      },
    ],
    pagination: {
      pageSize: 1,
      hasNext: false,
      hasPrevious: false,
      countMode: "none",
    },
  };
}

test("Phase 1A restores URL state and aborts stale list authority on context change", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", {
    url: "https://neon.test/mdg/business-partner/partners?sort=name:desc&cols=code,name,status&pageSize=10",
    pretendToBeVisual: true,
  });
  dom.window.localStorage.setItem(
    "athyper.entity-list.views.neon.business_partner",
    JSON.stringify([
      { id: "unsafe", name: "Unsafe injected view", state: { mode: "table" } },
    ]),
  );
  const previous = [
    "window",
    "document",
    "navigator",
    "Element",
    "HTMLElement",
    "MouseEvent",
    "PopStateEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    Element: { configurable: true, value: dom.window.Element },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    PopStateEvent: { configurable: true, value: dom.window.PopStateEvent },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const requests: Array<{
    kind: "descriptor" | "list";
    organization?: string;
    signal?: AbortSignal;
    query?: Readonly<Record<string, unknown>>;
  }> = [];
  let resolveFirstList: ((value: EntityListResultV1) => void) | undefined;
  const client = {
    request(
      operation: unknown,
      options?: {
        query?: Readonly<Record<string, unknown>>;
        signal?: AbortSignal;
      },
    ) {
      const organization = String(
        options?.query?.["operatingOrganizationId"] ?? "",
      );
      if (operation === entityListDescriptorOperation) {
        requests.push({
          kind: "descriptor",
          organization,
          signal: options?.signal,
          query: options?.query,
        });
        return Promise.resolve(
          descriptor(organization === "org-2" ? digest("2") : digest("1")),
        );
      }
      if (operation === recordBookmarkMembershipOperation)
        return Promise.resolve(new Set<string>());
      requests.push({
        kind: "list",
        organization,
        signal: options?.signal,
        query: options?.query,
      });
      if (organization === "org-1")
        return new Promise<EntityListResultV1>((resolve) => {
          resolveFirstList = resolve;
        });
      return Promise.resolve(page(digest("2"), "ORG2-BP-001"));
    },
  } as HttpClient;
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<EntityListRuntime client={client} entityCode="business_partner" scopePending initialDensity="compact"/>));
    assert.equal(requests.length, 0, "Do not resolve authority before scope bootstrap completes");
    assert.ok(dom.window.document.querySelector(".a-entity-list--compact table"));
    assert.equal(dom.window.document.querySelectorAll("header a, header button").length, 0);
    await act(async () =>
      root.render(
        <EntityListRuntime
          client={client}
          entityCode="business_partner"
          scopeCoordinate={{ operatingOrganizationId: "org-1" }}
        />,
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.deepEqual(
      requests.find((item) => item.kind === "list")?.query?.["sort"],
      ["name:desc"],
    );
    const firstList = requests.find((item) => item.kind === "list")!;
    await act(async () =>
      root.render(
        <EntityListRuntime
          client={client}
          entityCode="business_partner"
          scopeCoordinate={{ operatingOrganizationId: "org-2" }}
        />,
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(firstList.signal?.aborted, true);
    assert.match(dom.window.document.body.textContent ?? "", /ORG2-BP-001/);
    assert.equal(
      dom.window.document.querySelector(".a-entity-list__context-row"),
      null,
    );
    assert.equal(dom.window.document.querySelectorAll("h1").length, 1);
    assert.equal(dom.window.document.querySelector("h1")?.textContent, "Rakan Perniagaan");
    assert.equal(dom.window.document.querySelector('a[href="/requests/new"]')?.textContent, "Permohonan baharu");
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Restricted action|Legacy label/);
    const unavailable = dom.window.document.querySelector('header [aria-disabled="true"]');
    assert.ok(unavailable);
    assert.equal(unavailable.getAttribute("href"), null);
    assert.equal(dom.window.document.getElementById(unavailable.getAttribute("aria-describedby")!)?.textContent, "Choose an organization first.");
    assert.ok(dom.window.document.querySelector(".a-entity-list__query-row"));
    assert.equal(dom.window.document.querySelector(".athyper-page-header__context"), null);
    assert.doesNotMatch(dom.window.document.querySelector("header")?.textContent ?? "", /Read-only/);
    assert.equal(
      dom.window.document.querySelector("button[type='submit']"),
      null,
    );
    assert.match(
      dom.window.document.body.textContent ?? "",
      /Filters.*Controls/,
    );
    assert.doesNotMatch(
      dom.window.document.body.textContent ?? "",
      /Import \/ Export/,
    );
    assert.equal(
      [
        ...dom.window.document.querySelectorAll<HTMLButtonElement>("button"),
      ].find((button) => button.textContent?.trim() === "Actions"),
      undefined,
    );
    assert.equal(
      dom.window.document
        .querySelector<HTMLAnchorElement>(".a-entity-list__record-link")
        ?.getAttribute("href"),
      "/mdg/business-partner/ORG2-BP-001-id",
    );
    const rowActions = dom.window.document.querySelector<HTMLButtonElement>(
      'button[aria-label="Actions for ORG2-BP-001"]',
    );
    await act(async () =>
      rowActions?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const rowMenu = dom.window.document.querySelector<HTMLElement>(
      ".a-entity-list__row-menu",
    );
    assert.match(rowMenu?.textContent ?? "", /View.*Copy/);
    assert.equal(rowMenu?.closest(".a-entity-list__table-wrap"), null);
    await act(async () =>
      rowActions?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const activeSortHeader =
      dom.window.document.querySelector<HTMLButtonElement>(
        'th[aria-sort="descending"] .a-entity-list__sort-header',
      );
    assert.equal(
      activeSortHeader?.getAttribute("aria-label"),
      "Display Name, sorted descending. Activate to clear sorting.",
    );
    assert.ok(
      activeSortHeader?.querySelector(
        ".a-entity-list__sort-indicator--active svg",
      ),
    );
    assert.ok(
      dom.window.document.querySelector(
        'th[aria-sort="none"] .a-entity-list__sort-indicator svg',
      ),
    );
    assert.doesNotMatch(
      dom.window.document.querySelector("thead")?.textContent ?? "",
      /[↕↑↓]/u,
    );
    assert.ok(
      dom.window.document.querySelector(
        '.a-entity-list__row-actions [aria-haspopup="menu"] svg',
      ),
    );
    assert.equal(
      dom.window.document
        .querySelector<HTMLButtonElement>(".a-entity-list__bookmark")
        ?.getAttribute("aria-label"),
      "Add ORG2-BP-001 to favourites",
    );
    assert.ok(
      dom.window.document.querySelector(".a-entity-list__bookmark svg"),
    );
    assert.ok(
      dom.window.document.querySelector<HTMLInputElement>(
        'input[aria-label="Select current page"]',
      ),
    );
    assert.doesNotMatch(
      dom.window.document.body.textContent ?? "",
      /Unsafe injected view/,
    );
    assert.ok(
      dom.window.document.querySelector<HTMLInputElement>(
        "#entity-list-search",
      ),
    );
    const listRequestsBeforeRefresh = requests.filter(
      (request) => request.kind === "list",
    ).length;
    const controls = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.getAttribute("aria-label") === "Controls");
    await act(async () =>
      controls?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const refresh = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    ].find((button) => button.textContent?.trim() === "Refresh");
    await act(async () =>
      refresh?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(
      requests.filter((request) => request.kind === "list").length,
      listRequestsBeforeRefresh + 1,
    );
    const filtersButton = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Filters");
    await act(async () =>
      filtersButton?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(
      dom.window.document
        .querySelector(".a-drawer-layer")
        ?.getAttribute("data-mobile-presentation"),
      "fullscreen",
    );
    assert.match(
      dom.window.document.querySelector('[role="dialog"]')?.textContent ?? "",
      /Filters.*authorized business partners list.*Records.*1.*Active filters.*0.*State.*Current.*Quick filters.*All filters.*Status.*1 record matching/,
    );
    assert.doesNotMatch(
      dom.window.document.querySelector('[role="dialog"]')?.textContent ?? "",
      /Frequently used|Common filters/,
    );
    assert.ok(dom.window.document.querySelector(".a-drawer__header-icon svg"));
    assert.ok(
      dom.window.document.querySelector(
        'select[aria-label="Operator for quick Status filter"]',
      ),
    );
    assert.equal(
      [
        ...dom.window.document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ].find((button) => button.textContent === "Reset filters")?.disabled,
      true,
    );
    assert.equal(
      [
        ...dom.window.document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ].find((button) => button.textContent === "Apply filtersShow results")
        ?.disabled,
      true,
    );
    const allFilters = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      ),
    ].find((button) => button.textContent === "All filters");
    await act(async () =>
      allFilters?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(allFilters?.getAttribute("aria-selected"), "true");
    assert.match(
      dom.window.document.querySelector('[role="tabpanel"]:not([hidden])')
        ?.textContent ?? "",
      /No filters configured.*Add a filter to narrow the authorized result set.*Add filter/,
    );
    const addFilter = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ),
    ].find((button) => button.textContent === "Add filter");
    await act(async () =>
      addFilter?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(
      dom.window.document.querySelector<HTMLInputElement>(
        'input[placeholder="Search filterable fields by name or code…"]',
      )?.value,
      "",
    );
    const filterField = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        "[data-field-option]",
      ),
    ].find((button) => button.textContent?.startsWith("Business Partner Code"));
    await act(async () =>
      filterField?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(
      dom.window.document.querySelectorAll(".a-entity-list__filter-header")
        .length,
      1,
    );
    assert.ok(
      dom.window.document.querySelector(
        'button[role="combobox"][aria-label="Field for filter 1"]',
      ),
    );
    assert.ok(
      dom.window.document.querySelector(
        '[aria-label^="Value for "][aria-label$=" filter 1"]',
      ),
    );
    const filterCancel = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ),
    ].find((button) => button.textContent === "Cancel");
    await act(async () =>
      filterCancel?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const sortButton = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Sort");
    await act(async () =>
      sortButton?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const sortDialog = dom.window.document.querySelector('[role="dialog"]');
    assert.match(
      sortDialog?.textContent ?? "",
      /Sort.*business partners.*Records.*1.*Sort levels.*1.*Maximum.*1.*Display Name.*Descending.*1 active sort level/,
    );
    assert.ok(sortDialog?.querySelector(".a-drawer__header-icon svg"));
    assert.ok(
      sortDialog?.querySelector(
        'button[role="combobox"][aria-label="Field for sort 1"]',
      ),
    );
    assert.equal(
      [...sortDialog!.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Apply sort",
      )?.disabled,
      true,
    );
    const sortCancel = [
      ...sortDialog!.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Cancel");
    await act(async () =>
      sortCancel?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const columnsButton = dom.window.document.querySelector<HTMLButtonElement>(
      'button[aria-label="3 visible columns"]',
    );
    await act(async () =>
      columnsButton?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const columnDialog = dom.window.document.querySelector('[role="dialog"]');
    assert.match(
      columnDialog?.textContent ?? "",
      /Columns.*business partners.*Fields.*3.*Visible.*3.*Maximum.*100.*Visible columns.*3 selected.*Available fields.*3 visible columns/,
    );
    assert.ok(columnDialog?.querySelector(".a-drawer__header-icon svg"));
    assert.equal(
      columnDialog?.querySelectorAll<HTMLButtonElement>(
        '.a-entity-list__column-grip[draggable="true"]',
      ).length,
      3,
    );
    assert.equal(
      columnDialog
        ?.querySelector<HTMLInputElement>("#entity-list-column-search")
        ?.getAttribute("placeholder"),
      "Search fields by name or code…",
    );
    const displayNameVisibility = columnDialog?.querySelector<HTMLInputElement>(
      'input[aria-label="Show Display Name"]',
    );
    await act(async () =>
      displayNameVisibility?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(
      columnDialog?.textContent ?? "",
      /Available fields.*Recommended fields.*Display Name.*name/,
    );
    const addDisplayName = columnDialog?.querySelector<HTMLInputElement>(
      'input[aria-label="Show Display Name"]',
    );
    await act(async () =>
      addDisplayName?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const moveDisplayNameUp = columnDialog?.querySelector<HTMLButtonElement>(
      'button[aria-label="Move Display Name up"]',
    );
    await act(async () =>
      moveDisplayNameUp?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const applyColumns = [
      ...(columnDialog?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((button) => button.textContent === "Apply columns");
    await act(async () =>
      applyColumns?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(
      new dom.window.URLSearchParams(dom.window.location.search).get("cols"),
      null,
    );
    const more = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.getAttribute("aria-label") === "Controls");
    await act(async () =>
      more?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(
      dom.window.document.querySelector('[role="menu"]')?.textContent ?? "",
      /Sort.*1 level.*Columns.*3 visible.*Group by.*None.*Display settings.*Table · Comfortable.*Manage views.*System default.*Data operations.*Refresh.*Copy link to this view.*Reset list settings/,
    );
    assert.doesNotMatch(
      dom.window.document.querySelector('[role="menu"]')?.textContent ?? "",
      /Context|Refine|Organize|Appearance|Other/,
    );
    const operations = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    ].find((button) => button.textContent?.includes("Data operations"));
    await act(async () =>
      operations?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(
      dom.window.document.querySelector('[role="dialog"]')?.textContent ?? "",
      /Data operations.*Export records.*Selected records.*Current page.*Jobs/,
    );
    const closeOperations = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ),
    ].find((button) => button.textContent === "Close");
    await act(async () =>
      closeOperations?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    await act(async () =>
      more?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    const reset = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    ].find((button) => button.textContent?.trim() === "Reset list settings");
    await act(async () =>
      reset?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(
      dom.window.document
        .querySelector('[role="dialog"]')
        ?.getAttribute("aria-modal"),
      "true",
    );
    assert.match(
      dom.window.document.querySelector('[role="dialog"]')?.textContent ?? "",
      /Reset list settings\?/,
    );
    const cancel = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ),
    ].find((button) => button.textContent === "Cancel");
    await act(async () =>
      cancel?.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    resolveFirstList?.(page(digest("1"), "STALE-BP"));
    await act(async () => {
      await Promise.resolve();
    });
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /STALE-BP/);
    dom.window.history.pushState(
      {},
      "",
      "/mdg/business-partner/partners?sort=code:desc&cols=code,status&pageSize=10",
    );
    await act(async () =>
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate")),
    );
    await act(async () => {
      await Promise.resolve();
    });
    assert.deepEqual(requests.at(-1)?.query?.["sort"], ["code:desc"]);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of previous)
      value
        ? Object.defineProperty(globalThis, key, value)
        : delete (globalThis as Record<string, unknown>)[key];
    dom.window.close();
  }
});


test("initial loading reserves header, toolbar and table without claiming action authority", () => {
  const client = { request() { throw new Error("SSR must not fetch entity authority"); } } as unknown as HttpClient;
  const html = renderToStaticMarkup(<EntityListRuntime client={client} entityCode="unknown_entity"/>);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.ok(document.querySelector(".athyper-page-header__description .a-skeleton"));
  assert.ok(document.querySelector(".a-entity-list__query-row"));
  assert.ok(document.querySelector('table[aria-hidden="true"] thead'));
  assert.ok(document.querySelector('table[aria-hidden="true"] tbody'));
  assert.equal(document.querySelectorAll("header a, header button").length, 0);
  assert.doesNotMatch(document.body.textContent ?? "", /Read-only|Manage · Collection|unknown_entity/);
});

test("entity navigation renders one active section, localized overflow and positive attention counts", async () => {
  const {EntityNavigation}=await import("../../packages/platform/entity/runtime/list-view/src/navigation");
  const label=(en:string)=>({defaultLocale:"en",values:{en}});
  const sections=[{key:"overview",surfaceKey:"overview",label:label("Overview"),href:"/overview",aliases:[],placement:"direct" as const,attentionCount:0},{key:"manage",surfaceKey:"list",label:label("Manage"),href:"/list",aliases:["/alias"],placement:"direct" as const},{key:"review",surfaceKey:"review",label:label("Review & Approval"),href:"/review",aliases:[],placement:"overflow" as const,attentionCount:3}];
  const document=new JSDOM(renderToStaticMarkup(<EntityNavigation sections={sections} currentSurfaceKey="list"/>)).window.document;
  assert.equal(document.querySelectorAll('[aria-current="page"]').length,1);
  assert.equal(document.querySelector('[aria-current="page"]')?.textContent,"Manage");
  assert.equal(document.querySelectorAll('.a-entity-navigation__count').length,1);
  assert.equal(document.querySelector('details a')?.getAttribute("href"),"/review");
  assert.equal(renderToStaticMarkup(<EntityNavigation/>),"");
});

test("navigation-only surface does not fetch records or rewrite its destination", async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:"https://neon.test/review?status=pending"});
  const previous = ["window","document","IS_REACT_ACT_ENVIRONMENT"].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
  try {
    const calls: string[]=[];
    const client={request:async(operation: {id?:string;path?:string})=>{calls.push(JSON.stringify(operation));return descriptor("a".repeat(64));}} as unknown as HttpClient;
    const root=createRoot(dom.window.document.getElementById("root")!);
    await act(async()=>root.render(<EntityListRuntime client={client} entityCode="business_partner" navigationOnly/>));
    assert.equal(calls.length,1);
    assert.equal(dom.window.location.pathname,"/review");
    assert.equal(dom.window.location.search,"?status=pending");
    await act(async()=>root.unmount());
  } finally { for(const [key,value] of previous) {if(value)Object.defineProperty(globalThis,key,value);else delete (globalThis as Record<string,unknown>)[key];} dom.window.close(); }
});

for (const mode of ["table", "compact"] as const) test(`group disclosure collapses and restores ${mode} records without querying again`, async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://neon.test/partners?group=status',pretendToBeVisual:true});
  const previous=["window","document","navigator","HTMLElement","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},navigator:{configurable:true,value:dom.window.navigator},HTMLElement:{configurable:true,value:dom.window.HTMLElement},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
  const root=createRoot(dom.window.document.getElementById('root')!);
  let requests=0;
  const base=descriptor(digest('b'));
  const configured={...base,surface:{...base.surface,supportedModes:["table","compact"] as const,defaultState:{...base.surface.defaultState,mode}}};
  const client={request:async(operation:unknown)=>{requests++;if(operation===entityListDescriptorOperation)return configured;if(operation===recordBookmarkMembershipOperation)return new Set();if(operation===recordBookmarksOperation)return [];return page(digest('b'),'GROUPED-BP');}} as unknown as HttpClient;
  try {
    await act(async()=>root.render(<EntityListRuntime client={client} entityCode="business_partner"/>));
    const button=()=>dom.window.document.querySelector<HTMLButtonElement>('.a-entity-list__group-toggle')!;
    const record=()=>dom.window.document.querySelector('.a-entity-list__record-link');
    assert.equal(button().getAttribute('aria-expanded'),'true');assert.ok(record());
    const calls=requests;
    await act(async()=>button().click());
    assert.equal(button().getAttribute('aria-expanded'),'false');assert.equal(record(),null);
    assert.match(button().textContent??'',/Active.*1/);
    await act(async()=>button().click());
    assert.equal(button().getAttribute('aria-expanded'),'true');assert.ok(record());assert.equal(requests,calls);
  } finally {
    await act(async()=>root.unmount());
    for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}
    dom.window.close();
  }
});

test("entity application keeps one header and scopes each collection's saved views",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://neon.test/partners',pretendToBeVisual:true});
  const previous=["window","document","navigator","HTMLElement","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},navigator:{configurable:true,value:dom.window.navigator},HTMLElement:{configurable:true,value:dom.window.HTMLElement},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
  const root=createRoot(dom.window.document.getElementById('root')!);
  const base=descriptor(digest('b')),label=(en:string)=>({defaultLocale:"en",values:{en}});
  const app={...base,application:{key:"partner_app",basePath:"/partners",defaultSectionKey:"overview"},navigation:[{key:"overview",surfaceKey:"overview",placement:"direct",href:"/partners",aliases:[],label:label("Overview"),content:{kind:"overview"}},{key:"manage",surfaceKey:"manage",placement:"direct",href:"/partners/manage",aliases:[],label:label("Manage"),content:{kind:"entity_list",entityCode:"business_partner"}},{key:"review",surfaceKey:"review",placement:"direct",href:"/partners/requests",aliases:[],label:label("Review"),content:{kind:"task_list",entityCode:"partner_request"}}]};
  const calls:string[]=[];
  const client={request:async(operation:unknown,options:{params:{entityCode:string}})=>{const code=options.params.entityCode;if(operation===entityApplicationDescriptorOperation){calls.push('application');return app;}if(operation===entityListDescriptorOperation){calls.push(`descriptor:${code}`);return {...base,entity:{...base.entity,code}};}if(operation===recordBookmarkMembershipOperation)return new Set();if(operation===recordBookmarksOperation)return [];calls.push(`list:${code}`);return page(digest('b'),code);}} as unknown as HttpClient;
  const render=(section:string)=>root.render(<EntityListRuntime client={client} entityCode="business_partner" applicationOnly><EntityApplicationSection key={section} sectionKey={section}/></EntityListRuntime>);
  try{
    await act(async()=>render('overview'));
    assert.deepEqual(calls,['application','descriptor:business_partner','list:business_partner']);assert.equal(dom.window.document.querySelectorAll('h1').length,1);
    assert.ok(dom.window.document.querySelector('.a-entity-pulse'));assert.equal(dom.window.location.search,'');
    dom.window.localStorage.setItem('athyper.entity-list.views.neon.business_partner', '[]');
    await act(async()=>render('manage'));
    assert.equal(dom.window.document.querySelectorAll('h1').length,1);assert.ok(calls.includes('list:business_partner'),JSON.stringify({calls,body:dom.window.document.body.textContent}));
    assert.equal(dom.window.localStorage.getItem('athyper.entity-list.views.neon.partner_app.manage.business_partner'), '[]');
    await act(async()=>render('review'));
    assert.equal(dom.window.document.querySelectorAll('h1').length,1);assert.ok(calls.includes('list:partner_request'));assert.equal(calls.filter(call=>call==='application').length,1);
    assert.ok(dom.window.document.querySelector('.a-entity-list__panel'));
    assert.equal(dom.window.localStorage.getItem('athyper.entity-list.views.neon.partner_app.review.partner_request'), null);
  }finally{await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}dom.window.close();}
});

test("canonical entity route preserves saved views and repeated query values", async () => {
  const {entityRouteAlias}=await import("../../apps/neon/lib/entity-route-alias");
  assert.equal(entityRouteAlias("/mdg/business-partner/manage", {vid:"saved-view",density:"compact",filter:["active","uk"],unused:undefined}),"/mdg/business-partner/manage?vid=saved-view&density=compact&filter=active&filter=uk");
});

test("application failure replaces loading header with themed retry state", async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://neon.test/partners'});
  const previous=["window","document","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
  const root=createRoot(dom.window.document.getElementById('root')!);
  let calls=0;
  const client={request:async()=>{calls++;throw new Error('The requested platform operation is not allowlisted');}} as unknown as HttpClient;
  try {
    await act(async()=>root.render(<EntityListRuntime client={client} entityCode="business_partner" applicationOnly scopeCoordinate={{operatingOrganizationId:'org'}} scopeControl={<span>Scope icon</span>}/>));
    assert.equal(dom.window.document.querySelectorAll('.athyper-page-header').length,0);
    assert.doesNotMatch(dom.window.document.body.textContent??'',/Loading application|Loading list|Scope icon/);
    assert.equal(dom.window.document.querySelector('[role="alert"] h2')?.textContent,'This application is unavailable');
    assert.equal(dom.window.document.querySelector('details')?.hasAttribute('open'),false);
    assert.ok(dom.window.document.querySelector('.a-entity-list__state--empty'));
    await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    assert.equal(calls,2);
  } finally {await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}dom.window.close();}
});


test("server view defaults respect URL, personal, shared and system precedence",async()=>{
 const {readListLocation,writeListLocation}=await import("../../packages/platform/entity/runtime/list-view/src/location");
 const dom=new JSDOM('<div/>',{url:"https://neon.test/manage"});const previous=Object.getOwnPropertyDescriptor(globalThis,"window");Object.defineProperty(globalThis,"window",{configurable:true,value:dom.window});
 try{
  const base=descriptor(digest("b")),state={...base.surface.defaultState,density:"compact" as const};
  const shared={id:"shared",name:"Shared",scope:"shared" as const,state,version:1,compatible:true};
  const configured={...base,viewCatalog:{views:[shared,{...shared,id:"mine",scope:"personal" as const}],sharedDefault:"shared",personalDefault:"mine",capabilities:{createShared:false,manageShared:false,setSharedDefault:false}}};
  assert.equal(readListLocation(configured,"").savedViewId,"mine");
  assert.equal(readListLocation({...configured,viewCatalog:{...configured.viewCatalog,personalDefault:undefined}},"").savedViewId,"shared");
  assert.equal(readListLocation({...configured,viewCatalog:{...configured.viewCatalog,personalDefault:"system"}},"").savedViewId,"system");
  assert.equal(readListLocation(configured,"?vid=shared").savedViewId,"shared");
  assert.equal(readListLocation(configured,"?cols=code").savedViewId,undefined);
  assert.equal(readListLocation({...configured,viewCatalog:{...configured.viewCatalog,personalDefault:"deleted"}},"").savedViewId,"system");
  const reset={...base.surface.defaultState,savedViewId:"system"};writeListLocation(reset,configured,"replace");
  assert.equal(readListLocation(configured).savedViewId,"system");
  assert.equal(dom.window.localStorage.length,0,"Server views are never cached into unscoped browser storage");
 }finally{if(previous)Object.defineProperty(globalThis,"window",previous);else delete(globalThis as Record<string,unknown>).window;dom.window.close();}
});


test("Manage views exposes System default and permission-gated tenant defaults",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://neon.test/manage",pretendToBeVisual:true});
 const previous=["window","document","navigator","HTMLElement","MouseEvent","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},navigator:{configurable:true,value:dom.window.navigator},HTMLElement:{configurable:true,value:dom.window.HTMLElement},MouseEvent:{configurable:true,value:dom.window.MouseEvent},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
 const base={...descriptor(digest("b")),serverViews:true};
 let catalog={views:[{id:"11111111-1111-4111-8111-111111111111",name:"Shared active",scope:"shared" as const,state:base.surface.defaultState,version:1,compatible:true}],personalDefault:undefined as string|undefined,sharedDefault:"11111111-1111-4111-8111-111111111111",capabilities:{createShared:false,manageShared:false,setSharedDefault:false}};
 const commands:Record<string,unknown>[]=[];
 const client={request:async(operation:unknown,options:{body?:Record<string,unknown>})=>{if(operation===entityListDescriptorOperation)return base;if(operation===entityViewsOperation)return catalog;if(operation===entityViewCommandOperation){commands.push(options.body!);catalog={...catalog,personalDefault:String(options.body!.id)};return catalog;}if(operation===recordBookmarkMembershipOperation)return new Set();if(operation===recordBookmarksOperation)return [];return page(digest("b"),"VIEW-BP");}} as unknown as HttpClient;
 const root=createRoot(dom.window.document.getElementById("root")!);
 try{
  await act(async()=>root.render(<EntityListRuntime client={client} entityCode="business_partner"/>));
  assert.equal(new URLSearchParams(dom.window.location.search).get("vid"),catalog.sharedDefault);
  await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Select view"]')!.click());
  await act(async()=>[...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="Manage views…")!.click());
  const drawer=dom.window.document.querySelector('[role="dialog"]')!;
  assert.ok(drawer);
  const viewTabs=[...drawer.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  assert.deepEqual(viewTabs.map(tab=>tab.textContent),["Available views","Save current configuration"]);
  assert.equal(viewTabs[0]!.getAttribute('aria-selected'),"true");
  assert.ok(drawer.querySelector('#entity-list-view-name')?.closest('[hidden]'));
  await act(async()=>viewTabs[1]!.click());assert.equal(drawer.querySelector('#entity-list-view-name')?.closest('[hidden]'),null);
  await act(async()=>viewTabs[0]!.click());
  assert.match(drawer.textContent??'',/Standard views.*My views.*Shared views/);
  assert.match(drawer.textContent??'',/System default/);assert.doesNotMatch(drawer.textContent??'',/Set tenant default/);
  assert.equal(drawer.querySelectorAll('option[value="shared"]').length,0);
  await act(async()=>[...drawer.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="Make my default")!.click());
  assert.deepEqual(commands[0],{action:"default",id:"system",target:"personal"});
  await act(async()=>[...drawer.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="Reset to system default")!.click());
  assert.equal(new URLSearchParams(dom.window.location.search).get("vid"),"system");
 }finally{await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}dom.window.close();}
});

test("column filters preserve other fields, synchronize chips and dismiss without sorting",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://neon.test/manage",pretendToBeVisual:true});
 const previous=["window","document","HTMLElement","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},HTMLElement:{configurable:true,value:dom.window.HTMLElement},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
 const base=descriptor(digest("b"));
 const configured={...base,fields:base.fields.map(field=>field.key==="code"?{...field,filterOperators:[]}:field),surface:{...base.surface,defaultState:{...base.surface.defaultState,filters:[{field:"name",operator:"contains" as const,value:"Acme"}]}}};
 const client={request:async(operation:unknown)=>operation===entityListDescriptorOperation?configured:operation===recordBookmarkMembershipOperation?new Set():page(digest("b"),"BP")} as unknown as HttpClient;
 const root=createRoot(dom.window.document.getElementById("root")!);
 const click=async(selector:string)=>act(async()=>dom.window.document.querySelector<HTMLButtonElement>(selector)!.click());
 try{
  await act(async()=>root.render(<EntityListRuntime client={client} entityCode="business_partner"/>));
  assert.equal(dom.window.document.querySelector('[aria-label="Filter Business Partner Code"]'),null);
  const sort=dom.window.document.querySelector('th[aria-sort]')?.getAttribute('aria-sort');
  await click('[aria-label="Filter Status"]');
  const dialog=dom.window.document.querySelector('[role="dialog"][aria-label="Filter Status"]')!;
  assert.equal(dialog.parentElement,dom.window.document.body,"Popover escapes the scrolling table container");
  assert.deepEqual([...dialog.querySelectorAll('select[aria-label^="Operator"] option')].map(option=>option.getAttribute('value')),["eq","in"]);
  const value=dialog.querySelector<HTMLSelectElement>('select[aria-label^="Value"]')!;
  await act(async()=>{value.value="draft";value.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await act(async()=>[...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="Apply")!.click());
  assert.ok(dom.window.document.querySelector('[aria-label="Filter Status, 1 active"]'));
  assert.match(dom.window.document.querySelector('[aria-label="Applied filters"]')?.textContent??'',/Display Name contains Acme.*Status is Draft/);
  assert.equal(dom.window.document.querySelector('th[aria-sort]')?.getAttribute('aria-sort'),sort);
  await click('[aria-label="Filter Status, 1 active"]');
  await act(async()=>dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:"Escape",bubbles:true})));
  assert.equal(dom.window.document.querySelector('[role="dialog"][aria-label="Filter Status"]'),null);
  assert.equal(dom.window.document.activeElement?.getAttribute('aria-label'),"Filter Status, 1 active");
  await click('[aria-label="Filter Status, 1 active"]');
  await act(async()=>[...dom.window.document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button=>button.textContent==="Clear")!.click());
  assert.ok(dom.window.document.querySelector('[aria-label="Filter Status"]'));
  assert.match(dom.window.document.querySelector('[aria-label="Applied filters"]')?.textContent??'',/Display Name contains Acme/);
  assert.doesNotMatch(dom.window.document.querySelector('[aria-label="Applied filters"]')?.textContent??'',/Status is/);
 }finally{await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}dom.window.close();}
});

test("one drawer selector preserves drafts within a session and uses metadata availability",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://neon.test/manage",pretendToBeVisual:true});
 const previous=["window","document","HTMLElement","MouseEvent","IS_REACT_ACT_ENVIRONMENT"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},HTMLElement:{configurable:true,value:dom.window.HTMLElement},MouseEvent:{configurable:true,value:dom.window.MouseEvent},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
 const base=descriptor(digest("b"));let listCalls=0;
 const client={request:async(operation:unknown)=>{if(operation===entityListDescriptorOperation)return base;if(operation===recordBookmarkMembershipOperation)return new Set();if(operation===recordBookmarksOperation)return [];listCalls++;return page(digest("b"),"BP");}} as unknown as HttpClient;
 const root=createRoot(dom.window.document.getElementById("root")!);
 const switchTo=async(label:string)=>{
  await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-label^="Switch list controls"]')!.click());
  const menu=dom.window.document.querySelector('.a-entity-list__drawer-menu')!;
  assert.deepEqual([...menu.querySelectorAll('[role="menuitem"] span')].map(item=>item.textContent),["Filters","Sort","Columns","Group by","Display settings","Manage views"]);
  await act(async()=>[...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item=>item.textContent===label)!.click());
 };
 try{
  await act(async()=>root.render(<EntityListRuntime client={client} entityCode="business_partner"/>));
  await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!.click());
  const drawer=dom.window.document.querySelector('[role="dialog"]');const calls=listCalls;
  await switchTo("Group by");
  const group=dom.window.document.querySelector<HTMLSelectElement>('[data-list-drawer="group"] select')!;
  await act(async()=>{group.value="status";group.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await switchTo("Sort");await switchTo("Group by");
  assert.equal(dom.window.document.querySelector('[role="dialog"]'),drawer,"Same drawer and backdrop survive switches");
  assert.equal(dom.window.document.querySelectorAll('.a-drawer-layer').length,1);
  assert.equal(group.value,"status","Unapplied grouping draft survives switching");
  assert.equal(listCalls,calls,"Switching does not apply a query");
  assert.ok(dom.window.document.querySelector('[data-list-drawer="sort"][hidden][inert]'));
  const applyGroup=[...dom.window.document.querySelectorAll<HTMLButtonElement>('[data-list-drawer="group"] button')].find(button=>button.textContent==="Apply grouping")!;
  await act(async()=>{applyGroup.focus();applyGroup.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:"Tab",bubbles:true,cancelable:true}));});
  assert.match(dom.window.document.activeElement?.getAttribute('aria-label')??'',/^Switch list controls/);
  await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-label^="Switch list controls"]')!.click());
  await act(async()=>dom.window.document.querySelector('[role="menuitem"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:"Escape",bubbles:true,cancelable:true})));
  assert.equal(dom.window.document.querySelector('.a-entity-list__drawer-menu'),null);
  assert.equal(dom.window.document.querySelector('[role="dialog"]'),drawer,"Escape dismisses the selector before the drawer");
  await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Close group by"]')!.click());
  await act(async()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!.click());
  await switchTo("Group by");
  assert.equal(dom.window.document.querySelector<HTMLSelectElement>('[data-list-drawer="group"] select')!.value,"","Closing discards unapplied drafts");
  const {LIST_DRAWERS}=await import('../../packages/platform/entity/runtime/list-view/src/drawer-registry');
  const restricted={...base,fields:base.fields.map(field=>({...field,filterOperators:[],sortable:false,groupable:false}))};
  assert.deepEqual(LIST_DRAWERS.filter(item=>item.available(restricted)).map(item=>item.key),["columns","display","views"]);
 }finally{await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as Record<string,unknown>)[key];}dom.window.close();}
});

test("standard view keys remain symbolic through saved configuration and portable URLs",async()=>{
 const {encodeListLocationState,decodeListLocationState}=await import('../../packages/contracts/platform/entity-list/src/index');
 const {saveableViewState}=await import('../../packages/platform/entity/runtime/list-view/src/preferences');
 const base=descriptor(digest('b')), state={...base.surface.defaultState,standardViewKey:"mine"};
 const saved=saveableViewState(state);assert.equal(saved.standardViewKey,"mine");assert.equal(JSON.stringify(saved).includes('principalId'),false);
 const url=encodeListLocationState(state,base,{includeViewIds:false});assert.equal(url.get('standardView'),"mine");assert.equal(decodeListLocationState(url,base).standardViewKey,"mine");
});

test("field-aware filters select reference keys, reuse applied choices, and reject invalid dates", async () => {
  const { FilterValueEditor, filterValidationError, recentFilterKey, rememberFilters } = await import("../../packages/platform/entity/runtime/list-view/src/filter-editor");
  const { filterValueFromInput, filterInputValue, describeFilter } = await import("../../packages/platform/entity/runtime/list-view/src/state");
  const base = descriptor("user-a"), country = { ...base.fields[0]!, key: "country", label: "Country", valueKind: "reference" as const, filterOperators: ["eq", "in", "is_null"] as const, filterOptions: [{ value: "MY", label: "Malaysia" }, { value: "SG", label: "Singapore" }] };
  const date = { ...country, key: "updated", valueKind: "datetime" as const, filterOptions: undefined, filterOperators: ["between", "relative", "eq"] as const };
  assert.match(filterValidationError(date, "between", "2026-09-09T10:00,")!, /both/);
  assert.match(filterValidationError(date, "between", "2026-09-09T10:00,2026-09-08T10:00")!, /end/);
  assert.match(filterValidationError(date, "eq", "2026-02-30T10:00")!, /valid date/);
  assert.equal(filterValidationError(date, "between", "2026-09-08T10:00,2026-09-09T10:00"), undefined);
  assert.equal(filterValueFromInput("relative", "last_30_days", "datetime"), "last_30_days");
  assert.equal(filterInputValue({ field: "updated", operator: "relative", value: "this_month" }, "datetime"), "this_month");
  assert.equal(filterValueFromInput("eq", "2", "enum", [{ value: 2, label: "Two" }]), 2);
  assert.equal(describeFilter({ field: "country", operator: "in", value: ["MY", "SG"] }, { ...base, fields: [country] }), "Country is any of Malaysia, Singapore");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://neon.test/manage", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const key = recentFilterKey(base); let selected = "";
  const render = async () => act(async () => root.render(<FilterValueEditor field={country} operator="in" value={selected} filterNumber={1} historyKey={key} onChange={value => { selected = value; }}/>));
  try {
    await render();
    const input = dom.window.document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await act(async () => input.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    const malaysia = dom.window.document.querySelector('[role="option"]')!;
    await act(async () => malaysia.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(selected, "MY", "The reference key, not its name, is submitted");
    assert.equal(dom.window.sessionStorage.length, 0, "Draft choices are not remembered");
    await render();
    assert.ok(dom.window.document.querySelector('[aria-label="Remove Malaysia"]'));
    rememberFilters(key, [{ field: country.key, operator: "in", value: ["MY"] }], [country]);
    selected = "SG"; await render();
    const recent = dom.window.document.querySelector<HTMLSelectElement>('[aria-label="Recent choices for Country"]')!;
    assert.match(recent.textContent!, /Malaysia/);
    await act(async () => { recent.value = "MY"; recent.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(selected, "MY");
    await act(async () => root.render(<FilterValueEditor field={country} operator="in" value="" filterNumber={1} historyKey={recentFilterKey(descriptor("user-b"))} onChange={() => {}}/>));
    assert.equal(dom.window.document.querySelector('[aria-label="Recent choices for Country"]'), null, "History never crosses authorization scopes");
  } finally { await act(async () => root.unmount()); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as Record<string, unknown>)[key]; } dom.window.close(); }
});

test("directory filters are metadata-gated and stage company changes until Apply",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://neon.test/manage',pretendToBeVisual:true});
 const previous=['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},HTMLElement:{configurable:true,value:dom.window.HTMLElement},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
 const root=createRoot(dom.window.document.getElementById('root')!);let calls=0;
 const base=descriptor(digest('b'));const configured={...base,scope:{...base.scope,filterKinds:['organization','company'] as const}};
 const client={request:async(operation:unknown)=>operation===entityListDescriptorOperation?configured:operation===recordBookmarkMembershipOperation?new Set():page(digest('b'),'BP')} as unknown as HttpClient;
 const company={companyCodeId:'company',code:'DE01',displayName:'Germany Operations',legalEntityId:'legal',legalEntityCode:'LE-DE',legalEntityName:'Germany Legal Entity',countryCode:'DE',functionalCurrency:'EUR'};
 function App(){const[value,setValue]=React.useState({});return <DirectoryFilterContext.Provider value={{value,companies:[company,{...company,companyCodeId:"second",code:"DE02",displayName:"Germany Sales"}],organizations:[{id:"org",displayName:"Europe Operations",companyAssignments:[]}],apply:next=>{calls++;setValue(next);}}}><EntityListRuntime client={client} entityCode="business_partner"/></DirectoryFilterContext.Provider>;}
 const click=async(selector:string)=>act(async()=>dom.window.document.querySelector<HTMLButtonElement>(selector)!.click());
 const clickText=async(text:string)=>act(async()=>{const target=[...dom.window.document.querySelectorAll<HTMLElement>('button,[role="tab"]')].find(e=>e.textContent?.trim()===text);assert.ok(target,`Missing ${text}`);target.click();});
 try{
  await act(async()=>root.render(<App/>));await click('[aria-label="Filters"]');await clickText('Company');
  await click('.a-company-groups__row input');await clickText('Organization');await click('.a-directory-organizations input');await clickText('Company');assert.equal(dom.window.document.querySelector<HTMLInputElement>('.a-company-groups__row input')!.checked,true);assert.equal(calls,0);
  await clickText('Cancel');assert.equal(calls,0);
  await click('[aria-label="Filters"]');await clickText('Company');
  assert.equal(dom.window.document.querySelector<HTMLInputElement>('.a-company-groups__row input')!.checked,false);
  await click('.a-company-groups__row input');await click('.a-company-groups__row:nth-child(2) input');await clickText('Organization');await click('.a-directory-organizations input');await click('.a-entity-list__filter-actions button:last-child');
  assert.equal(calls,1);assert.equal(dom.window.document.querySelectorAll(".a-directory-filter__chips button").length,3);assert.match(dom.window.document.querySelector('[aria-label="Remove company filter company"]')!.getAttribute('title')!,/Germany Operations/);
  await click('[aria-label="Remove company filter company"]');assert.equal(calls,2);
  configured.scope.filterKinds=[] as unknown as typeof configured.scope.filterKinds;
  await act(async()=>root.render(<App key="unsupported"/>));await click('[aria-label="Filters"]');
  assert.ok(![...dom.window.document.querySelectorAll('[role="tab"]')].some(e=>e.textContent==='Company' || e.textContent==='Organization'));
 }finally{await act(async()=>root.unmount());for(const[key,property]of previous){if(property)Object.defineProperty(globalThis,key,property);else Reflect.deleteProperty(globalThis,key);}dom.window.close();}
});

test("scope quick filters stage values, enforce dependencies and reset",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://neon.test/manage',pretendToBeVisual:true});
 const previous=['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 Object.defineProperties(globalThis,{window:{configurable:true,value:dom.window},document:{configurable:true,value:dom.window.document},HTMLElement:{configurable:true,value:dom.window.HTMLElement},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}});
 const root=createRoot(dom.window.document.getElementById('root')!);let calls=0;
 const base=descriptor(digest('b'));const configured={...base,scope:{...base.scope,filterKinds:['organization','company'] as const,quickFilters:[{key:'partnerRole' as const,label:'Role',emptyLabel:'All partners',options:[{value:'supplier',label:'Suppliers'}]},{key:'eligibleOperation' as const,label:'Eligible for transactions',emptyLabel:'Any',options:[{value:'order',label:'Orders'}],requires:['partnerRole','organization','company'] as const}]}};
 const client={request:async(operation:unknown)=>operation===entityListDescriptorOperation?configured:operation===recordBookmarkMembershipOperation?new Set():page(digest('b'),'BP')} as unknown as HttpClient;
 const company={companyCodeId:'company',code:'DE01',displayName:'Germany Operations',legalEntityId:'legal',legalEntityCode:'LE-DE',legalEntityName:'Germany Legal Entity',countryCode:'DE',functionalCurrency:'EUR'};
 function App(){const[value,setValue]=React.useState({});return <DirectoryFilterContext.Provider value={{value,companies:[company,{...company,companyCodeId:"second",code:"DE02",displayName:"Germany Sales"}],organizations:[{id:"org",displayName:"Europe Operations",companyAssignments:[{companyCodeId:"company"}]}],apply:next=>{calls++;setValue(next);}}}><EntityListRuntime client={client} entityCode="business_partner"/></DirectoryFilterContext.Provider>;}
 const click=async(selector:string)=>act(async()=>dom.window.document.querySelector<HTMLButtonElement>(selector)!.click());
 const clickText=async(text:string)=>act(async()=>{const target=[...dom.window.document.querySelectorAll<HTMLElement>('button,[role="tab"]')].find(e=>e.textContent?.trim()===text);assert.ok(target,`Missing ${text}`);target.click();});

 const change=async(label:string,value:string)=>act(async()=>{const input=dom.window.document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const eligibility=()=>dom.window.document.querySelector<HTMLSelectElement>('select[aria-label="Eligible for transactions"]')!;
 try{
  await act(async()=>root.render(<App/>));await click('[aria-label^="Filters"]');
  assert.equal(eligibility().disabled,true);
  await change('Role','supplier');
  await clickText('Company');await click('.a-company-groups__row input');
  await clickText('Organization');await click('.a-directory-organizations input');
  await clickText('Quick filters');assert.equal(eligibility().disabled,false);
  await change('Eligible for transactions','order');assert.equal(calls,0);
  await clickText('Cancel');assert.equal(calls,0);
  await click('[aria-label^="Filters"]');assert.equal(eligibility().value,'');
  await change('Role','supplier');await clickText('Company');await click('.a-company-groups__row input');
  await clickText('Organization');await click('.a-directory-organizations input');await clickText('Quick filters');
  await change('Eligible for transactions','order');await click('.a-entity-list__filter-actions button:last-child');
  assert.equal(calls,1);assert.ok(dom.window.document.querySelector('[aria-label="Remove Eligible for transactions filter"]'));
  await click('[aria-label^="Filters"]');assert.equal(eligibility().value,'order');
  await clickText('Company');await click('.a-company-groups__row:nth-child(2) input');await clickText('Quick filters');
  assert.equal(eligibility().disabled,true);assert.equal(eligibility().value,'');
  await clickText('Reset filters');await click('.a-entity-list__filter-actions button:last-child');assert.equal(calls,2);
  assert.equal(dom.window.document.querySelectorAll('.a-directory-filter__chips button').length,0);
 }finally{await act(async()=>root.unmount());for(const[key,property]of previous){if(property)Object.defineProperty(globalThis,key,property);else Reflect.deleteProperty(globalThis,key);}dom.window.close();}
});
