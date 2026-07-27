import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/records.route.ts"), "utf8");
const service = fs.readFileSync(path.resolve(import.meta.dirname, "../mutation/entity-mutation.service.ts"), "utf8");

function handlerSlice(start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt).toBeGreaterThanOrEqual(0);
  expect(endAt).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

describe("Phase 7 transactional side effects", () => {
  it("keeps PATCH mutation, required audit, outbox, and idempotency completion together", () => {
    const patch = handlerSlice("const patchHandler", "const deleteHandler");
    expect(patch).toContain("executeDurableMutationTransaction(db, async (trx)");
    expect(patch).toContain("writeRequiredRouteAudit(trx");
    expect(patch).toContain("emitOutboxEvent(trx");
    expect(patch).toContain("completeDocumentRuntimeIdempotency(trx");
    expect(patch).not.toContain("emitOutboxEvent(db");
  });

  it("keeps DELETE, required audit, and outbox together", () => {
    const remove = handlerSlice("const deleteHandler", "const debugHandler");
    expect(remove).toContain("entityMutationService.delete({");
    expect(remove).not.toContain("deleteFrom(fullTable)");
    const deletion = service.slice(service.indexOf("async delete(command"), service.indexOf("async transition(command"));
    expect(deletion).toContain("executeDurableMutationTransaction(this.deps.db, async (trx)");
    expect(deletion).toContain("applyDeletionStrategy(trx");
    expect(deletion).toContain("writeDurableSideEffects(trx");
    expect(remove).not.toContain("emitOutboxEvent(db");
  });

  it("runs Redis cache and SSE projections after the durable transaction", () => {
    const remove = handlerSlice("const deleteHandler", "const debugHandler");
    const commitBoundary = remove.indexOf('if (result.kind !== "Committed")');
    expect(commitBoundary).toBeGreaterThan(0);
    expect(remove.indexOf("invalidateListCachesForEntity")).toBeGreaterThan(commitBoundary);
    expect(remove.indexOf("publishRecordEvent")).toBeGreaterThan(commitBoundary);
  });
});
