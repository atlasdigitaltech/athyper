"use client";

// components/finance/JournalLineGrid.tsx
//
// Debit/credit grid for journal entry lines with balance indicator.
// MC-4 compliant: all monetary values are opaque strings.

import { Badge, Button, Input } from "@neon/ui";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";

// ── Domain type (mirrored from posting-engine/domain/types.ts) ───────

interface JournalLine {
    id: string;
    journalEntryId: string;
    lineNumber: number;
    accountId: string;
    debitAmount: string;
    creditAmount: string;
    currencyCode: string;
    description: string | null;
    subledgerType: string | null;
    subledgerRefId: string | null;
    sourceDocLineId: string | null;
}

// ── Props ────────────────────────────────────────────────────────────

interface JournalLineGridProps {
    lines: JournalLine[];
    mode: "view" | "edit";
    totalDebits: string;
    totalCredits: string;
    balanceDifference: string;
    isBalanced: boolean;
    onLineChange?: (lineIndex: number, field: string, value: string) => void;
    onAddLine?: () => void;
    onRemoveLine?: (lineIndex: number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

const amountCellClass = "text-right font-mono tabular-nums";

function formatAmount(value: string): string {
    if (!value || value === "0") return "";
    return value;
}

// ── Component ────────────────────────────────────────────────────────

export function JournalLineGrid({
    lines,
    mode,
    totalDebits,
    totalCredits,
    balanceDifference,
    isBalanced,
    onLineChange,
    onAddLine,
    onRemoveLine,
}: JournalLineGridProps) {
    const isEdit = mode === "edit";

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    {/* Header */}
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                            <th className="px-3 py-2 text-left font-medium">Account</th>
                            <th className="px-3 py-2 text-left font-medium">Description</th>
                            <th className="w-36 px-3 py-2 text-right font-medium">Debit</th>
                            <th className="w-36 px-3 py-2 text-right font-medium">Credit</th>
                            <th className="px-3 py-2 text-left font-medium">Subledger</th>
                            {isEdit && <th className="w-12 px-3 py-2" />}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody>
                        {lines.map((line, idx) => (
                            <tr key={line.id} className="border-b last:border-b-0 hover:bg-muted/30">
                                <td className="px-3 py-2 text-muted-foreground">{line.lineNumber}</td>

                                <td className="px-3 py-2">
                                    {isEdit ? (
                                        <Input value={line.accountId} onChange={(e) => onLineChange?.(idx, "accountId", e.target.value)} className="h-8 text-sm" />
                                    ) : (
                                        line.accountId
                                    )}
                                </td>

                                <td className="px-3 py-2">
                                    {isEdit ? (
                                        <Input value={line.description ?? ""} onChange={(e) => onLineChange?.(idx, "description", e.target.value)} className="h-8 text-sm" />
                                    ) : (
                                        <span className="text-muted-foreground">{line.description ?? "\u2014"}</span>
                                    )}
                                </td>

                                <td className={cn("px-3 py-2", amountCellClass)}>
                                    {isEdit ? (
                                        <Input value={line.debitAmount} onChange={(e) => onLineChange?.(idx, "debitAmount", e.target.value)} className="h-8 text-sm text-right font-mono tabular-nums" />
                                    ) : (
                                        formatAmount(line.debitAmount)
                                    )}
                                </td>

                                <td className={cn("px-3 py-2", amountCellClass)}>
                                    {isEdit ? (
                                        <Input value={line.creditAmount} onChange={(e) => onLineChange?.(idx, "creditAmount", e.target.value)} className="h-8 text-sm text-right font-mono tabular-nums" />
                                    ) : (
                                        formatAmount(line.creditAmount)
                                    )}
                                </td>

                                <td className="px-3 py-2 text-muted-foreground text-xs">
                                    {line.subledgerType ? `${line.subledgerType}: ${line.subledgerRefId ?? ""}` : "\u2014"}
                                </td>

                                {isEdit && (
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => onRemoveLine?.(idx)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            aria-label={`Remove line ${line.lineNumber}`}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}

                        {lines.length === 0 && (
                            <tr>
                                <td colSpan={isEdit ? 7 : 6} className="px-3 py-6 text-center text-muted-foreground">
                                    No journal lines
                                </td>
                            </tr>
                        )}
                    </tbody>

                    {/* Footer totals */}
                    <tfoot>
                        <tr className="border-t bg-muted/30 font-medium">
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Totals</td>
                            <td className={cn("px-3 py-2", amountCellClass)}>{totalDebits}</td>
                            <td className={cn("px-3 py-2", amountCellClass)}>{totalCredits}</td>
                            <td className="px-3 py-2" />
                            {isEdit && <td className="px-3 py-2" />}
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Footer controls */}
            <div className="flex items-center justify-between">
                {/* Balance indicator */}
                {isBalanced ? (
                    <Badge variant="outline" className="border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                        <Check className="size-3 mr-1" />
                        Balanced
                    </Badge>
                ) : (
                    <Badge variant="outline" className="border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
                        <AlertCircle className="size-3 mr-1" />
                        Out of Balance: {balanceDifference}
                    </Badge>
                )}

                {isEdit && (
                    <Button variant="outline" size="sm" onClick={onAddLine}>
                        <Plus className="size-3.5 mr-1" />
                        Add Line
                    </Button>
                )}
            </div>
        </div>
    );
}
