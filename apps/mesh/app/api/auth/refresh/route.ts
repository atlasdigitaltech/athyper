import { createRefreshPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createRefreshPostHandler(PLANE_KEY);
