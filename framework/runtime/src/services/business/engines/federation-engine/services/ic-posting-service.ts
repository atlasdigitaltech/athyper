// framework/runtime/src/services/business/engines/federation-engine/services/ic-posting-service.ts
//
// Creates mirror JE pairs for intercompany transactions.
// Source entity already has a JE from normal posting; this service
// creates the destination entity's mirror JE and links both to the
// IC transaction record.

import { ok, fail } from "../../shared/engine-base.js";
import { translateAmount } from "../domain/fx-translator.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { IntercompanyTransaction } from "../domain/types.js";
import type { ICTransactionRepo } from "../persistence/ic-transaction-repo.js";
import type { LegalEntityRepo } from "../persistence/legal-entity-repo.js";
import type { PostingService } from "../../posting-engine/services/posting-service.js";
import type { DocumentControl } from "../../../finance/shared/document-control.js";
import type { CreateJournalEntryInput, CreateJournalLineInput } from "../../posting-engine/domain/types.js";

// ---------------------------------------------------------------------------
// IC Account Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the GL account IDs for intercompany postings.
 * In a full implementation, these would come from the accounting profile
 * or a dedicated IC account mapping table.
 */
export interface ICAccountResolver {
    /** IC Receivable account for the destination entity */
    getICReceivableAccountId(entityCode: string): Promise<string>;
    /** IC Revenue account for the destination entity */
    getICRevenueAccountId(entityCode: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// FX Rate Provider
// ---------------------------------------------------------------------------

export interface FxRateProvider {
    /** Get the exchange rate between two currencies as of a date */
    getRate(fromCurrency: string, toCurrency: string, asOfDate: Date): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// IC Posting Service
// ---------------------------------------------------------------------------

export interface ICPostingService {
    /**
     * Create the mirror JE for a destination entity given an existing
     * IC transaction. The source JE is already created by normal posting.
     *
     * JE Pair Structure:
     *   Source Entity: Dr Expense, Cr AP           (already exists)
     *   Dest Entity:  Dr IC Receivable, Cr IC Revenue  (created here)
     */
    createMirrorJE(
        ctx: OperationContext,
        icTransactionId: string,
        sourceJeId: string,
        postingDate: Date,
    ): Promise<ServiceResult<{ destJeId: string; icTransaction: IntercompanyTransaction }>>;
}

export class DefaultICPostingService implements ICPostingService {
    constructor(
        private readonly icRepo: ICTransactionRepo,
        private readonly entityRepo: LegalEntityRepo,
        private readonly postingService: PostingService,
        private readonly documentControl: DocumentControl,
        private readonly accountResolver: ICAccountResolver,
        private readonly fxRateProvider: FxRateProvider,
    ) {}

    async createMirrorJE(
        ctx: OperationContext,
        icTransactionId: string,
        sourceJeId: string,
        postingDate: Date,
    ): Promise<ServiceResult<{ destJeId: string; icTransaction: IntercompanyTransaction }>> {
        // ── Step 1: Load IC transaction ──
        const icTxn = await this.icRepo.getById(ctx.tenantId, icTransactionId);
        if (!icTxn) {
            return fail("IC_TXN_NOT_FOUND", `IC transaction ${icTransactionId} not found`);
        }

        if (icTxn.destJeId) {
            return fail("ALREADY_MIRRORED", `IC transaction ${icTransactionId} already has a mirror JE`);
        }

        // ── Step 2: Validate destination entity ──
        const destEntity = await this.entityRepo.getByCode(ctx.tenantId, icTxn.destEntityCode);
        if (!destEntity) {
            return fail("DEST_ENTITY_NOT_FOUND", `Destination entity ${icTxn.destEntityCode} not found`);
        }

        // ── Step 3: FX translation (if currencies differ) ──
        let destAmount = icTxn.amount;
        let destCurrency = icTxn.currencyCode;

        if (destEntity.functionalCurrency !== icTxn.currencyCode) {
            const rate = await this.fxRateProvider.getRate(
                icTxn.currencyCode, destEntity.functionalCurrency, postingDate,
            );
            if (!rate) {
                return fail("FX_RATE_NOT_FOUND",
                    `No FX rate found for ${icTxn.currencyCode} → ${destEntity.functionalCurrency}`);
            }
            destAmount = translateAmount(icTxn.amount, rate);
            destCurrency = destEntity.functionalCurrency;
        }

        // ── Step 4: Resolve IC accounts ──
        const icReceivableAccountId = await this.accountResolver.getICReceivableAccountId(icTxn.destEntityCode);
        const icRevenueAccountId = await this.accountResolver.getICRevenueAccountId(icTxn.destEntityCode);

        // ── Step 5: Build mirror JE lines ──
        // Dest Entity:  Dr IC Receivable, Cr IC Revenue
        const mirrorLines: CreateJournalLineInput[] = [
            {
                accountId: icReceivableAccountId,
                debitAmount: destAmount,
                creditAmount: "0",
                currencyCode: destCurrency,
                description: `IC Receivable from ${icTxn.sourceEntityCode}`,
                subledgerType: null,
            },
            {
                accountId: icRevenueAccountId,
                debitAmount: "0",
                creditAmount: destAmount,
                currencyCode: destCurrency,
                description: `IC Revenue from ${icTxn.sourceEntityCode}`,
                subledgerType: null,
            },
        ];

        // ── Step 6: Post mirror JE ──
        const jeNumber = await this.documentControl.generateNumber(
            ctx.tenantId, icTxn.destEntityCode, "JE-IC",
        );

        const jeInput: CreateJournalEntryInput = {
            tenantId: ctx.tenantId,
            entityCode: icTxn.destEntityCode,
            txnId: icTxn.id, // Same txnId links both sides
            docId: icTxn.id,
            docType: "INTERCOMPANY_MIRROR",
            postingDate,
            description: `IC Mirror: ${icTxn.sourceEntityCode} → ${icTxn.destEntityCode}`,
            currencyCode: destCurrency,
            lines: mirrorLines,
            postedBy: ctx.actorId,
            idempotencyKey: `ic-mirror:${icTxn.id}`,
        };

        const postResult = await this.postingService.createAndPost(ctx, jeInput, jeNumber);
        if (!postResult.ok) {
            return fail(postResult.error.code, `Mirror JE posting failed: ${postResult.error.message}`);
        }

        const destJe = postResult.value;

        // ── Step 7: Link both JE IDs to IC transaction ──
        const updated = await this.icRepo.updateStatus(ctx.tenantId, icTransactionId, "POSTED", {
            sourceJeId,
            destJeId: destJe.id,
        });

        return ok({ destJeId: destJe.id, icTransaction: updated });
    }
}
