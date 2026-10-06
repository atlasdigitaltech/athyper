import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityResourcePinV1,
  EntityRuntimeDescriptor,
  EntitySecurityManifestV1,
  EntityStorageAuthorityV1,
} from "@athyper/server-contract-metadata";
import { validateEntitySecurityManifestV1 } from "@athyper/server-contract-metadata";
import {
  createRecordListExecutor,
  createRecordQueryService,
} from "./query-service.js";
import {
  entityLiveResourceHash,
  entityReadAuthorizationFingerprint,
  resolveEntityEffectiveRead,
  withEntityEffectiveRead,
  type EntityLockedReadEvidence,
} from "./entity-effective-security.js";
import { projectEffectiveReadRow } from "./entity-effective-read-projection.js";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(
  entityCode = "sample_reference",
  storageObject = "reference_object",
) {
  const context = {
    planeKey: "studio",
    tenantId: id(1),
    principalId: id(2),
    authEpoch: 1,
    requestId: "request",
    permissions: {
      planeKey: "studio",
      tenantId: id(1),
      principalId: id(2),
      principalFingerprint: "principal",
      profileHash: "profile",
      schemaHash: "schema",
    },
  } as VerifiedRequestContext;
  const source = {
    entityId: id(3),
    releaseId: id(4),
    contractHash: "a".repeat(64),
    tenantId: null,
  };
  const installed = new Map<string, unknown>();
  function install(key: string, value: unknown): EntityResourcePinV1 {
    const pin = {
      owner: "platform",
      namespace: "entity",
      key,
      version: 1,
      hash: entityLiveResourceHash(value),
    };
    installed.set(JSON.stringify(pin), value);
    return pin;
  }
  const semanticHash = "c".repeat(64);
  const pinned: EntitySecurityManifestV1 = {
    schema: "entity.effective-security-manifest/1",
    entityCode,
    source,
    plane: "studio",
    scope: { contract: "tenant.record.v1", tenantId: context.tenantId },
    operations: [
      {
        identityId: id(5),
        semanticHash,
        key: "read",
        target: "collection",
        requirement: { state: "none" },
      },
    ],
    fields: ["id", "code", "name"].map((key, index) => ({
      identityId: id(10 + index),
      semanticHash,
      key,
      readOperationId: id(5),
      representation: "plain",
      mask: null,
      queryUses: ["filter", "sort", "condition", "export"],
    })),
    unsupportedControls: [],
  };
  let active = structuredClone(pinned);
  let activePin = install("active", active);
  const authority: EntityStorageAuthorityV1 = {
    schema: "entity.storage-authority/1",
    source,
    plane: "studio",
    tenantId: context.tenantId,
    storage: {
      schema: "shared",
      object: storageObject,
      provider: install("provider", { schema: "fixture.provider/1" }),
    },
    owners: [
      {
        source,
        security: install("pinned", pinned),
        readOperationId: id(5),
        fields: pinned.fields.map((field) => ({
          fieldIdentityId: field.identityId,
          ownerFieldIdentityId: field.identityId,
        })),
      },
    ],
  };
  const descriptor: EntityRuntimeDescriptor = {
    schema: "athyper.entity-runtime-descriptor/1.1",
    entityCode,
    planeKey: "studio",
    releaseId: source.releaseId,
    releaseNo: 1,
    contractHash: source.contractHash,
    compiledHash: "b".repeat(64),
    storage: { schema: "shared", object: storageObject, idField: "id" },
    fields: ["id", "code", "name"].map((key) => ({
      key,
      type: key === "id" ? "uuid" : "string",
      storagePath: key,
      required: true,
      writableOn: [],
      sortable: key === "code",
    })),
    operations: { read: { code: "read" } },
    liveReadContract: {
      schema: "entity.live-read/1",
      source,
      security: install("pinned", pinned),
      storageAuthority: install("authority", authority),
    },
  };
  const authorize = vi.fn(
    async (
      _request: Omit<AuthorizationRequest, "permissionCode"> & {
        permissionCode?: string;
      },
    ): Promise<AuthorizationDecision> => ({ allowed: true }),
  );
  const authorizer: Authorizer = {
    authorize,
    authorizeEntityOperation: authorize,
  };
  const evidence: EntityLockedReadEvidence<null> = {
    generation: "generation-1",
    caller: {
      tenantId: context.tenantId,
      plane: context.planeKey,
      principalId: context.principalId,
      authEpoch: context.authEpoch,
      authorizationFingerprint: entityReadAuthorizationFingerprint(context),
    },
    installed: vi.fn(async (pin) => installed.get(JSON.stringify(pin)) ?? null),
    currentSecurity: vi.fn(async () => ({ pin: activePin, manifest: active })),
    securityDescriptor: vi.fn(async (manifest: EntitySecurityManifestV1) => ({
      ...descriptor,
      entityCode: manifest.entityCode,
      releaseId: manifest.source.releaseId,
      contractHash: manifest.source.contractHash,
      operations: Object.fromEntries(
        manifest.operations.map((operation) => [
          operation.key,
          {
            code: operation.key,
            ...(operation.requirement.state === "defined"
              ? { permissionCode: operation.requirement.code }
              : {}),
          },
        ]),
      ),
      liveReadContract: {
        ...descriptor.liveReadContract!,
        source: manifest.source,
      },
    })),
    providerSupported: vi.fn(async () => true),
    permissionSupported: vi.fn(async () => true),
    maskSupported: vi.fn(async () => true),
    mask: vi.fn(async () => "[masked]"),
  };
  const request = {
    context,
    descriptor,
    operationKey: "read",
    fields: [{ key: "name", use: "read" as const }],
  };
  function updateActive(
    mutator: (value: EntitySecurityManifestV1) => EntitySecurityManifestV1,
  ) {
    active = mutator(structuredClone(active));
    active = {
      ...active,
      source: {
        ...active.source,
        releaseId: id(60),
        contractHash: entityLiveResourceHash(active),
      },
    };
    activePin = install("active", active);
  }
  function updatePinned(value: EntitySecurityManifestV1) {
    const pin = install("pinned", value);
    Object.assign(descriptor.liveReadContract!, { security: pin });
    Object.assign(authority.owners[0]!, { security: pin });
    Object.assign(descriptor.liveReadContract!, {
      storageAuthority: install("authority", authority),
    });
  }
  return {
    request,
    descriptor,
    context,
    pinned,
    authority,
    installed,
    install,
    updateActive,
    updatePinned,
    evidence,
    authorizer,
    authorize,
  };
}
const resolve = (f: ReturnType<typeof fixture>) =>
  resolveEntityEffectiveRead(f.request, f.evidence, null, f.authorizer);

