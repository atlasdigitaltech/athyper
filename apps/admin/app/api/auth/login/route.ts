import { createLoginGetHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createLoginGetHandler(PLANE_KEY);
