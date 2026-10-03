import { expect, it, vi } from "vitest";
import { createGovernedAmendmentTargetResolver } from "./governed-amendment-target.js";

function fixture(root = "party", child = "account") {
  const context: any = {
    tenantId: "tenant",
    principalId: "actor",
    planeKey: "neon",
  };
  const owner: any = {
    entityCode: root,
    planeKey: "neon",
    releaseId: "release",
    compiledHash: "owner-hash",
    storage: {
      idField: "id",
      tenantField: "tenant_id",
      versionField: "version",
    },
    recordPresentation: {
      entityRelationships: [
        {
          key: "members",
          targetEntity: child,
          fields: [{ source: "id", target: "owner_id" }],
          tenant: { source: "tenant_id", target: "tenant_id" },
        },
      ],
    },
  };
  const target: any = {
    entityCode: child,
    planeKey: "neon",
    releaseId: "release",
    compiledHash: "child-hash",
    storage: { idField: "id", tenantField: "tenant_id" },
    fields: [{ key: "owner_id", type: "uuid", writableOn: [] }],
    directoryScope: {
      parent: { entityCode: root, relationshipKey: "members" },
    },
  };
  const records: any = {
    [root]: { id: "stored-owner", tenant_id: "tenant", version: 7 },
    [child]: {
      id: "child-record",
      tenant_id: "tenant",
      owner_id: "stored-owner",
    },
  };
  const get = vi.fn(async () => records[child]);
  const read = vi.fn(async (q: any) => ({
    descriptor: q.entityCode === root ? owner : target,
    data: records[q.entityCode],
    readableFields: [],
  }));
  const metadata = {
    getEntityDescriptor: vi.fn(async (_c: any, code: string) =>
      code === root ? owner : target,
    ),
  };
  const resolve = createGovernedAmendmentTargetResolver({
    metadata,
    repository: { get },
    reads: { getWithProjection: read },
  });
  const input = {
    context,
    entityCode: child,
    recordId: "child-record",
    owner: "required_parent" as const,
  };
  return {
    context,
    owner,
    target,
    records,
    get,
    read,
    metadata,
    resolve,
    input,
  };
}
it.each([
  ["party", "account"],
  ["shipment", "line"],
])(
  "resolves a stored %s parent for %s and carries the child target",
  async (root, child) => {
    const f = fixture(root, child),
      transaction = {};
    const scopeCoordinate = {
      companyCodeIds: ["company"],
      operatingOrganizationIds: ["organization"],
    };
    f.records[root].version = "7";
    expect(await f.resolve({ ...f.input, scopeCoordinate }, transaction)).toEqual({
      ownerEntityCode: root,
      ownerRecordId: "stored-owner",
      ownerRecordVersion: 7,
      ownerReleaseId: "release",
      ownerDescriptorHash: "owner-hash",
      amendmentTarget: {
        entityCode: child,
        recordId: "child-record",
        releaseId: "release",
        descriptorHash: "child-hash",
      },
    });
    expect(f.get).toHaveBeenCalledWith(
      f.target,
      "tenant",
      "child-record",
      ["id", "tenant_id", "owner_id"],
      transaction,
    );
    expect(f.read).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scopeCoordinate: {
          ...scopeCoordinate,
          parentEntityCode: root,
          parentRecordId: "stored-owner",
          relationshipKey: "members",
          parentDescriptorHash: "owner-hash",
        },
      }),
    );
    expect(f.read).toHaveBeenNthCalledWith(1, {
      context: f.context,
      entityCode: root,
      recordId: "stored-owner",
      scopeCoordinate,
    });
  },
);
it("rejects client parents and cannot choose self to bypass required parent scope", async () => {
  const f = fixture();
  await expect(
    f.resolve(
      { ...f.input, scopeCoordinate: { parentRecordId: "forged" } },
      {},
    ),
  ).rejects.toThrow("TARGET_UNAVAILABLE");
  await expect(f.resolve({ ...f.input, owner: "self" }, {})).rejects.toThrow(
    "TARGET_UNAVAILABLE",
  );
  expect(f.get).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});
it("fails closed for denied parents/children, cross-tenant records, stale metadata and reparenting", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.records.party = null;
    },
    (f: ReturnType<typeof fixture>) => {
      f.get.mockResolvedValueOnce({ ...f.records.account, tenant_id: "other" });
    },
    (f: ReturnType<typeof fixture>) => {
      f.read.mockResolvedValueOnce({
        descriptor: { ...f.owner, compiledHash: "changed" },
        data: f.records.party,
        readableFields: [],
      });
    },
    (f: ReturnType<typeof fixture>) => {
      f.read
        .mockImplementationOnce(async () => ({
          descriptor: f.owner,
          data: f.records.party,
          readableFields: [],
        }))
        .mockImplementationOnce(async () => ({
          descriptor: f.target,
          data: { ...f.records.account, owner_id: "another" },
          readableFields: [],
        }));
    },
    (f: ReturnType<typeof fixture>) => {
      f.read
        .mockImplementationOnce(async () => ({
          descriptor: f.owner,
          data: f.records.party,
          readableFields: [],
        }))
        .mockImplementationOnce(async () => ({
          descriptor: f.target,
          data: null,
          readableFields: [],
        }));
    },
  ]) {
    const f = fixture();
    change(f);
    await expect(f.resolve(f.input, {})).rejects.toThrow("TARGET_UNAVAILABLE");
  }
});
it("supports explicitly authored self ownership without inventing a parent", async () => {
  const f = fixture();
  expect(
    await f.resolve(
      {
        ...f.input,
        entityCode: "party",
        recordId: "stored-owner",
        owner: "self",
      },
      {},
    ),
  ).toMatchObject({ ownerEntityCode: "party", ownerRecordVersion: 7 });
  expect(f.get).not.toHaveBeenCalled();
  expect(f.read).toHaveBeenCalledTimes(1);
});
