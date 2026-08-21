export type FinanceCommandResult<Output extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> =
  | { readonly kind: "applied"; readonly commandId: string; readonly resourceId: string; readonly version: number; readonly output: Output }
  | { readonly kind: "replayed"; readonly commandId: string; readonly resourceId: string; readonly version: number; readonly output: Output }
  | { readonly kind: "idempotency_conflict"; readonly commandId: string; readonly existingCommandId: string }
  | { readonly kind: "version_conflict"; readonly commandId: string; readonly expectedVersion: number; readonly actualVersion: number };
