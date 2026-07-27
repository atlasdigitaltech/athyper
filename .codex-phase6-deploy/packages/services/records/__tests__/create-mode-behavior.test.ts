import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(import.meta.dirname, "../routes/records.route.ts"), "utf8");
const draftHandler = routeSource.slice(
  routeSource.indexOf("const initiateDraftHandler"),
  routeSource.indexOf("const promoteDraftHandler"),
);

describe("create mode transport boundaries", () => {
  it("uses the shared idempotency ledger for entity create and early draft initiation", () => {
    expect(routeSource).toContain('operationKey: "entity.create"');
    expect(draftHandler).toContain('operationKey: "entity.draft.initiate"');
    expect(draftHandler).toContain("claimDocumentRuntimeIdempotency");
    expect(draftHandler).toContain("completeDocumentRuntimeIdempotency");
  });

  it("owns the draft claim, insert, resume, and completion in one transaction", () => {
    const transactionStart = draftHandler.indexOf("const transactionResult = await db.transaction().execute");
    const transactionEnd = draftHandler.indexOf("const transactionDurationMs", transactionStart);
    const transaction = draftHandler.slice(transactionStart, transactionEnd);

    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionEnd).toBeGreaterThan(transactionStart);
    expect(transaction).toContain("claimDocumentRuntimeIdempotency(trx");
    expect(transaction).toContain("completeDocumentRuntimeIdempotency(trx");
    expect(transaction).toContain("ON CONFLICT DO NOTHING");
    expect(transaction.match(/\.execute\(trx\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(transaction).not.toContain(".execute(db)");
    expect(transaction).not.toContain("releaseDocumentRuntimeIdempotency");
    expect(transaction).not.toContain("sendDraftResponse");
  });

  it("keeps external resolution before the transaction and serializes after commit", () => {
    const transactionStart = draftHandler.indexOf("const transactionResult = await db.transaction().execute");
    const transactionEnd = draftHandler.indexOf("const transactionDurationMs", transactionStart);
    const firstResponse = draftHandler.indexOf("sendDraftResponse", transactionEnd);

    expect(draftHandler.indexOf("resolvePurchaseOrderCommitmentType(db)")).toBeLessThan(transactionStart);
    expect(draftHandler.indexOf("resolveDraftCompanyCode(db")).toBeLessThan(transactionStart);
    expect(draftHandler.indexOf("resolveDocumentFxRate(db")).toBeLessThan(transactionStart);
    expect(firstResponse).toBeGreaterThan(transactionEnd);
  });

  it("reports the required non-overlapping draft initiation phases", () => {
    for (const phase of [
      "session",
      "descriptor_flow",
      "defaults",
      "numbering_identity",
      "database_insert",
      "transaction_commit",
      "response_serialization",
    ]) {
      expect(draftHandler).toContain(`\"${phase}\"`);
    }
    expect(draftHandler).not.toContain('markPhase("serialize"');
    expect(draftHandler).toContain("transactionDurationMs - databaseInsertDurationMs");
  });

  it("selects the provisional initializer from metadata rather than an entity-name gate", () => {
    expect(draftHandler).toContain('table.feature_flags["backing_source"]');
    expect(draftHandler).not.toContain('entityCode !== "purchase_order"');
  });

  it("accepts the workspace create profile only for a currently provisional target", () => {
    expect(routeSource).toContain('profile: target.isProvisional ? "create" : "edit"');
    expect(routeSource).toContain('table.feature_flags["backing_source"]');
  });
});
