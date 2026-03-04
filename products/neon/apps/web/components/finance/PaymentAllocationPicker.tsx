"use client";

// components/finance/PaymentAllocationPicker.tsx
//
// Two-section picker for gross settlement payment allocations.
// MC-4 compliant: all monetary values are opaque strings.

import { Badge, Button, Input, Separator } from "@neon/ui";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface AvailableInvoice {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    status: string;
}

interface AllocationRow {
    invoiceId: string;
    invoiceNumber: string;
    remainingAmount: string;
    allocatedAmount: string;
    discountAmount: string;
    withholdingAmount: string;
    netCashAmount: string;
}

interface PaymentAllocationPickerProps {
    availableInvoices: AvailableInvoice[];
    allocations: AllocationRow[];
    paymentTotal: string;
    totalAllocated: string;
    unallocatedAmount: string;
    isFullyAllocated: boolean;
    currencyCode: string;
    onAddInvoice?: (invoiceId: string) => void;
    onRemoveAllocation?: (invoiceId: string) => void;
    onAllocationChange?: (invoiceId: string, field: string, value: string) => void;
    readOnly?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "success" | "destructive" {
    switch (status) {
        case "POSTED": return "default";
        case "PARTIALLY_PAID": return "secondary";
        case "PAID": return "success";
        default: return "outline";
    }
}

// ── Component ────────────────────────────────────────────────────────

export function PaymentAllocationPicker({
    availableInvoices,
    allocations,
    paymentTotal,
    totalAllocated,
    unallocatedAmount,
    isFullyAllocated,
    currencyCode,
    onAddInvoice,
    onRemoveAllocation,
    onAllocationChange,
    readOnly,
}: PaymentAllocationPickerProps) {
    // Filter out invoices already allocated
    const allocatedInvoiceIds = new Set(allocations.map((a) => a.invoiceId));
    const unallocatedInvoices = availableInvoices.filter((inv) => !allocatedInvoiceIds.has(inv.id));

    return (
        <div className="space-y-6">
            {/* ── Available Invoices ── */}
            {!readOnly && unallocatedInvoices.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-medium">Available Invoices</h4>
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Invoice #</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Paid</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Remaining</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                                    <th className="w-16 px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {unallocatedInvoices.map((inv) => (
                                    <tr key={inv.id} className="border-b last:border-b-0 hover:bg-muted/30">
                                        <td className="px-3 py-2 font-medium">{inv.invoiceNumber}</td>
                                        <td className="px-3 py-2 text-muted-foreground">{inv.invoiceDate}</td>
                                        <td className={cn("px-3 py-2", amountCell)}>{inv.totalAmount}</td>
                                        <td className={cn("px-3 py-2", amountCell)}>{inv.paidAmount}</td>
                                        <td className={cn("px-3 py-2", amountCell, "font-medium")}>{inv.remainingAmount}</td>
                                        <td className="px-3 py-2">
                                            <Badge variant={statusBadgeVariant(inv.status)} className="text-[10px]">{inv.status}</Badge>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <Button variant="ghost" size="sm" onClick={() => onAddInvoice?.(inv.id)}>
                                                <Plus className="size-3.5 mr-1" />
                                                Add
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Allocations ── */}
            <div className="space-y-2">
                <h4 className="text-sm font-medium">Allocations</h4>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Invoice #</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Remaining</th>
                                <th className="w-32 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Allocated</th>
                                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Discount</th>
                                <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">WHT</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Net Cash</th>
                                {!readOnly && <th className="w-10 px-3 py-2" />}
                            </tr>
                        </thead>
                        <tbody>
                            {allocations.length === 0 && (
                                <tr>
                                    <td colSpan={readOnly ? 6 : 7} className="px-3 py-6 text-center text-muted-foreground">
                                        No allocations. Add invoices from the list above.
                                    </td>
                                </tr>
                            )}
                            {allocations.map((alloc) => (
                                <tr key={alloc.invoiceId} className="border-b last:border-b-0 hover:bg-muted/30">
                                    <td className="px-3 py-2 font-medium">{alloc.invoiceNumber}</td>
                                    <td className={cn("px-3 py-2", amountCell, "text-muted-foreground")}>{alloc.remainingAmount}</td>

                                    <td className={cn("px-3 py-2", amountCell)}>
                                        {readOnly ? (
                                            alloc.allocatedAmount
                                        ) : (
                                            <Input
                                                value={alloc.allocatedAmount}
                                                onChange={(e) => onAllocationChange?.(alloc.invoiceId, "allocatedAmount", e.target.value)}
                                                className="h-8 text-sm text-right font-mono tabular-nums"
                                            />
                                        )}
                                    </td>

                                    <td className={cn("px-3 py-2", amountCell)}>
                                        {readOnly ? (
                                            alloc.discountAmount
                                        ) : (
                                            <Input
                                                value={alloc.discountAmount}
                                                onChange={(e) => onAllocationChange?.(alloc.invoiceId, "discountAmount", e.target.value)}
                                                className="h-8 text-sm text-right font-mono tabular-nums"
                                            />
                                        )}
                                    </td>

                                    <td className={cn("px-3 py-2", amountCell)}>
                                        {readOnly ? (
                                            alloc.withholdingAmount
                                        ) : (
                                            <Input
                                                value={alloc.withholdingAmount}
                                                onChange={(e) => onAllocationChange?.(alloc.invoiceId, "withholdingAmount", e.target.value)}
                                                className="h-8 text-sm text-right font-mono tabular-nums"
                                            />
                                        )}
                                    </td>

                                    {/* Net Cash — always read-only (computed by parent) */}
                                    <td className={cn("px-3 py-2", amountCell, "font-medium")}>{alloc.netCashAmount}</td>

                                    {!readOnly && (
                                        <td className="px-2 py-2 text-center">
                                            <button
                                                type="button"
                                                onClick={() => onRemoveAllocation?.(alloc.invoiceId)}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                aria-label={`Remove allocation for ${alloc.invoiceNumber}`}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Summary Bar ── */}
            <Separator />
            <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                    <span className="text-muted-foreground">Payment Total:</span>{" "}
                    <span className="font-mono font-medium tabular-nums">{paymentTotal} {currencyCode}</span>
                </div>
                <div>
                    <span className="text-muted-foreground">Allocated:</span>{" "}
                    <span className="font-mono font-medium tabular-nums">{totalAllocated}</span>
                </div>
                <div>
                    <span className="text-muted-foreground">Unallocated:</span>{" "}
                    <span className="font-mono font-medium tabular-nums">{unallocatedAmount}</span>
                </div>

                {isFullyAllocated ? (
                    <Badge variant="outline" className="border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                        Fully allocated
                    </Badge>
                ) : (
                    <Badge variant="outline" className="border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                        Allocation mismatch
                    </Badge>
                )}
            </div>
        </div>
    );
}
