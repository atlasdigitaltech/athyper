import { createLogoutGetHandler, createLogoutPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createLogoutGetHandler(PLANE_KEY);
export const POST = createLogoutPostHandler(PLANE_KEY);
