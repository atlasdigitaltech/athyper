import { auth } from "@/lib/auth";
import { callbackNavigationResponse } from "@athyper/platform-iam-auth-bff";

export const GET = (request: Request) => callbackNavigationResponse(request, auth.callback, process.env.APP_ORIGIN);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
