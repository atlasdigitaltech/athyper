import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recordsRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(import.meta.dirname, "../../../../../");

const recordsRoute = readFileSync(resolve(recordsRoot, "routes/records.route.ts"), "utf8");
const mutationRoute = readFileSync(resolve(recordsRoot, "routes/entity-mutation.route.ts"), "utf8");
const recordsIndex = readFileSync(resolve(recordsRoot, "routes/index.ts"), "utf8");
const entityContract = readFileSync(
  resolve(repoRoot, "server/db/seed/platform/003_control/040_control_entity_contract.sql"),
  "utf8",
);
const coverageContract = readFileSync(
  resolve(repoRoot, "server/db/seed/platform/003_control/040a_control_all_schema_entity_coverage_contract.sql"),
  "utf8",
);
const compiler = readFileSync(
  resolve(repoRoot, "server/packages/services/metadata/src/entity-compiler.service.ts"),
  "utf8",
);
const editRouting = readFileSync(
  resolve(repoRoot, "apps/neon/lib/server/meta-entity-edit-routing.ts"),
  "utf8",
);
const ledgerDdl = readFileSync(resolve(repoRoot, "server/db/ddl/ledger/01_tables.sql"), "utf8");

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing section end: ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

const create = section(recordsRoute, "const createHandler: RequestHandler", "const updateHandler: RequestHandler");
const put = section(recordsRoute, "const updateHandler: RequestHandler", "const recordStreamHandler: RequestHandler");
const workspaceMutation = section(
  recordsRoute,
  "const applyDocumentEditMutation = async",
  "const documentEditSubmitHandler: RequestHandler",
);
const workspaceSubmit = section(
  recordsRoute,
  "const documentEditSubmitHandler: RequestHandler",
  "const patchHandler: RequestHandler",
);
const workspace = `${workspaceMutation}\n${workspaceSubmit}`;
const patch = section(recordsRoute, "const patchHandler: RequestHandler", "const deleteHandler: RequestHandler");
const remove = section(recordsRoute, "const deleteHandler: RequestHandler", "const debugHandler: RequestHandler");

