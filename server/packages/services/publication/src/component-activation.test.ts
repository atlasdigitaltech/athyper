import { expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
const mock = vi.hoisted(() => ({ execute: vi.fn(), queries: [] as string[] }));
vi.mock("kysely", () => ({
  sql: Object.assign((parts: TemplateStringsArray) => {
    mock.queries.push(parts.join("?"));
    return { execute: mock.execute };
  }, {}),
}));
import { KyselyLocalProjectionRepository } from "./kysely-local-projection-repository.js";
const id = "00000000-0000-4000-8000-000000000001";
const db = (isTransaction: boolean) =>
  ({ isTransaction }) as Kysely<Record<string, never>>;
it.each([true, false])(
  "cannot activate components without transactional installer (transaction=%s)",
  async (transaction) => {
    mock.execute
      .mockReset()
      .mockResolvedValue({ rows: [{ applied_release_id: id }] });
    mock.queries.length = 0;
    const repository = new KyselyLocalProjectionRepository(db(transaction));
    await expect(repository.activate({ appliedReleaseId: id })).rejects.toThrow(
      "Transactional component installer required",
    );
    expect(mock.queries.some((q) => q.includes("fn_activate_release"))).toBe(
      false,
    );
  },
);
it("propagates installation failure to the enclosing activation transaction", async () => {
  mock.execute
    .mockReset()
    .mockResolvedValueOnce({ rows: [{ applied_release_id: id }] })
    .mockResolvedValue({ rows: [] });
  mock.queries.length = 0;
  const install = vi.fn(async () => {
    throw Error("INSTALLATION_CONFLICT");
  });
  const database = db(true);
  await expect(
    new KyselyLocalProjectionRepository(database, false, { install }).activate({
      appliedReleaseId: id,
    }),
  ).rejects.toThrow("INSTALLATION_CONFLICT");
  expect(install).toHaveBeenCalledWith(database, id);
  expect(mock.queries.some((q) => q.includes("fn_activate_release"))).toBe(
    true,
  );
});
