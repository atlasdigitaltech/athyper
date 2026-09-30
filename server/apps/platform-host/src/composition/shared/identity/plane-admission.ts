import type {
  Authenticator,
  AuthenticationResult,
} from "@athyper/server-contract-auth";
import type { PlaneKey } from "@athyper/server-foundation/context";

/** Database availability (including coordination access) never grants API admission. */
export function restrictAuthenticationToPlanes(
  authenticator: Authenticator,
  servedPlanes: readonly PlaneKey[],
): Authenticator {
  const admitted = new Set(servedPlanes);
  const denied = (): AuthenticationResult => ({
    ok: false,
    status: 403,
    code: "AUTH_ACCESS_DENIED",
    message: "The requested plane is not served by this process",
  });
  return {
    async authenticate(request) {
      if (!admitted.has(request.planeKey)) return denied();
      const result = await authenticator.authenticate(request);
      if (
        result.ok &&
        (result.context.planeKey !== request.planeKey ||
          !admitted.has(result.context.planeKey))
      )
        return denied();
      return result;
    },
  };
}
