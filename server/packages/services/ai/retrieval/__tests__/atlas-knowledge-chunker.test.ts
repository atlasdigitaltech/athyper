import { describe, expect, it } from "vitest";
import { chunkAtlasKnowledgeText } from "../atlas-knowledge-chunker.js";

describe("chunkAtlasKnowledgeText", () => {
  it("creates deterministic bounded chunks with immutable checksums", () => {
    const source = `${"First paragraph. ".repeat(80)}\n\n${"Second paragraph. ".repeat(80)}`;
    const first = chunkAtlasKnowledgeText(source, { maxCharacters: 500, overlapCharacters: 50 });
    const second = chunkAtlasKnowledgeText(source, { maxCharacters: 500, overlapCharacters: 50 });
    expect(first.length).toBeGreaterThan(1);
    expect(first).toEqual(second);
    expect(first.every((chunk) => chunk.text.length <= 500 && chunk.checksum.startsWith("sha256:"))).toBe(true);
  });

  it("does not create index work for blank content", () => {
    expect(chunkAtlasKnowledgeText(" \n ")).toEqual([]);
  });
});
