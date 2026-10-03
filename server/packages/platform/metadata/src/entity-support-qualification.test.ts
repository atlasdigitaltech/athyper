import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import type {
  EntityRuntimeDescriptor,
  EntityDeploymentSupportPointer,
} from "@athyper/server-contract-metadata";
import {
  createEntitySupportQualificationWriter,
  entityQualificationProbeEvidenceKey,
} from "./entity-support-qualification.js";
import { ImmutableEntitySupportReceiptStore } from "./entity-deployment-support.js";

function fixture() {
  const tool = {
    id: "entity_read_record",
    version: "1",
    manifestHash: "b".repeat(64),
    inputSchemaHash: "c".repeat(64),
    resultSchemaHash: "d".repeat(64),
    required: false,
  };
  const descriptor = {
    entityCode: "example",
    planeKey: "neon",
    compiledHash: "a".repeat(64),
    aiManifestBindings: {
      schema: "entity-ai-manifest-bindings/1",
      plane: "neon",
      tools: [tool],
    },
  } as unknown as EntityRuntimeDescriptor;
  const binding = {
    valid: true,
    unavailableManifests: [] as string[],
    target: {
      deploymentId: "api-1",
      configurationRevision: "config-1",
      plane: "neon" as const,
      releaseArtifactHash: descriptor.compiledHash,
    },
    adapterVersions: {
      "entity-host": "build-1",
      entity_read_record: "installed-tool-1",
    },
  };
  const objects = new Map<string, Uint8Array>();
  const probeEvidence = new Map<string, Uint8Array>();
  const success = (passed = true) =>
    ["owner-read", "scope-denial"].map((caseName) => {
      const { required: _required, ...capability } = tool;
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          schema: "entity-capability-probe-evidence/1",
          target: binding.target,
          adapterVersions: binding.adapterVersions,
          capability,
          case: caseName,
          passed,
          executionId: "executed-owner-case-" + caseName,
          actor: "qualification-workload-1",
          startedAtMs: 100,
          finishedAtMs: 100,
        }),
      );
      const evidenceHash = createHash("sha256").update(bytes).digest("hex");
      probeEvidence.set(
        entityQualificationProbeEvidenceKey(evidenceHash),
        bytes,
      );
      return { case: caseName, passed, evidenceHash };
    });
  let pointer: EntityDeploymentSupportPointer | null = null;
  const storage = {
    get: vi.fn(async (key: string) => {
      const bytes = objects.get(key) ?? probeEvidence.get(key);
      if (!bytes) throw Error("missing");
      return bytes.slice();
    }),
    putIfAbsent: vi.fn(async (key: string, bytes: Uint8Array | string) => {
      if (objects.has(key)) return false;
      objects.set(
        key,
        typeof bytes === "string"
          ? new TextEncoder().encode(bytes)
          : bytes.slice(),
      );
      return true;
    }),
  };
  const authority = {
    authorize: vi.fn(async () => true),
    actor: () => "qualification-workload-1",
    current: vi.fn(async () => pointer),
    compareAndSwap: vi.fn(
      async ({
        expected,
        next,
      }: {
        expected: EntityDeploymentSupportPointer | null;
        next: EntityDeploymentSupportPointer;
      }) => {
        if (JSON.stringify(expected) !== JSON.stringify(pointer)) return false;
        pointer = next;
        return true;
      },
    ),
  };
  const probe = {
    cases: ["owner-read", "scope-denial"],
    execute: vi.fn(async () => success()),
  };
  let clock = 100;
  const options = {
    storage,
    authority,
    readDescriptor: vi.fn(async () => descriptor),
    describe: () => binding,
    probe: () => probe,
    validityMs: 1_000,
    now: () => clock,
  };
  const input = {
    subject: "authenticated-workload",
    entityCode: "example",
    signal: new AbortController().signal,
  };
  return {
    options,
    input,
    probe,
    binding,
    descriptor,
    authority,
    objects,
    probeEvidence,
    success,
    storage,
    setClock: (value: number) => {
      clock = value;
    },
    changePointer: (value: EntityDeploymentSupportPointer) => {
      pointer = value;
    },
    pointer: () => pointer,
    writer: () => createEntitySupportQualificationWriter(options),
  };
}

