import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeListLocationState,
  isListDateValue,
  isListInstantValue,
  parseSaveableListState,
  temporalFilterValueError,
  ENTITY_LIST_MAX_FILTERS,
  ENTITY_LIST_MAX_SEARCH_LENGTH,
  ENTITY_LIST_MAX_URL_LENGTH,
  ENTITY_LIST_MAX_VISIBLE_COLUMNS,
  encodeListLocationState,
  parseEntityListDescriptor,
  parseEntityListResult,
  parseListLocationState,
  toSaveableListState,
} from "../../packages/contracts/platform/entity-list/src/index";
import {
  describeFilter,
  filterInputValue,
  filterValueFromInput,
  nextPrimarySort,
  visibleListFields,
  withoutNavigation,
} from "../../packages/platform/entity/runtime/list-view/src/state";

const digest = "a".repeat(64);
it("normalizes malformed URL state but never hides descriptor failures", () => {
  const descriptor = parseEntityListDescriptor(descriptorPayload);
  for (const query of [
    "density=bad",
    "page=-1",
    "page=NaN",
    "pageSize=Infinity",
    "group=%00",
    "standardView=%00",
    'filter.name={"operator":"eq","value":{"bad":true}}',
  ])
    assert.doesNotThrow(() => decodeListLocationState(query, descriptor));
  assert.throws(() =>
    decodeListLocationState("density=bad", {
      ...descriptor,
      fields: null,
    } as never),
  );
  assert.throws(() =>
    decodeListLocationState("density=bad", descriptor, {
      baseState: { density: "bad" } as never,
    }),
  );
});
it("retains valid URL state when a separate optional parameter is invalid", () => {
  const descriptor = parseEntityListDescriptor(descriptorPayload);
  const state = decodeListLocationState(
    "q=Malaysia&sort=name:asc&density=invalid&page=not-a-number",
    descriptor,
  );
  assert.equal(state.query, "Malaysia");
  assert.deepEqual(state.sort, [{ field: "name", direction: "asc" }]);
  assert.equal(state.density, "comfortable");
  assert.equal(state.pageIndex, undefined);
});
const descriptorPayload = {
  schemaVersion: 1,
  plane: "neon",
  entity: {
    code: "business_partner",
    label: "Business partner",
    pluralLabel: "Business partners",
    identityField: "code",
    detailRouteTemplate: "/app/business-partner/:recordId",
  },
  revision: { release: 1, descriptorHash: digest, surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list",
    title: "Business partners",
    defaultState: {
      filters: [],
      sort: [{ field: "name", direction: "asc" }],
      columns: ["code", "name"],
      density: "comfortable",
      mode: "table",
    },
    supportedModes: ["table", "compact"],
    filterPresentation: {
      quickFields: [{ field: "status", defaultOperator: "eq" }],
      source: "metadata",
      allowUserPinning: true,
    },
  },
  fields: [
    {
      key: "code",
      label: "Code",
      columnGroup: "Identification",
      valueKind: "string",
      defaultVisible: true,
      defaultOrder: 0,
      filterOperators: ["eq", "contains"],
      sortable: true,
      groupable: false,
      aggregations: [],
    },
    {
      key: "name",
      label: "Name",
      valueKind: "string",
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
      defaultVisible: true,
      defaultOrder: 2,
      filterOperators: ["eq", "in"],
      sortable: true,
      groupable: true,
      aggregations: ["count"],
    },
  ],
  actions: [
    {
      key: "create",
      label: "Create",
      placement: "primary",
      selection: "none",
      execution: "navigate",
      state: "enabled",
      requiresPreflight: false,
      supportsAllMatching: false,
    },
  ],
  scope: {
    status: "ready",
    labels: [{ key: "company", label: "Company", value: "MY01" }],
    fingerprint: "c".repeat(64),
  },
  limits: {
    defaultPageSize: 50,
    allowedPageSizes: [25, 50, 100],
    maxSortLevels: 3,
    countMode: "none",
  },
} as const;

