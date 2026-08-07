import { createMfaVerifyGetHandler, createMfaVerifyPostHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createMfaVerifyGetHandler(PLANE_KEY);
export const POST = createMfaVerifyPostHandler(PLANE_KEY);
