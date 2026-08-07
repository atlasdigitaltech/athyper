import { createRefreshPostHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createRefreshPostHandler(PLANE_KEY);
