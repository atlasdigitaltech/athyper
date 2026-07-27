import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "packages/services/records/routes/records.route.ts"), "utf8");
const patchStart = source.indexOf("const patchHandler: RequestHandler");
const patchEnd = source.indexOf("const deleteHandler: RequestHandler", patchStart);
const patch = source.slice(patchStart, patchEnd);
const documentMutationStart = source.indexOf("const applyDocumentEditMutation = async");
const documentMutationEnd = source.indexOf("const documentEditSubmitHandler: RequestHandler", documentMutationStart);
const documentMutation = source.slice(documentMutationStart, documentMutationEnd);

describe("classic PATCH safety contract", () => {
  it("requires canonical auth context, If-Match, and Idempotency-Key", () => {
    expect(patch).toContain("requireVerifiedContext(req, res)");
    expect(patch).not.toContain("verifyBearer(req.headers.authorization");
    expect(patch).toContain('readDocumentEditExpectedVersion(req, res, "entity patch")');
    expect(patch).toContain('req.header("Idempotency-Key")');
    expect(patch).toContain('error: "IDEMPOTENCY_KEY_REQUIRED"');
  });

  it("claims and completes idempotency in the atomic versioned transaction", () => {
    const transaction = patch.slice(patch.indexOf("executeDurableMutationTransaction(db"));
    expect(transaction).toContain("claimDocumentRuntimeIdempotency(trx");
    expect(transaction).toContain('.where("row_version", "=", expectedVersion)');
    expect(transaction).toContain("completeDocumentRuntimeIdempotency(trx");
    expect(transaction).toContain("releaseDocumentRuntimeIdempotency(trx");
    expect(patch).toContain('error: "IDEMPOTENCY_KEY_REUSED"');
    expect(patch).toContain('error: "IDEMPOTENCY_IN_PROGRESS"');
    expect(patch).toContain('res.status(412).json({');
    expect(patch).toContain('error: "VERSION_CONFLICT"');
    expect(patch).toContain('res.setHeader("ETag"');
  });

  it("keeps RBAC and lifecycle field locks on both classic and document paths", () => {
    expect(patch).toContain("authorizeEntityMutation({");
    expect(documentMutation).toContain("checkEntityMutationAuthorization({");
    expect(patch).toContain("fetchRecordStatus(");
    expect(documentMutation).toContain("fetchRecordStatus(");
    expect(patch).toContain("validateEntityWriteFields({");
    expect(documentMutation).toContain("validateEntityWriteFields({");
    expect(patch).toContain('error: "FIELDS_NOT_WRITABLE"');
    expect(documentMutation).toContain('error: "FIELDS_NOT_WRITABLE"');
    expect(patch).toContain("res.status(422).json({");
    expect(documentMutation).toContain("status: 422");
  });

  it("uses one pessimistic-lock validator and error contract", () => {
    expect(patch).toContain("checkApplicableEditLock({");
    expect(documentMutation).toContain("checkApplicableEditLock({");
    const helperStart = source.indexOf("async function checkApplicableEditLock");
    const helperEnd = source.indexOf("function writeDocumentEditMutationResult", helperStart);
    const helper = source.slice(helperStart, helperEnd);
    expect(helper).toContain("status: 423");
    expect(helper).toContain('error: "LOCKED"');
  });
});
