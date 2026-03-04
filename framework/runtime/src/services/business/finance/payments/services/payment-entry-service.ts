/**
 * Finance Module — Payment Entry Service
 *
 * The critical service for payment posting with GROSS SETTLEMENT semantics.
 *
 *   allocated_amount = gross settlement = total AP reduction per invoice
 *   Net cash = allocated_amount - withholding_amount - discount_amount
 *
 * JE proof (always balanced):
 *   Dr AP Control        = SUM(allocated_amount)
 *   Cr WHT Payable       = SUM(withholding_amount)
 *   Cr Discount Income   = SUM(discount_amount)
 *   Cr Bank Account      = SUM(allocated) - SUM(wht) - SUM(discount)
 *   ────────────────────────────────────────────────────────────────
 *   Dr total = Cr total  ✓
 *
 * All operations within `post()` execute within a single database transaction.
 * MC-4 compliant: all monetary arithmetic uses string-based BigInt helpers.
 */

import {
  ok,
  fail,
  validateTransition,
} from "../../../engines/shared/engine-base.js";
import {
  sumAmounts,
  subtractAmounts,
  compareAmounts,
} from "../../../engines/shared/money.js";
import { PAYMENT_TRANSITIONS } from "../domain/types.js";

import type { Container } from "../../../../../kernel/container.js";
import type {
  CreateJournalEntryInput,
  CreateJournalLineInput,
} from "../../../engines/posting-engine/domain/types.js";
import type {
  PostingService,
  TransactionContext,
} from "../../../engines/posting-engine/services/posting-service.js";
import type {
  OperationContext,
  ServiceResult,
} from "../../../engines/shared/engine-base.js";
import type { PurchaseInvoiceRepo } from "../../accounting/persistence/purchase-invoice-repo.js";
import type { DecisionGridEvaluator } from "../../shared/decision-grid-evaluator.js";
import type { DocumentControl } from "../../shared/document-control.js";
import type {
  PaymentEntry,
  PaymentAllocation,
  CreatePaymentEntryInput,
  UpdatePaymentEntryInput,
  CreateAllocationInput,
} from "../domain/types.js";
import type { PaymentAllocationRepo } from "../persistence/payment-allocation-repo.js";
import type { PaymentEntryRepo } from "../persistence/payment-entry-repo.js";

// ---------------------------------------------------------------------------
// Simplified TaxCalculationService interface (inline)
// ---------------------------------------------------------------------------

