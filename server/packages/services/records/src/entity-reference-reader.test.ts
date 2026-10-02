import { describe, expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createEntityReferenceReader } from "./entity-reference-reader.js";
import { RecordServiceError } from "./errors.js";

function fixture(composite = false) {
  const context = { tenantId: "tenant-a", planeKey: "neon" } as never;
  const source = {
    entityCode: "subdivision",
    planeKey: "neon",
    fields: [
      { key: "nation", type: "string", readPermissionCode: "nation.read" },
      {
        key: "parent",
        type: "string",
        readPermissionCode: "parent.read",
        keyReference: {
          targetEntity: "region",
          labelField: "name",
          fields: [
            ...(composite ? [{ source: "nation", target: "nation" }] : []),
            { source: "parent", target: "code" },
          ],
        },
      },
    ],
    operations: { read: { permissionCode: "source.read" } },
  } as unknown as EntityRuntimeDescriptor;
  const target = {
    entityCode: "region",
    planeKey: "neon",
    storage: { idField: "id" },
    fields: ["nation", "code", "name"].map((key) => ({
      key,
      type: "string",
      readPermissionCode: `target.${key}`,
    })),
    operations: { read: { permissionCode: "target.read" }, list: {} },
  } as unknown as EntityRuntimeDescriptor;
  const row = {
    id: "01a0d433-807a-7020-a7ba-94d0c0263c2a",
    nation: "XY",
    code: "01",
    name: "Northern region",
  };
  const authorize = vi.fn(async (_input: { permissionCode: string }) => ({
    allowed: true,
  }));
  const execute = vi.fn(async (_input: unknown) => ({
    result: { data: [row], pagination: {} },
  }));
  const get = vi.fn(async (_input: unknown) => ({ data: row }));
  const metadata = { getEntityDescriptor: vi.fn(async () => target) };
  const reader = createEntityReferenceReader({
    metadata,
    authorizer: { authorize },
    listExecutor: { execute },
    queries: { get },
  } as never);
  return { context, source, target, row, authorize, execute, get, reader };
}

describe("published key reference reads", () => {
  it("hydrates authorized record coordinates alongside the label", async () => {
    const f = fixture();
    await expect(f.reader.presentation(f.context, f.source, {parent:"01"})).resolves.toEqual({
      displayValues:{parent:"Northern region"},
      references:{parent:{entityCode:"region",recordId:f.row.id,value:"01",label:"Northern region"}},
    });
  });
  it.each(["source", "target", "record"])("never emits preview coordinates when %s access is denied or masked", async side => {
    const f = fixture();
    if(side === "source") Object.assign(f.source,{policyBindings:[{stage:"masking",fieldKey:"parent"}]});
    if(side === "target") Object.assign(f.target,{policyBindings:[{stage:"masking",fieldKey:"name"}]});
    if(side === "record") f.get.mockRejectedValue(new RecordServiceError(403,"FORBIDDEN","Denied"));
    await expect(f.reader.presentation(f.context,f.source,{parent:"01"})).resolves.toEqual({displayValues:{},references:{}});
  });
  it("resolves a code through the authorized list and record owners", async () => {
    const f = fixture();
    await expect(
      f.reader.lookup(f.context, f.source, { field: "parent", value: "01" }),
    ).resolves.toEqual({
      options: [
        {
          value: "01",
          label: "Northern region",
          entityCode: "region",
          recordId: f.row.id,
        },
      ],
    });
    expect(f.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: f.context,
        entityCode: "region",
        filters: [{ field: "code", operator: "eq", value: "01" }],
        limit: 2,
      }),
    );
    expect(f.get).toHaveBeenCalledWith({
      context: f.context,
      entityCode: "region",
      recordId: f.row.id,
    });
  });
  it("requires every composite dependency and binds it to the target query", async () => {
    const f = fixture(true);
    await expect(
      f.reader.lookup(f.context, f.source, { field: "parent" }),
    ).rejects.toMatchObject({ code: "ENTITY_REFERENCE_CONTEXT_REQUIRED" });
    expect(f.execute).not.toHaveBeenCalled();
    await f.reader.lookup(f.context, f.source, {
      field: "parent",
      dependencies: { nation: "XY" },
      query: "North",
      cursor: "page-2",
    });
    expect(f.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: "nation", operator: "eq", value: "XY" }],
        search: "North",
        cursor: "page-2",
        limit: 25,
      }),
    );
  });
  it("never exposes a label outside the full composite key", async () => {
    const f = fixture(true);
    await expect(
      f.reader.lookup(f.context, f.source, {
        field: "parent",
        dependencies: { nation: "ZZ" },
      }),
    ).resolves.toEqual({ options: [] });
  });
  it("rejects caller dependency overrides when anchored to an authorized record", async () => {
    const f = fixture(true);
    await expect(
      f.reader.lookup(f.context, f.source, {
        field: "parent",
        recordId: f.row.id,
        dependencies: { nation: "ZZ" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["source.read", "parent.read", "target.read", "target.name"])(
    "enforces %s without leaking choices",
    async (permission) => {
      const f = fixture();
      f.authorize.mockImplementation(async (input) => ({
        allowed: input.permissionCode !== permission,
      }));
      await expect(
        f.reader.lookup(f.context, f.source, { field: "parent" }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it("suppresses record-level denials even when the collection admits a row", async () => {
    const f = fixture();
    f.get.mockRejectedValue(new RecordServiceError(403, "FORBIDDEN", "Denied"));
    await expect(
      f.reader.lookup(f.context, f.source, { field: "parent" }),
    ).resolves.toEqual({ options: [] });
  });
  it("rechecks permissions on subsequent requests", async () => {
    const f = fixture();
    await f.reader.lookup(f.context, f.source, { field: "parent" });
    f.authorize.mockResolvedValue({ allowed: false });
    await expect(
      f.reader.lookup(f.context, f.source, { field: "parent" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it("never hydrates masked labels", async () => {
    const f = fixture();
    Object.assign(f.target, {
      policyBindings: [{ stage: "masking", fieldKey: "name" }],
    });
    await expect(
      f.reader.labels(f.context, f.source, { parent: "01" }),
    ).resolves.toEqual({});
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects ambiguous exact identities", async () => {
    const f = fixture();
    f.execute.mockResolvedValue({
      result: { data: [f.row, { ...f.row, id: "other" }], pagination: {} },
    });
    await expect(
      f.reader.lookup(f.context, f.source, { field: "parent", value: "01" }),
    ).rejects.toMatchObject({ code: "ENTITY_REFERENCE_AMBIGUOUS" });
    expect(f.get).not.toHaveBeenCalled();
  });
});
