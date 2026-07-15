// GET|POST /api/auth/mfa/verify — read MFA challenge state and submit TOTP/WebAuthn proof to elevate the session.
import { createMfaVerifyGetHandler, createMfaVerifyPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createMfaVerifyGetHandler(PLANE_KEY);
export const POST = createMfaVerifyPostHandler(PLANE_KEY);
