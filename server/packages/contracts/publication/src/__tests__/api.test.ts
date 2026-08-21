import { describe, expect, expectTypeOf, it } from "vitest";
import {
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  parsePublicationArtifactEnvelope,
  type PublicationArtifactEnvelopeV1,
  type PublicationArtifactLoader,
  type PublicationArtifactStore,
  type PublicationAuthorityRepository,
  type PublicationPlane,
  type PublicationFailureCategory,
  type PublicationSigner,
  type PublicationVerifier,
} from "../index.js";

describe("Publication contract API", () => {
  it("exposes implementation-neutral ports and canonical physical planes", () => {
    expectTypeOf<PublicationPlane>().toEqualTypeOf<"studio" | "neon" | "mesh">();
    expectTypeOf<PublicationArtifactStore>().toHaveProperty("putImmutable");
    expectTypeOf<PublicationSigner>().toHaveProperty("sign");
    expectTypeOf<PublicationVerifier>().toHaveProperty("verify");
    expectTypeOf<PublicationArtifactLoader>().toHaveProperty("load");
    expectTypeOf<PublicationFailureCategory>().toEqualTypeOf<"permanent" | "transient" | "conflict">();
    expectTypeOf<PublicationAuthorityRepository>().toHaveProperty("acknowledge");
  });

  it("rejects unknown major schemas", () => {
    expect(() => parsePublicationArtifactEnvelope({ schema: "athyper.publication-artifact.v2" })).toThrowError(expect.objectContaining({ code: "ARTIFACT_SCHEMA_UNSUPPORTED" }));
  });

  it("tolerates additive optional fields within v1", () => {
    const envelope = {
      schema: PUBLICATION_ARTIFACT_SCHEMA_V1,
      publicationKey: "metadata.entity.invoice",
      releaseId: "release-1",
      releaseNo: 1,
      releaseKind: "publish",
      targetPlane: "studio",
      artifactKind: "entity_runtime",
      generatedAt: "2026-08-10T00:00:00.000Z",
      compatibilityLevel: "fully_compatible",
      payload: { entityContract: {}, entityDescriptor: {} },
      futureOptionalEvidence: { safe: true },
    } as const;
    expect(parsePublicationArtifactEnvelope(envelope).schema).toBe(PUBLICATION_ARTIFACT_SCHEMA_V1);
    expectTypeOf(parsePublicationArtifactEnvelope(envelope)).toEqualTypeOf<PublicationArtifactEnvelopeV1>();
  });
});
