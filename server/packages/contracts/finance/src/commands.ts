export interface FinanceActor {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: "neon";
  readonly correlationId: string;
  /** Authorization snapshot supplied by a trusted HTTP/job adapter. */
  readonly permissionCodes?: readonly string[];
}

export interface FinanceCommand<Payload extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  readonly commandId: string;
  readonly commandCode: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly expectedVersion?: number;
  readonly actor: FinanceActor;
  readonly payload: Payload;
}

export interface FinancePageRequest { readonly limit?: number; readonly cursor?: string; }
export interface FinancePage<T> { readonly items: readonly T[]; readonly nextCursor?: string; readonly hasMore: boolean; }