describe("bounded effective-security and storage authority", () => {
  it("admits valid none only through the existing operation authorizer on all four sources", async () => {
    const f = fixture();
    expect(await resolve(f)).toMatchObject({
      state: "resolved",
      generation: "generation-1",
      fields: [{ key: "name", representation: "plain" }],
    });
    expect(f.authorize).toHaveBeenCalledTimes(4);
    expect(
      f.authorize.mock.calls.every(
        (call) => Reflect.get(call[0]!, "permissionCode") === undefined,
      ),
    ).toBe(true);
  });
  it("keeps a pinned permission when current metadata removes it", async () => {
    const f = fixture();
    const catalogue = f.install("permission", {
      schema: "fixture.catalogue/1",
    });
    f.updatePinned({
      ...f.pinned,
      operations: [
        {
          ...f.pinned.operations[0]!,
          requirement: {
            state: "defined",
            plane: "studio",
            code: "fixture.read",
            kind: "operation",
            catalogue,
          },
        },
      ],
    });
    f.authorize.mockImplementation(async () => ({ allowed: false }) as never);
    expect(await resolve(f)).toMatchObject({ state: "denied" });
    expect(f.authorize.mock.calls[0]?.[0]).toMatchObject({
      permissionCode: "fixture.read",
    });
  });
  it("rejects missing catalogue evidence instead of treating it as none", async () => {
    const f = fixture();
    const catalogue = f.install("permission", {});
    f.installed.delete(JSON.stringify(catalogue));
    f.updatePinned({
      ...f.pinned,
      operations: [
        {
          ...f.pinned.operations[0]!,
          requirement: {
            state: "defined",
            plane: "studio",
            code: "fixture.read",
            kind: "operation",
            catalogue,
          },
        },
      ],
    });
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_PERMISSION_CATALOGUE_INVALID",
    });
    expect(f.authorize).not.toHaveBeenCalled();
  });
  it("intersects current field exposure and detects stable-identity semantic reuse", async () => {
    const f = fixture();
    f.updateActive((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === "name"
          ? { ...field, representation: "omitted", queryUses: [] }
          : field,
      ),
    }));
    expect(await resolve(f)).toMatchObject({
      state: "denied",
      code: "LIVE_READ_FIELD_OMITTED",
    });
    f.updateActive((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === "name"
          ? { ...field, semanticHash: "d".repeat(64), representation: "plain" }
          : field,
      ),
    }));
    expect(await resolve(f)).toMatchObject({ state: "rebind_required" });
  });
  it("applies an installed mask and rejects raw-value condition and sorting oracles", async () => {
    const f = fixture();
    const mask = f.install("mask", { schema: "fixture.mask/1" });
    f.updateActive((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === "name"
          ? { ...field, representation: "masked", mask }
          : field,
      ),
    }));
    expect(await resolve(f)).toMatchObject({
      fields: [{ representation: "masked", mask }],
    });
    for (const use of ["condition", "sort"] as const) {
      expect(
        await resolveEntityEffectiveRead(
          { ...f.request, fields: [{ key: "name", use }] },
          f.evidence,
          null,
          f.authorizer,
        ),
      ).toMatchObject({ state: "denied" });
    }
    const result = await resolve(f);
    if (result.state !== "resolved") throw Error("resolve failed");
    expect(
      await projectEffectiveReadRow(
        { name: "secret" },
        result.fields,
        (pin, value) => f.evidence.mask(pin, value, null),
        f.descriptor,
      ),
    ).toEqual({ name: "[masked]" });
  });
  it("blocks unregistered mask meets rather than choosing a weaker mask", async () => {
    const f = fixture();
    const mask = f.install("mask", {}),
      other = f.install("other-mask", {});
    f.updatePinned({
      ...f.pinned,
      fields: f.pinned.fields.map((field) =>
        field.key === "name"
          ? { ...field, representation: "masked", mask }
          : field,
      ),
    });
    f.updateActive((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === "name"
          ? { ...field, representation: "masked", mask: other }
          : field,
      ),
    }));
    expect(await resolve(f)).toMatchObject({
      state: "rebind_required",
      code: "LIVE_READ_MASK_MEET_NOT_SUPPORTED",
    });
  });
  it("blocks hash mismatches, revoked evidence, provider mismatch and stale caller generations", async () => {
    const f = fixture();
    const pin = f.descriptor.liveReadContract!.security;
    f.installed.set(JSON.stringify(pin), {
      ...f.pinned,
      unsupportedControls: ["tampered"],
    });
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_SECURITY_NOT_INSTALLED",
    });
    f.installed.set(JSON.stringify(pin), f.pinned);
    vi.mocked(f.evidence.providerSupported).mockResolvedValue(false);
    expect(await resolve(f)).toMatchObject({
      code: "STORAGE_PROVIDER_NOT_INSTALLED",
    });
    vi.mocked(f.evidence.providerSupported).mockResolvedValue(true);
    Object.assign(f.evidence.caller, { authEpoch: 2 });
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_CALLER_GENERATION_MISMATCH",
    });
  });
  it("requires exact physical allocation and contributor field lineage", async () => {
    const f = fixture();
    Object.assign(f.authority.storage, { object: "another_object" });
    Object.assign(f.descriptor.liveReadContract!, {
      storageAuthority: f.install("authority", f.authority),
    });
    expect(await resolve(f)).toMatchObject({
      code: "STORAGE_AUTHORITY_BINDING_MISMATCH",
    });
    Object.assign(f.authority.storage, { object: "reference_object" });
    Object.assign(f.authority.owners[0]!, { fields: [] });
    Object.assign(f.descriptor.liveReadContract!, {
      storageAuthority: f.install("authority", f.authority),
    });
    expect(await resolve(f)).toMatchObject({
      code: "STORAGE_FIELD_LINEAGE_UNMAPPED",
    });
  });
  it("cannot bypass a different storage owner behind an open Entity", async () => {
    const f = fixture();
    const ownerSource = {
      ...f.pinned.source,
      entityId: id(90),
      releaseId: id(91),
    };
    const owner = {
      ...f.pinned,
      entityCode: "separately_owned_reference",
      source: ownerSource,
    };
    const ownerPin = f.install("owner", owner);
    Object.assign(f.authority.owners[0]!, {
      source: ownerSource,
      security: ownerPin,
    });
    Object.assign(f.descriptor.liveReadContract!, {
      storageAuthority: f.install("authority", f.authority),
    });
    vi.mocked(f.evidence.currentSecurity).mockImplementation(
      async (entityId) =>
        entityId === ownerSource.entityId
          ? { pin: ownerPin, manifest: owner }
          : { pin: f.install("active", f.pinned), manifest: f.pinned },
    );
    f.authorize.mockImplementation(async (request: unknown) =>
      Reflect.get(Reflect.get(request as object, "resource"), "entityCode") ===
      owner.entityCode
        ? ({ allowed: false } as never)
        : { allowed: true },
    );
    expect(await resolve(f)).toMatchObject({ state: "denied" });
  });
  it("blocks unsupported controls and restricted scope without a qualified meet", async () => {
    const f = fixture();
    f.updateActive((current) => ({
      ...current,
      unsupportedControls: ["existing.control"],
    }));
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_CONTROL_NOT_SUPPORTED",
    });
    f.updateActive((current) => ({ ...current, unsupportedControls: [] }));
    f.authorize.mockResolvedValue({
      allowed: true,
      scope: { tenantWide: false, visibility: "own" },
    } as never);
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_SCOPE_MEET_NOT_SUPPORTED",
    });
  });
  it("strictly rejects unknown versions, permission variants and undeclared mask state", () => {
    const f = fixture();
    for (const value of [
      { ...f.pinned, schema: "unknown" },
      { ...f.pinned, extra: true },
      {
        ...f.pinned,
        operations: [{ ...f.pinned.operations[0], requirement: {} }],
      },
      {
        ...f.pinned,
        fields: [
          { ...f.pinned.fields[0], representation: "masked", mask: null },
        ],
      },
    ]) {
      expect(() => validateEntitySecurityManifestV1(value)).toThrow();
    }
  });
  it("canonical hashes preserve arrays and distinguish null from absence", () => {
    expect(entityLiveResourceHash({ b: 2, a: 1 })).toBe(
      entityLiveResourceHash({ a: 1, b: 2 }),
    );
    expect(entityLiveResourceHash([1, 2])).not.toBe(
      entityLiveResourceHash([2, 1]),
    );
    expect(entityLiveResourceHash({ a: null })).not.toBe(
      entityLiveResourceHash({}),
    );
    for (const invalid of [{ a: undefined }, NaN, new Date(), Array(1)])
      expect(() => entityLiveResourceHash(invalid)).toThrow();
  });
  it("keeps resolution, read and masking within the evidence lock and never reads after denial", async () => {
    const f = fixture();
    let locked = false;
    const read = vi.fn(async () => {
      expect(locked).toBe(true);
      return { name: "value" } as Readonly<Record<string, unknown>>;
    });
    const port = {
      async withLockedEvidence<R>(
        _input: unknown,
        work: (evidence: EntityLockedReadEvidence<null>) => Promise<R>,
      ) {
        locked = true;
        try {
          return await work(f.evidence);
        } finally {
          locked = false;
        }
      },
    };
    const run = () =>
      withEntityEffectiveRead({
        request: f.request,
        transaction: null,
        evidence: port,
        authorizer: f.authorizer,
        read,
        project: async (row, fields, mask) => {
          expect(locked).toBe(true);
          return projectEffectiveReadRow(row, fields, mask, f.descriptor);
        },
      });
    expect(await run()).toEqual({ name: "value" });
    expect(locked).toBe(false);
    read.mockClear();
    f.authorize.mockResolvedValue({ allowed: false } as never);
    await expect(run()).rejects.toMatchObject({ statusCode: 403 });
    expect(read).not.toHaveBeenCalled();
  });
  it("shared list and detail reject a live contract without an installed adapter before repository access", async () => {
    const f = fixture(),
      repository = { list: vi.fn(), get: vi.fn() };
    const options = {
      metadata: { getEntityDescriptor: async () => f.descriptor },
      authorizer: f.authorizer,
      repository,
      transactions: {
        run: async (
          _plane: unknown,
          _scope: unknown,
          work: (transaction: null) => Promise<unknown>,
        ) => work(null),
      },
    };
    const lists = createRecordListExecutor(
      options as unknown as Parameters<typeof createRecordListExecutor>[0],
    );
    const queries = createRecordQueryService(
      options as unknown as Parameters<typeof createRecordQueryService>[0],
    );
    await expect(
      lists.execute({
        context: f.context,
        entityCode: f.descriptor.entityCode,
        fields: ["code", "name"],
      }),
    ).rejects.toMatchObject({ code: "ENTITY_LIVE_READ_EVIDENCE_REQUIRED" });
    await expect(
      queries.get({
        context: f.context,
        entityCode: f.descriptor.entityCode,
        recordId: id(8),
      }),
    ).rejects.toMatchObject({ code: "ENTITY_LIVE_READ_EVIDENCE_REQUIRED" });
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.get).not.toHaveBeenCalled();
  });
  it("rejects an unenrolled provider field at the final projection boundary", async () => {
    const f = fixture();
    const result = await resolve(f);
    if (result.state !== "resolved") throw Error("failed");
    await expect(
      projectEffectiveReadRow(
        { name: "allowed", salary: "secret" },
        result.fields,
        async () => "masked",
        f.descriptor,
      ),
    ).rejects.toMatchObject({ code: "LIVE_READ_PROVIDER_PROJECTION_INVALID" });
  });
  it.each(["country", "state_region"])(
    "uses the same shared list/detail gate for %s source fields with synthetic evidence",
    async (entityCode) => {
      const product = JSON.parse(
        readFileSync(
          new URL(
            `../../../../../metadata/entities/common/reference/${entityCode}/definition.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const f = fixture(
        product.definition.entityCode,
        product.definition.storageObject,
      );
      expect(
        product.definition.fields
          .filter((field: { key: string }) =>
            ["id", "code", "name"].includes(field.key),
          )
          .map((field: { key: string }) => field.key),
      ).toEqual(f.descriptor.fields.map((field) => field.key));
      let locked = false;
      const row = { id: id(80), code: "REF", name: "Reference" };
      const repository = {
        list: vi.fn(async () => {
          expect(locked).toBe(true);
          return { data: [row] };
        }),
        get: vi.fn(async () => {
          expect(locked).toBe(true);
          return row;
        }),
        create: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      };
      const options = {
        metadata: { getEntityDescriptor: async () => f.descriptor },
        authorizer: f.authorizer,
        repository,
        transactions: {
          run: async (
            _plane: unknown,
            _scope: unknown,
            work: (transaction: null) => Promise<unknown>,
          ) => work(null),
        },
        liveReadEvidence: {
          async withLockedEvidence<R>(
            _input: unknown,
            work: (evidence: EntityLockedReadEvidence<null>) => Promise<R>,
          ) {
            expect(locked).toBe(false);
            locked = true;
            try {
              return await work(f.evidence);
            } finally {
              locked = false;
            }
          },
        },
      };
      const list = createRecordListExecutor(
        options as unknown as Parameters<typeof createRecordListExecutor>[0],
      );
      const query = createRecordQueryService(
        options as unknown as Parameters<typeof createRecordQueryService>[0],
      );
      expect(
        (
          await list.execute({
            context: f.context,
            entityCode,
            fields: ["code", "name"],
          })
        ).result.data,
      ).toEqual([row]);
      expect(
        (await query.get({ context: f.context, entityCode, recordId: row.id }))
          .data,
      ).toEqual(row);
      expect(locked).toBe(false);
      Object.assign(f.evidence.caller, { authorizationFingerprint: "revoked" });
      repository.list.mockClear();
      repository.get.mockClear();
      await expect(
        list.execute({ context: f.context, entityCode }),
      ).rejects.toMatchObject({ code: "LIVE_READ_CALLER_GENERATION_MISMATCH" });
      await expect(
        query.get({ context: f.context, entityCode, recordId: row.id }),
      ).rejects.toMatchObject({ code: "LIVE_READ_CALLER_GENERATION_MISMATCH" });
      expect(repository.list).not.toHaveBeenCalled();
      expect(repository.get).not.toHaveBeenCalled();
    },
  );
  it("requires an independently qualified descriptor for complete security coverage", async () => {
    const f = fixture();
    vi.mocked(f.evidence.securityDescriptor).mockResolvedValue(null);
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_SECURITY_COVERAGE_NOT_QUALIFIED",
    });
    expect(f.authorize).not.toHaveBeenCalled();
  });
  it("cannot claim none or omit source controls in a signed-looking manifest", async () => {
    const f = fixture();
    vi.mocked(f.evidence.securityDescriptor).mockResolvedValue({
      ...f.descriptor,
      operations: { read: { code: "read", permissionCode: "source.read" } },
    });
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_PERMISSION_SOURCE_MISMATCH",
    });
    vi.mocked(f.evidence.securityDescriptor).mockResolvedValue({
      ...f.descriptor,
      recordPredicates: [
        { field: "code", operator: "eq", value: "restricted" },
      ],
    } as never);
    expect(await resolve(f)).toMatchObject({
      code: "LIVE_READ_CONTROL_NOT_SUPPORTED",
    });
    expect(f.authorize).not.toHaveBeenCalled();
  });
  it("enforces additional field permissions from the contributing source", async () => {
    const f = fixture();
    vi.mocked(f.evidence.securityDescriptor).mockResolvedValue({
      ...f.descriptor,
      fields: f.descriptor.fields.map((field) =>
        field.key === "name"
          ? { ...field, readPermissionCode: "field.read" }
          : field,
      ),
    });
    f.authorize.mockImplementation(async (request) =>
      request.permissionCode === "field.read"
        ? { allowed: false, reason: "denied" }
        : { allowed: true },
    );
    expect(await resolve(f)).toMatchObject({
      state: "denied",
      code: "LIVE_READ_FIELD_PERMISSION_DENIED",
    });
    expect(f.authorize.mock.calls[0]?.[0]).toMatchObject({
      permissionCode: "field.read",
      resource: { entityFieldPermission: "read", field: "name" },
    });
  });
});
