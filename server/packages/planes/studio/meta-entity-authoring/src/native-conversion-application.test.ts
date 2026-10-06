import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import {
  emptyReferenceMembers,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
  type CompiledMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { sha256 } from "./deterministic.js";
import {
  type NativeConversionApplicationPolicy,
  type NativeExpandedConversionProof,
} from "./native-conversion-application.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
/** Protocol fixture only. Schema admission, source preparation, compiler and
 * reader are synthetic; these tests do not attest a native product deployment. */
function fixture() {
  const source: MetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.3",
    entity: { entityCode: "synthetic_reference" },
    fields: [],
    operations: [],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    fieldIdentities: [],
    referenceMembers: emptyReferenceMembers(),
    ownedLabels: {
      contract: "entity.authoring-owned-labels/1",
      entityId: id(1),
      changeSetId: id(2),
      tenantId: null,
      defaultLocale: "en",
      requiredLocales: ["en"],
      labels: [],
      translations: [],
    },
  };
  const candidate: ExpandedNativeMetaEntityGraph = {
    ...source,
    contractSchema: "athyper.meta-entity-contract/2.5",
    entity: { ...source.entity, entityLabelId: id(80) },
    ownedLabels: {
      ...source.ownedLabels!,
      labels: [
        {
          id: id(80),
          labelKey: "synthetic.entity",
          defaultText: "Synthetic",
          sourceKind: "owned",
          sharedLabelKey: null,
          sharedResourceKey: null,
          sharedResourceVersion: null,
          sharedResourceHash: null,
        },
      ],
    },
    authoringSource: {
      entityId: id(1),
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    fields: [],
    operations: [],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    ai: { profile: [], field: [], binding: [], reference: [], term: [] },
  };
  const input = {
    entityId: id(1),
    changeSetId: id(2),
    tenantId: null,
    actorId: id(3),
    expectedRevision: 4,
    expectedSourceHash: sha256(source),
    idempotencyKey: "native-conversion-0001",
  };
  let root = {
    lock_version: 4,
    native_core_layout_version: null as number | null,
    reference_contract_version: 1,
    default_locale: "en",
    source_kind: "product",
    status: "draft",
    authoring_schema_hash: null as string | null,
  };
  const histories = new Map<number, { graph: unknown; graph_hash: string }>();
  let receipt: Record<string, unknown> | null = null;
  let labelWrites: unknown[][] = [];
  let snapshot: {
    root: typeof root;
    histories: typeof histories;
    receipt: Record<string, unknown> | null;
    labelWrites: typeof labelWrites;
  } | null = null;
  const query = vi.fn(async (text: string, values: unknown[]) => {
    if (text.startsWith("SAVEPOINT"))
      snapshot = {
        root: structuredClone(root),
        histories: structuredClone(histories),
        receipt: structuredClone(receipt),
        labelWrites: structuredClone(labelWrites),
      };
    if (text.startsWith("ROLLBACK TO SAVEPOINT") && snapshot) {
      root = snapshot.root;
      histories.clear();
      for (const [k, v] of snapshot.histories) histories.set(k, v);
      receipt = snapshot.receipt;
      labelWrites = snapshot.labelWrites;
    }
    if (text.startsWith('INSERT INTO "metadata"."entity_label"')) {
      if (root.lock_version !== input.expectedRevision + 1)
        throw new Error(
          "Authoring write token was not advanced before member DML",
        );
      labelWrites.push(values);
    }
    if (
      text.startsWith(
        "SELECT lock_version,authoring_schema_hash,native_core_layout_version",
      )
    )
      return { rows: [root] };
    if (text.includes("to_jsonb(cs) AS source"))
      return { rows: [{ source: root }] };
    if (text.startsWith("SELECT actor_id,idempotency_key,revision,identities"))
      return {
        rows: receipt
          ? [{ ...receipt, idempotency_key: input.idempotencyKey }]
          : [],
      };
    if (text.startsWith("SELECT request_hash"))
      return { rows: receipt ? [receipt] : [] };
    if (text.startsWith("SELECT graph,graph_hash"))
      return {
        rows: histories.has(Number(values[1]))
          ? [histories.get(Number(values[1]))]
          : [],
      };
    if (text.startsWith("INSERT INTO snapshot.entity_draft_save")) {
      if (!histories.has(Number(values[1])))
        histories.set(Number(values[1]), {
          graph: JSON.parse(String(values[3])),
          graph_hash: String(values[4]),
        });
      return { rows: [] };
    }
    if (text.includes("fn_advance_entity_change_set")) {
      root.lock_version++;
      return { rows: [{ revision: String(root.lock_version) }] };
    }
    if (text.startsWith("UPDATE metadata.entity_change_set")) {
      root.native_core_layout_version = 2;
      root.authoring_schema_hash = String(values[0]);
      return { rows: [{ id: input.changeSetId }] };
    }
    if (text.includes("to_regprocedure"))
      return { rows: [{ available: true }] };
    if (
      text.startsWith("INSERT INTO metadata.entity_authoring_command_receipt")
    ) {
      receipt = {
        request_hash: values[4],
        actor_id: values[2],
        revision: String(values[6]),
        changed: true,
        identities: JSON.parse(String(values[7])),
      };
      return { rows: [] };
    }
    return { rows: [] };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const tx = db as Transaction<Record<string, never>>;
  const artifact: CompiledMetaEntityArtifact = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    compiler: { name: "@athyper/meta-entity-compiler", version: "1" },
    contractHash: sha256(candidate),
    descriptorHash: sha256({ entity: candidate.entity, operations: [] }),
    descriptor: { entity: candidate.entity, operations: [] },
  };
  const proof = {
    schema: "entity.native-expanded-conversion-proof/1",
    source: {
      ...input,
      graphHash: input.expectedSourceHash,
      revision: input.expectedRevision,
    },
    candidate,
    targetHash: sha256(candidate),
  } as unknown as NativeExpandedConversionProof;
  const policy: NativeConversionApplicationPolicy = {
    maximumBytes: 100000,
    host: {
      commands: {
        authoringSchemaHash: "a".repeat(64),
        maxMembers: 100,
        maxCommands: 10,
        maxBatchBytes: 10000,
      },
      snapshotVersions: [2],
      admit: vi.fn(async () => {}),
      resolveContext: vi.fn(),
      resolveInitializer: vi.fn(),
    },
    qualify: vi.fn(async () => {}),
    prepare: vi.fn(async () => proof),
    compile: vi.fn(async () => artifact),
    verifyReader: vi.fn(async () => {}),
  };
  const sourceSpy = vi
    .spyOn(
      KyselyMetaEntityAuthoringRepository.prototype as unknown as {
        loadGraphParts(): Promise<MetaEntityGraph>;
      },
      "loadGraphParts",
    )
    .mockImplementation(async () => structuredClone(source) as never);
  const nativeSpy = vi
    .spyOn(
      KyselyMetaEntityAuthoringRepository.prototype as unknown as {
        nativeSnapshot(): Promise<ExpandedNativeMetaEntityGraph>;
      },
      "nativeSnapshot",
    )
    .mockImplementation(async () => structuredClone(candidate) as never);
  const repo = new KyselyMetaEntityAuthoringRepository(
    tx,
    undefined,
    undefined,
    undefined,
    policy.host,
    policy,
  );
  return {
    source,
    candidate,
    input,
    policy,
    tx,
    db,
    repo,
    histories,
    query,
    root: () => root,
    receipt: () => receipt,
    labelWrites: () => labelWrites,
    readback: (graph: ExpandedNativeMetaEntityGraph) =>
      nativeSpy.mockResolvedValueOnce(graph as never),
    close: async () => {
      sourceSpy.mockRestore();
      nativeSpy.mockRestore();
      await db.destroy();
    },
  };
}
it("captures unchanged legacy and native revisions, advances once and replays without rewriting rows", async () => {
  const f = fixture();
  try {
    const result = await f.repo.executeNativeConversion(f.input);
    expect(result.revision).toBe(5);
    expect(f.histories.get(4)!.graph).toEqual(f.source);
    expect(f.histories.get(5)!.graph).toEqual(f.candidate);
    expect(f.root().native_core_layout_version).toBe(2);
    expect(f.labelWrites()).toHaveLength(1);
    const before = f.query.mock.calls.length;
    expect(await f.repo.executeNativeConversion(f.input)).toEqual(result);
    expect(
      f.query.mock.calls
        .slice(before)
        .every(([text]) => !/^(INSERT|UPDATE|DELETE)/.test(text)),
    ).toBe(true);
    expect(f.policy.host.admit).toHaveBeenCalledTimes(2);
    expect(f.policy.qualify).toHaveBeenCalledTimes(2);
    expect(f.policy.compile).toHaveBeenCalledTimes(1);
    expect(f.policy.verifyReader).toHaveBeenCalledTimes(1);
  } finally {
    await f.close();
  }
});
it.each(["compile", "verifyReader"] as const)(
  "rolls back marker, revision and both history rows when %s fails",
  async (stage) => {
    const f = fixture();
    try {
      vi.mocked(f.policy[stage]).mockRejectedValueOnce(
        Error("qualification failed"),
      );
      await expect(f.repo.executeNativeConversion(f.input)).rejects.toThrow(
        "qualification failed",
      );
      expect(f.root().lock_version).toBe(4);
      expect(f.root().native_core_layout_version).toBe(null);
      expect(f.histories.size).toBe(0);
      expect(f.receipt()).toBe(null);
      expect(f.labelWrites()).toHaveLength(0);
      expect(
        f.query.mock.calls.some(([text]) =>
          text.startsWith("ROLLBACK TO SAVEPOINT"),
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  },
);
it("rejects stale revision, altered source, unavailable host and changed replay actor", async () => {
  const f = fixture();
  try {
    await expect(
      f.repo.executeNativeConversion({ ...f.input, expectedRevision: 3 }),
    ).rejects.toThrow("Stale");
    await expect(
      f.repo.executeNativeConversion({
        ...f.input,
        expectedSourceHash: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_SOURCE_HASH_MISMATCH" });
    await expect(
      new KyselyMetaEntityAuthoringRepository(f.tx).executeNativeConversion(
        f.input,
      ),
    ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_HOST_NOT_CONFIGURED" });
    await f.repo.executeNativeConversion(f.input);
    await expect(
      f.repo.executeNativeConversion({ ...f.input, actorId: id(99) }),
    ).rejects.toMatchObject({ code: "AUTHORING_IDEMPOTENCY_CONFLICT" });
  } finally {
    await f.close();
  }
});
it("rechecks replay authority and fails before DML when qualification is unavailable", async () => {
  const f = fixture();
  try {
    await f.repo.executeNativeConversion(f.input);
    const before = f.query.mock.calls.length;
    vi.mocked(f.policy.qualify).mockRejectedValueOnce(Error("revoked"));
    await expect(f.repo.executeNativeConversion(f.input)).rejects.toThrow(
      "revoked",
    );
    expect(
      f.query.mock.calls
        .slice(before)
        .every(([text]) => !/^(INSERT|UPDATE|DELETE)/.test(text)),
    ).toBe(true);
  } finally {
    await f.close();
  }
});

it("reads original conversion history under current history admission without DML or historical restoration", async () => {
  const f = fixture();
  try {
    await f.repo.executeNativeConversion(f.input);
    const before = f.query.mock.calls.length;
    const old = await f.repo.readNativeConversionHistory({
      entityId: f.input.entityId,
      changeSetId: f.input.changeSetId,
      tenantId: null,
      actorId: id(90),
      revision: 4,
    });
    expect(old).toEqual(f.source);
    expect(f.policy.host.admit).toHaveBeenLastCalledWith(
      f.tx,
      {
        entityId: f.input.entityId,
        changeSetId: f.input.changeSetId,
        tenantId: null,
        actorId: id(90),
        revision: 4,
        batch: null,
      },
      "history",
    );
    expect(
      f.query.mock.calls
        .slice(before)
        .every(([text]) => !/^(INSERT|UPDATE|DELETE)/.test(text)),
    ).toBe(true);
    f.histories.set(5, {
      graph: { ...f.candidate, entity: { entityCode: "changed" } },
      graph_hash: sha256(f.candidate),
    });
    await expect(
      f.repo.readNativeConversionHistory({
        entityId: f.input.entityId,
        changeSetId: f.input.changeSetId,
        tenantId: null,
        actorId: id(90),
        revision: 4,
      }),
    ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_HISTORY_INVALID" });
  } finally {
    await f.close();
  }
});

it("allows replay after later edits but rejects damaged immutable history", async () => {
  const f = fixture();
  try {
    const result = await f.repo.executeNativeConversion(f.input);
    f.root().lock_version = 9;
    expect(await f.repo.executeNativeConversion(f.input)).toEqual(result);
    f.histories.set(4, {
      graph: { ...f.source, entity: { entityCode: "changed" } },
      graph_hash: f.input.expectedSourceHash,
    });
    await expect(f.repo.executeNativeConversion(f.input)).rejects.toMatchObject(
      { code: "NATIVE_CONVERSION_REPLAY_HISTORY_INVALID" },
    );
  } finally {
    await f.close();
  }
});
it("rolls back when native readback or compilation hashes differ", async () => {
  const f = fixture();
  try {
    vi.mocked(f.policy.compile).mockResolvedValueOnce({
      schema: "athyper.entity-runtime-descriptor/1.0",
      compiler: { name: "@athyper/meta-entity-compiler", version: "1" },
      contractHash: "b".repeat(64),
      descriptorHash: sha256({}),
      descriptor: {},
    });
    await expect(f.repo.executeNativeConversion(f.input)).rejects.toMatchObject(
      { code: "NATIVE_CONVERSION_COMPILER_EVIDENCE_INVALID" },
    );
    expect(f.root().lock_version).toBe(4);
    expect(f.histories.size).toBe(0);
    f.readback({ ...f.candidate, entity: { entityCode: "altered" } });
    await expect(f.repo.executeNativeConversion(f.input)).rejects.toMatchObject(
      { code: "NATIVE_AUTHORING_PERSISTENCE_MISMATCH" },
    );
    expect(f.root().lock_version).toBe(4);
    expect(f.histories.size).toBe(0);
    expect(f.labelWrites()).toHaveLength(0);
  } finally {
    await f.close();
  }
});
it("records pinned compiler evidence even if a reader mutates its own input copy", async () => {
  const f = fixture();
  try {
    const expected = await f.policy.compile(f.tx, f.candidate, []);
    vi.mocked(f.policy.verifyReader).mockImplementationOnce(
      async (_tx, artifact) => {
        Reflect.set(artifact.descriptor, "entity", {
          entityCode: "reader-local-change",
        });
        Reflect.set(artifact, "descriptorHash", "0".repeat(64));
      },
    );
    await f.repo.executeNativeConversion(f.input);
    expect(f.receipt()!.identities).toMatchObject({
      compiledHash: sha256(expected),
      descriptorHash: expected.descriptorHash,
      compilerName: expected.compiler.name,
      compilerVersion: expected.compiler.version,
    });
    expect(f.histories.get(5)!.graph).toEqual(f.candidate);
  } finally {
    await f.close();
  }
});
