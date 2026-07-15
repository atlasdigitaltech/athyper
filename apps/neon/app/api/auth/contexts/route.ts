import { createSessionContextsGetHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createSessionContextsGetHandler(PLANE_KEY);
