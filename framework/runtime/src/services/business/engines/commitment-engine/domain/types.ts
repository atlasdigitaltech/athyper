// framework/runtime/src/services/business/engines/commitment-engine/domain/types.ts

// --- Commitment ---

export type CommitmentDocType = "PR" | "PO" | "CONTRACT" | "SUBSCRIPTION" | "LEASE";
export type CommitmentType = "ONE_TIME" | "FIXED_RECURRING" | "MILESTONE" | "USAGE_BASED" | "ESCALATING" | "RETENTION_RELEASE";
export type CommitmentStatus = "DRAFT" | "PENDING" | "ACTIVE" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED" | "EXPIRED";
export type FulfillmentType = "GRN" | "SERVICE_RECEIPT" | "PAYMENT" | "MILESTONE_COMPLETE";
export type ScheduleStatus = "PENDING" | "TRIGGERED" | "FULFILLED" | "SKIPPED" | "CANCELLED";

export interface Commitment {
    id: string;
    tenantId: string;
    entityCode: string;
    txnId: string;
    docNumber: string;
    docType: CommitmentDocType;
    commitmentType: CommitmentType;
    status: CommitmentStatus;
    ouId: string;
    intentId: string | null;
    fpId: string | null;
    vendorId: string | null;
    customerId: string | null;
    totalAmount: string;
    currencyCode: string;
    fulfilledAmount: string;
    remainingAmount: string;
    effectiveDate: Date;
    expiryDate: Date | null;
    deliveryDate: Date | null;
    autoRenew: boolean;
    renewalTerms: RenewalTerms | null;
    notifyBeforeExpiryDays: number | null;
    description: string | null;
    lineItems: CommitmentLineItem[];
    terms: Record<string, unknown>;
    submittedBy: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CommitmentLineItem {
    itemCode: string;
    description: string;
    quantity: string;
    unitPrice: string;
    uomCode: string;
    glAccount: string | null;
    taxCode: string | null;
    totalAmount: string;
}

export interface RenewalTerms {
    intervalMonths: number;
    escalationFormula: string | null;
    cpiLinked: boolean;
    maxRenewals: number | null;
    renewalCount: number;
}

export interface CreateCommitmentInput {
    tenantId: string;
    entityCode: string;
    txnId: string;
    docType: CommitmentDocType;
    commitmentType: CommitmentType;
    ouId: string;
    intentId?: string;
    fpId?: string;
    vendorId?: string;
    customerId?: string;
    totalAmount: string;
    currencyCode: string;
    effectiveDate: Date;
    expiryDate?: Date;
    deliveryDate?: Date;
    autoRenew?: boolean;
    renewalTerms?: RenewalTerms;
    notifyBeforeExpiryDays?: number;
    description?: string;
    lineItems: CommitmentLineItem[];
    terms?: Record<string, unknown>;
    submittedBy: string;
}

// --- Schedule ---

export interface CommitmentSchedule {
    id: string;
    tenantId: string;
    commitmentId: string;
    scheduleSeq: number;
    dueDate: Date;
    amount: string;
    currencyCode: string;
    status: ScheduleStatus;
    milestoneName: string | null;
    triggeredAt: Date | null;
    fulfilledAt: Date | null;
}

export interface CreateScheduleInput {
    tenantId: string;
    commitmentId: string;
    scheduleSeq: number;
    dueDate: Date;
    amount: string;
    currencyCode: string;
    milestoneName?: string;
}

// --- Fulfillment ---

export interface CommitmentFulfillment {
    id: string;
    tenantId: string;
    commitmentId: string;
    scheduleId: string | null;
    fulfillmentType: FulfillmentType;
    referenceDocId: string | null;
    amount: string;
    currencyCode: string;
    fulfilledBy: string;
    fulfilledAt: Date;
    notes: string | null;
}

export interface CreateFulfillmentInput {
    tenantId: string;
    commitmentId: string;
    scheduleId?: string;
    fulfillmentType: FulfillmentType;
    referenceDocId?: string;
    amount: string;
    currencyCode: string;
    fulfilledBy: string;
    notes?: string;
}

// --- Lifecycle Transitions ---

export const COMMITMENT_TRANSITIONS: Record<CommitmentStatus, CommitmentStatus[]> = {
    DRAFT: ["PENDING", "CANCELLED"],
    PENDING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "EXPIRED"],
    PARTIALLY_FULFILLED: ["FULFILLED", "CANCELLED"],
    FULFILLED: [],
    CANCELLED: [],
    EXPIRED: [],
};

// --- Schedule Generation Patterns ---

export interface SchedulePattern {
    type: "FIXED_RECURRING" | "MILESTONE" | "ESCALATING";
    intervalMonths?: number;
    installmentAmount?: string;
    milestones?: Array<{ name: string; amount: string; dueDate: Date }>;
    escalationPct?: string;
}
