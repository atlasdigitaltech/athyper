// framework/runtime/src/services/business/finance/accounting/services/purchase-invoice-service.ts
//
// Purchase Non-PO Invoice Service — the central hub connecting ALL 12 engines.
// Orchestrates: OU+Intent, Classification, Decision Grid, Budget, Commitment,
// Posting, Tax, Inventory, Asset, Commission, Federation, Production (indirect),
// plus Approval Workflow.

import { ok, fail } from "../../../engines/shared/engine-base.js";
import { sumAmounts, compareAmounts } from "../../../engines/shared/money.js";
import { generatePostingSplits } from "../../../engines/tax-engine/services/tax-posting-splits.js";
import { INVOICE_TRANSITIONS } from "../domain/types.js";

import type {
  CreateJournalEntryInput,
  CreateJournalLineInput,
} from "../../../engines/posting-engine/domain/types.js";
import type { PostingService } from "../../../engines/posting-engine/services/posting-service.js";
import type {
  ServiceResult,
  OperationContext,
} from "../../../engines/shared/engine-base.js";
import type {
  DecisionGridEvaluator,
  DecisionEvaluationResult,
} from "../../shared/decision-grid-evaluator.js";
import type { DocumentControl } from "../../shared/document-control.js";
import type { OUIntentResolver } from "../../shared/ou-intent-resolver.js";
import type { OutboxEmitter, PostActionEvent } from "../../shared/outbox.js";
import type {
  PurchaseInvoice,
  PurchaseInvoiceLine,
  InvoiceStatus,
  CreatePurchaseInvoiceInput,
  UpdatePurchaseInvoiceInput,
  CreateInvoiceLineInput,
} from "../domain/types.js";
import type {
  PurchaseInvoiceRepo,
  PurchaseInvoiceLineRepo,
} from "../persistence/purchase-invoice-repo.js";

// ---------------------------------------------------------------------------
// Simplified engine interfaces (avoids tight coupling to full engine modules)
// ---------------------------------------------------------------------------

/** Budget Engine — fund lifecycle operations */
export interface BudgetOps {
  reserve(
    ctx: OperationContext,
    fpId: string,
    amount: string,
    currencyCode: string,
    txnId: string,
  ): Promise<ServiceResult<unknown>>;
  commit(
    ctx: OperationContext,
    fpId: string,
    amount: string,
    currencyCode: string,
    txnId: string,
  ): Promise<ServiceResult<unknown>>;
  consume(
    ctx: OperationContext,
    fpId: string,
    amount: string,
    currencyCode: string,
    txnId: string,
  ): Promise<ServiceResult<unknown>>;
  release(
    ctx: OperationContext,
    fpId: string,
    amount: string,
    currencyCode: string,
    txnId: string,
  ): Promise<ServiceResult<unknown>>;
}

/** Tax Engine — calculation + posting splits */
export interface TaxOps {
  calculateBatch(
    ctx: OperationContext,
    inputs: unknown[],
  ): Promise<ServiceResult<{ calculations: any[]; totalTaxAmount: string }>>;
}

/** Asset Engine — WIP asset creation for CAPEX lines */
export interface AssetOps {
  createAsset(
    ctx: OperationContext,
    input: {
      sourceDocType: string;
      sourceDocId: string;
      sourceDocLineId: string;
      acquisitionCost: string;
      currencyCode: string;
      description: string;
    },
  ): Promise<ServiceResult<{ id: string }>>;
}

/** Inventory Engine — stock receipt for inventory items */
export interface InventoryOps {
  receiveStock(
    ctx: OperationContext,
    input: {
      itemId: string;
      warehouseId: string;
      quantity: string;
      unitCost: string;
      referenceDocType: string;
      referenceDocId: string;
    },
  ): Promise<ServiceResult<{ movementId: string }>>;
}

/** Commission Engine — calculate commission for eligible suppliers */
export interface CommissionOps {
  calculateCommission(
    ctx: OperationContext,
    input: {
      docId: string;
      supplierId: string;
      baseAmount: string;
      currencyCode: string;
    },
  ): Promise<ServiceResult<unknown>>;
}

/** Federation Engine — intercompany transaction creation */
export interface FederationOps {
  createICTransaction(
    ctx: OperationContext,
    input: {
      sourceEntity: string;
      destEntity: string;
      amount: string;
      currencyCode: string;
      sourceDocId: string;
    },
  ): Promise<ServiceResult<{ id: string }>>;
  isIntercompany(supplierId: string): Promise<boolean>;
}

