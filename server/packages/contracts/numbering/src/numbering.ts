import type { PlaneKey } from "@athyper/server-foundation/context";

export type NumberingScopeKind = "tenant" | "entity" | "legal_entity" | "company_code" | "site" | "operating_organization" | "resource_company" | "ledger" | "network_account";
export type NumberingResetKind = "never" | "calendar_year" | "calendar_month" | "calendar_day" | "fiscal_year";

export interface NumberingContext {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
}

export interface NumberingPolicy {
  readonly id: string;
  readonly policyCode: string;
  readonly policyRevision: number;
  readonly formatTemplate: string;
  readonly sequenceWidth: number;
  readonly padCharacter: string;
  readonly startValue: number;
  readonly incrementBy: number;
  readonly maximumValue?: number;
  readonly scopeKind: NumberingScopeKind;
  readonly resetKind: NumberingResetKind;
  readonly timezoneCode?: string;
  readonly source: "tenant" | "global";
}

export interface NumberingPreviewInput {
  readonly context: NumberingContext;
  readonly policyCode: string;
  readonly policyRevision: number;
  readonly nextValue: number;
  readonly occurredAt: string;
  readonly scopeKey?: string;
  readonly fiscalYear?: string;
  readonly contextFields?: Readonly<Record<string, string>>;
}

export interface NumberingAllocationInput extends Omit<NumberingPreviewInput, "nextValue"> {
  readonly allocationId: string;
  readonly correlationId?: string;
}

export interface NumberingResult {
  readonly allocationId?: string;
  readonly policyId: string;
  readonly policyCode: string;
  readonly policyRevision: number;
  readonly formattedNumber: string;
  readonly allocatedValue: number;
  readonly followingValue: number;
  readonly scopeKey: string;
  readonly resetBucket: string;
  readonly policySource: "tenant" | "global";
  readonly idempotencySource?: "fresh" | "replayed";
  readonly allocatedAt?: string;
}

export interface NumberingService {
  preview(input: NumberingPreviewInput): Promise<NumberingResult>;
  allocate(input: NumberingAllocationInput): Promise<NumberingResult>;
}

export class NumberingError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 422) {
    super(message);
    this.name = "NumberingError";
  }
}
