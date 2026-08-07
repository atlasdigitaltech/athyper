import { createSessionContextsGetHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createSessionContextsGetHandler(PLANE_KEY);
