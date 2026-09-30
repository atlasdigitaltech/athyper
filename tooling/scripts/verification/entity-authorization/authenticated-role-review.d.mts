interface ReviewSession {tenantId?: string; principalId: string; plane: string; realmKey: string; authEpoch: number; assurance: string; acceptedCsrfTokens: readonly string[];}
export function createAuthenticatedRoleReview(options: {
 enabled: boolean; origin: string; inventoryPath: string; packetPath: string; packetSha256: string; outputDirectory: string;
 resolveSession(request: Request): Promise<ReviewSession | undefined>;
 currentIdentity(request: Request): Promise<{tenantId: string; principalId: string; authEpoch: number; profileHash?: string}>;
}): (request: Request) => Promise<Response>;