describe("entity list browser contract", () => {
  it("parses bounded descriptor-driven import and export capabilities", () => {
    const enabled = {
      state: "enabled",
      maxRecords: 5000,
      requiredPermission: "records.export",
      requiresPreflight: true,
      requiresApproval: false,
    };
    const hidden = {
      state: "hidden",
      requiresPreflight: false,
      requiresApproval: false,
    };
    const parsed = parseEntityListDescriptor({
      ...descriptorPayload,
      dataOperations: {
        export: {
          currentPage: enabled,
          selected: enabled,
          filtered: enabled,
          all: hidden,
          formats: ["csv", "json", "ndjson"],
          defaultFormat: "csv",
          exportableFields: ["code", "name", "not_readable"],
          asynchronousThreshold: 1000,
        },
        import: {
          create: hidden,
          update: hidden,
          upsert: hidden,
          downloadTemplate: hidden,
          formats: ["csv", "json"],
          defaultFormat: "csv",
          importableFields: ["name", "not_readable"],
          maxFileBytes: 10_000_000,
          maxRows: 10_000,
          draftOnly: false,
        },
      },
    });
    assert.deepEqual(parsed.dataOperations?.export.exportableFields, [
      "code",
      "name",
    ]);
    assert.deepEqual(parsed.dataOperations?.import.importableFields, ["name"]);
    assert.equal(
      parsed.dataOperations?.export.filtered.requiredPermission,
      "records.export",
    );
  });

  it("parses a safe descriptor and drops undeclared storage coordinates", () => {
    const descriptor = parseEntityListDescriptor({
      ...descriptorPayload,
      storage: { schema: "master", object: "business_partner" },
      fields: descriptorPayload.fields.map((field) => ({
        ...field,
        storagePath: field.key,
      })),
    });
    assert.equal(descriptor.entity.identityField, "code");
    assert.equal(descriptor.fields[0]?.columnGroup, "Identification");
    assert.equal(Object.isFrozen(descriptor.fields), true);
    assert.deepEqual(descriptor.surface.filterPresentation.quickFields, [
      { field: "status", defaultOperator: "eq" },
    ]);
    assert.equal(descriptor.surface.filterPresentation.source, "metadata");
    assert.equal("storage" in descriptor, false);
    assert.equal("storagePath" in descriptor.fields[0]!, false);
  });

  it("rejects descriptors whose identity field is not readable", () => {
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...descriptorPayload,
          entity: { ...descriptorPayload.entity, identityField: "tax_id" },
        }),
      /identityField/,
    );
  });

  it("accepts declared record-card priorities and rejects unknown ones", () => {
    const withPriority = (cardPriority: string) => ({
      ...descriptorPayload,
      fields: descriptorPayload.fields.map((field, index) =>
        index ? field : { ...field, cardPriority },
      ),
    });
    assert.equal(
      parseEntityListDescriptor(withPriority("primary")).fields[0]!
        .cardPriority,
      "primary",
    );
    assert.throws(
      () => parseEntityListDescriptor(withPriority("top")),
      /cardPriority/,
    );
  });

  it("accepts the four declared audit roles and rejects any other", () => {
    const withAudit = (auditRole: string) => ({
      ...descriptorPayload,
      fields: descriptorPayload.fields.map((field, index) =>
        index ? field : { ...field, auditRole },
      ),
    });
    for (const role of ["createdAt", "createdBy", "updatedAt", "updatedBy"])
      assert.equal(parseEntityListDescriptor(withAudit(role)).fields[0]!.auditRole, role);
    assert.throws(() => parseEntityListDescriptor(withAudit("updated_at")), /auditRole/);
  });

  it("normalizes unknown URL fields, unsupported operators, duplicate sorts, and unsupported modes", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const state = decodeListLocationState(
      "?q=acme&filter.status=%7B%22operator%22%3A%22eq%22%2C%22value%22%3A%22active%22%7D&filter.tax_id=%7B%22operator%22%3A%22eq%22%2C%22value%22%3A%22secret%22%7D&sort=name:desc,name:asc,tax_id:asc&cols=name,tax_id&view=board&pageSize=75",
      descriptor,
    );
    assert.deepEqual(state.filters, [
      { field: "status", operator: "eq", value: "active" },
    ]);
    assert.deepEqual(state.sort, [{ field: "name", direction: "desc" }]);
    assert.deepEqual(state.columns, ["code", "name"]);
    assert.equal(state.mode, "table");
    assert.equal(state.pageSize, 50);
  });

  it("applies a shared-link layout only when this viewer can use it", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    assert.equal(
      decodeListLocationState("?view=compact", descriptor).mode,
      "compact",
    );
    assert.equal(
      decodeListLocationState("?view=dashboard", descriptor).mode,
      descriptor.surface.defaultState.mode,
    );
    assert.equal(
      decodeListLocationState("?view=not-a-mode", descriptor).mode,
      descriptor.surface.defaultState.mode,
    );
  });

  it("parses declared-but-unusable modes and rejects contradictory entries", () => {
    const withUnavailable = (unavailableModes: unknown) => ({
      ...descriptorPayload,
      surface: { ...descriptorPayload.surface, unavailableModes },
    });
    const parsed = parseEntityListDescriptor(
      withUnavailable([{ mode: "board", code: "LIST_MODE_UNSUPPORTED" }]),
    );
    assert.deepEqual(parsed.surface.unavailableModes, [
      { mode: "board", code: "LIST_MODE_UNSUPPORTED" },
    ]);
    assert.equal(
      parseEntityListDescriptor(descriptorPayload).surface.unavailableModes,
      undefined,
    );
    assert.throws(() =>
      parseEntityListDescriptor(
        withUnavailable([{ mode: "table", code: "LIST_MODE_UNSUPPORTED" }]),
      ),
    );
    assert.throws(() =>
      parseEntityListDescriptor(
        withUnavailable([
          { mode: "board", code: "LIST_MODE_UNSUPPORTED" },
          { mode: "board", code: "LIST_MODE_UNSUPPORTED" },
        ]),
      ),
    );
    assert.throws(() =>
      parseEntityListDescriptor(
        withUnavailable([{ mode: "board", code: "not a code" }]),
      ),
    );
  });

  it("parses a viewer's board and keeps board state through saved views and links", () => {
    const board = {
      laneFields: [
        {
          field: "status",
          label: "Status",
          noValueLane: true,
          lanes: [
            {
              key: "active",
              label: "Active",
              values: ["active"],
              tone: "success",
              collapsed: false,
              terminal: false,
            },
            {
              key: "closed",
              label: "Closed",
              localizedLabel: {
                defaultLocale: "en",
                values: { en: "Closed", ms: "Ditutup" },
              },
              values: ["inactive", "archived"],
              tone: "neutral",
              collapsed: true,
              terminal: true,
            },
          ],
        },
      ],
    };
    const payload = {
      ...descriptorPayload,
      surface: {
        ...descriptorPayload.surface,
        supportedModes: ["table", "compact", "board"],
        board,
        cardContent: { fields: [{ field: "name" }] },
      },
    };
    const descriptor = parseEntityListDescriptor(payload);
    assert.equal(
      descriptor.surface.board?.laneFields[0]?.lanes[1]?.localizedLabel?.values
        .ms,
      "Ditutup",
    );
    assert.deepEqual(descriptor.surface.defaultState.board, {
      laneField: "status",
      collapsed: ["closed"],
    });
    assert.deepEqual(descriptor.surface.cardContent, {
      fields: [{ field: "name" }],
    });

    const shared = decodeListLocationState(
      "?view=board&lanes.collapsed=",
      descriptor,
    );
    assert.equal(shared.mode, "board");
    assert.deepEqual(shared.board, { laneField: "status", collapsed: [] });
    const encoded = encodeListLocationState(shared, descriptor);
    assert.equal(encoded.get("view"), "board");
    assert.equal(encoded.get("lanes.collapsed"), "");
    assert.deepEqual(
      decodeListLocationState(encoded, descriptor).board,
      shared.board,
    );

    const stale = parseListLocationState(
      {
        ...descriptor.surface.defaultState,
        board: { laneField: "retired_field", collapsed: ["gone"] },
      },
      descriptor,
    );
    assert.deepEqual(stale.board, { laneField: "status", collapsed: [] });

    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: { ...payload.surface, supportedModes: ["table"] },
        }),
      /exactly when Board/,
    );
    const duplicate = structuredClone(board);
    duplicate.laneFields[0]!.lanes[1]!.values = ["active"];
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: { ...payload.surface, board: duplicate },
        }),
      /exactly one lane/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            board: {
              laneFields: [{ ...board.laneFields[0], field: "missing" }],
            },
          },
        }),
      /listed field/,
    );
  });

  it("requires date filter values to be written exactly as they are compared", () => {
    assert.equal(isListDateValue("2026-10-08"), true);
    assert.equal(isListDateValue("2026-02-30"), false);
    assert.equal(isListDateValue("2026-10-08T00:00:00Z"), false);
    assert.equal(isListInstantValue("2026-10-08T14:30:00Z"), true);
    assert.equal(isListInstantValue("2026-10-08T14:30:00.125+08:00"), true);
    assert.equal(isListInstantValue("2026-10-08T14:30:00"), false, "no offset");
    assert.equal(isListInstantValue("2026-10-08T14:30Z"), false, "no seconds");
    assert.equal(
      isListInstantValue("2026-10-01T00:00+08:00"),
      false,
      "minutes-only with an offset",
    );
    assert.equal(
      isListInstantValue("2026-10-08T14:30:00+0800"),
      false,
      "malformed offset",
    );
    assert.equal(
      isListInstantValue("2026-10-08"),
      false,
      "date on a datetime field",
    );
    assert.equal(
      temporalFilterValueError("date", "between", ["2026-10-01", "2026-10-31"]),
      undefined,
    );
    assert.match(
      temporalFilterValueError("date", "in", [
        "2026-10-01",
        "2026-10-01T00:00:00Z",
      ]) ?? "",
      /YYYY-MM-DD/,
    );
    assert.equal(temporalFilterValueError("datetime", "eq", null), undefined);
    assert.equal(
      temporalFilterValueError("datetime", "relative", "today"),
      undefined,
    );
    assert.equal(
      temporalFilterValueError("string", "eq", "2026-10-08T14:30:00"),
      undefined,
    );
  });

  it("drops only the malformed date filter from a link, and refuses it in stored state", () => {
    const payload = {
      ...descriptorPayload,
      fields: [
        ...descriptorPayload.fields,
        {
          key: "due_on",
          label: "Due on",
          valueKind: "date",
          defaultVisible: false,
          defaultOrder: 3,
          filterOperators: ["gte", "lt"],
          sortable: true,
          groupable: false,
          aggregations: [],
        },
        {
          key: "updated_at",
          label: "Updated",
          valueKind: "datetime",
          defaultVisible: false,
          defaultOrder: 4,
          filterOperators: ["gte", "lt"],
          sortable: true,
          groupable: false,
          aggregations: [],
        },
      ],
    };
    const descriptor = parseEntityListDescriptor(payload);
    const good = encodeURIComponent(
      JSON.stringify({ operator: "gte", value: "2026-10-01" }),
    );
    const local = encodeURIComponent(
      JSON.stringify({ operator: "lt", value: "2026-10-08T14:30:00" }),
    );
    const state = decodeListLocationState(
      `?filter.due_on=${good}&filter.updated_at=${local}`,
      descriptor,
    );
    assert.deepEqual(state.filters, [
      { field: "due_on", operator: "gte", value: "2026-10-01" },
    ]);
    assert.throws(
      () =>
        parseSaveableListState(
          {
            ...descriptor.surface.defaultState,
            filters: [
              {
                field: "updated_at",
                operator: "lt",
                value: "2026-10-08T14:30:00",
              },
            ],
          },
          descriptor,
        ),
      /RFC 3339/,
    );
  });

  it("parses a viewer's calendar, normalizes its state and keeps the anchor out of saved state", () => {
    const fields = [
      ...descriptorPayload.fields,
      {
        key: "due_on",
        label: "Due on",
        valueKind: "date",
        defaultVisible: false,
        defaultOrder: 3,
        filterOperators: ["gte", "lt", "is_null"],
        sortable: true,
        groupable: false,
        aggregations: [],
      },
    ];
    const calendar = {
      defaultView: "month",
      dateFields: [
        {
          start: "due_on",
          label: "Due on",
          kind: "date",
          unscheduled: true,
          tone: { field: "status", tones: { active: "success" } },
        },
      ],
    };
    const payload = {
      ...descriptorPayload,
      fields,
      surface: {
        ...descriptorPayload.surface,
        supportedModes: ["table", "compact", "calendar"],
        calendar,
      },
    };
    const descriptor = parseEntityListDescriptor(payload);
    assert.deepEqual(descriptor.surface.calendar?.dateFields[0]?.tone, {
      field: "status",
      tones: { active: "success" },
    });
    assert.deepEqual(descriptor.surface.defaultState.calendar, {
      dateField: "due_on",
      view: "month",
    });

    const shared = decodeListLocationState(
      "?view=calendar&cal=2026-10-08&cal.view=agenda",
      descriptor,
    );
    assert.equal(shared.mode, "calendar");
    assert.equal(shared.calendarAnchor, "2026-10-08");
    assert.deepEqual(shared.calendar, { dateField: "due_on", view: "agenda" });
    const encoded = encodeListLocationState(shared, descriptor);
    assert.equal(encoded.get("cal"), "2026-10-08");
    assert.equal(encoded.get("cal.view"), "agenda");
    assert.equal("calendarAnchor" in toSaveableListState(shared), false);

    assert.deepEqual(
      decodeListLocationState(
        "?view=calendar&cal.view=week&cal.field=retired",
        descriptor,
      ).calendar,
      { dateField: "due_on", view: "month" },
    );
    assert.equal(
      decodeListLocationState("?view=calendar&cal=not-a-day", descriptor)
        .calendarAnchor,
      undefined,
    );
    // Date rolls 30 February into March; an impossible day is no anchor.
    assert.equal(
      decodeListLocationState("?view=calendar&cal=2026-02-30", descriptor)
        .calendarAnchor,
      undefined,
    );
    assert.equal(
      decodeListLocationState("?view=calendar&cal=2028-02-29", descriptor)
        .calendarAnchor,
      "2028-02-29",
    );

    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: { ...payload.surface, supportedModes: ["table"] },
        }),
      /exactly when Calendar/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            calendar: { ...calendar, defaultView: "week" },
          },
        }),
      /renderable view/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            calendar: {
              ...calendar,
              dateFields: [{ ...calendar.dateFields[0], kind: "datetime" }],
            },
          },
        }),
      /listed datetime field/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            calendar: {
              ...calendar,
              dateFields: [{ ...calendar.dateFields[0], endNullable: false }],
            },
          },
        }),
      /endNullable requires an end field/,
    );
    const ranged = parseEntityListDescriptor({
      ...payload,
      surface: {
        ...payload.surface,
        calendar: {
          ...calendar,
          dateFields: [
            { ...calendar.dateFields[0], end: "due_on", endNullable: false },
          ],
        },
      },
    });
    assert.equal(ranged.surface.calendar?.dateFields[0]?.endNullable, false);
  });

  it("reads grouping levels from groups, keeps a legacy group as one level, and saves only groups", () => {
    const fields = [
      ...descriptorPayload.fields,
      { key: "region", label: "Region", valueKind: "enum", defaultVisible: false, defaultOrder: 4, filterOperators: ["eq", "is_null"], sortable: false, groupable: true, aggregations: [] },
      { key: "tier", label: "Tier", valueKind: "enum", defaultVisible: false, defaultOrder: 5, filterOperators: ["eq", "is_null"], sortable: false, groupable: true, aggregations: [] },
      { key: "owner", label: "Owner", valueKind: "enum", defaultVisible: false, defaultOrder: 6, filterOperators: ["eq", "is_null"], sortable: false, groupable: true, aggregations: [] },
    ];
    const descriptor = parseEntityListDescriptor({ ...descriptorPayload, fields });
    // Old to new, exactly: a legacy group= link reads as one level.
    assert.deepEqual(decodeListLocationState("?group=status", descriptor).groups, ["status"]);
    // Ordered, deduplicated, capped at 3; a field that cannot group is dropped and the rest move up.
    assert.deepEqual(decodeListLocationState("?groups=region,code,region,status,tier,owner", descriptor).groups, ["region", "status", "tier"]);
    const state = decodeListLocationState("?groups=region,status", descriptor);
    assert.equal(encodeListLocationState(state, descriptor).get("groups"), "region,status");
    const saved = toSaveableListState(state);
    assert.deepEqual(saved.groups, ["region", "status"]);
    assert.equal("group" in saved, false); // no dual write
    assert.equal(decodeListLocationState("?groups=region&group.clear=1", descriptor).groups, undefined);
  });

  it("parses a viewer's Gantt, normalizes its state and keeps the anchor out of saved state", () => {
    const fields = [
      ...descriptorPayload.fields,
      {
        key: "starts_on",
        label: "Starts on",
        valueKind: "date",
        defaultVisible: false,
        defaultOrder: 3,
        filterOperators: ["gte", "lt", "is_null"],
        sortable: true,
        groupable: false,
        aggregations: [],
      },
      {
        key: "done",
        label: "Done",
        valueKind: "decimal",
        defaultVisible: false,
        defaultOrder: 4,
        filterOperators: [],
        sortable: false,
        groupable: false,
        aggregations: [],
      },
    ];
    const gantt = {
      defaultZoom: "quarter",
      dateFields: [
        {
          start: "starts_on",
          label: "Starts on",
          kind: "date",
          unscheduled: true,
        },
      ],
      group: {
        field: "status",
        label: "Status",
        choices: [
          { value: "active", label: "Active", tone: "success" },
          { value: "retired", label: "Retired" },
        ],
      },
      progress: { field: "done", label: "Done" },
    };
    const payload = {
      ...descriptorPayload,
      fields,
      surface: {
        ...descriptorPayload.surface,
        supportedModes: ["table", "compact", "gantt"],
        gantt,
      },
    };
    const descriptor = parseEntityListDescriptor(payload);
    assert.deepEqual(
      descriptor.surface.gantt?.group?.choices.map((choice) => choice.value),
      ["active", "retired"],
    );
    assert.deepEqual(descriptor.surface.defaultState.gantt, {
      dateField: "starts_on",
      zoom: "quarter",
    });

    const shared = decodeListLocationState(
      "?view=gantt&gantt=2026-11-15&gantt.zoom=year",
      descriptor,
    );
    assert.equal(shared.mode, "gantt");
    assert.equal(shared.ganttAnchor, "2026-11-15");
    assert.deepEqual(shared.gantt, { dateField: "starts_on", zoom: "year" });
    const encoded = encodeListLocationState(shared, descriptor);
    assert.equal(encoded.get("gantt"), "2026-11-15");
    assert.equal(encoded.get("gantt.zoom"), "year");
    assert.equal("ganttAnchor" in toSaveableListState(shared), false);
    assert.deepEqual(
      decodeListLocationState(
        "?view=gantt&gantt.zoom=week&gantt.field=retired",
        descriptor,
      ).gantt,
      { dateField: "starts_on", zoom: "quarter" },
    );

    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: { ...payload.surface, supportedModes: ["table"] },
        }),
      /exactly when Gantt/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            gantt: { ...gantt, defaultZoom: "week" },
          },
        }),
      /renderable zoom/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            gantt: { ...gantt, progress: { field: "status", label: "Status" } },
          },
        }),
      /integer or decimal/,
    );
    assert.throws(
      () =>
        parseEntityListDescriptor({
          ...payload,
          surface: {
            ...payload.surface,
            gantt: { ...gantt, group: { ...gantt.group, field: "starts_on" } },
          },
        }),
      /listed enum field/,
    );
  });

  it("drops an over-long query when encoding instead of throwing, keeping the rest of the state", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const state = decodeListLocationState(
      "?sort=status:desc:last&density=compact&pageSize=100",
      descriptor,
    );
    const oversized = {
      ...state,
      query: "x".repeat(ENTITY_LIST_MAX_SEARCH_LENGTH + 1),
    };
    const encoded = encodeListLocationState(oversized, descriptor);
    assert.equal(encoded.has("q"), false);
    assert.deepEqual(
      decodeListLocationState(encoded, descriptor),
      decodeListLocationState(
        encodeListLocationState({ ...state, query: undefined }, descriptor),
        descriptor,
      ),
    );
    assert.equal(
      encodeListLocationState(
        { ...state, query: "x".repeat(ENTITY_LIST_MAX_SEARCH_LENGTH) },
        descriptor,
      ).get("q")?.length,
      ENTITY_LIST_MAX_SEARCH_LENGTH,
    );
    assert.throws(
      () => parseListLocationState(oversized, descriptor),
      /query exceeds/,
    );
  });

  it("round-trips canonical location state and excludes navigation state when saving", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const state = decodeListLocationState(
      "?q=acme&sort=status:desc:last&cols=code,status&density=compact&view=compact&vid=view-1&cursor=opaque&pageSize=100",
      descriptor,
    );
    const roundTrip = decodeListLocationState(
      encodeListLocationState(state, descriptor),
      descriptor,
    );
    assert.deepEqual(roundTrip, state);
    assert.deepEqual(toSaveableListState(state), {
      query: "acme",
      filters: [],
      sort: [{ field: "status", direction: "desc", nulls: "last" }],
      columns: ["code", "status"],
      density: "compact",
      mode: "compact",
    });
  });

  it("omits metadata defaults and page zero from canonical URLs while accepting legacy explicit state", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const defaults = decodeListLocationState(
      "?sort=name:asc&cols=code,name&density=comfortable&view=table&page=0",
      descriptor,
    );
    assert.equal(encodeListLocationState(defaults, descriptor).toString(), "");
    assert.deepEqual(defaults.sort, descriptor.surface.defaultState.sort);
    assert.deepEqual(defaults.columns, descriptor.surface.defaultState.columns);
  });

  it("round-trips persisted UTC datetime filters through local datetime controls", () => {
    const firstLocal = "2026-08-14T15:30";
    const secondLocal = "2026-08-28T18:45";
    const firstUtc = new Date(firstLocal).toISOString();
    const secondUtc = new Date(secondLocal).toISOString();

    assert.equal(
      filterInputValue(
        { field: "updated_at", operator: "gt", value: firstUtc },
        "datetime",
      ),
      firstLocal,
    );
    assert.equal(filterValueFromInput("gt", firstLocal, "datetime"), firstUtc);

    const betweenInput = filterInputValue(
      {
        field: "updated_at",
        operator: "between",
        value: [firstUtc, secondUtc],
      },
      "datetime",
    );
    assert.equal(betweenInput, `${firstLocal}, ${secondLocal}`);
    assert.deepEqual(
      filterValueFromInput("between", betweenInput, "datetime"),
      [firstUtc, secondUtc],
    );
  });

  it("keeps date-only filters independent of timezone conversion", () => {
    assert.equal(
      filterInputValue(
        {
          field: "effective_date",
          operator: "eq",
          value: "2026-08-14T00:00:00.000Z",
        },
        "date",
      ),
      "2026-08-14",
    );
  });

  it("round-trips explicit clearing of inherited query, filters, sort, group, and spreadsheet state", () => {
    const withDefaults = parseEntityListDescriptor({
      ...descriptorPayload,
      surface: {
        ...descriptorPayload.surface,
        defaultState: {
          query: "acme",
          filters: [{ field: "status", operator: "eq", value: "active" }],
          sort: [{ field: "name", direction: "asc" }],
          group: "status",
          columns: ["code", "name"],
          density: "comfortable",
          mode: "table",
          spreadsheet: { pinned: ["code"], widths: { code: 160 } },
        },
      },
    });
    const cleared = decodeListLocationState(
      "?q=&filters=none&sort=none&group.clear=1&sheet=none",
      withDefaults,
    );
    assert.equal(cleared.query, undefined);
    assert.deepEqual(cleared.filters, []);
    assert.deepEqual(cleared.sort, []);
    assert.equal(cleared.group, undefined);
    assert.equal(cleared.spreadsheet, undefined);
    assert.deepEqual(
      decodeListLocationState(
        encodeListLocationState(cleared, withDefaults),
        withDefaults,
      ),
      cleared,
    );
  });

  it("encodes saved-view overrides against their base and creates portable links without local IDs", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    const base = {
      ...descriptor.surface.defaultState,
      columns: ["code", "status"],
    };
    const state = decodeListLocationState(
      "?vid=local-view&q=acme",
      descriptor,
      { baseState: base },
    );
    const compact = encodeListLocationState(state, descriptor, {
      baseState: base,
    });
    assert.equal(compact.get("vid"), "local-view");
    assert.equal(compact.has("cols"), false);
    assert.deepEqual(
      decodeListLocationState(compact, descriptor, { baseState: base }),
      state,
    );
    const portable = encodeListLocationState(state, descriptor, {
      includeViewIds: false,
    });
    assert.equal(portable.has("vid"), false);
    assert.deepEqual(decodeListLocationState(portable, descriptor).columns, [
      "code",
      "status",
    ]);
  });

  it("bounds rich entity state to the browser and service contract limits", () => {
    const extraFields = Array.from({ length: 130 }, (_, index) => ({
      key: `field_${index}`,
      label: `Field ${index}`,
      valueKind: "string",
      defaultVisible: false,
      defaultOrder: index + 3,
      filterOperators: ["eq"],
      sortable: true,
      groupable: false,
      aggregations: [],
    }));
    const descriptor = parseEntityListDescriptor({
      ...descriptorPayload,
      fields: [...descriptorPayload.fields, ...extraFields],
    });
    const columns = ["code", ...extraFields.map((field) => field.key)];
    const filters = extraFields.map((field) => ({
      field: field.key,
      operator: "eq",
      value: field.key,
    }));
    const bounded = parseListLocationState(
      { ...descriptor.surface.defaultState, columns, filters },
      descriptor,
    );
    assert.equal(bounded.columns.length, ENTITY_LIST_MAX_VISIBLE_COLUMNS);
    assert.equal(bounded.filters.length, ENTITY_LIST_MAX_FILTERS);
    assert.deepEqual(
      decodeListLocationState(
        `?q=${"x".repeat(ENTITY_LIST_MAX_URL_LENGTH)}`,
        descriptor,
      ).columns,
      descriptor.surface.defaultState.columns,
    );
  });

  it("parses bounded list results and rejects totals reported as count mode none", () => {
    const result = parseEntityListResult({
      schemaVersion: 1,
      descriptorHash: digest,
      scopeFingerprint: "c".repeat(64),
      queryHash: "d".repeat(64),
      rows: [
        { id: "bp-1", version: 2, values: { code: "ACME", status: "active" } },
      ],
      pagination: {
        pageSize: 1,
        hasNext: false,
        hasPrevious: false,
        total: 1,
        countMode: "exact",
        requestedCountMode: "exact",
      },
    });
    assert.equal(result.rows[0]?.values.code, "ACME");
    assert.throws(
      () =>
        parseEntityListResult({
          ...result,
          pagination: { ...result.pagination, countMode: "none" },
        }),
      /total is not allowed/,
    );
  });

  it("provides deterministic Phase 1A list-state transitions", () => {
    const descriptor = parseEntityListDescriptor(descriptorPayload);
    assert.deepEqual(nextPrimarySort([], "name"), [
      { field: "name", direction: "asc" },
    ]);
    assert.deepEqual(
      nextPrimarySort([{ field: "name", direction: "asc" }], "name"),
      [{ field: "name", direction: "desc" }],
    );
    assert.deepEqual(
      nextPrimarySort([{ field: "name", direction: "desc" }], "name"),
      [],
    );
    const state = decodeListLocationState(
      "?cols=status,code&cursor=opaque&page=3",
      descriptor,
    );
    assert.deepEqual(
      visibleListFields(descriptor, state).map((field) => field.key),
      ["status", "code"],
    );
    assert.equal(withoutNavigation(state).cursor, undefined);
    assert.equal(withoutNavigation(state).pageIndex, 0);
    assert.equal(
      describeFilter(
        { field: "status", operator: "in", value: ["active", "draft"] },
        descriptor,
      ),
      "Status is any of active, draft",
    );
  });
});

