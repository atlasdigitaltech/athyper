import { createTouchPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createTouchPostHandler(PLANE_KEY);
