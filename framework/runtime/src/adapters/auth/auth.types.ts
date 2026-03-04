export interface AuthVerifier {
    verifyJwt(token: string): Promise<{ claims: Record<string, unknown> }>;
}

export interface AuthAdapter {
    getVerifier(realmKey: string): Promise<AuthVerifier>;
}