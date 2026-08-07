import { createHash } from "node:crypto";

export interface AtlasKnowledgeChunkDraft {
  readonly ordinal: number;
  readonly characterStart: number;
  readonly characterEnd: number;
  readonly checksum: string;
  /** Ephemeral embedding input. Do not persist this to the metadata tables. */
  readonly text: string;
}

/** Deterministic, paragraph-aware chunking used before embedding. A checksum of
 * each exact chunk is persisted; the text is handed only to the approved index
 * adapter and must be discarded by the pipeline afterwards. */
export function chunkAtlasKnowledgeText(
  content: string,
  options: { readonly maxCharacters?: number; readonly overlapCharacters?: number } = {},
): readonly AtlasKnowledgeChunkDraft[] {
  const max = options.maxCharacters ?? 1_200;
  const overlap = options.overlapCharacters ?? 120;
  if (!Number.isSafeInteger(max) || max < 200 || max > 8_000) {
    throw new Error("Atlas knowledge chunk size is invalid.");
  }
  if (!Number.isSafeInteger(overlap) || overlap < 0 || overlap >= max / 2) {
    throw new Error("Atlas knowledge chunk overlap is invalid.");
  }
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return Object.freeze([]);
  const chunks: AtlasKnowledgeChunkDraft[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + max);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf("\n\n", end);
      const sentence = Math.max(normalized.lastIndexOf(". ", end), normalized.lastIndexOf("\n", end));
      if (paragraph > start + Math.floor(max * 0.5)) end = paragraph + 1;
      else if (sentence > start + Math.floor(max * 0.5)) end = sentence + 1;
    }
    const text = normalized.slice(start, end).trim();
    if (text) {
      const actualStart = normalized.indexOf(text, start);
      const actualEnd = actualStart + text.length;
      chunks.push(Object.freeze({
        ordinal: chunks.length,
        characterStart: actualStart,
        characterEnd: actualEnd,
        checksum: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`,
        text,
      }));
      if (actualEnd >= normalized.length) break;
      start = Math.max(actualEnd - overlap, actualStart + 1);
    } else {
      start = end;
    }
  }
  return Object.freeze(chunks);
}
