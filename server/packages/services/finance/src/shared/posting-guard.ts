import { FinanceContractError, type FinanceActor, type FinanceCoordinates, type FinanceFoundationReader, type FinancePermissionChecker, type PeriodAdmission, type PostingAdmission, type PostingGuardRequest } from "@athyper/server-contract-finance";
import { canonicalFinanceHash } from "./canonical.js";
import { RoundingResolver } from "./rounding-resolver.js";

export class FinancePostingGuard {
  constructor(private readonly reader: FinanceFoundationReader, private readonly permissions: FinancePermissionChecker, private readonly rounding: RoundingResolver) {}

  async admit(request: PostingGuardRequest): Promise<PostingAdmission> {
    if (!(await this.permissions.isAllowed(request.actor, request.permissionCode))) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    const { tenantId } = request.actor;
    const { book, period, currency } = await this.assertPeriodOpen(request.actor, request.coordinates);
    const source = await this.reader.getSourceDocument(request.actor, request.source.sourceType, request.source.sourceId, request.source.version);
    if (!source || source.hash !== request.source.hash) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Immutable source-document evidence does not match");
    const rounding = await this.rounding.resolve({ tenantId, actor: request.actor, companyCodeId: request.coordinates.companyCodeId, currencyCode: request.coordinates.currencyCode, slot: request.roundingSlot });
    const admission = { coordinates: request.coordinates, book, period, currency, rounding, source };
    return { ...admission, evidenceHash: canonicalFinanceHash(admission) };
  }

  async assertPeriodOpen(actor: FinanceActor, coordinates: FinanceCoordinates): Promise<PeriodAdmission> {
    const book = await this.reader.getLedgerBook(actor, coordinates.companyCodeId, coordinates.ledgerBookId);
    if (!book || !book.active) throw new FinanceContractError("FINANCE_NOT_FOUND", "Active ledger book assignment was not found");
    if (book.companyCodeId !== coordinates.companyCodeId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Ledger book is not assigned to the requested company");
    const period = await this.reader.getBookPeriod(actor, coordinates.ledgerBookId, coordinates.fiscalPeriodId);
    if (!period || period.companyCodeId !== coordinates.companyCodeId || period.ledgerBookId !== coordinates.ledgerBookId || period.fiscalPeriodId !== coordinates.fiscalPeriodId) throw new FinanceContractError("FINANCE_NOT_FOUND", "Book period was not found for the requested coordinates");
    if (period.status !== "open") throw new FinanceContractError("FINANCE_PERIOD_CLOSED", `Posting is blocked while period status is ${period.status}`);
    const currency = await this.reader.getCurrency(actor, coordinates.currencyCode);
    if (!currency || !currency.active) throw new FinanceContractError("FINANCE_NOT_FOUND", "Active transaction currency was not found");
    return { book, period, currency };
  }
}
