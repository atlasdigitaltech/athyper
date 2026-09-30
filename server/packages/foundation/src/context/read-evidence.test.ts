import { expect, it, vi } from "vitest";
import { readEvidence, withReadEvidence } from "./read-evidence.js";

it("shares pending evidence only within one read, provider, context and key", async () => {
  const provider = {},
    context = {},
    load = vi.fn(async () => ({ revision: 1 }));
  await withReadEvidence(async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        readEvidence(provider, context, "entity", load),
      ),
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((value) => value === results[0])).toBe(true);
    await readEvidence(provider, {}, "entity", load);
    await readEvidence({}, context, "entity", load);
    await readEvidence(provider, context, "other", load);
    expect(load).toHaveBeenCalledTimes(4);
  });
  await withReadEvidence(() => readEvidence(provider, context, "entity", load));
  await readEvidence(provider, context, "entity", load);
  await readEvidence(provider, context, "entity", load);
  expect(load).toHaveBeenCalledTimes(7);
});

it("evicts failed evidence and keeps concurrent requests isolated", async () => {
  const provider = {},
    context = {},
    load = vi.fn(async () => 1).mockRejectedValueOnce(Error("unavailable"));
  await withReadEvidence(async () => {
    await expect(readEvidence(provider, context, "key", load)).rejects.toThrow(
      "unavailable",
    );
    expect(await readEvidence(provider, context, "key", load)).toBe(1);
  });
  await Promise.all([
    withReadEvidence(() => readEvidence(provider, context, "key", load)),
    withReadEvidence(() => readEvidence(provider, context, "key", load)),
  ]);
  expect(load).toHaveBeenCalledTimes(4);
});
