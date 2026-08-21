import { auth } from "@/lib/auth";
import { logoutCallbackNavigationResponse } from "@athyper/platform-iam-auth-bff";

export const GET = (request: Request) => logoutCallbackNavigationResponse(request, auth.logoutCallback, process.env.APP_ORIGIN);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
