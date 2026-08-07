import { createTouchPostHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createTouchPostHandler(PLANE_KEY);
