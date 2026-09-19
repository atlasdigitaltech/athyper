export type SelfRegistrationPolicyOutcome =
  | "accepted"
  | "internal_sponsor_required"
  | "rejected";

export interface SelfRegistrationPolicyEvaluation {
  readonly outcome: SelfRegistrationPolicyOutcome;
  readonly evaluationId: string;
  readonly policyVersion: string;
  readonly evidenceHash: string;
  readonly evaluatedAt: string;
  readonly reasonCodes: readonly string[];
}

export interface SelfRegistrationPolicyAdapter {
  evaluate(input: Readonly<{
    tenantId: string;
    principalId: string;
    networkAccountId: string;
    counterpartyTenantId: string;
    counterpartyAccountId: string;
    relationshipKind: string;
    contractName: string;
    contractVersion: number;
    contractHash: string;
    intentSnapshot: Readonly<Record<string, unknown>>;
    requestId: string;
  }>): Promise<SelfRegistrationPolicyEvaluation>;
}

export function createHttpSelfRegistrationPolicyAdapter(options: Readonly<{
  endpoint: string;
  bearerToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}>): SelfRegistrationPolicyAdapter {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1")
    throw new Error("MESH self-registration policy endpoint must use HTTPS");
  const request = options.fetch ?? fetch;
  return {
    async evaluate(input) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
      try {
        const response = await request(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}),
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`policy service returned HTTP ${response.status}`);
        return parseEvaluation(await response.json());
      } catch (cause) {
        throw new SelfRegistrationPolicyUnavailableError(cause);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export class SelfRegistrationPolicyUnavailableError extends Error {
  constructor(readonly policyCause: unknown) {
    super("External self-registration policy evaluation is unavailable");
  }
}

function parseEvaluation(value: unknown): SelfRegistrationPolicyEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid policy response");
  const row = value as Record<string, unknown>;
  const outcome = String(row["outcome"] ?? "");
  const evaluationId = String(row["evaluationId"] ?? "");
  const policyVersion = String(row["policyVersion"] ?? "");
  const evidenceHash = String(row["evidenceHash"] ?? "");
  const evaluatedAt = String(row["evaluatedAt"] ?? "");
  const reasonCodes = row["reasonCodes"];
  if (!(["accepted", "internal_sponsor_required", "rejected"] as const).includes(outcome as SelfRegistrationPolicyOutcome)
    || !evaluationId || !policyVersion || !/^[a-f0-9]{64}$/.test(evidenceHash)
    || !Number.isFinite(Date.parse(evaluatedAt)) || !Array.isArray(reasonCodes)
    || reasonCodes.some((item) => typeof item !== "string" || !item))
    throw new Error("invalid policy response");
  return { outcome: outcome as SelfRegistrationPolicyOutcome, evaluationId, policyVersion, evidenceHash, evaluatedAt, reasonCodes: reasonCodes as string[] };
}
