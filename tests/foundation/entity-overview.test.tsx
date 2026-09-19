import { IntlProvider } from "../../packages/platform/foundation/i18n/src/react";
import { createEffectiveLocalization } from "../../packages/platform/foundation/i18n/src/index";
import { shellEnglishMessages } from "../../packages/platform/shell/shell/src/messages";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type {
  EntityListDescriptorV1,
  EntityApplicationDescriptorV1,
  EntityListResultV1,
} from "@athyper/contract-platform-entity-list";
import { decodeListLocationState } from "@athyper/contract-platform-entity-list";
import {
  entityListDescriptorOperation,
  recordBookmarksOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
import {
  EntityOverview,
  EntityOverviewRuntime,
  overviewCount,
  overviewListState,
} from "../../packages/platform/entity/runtime/list-view/src/overview";
const text = (value: string) => ({
  defaultLocale: "en",
  values: { en: value },
});
const descriptor: EntityListDescriptorV1 = {
  schemaVersion: 1,
  plane: "neon",
  entity: {
    code: "asset",
    label: "Asset",
    pluralLabel: "Assets",
    identityField: "code",
    detailRouteTemplate: "/assets/:recordId",
  },
  revision: {
    release: 1,
    descriptorHash: "a".repeat(64),
    surfaceHash: "b".repeat(64),
  },
  surface: {
    key: "list",
    title: "Assets",
    defaultState: {
      filters: [{ field: "code", operator: "eq", value: "default-filter" }],
      sort: [],
      columns: ["code"],
      density: "comfortable",
      mode: "table",
    },
    supportedModes: ["table"],
    search: { minimumQueryLength: 1 },
    filterPresentation: {
      quickFields: [],
      source: "metadata",
      allowUserPinning: false,
    },
  },
  fields: [
    {
      key: "code",
      label: "Code",
      valueKind: "string",
      defaultVisible: true,
      defaultOrder: 0,
      filterOperators: ["eq"],
      sortable: true,
      groupable: false,
      aggregations: [],
    },
    {
      key: "updated_at",
      label: "Updated",
      valueKind: "datetime",
      defaultVisible: true,
      defaultOrder: 1,
      filterOperators: [],
      sortable: true,
      groupable: false,
      aggregations: [],
    },
  ],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "scope-a" },
  limits: {
    defaultPageSize: 25,
    allowedPageSizes: [25, 50],
    maxSortLevels: 3,
    countMode: "exact",
  },
  standardViews: [
    { key: "my_records", label: text("My records"), position: 0 },
  ],
};
const application: EntityApplicationDescriptorV1 = {
  ...descriptor,
  navigation: [
    {
      key: "overview",
      surfaceKey: "overview",
      label: text("Overview"),
      href: "/assets",
      aliases: [],
      placement: "direct",
      content: { kind: "overview" },
    },
    {
      key: "manage",
      surfaceKey: "list",
      label: text("Manage"),
      href: "/assets/manage",
      aliases: [],
      placement: "direct",
      content: { kind: "entity_list", entityCode: "asset" },
    },
    {
      key: "review",
      surfaceKey: "review",
      label: text("Review"),
      href: "/assets/review",
      aliases: [],
      placement: "direct",
      content: { kind: "task_list", entityCode: "tasks" },
    },
  ],
};
const page = (count = 12): EntityListResultV1 => ({
  schemaVersion: 1,
  descriptorHash: descriptor.revision.descriptorHash,
  scopeFingerprint: descriptor.scope.fingerprint,
  queryHash: "c".repeat(64),
  rows: [
    {
      id: "record-1",
      values: { code: "ASSET-001", updated_at: "2026-09-08T10:30:00Z" },
    },
  ],
  pagination: {
    pageSize: 25,
    hasNext: false,
    hasPrevious: false,
    total: count,
    countMode: "exact",
  },
});