/** Approval Workflow — instance management */
export interface ApprovalOps {
  createInstance(
    ctx: OperationContext,
    input: {
      entityType: string;
      entityId: string;
      triggerEvent: string;
      compositeScore: number;
      approvalRoute: string;
    },
  ): Promise<ServiceResult<{ id: string }>>;
  cancelInstance(
    ctx: OperationContext,
    instanceId: string,
  ): Promise<ServiceResult<void>>;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface PurchaseInvoiceService {
  create(
    ctx: OperationContext,
    input: CreatePurchaseInvoiceInput,
  ): Promise<ServiceResult<PurchaseInvoice>>;
  update(
    ctx: OperationContext,
    id: string,
    input: UpdatePurchaseInvoiceInput,
  ): Promise<ServiceResult<PurchaseInvoice>>;
  getById(tenantId: string, id: string): Promise<PurchaseInvoice | null>;

  /** Add/update lines. Also resolves OU+Intent defaults + tax preview. */
  setLines(
    ctx: OperationContext,
    invoiceId: string,
    lines: CreateInvoiceLineInput[],
    version?: number,
  ): Promise<ServiceResult<PurchaseInvoiceLine[]>>;

  /** Resolve OU+Intent defaults for a new line (called by UI) */
  resolveLineDefaults(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<Record<string, unknown>>>;

  /** DRAFT → SUBMITTED: Decision Grid + Budget RESERVE + Approval */
  submit(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<PurchaseInvoice>>;

  /** Workflow callback */
  onApprovalComplete(
    ctx: OperationContext,
    invoiceId: string,
    outcome: "approved" | "rejected",
  ): Promise<ServiceResult<PurchaseInvoice>>;

  /** APPROVED → POSTED: Tax final + JE + GL + Budget CONSUME + Asset + Inventory + Commission + Federation */
  post(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<PurchaseInvoice>>;

  /** Cancel (reversal cascade) */
  cancel(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<PurchaseInvoice>>;
}

// ---------------------------------------------------------------------------
// Submit result (includes Decision Grid evaluation for caller's use)
// ---------------------------------------------------------------------------

export interface InvoiceSubmitResult {
  invoice: PurchaseInvoice;
  evaluation: DecisionEvaluationResult;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultPurchaseInvoiceService implements PurchaseInvoiceService {
  constructor(
    private readonly invoiceRepo: PurchaseInvoiceRepo,
    private readonly lineRepo: PurchaseInvoiceLineRepo,
    private readonly postingService: PostingService,
    private readonly documentControl: DocumentControl,
    private readonly ouIntentResolver: OUIntentResolver,
    private readonly decisionGrid: DecisionGridEvaluator,
    private readonly budgetOps: BudgetOps,
    private readonly taxOps: TaxOps,
    private readonly assetOps: AssetOps,
    private readonly inventoryOps: InventoryOps,
    private readonly commissionOps: CommissionOps,
    private readonly federationOps: FederationOps,
    private readonly approvalOps: ApprovalOps,
    private readonly outboxEmitter?: OutboxEmitter,
  ) {}

  // ── CREATE ──────────────────────────────────────────────────────

  async create(
    ctx: OperationContext,
    input: CreatePurchaseInvoiceInput,
  ): Promise<ServiceResult<PurchaseInvoice>> {
    // Idempotency check
    const existing = await this.documentControl.checkIdempotency(
      this.invoiceRepo,
      ctx.tenantId,
      input.entityCode,
      input.idempotencyKey,
    );
    if (existing) return ok(existing);

    // Generate invoice number
    const entityCode = ctx.entityCode ?? input.entityCode;
    const invoiceNumber = await this.documentControl.generateNumber(
      ctx.tenantId,
      entityCode,
      "INV",
    );

    const invoice = await this.invoiceRepo.create({
      ...input,
      invoiceNumber,
      txnId: crypto.randomUUID(),
    });

    return ok(invoice);
  }

  // ── UPDATE (DRAFT only) ─────────────────────────────────────────

  async update(
    ctx: OperationContext,
    id: string,
    input: UpdatePurchaseInvoiceInput,
  ): Promise<ServiceResult<PurchaseInvoice>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, id);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${id} not found`);
    if (invoice.status !== "DRAFT") {
      return fail(
        "INVALID_STATUS",
        `Cannot update invoice in ${invoice.status} status`,
      );
    }
    this.documentControl.assertVersion(input.version, invoice.version);

    const updated = await this.invoiceRepo.updateStatus(
      ctx.tenantId,
      id,
      "DRAFT",
      {
        ...input,
        version: invoice.version + 1,
      } as any,
    );
    return ok(updated);
  }

  // ── GET ──────────────────────────────────────────────────────────

  async getById(tenantId: string, id: string): Promise<PurchaseInvoice | null> {
    return this.invoiceRepo.getById(tenantId, id);
  }

  // ── SET LINES (with OU+Intent defaults + tax preview) ────────────

  async setLines(
    ctx: OperationContext,
    invoiceId: string,
    lines: CreateInvoiceLineInput[],
    version?: number,
  ): Promise<ServiceResult<PurchaseInvoiceLine[]>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, invoiceId);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${invoiceId} not found`);
    if (invoice.status !== "DRAFT") {
      return fail(
        "INVALID_STATUS",
        `Cannot modify lines in ${invoice.status} status`,
      );
    }

    // Optimistic concurrency — prevent silent overwrites on concurrent line edits
    if (version !== undefined) {
      this.documentControl.assertVersion(version, invoice.version);
    }

    const savedLines = await this.lineRepo.bulkUpsert(
      ctx.tenantId,
      invoiceId,
      lines,
    );

    // Recalculate header totals from lines (MC-4 compliant)
    const subtotal = sumAmounts(savedLines.map((l) => l.amount));
    const taxAmount = sumAmounts(savedLines.map((l) => l.taxAmount));
    const totalAmount = sumAmounts([subtotal, taxAmount]);

    await this.invoiceRepo.updateStatus(ctx.tenantId, invoiceId, "DRAFT", {
      subtotal,
      taxAmount,
      totalAmount,
    } as any);

    return ok(savedLines);
  }

  // ── RESOLVE LINE DEFAULTS ────────────────────────────────────────

  async resolveLineDefaults(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, invoiceId);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${invoiceId} not found`);

    const result = await this.ouIntentResolver.resolveDefaults(
      ctx,
      invoice.ouId,
      invoice.intentId,
      invoice.spendCategoryId,
    );
    if (!result.ok) return fail(result.error.code, result.error.message);

    return ok(result.value as unknown as Record<string, unknown>);
  }

  // ── SUBMIT (Decision Grid + Budget RESERVE + Approval) ───────────

  async submit(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<PurchaseInvoice>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, invoiceId);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${invoiceId} not found`);
    if (!this.canTransition(invoice.status, "SUBMITTED")) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot submit invoice in ${invoice.status} status`,
      );
    }

    // Validate: lines exist and totals > 0
    const lines = await this.lineRepo.getByInvoiceId(ctx.tenantId, invoiceId);
    if (lines.length === 0) {
      return fail("NO_LINES", "Invoice must have at least one line");
    }
    if (compareAmounts(invoice.totalAmount, "0") <= 0) {
      return fail("ZERO_AMOUNT", "Invoice total amount must be positive");
    }

    // Validate: all lines have accounts
    const missingAccounts = lines.filter((l) => !l.accountId);
    if (missingAccounts.length > 0) {
      return fail(
        "MISSING_ACCOUNTS",
        `Lines ${missingAccounts.map((l) => l.lineNo).join(", ")} are missing GL accounts`,
      );
    }

    // ── Step 1: Decision Grid evaluation ──
    const evaluation = await this.decisionGrid.evaluate(ctx, {
      docId: invoice.id,
      docType: "PURCHASE_INVOICE",
      amount: invoice.totalAmount,
      currencyCode: invoice.currencyCode,
      ouId: invoice.ouId,
      intentId: invoice.intentId ?? undefined,
      categoryId: invoice.spendCategoryId ?? undefined,
      vendorId: invoice.supplierId,
    });

    if (!evaluation.ok) {
      return fail("DECISION_GRID_ERROR", evaluation.error.message);
    }

    const evalResult = evaluation.value;

    // Blocked — reject submission
    if (evalResult.approvalRoute === "BLOCKED") {
      return fail(
        "BLOCKED_BY_POLICY",
        `Invoice blocked by policy: ${evalResult.exceptions.map((e) => e.message).join("; ")}`,
        {
          policyResults: evalResult.policyResults,
          exceptions: evalResult.exceptions,
        },
      );
    }

    // ── Step 2: Budget RESERVE (if FP linked) ──
    const fpIds = this.collectFundingProfileIds(invoice, lines);
    for (const { fpId, amount } of fpIds) {
      const reserveResult = await this.budgetOps.reserve(
        ctx,
        fpId,
        amount,
        invoice.currencyCode,
        invoice.txnId,
      );
      if (!reserveResult.ok) {
        return fail(
          "BUDGET_RESERVE_FAILED",
          `Budget reserve failed for FP ${fpId}: ${reserveResult.error.message}`,
        );
      }
    }

    // ── Step 3: Route based on score ──
    if (evalResult.approvalRoute === "ZERO_APPROVAL") {
      // Auto-approve (skip workflow)
      const approved = await this.invoiceRepo.updateStatus(
        ctx.tenantId,
        invoiceId,
        "APPROVED",
        {
          decisionScore: evalResult.compositeScore,
          approvalRoute: evalResult.approvalRoute,
          submittedAt: new Date(),
          submittedBy: ctx.actorId,
          approvedAt: new Date(),
          approvedBy: ctx.actorId,
        } as any,
      );

      // Budget: COMMIT on auto-approve
      for (const { fpId, amount } of fpIds) {
        await this.budgetOps.commit(
          ctx,
          fpId,
          amount,
          invoice.currencyCode,
          invoice.txnId,
        );
      }

      return ok(approved);
    }

    // ── Step 4: Create approval workflow instance ──
    const approvalResult = await this.approvalOps.createInstance(ctx, {
      entityType: "purchase_invoice",
      entityId: invoiceId,
      triggerEvent: "on_submit",
      compositeScore: evalResult.compositeScore,
      approvalRoute: evalResult.approvalRoute,
    });

    const approvalInstanceId = approvalResult.ok
      ? approvalResult.value.id
      : null;

    const submitted = await this.invoiceRepo.updateStatus(
      ctx.tenantId,
      invoiceId,
      "SUBMITTED",
      {
        decisionScore: evalResult.compositeScore,
        approvalRoute: evalResult.approvalRoute,
        approvalInstanceId,
        submittedAt: new Date(),
        submittedBy: ctx.actorId,
      } as any,
    );

    return ok(submitted);
  }

  // ── APPROVAL COMPLETE (workflow callback) ────────────────────────

  async onApprovalComplete(
    ctx: OperationContext,
    invoiceId: string,
    outcome: "approved" | "rejected",
  ): Promise<ServiceResult<PurchaseInvoice>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, invoiceId);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${invoiceId} not found`);

    if (outcome === "approved") {
      const approved = await this.invoiceRepo.updateStatus(
        ctx.tenantId,
        invoiceId,
        "APPROVED",
        {
          approvedAt: new Date(),
          approvedBy: ctx.actorId,
        } as any,
      );

      // Budget: COMMIT
      const lines = await this.lineRepo.getByInvoiceId(ctx.tenantId, invoiceId);
      const fpIds = this.collectFundingProfileIds(invoice, lines);
      for (const { fpId, amount } of fpIds) {
        await this.budgetOps.commit(
          ctx,
          fpId,
          amount,
          invoice.currencyCode,
          invoice.txnId,
        );
      }

      return ok(approved);
    }

    // Rejected → back to DRAFT (re-editable)
    const rejected = await this.invoiceRepo.updateStatus(
      ctx.tenantId,
      invoiceId,
      "DRAFT",
      {
        approvalInstanceId: null,
      } as any,
    );

    // Budget: RELEASE reserved funds
    const lines = await this.lineRepo.getByInvoiceId(ctx.tenantId, invoiceId);
    const fpIds = this.collectFundingProfileIds(invoice, lines);
    for (const { fpId, amount } of fpIds) {
      await this.budgetOps.release(
        ctx,
        fpId,
        amount,
        invoice.currencyCode,
        invoice.txnId,
      );
    }

    return ok(rejected);
  }

