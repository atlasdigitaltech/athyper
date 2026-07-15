"use client";

import { useMemo } from "react";
import { Package, Truck } from "lucide-react";
import { MetaFieldPanel } from "../meta-field-panel";
import type { LineItemPanelProps } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// DeliveryPanel
//
// Sales fulfillment / delivery panel. Renders:
//  1. Delivery/shipping/fulfillment group fields via MetaFieldPanel
//  2. Fulfillment status badge when editing an existing line
// ─────────────────────────────────────────────────────────────────────────────

function FulfillmentStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;

  const variants: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    pending:    { icon: <Package className="size-3" aria-hidden />, label: "Pending",    cls: "border-muted/50 bg-muted text-muted-foreground" },
    shipped:    { icon: <Truck className="size-3" aria-hidden />,   label: "Shipped",    cls: "border-primary/30 bg-primary/10 text-primary" },
    delivered:  { icon: <Truck className="size-3" aria-hidden />,   label: "Delivered",  cls: "border-success/30 bg-success/10 text-success" },
    partial:    { icon: <Package className="size-3" aria-hidden />, label: "Partial",    cls: "border-warning/30 bg-warning/10 text-warning" },
  };

  const v = variants[String(status).toLowerCase()] ?? variants["pending"];

  return (
    <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5">
      <span className="text-sm font-medium text-foreground">Fulfillment Status</span>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${v?.cls ?? ""}`}>
        {v?.icon}
        {v?.label ?? String(status)}
      </span>
    </div>
  );
}

export function DeliveryPanel(props: LineItemPanelProps) {
  const { line } = props;
  const lineRecord = (line ?? {}) as Record<string, unknown>;
  const rawFulfillmentStatus = lineRecord["fulfillment_status"] ?? lineRecord["delivery_status"];
  const fulfillmentStatus = rawFulfillmentStatus != null ? String(rawFulfillmentStatus) : null;

  const hasDeliveryFields = useMemo(
    () => props.entity?.fields.some((f) => ["fulfillment", "delivery", "shipping"].includes(f.group_key ?? "")) ?? false,
    [props.entity],
  );

  if (!hasDeliveryFields) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No delivery fields configured for this entity.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <FulfillmentStatusBadge status={fulfillmentStatus as string | null | undefined} />
      <MetaFieldPanel {...props} groupKeys={["fulfillment", "delivery", "shipping"]} />
    </div>
  );
}