describe("Phase 0 representative entity golden contracts", () => {
  it("freezes the supported-but-currently-unseeded simple surface", () => {
    const explicitSimpleSeeds = entityContract.match(/detail_renderer["']?\s*[:=,]\s*["']simple["']/gi) ?? [];

    expect({
      explicitSimpleSeedCount: explicitSimpleSeeds.length,
      routingTreatsSimpleAsClassic: editRouting.includes('renderer: "master" | "simple"'),
      compilerFallbackIsMaster: compiler.includes('return "master";'),
      lowRiskCandidatePresent: entityContract.includes("('control', 'tax_group'"),
    }).toEqual({
      explicitSimpleSeedCount: 0,
      routingTreatsSimpleAsClassic: true,
      compilerFallbackIsMaster: true,
      lowRiskCandidatePresent: true,
    });
  });

  it("freezes company_code as the classic master representative", () => {
    expect({
      masterTableContract: entityContract.includes("('master', 'company_code', 'ACC', 'CC', 'MASTER', 'ent', 'table'"),
      masterUsesClassicRoute: editRouting.includes('return { kind: "classic", renderer: descriptor.renderer };'),
      genericCreateMounted: recordsRoute.includes('router.post  ("/runtime/v1/entities/:entity",     createHandler);')
        || recordsRoute.includes('router.post  ("/runtime/v1/entities/:entity",     phase3CreateHandler);')
        || mutationRoute.includes('router.post(`${root}/:entity`, handlers.create);'),
      genericPutMounted: recordsRoute.includes('router.put   ("/runtime/v1/entities/:entity/:id", updateHandler);')
        || mutationRoute.includes('router.put(`${root}/:entity/:id`, handlers.update);'),
      genericPatchMounted: recordsRoute.includes('router.patch ("/runtime/v1/entities/:entity/:id", patchHandler);')
        || recordsRoute.includes('router.patch ("/runtime/v1/entities/:entity/:id", phase3PatchHandler);')
        || mutationRoute.includes('router.patch(`${root}/:entity/:id`, handlers.patch);'),
    }).toEqual({
      masterTableContract: true,
      masterUsesClassicRoute: true,
      genericCreateMounted: true,
      genericPutMounted: true,
      genericPatchMounted: true,
    });
  });

  it("freezes purchase_order and purchase_invoice as workspace documents", () => {
    expect({
      purchaseOrderIsViewDocument: entityContract.includes("('document', 'purchase_order', 'BUY', 'PO', 'DOCUMENT', 'ent', 'view'"),
      purchaseOrderFacade: entityContract.includes('"write_facade":"PurchaseOrderFacade"'),
      purchaseInvoiceIsTableDocument: entityContract.includes("('document', 'purchase_invoice', 'ACC', 'INV', 'DOCUMENT', 'ent', 'table'"),
      documentNeedsRuntime: editRouting.includes('reason: "DOCUMENT_EDIT_RUNTIME_MISSING"'),
      documentWorkspaceMounted: recordsRoute.includes('/:entity/:id/edit/submit",     documentEditSubmitHandler'),
      workspaceChecksCapability: workspace.includes("inspectDocumentWorkspaceCapability"),
      workspaceUsesTransaction: workspace.includes("executeDurableMutationTransaction(db"),
    }).toEqual({
      purchaseOrderIsViewDocument: true,
      purchaseOrderFacade: true,
      purchaseInvoiceIsTableDocument: true,
      documentNeedsRuntime: true,
      documentWorkspaceMounted: true,
      workspaceChecksCapability: true,
      workspaceUsesTransaction: true,
    });
  });

  it("freezes generated ledger.gl_balance as read-only", () => {
    expect({
      glBalanceExists: /CREATE TABLE IF NOT EXISTS ledger\.gl_balance\s*\(/.test(ledgerDdl),
      ledgerClassGenerated: coverageContract.includes("WHEN r.table_schema = 'ledger' THEN 'LEDGER'"),
      generatedMetadataReadOnly: coverageContract.includes("'readOnly', true"),
      compilerUsesLedgerRenderer: compiler.includes('if (entityClass === "LEDGER" || entityClass === "LOG") return "ledger";'),
      editRouteRejectsLedger: editRouting.includes('descriptor.renderer === "ledger"'),
      journalEntryRemainsDocument: entityContract.includes("('document', 'journal_entry', 'ACC', 'JE', 'DOCUMENT'"),
    }).toEqual({
      glBalanceExists: true,
      ledgerClassGenerated: true,
      generatedMetadataReadOnly: true,
      compilerUsesLedgerRenderer: true,
      editRouteRejectsLedger: true,
      journalEntryRemainsDocument: true,
    });
  });
});

describe("Phase 0 mutation behavior golden contracts", () => {
  it("freezes the fail-closed records context boundary", () => {
    expect({
      middlewareMountedBeforeRoutes: recordsIndex.indexOf("router.use(verifiedRequestContext)")
        < recordsIndex.indexOf("createRecordsRoute(router, deps)"),
      resolvesVerifiedContext: recordsIndex.includes("resolveVerifiedRequestContext("),
      storesVerifiedContext: recordsIndex.includes("storeVerifiedRequestContext(res, canonical.context)"),
    }).toEqual({
      middlewareMountedBeforeRoutes: true,
      resolvesVerifiedContext: true,
      storesVerifiedContext: true,
    });
  });

  it("freezes generic POST behavior", () => {
    expect({
      authorizes: create.includes('action: "create"'),
      rejectsAllNonWritableFields: create.includes('error: "FIELDS_NOT_WRITABLE"'),
      hasPurchaseInvoiceBranch: create.includes('entityCode === "purchase_invoice"'),
      supportsWriteFacade: create.includes("getWriteFacade("),
      usesIdempotency: create.includes("buildEntityCreateIdempotency("),
      emitsSearchOutbox: create.includes("emitOutboxEvent("),
    }).toEqual({
      authorizes: true,
      rejectsAllNonWritableFields: true,
      hasPurchaseInvoiceBranch: true,
      supportsWriteFacade: true,
      usesIdempotency: true,
      emitsSearchOutbox: true,
    });
  });

  it("freezes generic PUT behavior", () => {
    expect({
      authorizes: put.includes('action: "update"'),
      rejectsAllNonWritableFields: put.includes('error: "FIELDS_NOT_WRITABLE"'),
      usesSharedFieldDecision: put.includes("validateEntityWriteFields({"),
      supportsLeaseAndVersion: put.includes('policy.strategy === "lease_plus_version"'),
      emitsOutboxInsideTransaction: put.includes("emitOutboxEvent(trx"),
      invalidatesListCache: put.includes("invalidateListCachesForEntity"),
    }).toEqual({
      authorizes: true,
      rejectsAllNonWritableFields: true,
      usesSharedFieldDecision: true,
      supportsLeaseAndVersion: true,
      emitsOutboxInsideTransaction: true,
      invalidatesListCache: true,
    });
  });

  it("freezes classic PATCH concurrency and idempotency", () => {
    expect({
      authorizes: patch.includes("authorizeEntityMutation({"),
      requiresExpectedVersion: patch.includes('readDocumentEditExpectedVersion(req, res, "entity patch")'),
      requiresIdempotencyKey: patch.includes('error: "IDEMPOTENCY_KEY_REQUIRED"'),
      claimsInsideTransaction: patch.indexOf("claimDocumentRuntimeIdempotency(trx") > patch.indexOf("executeDurableMutationTransaction(db"),
      versionedWrite: patch.includes('.where("row_version", "=", expectedVersion)'),
      emitsSearchInsideTransaction: patch.includes("await emitOutboxEvent(trx"),
      emitsEtag: patch.includes('res.setHeader("ETag"'),
    }).toEqual({
      authorizes: true,
      requiresExpectedVersion: true,
      requiresIdempotencyKey: true,
      claimsInsideTransaction: true,
      versionedWrite: true,
      emitsSearchInsideTransaction: true,
      emitsEtag: true,
    });
  });

  it("freezes generic DELETE as hard-delete plus post-write effects", () => {
    expect({
      authorizes: remove.includes('action: "delete"'),
      delegatesDeletionStrategy: remove.includes("entityMutationService.delete({"),
      routeDoesNotPhysicallyDelete: !remove.includes("deleteFrom(fullTable)"),
      invalidatesListCache: remove.includes("invalidateListCachesForEntity"),
      publishesDeletedSse: remove.includes('"record.deleted"'),
      emptySuccess: remove.includes("res.status(204).end()"),
    }).toEqual({
      authorizes: true,
      delegatesDeletionStrategy: true,
      routeDoesNotPhysicallyDelete: true,
      invalidatesListCache: true,
      publishesDeletedSse: true,
      emptySuccess: true,
    });
  });
});