test("overview never claims unknown attention queues are clear or sums overlapping queues", () => {
  const base = { showSummary: true, metrics: [], shortcuts: [], records: [] };
  const queue = { key: "review", label: "Review", href: "/review" };
  assert.doesNotMatch(
    renderToStaticMarkup(<EntityOverview {...base} focus={[queue]} />),
    /You’re up to date/,
  );
  assert.match(
    renderToStaticMarkup(
      <EntityOverview {...base} focus={[{ ...queue, count: 0 }]} />,
    ),
    /You’re up to date/,
  );
  const html = renderToStaticMarkup(
    <EntityOverview
      {...base}
      focus={[
        { ...queue, count: 5 },
        { ...queue, key: "other", count: 5 },
      ]}
    />,
  );
  assert.match(html, /2 areas need attention/);
  assert.doesNotMatch(html, /10 items/);
});
test("counts preserve approximate and unavailable totals; overview state excludes default filters", () => {
  assert.equal(overviewCount(page()), "12");
  assert.equal(
    overviewCount({
      ...page(),
      pagination: { ...page().pagination, countMode: "approximate" },
    }),
    "≈12",
  );
  assert.equal(
    overviewCount({
      ...page(),
      pagination: { ...page().pagination, total: undefined, hasNext: true },
    }),
    undefined,
  );
  const state = overviewListState(descriptor);
  assert.deepEqual(state.filters, []);
  assert.deepEqual(state.sort, [{ field: "updated_at", direction: "desc" }]);
});
test("runtime uses scoped authorized data, linked views, and suppresses results after a scope change", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/assets",
  });
  const prior = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const calls: { query?: Record<string, unknown> }[] = [];
  let fail = false,
    hold = false,
    release: (() => void) | undefined;
  const client = {
    request: async (
      operation: unknown,
      options: { query?: Record<string, unknown> },
    ) => {
      calls.push(options);
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (fail) throw new Error("unavailable");
      if (operation === recordBookmarksOperation) return [];
      return operation === entityListDescriptorOperation
        ? descriptor
        : page(options.query?.standardView ? 3 : 12);
    },
  } as unknown as HttpClient;
  const render = (scope = "one") => (
    <EntityOverviewRuntime
      client={client}
      application={application}
      scopeCoordinate={{ companyCodeId: scope }}
    />
  );
  try {
    await act(async () => root.render(render()));
    assert.match(dom.window.document.body.textContent!, /ASSET-001/);
    assert.match(dom.window.document.body.textContent!, /Recently updated/);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.query?.companyCodeId === "one"));
    const metrics = dom.window.document.querySelectorAll<HTMLAnchorElement>(
      ".a-entity-pulse__metric",
    );
    assert.equal(metrics.length, 0);
    assert.equal(
      dom.window.document.querySelector(".a-entity-pulse__hero"),
      null,
    );
    assert.equal(
      dom.window.document.querySelector(".a-entity-pulse__toolbar"),
      null,
    );
    const shortcut = dom.window.document.querySelectorAll<HTMLAnchorElement>(
      ".a-entity-pulse__shortcuts a",
    )[1]!;
    const location = decodeListLocationState(
      new URL(shortcut.href).searchParams,
      descriptor,
    );
    assert.equal(location.standardViewKey, "my_records");
    assert.deepEqual(location.filters, []);
    hold = true;
    await act(async () => root.render(render("two")));
    assert.doesNotMatch(dom.window.document.body.textContent!, /ASSET-001/);
    fail = true;
    hold = false;
    await act(async () => release?.());
    assert.match(
      dom.window.document.querySelector('[role="alert"]')!.textContent!,
      /couldn’t be loaded/,
    );
    fail = false;
    await act(async () =>
      dom.window.document
        .querySelector<HTMLButtonElement>('[role="alert"] button')!
        .click(),
    );
    assert.match(dom.window.document.body.textContent!, /ASSET-001/);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of prior) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});

test("overview resolves catalog overrides and falls back without changing metadata labels", () => {
  const markup = renderToStaticMarkup(
    <IntlProvider
      localization={createEffectiveLocalization({ uiLocale: "fr" })}
      messages={{ "entity.overview.focus.title": "À traiter" }}
      fallbackMessages={shellEnglishMessages}
    >
      <EntityOverview metrics={[]} focus={[]} records={[]} shortcuts={[{ key: "manage", label: "Published view name", href: "/records" }]} />
    </IntlProvider>,
  );
  assert.match(markup, /À traiter/);
  assert.match(markup, /No favourites yet/);
  assert.match(markup, /Published view name/);
  assert.doesNotMatch(markup, /entity\.overview\.|shortcut-number/);
});
