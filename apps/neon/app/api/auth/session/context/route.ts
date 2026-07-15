import { createSessionPatchHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const PATCH = createSessionPatchHandler(PLANE_KEY);
