export const SESSION_PLANES = ["studio", "neon", "mesh"] as const;
export type SessionPlane = (typeof SESSION_PLANES)[number];

export interface IamSession {
  readonly id: string; readonly planeKey: SessionPlane; readonly realmKey: string;
  readonly tenantId: string; readonly principalId: string; readonly providerSubject: string;
  readonly requiredActions: readonly string[]; readonly createdAt: number;
  readonly lastSeenAt: number; readonly expiresAt: number; readonly authEpoch: number;
}
export interface ActionElevation {
  readonly id: string; readonly sessionId: string; readonly principalId: string;
  readonly tenantId: string; readonly action: string; readonly issuedAt: number; readonly expiresAt: number;
}
export function canUseSession(session: IamSession, now: number): boolean {
  return session.expiresAt > now && session.createdAt <= now && session.lastSeenAt <= now;
}
export function assertElevationBinding(elevation: ActionElevation, binding: {
  readonly sessionId: string; readonly principalId: string; readonly tenantId: string; readonly action: string; readonly now: number;
}): void {
  if (elevation.expiresAt <= binding.now || elevation.issuedAt > binding.now) throw new Error("MFA elevation is expired or not active");
  if (elevation.sessionId !== binding.sessionId || elevation.principalId !== binding.principalId || elevation.tenantId !== binding.tenantId || elevation.action !== binding.action) throw new Error("MFA elevation binding mismatch");
}