it("accepts complete country catalogs and retains the 500-choice bound", () => {
  const payload = (count: number) => ({
    ...descriptorPayload,
    fields: descriptorPayload.fields.map((field, index) =>
      index === 0
        ? {
            ...field,
            filterOptions: Array.from({ length: count }, (_, i) => ({
              value: `country_${i}`,
              label: `Country ${i}`,
            })),
          }
        : field,
    ),
  });
  for (const count of [247, 500]) {
    assert.equal(
      parseEntityListDescriptor(payload(count)).fields[0]?.filterOptions
        ?.length,
      count,
    );
  }
  assert.throws(
    () => parseEntityListDescriptor(payload(501)),
    /exceeds 500 choices/,
  );
});

it("round trips exact versioned context requirements and rejects unsupported contracts", () => {
  const workContext = {
    schemaVersion: 1,
    resolver: "platform.document_relationship.v1",
    requiredCoordinates: ["operatingOrganizationId"],
  };
  const payload = {
    ...descriptorPayload,
    scope: {
      ...descriptorPayload.scope,
      status: "context_required",
      workContext,
    },
  };
  assert.deepEqual(
    parseEntityListDescriptor(payload).scope.workContext,
    workContext,
  );
  for (const invalid of [
    { ...workContext, schemaVersion: 2 },
    { ...workContext, requiredCoordinates: [] },
    { ...workContext, requiredCoordinates: ["tenantId"] },
    { ...workContext, grant: true },
  ]) {
    assert.throws(() =>
      parseEntityListDescriptor({
        ...payload,
        scope: { ...payload.scope, workContext: invalid },
      }),
    );
  }
});
