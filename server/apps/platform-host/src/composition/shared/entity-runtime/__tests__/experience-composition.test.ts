import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createExperienceService } from "@athyper/server-platform-experience";
import { readPublishedEntityRouteCandidates } from "../route-admission.js";
import { createEntityExperienceRuntime } from "../experience.js";

vi.mock("@athyper/server-platform-experience", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createExperienceService: vi.fn(() => ({})),
}));
vi.mock("../route-admission.js", () => ({
  readPublishedEntityRouteCandidates: vi.fn(),
}));

describe("Entity experience composition", () => {
  it("resolves metadata installed after construction and uses the requested plane transaction", async () => {
    const database = {} as Kysely<Record<string, never>>;
    let metadata: MetadataReader | undefined;
    const run = vi.fn(async (_plane, work) => work(database));
    createEntityExperienceRuntime({
      databases: { neon: database },
      run,
      metadata: () => metadata,
    });
    const options = vi.mocked(createExperienceService).mock.calls.at(-1)![0];
    const context = { planeKey: "neon" } as VerifiedRequestContext;
    expect(await options.readPublishedEntityRoutes!(context)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
    metadata = {} as MetadataReader;
    vi.mocked(readPublishedEntityRouteCandidates).mockImplementationOnce(
      async (_context, reader, transaction) => {
        expect(reader).toBe(metadata);
        return transaction(async (selected) => {
          expect(selected).toBe(database);
          return [
            { entityCode: "country", releaseId: "release", operations: {} },
          ];
        });
      },
    );
    expect(await options.readPublishedEntityRoutes!(context)).toEqual([
      { entityCode: "country", releaseId: "release", operations: {} },
    ]);
    expect(run).toHaveBeenCalledWith("neon", expect.any(Function));
  });

  it("rejects an absent plane without borrowing another plane's repository or transaction", async () => {
    const run = vi.fn();
    const runtime = createEntityExperienceRuntime({
      databases: { neon: {} as Kysely<Record<string, never>> },
      run,
      metadata: () => ({}) as MetadataReader,
    });
    const options = vi.mocked(createExperienceService).mock.calls.at(-1)![0];
    expect(() => options.repositories.require("mesh")).toThrow();
    expect(
      await options.readPublishedEntityRoutes!({
        planeKey: "mesh",
      } as VerifiedRequestContext),
    ).toEqual([]);
    expect((await runtime.health("mesh")).status).toBe("unavailable");
    expect(run).not.toHaveBeenCalled();
  });
});