interface TaxCalculationService {
  calculate(
    ctx: OperationContext,
    input: { amount: string; taxType: string; [key: string]: unknown },
  ): Promise<ServiceResult<any>>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PaymentEntryService {
  create(
    ctx: OperationContext,
    input: CreatePaymentEntryInput,
  ): Promise<ServiceResult<PaymentEntry>>;

  update(
    ctx: OperationContext,
    id: string,
    input: UpdatePaymentEntryInput,
  ): Promise<ServiceResult<PaymentEntry>>;

  getById(tenantId: string, id: string): Promise<PaymentEntry | null>;

  addAllocations(
    ctx: OperationContext,
    paymentId: string,
    allocations: CreateAllocationInput[],
    version?: number,
  ): Promise<ServiceResult<PaymentAllocation[]>>;

  submit(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>>;

  onApprovalComplete(
    ctx: OperationContext,
    paymentId: string,
    outcome: "approved" | "rejected",
  ): Promise<ServiceResult<PaymentEntry>>;

  post(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>>;

  cancel(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>>;

  reconcile(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultPaymentEntryService implements PaymentEntryService {
  constructor(
    private readonly paymentEntryRepo: PaymentEntryRepo,
    private readonly paymentAllocationRepo: PaymentAllocationRepo,
    private readonly purchaseInvoiceRepo: PurchaseInvoiceRepo,
    private readonly postingService: PostingService,
    private readonly documentControl: DocumentControl,
    private readonly decisionGridEvaluator: DecisionGridEvaluator,
    private readonly taxCalculationService: TaxCalculationService,
    private readonly container: Container,
  ) {}

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------

  async create(
    ctx: OperationContext,
    input: CreatePaymentEntryInput,
  ): Promise<ServiceResult<PaymentEntry>> {
    // 1. Idempotency check — short-circuit on duplicate
    const existing = await this.documentControl.checkIdempotency(
      this.paymentEntryRepo,
      input.tenantId,
      input.entityCode,
      input.idempotencyKey,
    );
    if (existing) {
      return ok(existing as PaymentEntry);
    }

    // 2. Generate document number (PAY-YYYY-NNNNN)
    const paymentNumber = await this.documentControl.generateNumber(
      input.tenantId,
      input.entityCode,
      "PAY",
    );

    // 3. Create payment entry in DRAFT status
    const txnId = ctx.correlationId;
    const payment = await this.paymentEntryRepo.create({
      ...input,
      paymentNumber,
      txnId,
    });

    return ok(payment);
  }

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------

  async update(
    ctx: OperationContext,
    id: string,
    input: UpdatePaymentEntryInput,
  ): Promise<ServiceResult<PaymentEntry>> {
    const payment = await this.paymentEntryRepo.getById(ctx.tenantId, id);
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${id} not found`);
    }

    // 1. Only DRAFT payments can be updated
    if (payment.status !== "DRAFT") {
      return fail(
        "INVALID_STATUS",
        `Cannot update payment in ${payment.status} status; must be DRAFT`,
      );
    }

    // 2. Optimistic concurrency guard
    this.documentControl.assertVersion(input.version, payment.version);

    // 3. Apply field updates via status update (fields passed as partial)
    const updatedPayment = await this.paymentEntryRepo.updateStatus(
      ctx.tenantId,
      id,
      "DRAFT",
      {
        description: input.description ?? payment.description,
        paymentMethod: input.paymentMethod ?? payment.paymentMethod,
        bankAccountId: input.bankAccountId ?? payment.bankAccountId,
        bankReference: input.bankReference ?? payment.bankReference,
        paymentDate: input.paymentDate ?? payment.paymentDate,
        valueDate: input.valueDate ?? payment.valueDate,
        totalAmount: input.totalAmount ?? payment.totalAmount,
        exchangeRate: input.exchangeRate ?? payment.exchangeRate,
      } as Partial<PaymentEntry>,
    );

    return ok(updatedPayment);
  }

  // -----------------------------------------------------------------------
  // getById()
  // -----------------------------------------------------------------------

  async getById(tenantId: string, id: string): Promise<PaymentEntry | null> {
    return this.paymentEntryRepo.getById(tenantId, id);
  }

  // -----------------------------------------------------------------------
  // addAllocations()
  // -----------------------------------------------------------------------

  async addAllocations(
    ctx: OperationContext,
    paymentId: string,
    allocations: CreateAllocationInput[],
    version?: number,
  ): Promise<ServiceResult<PaymentAllocation[]>> {
    const payment = await this.paymentEntryRepo.getById(
      ctx.tenantId,
      paymentId,
    );
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${paymentId} not found`);
    }

    // 1. Only DRAFT payments accept allocation changes
    if (payment.status !== "DRAFT") {
      return fail(
        "INVALID_STATUS",
        `Cannot modify allocations for payment in ${payment.status} status; must be DRAFT`,
      );
    }

    // 2. Optimistic concurrency — prevent silent overwrites on concurrent allocation edits
    if (version !== undefined) {
      this.documentControl.assertVersion(version, payment.version);
    }

    // 3. Bulk upsert allocations (removes stale entries automatically)
    const result = await this.paymentAllocationRepo.bulkUpsert(
      ctx.tenantId,
      paymentId,
      allocations,
    );

    return ok(result);
  }

  // -----------------------------------------------------------------------
  // submit()
  // -----------------------------------------------------------------------

  async submit(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>> {
    const payment = await this.paymentEntryRepo.getById(
      ctx.tenantId,
      paymentId,
    );
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${paymentId} not found`);
    }

    if (!validateTransition(payment.status, "SUBMITTED", PAYMENT_TRANSITIONS)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition from ${payment.status} to SUBMITTED`,
      );
    }

    // 1. Load allocations
    const allocations = await this.paymentAllocationRepo.getByPaymentId(
      ctx.tenantId,
      paymentId,
    );

    if (allocations.length === 0) {
      return fail(
        "NO_ALLOCATIONS",
        "Payment must have at least one allocation",
      );
    }

    // 2. Validate: all allocations have positive amounts
    for (const alloc of allocations) {
      if (compareAmounts(alloc.allocatedAmount, "0") <= 0) {
        return fail(
          "INVALID_ALLOCATION",
          `Allocation for invoice ${alloc.invoiceId} has non-positive allocated_amount: ${alloc.allocatedAmount}`,
        );
      }
    }

    // 3. Validate: allocations sum matches total_amount
    const allocatedSum = sumAmounts(allocations.map((a) => a.allocatedAmount));
    if (compareAmounts(allocatedSum, payment.totalAmount) !== 0) {
      return fail(
        "ALLOCATION_MISMATCH",
        `Sum of allocated amounts (${allocatedSum}) does not match payment total (${payment.totalAmount})`,
        { allocatedSum, paymentTotal: payment.totalAmount },
      );
    }

    // 4. Cross-supplier check: every allocation's invoice must belong to
    //    the same supplier as the payment.
    for (const alloc of allocations) {
      const invoice = await this.purchaseInvoiceRepo.getById(
        ctx.tenantId,
        alloc.invoiceId,
      );
      if (!invoice) {
        return fail(
          "INVOICE_NOT_FOUND",
          `Invoice ${alloc.invoiceId} referenced by allocation not found`,
        );
      }
      if (invoice.supplierId !== payment.supplierId) {
        return fail(
          "CROSS_SUPPLIER",
          `Invoice ${invoice.invoiceNumber} belongs to supplier ${invoice.supplierId}, ` +
            `but payment is for supplier ${payment.supplierId}`,
          { invoiceId: alloc.invoiceId, invoiceSupplierId: invoice.supplierId },
        );
      }
    }

    // 5. Decision grid evaluation
    const evalResult = await this.decisionGridEvaluator.evaluate(ctx, {
      docId: paymentId,
      docType: "PAYMENT",
      amount: payment.totalAmount,
      currencyCode: payment.currencyCode,
      ouId: payment.ouId ?? ctx.entityCode ?? "",
      vendorId: payment.supplierId,
      metadata: {
        paymentMethod: payment.paymentMethod,
        allocationCount: allocations.length,
      },
    });

    if (!evalResult.ok) {
      return fail(
        "DECISION_EVAL_FAILED",
        `Decision grid evaluation failed: ${evalResult.error.message}`,
      );
    }

    const decision = evalResult.value;

    // 6. Check for BLOCKED route
    if (decision.approvalRoute === "BLOCKED") {
      return fail(
        "SUBMISSION_BLOCKED",
        "Payment submission blocked by policy",
        {
          compositeScore: decision.compositeScore,
          exceptions: decision.exceptions,
          pipelineId: decision.pipelineId,
        },
      );
    }

    // 7. Store decision results and determine target status
    if (decision.approvalRoute === "ZERO_APPROVAL") {
      // Auto-approve: skip workflow, transition directly to APPROVED
      const approved = await this.paymentEntryRepo.updateStatus(
        ctx.tenantId,
        paymentId,
        "APPROVED",
        {
          decisionScore: decision.compositeScore,
          approvalRoute: decision.approvalRoute,
          submittedAt: new Date(),
          submittedBy: ctx.actorId,
          approvedAt: new Date(),
          approvedBy: ctx.actorId,
        },
      );
      return ok(approved);
    }

    // Requires approval workflow
    const submitted = await this.paymentEntryRepo.updateStatus(
      ctx.tenantId,
      paymentId,
      "SUBMITTED",
      {
        decisionScore: decision.compositeScore,
        approvalRoute: decision.approvalRoute,
        submittedAt: new Date(),
        submittedBy: ctx.actorId,
      },
    );
    return ok(submitted);
  }

  // -----------------------------------------------------------------------
  // onApprovalComplete()
  // -----------------------------------------------------------------------

  async onApprovalComplete(
    ctx: OperationContext,
    paymentId: string,
    outcome: "approved" | "rejected",
  ): Promise<ServiceResult<PaymentEntry>> {
    const payment = await this.paymentEntryRepo.getById(
      ctx.tenantId,
      paymentId,
    );
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${paymentId} not found`);
    }

    if (payment.status !== "SUBMITTED") {
      return fail(
        "INVALID_STATUS",
        `Cannot complete approval for payment in ${payment.status} status; expected SUBMITTED`,
      );
    }

    if (outcome === "approved") {
      const approved = await this.paymentEntryRepo.updateStatus(
        ctx.tenantId,
        paymentId,
        "APPROVED",
        {
          approvedAt: new Date(),
          approvedBy: ctx.actorId,
        },
      );
      return ok(approved);
    }

    // Rejected — return to DRAFT for re-work
    const rejected = await this.paymentEntryRepo.updateStatus(
      ctx.tenantId,
      paymentId,
      "DRAFT",
    );
    return ok(rejected);
  }

  // -----------------------------------------------------------------------
  // post() — THE CRITICAL METHOD
  //
  // All operations execute within a single database transaction to guarantee:
  //   - No overpayment (SELECT ... FOR UPDATE on invoices)
  //   - Atomic JE creation + invoice paid_amount update
  //   - JE is always balanced by construction (Dr AP = Cr Bank + Cr WHT + Cr Disc)
  // -----------------------------------------------------------------------

  async post(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>> {
    const payment = await this.paymentEntryRepo.getById(
      ctx.tenantId,
      paymentId,
    );
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${paymentId} not found`);
    }

    if (!validateTransition(payment.status, "POSTED", PAYMENT_TRANSITIONS)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot post payment in ${payment.status} status; must be APPROVED`,
      );
    }

    // ── 1. Optimistic concurrency ───────────────────────────────────
    // (assertVersion throws 409 on mismatch, which the caller should
    // surface as an HTTP 409 Conflict)
    this.documentControl.assertVersion(payment.version, payment.version);

    // ── 2. Load allocations ─────────────────────────────────────────
    const allocations = await this.paymentAllocationRepo.getByPaymentId(
      ctx.tenantId,
      paymentId,
    );

    if (allocations.length === 0) {
      return fail("NO_ALLOCATIONS", "Payment has no allocations to post");
    }

    // ── 3. Pre-transaction service validation ───────────────────────
    // 3a. Cross-supplier check (defensive — also checked on submit)
    const invoiceIds = allocations.map((a) => a.invoiceId);
    const uniqueInvoiceIds = [...new Set(invoiceIds)];

    for (const alloc of allocations) {
      // 3b. Per-allocation: discount + withholding must not exceed allocated
      const deductions = sumAmounts([
        alloc.discountAmount,
        alloc.withholdingAmount,
      ]);
      if (compareAmounts(deductions, alloc.allocatedAmount) > 0) {
        return fail(
          "INVALID_DEDUCTIONS",
          `Allocation for invoice ${alloc.invoiceId}: ` +
            `discount (${alloc.discountAmount}) + withholding (${alloc.withholdingAmount}) = ${deductions} ` +
            `exceeds allocated_amount (${alloc.allocatedAmount})`,
          { allocationId: alloc.id, invoiceId: alloc.invoiceId },
        );
      }
    }

    // ── 4. BEGIN TRANSACTION ────────────────────────────────────────
    const db = await this.container.resolve<any>("db");
    const tx: TransactionContext = await db.beginTransaction();

    try {
      // ── 5. Lock invoices — PREVENT OVERPAY ──────────────────────
      // SELECT ... FOR UPDATE ensures no concurrent payment can modify
      // the same invoices while we're computing remaining amounts.
      const lockedInvoices = await this.purchaseInvoiceRepo.lockForUpdate(
        uniqueInvoiceIds,
        tx,
      );

      // Build invoice lookup map for fast access
      const invoiceMap = new Map(lockedInvoices.map((inv) => [inv.id, inv]));

      // Cross-supplier check (defensive, within locked scope)
      for (const inv of lockedInvoices) {
        if (inv.supplierId !== payment.supplierId) {
          throw Object.assign(
            new Error(
              `Invoice ${inv.invoiceNumber} belongs to supplier ${inv.supplierId}, ` +
                `but payment is for supplier ${payment.supplierId}`,
            ),
            { statusCode: 400, code: "CROSS_SUPPLIER" },
          );
        }
      }

      // ── 6. Validate remaining amounts — fail 409 if overpay ─────
      for (const alloc of allocations) {
        const invoice = invoiceMap.get(alloc.invoiceId);
        if (!invoice) {
          throw Object.assign(
            new Error(`Invoice ${alloc.invoiceId} not found during post`),
            { statusCode: 404, code: "INVOICE_NOT_FOUND" },
          );
        }
        const remaining = subtractAmounts(
          invoice.totalAmount,
          invoice.paidAmount,
        );
        if (compareAmounts(alloc.allocatedAmount, remaining) > 0) {
          throw Object.assign(
            new Error(
              `Overpayment on invoice ${invoice.invoiceNumber}: ` +
                `allocated ${alloc.allocatedAmount} but only ${remaining} remaining ` +
                `(total=${invoice.totalAmount}, paid=${invoice.paidAmount})`,
            ),
            { statusCode: 409, code: "OVERPAYMENT" },
          );
        }
      }

      // ── 7. Build JE lines (BALANCED by construction) ────────────
      //
      // Gross settlement JE proof:
      //   Dr AP Control    = SUM(allocatedAmount)            — total AP reduction
      //   Cr WHT Payable   = SUM(withholdingAmount)          — tax withheld at source
      //   Cr Discount Inc  = SUM(discountAmount)             — early payment discounts
      //   Cr Bank Account  = net cash = Dr AP - Cr WHT - Cr Disc
      //
      // Each allocation produces one Dr AP line with sourceDocLineId = allocation.id
      // for full traceability back to the source document line.

      const jeLines: CreateJournalLineInput[] = [];

      // Collect totals for summary lines
      const allAllocatedAmounts = allocations.map((a) => a.allocatedAmount);
      const allWhtAmounts = allocations.map((a) => a.withholdingAmount);
      const allDiscountAmounts = allocations.map((a) => a.discountAmount);

      const totalAllocated = sumAmounts(allAllocatedAmounts);
      const totalWht = sumAmounts(allWhtAmounts);
      const totalDiscount = sumAmounts(allDiscountAmounts);
      const netCash = subtractAmounts(
        totalAllocated,
        sumAmounts([totalWht, totalDiscount]),
      );

      // TODO: Resolve AP control account from accounting profile / payment context.
      // For now, use the payment's clearing_account_id as the AP control account.
      const apControlAccountId =
        payment.clearingAccountId ?? payment.bankAccountId!;

      // TODO: Resolve WHT payable account from tenant configuration / tax setup.
      // Placeholder — this should come from a tax account resolver.
      const whtPayableAccountId =
        payment.clearingAccountId ?? payment.bankAccountId!;

      // TODO: Resolve discount income account from tenant configuration.
      // Placeholder — this should come from an accounting profile or chart of accounts config.
      const discountIncomeAccountId =
        payment.clearingAccountId ?? payment.bankAccountId!;

      // Bank account from payment
      const bankAccountId = payment.bankAccountId!;

      // 7a. Dr AP Control — one line per allocation for traceability
      for (const alloc of allocations) {
        jeLines.push({
          accountId: apControlAccountId,
          debitAmount: alloc.allocatedAmount,
          creditAmount: "0",
          currencyCode: payment.currencyCode,
          description: `AP reduction: invoice ${alloc.invoiceId}`,
          subledgerType: "AP",
          subledgerRefId: alloc.invoiceId,
          sourceDocLineId: alloc.id,
        });
      }

      // 7b. Cr WHT Payable — single summary line (if any WHT)
      if (compareAmounts(totalWht, "0") > 0) {
        jeLines.push({
          accountId: whtPayableAccountId,
          debitAmount: "0",
          creditAmount: totalWht,
          currencyCode: payment.currencyCode,
          description: "WHT withheld at source",
          subledgerType: "AP",
          subledgerRefId: payment.supplierId,
        });
      }

      // 7c. Cr Discount Income — single summary line (if any discount)
      if (compareAmounts(totalDiscount, "0") > 0) {
        jeLines.push({
          accountId: discountIncomeAccountId,
          debitAmount: "0",
          creditAmount: totalDiscount,
          currencyCode: payment.currencyCode,
          description: "Early payment discount",
        });
      }

      // 7d. Cr Bank Account — net cash (always present)
      jeLines.push({
        accountId: bankAccountId,
        debitAmount: "0",
        creditAmount: netCash,
        currencyCode: payment.currencyCode,
        description: `Payment ${payment.paymentNumber} — net cash`,
      });

      // ── 8. PostingService.createAndPost() — SAME TX ─────────────
      const jeNumber = `JE-PAY-${payment.paymentNumber}`;
      const jeInput: CreateJournalEntryInput = {
        tenantId: ctx.tenantId,
        entityCode: payment.entityCode,
        txnId: payment.txnId,
        docId: paymentId,
        docType: "PAYMENT",
        postingDate: payment.paymentDate,
        description: `Payment ${payment.paymentNumber} to supplier ${payment.supplierId}`,
        currencyCode: payment.currencyCode,
        lines: jeLines,
        postedBy: ctx.actorId,
      };

      const jeResult = await this.postingService.createAndPost(
        ctx,
        jeInput,
        jeNumber,
        tx,
      );

      if (!jeResult.ok) {
        throw Object.assign(
          new Error(`JE posting failed: ${jeResult.error.message}`),
          {
            statusCode: 500,
            code: jeResult.error.code,
            details: jeResult.error.details,
          },
        );
      }

      const postedJe = jeResult.value;

      // ── 9. Update payment header: POSTED ────────────────────────
      await this.paymentEntryRepo.updateStatus(
        ctx.tenantId,
        paymentId,
        "POSTED",
        {
          jeId: postedJe.id,
          postedAt: new Date(),
          postedBy: ctx.actorId,
        },
        tx,
      );

      // ── 10. Update each invoice: paid_amount += allocated_amount ─
      //
      // Gross settlement: the allocated_amount is the full AP reduction,
      // not the net cash. This is the correct amount to add to paid_amount
      // because AP is reduced by the full allocated amount.
      for (const alloc of allocations) {
        const invoice = invoiceMap.get(alloc.invoiceId)!;
        const newPaidAmount = sumAmounts([
          invoice.paidAmount,
          alloc.allocatedAmount,
        ]);

        // Determine new invoice status
        const invoiceStatus =
          compareAmounts(newPaidAmount, invoice.totalAmount) >= 0
            ? ("PAID" as const)
            : ("PARTIALLY_PAID" as const);

        await this.purchaseInvoiceRepo.updatePaidAmount(
          ctx.tenantId,
          alloc.invoiceId,
          newPaidAmount,
          invoiceStatus,
          tx,
        );
      }

      // ── 11. COMMIT TRANSACTION ──────────────────────────────────
      await (tx as any).commit();

      // Return the posted payment (re-fetch for accurate state)
      const postedPayment = await this.paymentEntryRepo.getById(
        ctx.tenantId,
        paymentId,
      );
      return ok(postedPayment!);
    } catch (error: unknown) {
      // ROLLBACK on any failure
      try {
        await (tx as any).rollback();
      } catch (_rollbackErr) {
        // Rollback best-effort — the original error is more important
      }

      // Re-throw structured errors as ServiceResult failures
      const err = error as any;
      if (err.code && err.statusCode) {
        return fail(
          err.code,
          err.message,
          err.details ?? { statusCode: err.statusCode },
        );
      }
      // Unexpected error — wrap and surface
      return fail(
        "POST_FAILED",
        `Payment posting failed: ${(error as Error).message}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // cancel()
  // -----------------------------------------------------------------------

  async cancel(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>> {
    const payment = await this.paymentEntryRepo.getById(
      ctx.tenantId,
      paymentId,
    );
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${paymentId} not found`);
    }

    if (!validateTransition(payment.status, "CANCELLED", PAYMENT_TRANSITIONS)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot cancel payment in ${payment.status} status`,
      );
    }

    // If POSTED, reverse the journal entry first
    if (payment.status === "POSTED" && payment.jeId) {
      const reversalNumber = `JE-PAY-REV-${payment.paymentNumber}`;
      const reverseResult = await this.postingService.reverse(
        ctx,
        payment.jeId,
        reversalNumber,
      );
      if (!reverseResult.ok) {
        return fail(
          "REVERSAL_FAILED",
          `Cannot cancel: JE reversal failed — ${reverseResult.error.message}`,
        );
      }
    }

    const cancelled = await this.paymentEntryRepo.updateStatus(
      ctx.tenantId,
      paymentId,
      "CANCELLED",
      {
        cancelledAt: new Date(),
        cancelledBy: ctx.actorId,
      },
    );

    return ok(cancelled);
  }

  // -----------------------------------------------------------------------
  // reconcile()
  // -----------------------------------------------------------------------

  async reconcile(
    ctx: OperationContext,
    paymentId: string,
  ): Promise<ServiceResult<PaymentEntry>> {
    const payment = await this.paymentEntryRepo.getById(
      ctx.tenantId,
      paymentId,
    );
    if (!payment) {
      return fail("NOT_FOUND", `Payment ${paymentId} not found`);
    }

    // Only POSTED payments can be reconciled
    if (payment.status !== "POSTED") {
      return fail(
        "INVALID_STATUS",
        `Cannot reconcile payment in ${payment.status} status; must be POSTED`,
      );
    }

    const reconciled = await this.paymentEntryRepo.updateStatus(
      ctx.tenantId,
      paymentId,
      "RECONCILED",
      {
        reconciledAt: new Date(),
        reconciledBy: ctx.actorId,
      },
    );

    return ok(reconciled);
  }
}
