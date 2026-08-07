import { createCallbackGetHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createCallbackGetHandler(PLANE_KEY);
