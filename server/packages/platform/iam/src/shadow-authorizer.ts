import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Authorizer,
} from "@athyper/server-contract-auth";

/** Advisory observer only. It cannot replace the selected authorizer's result.
 * The observer must resolve/evaluate read-only and must never execute commands.
 */
export function createShadowAuthorizer(options: {
  readonly authority: Authorizer;
  readonly observe: (
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly unavailable: () => void;
  readonly timeoutMs?: number;
}): Authorizer {
  const timeoutMs = options.timeoutMs ?? 250;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2000)
    throw new TypeError("Invalid authorization shadow deadline");
  return {
    ...(options.authority.enforcedEntityProfile ? {enforcedEntityProfile: options.authority.enforcedEntityProfile.bind(options.authority)} : {}),
    async authorize(request) {
      const decision = await options.authority.authorize(request);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Isolate advisory code from the selected decision and verified request snapshot.
        const previewRequest = structuredClone(request),
          previewDecision = structuredClone(decision);
        await Promise.race([
          Promise.resolve().then(() =>
            options.observe(previewRequest, previewDecision, controller.signal),
          ),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error("SHADOW_TIMEOUT")),
              timeoutMs,
            );
          }),
        ]);
      } catch {
        try {
          options.unavailable();
        } catch {
          /* telemetry cannot change authority */
        }
      } finally {
        controller.abort();
        if (timer) clearTimeout(timer);
      }
      return decision;
    },
  };
}
