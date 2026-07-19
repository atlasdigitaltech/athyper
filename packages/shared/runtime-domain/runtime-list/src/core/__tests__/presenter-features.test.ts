import { describe, expect, it, vi } from "vitest";
import type { RuntimeListServerAdapter } from "../../adapter/types";
import type { RuntimeDescriptor } from "../types";
import { resolvePresenterProps } from "../presenter-props";

function descriptor(overrides: Partial<RuntimeDescriptor> = {}): RuntimeDescriptor {
  return {
    entityCode: "invoice",
    entityName: "Invoice",
    routeSlug: "invoice",
    source: { tableSchema: "document", tableName: "invoice" },
    capabilities: { canCreate: true },
    fields: [
      {
        name: "code",
        columnName: "code",
        label: "Code",
        dataType: "text",
        isVisible: true,
        isSearchable: true,
        isFilterable: true,
        isSortable: true,
        order: 1,
      },
      {
        name: "status",
        columnName: "status",
        label: "Status",
        dataType: "text",
        isVisible: true,
        isFilterable: true,
        isSortable: true,
        order: 2,
      },
    ],
    operations: [],
    ...overrides,
  };
}

function adapter(runtimeDescriptor: RuntimeDescriptor): RuntimeListServerAdapter {
  return {
    plane: "neon",
    features: {
      viewModes: ["list", "excel"],
      multiSort: true,
      maxSortLevels: 3,
      maxPageSize: 200,
      searchMode: "both",
    },
    fetchDescriptor: vi.fn(async () => runtimeDescriptor),
    fetchRecords: vi.fn(async () => ({
      records: [{ id: "1", code: "INV-1", status: "draft" }],
      pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
      isFullyLoaded: true,
    })),
    entityListHref: (entityCode) => `/app/${entityCode}`,
    entityDetailHref: (entityCode, recordId) => `/app/${entityCode}/${recordId}`,
    entityNewHref: (entityCode) => `/app/${entityCode}/new`,
    entityRecordsApiHref: (entityCode) => `/api/runtime/${entityCode}`,
  };
}

describe("runtime list presenter feature enforcement", () => {
  it("removes the create action when descriptor authorization cannot create", async () => {
    const props = await resolvePresenterProps(
      adapter(descriptor({ capabilities: { canCreate: false } })),
      "invoice",
      {},
    );

    expect(props.createHref).toBeNull();
    expect(props.clientAdapter.newHref).toBeNull();
    expect(props.featureDiagnostics.sources.maxPageSize).toBe("adapterDefault");
  });

  it("clamps page size and sort entries to the resolved entity policy", async () => {
    const runtimeAdapter = adapter(descriptor({
      listPresentation: {
        features: {
          multiSort: false,
          maxSortLevels: 5,
          maxPageSize: 40,
        },
      },
    }));

    const props = await resolvePresenterProps(runtimeAdapter, "invoice", {
      page_size: "200",
      sort: ["code:asc", "status:desc"],
    });

    expect(props.pageSize).toBe(40);
    expect(props.featureDiagnostics.sources.maxPageSize).toBe("descriptor");
    expect(props.activeSort).toEqual([{ key: "code", dir: "asc" }]);
    expect(runtimeAdapter.fetchRecords).toHaveBeenCalledWith(
      "invoice",
      expect.objectContaining({ page_size: "40", sort: "code:asc", query_v1: "0" }),
      expect.anything(),
      expect.anything(),
      { visibleFieldNames: ["code", "status"] },
    );
  });

  it("starts records while non-query search configuration is still resolving", async () => {
    let resolveSearchControls: ((value: null) => void) | undefined;
    const searchControls = new Promise<null>((resolve) => {
      resolveSearchControls = resolve;
    });
    const runtimeAdapter = adapter(descriptor());
    runtimeAdapter.resolveAccessScope = vi.fn(async () => ({
      plane: "neon" as const,
      mode: "tenant" as const,
      status: "ready" as const,
      source: "resolved" as const,
      protectedFields: [],
      labels: [],
    }));
    runtimeAdapter.resolveSearchControls = vi.fn(async () => searchControls);
    runtimeAdapter.resolveLazyListControls = vi.fn(async () => null);

    const pending = resolvePresenterProps(runtimeAdapter, "invoice", {});

    await vi.waitFor(() => {
      expect(runtimeAdapter.fetchRecords).toHaveBeenCalledTimes(1);
    });
    resolveSearchControls?.(null);
    await pending;
  });

  it("keeps client-only search from exposing a server records endpoint", async () => {
    const props = await resolvePresenterProps(
      adapter(descriptor({
        listPresentation: { features: { searchMode: "client" } },
      })),
      "invoice",
      {},
    );

    expect(props.features.searchMode).toBe("client");
    expect(props.clientAdapter.recordsApiHref).toBeNull();
    expect(props.search.enabled).toBe(true);
  });
});
