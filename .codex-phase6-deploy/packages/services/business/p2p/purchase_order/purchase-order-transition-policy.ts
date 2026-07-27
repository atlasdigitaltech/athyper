export interface PurchaseOrderTransitionDecision {
  allowed: boolean;
  targetStatus?: string;
  code?: string;
  message?: string;
}

const EXECUTABLE_STATES = new Set(["approved", "active", "partially_fulfilled"]);

/** Pure command policy; persistence and configured lifecycle edges remain authoritative. */
export function evaluatePurchaseOrderTransition(
  record: Record<string, unknown>,
  command: string,
  now = new Date(),
): PurchaseOrderTransitionDecision {
  const status = String(record["status"] ?? "");
  const fulfilled = Number(record["fulfilled_amount"] ?? 0);
  const invoiced = Number(record["invoiced_amount"] ?? 0);
  const paid = Number(record["paid_amount"] ?? 0);
  const total = Number(record["total_amount"] ?? 0);

  if (command === "place_order") {
    if (status !== "approved") return denied("PO_NOT_APPROVED", "Only an approved purchase order can be placed.");
    const expiry = dateOnly(record["expiry_date"]);
    if (expiry && expiry < dateOnly(now)!) return denied("PO_ALREADY_EXPIRED", "An expired purchase order cannot be placed.");
    return { allowed: true, targetStatus: "active" };
  }

  if (command === "hold") {
    return EXECUTABLE_STATES.has(status)
      ? { allowed: true, targetStatus: "suspended" }
      : denied("PO_HOLD_NOT_ALLOWED", `Purchase order cannot be held from '${status}'.`);
  }

  if (command === "release_hold") {
    if (status !== "suspended") return denied("PO_NOT_SUSPENDED", "Only a suspended purchase order can be released.");
    const metadata = asRecord(record["metadata"]);
    const hold = asRecord(metadata["lifecycle_hold"]);
    const previous = String(hold["previous_status"] ?? "");
    return EXECUTABLE_STATES.has(previous)
      ? { allowed: true, targetStatus: previous }
      : denied("PO_HOLD_STATE_MISSING", "The prior executable state is missing; release cannot safely guess a status.");
  }

  if (command === "expire") {
    if (status !== "approved" && status !== "active") return denied("PO_EXPIRY_NOT_ALLOWED", `Purchase order cannot expire from '${status}'.`);
    const expiry = dateOnly(record["expiry_date"]);
    if (!expiry || expiry > dateOnly(now)!) return denied("PO_EXPIRY_DATE_NOT_REACHED", "Purchase order expiry date has not been reached.");
    if (fulfilled > 0 || invoiced > 0 || paid > 0) return denied("PO_EXPIRY_HAS_ACTIVITY", "A purchase order with fulfillment or financial activity must be short-closed, not expired.");
    return { allowed: true, targetStatus: "expired" };
  }

  if (command === "cancel") {
    if (!["draft", "pending_approval", ...EXECUTABLE_STATES].includes(status)) return denied("PO_CANCEL_NOT_ALLOWED", `Purchase order cannot be cancelled from '${status}'.`);
    if (EXECUTABLE_STATES.has(status) && (fulfilled > 0 || invoiced > 0 || paid > 0)) {
      return denied("PO_CANCEL_HAS_ACTIVITY", "A placed purchase order with fulfillment or financial activity must be short-closed.");
    }
    return { allowed: true, targetStatus: "cancelled" };
  }

  if (command === "short_close") {
    if (!EXECUTABLE_STATES.has(status)) return denied("PO_SHORT_CLOSE_NOT_ALLOWED", `Purchase order cannot be short-closed from '${status}'.`);
    return { allowed: true, targetStatus: "closed" };
  }

  if (command === "close") {
    if (status !== "fully_fulfilled") return denied("PO_CLOSE_NOT_FULFILLED", "Only a fully fulfilled purchase order can be closed.");
    if (total > 0 && fulfilled + 0.0001 < total) return denied("PO_CLOSE_AMOUNT_INCOMPLETE", "Fulfilled amount is below the purchase-order total.");
    return { allowed: true, targetStatus: "closed" };
  }

  return { allowed: true };
}

function denied(code: string, message: string): PurchaseOrderTransitionDecision {
  return { allowed: false, code, message };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
