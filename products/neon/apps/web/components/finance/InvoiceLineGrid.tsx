"use client";

// components/finance/InvoiceLineGrid.tsx
//
// Editable grid for purchase invoice lines. MC-4 compliant:
// all monetary values are opaque strings, never parsed to float.

import { Badge, Button, Input } from "@neon/ui";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

// ── Domain type (mirrored from framework accounting domain) ──────────

interface PurchaseInvoiceLine {
    id: string;
    invoiceId: string;
    lineNumber: number;
    description: string;
    quantity: string;
    unitPrice: string;
    lineAmount: string;
    taxCode: string | null;
    taxAmount: string;
    glAccountId: string;
    costCenterId: string | null;
    profitCenterId: string | null;
    fundingProfileId: string | null;
    assetFlag: boolean;
    inventoryFlag: boolean;
    sourceDocLineId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ── Props ────────────────────────────────────────────────────────────

interface InvoiceLineGridProps {
    lines: PurchaseInvoiceLine[];
    mode: "view" | "edit";
    totalLineAmount: string;
    totalTaxAmount: string;
    currencyCode: string;
    onLineChange?: (lineIndex: number, field: string, value: string) => void;
    onAddLine?: () => void;
    onRemoveLine?: (lineIndex: number) => void;
}

// ── Component ────────────────────────────────────────────────────────

export function InvoiceLineGrid({
    lines,
    mode,
    totalLineAmount,
    totalTaxAmount,
    currencyCode,
    onLineChange,
    onAddLine,
    onRemoveLine,
}: InvoiceLineGridProps) {
    const isEdit = mode === "edit";
    const totalCols = isEdit ? 11 : 10;

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    {/* Header */}
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="w-12 px-3 py-2 text-right text-xs font-medium text-muted-foreground">#</th>
                            <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                            <th className="w-24 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                            <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Unit Price</th>
                            <th className="w-32 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Line Amount</th>
                            <th className="w-24 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tax Code</th>
                            <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tax Amount</th>
                            <th className="w-32 px-3 py-2 text-left text-xs font-medium text-muted-foreground">GL Account</th>
                            <th className="w-32 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Cost Centre</th>
                            <th className="w-20 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Flags</th>
                            {isEdit && <th className="w-10 px-3 py-2" />}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody>
                        {lines.length === 0 && (
                            <tr>
                                <td colSpan={totalCols} className="px-3 py-8 text-center text-muted-foreground">
                                    No invoice lines.
                                </td>
                            </tr>
                        )}
                        {lines.map((line, idx) => (
                            <tr
                                key={line.id}
                                className={cn(
                                    "border-b last:border-b-0",
                                    !isEdit && idx % 2 === 1 && "bg-muted/30",
                                )}
                            >
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{line.lineNumber}</td>

                                <td className="px-3 py-2">
                                    {isEdit ? (
                                        <Input value={line.description} onChange={(e) => onLineChange?.(idx, "description", e.target.value)} className="h-8 text-sm" />
                                    ) : (
                                        line.description || "\u2014"
                                    )}
                                </td>

                                <td className="px-3 py-2 text-right">
                                    {isEdit ? (
                                        <Input value={line.quantity} onChange={(e) => onLineChange?.(idx, "quantity", e.target.value)} className="h-8 text-sm text-right" />
                                    ) : (
                                        <span className="tabular-nums">{line.quantity}</span>
                                    )}
                                </td>

                                <td className="px-3 py-2 text-right">
                                    {isEdit ? (
                                        <Input value={line.unitPrice} onChange={(e) => onLineChange?.(idx, "unitPrice", e.target.value)} className="h-8 text-sm text-right" />
                                    ) : (
                                        <span className="tabular-nums">{line.unitPrice}</span>
                                    )}
                                </td>

                                {/* Line Amount — always read-only (server-computed) */}
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{line.lineAmount}</td>

                                <td className="px-3 py-2">
                                    {isEdit ? (
                                        <Input value={line.taxCode ?? ""} onChange={(e) => onLineChange?.(idx, "taxCode", e.target.value)} className="h-8 text-sm" />
                                    ) : (
                                        line.taxCode || "\u2014"
                                    )}
                                </td>

                                {/* Tax Amount — always read-only (server-computed) */}
                                <td className="px-3 py-2 text-right tabular-nums">{line.taxAmount}</td>

                                <td className="px-3 py-2">
                                    {isEdit ? (
                                        <Input value={line.glAccountId} onChange={(e) => onLineChange?.(idx, "glAccountId", e.target.value)} className="h-8 text-sm" />
                                    ) : (
                                        <span className="font-mono text-xs">{line.glAccountId}</span>
                                    )}
                                </td>

                                <td className="px-3 py-2">
                                    {isEdit ? (
                                        <Input value={line.costCenterId ?? ""} onChange={(e) => onLineChange?.(idx, "costCenterId", e.target.value)} className="h-8 text-sm" />
                                    ) : (
                                        line.costCenterId || "\u2014"
                                    )}
                                </td>

                                <td className="px-3 py-2">
                                    <div className="flex gap-1">
                                        {line.assetFlag && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Asset</Badge>}
                                        {line.inventoryFlag && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inv</Badge>}
                                    </div>
                                </td>

                                {isEdit && (
                                    <td className="px-2 py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => onRemoveLine?.(idx)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            aria-label={`Remove line ${line.lineNumber}`}
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>

                    {/* Footer totals */}
                    <tfoot>
                        <tr className="border-t bg-muted/50 font-medium">
                            <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Totals ({currencyCode})</td>
                            <td className="px-3 py-2 text-right tabular-nums">{totalLineAmount}</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-right tabular-nums">{totalTaxAmount}</td>
                            <td colSpan={isEdit ? 4 : 3} className="px-3 py-2" />
                        </tr>
                    </tfoot>
                </table>
            </div>

            {isEdit && (
                <Button type="button" variant="outline" size="sm" onClick={onAddLine}>
                    <Plus className="size-3.5 mr-1" />
                    Add Line
                </Button>
            )}
        </div>
    );
}