it("authorizes custody before probes or storage and rejects unidentified/incompatible installations", async () => {
  const denied = fixture();
  denied.authority.authorize.mockResolvedValue(false);
  await expect(denied.writer().qualify(denied.input)).rejects.toThrow(
    "ENTITY_QUALIFICATION_DENIED",
  );
  expect(denied.objects.size).toBe(0);
  expect(denied.probe.execute).not.toHaveBeenCalled();
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.binding.valid = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.binding.unavailableManifests.push("entity_read_record");
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(f.writer().qualify(f.input)).rejects.toThrow(
      "ENTITY_QUALIFICATION_BINDING_INVALID",
    );
    expect(f.objects.size).toBe(0);
    expect(f.probe.execute).not.toHaveBeenCalled();
  }
});

it("retains executed evidence and hash-bound receipt before publishing support", async () => {
  const f = fixture();
  const result = await f.writer().qualify(f.input);
  expect(result).toMatchObject({ passed: true, published: true });
  expect(f.pointer()?.supportRevision).toBe(result.evidenceHash);
  const receipt = await new ImmutableEntitySupportReceiptStore(f.storage).get(
    result.receiptHash,
  );
  expect(receipt).toMatchObject({
    qualifiedAtMs: 100,
    expiresAtMs: 1_100,
    supportRevision: result.evidenceHash,
    results: [{ passed: true }],
  });
  expect(f.objects.size).toBe(5);
  expect(
    [...f.objects.keys()].some((key) => key.endsWith("/started.json")),
  ).toBe(true);
  expect(
    [...f.objects.keys()].some((key) => key.endsWith("/result.json")),
  ).toBe(true);
  expect(
    [...f.objects.keys()].some((key) => key.endsWith("/publication.json")),
  ).toBe(true);
});

it.each([
  "failure",
  "omitted",
  "duplicate",
  "unhashed",
  "exception",
  "unregistered",
])("retains %s without admitting the capability", async (kind) => {
  const f = fixture();
  if (kind === "failure") f.probe.execute.mockResolvedValue(f.success(false));
  if (kind === "omitted")
    f.probe.execute.mockResolvedValue([
      { case: "owner-read", passed: true, evidenceHash: "e".repeat(64) },
    ]);
  if (kind === "duplicate")
    f.probe.execute.mockResolvedValue([
      { case: "owner-read", passed: true, evidenceHash: "e".repeat(64) },
      { case: "owner-read", passed: true, evidenceHash: "f".repeat(64) },
    ]);
  if (kind === "unhashed")
    f.probe.execute.mockResolvedValue([
      { case: "owner-read", passed: true, evidenceHash: "declaration" },
      { case: "scope-denial", passed: true, evidenceHash: "f".repeat(64) },
    ]);
  if (kind === "exception")
    f.probe.execute.mockRejectedValue(
      Error("private credentials must never be retained"),
    );
  if (kind === "unregistered") f.probe.cases.splice(0);
  const result = await f.writer().qualify(f.input);
  expect(result).toMatchObject({ passed: false, published: false });
  expect(f.authority.compareAndSwap).not.toHaveBeenCalled();
  expect(
    (
      await new ImmutableEntitySupportReceiptStore(f.storage).get(
        result.receiptHash,
      )
    ).results[0]?.passed,
  ).toBe(false);
  expect(
    [...f.objects.values()]
      .map((bytes) => new TextDecoder().decode(bytes))
      .join("\n"),
  ).not.toContain("private credentials");
});

it.each(["missing", "changed", "wrong-target", "wrong-actor", "old-attempt"])(
  "rejects %s retained probe evidence",
  async (kind) => {
    const f = fixture();
    f.probe.execute.mockImplementation(async () => {
      const rows = f.success(),
        row = rows[0]!;
      const key = entityQualificationProbeEvidenceKey(row.evidenceHash);
      if (kind === "missing") f.probeEvidence.delete(key);
      else if (kind === "changed")
        f.probeEvidence.set(key, new TextEncoder().encode("changed bytes"));
      else {
        const proof = JSON.parse(
          new TextDecoder().decode(f.probeEvidence.get(key)!),
        );
        if (kind === "wrong-target") proof.target.deploymentId = "other-api";
        if (kind === "wrong-actor") proof.actor = "other-workload";
        if (kind === "old-attempt") proof.startedAtMs = 99;
        const bytes = new TextEncoder().encode(JSON.stringify(proof));
        row.evidenceHash = createHash("sha256").update(bytes).digest("hex");
        f.probeEvidence.set(
          entityQualificationProbeEvidenceKey(row.evidenceHash),
          bytes,
        );
      }
      return rows;
    });
    expect(await f.writer().qualify(f.input)).toMatchObject({
      passed: false,
      published: false,
    });
    expect(f.authority.compareAndSwap).not.toHaveBeenCalled();
  },
);

