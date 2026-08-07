/** Identity stamps written to PostgreSQL GUC variables for the duration of a transaction. */
export interface TransactionActor {
  tenantId: string;
  principalId: string;
}
