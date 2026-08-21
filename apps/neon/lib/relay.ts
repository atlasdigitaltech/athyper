import { createRelayHandler, EXPERIENCE_BOOTSTRAP_OPERATION, IAM_ME_OPERATION, NEON_OPERATING_ORGANIZATIONS_OPERATION, NEON_WORK_CONTEXTS_OPERATION, type RelayHandler } from "@athyper/platform-gateway-bff-relay";
import { authRuntime } from "@/lib/auth";

let relay: RelayHandler | undefined;
export const platformRelay: RelayHandler = (request, context) => {
  relay ??= createRelayHandler({
    plane: "neon",
    runtimeApiUrl: requiredEnvironment("RUNTIME_API_URL"),
    appOrigin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
    operations: [IAM_ME_OPERATION, EXPERIENCE_BOOTSTRAP_OPERATION, NEON_WORK_CONTEXTS_OPERATION, NEON_OPERATING_ORGANIZATIONS_OPERATION],
    session: {
      resolve: (input) => authRuntime.resolveRelaySession(input),
      refresh: (input) => authRuntime.refreshRelaySession(input),
      invalidate: (input) => authRuntime.invalidateRelaySession(input),
    },
  });
  return relay(request, context);
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; the browser relay fails closed without a server runtime URL`);
  return value;
}
