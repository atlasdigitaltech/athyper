import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../routes/records.route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../mutation/entity-mutation.service.ts", import.meta.url), "utf8");

describe("Phase 6 aggregate workspace contract", () => {
  it("routes workspace submit through the canonical aggregate command", () => {
    const submitStart = route.indexOf("const documentEditSubmitHandler: RequestHandler");
    const submitEnd = route.indexOf("async function resolveDocumentEditMutationTarget", submitStart);
    const submit = route.slice(submitStart, submitEnd);
    expect(submit).toContain("entityMutationService.mutateAggregate({");
    expect(submit).toContain("header: { patch:");
    expect(submit).toContain("update: changes.update.map((value) => ({ id: value.id, patch: value.data }))");
    expect(submit).toContain("planHash: workspace.planHash");
    expect(submit).not.toContain("applyDocumentEditMutation({");
  });

  it("keeps header, sibling children, runtime state, idempotency, and outbox in one handler transaction", () => {
    const aggregateStart = route.indexOf("const applyDocumentEditMutation = async");
    const aggregateEnd = route.indexOf("aggregateBoundaryHandlers.set", aggregateStart);
    const aggregate = route.slice(aggregateStart, aggregateEnd);
    const transactionStart = aggregate.indexOf("executeDurableMutationTransaction(db, async (trx)");
    expect(transactionStart).toBeGreaterThan(0);
    const transaction = aggregate.slice(transactionStart);
    expect(transaction).toContain("updateTable(touchTarget.table)");
    expect(transaction).toContain("deleteFrom(linesTable)");
    expect(transaction).toContain("updateTable(linesTable)");
    expect(transaction).toContain("insertInto(linesTable)");
    expect(transaction).toContain("advanceDocumentRuntimeState(trx");
    expect(transaction).toContain("writeRequiredRouteAudit(trx");
    expect(transaction).toContain("claimDocumentRuntimeIdempotency(trx");
    expect(transaction).toContain("completeDocumentRuntimeIdempotency(trx");
    expect(transaction).toContain("emitOutboxEvent(trx");
  });

  it("rejects generic document mutations in both the service and legacy route boundaries", () => {
    expect(service).toContain('target.manifest.renderer === "document"');
    expect(service).toContain('action === "create" || action === "patch" || action === "delete"');
    expect(route.match(/rejectGenericDocumentMutation\(res, table\)/g)).toHaveLength(4);
  });
});
