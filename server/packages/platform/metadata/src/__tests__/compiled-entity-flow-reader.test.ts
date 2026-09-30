import { describe, expect, it, vi } from "vitest";
import { CompiledEntityFlowReader } from "../compiled-entity-flow-reader.js";
import { PinnedCompiledEntityReader } from "../compiled-entity-reader.js";
import type { CompiledEntityReleaseSource, CompiledEntityResolvedRelease } from "../artifact-resolution.js";

const publication = { releaseId: "34ce68d1-3b1d-5fa7-aa2d-1fbbd9088437", releaseNo: 15 };
const input = { tenantId: "tenant", principalId: "actor", planeKey: "neon" as const, entityCode: "business_partner", flowEntityCode: "business_partner_request", flowKey: "supplier.new", sourceKind: "manual" };
function fixture(hash = `sha256:${"a".repeat(64)}`) {
  const release = { release: { releaseId: "logical-compiled-release", releaseNo: 1 } };
  const publicationCoordinate = vi.fn(async () => publication);
  const artifactByKey = vi.fn(async (_release: unknown, key: string) => ({
    entityCode: "business_partner_request", artifactHash: hash,
    content: key.endsWith("flow.base")
      ? { workflowDefinitions: { supplier: { stages: [{ code: "review" }] } } }
      : { requestContract: {}, supportedSources: ["internal"] },
  }));
  const reader = new CompiledEntityFlowReader({ resolve: async () => release, publicationCoordinate, artifactByKey } as unknown as PinnedCompiledEntityReader);
  return { reader, release, publicationCoordinate };
}
describe("native case coordinates from pinned compiled flows", () => {
  it("uses the admitted publication UUID/version and a bare persistence hash, not the logical IR identity", async () => {
    const f = fixture();
    expect(await f.reader.requestSchema(input)).toEqual({ code: "neon.business_partner_request.supplier.new", version: 15, hash: "a".repeat(64), releaseId: publication.releaseId });
    expect(f.publicationCoordinate).toHaveBeenCalledWith(f.release);
  });
  it("uses the same publication boundary for workflow evidence", async () => {
    const f = fixture();
    expect(await f.reader.workflow({ ...input, journey: "supplier" })).toMatchObject({ version: 15, hash: "a".repeat(64), stageCode: "review" });
  });
  it("fails closed for a malformed artifact hash", async () => {
    await expect(fixture("a".repeat(64)).reader.requestSchema(input)).rejects.toThrow("COMPILED_ENTITY_FLOW_HASH_INVALID");
  });
  it("does not guess a publication identity if the pinned release is no longer admitted", async () => {
    const source = { findPublicationCoordinate: vi.fn(async () => null) } as unknown as CompiledEntityReleaseSource;
    const reader = new PinnedCompiledEntityReader({ source });
    await expect(reader.publicationCoordinate({} as CompiledEntityResolvedRelease)).rejects.toThrow("COMPILED_ENTITY_PUBLICATION_COORDINATE_UNAVAILABLE");
  });
});
