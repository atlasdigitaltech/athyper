"use client";

// components/finance/GLBalanceReportContainer.tsx
//
// Container component connecting the useGLReport hook to the GLBalanceReport
// presentational component. Handles type mapping between backend DTOs and
// the component's local types.

import { useMemo } from "react";
import { useGLReport } from "@/lib/finance/use-gl-report";
import { GLBalanceReport } from "./GLBalanceReport";
import type { GLReportFilters, GLSummaryRowDTO, GLDetailRowDTO, TrialBalanceRowDTO } from "@/lib/finance/types";

interface GLBalanceReportContainerProps {
    entityCode: string;
    fiscalYear: number;
    periodNumber?: number;
    currencyCode?: string;
}

/**
 * Map backend GLSummaryRowDTO → component's GLSummaryRow format.
 * Backend uses openingDebit/openingCredit; component uses openingBalance.
 */
function mapSummaryRow(dto: GLSummaryRowDTO) {
    // Net opening = debit - credit (debit-normal convention)
    const openingBalance = netAmount(dto.openingDebit, dto.openingCredit);
    const closingBalance = netAmount(dto.closingDebit, dto.closingCredit);

    return {
        accountId: dto.accountCode,
        accountName: dto.accountName,
        openingBalance,
        totalDebits: dto.periodDebit,
        totalCredits: dto.periodCredit,
        closingBalance,
        movementCount: 0, // Not available from backend summary
    };
}

/**
 * Map backend GLDetailRowDTO → component's GLDetailRow format.
 */
function mapDetailRow(dto: GLDetailRowDTO) {
    return {
        journalEntryId: dto.jeId,
        jeNumber: dto.jeNumber,
        postingDate: dto.postingDate,
        description: dto.description ?? "",
        debitAmount: dto.debitAmount,
        creditAmount: dto.creditAmount,
        runningBalance: "0", // Running balance computed client-side if needed
        docType: dto.docType,
        docId: dto.docId,
    };
}

/**
 * Map backend TrialBalanceRowDTO → component's TrialBalanceRow format.
 */
function mapTrialBalanceRow(dto: TrialBalanceRowDTO) {
    return {
        accountId: dto.accountCode,
        accountName: dto.accountName,
        accountType: dto.accountType,
        debitBalance: dto.debitBalance,
        creditBalance: dto.creditBalance,
    };
}

/** Simple net amount: debit - credit. Returns "0" if both are "0". */
function netAmount(debit: string, credit: string): string {
    const d = parseFloat(debit || "0");
    const c = parseFloat(credit || "0");
    return (d - c).toFixed(2);
}

function sumField(rows: Array<Record<string, string | number>>, field: string): string {
    let total = 0;
    for (const row of rows) {
        total += parseFloat(String(row[field] ?? "0"));
    }
    return total.toFixed(2);
}

export function GLBalanceReportContainer({
    entityCode,
    fiscalYear,
    periodNumber,
    currencyCode = "USD",
}: GLBalanceReportContainerProps) {
    const initialFilters: GLReportFilters = {
        entityCode,
        fiscalYear,
        periodNumber,
    };

    const {
        summaryRows,
        detailRows,
        trialBalanceRows,
        loading,
        error,
        filters,
        setFilters,
        activeTab,
        setActiveTab,
    } = useGLReport(initialFilters);

    // Map DTOs to component types
    const mappedSummary = useMemo(() => summaryRows.map(mapSummaryRow), [summaryRows]);
    const mappedDetail = useMemo(() => detailRows.map(mapDetailRow), [detailRows]);
    const mappedTrialBalance = useMemo(() => trialBalanceRows.map(mapTrialBalanceRow), [trialBalanceRows]);

    // Compute totals
    const summaryTotals = useMemo(() => ({
        totalDebits: sumField(mappedSummary, "totalDebits"),
        totalCredits: sumField(mappedSummary, "totalCredits"),
        totalOpening: sumField(mappedSummary, "openingBalance"),
        totalClosing: sumField(mappedSummary, "closingBalance"),
    }), [mappedSummary]);

    const trialBalanceTotals = useMemo(() => ({
        totalDebits: sumField(mappedTrialBalance, "debitBalance"),
        totalCredits: sumField(mappedTrialBalance, "creditBalance"),
    }), [mappedTrialBalance]);

    const trialBalanceIsBalanced = trialBalanceTotals.totalDebits === trialBalanceTotals.totalCredits;

    if (error) {
        return (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                Failed to load GL report: {error}
            </div>
        );
    }

    return (
        <GLBalanceReport
            summaryRows={mappedSummary}
            detailRows={mappedDetail}
            trialBalanceRows={mappedTrialBalance}
            summaryTotals={summaryTotals}
            trialBalanceTotals={trialBalanceTotals}
            trialBalanceIsBalanced={trialBalanceIsBalanced}
            reversalMode={filters.reversalMode ?? "NETTED"}
            onReversalModeChange={(mode) => setFilters({ ...filters, reversalMode: mode })}
            currencyCode={currencyCode}
            loading={loading}
        />
    );
}
