import type { EnvironmentRelaySession } from "@athyper/platform-iam-auth-bff/environment";
export interface ReviewOptions {
  enabled: boolean;
  origin: string;
  inventoryPath: string;
  packetPath: string;
  packetSha256: string;
  outputDirectory: string;
  resolveSession(
    request: Request,
  ): Promise<EnvironmentRelaySession | undefined>;
  currentIdentity(request: Request): Promise<unknown>;
}
export function createAuthenticatedRoleReview(
  options: ReviewOptions,
): (request: Request) => Promise<Response>;
