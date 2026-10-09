import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import { createNativeComponentEvidenceReader } from "./native-component-evidence.js";
it.each(["studio", "neon", "mesh"] as const)(
  "requires an installed signed resource even for an admitted %s scope",
  async (plane) => {
    const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({ query, release() {} }),
          end: async () => {},
        } as never,
      }),
    });
    Object.defineProperty(db, "isTransaction", { value: true });
    const read = createNativeComponentEvidenceReader({
      maximumBytes: 10000,
      loader: {
        canonicalizer: {
          canonicalBytes: () => new Uint8Array(),
          sha256: () => "a".repeat(64),
        },
        runtimeVersion: "1.0.0",
        verifier: { verify: vi.fn() },
        store: { get: vi.fn(), putImmutable: vi.fn() },
        uiComponents: { qualify: vi.fn() },
      },
    });
    await expect(
      read(db as Transaction<Record<string, never>>, {
        changeSetId: "00000000-0000-4000-8000-000000000001",
        componentId: "00000000-0000-4000-8000-000000000002",
        manifestHash: "a".repeat(64),
        publicationReleaseHash: "b".repeat(64),
        scope: { tenantId: null, plane, hostReleaseHash: "c".repeat(64) },
      }),
    ).rejects.toThrow("NATIVE_COMPONENT_RESOURCE_UNAVAILABLE");
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]![0]).toContain(
      "entity_command_private.read_component_resource",
    );
    await db.destroy();
  },
);
