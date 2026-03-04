"use client";

// components/finance/BankReconciliation.tsx
//
// Bank reconciliation workspace with statement header, match statistics,
// and split-view table for bank lines and matched payment details.
// MC-4 compliant: all monetary values are opaque strings.

import { Badge, Button, Separator } from "@neon/ui";
import { cn } from "@/lib/utils";
import { Check, Link2, Link2Off, Play, X } from "lucide-react";
import { useCallback, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────

interface StatementInfo {
    id: string;
    statementNumber: string;
    bankName: string | null;
    statementDate: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: string;
    closingBalance: string;
    currencyCode: string;
    status: string;
}

interface StatementLine {
    id: string;
    lineNo: number;
    transactionDate: string;
    amount: string;
    direction: "DEBIT" | "CREDIT";
    reference: string | null;
    description: string | null;
    counterparty: string | null;
    matchStatus: string;
    matchConfidence: number | null;
    matchedPaymentId: string | null;
}

interface ReconciliationSession {
    id: string;
    status: string;
    totalLines: number;
    autoMatched: number;
    manualMatched: number;
    unmatched: number;
    excluded: number;
    discrepancy: string;
}

interface BankReconciliationProps {
    statement: StatementInfo;
    lines: StatementLine[];
    session: ReconciliationSession | null;
    onAutoMatch?: () => void;
    onManualMatch?: (lineId: string, paymentId: string) => void;
    onUnmatch?: (lineId: string) => void;
    onComplete?: () => void;
    mode?: "view" | "reconcile";
}

// ── Helpers ──────────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

const MATCH_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    UNMATCHED: {
        label: "Unmatched",
        className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
    },
    AUTO_MATCHED: {
        label: "Auto",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    },
    MANUAL_MATCHED: {
        label: "Manual",
        className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
    },
    CONFIRMED: {
        label: "Confirmed",
        className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
    EXCLUDED: {
        label: "Excluded",
        className: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    },
};

const SESSION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    OPEN: {
        label: "Open",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    },
    COMPLETED: {
        label: "Completed",
        className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
    },
    CANCELLED: {
        label: "Cancelled",
        className: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    },
};

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function formatAmount(value: string, currencyCode: string): string {
    try {
        const num = Number(value);
        if (Number.isNaN(num)) return value;
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    } catch {
        return value;
    }
}

function isMatchedStatus(status: string): boolean {
    return status === "AUTO_MATCHED" || status === "MANUAL_MATCHED" || status === "CONFIRMED";
}

// ── Component ────────────────────────────────────────────────────────

