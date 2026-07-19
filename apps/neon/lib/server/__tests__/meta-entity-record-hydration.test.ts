import { afterEach, describe, expect, it, vi } from "vitest";
import type { V4Session } from "@athyper/auth-bff";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { hydrateMetaEntityRecordRows } from "../meta-entity-records";

const session = {
  userId: "principal-1",
  planeKey: "neon",
  realmKey: "athyper",
  activeOrg: undefined,
  organizations: {},
} as unknown as V4Session;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("meta-entity record display hydration", () => {
  it("does not refetch a reference label already enriched by the Records service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const descriptor = runtimeDescriptor([
      referenceField("company_code_id", "company_code"),
    ]);

    const [record] = await hydrateMetaEntityRecordRows([
      {
        id: "row-1",
        company_code_id: "cc-1",
        company_code_id_label: "Athyper Group Holdings",
        data: {
          company_code_id: "cc-1",
          company_code_id_label: "Athyper Group Holdings",
        },
      },
    ], descriptor, session, {});

    expect(record?.data).toMatchObject({
      company_code_id_label: "Athyper Group Holdings",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts reference and lookup hydration concurrently and merges both patches", async () => {
    const pending = new Map<string, (response: Response) => void>();
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      new Promise<Response>((resolve) => {
        pending.set(String(input), resolve);
      }));
    vi.stubGlobal("fetch", fetchMock);
    const descriptor = runtimeDescriptor([
      referenceField("company_code_id", "company_code"),
      lookupField("status", "document.journal_status"),
    ]);

    const resultPromise = hydrateMetaEntityRecordRows([
      {
        id: "row-1",
        company_code_id: "cc-1",
        status: "posted",
        data: { company_code_id: "cc-1", status: "posted" },
      },
    ], descriptor, session, {});

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const referenceRequest = [...pending.entries()].find(([url]) => url.includes("/api/records/company_code"));
    const lookupRequest = [...pending.entries()].find(([url]) => url.includes("/api/metadata/lookups/"));
    expect(referenceRequest).toBeDefined();
    expect(lookupRequest).toBeDefined();

    referenceRequest?.[1](jsonResponse({
      data: [{ id: "cc-1", name: "Athyper Group Holdings", code: "ATHQ" }],
      pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 },
    }));
    lookupRequest?.[1](jsonResponse({
      values: [{ code: "posted", name: "Posted" }],
    }));

    const [record] = await resultPromise;
    expect(record?.data).toMatchObject({
      company_code_id_label: "Athyper Group Holdings",
      company_code_id_code: "ATHQ",
      status_label: "Posted",
    });
  });

  it("hydrates only fields in the active visible-column projection", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      values: [{ code: "posted", name: "Posted" }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const descriptor = runtimeDescriptor([
      lookupField("status", "document.journal_status"),
      lookupField("posting_type", "document.posting_type"),
    ]);

    await hydrateMetaEntityRecordRows([
      {
        id: "row-1",
        status: "posted",
        posting_type: "opening_balance",
        data: { status: "posted", posting_type: "opening_balance" },
      },
    ], descriptor, session, {}, { visibleFieldNames: ["status"] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("document.journal_status");
  });
});

function runtimeDescriptor(fields: unknown[]): MetaEntityRuntimeDescriptor {
  return {
    entityCode: "journal_entry",
    fields,
  } as unknown as MetaEntityRuntimeDescriptor;
}

function referenceField(name: string, entity: string) {
  return {
    name,
    columnName: name,
    dataType: "uuid",
    optionSource: {
      kind: "reference",
      entity,
      valueField: "id",
      labelField: "name",
      codeField: "code",
      scopeMode: "tenant",
    },
  };
}

function lookupField(name: string, domainCode: string) {
  return {
    name,
    columnName: name,
    dataType: "enum",
    optionSource: {
      kind: "lookup",
      domainCode,
      valueField: "code",
      labelField: "name",
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