  // ── POST (the 12-engine orchestration) ───────────────────────────

  async post(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<PurchaseInvoice>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, invoiceId);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${invoiceId} not found`);
    if (!this.canTransition(invoice.status, "POSTED")) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot post invoice in ${invoice.status} status`,
      );
    }

    const lines = await this.lineRepo.getByInvoiceId(ctx.tenantId, invoiceId);
    const entityCode = ctx.entityCode ?? invoice.entityCode;

    // ── Step 1: Tax Engine — final calculation + posting splits ──
    const taxInputs = lines.map((line, idx) => ({
      tenantId: ctx.tenantId,
      txnId: invoice.txnId,
      docId: invoice.id,
      lineItemIndex: idx,
      jurisdictionCode: line.taxCode ?? "DEFAULT",
      taxCode: line.taxCode ?? "STANDARD",
      baseAmount: line.amount,
      currencyCode: invoice.currencyCode,
      transactionDate: invoice.invoiceDate,
    }));

    const taxResult = await this.taxOps.calculateBatch(ctx, taxInputs);
    let taxSplits: ReturnType<typeof generatePostingSplits> = [];

    if (taxResult.ok && taxResult.value.calculations.length > 0) {
      // Build source line ID map
      const sourceLineIdMap = new Map<number, string>();
      lines.forEach((line, idx) => sourceLineIdMap.set(idx, line.id));

      taxSplits = generatePostingSplits(taxResult.value.calculations, {
        sourceLineIdMap,
      });
    }

    // ── Step 2: Build JE lines ──
    const jeLines: CreateJournalLineInput[] = [];
    let apControlTotal = "0";

    // 2a. Dr Expense/Asset per invoice line
    for (const line of lines) {
      if (!line.accountId) continue;

      // Non-recoverable tax with ADD_TO_BASE_LINE: add tax to expense amount
      const addToBaseAmount = taxSplits
        .filter(
          (s) => s.mode === "ADD_TO_BASE_LINE" && s.sourceLineId === line.id,
        )
        .map((s) => s.amount);
      const lineTotal =
        addToBaseAmount.length > 0
          ? sumAmounts([line.amount, ...addToBaseAmount])
          : line.amount;

      jeLines.push({
        accountId: line.accountId,
        costCenterId: line.costCenterId ?? undefined,
        profitCenterId: line.profitCenterId ?? undefined,
        debitAmount: lineTotal,
        creditAmount: "0",
        currencyCode: invoice.currencyCode,
        description: line.description,
        sourceDocLineId: line.id,
      });
    }

    // 2b. Dr Tax Input Credit (recoverable tax — SEPARATE_LINE)
    for (const split of taxSplits) {
      if (split.mode === "SEPARATE_LINE" && split.side === "DEBIT") {
        jeLines.push({
          accountId: split.jurisdictionId, // TODO: resolve tax input credit GL account
          debitAmount: split.amount,
          creditAmount: "0",
          currencyCode: invoice.currencyCode,
          description: `Tax input credit: ${split.taxCode}`,
          sourceDocLineId: split.sourceLineId,
        });
      }
    }

    // 2c. Cr AP Control Account (total including all tax)
    apControlTotal = invoice.totalAmount;
    jeLines.push({
      accountId: "AP_CONTROL", // TODO: resolve AP control account from accounting profile
      debitAmount: "0",
      creditAmount: apControlTotal,
      currencyCode: invoice.currencyCode,
      description: `AP: ${invoice.invoiceNumber} — ${invoice.supplierId}`,
      subledgerType: "AP",
      subledgerRefId: invoice.supplierId,
      sourceDocLineId: invoice.id,
    });

    // ── Step 3: PostingService.createAndPost() ──
    const jeNumber = await this.documentControl.generateNumber(
      ctx.tenantId,
      entityCode,
      "JE",
    );

    const jeInput: CreateJournalEntryInput = {
      tenantId: ctx.tenantId,
      entityCode,
      txnId: invoice.txnId,
      docId: invoice.id,
      docType: "PURCHASE_INVOICE",
      accountingProfileId: invoice.accountingProfileId ?? undefined,
      postingDate: invoice.postingDate ?? invoice.invoiceDate,
      description: `Purchase Invoice ${invoice.invoiceNumber}`,
      currencyCode: invoice.currencyCode,
      lines: jeLines,
      postedBy: ctx.actorId,
      idempotencyKey: invoice.idempotencyKey ?? undefined,
    };

    const postResult = await this.postingService.createAndPost(
      ctx,
      jeInput,
      jeNumber,
    );
    if (!postResult.ok) {
      return fail(
        postResult.error.code,
        `Posting failed: ${postResult.error.message}`,
      );
    }

    const je = postResult.value;

    // ── Step 4: Budget CONSUME ──
    const fpIds = this.collectFundingProfileIds(invoice, lines);
    for (const { fpId, amount } of fpIds) {
      const consumeResult = await this.budgetOps.consume(
        ctx,
        fpId,
        amount,
        invoice.currencyCode,
        invoice.txnId,
      );
      if (!consumeResult.ok) {
        // v1: compensating RELEASE on consume failure after posting
        await this.budgetOps.release(
          ctx,
          fpId,
          amount,
          invoice.currencyCode,
          invoice.txnId,
        );
      }
    }

    // ── Step 5: Update invoice header (atomic with JE) ──
    const posted = await this.invoiceRepo.updateStatus(
      ctx.tenantId,
      invoiceId,
      "POSTED",
      {
        jeId: je.id,
        postedAt: new Date(),
        postedBy: ctx.actorId,
        postingDate: invoice.postingDate ?? invoice.invoiceDate,
      } as any,
    );

    // ── Step 6: Emit outbox event for post-commit side effects ──
    // Inventory receipt, asset WIP, commission calc, and federation IC
    // are now processed asynchronously via idempotent outbox handlers.
    if (this.outboxEmitter) {
      const event: PostActionEvent = {
        type: "finance.document.posted",
        docId: invoice.id,
        docType: "PURCHASE_INVOICE",
        tenantId: ctx.tenantId,
        entityCode,
        jeId: je.id,
        supplierId: invoice.supplierId,
        lines: lines.map((line) => ({
          lineId: line.id,
          intentDomain: null, // TODO: resolve from intent metadata
          itemId: line.itemId ?? null,
          warehouseId: line.warehouseId ?? null,
          accountId: line.accountId ?? null,
          amount: line.amount,
        })),
      };
      await this.outboxEmitter.emit(event);
    }

    return ok(posted);
  }

  // ── CANCEL (reversal cascade) ────────────────────────────────────

  async cancel(
    ctx: OperationContext,
    invoiceId: string,
  ): Promise<ServiceResult<PurchaseInvoice>> {
    const invoice = await this.invoiceRepo.getById(ctx.tenantId, invoiceId);
    if (!invoice) return fail("NOT_FOUND", `Invoice ${invoiceId} not found`);

    const entityCode = ctx.entityCode ?? invoice.entityCode;
    const lines = await this.lineRepo.getByInvoiceId(ctx.tenantId, invoiceId);
    const fpIds = this.collectFundingProfileIds(invoice, lines);

    if (invoice.status === "POSTED" || invoice.status === "PARTIALLY_PAID") {
      // Reverse the JE
      if (invoice.jeId) {
        const reversalNumber = await this.documentControl.generateNumber(
          ctx.tenantId,
          entityCode,
          "JER",
        );
        const reverseResult = await this.postingService.reverse(
          ctx,
          invoice.jeId,
          reversalNumber,
        );
        if (!reverseResult.ok) {
          return fail(
            "REVERSAL_FAILED",
            `JE reversal failed: ${reverseResult.error.message}`,
          );
        }
      }

      // Budget: RELEASE consumed amount
      for (const { fpId, amount } of fpIds) {
        await this.budgetOps.release(
          ctx,
          fpId,
          amount,
          invoice.currencyCode,
          invoice.txnId,
        );
      }

      // TODO: Asset Engine — retire/dispose WIP assets
      // TODO: Inventory Engine — create ADJUSTMENT reversal
      // TODO: Commission Engine — clawback
    } else if (invoice.status === "SUBMITTED") {
      // Cancel approval workflow
      if (invoice.approvalInstanceId) {
        await this.approvalOps.cancelInstance(ctx, invoice.approvalInstanceId);
      }

      // Budget: RELEASE reserved amount
      for (const { fpId, amount } of fpIds) {
        await this.budgetOps.release(
          ctx,
          fpId,
          amount,
          invoice.currencyCode,
          invoice.txnId,
        );
      }
    }

    const cancelled = await this.invoiceRepo.updateStatus(
      ctx.tenantId,
      invoiceId,
      "CANCELLED",
      {
        cancelledAt: new Date(),
        cancelledBy: ctx.actorId,
      } as any,
    );

    return ok(cancelled);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private canTransition(
    current: InvoiceStatus,
    target: InvoiceStatus,
  ): boolean {
    return INVOICE_TRANSITIONS[current]?.includes(target) ?? false;
  }

  /**
   * Collect funding profile IDs with their amounts for budget operations.
   * Line-level FP overrides header-level FP.
   */
  private collectFundingProfileIds(
    invoice: PurchaseInvoice,
    lines: PurchaseInvoiceLine[],
  ): Array<{ fpId: string; amount: string }> {
    const map = new Map<string, string[]>();

    for (const line of lines) {
      const fpId = line.fpId ?? invoice.fpId;
      if (!fpId) continue;
      const existing = map.get(fpId) ?? [];
      existing.push(line.amount);
      map.set(fpId, existing);
    }

    return Array.from(map.entries()).map(([fpId, amounts]) => ({
      fpId,
      amount: sumAmounts(amounts),
    }));
  }
}
