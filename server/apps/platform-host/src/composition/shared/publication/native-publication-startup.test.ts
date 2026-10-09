import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { createNativePublicationStartup } from "./native-publication-startup.js";

it("production composition resolves through the workload reader under the caller transaction", async () => {
  const directory = mkdtempSync(join(tmpdir(), "native-worker-startup-")),
    file = join(directory, "source.json");
  writeFileSync(
    file,
    JSON.stringify({
      schema: "entity.local-native-startup/1",
      commands: { authoringSchemaHash: "a".repeat(64), maxMembers: 100 },
      hostReleaseHash: "b".repeat(64),
      proposals: { maximumBytes: 65536 },
      componentPins: [],
    }),
    { mode: 0o600 },
  );
  const query = vi.fn(async (_text: string, _parameters: unknown[]) => ({
    rows: [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const loader = {
    canonicalizer: {
      canonicalBytes: (v: unknown) => Buffer.from(JSON.stringify(v)),
      sha256: () => "a".repeat(64),
    },
    verifier: { verify: vi.fn() },
    store: { get: vi.fn(), putImmutable: vi.fn() },
    runtimeVersion: "1.0.0",
    uiComponents: { qualify: vi.fn() },
  };
  try {
    const options = {
      environment: { PUBLICATION_NATIVE_SOURCE_CONFIGURATION_FILE: file },
      loader,
      run: <T>(work: (tx: Kysely<Record<string, never>>) => Promise<T>) =>
        db.transaction().execute(work),
    };
    const startup = createNativePublicationStartup(options);
    expect(startup.nativePublicationSource).toBeTypeOf("function");
    await expect(
      startup.nativePublicationSource!("00000000-0000-4000-8000-000000000001"),
    ).rejects.toThrow("NATIVE_REVIEW_SOURCE_INVALID");
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("publication.read_native_worker_source"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("read_native_product_review_source"),
      ),
    ).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes("rollback"))).toBe(
      true,
    );
    expect(() =>
      createNativePublicationStartup({
        ...options,
        loader: { ...loader, uiComponents: undefined },
      }),
    ).toThrow("COMPONENT_QUALIFICATION_REQUIRED");
    chmodSync(file, 0o644);
    expect(() => createNativePublicationStartup(options)).toThrow(
      "CONFIGURATION_INVALID",
    );
    expect(
      createNativePublicationStartup({ ...options, environment: {} }),
    ).toEqual({});
  } finally {
    await db.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
});