export function BankReconciliation({
    statement,
    lines,
    session,
    onAutoMatch,
    onManualMatch,
    onUnmatch,
    onComplete,
    mode = "view",
}: BankReconciliationProps) {
    const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
    const isReconcile = mode === "reconcile";

    const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null;

    const handleRowClick = useCallback(
        (line: StatementLine) => {
            if (!isReconcile) return;
            setSelectedLineId((prev) => (prev === line.id ? null : line.id));
        },
        [isReconcile],
    );

    const discrepancyIsZero = session?.discrepancy === "0" || session?.discrepancy === "0.00" || session?.discrepancy === "0.0000";

    return (
        <div className="space-y-4">
            {/* ── Header ── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold">
                            Statement {statement.statementNumber}
                        </h2>
                        {session && (
                            <Badge
                                variant="outline"
                                className={cn("text-xs", (SESSION_STATUS_CONFIG[session.status] ?? SESSION_STATUS_CONFIG.OPEN).className)}
                            >
                                {(SESSION_STATUS_CONFIG[session.status] ?? SESSION_STATUS_CONFIG.OPEN).label}
                            </Badge>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {statement.bankName && <span>{statement.bankName}</span>}
                        <span>Period: {formatDate(statement.periodStart)} \u2013 {formatDate(statement.periodEnd)}</span>
                        <span>Date: {formatDate(statement.statementDate)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Opening:</span>
                        <span className="font-mono tabular-nums font-medium">
                            {formatAmount(statement.openingBalance, statement.currencyCode)}
                        </span>
                        <span className="text-muted-foreground">Closing:</span>
                        <span className="font-mono tabular-nums font-medium">
                            {formatAmount(statement.closingBalance, statement.currencyCode)}
                        </span>
                    </div>
                </div>

                {isReconcile && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onAutoMatch}>
                            <Play className="size-3.5 mr-1" />
                            Auto Match
                        </Button>
                        <Button size="sm" onClick={onComplete}>
                            <Check className="size-3.5 mr-1" />
                            Complete
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Stats Bar ── */}
            {session && (
                <>
                    <Separator />
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <StatPill label="Total Lines" value={session.totalLines} />
                        <StatPill
                            label="Auto Matched"
                            value={session.autoMatched}
                            className="border-blue-600/30 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                        />
                        <StatPill
                            label="Manual Matched"
                            value={session.manualMatched}
                            className="border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                        />
                        <StatPill
                            label="Unmatched"
                            value={session.unmatched}
                            className="border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                        />
                        <StatPill
                            label="Excluded"
                            value={session.excluded}
                            className="border-gray-400/30 bg-gray-50 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400"
                        />
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-xs tabular-nums",
                                discrepancyIsZero
                                    ? "border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                                    : "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
                            )}
                        >
                            Discrepancy: {formatAmount(session.discrepancy, statement.currencyCode)}
                        </Badge>
                    </div>
                </>
            )}

            {/* ── Split View ── */}
            <Separator />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Left: Bank Statement Lines Table (2/3 width) */}
                <div className="lg:col-span-2">
                    <h4 className="mb-2 text-sm font-medium">Bank Statement Lines</h4>
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="w-10 px-3 py-2 text-right text-xs font-medium text-muted-foreground">#</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                                    <th className="w-16 px-3 py-2 text-center text-xs font-medium text-muted-foreground">Dir</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reference</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Counterparty</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Match Status</th>
                                    <th className="w-20 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Confidence</th>
                                    {isReconcile && <th className="w-24 px-3 py-2 text-center text-xs font-medium text-muted-foreground">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length === 0 && (
                                    <tr>
                                        <td colSpan={isReconcile ? 9 : 8} className="px-3 py-8 text-center text-muted-foreground">
                                            No statement lines.
                                        </td>
                                    </tr>
                                )}
                                {lines.map((line) => {
                                    const matchConfig = MATCH_STATUS_CONFIG[line.matchStatus] ?? MATCH_STATUS_CONFIG.UNMATCHED;
                                    const isSelected = selectedLineId === line.id;
                                    const isDebit = line.direction === "DEBIT";

                                    return (
                                        <tr
                                            key={line.id}
                                            className={cn(
                                                "border-b last:border-b-0 transition-colors",
                                                isReconcile && "cursor-pointer",
                                                isSelected
                                                    ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                                                    : "hover:bg-muted/30",
                                            )}
                                            onClick={() => handleRowClick(line)}
                                        >
                                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{line.lineNo}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{formatDate(line.transactionDate)}</td>
                                            <td className={cn(
                                                "px-3 py-2",
                                                amountCell,
                                                "font-medium",
                                                isDebit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400",
                                            )}>
                                                {formatAmount(line.amount, statement.currencyCode)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "text-[10px]",
                                                        isDebit
                                                            ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400"
                                                            : "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400",
                                                    )}
                                                >
                                                    {line.direction}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs">{line.reference ?? "\u2014"}</td>
                                            <td className="px-3 py-2">{line.counterparty ?? "\u2014"}</td>
                                            <td className="px-3 py-2">
                                                <Badge variant="outline" className={cn("text-[10px]", matchConfig.className)}>
                                                    {matchConfig.label}
                                                </Badge>
                                            </td>
                                            <td className={cn("px-3 py-2", amountCell)}>
                                                {line.matchConfidence != null ? (
                                                    <Badge variant="secondary" className="text-[10px] tabular-nums">
                                                        {Math.round(line.matchConfidence * 100)}%
                                                    </Badge>
                                                ) : (
                                                    "\u2014"
                                                )}
                                            </td>
                                            {isReconcile && (
                                                <td className="px-3 py-2 text-center">
                                                    {isMatchedStatus(line.matchStatus) && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onUnmatch?.(line.id);
                                                            }}
                                                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                            aria-label={`Unmatch line ${line.lineNo}`}
                                                        >
                                                            <Link2Off className="size-3" />
                                                            Unmatch
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Matched Payment Details (1/3 width) */}
                <div className="lg:col-span-1">
                    <h4 className="mb-2 text-sm font-medium">Match Details</h4>
                    <div className="rounded-md border p-4">
                        {selectedLine ? (
                            <MatchDetailPanel
                                line={selectedLine}
                                currencyCode={statement.currencyCode}
                                isReconcile={isReconcile}
                                onManualMatch={onManualMatch}
                            />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                {isReconcile
                                    ? "Select a bank line to view or assign match details."
                                    : "Select a bank line to view match details."}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatPill({
    label,
    value,
    className,
}: {
    label: string;
    value: number;
    className?: string;
}) {
    return (
        <Badge
            variant="outline"
            className={cn("text-xs tabular-nums", className)}
        >
            {label}: {value}
        </Badge>
    );
}

function MatchDetailPanel({
    line,
    currencyCode,
    isReconcile,
    onManualMatch,
}: {
    line: StatementLine;
    currencyCode: string;
    isReconcile: boolean;
    onManualMatch?: (lineId: string, paymentId: string) => void;
}) {
    const matchConfig = MATCH_STATUS_CONFIG[line.matchStatus] ?? MATCH_STATUS_CONFIG.UNMATCHED;
    const isMatched = isMatchedStatus(line.matchStatus);

    return (
        <div className="space-y-4">
            {/* Line Summary */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Line #{line.lineNo}</span>
                    <Badge variant="outline" className={cn("text-[10px]", matchConfig.className)}>
                        {matchConfig.label}
                    </Badge>
                </div>
                <Separator />
                <DetailRow label="Date" value={formatDate(line.transactionDate)} />
                <DetailRow label="Amount" value={formatAmount(line.amount, currencyCode)} className={line.direction === "DEBIT" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"} />
                <DetailRow label="Direction" value={line.direction} />
                <DetailRow label="Reference" value={line.reference ?? "\u2014"} />
                <DetailRow label="Description" value={line.description ?? "\u2014"} />
                <DetailRow label="Counterparty" value={line.counterparty ?? "\u2014"} />
            </div>

            {/* Matched Payment Info */}
            {isMatched && line.matchedPaymentId && (
                <>
                    <Separator />
                    <div className="space-y-2">
                        <span className="text-xs font-medium text-muted-foreground">Matched Payment</span>
                        <div className="rounded-md bg-muted/50 p-3">
                            <div className="flex items-center gap-2">
                                <Link2 className="size-3.5 text-muted-foreground" />
                                <span className="font-mono text-xs">{line.matchedPaymentId}</span>
                            </div>
                            {line.matchConfidence != null && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Confidence:</span>
                                    <Badge variant="secondary" className="text-[10px] tabular-nums">
                                        {Math.round(line.matchConfidence * 100)}%
                                    </Badge>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Manual Match Prompt */}
            {isReconcile && !isMatched && (
                <>
                    <Separator />
                    <div className="rounded-md border border-dashed border-muted-foreground/30 p-3 text-center">
                        <p className="text-xs text-muted-foreground">
                            Enter a payment ID to manually match this bank line.
                        </p>
                        <ManualMatchInput lineId={line.id} onManualMatch={onManualMatch} />
                    </div>
                </>
            )}
        </div>
    );
}

function DetailRow({
    label,
    value,
    className,
}: {
    label: string;
    value: string;
    className?: string;
}) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
            <span className={cn("text-sm font-medium truncate text-right", className)}>{value}</span>
        </div>
    );
}

function ManualMatchInput({
    lineId,
    onManualMatch,
}: {
    lineId: string;
    onManualMatch?: (lineId: string, paymentId: string) => void;
}) {
    const [paymentId, setPaymentId] = useState("");

    return (
        <div className="mt-2 flex items-center gap-2">
            <input
                type="text"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                placeholder="Payment ID..."
                className="h-8 flex-1 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
                variant="outline"
                size="sm"
                disabled={!paymentId.trim()}
                onClick={() => {
                    if (paymentId.trim()) {
                        onManualMatch?.(lineId, paymentId.trim());
                        setPaymentId("");
                    }
                }}
            >
                <Link2 className="size-3 mr-1" />
                Match
            </Button>
        </div>
    );
}