it("retains a failed pointer update without leaking authority errors", async () => {
  const f = fixture();
  f.authority.compareAndSwap.mockRejectedValue(
    Error("private authority credential"),
  );
  const result = await f.writer().qualify(f.input);
  expect(result).toMatchObject({ passed: true, published: false });
  const publication = [...f.objects.entries()].find(([key]) =>
    key.endsWith("/publication.json"),
  )![1];
  expect(JSON.parse(new TextDecoder().decode(publication))).toMatchObject({
    published: false,
    error: "authority_update_failed",
  });
  expect(new TextDecoder().decode(publication)).not.toContain("credential");
});

it.each([
  "descriptor",
  "configuration",
  "adapter",
  "revocation",
  "interruption",
])("invalidates %s changes during qualification", async (kind) => {
  const f = fixture(),
    controller = new AbortController();
  f.probe.execute.mockImplementation(async () => {
    if (kind === "descriptor")
      Object.assign(f.descriptor, { compiledHash: "9".repeat(64) });
    if (kind === "configuration")
      f.binding.target.configurationRevision = "config-2";
    if (kind === "adapter")
      f.binding.adapterVersions["entity-host"] = "build-2";
    if (kind === "revocation") f.authority.authorize.mockResolvedValue(false);
    if (kind === "interruption") controller.abort();
    return f.success();
  });
  expect(
    await f.writer().qualify({ ...f.input, signal: controller.signal }),
  ).toMatchObject({ passed: false, published: false });
  expect(f.authority.compareAndSwap).not.toHaveBeenCalled();
});

it("does not overwrite authority changed by another qualification", async () => {
  const f = fixture();
  f.probe.execute.mockImplementation(async () => {
    f.changePointer({
      target: f.binding.target,
      adapterVersions: f.binding.adapterVersions,
      supportRevision: "other",
      receiptHash: "8".repeat(64),
    });
    return f.success();
  });
  expect(await f.writer().qualify(f.input)).toMatchObject({
    passed: true,
    published: false,
  });
  expect(f.pointer()?.supportRevision).toBe("other");
});

it("rechecks configuration and expiry across immutable retention I/O", async () => {
  for (const kind of ["changed", "expired"]) {
    const f = fixture();
    const original = f.storage.putIfAbsent.getMockImplementation()!;
    f.storage.putIfAbsent.mockImplementation(async (key, bytes) => {
      const created = await original(key, bytes);
      if (key.includes("/receipts/")) {
        if (kind === "changed")
          f.binding.target.configurationRevision = "config-3";
        else f.setClock(1_100);
      }
      return created;
    });
    expect(await f.writer().qualify(f.input)).toMatchObject({
      passed: true,
      published: false,
    });
    expect(f.authority.compareAndSwap).not.toHaveBeenCalled();
  }
});

it("retains cancellation even when a probe does not settle", async () => {
  const f = fixture(),
    controller = new AbortController();
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.probe.execute.mockImplementation(() => {
    started();
    return new Promise(() => {});
  });
  const pending = f.writer().qualify({ ...f.input, signal: controller.signal });
  await entered;
  controller.abort();
  expect(await pending).toMatchObject({ passed: false, published: false });
  expect(f.authority.compareAndSwap).not.toHaveBeenCalled();
});

it("bounds an unresponsive registered probe and retains its failed attempt", async () => {
  const f = fixture();
  f.probe.execute.mockImplementation(() => new Promise(() => {}));
  const writer = createEntitySupportQualificationWriter({
    ...f.options,
    probeTimeoutMs: 5,
  });
  expect(await writer.qualify(f.input)).toMatchObject({
    passed: false,
    published: false,
  });
  const result = [...f.objects.entries()].find(([key]) =>
    key.endsWith("/result.json"),
  )![1];
  expect(
    JSON.parse(new TextDecoder().decode(result)).observations[0],
  ).toMatchObject({ passed: false, error: "timed_out" });
});
