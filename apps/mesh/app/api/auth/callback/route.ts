import { createCallbackGetHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createCallbackGetHandler(PLANE_KEY);
