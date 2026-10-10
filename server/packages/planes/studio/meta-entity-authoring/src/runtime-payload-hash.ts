import { createHash } from "node:crypto";

/** Runtime payload hashes preserve array order; graph hashes sort selected branches. */
export function runtimePayloadHash(value: unknown): string {
  const encode = (item: unknown): string =>
    Array.isArray(item)
      ? "[" + item.map(encode).join(",") + "]"
      : item && typeof item === "object"
        ? "{" +
          Object.keys(item)
            .sort()
            .map(
              (key) =>
                JSON.stringify(key) +
                ":" +
                encode((item as Record<string, unknown>)[key]),
            )
            .join(",") +
          "}"
        : JSON.stringify(item);
  return createHash("sha256").update(encode(value)).digest("hex");
}
