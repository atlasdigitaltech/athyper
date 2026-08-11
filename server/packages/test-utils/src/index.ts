export const testIds = Object.freeze({
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  entityId: "33333333-3333-4333-8333-333333333333",
  attachmentId: "44444444-4444-4444-8444-444444444444",
});

export interface TestRequestContext {
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly realmKey: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: number;
  readonly requestId: string;
  readonly profileHash: string;
  readonly permissions: Readonly<Record<string, unknown>>;
}

export function createVerifiedRequestContext(overrides: Partial<TestRequestContext> = {}): TestRequestContext {
  return {
    planeKey: "neon", realmKey: "neon", tenantId: testIds.tenantId, principalId: testIds.principalId,
    authEpoch: 1, requestId: "test-request-1", profileHash: "test-profile-1", permissions: {}, ...overrides,
  };
}

export function createJobExecutionContext(overrides: Partial<{ signal: AbortSignal; attempt: number; reportProgress: (value: unknown) => Promise<void> }> = {}) {
  return { signal: new AbortController().signal, attempt: 1, reportProgress: async (): Promise<void> => undefined, ...overrides };
}

export function createTransactionCoordinator<Transaction>(transaction: Transaction) {
  return { run: async <T>(_plane: string, _actor: unknown, work: (tx: Transaction) => Promise<T> | T): Promise<T> => work(transaction) };
}

export function createAuditRecorder() {
  const entries: unknown[] = [];
  return { entries, record: async (entry: unknown): Promise<void> => { entries.push(entry); } };
}

export function createOutboxWriter() {
  const entries: unknown[] = [];
  return { entries, append: async (entry: unknown): Promise<void> => { entries.push(entry); } };
}

export * from "./postgres-service-harness.js";
