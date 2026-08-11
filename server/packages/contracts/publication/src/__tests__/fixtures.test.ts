import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parsePublicationArtifactEnvelope } from "../index.js";

const CANONICAL_VECTOR = '{"a":"é","b":[3,2,1],"n":0}';
const CANONICAL_VECTOR_SHA256 = "cb3ee643229e4e76e4a55dac02d47f09e9f81d9762a8454b88ff27c61e4b40a7";

describe("Publication artifact v1 frozen fixtures", () => {
  it("round-trips the serialized Entity runtime fixture", async () => {
    const bytes = await readFile(new URL("../__fixtures__/entity-runtime-v1.json", import.meta.url));
    const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
    const envelope = parsePublicationArtifactEnvelope(parsed);
    expect(envelope.targetPlane).toBe("neon");
    expect(envelope.payload.entityDescriptor.sourceContractHash).toBe(envelope.payload.entityContract.contractHash);
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(parsed);
  });

  it("freezes canonical UTF-8 bytes and SHA-256 for Increment C", () => {
    expect(Buffer.from(CANONICAL_VECTOR, "utf8").toString("hex")).toBe("7b2261223a22c3a9222c2262223a5b332c322c315d2c226e223a307d");
    expect(createHash("sha256").update(CANONICAL_VECTOR, "utf8").digest("hex")).toBe(CANONICAL_VECTOR_SHA256);
  });
});
