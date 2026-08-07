import { createBackchannelLogoutPostHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createBackchannelLogoutPostHandler(PLANE_KEY);
