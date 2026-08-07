import { createStepUpStartPostHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createStepUpStartPostHandler(PLANE_KEY);
